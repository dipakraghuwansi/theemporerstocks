import { ensureDatasetHydrated, readDataset } from '@/lib/historical/cache';
import { buildHistoricalDataset } from '@/lib/historical/foundation';
import { HistoricalDatasetFile, HistoricalInterval } from '@/lib/historical/types';
import { buildOptionStructureBatch } from '@/lib/optionsStructure/core';
import { buildOutcomeLabels } from '@/lib/research/labels';
import { buildResearchManifest, getProbabilityEstimate } from '@/lib/research/stats';
import { ScreenOutcomeLabel } from '@/lib/research/types';
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
import { createScreenerScorePayload, screenMatches, scoreScreenerResult, ScreenerBaseMetrics, ScreenerScoredResult } from '@/lib/screenerScoring';
import { loadScreenerRuntime } from '@/lib/screener/runtime';
import { SCREEN_LABELS, StockScreenType } from '@/lib/stockUniverse';
import { getStockUniverse } from '@/lib/stockUniverseStore';
import {
  StockLabAnalysis,
  StockLabCurrentScreenSnapshot,
  StockLabCurrentSnapshot,
  StockLabCurvePoint,
  StockLabDataStatus,
  StockLabDatasetSource,
  StockLabMinuteCoveragePoint,
  StockLabModelSummary,
  StockLabPricePoint,
  StockLabProgressReporter,
  StockLabRecentTrade,
  StockLabRegimePoint,
  StockLabReturnBucketPoint,
  StockLabWalkForwardPoint,
} from '@/lib/stockLab/types';

const BENCHMARK_SYMBOL = 'NIFTY50_BENCHMARK';
const DAY_LOOKBACK_DAYS = 730;
const MINUTE_LOOKBACK_DAYS = 20;
const PRICE_SERIES_LIMIT = 260;
const SCREEN_ORDER: StockScreenType[] = ['intraday-momentum', 'swing-setups', 'mean-reversion', 'breakout-watchlist'];

const RETURN_BUCKETS = [
  { label: '<= -4%', min: Number.NEGATIVE_INFINITY, max: -4 },
  { label: '-4% to -2%', min: -4, max: -2 },
  { label: '-2% to 0%', min: -2, max: 0 },
  { label: '0% to 2%', min: 0, max: 2 },
  { label: '2% to 4%', min: 2, max: 4 },
  { label: '>= 4%', min: 4, max: Number.POSITIVE_INFINITY },
] as const;

type DatasetResult = {
  dataset: HistoricalDatasetFile | null;
  source: StockLabDatasetSource;
};

type StockLabQuote = {
  last_price: number;
  volume?: number;
  ohlc?: {
    close?: number;
    open?: number;
  };
};

type DatasetStepOptions = {
  symbol: string;
  interval: HistoricalInterval;
  lookbackDays: number;
  token?: string | null;
  includeBenchmark?: boolean;
  progress?: StockLabProgressReporter;
  stepKey: string;
  checkTitle: string;
  checkDetail: string;
  buildTitle: string;
  buildDetail: string;
  missingDetail: string;
};

function normalizeSymbol(symbol: string) {
  return symbol.trim().toUpperCase();
}

function getDateRange(lookbackDays: number) {
  const toDate = new Date();
  const fromDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  return {
    from: fromDate.toISOString().split('T')[0],
    to: toDate.toISOString().split('T')[0],
  };
}

function datasetSatisfiesLookback(dataset: HistoricalDatasetFile | null, lookbackDays: number) {
  if (!dataset) return false;
  const { from, to } = getDateRange(lookbackDays);
  return dataset.from <= from && dataset.to >= to && dataset.candles.length > 0;
}

