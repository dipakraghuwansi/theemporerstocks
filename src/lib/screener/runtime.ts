import fs from 'fs';
import path from 'path';
import { HistoricalCandle } from '@/lib/historical/types';
import { getKiteInstance } from '@/lib/kiteHelper';
import { readDataset } from '@/lib/historical/cache';
import { buildOptionStructureBatch } from '@/lib/optionsStructure/core';
import { readResearchManifest } from '@/lib/research/cache';
import { getProbabilityEstimate } from '@/lib/research/stats';
import {
  applySectorSnapshot,
  buildCalibrationContext,
  buildRegime,
  buildSectorContext,
  createScreenerScorePayload,
  scoreScreenerResult,
  screenMatches,
  ScreenerBaseMetrics,
  ScreenerScoredResult,
  ScreenerScorePayload,
} from '@/lib/screenerScoring';
import {
  average,
  calculateAnchoredVwap,
  calculateAtr,
  calculatePercentChange,
  calculateRsi,
  calculateSma,
  highest,
  lowest,
} from '@/lib/stockIndicators';
import { SCREEN_LABELS, StockScreenType } from '@/lib/stockUniverse';
import { getStockUniverse } from '@/lib/stockUniverseStore';
import { hydrateSectorBreadthSnapshotFromMongoIfNeeded } from '@/lib/mongoBackedCache';

const INSTRUMENTS_URL = 'https://api.kite.trade/instruments';
const SECTOR_SNAPSHOT_PATH = path.join(process.cwd(), 'sector_breadth_snapshot.json');
const BASE_METRICS_CACHE_MS = 5 * 60 * 1000;

export type InstrumentMeta = {
  instrumentToken: number;
  tradingsymbol: string;
  exchange: string;
  segment: string;
};

type InternalBaseUniverseMetrics = ScreenerBaseMetrics & {
  __rawStockReturn20d: number | null;
  __rawResidualAlpha20d: number | null;
  __rawVolatilityAdjustedReturn20d: number | null;
};

export type SectorSnapshotRow = {
  sector: string;
  breadthPct: number;
  aboveSma20Pct: number;
  avgDayChangePct: number;
  generatedAt: string;
};

export type SectorBreadthRow = {
  sector: string;
  breadthPct: number;
  aboveSma20Pct: number;
  members: number;
};

export type ScreenerRuntime = {
  kite: KiteLike;
  universe: ReturnType<typeof getStockUniverse>;
  baseMetrics: ScreenerBaseMetrics[];
  sectorContext: ScreenerScorePayload['sectorContext'];
  benchmarkCloses: number[];
  benchmarkLastPrice: number;
  regime: ScreenerScorePayload['regime'];
  researchManifest: ReturnType<typeof readResearchManifest>;
  calibrationContext: ScreenerScorePayload['calibrationContext'];
};

type KiteQuote = {
  last_price: number;
  volume?: number;
  ohlc?: {
    close?: number;
    open?: number;
  };
};

type KiteLike = {
  getQuote: (instruments: string[]) => Promise<Record<string, KiteQuote>>;
};

export type ScoredScreenSnapshot = {
  screen: StockScreenType;
  screenLabel: string;
  scorePayload: ScreenerScorePayload;
  results: ScreenerScoredResult[];
};

let instrumentCache: Map<string, InstrumentMeta> | null = null;
let lastInstrumentFetch = 0;
let baseMetricsCache: ScreenerBaseMetrics[] | null = null;
let baseMetricsCachedAt = 0;

hydrateSectorBreadthSnapshotFromMongoIfNeeded().catch((error) => {
  console.error('Failed to hydrate sector breadth snapshot from Mongo for screener runtime', error);
});

export function computeSectorBreadth(results: Array<ScreenerBaseMetrics | ScreenerScoredResult>): SectorBreadthRow[] {
  const sectorMap = new Map<string, { total: number; advancing: number; aboveSma20: number }>();

  for (const result of results) {
    const existing = sectorMap.get(result.sector) || { total: 0, advancing: 0, aboveSma20: 0 };
    existing.total += 1;
    if (result.dayChangePct > 0) existing.advancing += 1;
    if (result.sma20 !== null && result.lastPrice > result.sma20) existing.aboveSma20 += 1;
    sectorMap.set(result.sector, existing);
  }

  return Array.from(sectorMap.entries()).map(([sector, stats]) => ({
    sector,
    breadthPct: Number(((stats.advancing / stats.total) * 100).toFixed(1)),
    aboveSma20Pct: Number(((stats.aboveSma20 / stats.total) * 100).toFixed(1)),
    members: stats.total,
  }));
}

