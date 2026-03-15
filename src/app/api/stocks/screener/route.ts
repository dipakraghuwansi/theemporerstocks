import fs from 'fs';
import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { getKiteInstance } from '@/lib/kiteHelper';
import { readDataset } from '@/lib/historical/cache';
import { buildOptionStructureBatch } from '@/lib/optionsStructure/core';
import { SCREEN_LABELS, StockScreenType } from '@/lib/stockUniverse';
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
import { getStockUniverse } from '@/lib/stockUniverseStore';
import {
  applySectorSnapshot,
  buildCalibrationContext,
  buildRegime,
  buildSectorContext,
  createScreenerScorePayload,
  ScreenerBaseMetrics,
  ScreenerScoredResult,
  screenMatches,
  scoreScreenerResult,
} from '@/lib/screenerScoring';
import { readResearchManifest } from '@/lib/research/cache';
import { getProbabilityEstimate } from '@/lib/research/stats';

const NIFTY_50_TOKEN = 256265;
const INSTRUMENTS_URL = 'https://api.kite.trade/instruments';
const SECTOR_SNAPSHOT_PATH = path.join(process.cwd(), 'sector_breadth_snapshot.json');

type InstrumentMeta = {
  instrumentToken: number;
  tradingsymbol: string;
  exchange: string;
  segment: string;
};

type ScreenResult = ScreenerScoredResult;
type BaseUniverseMetrics = ScreenerBaseMetrics;

let instrumentCache: Map<string, InstrumentMeta> | null = null;
let lastInstrumentFetch = 0;
let baseMetricsCache: BaseUniverseMetrics[] | null = null;
let baseMetricsCachedAt = 0;
const BASE_METRICS_CACHE_MS = 5 * 60 * 1000;