function describeDataset(dataset: HistoricalDatasetFile) {
  return `${dataset.candles.length} candles covering ${dataset.from} to ${dataset.to}.`;
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

async function emitProgress(
  progress: StockLabProgressReporter | undefined,
  key: string,
  title: string,
  detail: string
) {
  if (!progress) return;
  await progress({
    key,
    title,
    detail,
    timestamp: new Date().toISOString(),
  });
}

async function readLocalDataset(interval: HistoricalInterval, symbol: string) {
  return readDataset(interval, symbol) || (await ensureDatasetHydrated(interval, symbol));
}

async function ensureAnalysisDataset(options: DatasetStepOptions) {
  await emitProgress(options.progress, `${options.stepKey}-check`, options.checkTitle, options.checkDetail);
  const existingDataset = await readLocalDataset(options.interval, options.symbol);
  if (datasetSatisfiesLookback(existingDataset, options.lookbackDays)) {
    await emitProgress(
      options.progress,
      `${options.stepKey}-ready`,
      `${options.checkTitle} ready`,
      `Reused cached history for ${options.symbol}. ${describeDataset(existingDataset!)}`
    );
    return {
      dataset: existingDataset,
      source: 'cache',
    } satisfies DatasetResult;
  }

  if (!options.token) {
    await emitProgress(
      options.progress,
      `${options.stepKey}-missing`,
      `${options.checkTitle} incomplete`,
      options.missingDetail
    );
    return {
      dataset: existingDataset,
      source: existingDataset ? 'cache' : 'missing',
    } satisfies DatasetResult;
  }

  await emitProgress(options.progress, `${options.stepKey}-build`, options.buildTitle, options.buildDetail);
  await buildHistoricalDataset(
    {
      token: options.token,
      interval: options.interval,
      lookbackDays: options.lookbackDays,
      refresh: false,
      includeBenchmark: options.includeBenchmark,
      symbols: [options.symbol],
      maxSymbols: 1,
    },
    { persistManifest: false }
  );

  const dataset = await readLocalDataset(options.interval, options.symbol);

  if (dataset) {
    await emitProgress(
      options.progress,
      `${options.stepKey}-built`,
      `${options.buildTitle} complete`,
      `Built fresh ${options.interval} history for ${options.symbol}. ${describeDataset(dataset)}`
    );
  } else {
    await emitProgress(
      options.progress,
      `${options.stepKey}-still-missing`,
      `${options.buildTitle} incomplete`,
      `The build finished, but ${options.symbol} still does not have a usable ${options.interval} dataset. This usually means the provider did not return enough candles for the requested window.`
    );
  }

  return {
    dataset,
    source: dataset ? 'built' : 'missing',
  } satisfies DatasetResult;
}

async function ensureBenchmarkDataset(token?: string | null, progress?: StockLabProgressReporter) {
  await emitProgress(
    progress,
    'benchmark-check',
    'Checking benchmark history',
    'Looking for the cached NIFTY50 benchmark series so regime and relative-performance calculations do not refetch it unnecessarily.'
  );
  const existingDataset = await readLocalDataset('day', BENCHMARK_SYMBOL);
  if (datasetSatisfiesLookback(existingDataset, DAY_LOOKBACK_DAYS)) {
    await emitProgress(
      progress,
      'benchmark-ready',
      'Benchmark history ready',
      `Reused cached benchmark history. ${describeDataset(existingDataset!)}`
    );
    return {
      dataset: existingDataset,
      source: 'cache',
    } satisfies DatasetResult;
  }

  if (!token) {
    await emitProgress(
      progress,
      'benchmark-missing',
      'Benchmark history incomplete',
      'No fresh Kite session is available, so the lab cannot build the missing benchmark candles needed for regime and benchmark-relative analysis.'
    );
    return {
      dataset: existingDataset,
      source: existingDataset ? 'cache' : 'missing',
    } satisfies DatasetResult;
  }

  await emitProgress(
    progress,
    'benchmark-build',
    'Building benchmark history',
    'The cached benchmark series is incomplete, so we are fetching a fresh NIFTY50 benchmark history for the same lookback window used by the stock backtest.'
  );
  await buildHistoricalDataset(
    {
      token,
      interval: 'day',
      lookbackDays: DAY_LOOKBACK_DAYS,
      refresh: false,
      includeBenchmark: true,
      maxSymbols: 0,
    },
    { persistManifest: false }
  );

  const dataset = await readLocalDataset('day', BENCHMARK_SYMBOL);

  if (dataset) {
    await emitProgress(
      progress,
      'benchmark-built',
      'Benchmark history complete',
      `Built fresh benchmark history. ${describeDataset(dataset)}`
    );
  } else {
    await emitProgress(
      progress,
      'benchmark-still-missing',
      'Benchmark history incomplete',
      'The benchmark build completed, but the required benchmark dataset is still unavailable.'
    );
  }

  return {
    dataset,
    source: dataset ? 'built' : 'missing',
  } satisfies DatasetResult;
}

function getCurrentMicrostructureBias(result: ScreenerScoredResult): StockLabCurrentScreenSnapshot['microstructureBias'] {
  const edge = result.micropriceEdgePct;
  const rolling = result.rollingOfi;

  if (edge === null || edge === undefined || rolling === null || rolling === undefined) {
    return 'Unavailable';
  }

  if (edge > 0 && rolling > 0) return 'Supportive';
  if (edge < 0 && rolling < 0) return 'Opposing';
  return 'Mixed';
}

function buildAdHocScreenerMetrics(
  dayDataset: HistoricalDatasetFile,
  minuteDataset: HistoricalDatasetFile | null,
  benchmarkDataset: HistoricalDatasetFile,
  quote: StockLabQuote
): ScreenerBaseMetrics | null {
  const dailyCandles = dayDataset.candles || [];
  if (dailyCandles.length < 25) return null;

  const minuteCandles = minuteDataset?.candles || [];
  const closes = dailyCandles.map((candle) => candle.close);
  const highs = dailyCandles.map((candle) => candle.high);
  const lows = dailyCandles.map((candle) => candle.low);
  const volumes = dailyCandles.map((candle) => candle.volume || 0);
  const benchmarkCloses = benchmarkDataset.candles.map((candle) => candle.close);
  const benchmark20 = benchmarkCloses.slice(-21);
  const stock20 = closes.slice(-21);

  const previousClose = quote.ohlc?.close || closes[closes.length - 2];
  const openPrice = quote.ohlc?.open || dailyCandles[dailyCandles.length - 1]?.open || previousClose;
  const lastPrice = quote.last_price || closes[closes.length - 1];
  const volume = quote.volume || 0;

  const previous20Volumes = volumes.slice(-21, -1).filter((value) => value > 0);
  const previous7Volumes = volumes.slice(-8, -1).filter((value) => value > 0);
  const prior7Volumes = volumes.slice(-15, -8).filter((value) => value > 0);
  const previous20Highs = highs.slice(-21, -1);
  const previous20Lows = lows.slice(-21, -1);

  const avgVolume7 = average(previous7Volumes);
  const priorAvgVolume7 = average(prior7Volumes);
  const avgVolume7Compare =
    avgVolume7 !== null && priorAvgVolume7 !== null && priorAvgVolume7 > 0 ? avgVolume7 / priorAvgVolume7 : null;
  const avgVolume20 = average(previous20Volumes);
  const volumeExpansion = avgVolume20 !== null && avgVolume20 > 0 ? volume / avgVolume20 : null;
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
  const rawResidualAlpha =
    stockReturn20 !== null && benchmarkReturn20 !== null && beta20 !== null
      ? stockReturn20 - beta20 * benchmarkReturn20
      : null;
  const factorBasketAlpha20d = calculateVolatilityAdjustedReturn(closes, atr14);

  return {
    symbol: dayDataset.symbol,
    instrument: dayDataset.instrument,
    sector: dayDataset.sector,
    category: dayDataset.category,
    lastPrice,
    previousClose,
    openPrice,
    dayChangePct: Number(calculatePercentChange(lastPrice, previousClose).toFixed(2)),
    gapPct: Number(calculatePercentChange(openPrice, previousClose).toFixed(2)),
    volume,
    avgVolume7: avgVolume7 !== null ? Number(avgVolume7.toFixed(0)) : null,
    avgVolume7Compare: avgVolume7Compare !== null ? Number(avgVolume7Compare.toFixed(2)) : null,
    avgVolume20: avgVolume20 !== null ? Number(avgVolume20.toFixed(0)) : null,
    volumeExpansion: volumeExpansion !== null ? Number(volumeExpansion.toFixed(2)) : null,
    sma20: sma20 !== null ? Number(sma20.toFixed(2)) : null,
    sma50: sma50 !== null ? Number(sma50.toFixed(2)) : null,
    rsi14: rsi14 !== null ? Number(rsi14.toFixed(2)) : null,
    atr14: atr14 !== null ? Number(atr14.toFixed(2)) : null,
    vwap: vwap !== null ? Number(vwap.toFixed(2)) : null,
    microprice: null,
    micropriceEdgePct: null,
    orderFlowImbalance: null,
    rollingOfi: null,
    vpin: null,
    relativeStrength20d: relativeStrength20d !== null ? Number(relativeStrength20d.toFixed(2)) : null,
    residualAlpha20d: rawResidualAlpha !== null ? Number(rawResidualAlpha.toFixed(2)) : null,
    factorBasketAlpha20d: factorBasketAlpha20d !== null ? Number(factorBasketAlpha20d.toFixed(2)) : null,
    breakoutLevel: breakoutLevel !== null ? Number(breakoutLevel.toFixed(2)) : null,
    breakdownLevel: breakdownLevel !== null ? Number(breakdownLevel.toFixed(2)) : null,
    aboveVwap: vwap !== null ? lastPrice > vwap : false,
    deliveryDataAvailable: false,
  };
}

function toCurrentScreenSnapshot(
  screen: StockScreenType,
  result: ScreenerScoredResult,
  matched: boolean
): StockLabCurrentScreenSnapshot {
  return {
    screen,
    screenLabel: SCREEN_LABELS[screen],
    matched,
    score: result.score,
    thesis: result.thesis,
    confidenceScore: result.buyRecommendation.confidenceScore,
    confidenceLabel: result.buyRecommendation.confidenceLabel,
    supportLabel: result.buyRecommendation.supportLabel,
    historicallySupported: result.buyRecommendation.historicallySupported,
    confidenceExplanation: result.buyRecommendation.confidenceExplanation,
    supportExplanation: result.buyRecommendation.supportExplanation,
    aboveVwap: result.aboveVwap,
    sectorState: result.sectorState,
    gammaRegime: result.optionsStructure?.available ? result.optionsStructure.gammaRegime : null,
    dominantOiFlow: result.optionsStructure?.available ? result.optionsStructure.dominantOiFlow : null,
    futuresBuildup: result.optionsStructure?.available ? result.optionsStructure.futuresBuildup : null,
    microstructureBias: getCurrentMicrostructureBias(result),
    topDrivers: result.scoreBreakdown.topDrivers.map((driver) => `${driver.label}: ${driver.displayValue}`),
    entryPrice: result.buyRecommendation.plan.entryPrice,
    stopLoss: result.buyRecommendation.plan.stopLoss,
    targetPrice: result.buyRecommendation.plan.targetPrice,
    riskPct: result.buyRecommendation.plan.riskPct,
    rewardPct: result.buyRecommendation.plan.rewardPct,
  };
}

async function buildCurrentSnapshot(options: {
  symbol: string;
  token?: string | null;
  dayDataset: HistoricalDatasetFile;
  minuteDataset: HistoricalDatasetFile | null;
  benchmarkDataset: HistoricalDatasetFile;
  progress?: StockLabProgressReporter;
}): Promise<StockLabCurrentSnapshot | null> {
  if (!options.token) {
    await emitProgress(
      options.progress,
      'current-screener-skipped',
      'Skipping current screener snapshot',
      'A fresh Kite session is not available, so the stock lab cannot build the live screener-style context for the current setup.'
    );

    return {
      available: false,
      reason: 'Log in to Kite to attach the current screener-style setup tags for this symbol.',
      regimeLabel: null,
      regimeConfidencePct: null,
      activeScreens: [],
      allScreens: [],
      bestScreen: null,
    };
  }

  await emitProgress(
    options.progress,
    'current-screener-start',
    'Building current screener snapshot',
    'Pulling the latest screener context so the stock lab can show the same current setup tags, confidence labels, and trade levels used by the live screener cards.'
  );

  const runtime = await loadScreenerRuntime(options.token);
  const runtimeMetrics = runtime.baseMetrics.find((row) => row.symbol === options.symbol) || null;
  let metrics = runtimeMetrics;

  if (!metrics) {
    const quoteMap = await runtime.kite.getQuote([options.dayDataset.instrument]);
    const quote = quoteMap[options.dayDataset.instrument];
    if (!quote) {
      await emitProgress(
        options.progress,
        'current-screener-missing',
        'Current screener snapshot unavailable',
        `The screener runtime loaded, but the latest quote for ${options.symbol} was unavailable, so the current setup tags could not be built.`
      );

      return {
        available: false,
        reason: `Latest quote for ${options.symbol} was unavailable during the screener snapshot build.`,
        regimeLabel: runtime.regime.label,
        regimeConfidencePct: Number((runtime.regime.confidence * 100).toFixed(0)),
        activeScreens: [],
        allScreens: [],
        bestScreen: null,
      };
    }

    metrics = buildAdHocScreenerMetrics(options.dayDataset, options.minuteDataset, options.benchmarkDataset, quote);
  }

  if (!metrics) {
    await emitProgress(
      options.progress,
      'current-screener-missing',
      'Current screener snapshot unavailable',
      `The stock lab does not yet have enough daily history to build a current screener-style setup snapshot for ${options.symbol}.`
    );

    return {
      available: false,
      reason: `Not enough daily history is available to build a current screener-style snapshot for ${options.symbol}.`,
      regimeLabel: runtime.regime.label,
      regimeConfidencePct: Number((runtime.regime.confidence * 100).toFixed(0)),
      activeScreens: [],
      allScreens: [],
      bestScreen: null,
    };
  }

  const scoringUniverse = runtime.baseMetrics.some((row) => row.symbol === metrics.symbol)
    ? runtime.baseMetrics
    : [...runtime.baseMetrics, metrics];
  const optionStructureContext = await buildOptionStructureBatch(runtime.kite, [
    {
      symbol: metrics.symbol,
      spotPrice: metrics.lastPrice,
    },
  ]);
  const scorePayload = createScreenerScorePayload(
    scoringUniverse,
    runtime.sectorContext,
    optionStructureContext,
    runtime.regime,
    runtime.calibrationContext
  );

  const allScreens = SCREEN_ORDER
    .map((screen) => {
      const result = scoreScreenerResult(
        screen,
        metrics,
        scorePayload,
        getProbabilityEstimate(runtime.researchManifest, screen, metrics.symbol)
      );
      return toCurrentScreenSnapshot(screen, result, screenMatches(screen, metrics));
    })
    .sort((a, b) => Number(b.matched) - Number(a.matched) || b.score - a.score);

  const activeScreens = allScreens.filter((screen) => screen.matched);
  const bestScreen = activeScreens[0] || allScreens[0] || null;

  await emitProgress(
    options.progress,
    'current-screener-complete',
    'Current screener snapshot ready',
    bestScreen
      ? `${options.symbol} currently leans most toward ${bestScreen.screenLabel} with score ${bestScreen.score.toFixed(1)} and ${bestScreen.confidenceLabel.toLowerCase()} confidence.`
      : `Built the current screener snapshot for ${options.symbol}, but no screen is actively matched right now.`
  );

  return {
    available: true,
    reason: null,
    regimeLabel: runtime.regime.label,
    regimeConfidencePct: Number((runtime.regime.confidence * 100).toFixed(0)),
    activeScreens,
    allScreens,
    bestScreen,
  };
}

function buildPriceSeries(dataset: HistoricalDatasetFile) {
  const candles = dataset.candles.slice(-PRICE_SERIES_LIMIT);

  return candles.map((candle, index): StockLabPricePoint => {
    const closes = candles.slice(0, index + 1).map((row) => row.close);
    const sma20 = closes.length >= 20 ? calculateSma(closes, 20) : null;
    const sma50 = closes.length >= 50 ? calculateSma(closes, 50) : null;

    return {
      date: candle.date.slice(0, 10),
      close: Number(candle.close.toFixed(2)),
      sma20: sma20 !== null ? Number(sma20.toFixed(2)) : null,
      sma50: sma50 !== null ? Number(sma50.toFixed(2)) : null,
      volume: candle.volume || 0,
    };
  });
}

function buildMinuteCoverageSeries(dataset: HistoricalDatasetFile | null) {
  if (!dataset) return [];

  const grouped = dataset.candles.reduce<Map<string, number>>((acc, candle) => {
    const key = candle.date.slice(0, 10);
    acc.set(key, (acc.get(key) || 0) + 1);
    return acc;
  }, new Map());

  return Array.from(grouped.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, candles]): StockLabMinuteCoveragePoint => ({
      date,
      candles,
    }));
}