export function readSectorSnapshot(): SectorSnapshotRow[] {
  if (!fs.existsSync(SECTOR_SNAPSHOT_PATH)) {
    return [];
  }

  try {
    return JSON.parse(fs.readFileSync(SECTOR_SNAPSHOT_PATH, 'utf8')) as SectorSnapshotRow[];
  } catch {
    return [];
  }
}

export async function getInstrumentMap() {
  const now = Date.now();
  if (instrumentCache && now - lastInstrumentFetch < 12 * 60 * 60 * 1000) {
    return instrumentCache;
  }

  const response = await fetch(INSTRUMENTS_URL, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('Failed to fetch Kite instruments CSV');
  }

  const csvText = await response.text();
  const lines = csvText.split('\n');
  const nextMap = new Map<string, InstrumentMeta>();

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (cols.length < 12) continue;

    const instrumentToken = parseInt(cols[0]?.replace(/"/g, '') || '0', 10);
    const tradingsymbol = cols[2]?.replace(/"/g, '').trim();
    const segment = cols[10]?.replace(/"/g, '').trim();
    const exchange = cols[11]?.replace(/"/g, '').trim();

    if (!instrumentToken || !tradingsymbol || !exchange) continue;
    if (exchange !== 'NSE') continue;
    if (segment !== 'NSE') continue;

    nextMap.set(`NSE:${tradingsymbol}`, {
      instrumentToken,
      tradingsymbol,
      exchange,
      segment,
    });
  }

  instrumentCache = nextMap;
  lastInstrumentFetch = now;
  return nextMap;
}

function calculateBeta(stockCloses: number[], benchmarkCloses: number[]) {
  const sample = Math.min(stockCloses.length, benchmarkCloses.length);
  if (sample < 21) return null;

  const stockWindow = stockCloses.slice(-21);
  const benchmarkWindow = benchmarkCloses.slice(-21);
  const stockReturns = stockWindow.slice(1).map((price, index) => ((price - stockWindow[index]) / stockWindow[index]) * 100);
  const benchmarkReturns = benchmarkWindow
    .slice(1)
    .map((price, index) => ((price - benchmarkWindow[index]) / benchmarkWindow[index]) * 100);

  const meanStock = stockReturns.reduce((sum, value) => sum + value, 0) / stockReturns.length;
  const meanBenchmark = benchmarkReturns.reduce((sum, value) => sum + value, 0) / benchmarkReturns.length;
  const covariance = stockReturns.reduce(
    (sum, value, index) => sum + (value - meanStock) * (benchmarkReturns[index] - meanBenchmark),
    0
  ) / stockReturns.length;
  const variance = benchmarkReturns.reduce((sum, value) => sum + (value - meanBenchmark) ** 2, 0) / benchmarkReturns.length;

  return variance > 0 ? covariance / variance : null;
}

function calculateVolatilityAdjustedReturn(closes: number[], atr: number | null) {
  if (closes.length < 21) return null;
  const rawReturn = calculatePercentChange(closes[closes.length - 1], closes[closes.length - 21]);
  if (!atr || atr <= 0) return rawReturn;
  const atrPct = (atr / closes[closes.length - 1]) * 100;
  return atrPct > 0 ? rawReturn / atrPct : rawReturn;
}

export async function getBaseUniverseMetrics(kite: KiteLike, instrumentMap: Map<string, InstrumentMeta>) {
  const now = Date.now();
  if (baseMetricsCache && now - baseMetricsCachedAt < BASE_METRICS_CACHE_MS) {
    return baseMetricsCache;
  }

  const universe = getStockUniverse();
  const universeWithTokens = universe
    .map((item) => {
      const meta = instrumentMap.get(item.instrument);
      return meta ? { ...item, instrumentToken: meta.instrumentToken } : null;
    })
    .filter(Boolean) as Array<(typeof universe)[number] & { instrumentToken: number }>;

  const quotes = await kite.getQuote(universeWithTokens.map((item) => item.instrument));

  const stockResults = await Promise.all(
    universeWithTokens.map(async (item) => {
      const dailyDataset = readDataset('day', item.symbol);
      const minuteDataset = readDataset('minute', item.symbol);
      const dailyCandles = dailyDataset?.candles || [];
      const minuteCandles = minuteDataset?.candles || [];

      const quote = quotes[item.instrument];
      if (!quote || dailyCandles.length < 25) return null;

      const closes = dailyCandles.map((candle: HistoricalCandle) => candle.close);
      const highs = dailyCandles.map((candle: HistoricalCandle) => candle.high);
      const lows = dailyCandles.map((candle: HistoricalCandle) => candle.low);
      const volumes = dailyCandles.map((candle: HistoricalCandle) => candle.volume || 0);

      const previousClose = quote.ohlc?.close || closes[closes.length - 2];
      const open = quote.ohlc?.open || dailyCandles[dailyCandles.length - 1]?.open || previousClose;
      const lastPrice = quote.last_price;
      const volume = quote.volume || 0;

      const previous20Volumes = volumes.slice(-21, -1).filter((value: number) => value > 0);
      const previous7Volumes = volumes.slice(-8, -1).filter((value: number) => value > 0);
      const prior7Volumes = volumes.slice(-15, -8).filter((value: number) => value > 0);
      const previous20Highs = highs.slice(-21, -1);
      const previous20Lows = lows.slice(-21, -1);
      const benchmarkDataset = readDataset('day', 'NIFTY50_BENCHMARK');
      const benchmarkCloses = benchmarkDataset?.candles?.map((candle: HistoricalCandle) => candle.close) || [];
      const benchmark20 = benchmarkCloses.slice(-21);
      const stock20 = closes.slice(-21);

      const avgVolume7 = average(previous7Volumes);
      const priorAvgVolume7 = average(prior7Volumes);
      const avgVolume7Compare =
        avgVolume7 && priorAvgVolume7 && priorAvgVolume7 > 0 ? avgVolume7 / priorAvgVolume7 : null;
      const avgVolume20 = average(previous20Volumes);
      const volumeExpansion = avgVolume20 && avgVolume20 > 0 ? volume / avgVolume20 : null;
      const sma20 = calculateSma(closes, 20);
      const sma50 = calculateSma(closes, 50);
      const rsi14 = calculateRsi(closes, 14);
      const atr14 = calculateAtr(dailyCandles, 14);
      const vwap = calculateAnchoredVwap(minuteCandles);
      const breakoutLevel = highest(previous20Highs);
      const breakdownLevel = lowest(previous20Lows);

      const benchmarkReturn20 =
        benchmark20.length >= 2 ? calculatePercentChange(benchmark20[benchmark20.length - 1], benchmark20[0]) : null;
      const stockReturn20 = stock20.length >= 2 ? calculatePercentChange(stock20[stock20.length - 1], stock20[0]) : null;
      const beta20 = benchmarkCloses.length >= 21 ? calculateBeta(closes, benchmarkCloses) : null;
      const volatilityAdjustedReturn = calculateVolatilityAdjustedReturn(closes, atr14);
      const relativeStrength20d =
        benchmarkReturn20 !== null && stockReturn20 !== null ? stockReturn20 - benchmarkReturn20 : null;
      const rawResidualAlpha =
        stockReturn20 !== null && benchmarkReturn20 !== null && beta20 !== null
          ? stockReturn20 - beta20 * benchmarkReturn20
          : null;

      const baseResult: InternalBaseUniverseMetrics = {
        symbol: item.symbol,
        instrument: item.instrument,
        sector: item.sector,
        category: item.category,
        lastPrice,
        previousClose,
        openPrice: open,
        dayChangePct: Number(calculatePercentChange(lastPrice, previousClose).toFixed(2)),
        gapPct: Number(calculatePercentChange(open, previousClose).toFixed(2)),
        volume,
        avgVolume7: avgVolume7 ? Number(avgVolume7.toFixed(0)) : null,
        avgVolume7Compare: avgVolume7Compare ? Number(avgVolume7Compare.toFixed(2)) : null,
        avgVolume20: avgVolume20 ? Number(avgVolume20.toFixed(0)) : null,
        volumeExpansion: volumeExpansion ? Number(volumeExpansion.toFixed(2)) : null,
        sma20: sma20 ? Number(sma20.toFixed(2)) : null,
        sma50: sma50 ? Number(sma50.toFixed(2)) : null,
        rsi14: rsi14 ? Number(rsi14.toFixed(2)) : null,
        atr14: atr14 ? Number(atr14.toFixed(2)) : null,
        vwap: vwap ? Number(vwap.toFixed(2)) : null,
        microprice: null,
        micropriceEdgePct: null,
        orderFlowImbalance: null,
        rollingOfi: null,
        vpin: null,
        beta20: beta20 !== null ? Number(beta20.toFixed(3)) : null,
        relativeStrength20d: relativeStrength20d ? Number(relativeStrength20d.toFixed(2)) : null,
        residualAlpha20d: rawResidualAlpha !== null ? Number(rawResidualAlpha.toFixed(2)) : null,
        factorBasketAlpha20d: volatilityAdjustedReturn !== null ? Number(volatilityAdjustedReturn.toFixed(2)) : null,
        __rawStockReturn20d: stockReturn20 !== null ? Number(stockReturn20.toFixed(2)) : null,
        __rawResidualAlpha20d: rawResidualAlpha !== null ? Number(rawResidualAlpha.toFixed(2)) : null,
        __rawVolatilityAdjustedReturn20d:
          volatilityAdjustedReturn !== null ? Number(volatilityAdjustedReturn.toFixed(2)) : null,
        breakoutLevel: breakoutLevel ? Number(breakoutLevel.toFixed(2)) : null,
        breakdownLevel: breakdownLevel ? Number(breakdownLevel.toFixed(2)) : null,
        aboveVwap: vwap !== null ? lastPrice > vwap : false,
        deliveryDataAvailable: false,
      };

      return baseResult;
    })
  );

  const cleanResults = stockResults.filter((item): item is InternalBaseUniverseMetrics => Boolean(item));
  const sectorResidualReturns = new Map<string, number[]>();
  const categoryResidualReturns = new Map<string, number[]>();
  const sectorRawReturns = new Map<string, number[]>();
  const categoryRawReturns = new Map<string, number[]>();
  const sectorFactorReturns = new Map<string, number[]>();
  const categoryFactorReturns = new Map<string, number[]>();

  for (const item of cleanResults) {
    if (item.__rawResidualAlpha20d !== null) {
      const existing = sectorResidualReturns.get(item.sector) || [];
      existing.push(item.__rawResidualAlpha20d);
      sectorResidualReturns.set(item.sector, existing);
      const existingCategory = categoryResidualReturns.get(item.category) || [];
      existingCategory.push(item.__rawResidualAlpha20d);
      categoryResidualReturns.set(item.category, existingCategory);
    }
    if (item.__rawStockReturn20d !== null) {
      const existingSectorRaw = sectorRawReturns.get(item.sector) || [];
      existingSectorRaw.push(item.__rawStockReturn20d);
      sectorRawReturns.set(item.sector, existingSectorRaw);
      const existingCategoryRaw = categoryRawReturns.get(item.category) || [];
      existingCategoryRaw.push(item.__rawStockReturn20d);
      categoryRawReturns.set(item.category, existingCategoryRaw);
    }
    if (item.__rawVolatilityAdjustedReturn20d !== null) {
      const existingSectorFactor = sectorFactorReturns.get(item.sector) || [];
      existingSectorFactor.push(item.__rawVolatilityAdjustedReturn20d);
      sectorFactorReturns.set(item.sector, existingSectorFactor);
      const existingCategoryFactor = categoryFactorReturns.get(item.category) || [];
      existingCategoryFactor.push(item.__rawVolatilityAdjustedReturn20d);
      categoryFactorReturns.set(item.category, existingCategoryFactor);
    }
  }

  baseMetricsCache = cleanResults
    .map((item) => {
      const sectorResidualAverage = average(sectorResidualReturns.get(item.sector) || []);
      const categoryResidualAverage = average(categoryResidualReturns.get(item.category) || []);
      const categoryRawAverage = average(categoryRawReturns.get(item.category) || []);
      const sectorRawAverage = average(sectorRawReturns.get(item.sector) || []);
      const sectorFactorAverage = average(sectorFactorReturns.get(item.sector) || []);
      const categoryFactorAverage = average(categoryFactorReturns.get(item.category) || []);
      const sectorRelativeReturn =
        item.__rawStockReturn20d !== null && sectorRawAverage !== null ? item.__rawStockReturn20d - sectorRawAverage : null;
      const categoryRelativeReturn =
        item.__rawStockReturn20d !== null && categoryRawAverage !== null
          ? item.__rawStockReturn20d - categoryRawAverage
          : null;
      const residualComposite =
        item.__rawResidualAlpha20d !== null
          ? item.__rawResidualAlpha20d * 0.45 + (sectorRelativeReturn || 0) * 0.35 + (categoryRelativeReturn || 0) * 0.2
          : null;
      const factorComposite =
        item.__rawVolatilityAdjustedReturn20d !== null
          ? item.__rawVolatilityAdjustedReturn20d * 0.45 +
            ((sectorFactorAverage !== null ? item.__rawVolatilityAdjustedReturn20d - sectorFactorAverage : 0) * 0.35) +
            ((categoryFactorAverage !== null ? item.__rawVolatilityAdjustedReturn20d - categoryFactorAverage : 0) * 0.2)
          : null;
      const residualBaseline =
        sectorResidualAverage !== null || categoryResidualAverage !== null
          ? (sectorResidualAverage || 0) * 0.6 + (categoryResidualAverage || 0) * 0.4
          : null;
      const factorBasketBaseline =
        sectorFactorAverage !== null || categoryFactorAverage !== null
          ? (sectorFactorAverage || 0) * 0.6 + (categoryFactorAverage || 0) * 0.4
          : null;

      return {
        ...item,
        residualAlpha20d:
          residualComposite !== null ? Number((residualComposite - (residualBaseline || 0)).toFixed(2)) : null,
        factorBasketAlpha20d:
          factorComposite !== null ? Number((factorComposite - (factorBasketBaseline || 0)).toFixed(2)) : null,
      };
    })
    .map((item) => {
      const {
        __rawStockReturn20d,
        __rawResidualAlpha20d,
        __rawVolatilityAdjustedReturn20d,
        ...cleanItem
      } = item;
      void __rawStockReturn20d;
      void __rawResidualAlpha20d;
      void __rawVolatilityAdjustedReturn20d;
      return cleanItem;
    }) as ScreenerBaseMetrics[];
  baseMetricsCachedAt = now;
  return baseMetricsCache;
}

export async function loadScreenerRuntime(token: string): Promise<ScreenerRuntime> {
      const kite = getKiteInstance(token) as KiteLike;
  const instrumentMap = await getInstrumentMap();
  const universe = getStockUniverse();
  const baseMetrics = await getBaseUniverseMetrics(kite, instrumentMap);
  if (baseMetrics.length === 0) {
    throw new Error(
      'No cached historical datasets were available for the screener. Build /api/stocks/research/foundation for day data first.'
    );
  }

  const sectorContext = applySectorSnapshot(buildSectorContext(baseMetrics), readSectorSnapshot());
  const benchmarkDataset = readDataset('day', 'NIFTY50_BENCHMARK');
  const benchmarkCloses = benchmarkDataset?.candles?.map((row) => row.close) || [];
  const benchmarkQuote = await kite.getQuote(['NSE:NIFTY 50']).catch(() => ({} as Record<string, KiteQuote>));
  const benchmarkLastPrice =
    benchmarkQuote['NSE:NIFTY 50']?.last_price || benchmarkCloses[benchmarkCloses.length - 1] || 0;
  const regime = buildRegime(baseMetrics, benchmarkCloses, benchmarkLastPrice);
  const researchManifest = readResearchManifest();
  const calibrationContext = buildCalibrationContext(researchManifest);

  return {
    kite,
    universe,
    baseMetrics,
    sectorContext,
    benchmarkCloses,
    benchmarkLastPrice,
    regime,
    researchManifest,
    calibrationContext,
  };
}

export async function scoreScreen(runtime: ScreenerRuntime, screen: StockScreenType): Promise<ScoredScreenSnapshot> {
  const matchedBaseMetrics = runtime.baseMetrics.filter((item) => screenMatches(screen, item));
  const optionStructureContext = await buildOptionStructureBatch(
    runtime.kite,
    matchedBaseMetrics.map((item) => ({
      symbol: item.symbol,
      spotPrice: item.lastPrice,
    }))
  );
  const scorePayload = createScreenerScorePayload(
    runtime.baseMetrics,
    runtime.sectorContext,
    optionStructureContext,
    runtime.regime,
    runtime.calibrationContext
  );

  const results = matchedBaseMetrics
    .map((item) =>
      scoreScreenerResult(
        screen,
        item,
        scorePayload,
        getProbabilityEstimate(runtime.researchManifest, screen, item.symbol)
      )
    )
    .sort((a, b) => b.score - a.score);

  return {
    screen,
    screenLabel: SCREEN_LABELS[screen],
    scorePayload,
    results,
  };
}