async function getInstrumentMap() {
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

function toScreenType(value: string | null): StockScreenType {
  if (value === 'swing-setups' || value === 'mean-reversion' || value === 'breakout-watchlist') {
    return value;
  }
  return 'intraday-momentum';
}

function computeSectorBreadth(results: Array<BaseUniverseMetrics | ScreenResult>) {
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

function readSectorSnapshot() {
  if (!fs.existsSync(SECTOR_SNAPSHOT_PATH)) {
    return [];
  }

  try {
    return JSON.parse(fs.readFileSync(SECTOR_SNAPSHOT_PATH, 'utf8')) as Array<{
      sector: string;
      breadthPct: number;
      aboveSma20Pct: number;
      avgDayChangePct: number;
      generatedAt: string;
    }>;
  } catch {
    return [];
  }
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

async function getBaseUniverseMetrics(kite: any, instrumentMap: Map<string, InstrumentMeta>) {
  const now = Date.now();
  if (baseMetricsCache && now - baseMetricsCachedAt < BASE_METRICS_CACHE_MS) {
    return baseMetricsCache;
  }

  const universe = getStockUniverse();
  const universeWithTokens = universe.map((item) => {
    const meta = instrumentMap.get(item.instrument);
    return meta ? { ...item, instrumentToken: meta.instrumentToken } : null;
  }).filter(Boolean) as Array<(typeof universe)[number] & { instrumentToken: number }>;

  const quotes = await kite.getQuote(universeWithTokens.map((item) => item.instrument));

  const stockResults = await Promise.all(
    universeWithTokens.map(async (item) => {
      const dailyDataset = readDataset('day', item.symbol);
      const minuteDataset = readDataset('minute', item.symbol);
      const dailyCandles = dailyDataset?.candles || [];
      const minuteCandles = minuteDataset?.candles || [];

      const quote = quotes[item.instrument];
      if (!quote || dailyCandles.length < 25) return null;

      const closes = dailyCandles.map((candle: any) => candle.close);
      const highs = dailyCandles.map((candle: any) => candle.high);
      const lows = dailyCandles.map((candle: any) => candle.low);
      const volumes = dailyCandles.map((candle: any) => candle.volume || 0);

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
      const benchmarkCloses = benchmarkDataset?.candles?.map((candle: any) => candle.close) || [];
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
      const relativeStrength20d =
        benchmarkReturn20 !== null && stockReturn20 !== null ? stockReturn20 - benchmarkReturn20 : null;

      const baseResult: BaseUniverseMetrics = {
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
        relativeStrength20d: relativeStrength20d ? Number(relativeStrength20d.toFixed(2)) : null,
        residualAlpha20d: stockReturn20 !== null ? Number(stockReturn20.toFixed(2)) : null,
        factorBasketAlpha20d:
          stockReturn20 !== null && benchmarkReturn20 !== null && beta20 !== null
            ? Number((stockReturn20 - beta20 * benchmarkReturn20).toFixed(2))
            : null,
        breakoutLevel: breakoutLevel ? Number(breakoutLevel.toFixed(2)) : null,
        breakdownLevel: breakdownLevel ? Number(breakdownLevel.toFixed(2)) : null,
        aboveVwap: vwap !== null ? lastPrice > vwap : false,
        deliveryDataAvailable: false,
      };

      return baseResult;
    })
  );

  const cleanResults = stockResults.filter((item): item is BaseUniverseMetrics => Boolean(item));
  const sectorReturns = new Map<string, number[]>();
  const categoryReturns = new Map<string, number[]>();

  for (const item of cleanResults) {
    if (item.residualAlpha20d === null) continue;
    const existing = sectorReturns.get(item.sector) || [];
    existing.push(item.residualAlpha20d);
    sectorReturns.set(item.sector, existing);
    const existingCategory = categoryReturns.get(item.category) || [];
    existingCategory.push(item.residualAlpha20d);
    categoryReturns.set(item.category, existingCategory);
  }

  baseMetricsCache = cleanResults.map((item) => {
    const sectorAverage = average(sectorReturns.get(item.sector) || []);
    const categoryAverage = average(categoryReturns.get(item.category) || []);
    const factorBasketBaseline = average(
      [sectorAverage, categoryAverage].filter((value): value is number => value !== null)
    );
    return {
      ...item,
      residualAlpha20d:
        item.residualAlpha20d !== null && sectorAverage !== null
          ? Number((item.residualAlpha20d - sectorAverage).toFixed(2))
          : null,
      factorBasketAlpha20d:
        item.factorBasketAlpha20d !== null && factorBasketBaseline !== null
          ? Number(
              (
                item.factorBasketAlpha20d -
                factorBasketBaseline
              ).toFixed(2)
            )
          : null,
    };
  });
  baseMetricsCachedAt = now;
  return baseMetricsCache;
}

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('kite_access_token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Not authenticated with Kite', needsLogin: true }, { status: 401 });
    }

    const screen = toScreenType(request.nextUrl.searchParams.get('screen'));
    const kite = getKiteInstance(token) as any;
    const instrumentMap = await getInstrumentMap();
    const universe = getStockUniverse();
    const baseMetrics = await getBaseUniverseMetrics(kite, instrumentMap);
    if (baseMetrics.length === 0) {
      return NextResponse.json(
        {
          error: 'No cached historical datasets were available for the screener. Build /api/stocks/research/foundation for day data first.',
        },
        { status: 503 }
      );
    }
    const sectorContext = applySectorSnapshot(buildSectorContext(baseMetrics), readSectorSnapshot());
    const benchmarkDataset = readDataset('day', 'NIFTY50_BENCHMARK');
    const benchmarkCloses = benchmarkDataset?.candles?.map((row) => row.close) || [];
    const benchmarkQuote = await kite.getQuote(['NSE:NIFTY 50']).catch(() => ({}));
    const benchmarkLastPrice =
      benchmarkQuote['NSE:NIFTY 50']?.last_price || benchmarkCloses[benchmarkCloses.length - 1] || 0;
    const regime = buildRegime(baseMetrics, benchmarkCloses, benchmarkLastPrice);
    const researchManifest = readResearchManifest();
    const calibrationContext = buildCalibrationContext(researchManifest);
    const matchedBaseMetrics = baseMetrics.filter((item) => screenMatches(screen, item));
    const optionStructureContext = await buildOptionStructureBatch(
      kite,
      matchedBaseMetrics.map((item) => ({
        symbol: item.symbol,
        spotPrice: item.lastPrice,
      }))
    );
    const scorePayload = createScreenerScorePayload(
      baseMetrics,
      sectorContext,
      optionStructureContext,
      regime,
      calibrationContext
    );
    const matches = matchedBaseMetrics
      .map((item) =>
        scoreScreenerResult(
          screen,
          item,
          scorePayload,
          getProbabilityEstimate(researchManifest, screen, item.symbol)
        )
      )
      .sort((a, b) => b.score - a.score);

    return NextResponse.json({
      success: true,
      screen,
      screenLabel: SCREEN_LABELS[screen],
      universeSize: universe.length,
      matched: matches.length,
      benchmark: 'NIFTY 50',
      scorePayload,
      notes: [
        'Historical indicators are cached for 5 minutes to reduce repeated Kite historical API load.',
        'The screener now reads day and minute indicator inputs from local historical_cache data instead of fanning out to Kite historical APIs on every load.',
        'VWAP is derived from cached intraday minute candles when they exist; otherwise it stays unavailable.',
        'Live quote, day change, volume, and volume expansion are then updated from the websocket stream in the UI.',
        'Scores are now normalized cross-sectionally and use ATR-adjusted move/proximity factors.',
        'Sector breadth overlay is applied on top of stock-level scores using breadth, breadth delta, above-SMA20 participation, and average day change.',
        'A market regime layer now boosts or suppresses screens based on benchmark trend and broad market participation.',
        'A lightweight HMM-style filter now smooths regime classification across recent benchmark moves before the current breadth state is applied.',
        'Option structure overlay is built only for matched names, then batched into one quote request to reduce Kite load while adding gamma/OI and futures buildup context.',
        'Factor basket alpha now blends beta-adjusted benchmark return with sector/category context to isolate stock-specific strength.',
        'Overlay aggressiveness is lightly calibrated from historical screen performance so newer microstructure and derivatives signals do not dominate by default.',
        'Delivery expansion is not available from the current Kite data path, so it is marked unavailable.',
        'Sector breadth is computed from the curated stock universe used by this screener.',
      ],
      sectorBreadth: computeSectorBreadth(matches),
      results: matches,
    });
  } catch (error: any) {
    console.error('Stock screener API error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to run stock screener.' },
      { status: 500 }
    );
  }
}