function buildCurve(labels: ScreenOutcomeLabel[], screen: StockScreenType) {
  const screenLabels = labels
    .filter((label) => label.screen === screen)
    .sort((a, b) => a.entryDate.localeCompare(b.entryDate));

  const points: StockLabCurvePoint[] = [];
  let nav = 100;
  let benchmarkNav = 100;
  let peak = 100;

  for (const [index, label] of screenLabels.entries()) {
    nav *= Math.max(0, 1 + label.netReturnPct / 100);
    benchmarkNav *= Math.max(0, 1 + label.benchmarkReturnPct / 100);
    peak = Math.max(peak, nav);
    const drawdownPct = peak > 0 ? ((nav - peak) / peak) * 100 : 0;

    points.push({
      screen,
      screenLabel: SCREEN_LABELS[screen],
      date: label.entryDate.slice(0, 10),
      tradeNumber: index + 1,
      nav: Number(nav.toFixed(2)),
      benchmarkNav: Number(benchmarkNav.toFixed(2)),
      drawdownPct: Number(drawdownPct.toFixed(2)),
      netReturnPct: label.netReturnPct,
      benchmarkReturnPct: label.benchmarkReturnPct,
    });
  }

  return points;
}

function buildModelSummaries(labels: ScreenOutcomeLabel[]) {
  const manifest = buildResearchManifest(labels);
  const curves = (Object.keys(SCREEN_LABELS) as StockScreenType[]).flatMap((screen) => buildCurve(labels, screen));
  const summaries = manifest.screens.map<StockLabModelSummary>((summary) => {
    const stability = manifest.stabilitySummary.find((row) => row.screen === summary.screen);
    const screenCurve = curves.filter((row) => row.screen === summary.screen);
    const latestPoint = screenCurve[screenCurve.length - 1] || null;
    const maxDrawdownPct =
      screenCurve.length > 0
        ? Math.abs(Math.min(...screenCurve.map((row) => row.drawdownPct)))
        : 0;

    return {
      screen: summary.screen,
      screenLabel: SCREEN_LABELS[summary.screen],
      sampleSize: summary.sampleSize,
      winRate: summary.winRate,
      expectancyPct: summary.expectancyPct,
      netExpectancyPct: summary.netExpectancyPct,
      avgWinPct: summary.avgWinPct,
      avgLossPct: summary.avgLossPct,
      profitFactor: summary.profitFactor,
      stabilityScore: stability?.stabilityScore || 0,
      totalReturnPct: latestPoint ? Number((latestPoint.nav - 100).toFixed(2)) : 0,
      benchmarkReturnPct: latestPoint ? Number((latestPoint.benchmarkNav - 100).toFixed(2)) : 0,
      excessReturnPct: latestPoint ? Number((latestPoint.nav - latestPoint.benchmarkNav).toFixed(2)) : 0,
      maxDrawdownPct: Number(maxDrawdownPct.toFixed(2)),
      latestTradeDate: latestPoint?.date || null,
    };
  });

  return {
    manifest,
    curves,
    summaries,
  };
}

function buildRegimeSeries(labels: ScreenOutcomeLabel[]) {
  const manifest = buildResearchManifest(labels);
  return manifest.regimeSummary.map<StockLabRegimePoint>((row) => ({
    screen: row.screen,
    screenLabel: SCREEN_LABELS[row.screen],
    regime: row.regime,
    sampleSize: row.sampleSize,
    winRate: row.winRate,
    expectancyPct: row.expectancyPct,
    netExpectancyPct: row.netExpectancyPct,
  }));
}

function buildWalkForwardSeries(labels: ScreenOutcomeLabel[]) {
  const manifest = buildResearchManifest(labels);
  return manifest.walkForwardSummary.map<StockLabWalkForwardPoint>((row) => ({
    screen: row.screen,
    screenLabel: SCREEN_LABELS[row.screen],
    bucket: row.bucket,
    sampleSize: row.sampleSize,
    expectancyPct: row.expectancyPct,
    netExpectancyPct: row.netExpectancyPct,
  }));
}

function buildReturnBucketSeries(labels: ScreenOutcomeLabel[]) {
  const points: StockLabReturnBucketPoint[] = [];

  for (const screen of Object.keys(SCREEN_LABELS) as StockScreenType[]) {
    const screenLabels = labels.filter((label) => label.screen === screen);
    for (const bucket of RETURN_BUCKETS) {
      const count = screenLabels.filter((label) => {
        if (bucket.max === Number.POSITIVE_INFINITY) {
          return label.netReturnPct >= bucket.min;
        }
        return label.netReturnPct >= bucket.min && label.netReturnPct < bucket.max;
      }).length;

      points.push({
        screen,
        screenLabel: SCREEN_LABELS[screen],
        bucket: bucket.label,
        count,
      });
    }
  }

  return points;
}

function buildRecentTrades(labels: ScreenOutcomeLabel[]) {
  return [...labels]
    .sort((a, b) => b.entryDate.localeCompare(a.entryDate))
    .slice(0, 20)
    .map<StockLabRecentTrade>((label) => ({
      screen: label.screen,
      screenLabel: SCREEN_LABELS[label.screen],
      tradeDate: label.tradeDate,
      entryDate: label.entryDate,
      confirmation: label.confirmation,
      regime: label.regime,
      netReturnPct: label.netReturnPct,
      benchmarkReturnPct: label.benchmarkReturnPct,
      win: label.win,
    }));
}

function buildNotes(options: {
  inUniverse: boolean;
  symbol: string;
  dataStatus: StockLabDataStatus;
  modelSummaries: StockLabModelSummary[];
  totalLabels: number;
}) {
  const notes: string[] = [];

  if (options.inUniverse) {
    notes.push('This symbol is already in the curated universe, so the lab reused cached research data where possible.');
  } else {
    notes.push('This symbol is outside the curated universe, so the lab built an ad-hoc day and minute history pack without changing the main universe list.');
  }

  if (options.dataStatus.daySource === 'built' || options.dataStatus.minuteSource === 'built') {
    notes.push('One or more historical datasets were built on demand for this analysis, using the same research cache path as the weekend sweep but scoped to the selected symbol only.');
  }

  if (options.dataStatus.minuteSource === 'missing') {
    notes.push('Minute history is unavailable for this symbol right now, so the intraday-momentum model and minute coverage visuals may have sparse or zero samples.');
  }

  if (options.totalLabels === 0) {
    notes.push(`No historical model triggers were found for ${options.symbol} under the current rule set, so the page is showing price context without model evidence yet.`);
  } else {
    const best = [...options.modelSummaries]
      .filter((row) => row.sampleSize > 0)
      .sort((a, b) => b.netExpectancyPct - a.netExpectancyPct || b.sampleSize - a.sampleSize)[0];
    if (best) {
      notes.push(`${best.screenLabel} is currently the strongest model on this symbol by net expectancy, with ${best.sampleSize} trades and ${best.winRate.toFixed(1)}% win rate.`);
    }
  }

  notes.push('Historical minute candles improve intraday evidence, but true live microstructure still depends on market-hour stream capture rather than weekend backfills.');
  return notes;
}

export async function runStockLabAnalysis(
  symbolInput: string,
  token?: string | null,
  progress?: StockLabProgressReporter
): Promise<StockLabAnalysis> {
  const symbol = normalizeSymbol(symbolInput);
  if (!symbol) {
    throw new Error('A valid NSE stock symbol is required.');
  }

  await emitProgress(
    progress,
    'symbol-validated',
    'Validating symbol request',
    'Normalizing the requested ticker so the stock lab can map the analysis to a single NSE symbol and the correct cache keys.'
  );

  const universeItem = getStockUniverse().find((item) => item.symbol === symbol) || null;
  await emitProgress(
    progress,
    'universe-context',
    'Checking universe membership',
    universeItem
      ? `${symbol} is already in the curated universe, so the lab will try to reuse cached research and metadata before building anything new.`
      : `${symbol} is outside the curated universe, so the lab will use an ad-hoc history build path for this symbol only without changing the main universe manifests.`
  );
  const dayResult = await ensureAnalysisDataset({
    symbol,
    interval: 'day',
    lookbackDays: DAY_LOOKBACK_DAYS,
    token,
    includeBenchmark: true,
    progress,
    stepKey: 'day-history',
    checkTitle: 'Checking daily history',
    checkDetail:
      'Looking for roughly two years of daily candles in the local cache and Mongo-backed cache so we can reuse the existing research foundation when possible.',
    buildTitle: 'Building daily history',
    buildDetail:
      'The cached daily history is missing or stale, so we are fetching a fresh two-year daily candle pack for this symbol and benchmark.',
    missingDetail:
      'The daily history is missing or incomplete, and there is no fresh Kite session to build the missing candles right now.',
  });
  const benchmarkResult = await ensureBenchmarkDataset(token, progress);
  const minuteResult = await ensureAnalysisDataset({
    symbol,
    interval: 'minute',
    lookbackDays: MINUTE_LOOKBACK_DAYS,
    token,
    progress,
    stepKey: 'minute-history',
    checkTitle: 'Checking minute history',
    checkDetail:
      'Looking for the rolling recent minute-candle pack used by the intraday model so the lab can measure short-horizon evidence and coverage.',
    buildTitle: 'Building minute history',
    buildDetail:
      'The minute dataset is missing or stale, so we are fetching a fresh recent minute-candle window for this symbol.',
    missingDetail:
      'Minute history is not complete yet, and there is no fresh Kite session available to fetch the missing minute candles.',
  });

  const dayDataset = dayResult.dataset;
  const benchmarkDataset = benchmarkResult.dataset;
  if (!dayDataset || !benchmarkDataset) {
    throw new Error(`Historical day data for ${symbol} is not available yet. Build or refresh the symbol data and try again.`);
  }

  await emitProgress(
    progress,
    'label-generation',
    'Generating historical labels',
    'Running the same research label engine used by the screener so we can identify every historical model trigger and outcome for this symbol.'
  );
  const labels = buildOutcomeLabels([benchmarkDataset, dayDataset], minuteResult.dataset ? [minuteResult.dataset] : []);
  await emitProgress(
    progress,
    'model-summary',
    'Summarizing model performance',
    `Found ${labels.length} historical triggers. Now we are converting those trades into expectancy, drawdown, regime, walk-forward, and distribution analytics.`
  );
  const { summaries, curves } = buildModelSummaries(labels);
  const totalLabels = labels.length;
  const bestModel = [...summaries]
    .filter((row) => row.sampleSize > 0)
    .sort((a, b) => b.netExpectancyPct - a.netExpectancyPct || b.sampleSize - a.sampleSize)[0] || null;

  const firstPrice = dayDataset.candles[0]?.close || 0;
  const lastPrice = dayDataset.candles[dayDataset.candles.length - 1]?.close || 0;

  const dataStatus: StockLabDataStatus = {
    daySource: dayResult.source,
    minuteSource: minuteResult.dataset ? minuteResult.source : 'missing',
    benchmarkSource: benchmarkResult.source,
    dayCandleCount: dayDataset.candles.length,
    minuteCandleCount: minuteResult.dataset?.candles.length || 0,
    benchmarkCandleCount: benchmarkDataset.candles.length,
    dayFrom: dayDataset.from || null,
    dayTo: dayDataset.to || null,
    minuteFrom: minuteResult.dataset?.from || null,
    minuteTo: minuteResult.dataset?.to || null,
  };

  const currentSnapshot = await buildCurrentSnapshot({
    symbol,
    token,
    dayDataset,
    minuteDataset: minuteResult.dataset,
    benchmarkDataset,
    progress,
  });

  await emitProgress(
    progress,
    'response-assembly',
    'Assembling chart payload',
    'Packaging the backtest output into chart-ready series so the page can render the full stock lab dashboard.'
  );

  return {
    overview: {
      symbol,
      instrument: universeItem?.instrument || dayDataset.instrument,
      sector: universeItem?.sector || dayDataset.sector,
      category: universeItem?.category || dayDataset.category,
      inUniverse: Boolean(universeItem),
      analyzedAt: new Date().toISOString(),
      priceReturnPct:
        firstPrice > 0 ? Number(calculatePercentChange(lastPrice, firstPrice).toFixed(2)) : 0,
      totalLabels,
      bestModel: bestModel
        ? {
            screen: bestModel.screen,
            screenLabel: bestModel.screenLabel,
            netExpectancyPct: bestModel.netExpectancyPct,
            winRate: bestModel.winRate,
            sampleSize: bestModel.sampleSize,
          }
        : null,
    },
    dataStatus,
    currentSnapshot,
    modelSummaries: summaries,
    modelCurves: curves,
    priceSeries: buildPriceSeries(dayDataset),
    minuteCoverageSeries: buildMinuteCoverageSeries(minuteResult.dataset),
    regimeSeries: buildRegimeSeries(labels),
    walkForwardSeries: buildWalkForwardSeries(labels),
    returnBucketSeries: buildReturnBucketSeries(labels),
    recentTrades: buildRecentTrades(labels),
    notes: buildNotes({
      inUniverse: Boolean(universeItem),
      symbol,
      dataStatus,
      modelSummaries: summaries,
      totalLabels,
    }),
  };
}
