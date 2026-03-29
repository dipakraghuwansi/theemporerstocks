import { HistoricalCandle } from '@/lib/historical/types';
import { readDataset } from '@/lib/historical/cache';
import {
  MODEL_PORTFOLIO_BACKTEST,
  MODEL_PORTFOLIO_BASE_CAPITAL,
  MODEL_PORTFOLIO_ID,
  MODEL_PORTFOLIO_PERFORMANCE_HISTORY_LIMIT,
  MODEL_PORTFOLIO_SCREEN_UNIVERSE,
} from '@/lib/modelPortfolio/config';
import { buildModelPortfolioCandidates } from '@/lib/modelPortfolio/scoring';
import { getModelPortfolioPerformance, saveModelPortfolioPerformance } from '@/lib/modelPortfolio/store';
import {
  ModelPortfolioPerformanceAttribution,
  ModelPortfolioPerformanceComparison,
  ModelPortfolioPerformanceMetrics,
  ModelPortfolioPerformancePoint,
  ModelPortfolioPerformanceSummary,
  ModelPortfolioWeightPlan,
} from '@/lib/modelPortfolio/types';
import { buildTargetWeights } from '@/lib/modelPortfolio/weights';
import { readResearchManifest } from '@/lib/research/cache';
import { buildResearchManifest, getProbabilityEstimate } from '@/lib/research/stats';
import { ResearchManifest } from '@/lib/research/types';
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
} from '@/lib/screenerScoring';
import {
  average,
  calculateAtr,
  calculatePercentChange,
  calculateRsi,
  calculateSma,
  highest,
  lowest,
} from '@/lib/stockIndicators';
import { SCREEN_LABELS } from '@/lib/stockUniverse';
import { getStockUniverse } from '@/lib/stockUniverseStore';

type HistoricalUniverseRow = ReturnType<typeof getStockUniverse>[number] & {
  candles: HistoricalCandle[];
  dateIndex: Map<string, number>;
};

type InternalHistoricalMetrics = ScreenerBaseMetrics & {
  __rawStockReturn20d: number | null;
  __rawResidualAlpha20d: number | null;
  __rawVolatilityAdjustedReturn20d: number | null;
};

type StrategyState = {
  nav: number;
  cash: number;
  holdings: Map<string, { value: number; sector: string }>;
  latestWeights: Map<string, number>;
  latestPlan: ModelPortfolioWeightPlan | null;
};

function createId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function getDateKey(value: string) {
  return value.slice(0, 10);
}

function percentile(sortedValues: number[], fraction: number) {
  if (sortedValues.length === 0) return 0;
  const index = Math.max(0, Math.min(sortedValues.length - 1, Math.floor((sortedValues.length - 1) * fraction)));
  return sortedValues[index];
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

  const meanStock = average(stockReturns) || 0;
  const meanBenchmark = average(benchmarkReturns) || 0;
  const covariance =
    stockReturns.reduce((sum, value, index) => sum + (value - meanStock) * (benchmarkReturns[index] - meanBenchmark), 0) /
    stockReturns.length;
  const variance =
    benchmarkReturns.reduce((sum, value) => sum + (value - meanBenchmark) ** 2, 0) / benchmarkReturns.length;

  return variance > 0 ? covariance / variance : null;
}

function calculateVolatilityAdjustedReturn(closes: number[], atr: number | null) {
  if (closes.length < 21) return null;
  const rawReturn = calculatePercentChange(closes[closes.length - 1], closes[closes.length - 21]);
  if (!atr || atr <= 0) return rawReturn;
  const atrPct = (atr / closes[closes.length - 1]) * 100;
  return atrPct > 0 ? rawReturn / atrPct : rawReturn;
}

function loadHistoricalUniverse() {
  const universe = getStockUniverse();
  return universe
    .map((item) => {
      const dataset = readDataset('day', item.symbol);
      const candles = dataset?.candles || [];
      if (candles.length < MODEL_PORTFOLIO_BACKTEST.warmupDays + 25) return null;
      return {
        ...item,
        candles,
        dateIndex: new Map(candles.map((candle, index) => [getDateKey(candle.date), index])),
      } satisfies HistoricalUniverseRow;
    })
    .filter((item): item is HistoricalUniverseRow => Boolean(item));
}

function buildHistoricalBaseMetrics(
  universeRows: HistoricalUniverseRow[],
  benchmarkCloses: number[],
  benchmarkDateKey: string
) {
  const rawRows: InternalHistoricalMetrics[] = [];

  for (const item of universeRows) {
    const dateIndex = item.dateIndex.get(benchmarkDateKey);
    if (dateIndex === undefined || dateIndex < 51) continue;

    const dailyCandles = item.candles.slice(0, dateIndex + 1);
    const closes = dailyCandles.map((candle) => candle.close);
    const highs = dailyCandles.map((candle) => candle.high);
    const lows = dailyCandles.map((candle) => candle.low);
    const volumes = dailyCandles.map((candle) => candle.volume || 0);
    const currentCandle = dailyCandles[dailyCandles.length - 1];
    const previousCandle = dailyCandles[dailyCandles.length - 2];
    if (!previousCandle) continue;

    const previous20Volumes = volumes.slice(-21, -1).filter((value) => value > 0);
    const previous7Volumes = volumes.slice(-8, -1).filter((value) => value > 0);
    const prior7Volumes = volumes.slice(-15, -8).filter((value) => value > 0);
    const previous20Highs = highs.slice(-21, -1);
    const previous20Lows = lows.slice(-21, -1);
    const benchmark20 = benchmarkCloses.slice(-21);
    const stock20 = closes.slice(-21);

    const avgVolume7 = average(previous7Volumes);
    const priorAvgVolume7 = average(prior7Volumes);
    const avgVolume7Compare =
      avgVolume7 && priorAvgVolume7 && priorAvgVolume7 > 0 ? avgVolume7 / priorAvgVolume7 : null;
    const avgVolume20 = average(previous20Volumes);
    const volumeExpansion = avgVolume20 && avgVolume20 > 0 ? currentCandle.volume / avgVolume20 : null;
    const sma20 = calculateSma(closes, 20);
    const sma50 = calculateSma(closes, 50);
    const rsi14 = calculateRsi(closes, 14);
    const atr14 = calculateAtr(dailyCandles, 14);
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

    rawRows.push({
      symbol: item.symbol,
      instrument: item.instrument,
      sector: item.sector,
      category: item.category,
      lastPrice: currentCandle.close,
      previousClose: previousCandle.close,
      openPrice: currentCandle.open,
      dayChangePct: Number(calculatePercentChange(currentCandle.close, previousCandle.close).toFixed(2)),
      gapPct: Number(calculatePercentChange(currentCandle.open, previousCandle.close).toFixed(2)),
      volume: currentCandle.volume || 0,
      avgVolume7: avgVolume7 ? Number(avgVolume7.toFixed(0)) : null,
      avgVolume7Compare: avgVolume7Compare ? Number(avgVolume7Compare.toFixed(2)) : null,
      avgVolume20: avgVolume20 ? Number(avgVolume20.toFixed(0)) : null,
      volumeExpansion: volumeExpansion ? Number(volumeExpansion.toFixed(2)) : null,
      sma20: sma20 ? Number(sma20.toFixed(2)) : null,
      sma50: sma50 ? Number(sma50.toFixed(2)) : null,
      rsi14: rsi14 ? Number(rsi14.toFixed(2)) : null,
      atr14: atr14 ? Number(atr14.toFixed(2)) : null,
      vwap: null,
      microprice: null,
      micropriceEdgePct: null,
      orderFlowImbalance: null,
      rollingOfi: null,
      vpin: null,
      beta20: beta20 !== null ? Number(beta20.toFixed(3)) : null,
      relativeStrength20d: relativeStrength20d !== null ? Number(relativeStrength20d.toFixed(2)) : null,
      residualAlpha20d: rawResidualAlpha !== null ? Number(rawResidualAlpha.toFixed(2)) : null,
      factorBasketAlpha20d:
        volatilityAdjustedReturn !== null ? Number(volatilityAdjustedReturn.toFixed(2)) : null,
      breakoutLevel: breakoutLevel ? Number(breakoutLevel.toFixed(2)) : null,
      breakdownLevel: breakdownLevel ? Number(breakdownLevel.toFixed(2)) : null,
      aboveVwap: false,
      deliveryDataAvailable: false,
      __rawStockReturn20d: stockReturn20 !== null ? Number(stockReturn20.toFixed(2)) : null,
      __rawResidualAlpha20d: rawResidualAlpha !== null ? Number(rawResidualAlpha.toFixed(2)) : null,
      __rawVolatilityAdjustedReturn20d:
        volatilityAdjustedReturn !== null ? Number(volatilityAdjustedReturn.toFixed(2)) : null,
    });
  }

  const sectorResidualReturns = new Map<string, number[]>();
  const categoryResidualReturns = new Map<string, number[]>();
  const sectorRawReturns = new Map<string, number[]>();
  const categoryRawReturns = new Map<string, number[]>();
  const sectorFactorReturns = new Map<string, number[]>();
  const categoryFactorReturns = new Map<string, number[]>();

  for (const item of rawRows) {
    if (item.__rawResidualAlpha20d !== null) {
      const sectorResidual = sectorResidualReturns.get(item.sector) || [];
      sectorResidual.push(item.__rawResidualAlpha20d);
      sectorResidualReturns.set(item.sector, sectorResidual);
      const categoryResidual = categoryResidualReturns.get(item.category) || [];
      categoryResidual.push(item.__rawResidualAlpha20d);
      categoryResidualReturns.set(item.category, categoryResidual);
    }
    if (item.__rawStockReturn20d !== null) {
      const sectorRaw = sectorRawReturns.get(item.sector) || [];
      sectorRaw.push(item.__rawStockReturn20d);
      sectorRawReturns.set(item.sector, sectorRaw);
      const categoryRaw = categoryRawReturns.get(item.category) || [];
      categoryRaw.push(item.__rawStockReturn20d);
      categoryRawReturns.set(item.category, categoryRaw);
    }
    if (item.__rawVolatilityAdjustedReturn20d !== null) {
      const sectorFactor = sectorFactorReturns.get(item.sector) || [];
      sectorFactor.push(item.__rawVolatilityAdjustedReturn20d);
      sectorFactorReturns.set(item.sector, sectorFactor);
      const categoryFactor = categoryFactorReturns.get(item.category) || [];
      categoryFactor.push(item.__rawVolatilityAdjustedReturn20d);
      categoryFactorReturns.set(item.category, categoryFactor);
    }
  }

  return rawRows.map((item) => {
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

    const {
      __rawStockReturn20d,
      __rawResidualAlpha20d,
      __rawVolatilityAdjustedReturn20d,
      ...cleanItem
    } = item;
    void __rawStockReturn20d;
    void __rawResidualAlpha20d;
    void __rawVolatilityAdjustedReturn20d;

    return {
      ...cleanItem,
      residualAlpha20d:
        residualComposite !== null ? Number((residualComposite - (residualBaseline || 0)).toFixed(2)) : null,
      factorBasketAlpha20d:
        factorComposite !== null ? Number((factorComposite - (factorBasketBaseline || 0)).toFixed(2)) : null,
    } satisfies ScreenerBaseMetrics;
  });
}

function buildSectorSnapshotRows(results: ScreenerBaseMetrics[]) {
  return Object.values(buildSectorContext(results)).map((row) => ({
    sector: row.sector,
    breadthPct: row.breadthPct,
    aboveSma20Pct: row.aboveSma20Pct,
    avgDayChangePct: row.avgDayChangePct,
    generatedAt: '',
  }));
}

function getManifestAsOf(
  manifest: ResearchManifest | null,
  asOf: string,
  cache: Map<string, ResearchManifest | null>
) {
  const dateKey = getDateKey(asOf);
  const cached = cache.get(dateKey);
  if (cached !== undefined) return cached;
  if (!manifest) {
    cache.set(dateKey, null);
    return null;
  }

  const filteredLabels = manifest.labels.filter((label) => getDateKey(label.entryDate) < dateKey);
  const nextManifest = filteredLabels.length > 0 ? buildResearchManifest(filteredLabels) : null;
  cache.set(dateKey, nextManifest);
  return nextManifest;
}

function computeTurnover(nextWeights: Map<string, number>, previousWeights: Map<string, number>) {
  const symbols = new Set([...nextWeights.keys(), ...previousWeights.keys()]);
  let turnover = 0;
  for (const symbol of symbols) {
    turnover += Math.abs((nextWeights.get(symbol) || 0) - (previousWeights.get(symbol) || 0));
  }
  return Number((turnover * 100).toFixed(2));
}

function allocateStrategy(
  nav: number,
  weightPlan: ModelPortfolioWeightPlan
) {
  const holdings = new Map<string, { value: number; sector: string }>();
  const latestWeights = new Map<string, number>();

  for (const selection of weightPlan.selections) {
    holdings.set(selection.candidate.symbol, {
      value: nav * selection.targetWeight,
      sector: selection.candidate.sector,
    });
    latestWeights.set(selection.candidate.symbol, selection.targetWeight);
  }

  return {
    nav,
    cash: nav * weightPlan.targetCashWeight,
    holdings,
    latestWeights,
    latestPlan: weightPlan,
  } satisfies StrategyState;
}

function getDailyReturn(row: HistoricalUniverseRow, fromDateKey: string, toDateKey: string) {
  const fromIndex = row.dateIndex.get(fromDateKey);
  const toIndex = row.dateIndex.get(toDateKey);
  if (fromIndex === undefined || toIndex === undefined) return 0;
  const fromCandle = row.candles[fromIndex];
  const toCandle = row.candles[toIndex];
  if (!fromCandle || !toCandle || fromCandle.close <= 0) return 0;
  return (toCandle.close - fromCandle.close) / fromCandle.close;
}

function applyStrategyDay(
  state: StrategyState,
  fromDateKey: string,
  toDateKey: string,
  universeMap: Map<string, HistoricalUniverseRow>,
  sectorContributionMap: Map<string, number>,
  sectorWeightMap: Map<string, number>
) {
  const startingNav = state.nav;
  let holdingsValue = 0;

  for (const [symbol, holding] of state.holdings.entries()) {
    const row = universeMap.get(symbol);
    if (!row) continue;
    const weight = startingNav > 0 ? holding.value / startingNav : 0;
    const dailyReturn = getDailyReturn(row, fromDateKey, toDateKey);
    sectorContributionMap.set(holding.sector, (sectorContributionMap.get(holding.sector) || 0) + weight * dailyReturn * 100);
    sectorWeightMap.set(holding.sector, (sectorWeightMap.get(holding.sector) || 0) + weight * 100);
    holding.value *= 1 + dailyReturn;
    holdingsValue += holding.value;
  }

  state.nav = Number((state.cash + holdingsValue).toFixed(2));
  return startingNav > 0 ? (state.nav - startingNav) / startingNav : 0;
}

function computeMaxDrawdown(navSeries: number[]) {
  let peak = 0;
  let drawdown = 0;
  for (const nav of navSeries) {
    peak = Math.max(peak, nav);
    if (peak > 0) {
      drawdown = Math.min(drawdown, (nav - peak) / peak);
    }
  }
  return Number(Math.abs(drawdown * 100).toFixed(2));
}

function annualizeReturn(totalReturn: number, periods: number) {
  if (periods <= 0) return 0;
  return (Math.pow(1 + totalReturn, MODEL_PORTFOLIO_BACKTEST.annualTradingDays / periods) - 1) * 100;
}

function standardDeviation(values: number[]) {
  if (values.length <= 1) return 0;
  const mean = average(values);
  if (mean === null) return 0;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function buildPerformanceMetrics(params: {
  baseCapital: number;
  series: ModelPortfolioPerformancePoint[];
  strategyDailyReturns: number[];
  avgHoldingPeriodDays: number;
  avgMonthlyTurnoverPct: number;
  residualAlphaAttributionPct: number;
  rebalanceCount: number;
}) {
  const {
    baseCapital,
    series,
    strategyDailyReturns,
    avgHoldingPeriodDays,
    avgMonthlyTurnoverPct,
    residualAlphaAttributionPct,
    rebalanceCount,
  } = params;
  const finalPoint = series[series.length - 1];
  const totalReturn = finalPoint ? finalPoint.nav / baseCapital - 1 : 0;
  const benchmarkReturn = finalPoint ? finalPoint.benchmarkNav / baseCapital - 1 : 0;
  const excessReturn = totalReturn - benchmarkReturn;
  const volatility = standardDeviation(strategyDailyReturns) * Math.sqrt(MODEL_PORTFOLIO_BACKTEST.annualTradingDays) * 100;
  const downside = standardDeviation(strategyDailyReturns.filter((value) => value < 0)) * Math.sqrt(MODEL_PORTFOLIO_BACKTEST.annualTradingDays) * 100;
  const riskFreeRate = MODEL_PORTFOLIO_BACKTEST.riskFreeRatePct / 100;
  const annualizedReturn = annualizeReturn(totalReturn, strategyDailyReturns.length);
  const excessAnnualized = annualizedReturn / 100 - riskFreeRate;
  const sharpe = volatility > 0 ? excessAnnualized / (volatility / 100) : 0;
  const sortino = downside > 0 ? excessAnnualized / (downside / 100) : 0;
  const positiveReturns = strategyDailyReturns.filter((value) => value > 0);
  const negativeReturns = strategyDailyReturns.filter((value) => value < 0);
  const profitFactor =
    negativeReturns.length > 0
      ? positiveReturns.reduce((sum, value) => sum + value, 0) /
        Math.abs(negativeReturns.reduce((sum, value) => sum + value, 0))
      : positiveReturns.length > 0
        ? 99
        : 0;

  return {
    totalReturnPct: Number((totalReturn * 100).toFixed(2)),
    benchmarkReturnPct: Number((benchmarkReturn * 100).toFixed(2)),
    excessReturnPct: Number((excessReturn * 100).toFixed(2)),
    cagrPct: Number(annualizedReturn.toFixed(2)),
    annualizedVolatilityPct: Number(volatility.toFixed(2)),
    sharpe: Number(sharpe.toFixed(2)),
    sortino: Number(sortino.toFixed(2)),
    maxDrawdownPct: computeMaxDrawdown(series.map((point) => point.nav)),
    hitRatePct:
      strategyDailyReturns.length > 0
        ? Number(((positiveReturns.length / strategyDailyReturns.length) * 100).toFixed(1))
        : 0,
    profitFactor: Number(profitFactor.toFixed(2)),
    avgHoldingPeriodDays: Number(avgHoldingPeriodDays.toFixed(1)),
    avgMonthlyTurnoverPct: Number(avgMonthlyTurnoverPct.toFixed(2)),
    realizedVolatilityPct: Number(volatility.toFixed(2)),
    latestVar95Pct: finalPoint?.rollingVar95Pct || 0,
    latestCvar95Pct: finalPoint?.rollingCvar95Pct || 0,
    residualAlphaAttributionPct: Number(residualAlphaAttributionPct.toFixed(2)),
    rebalanceCount,
  } satisfies ModelPortfolioPerformanceMetrics;
}

function buildComparisons(
  baseCapital: number,
  lastPoint: ModelPortfolioPerformancePoint | undefined
): ModelPortfolioPerformanceComparison[] {
  if (!lastPoint) return [];

  const comparisons = [
    { key: 'benchmark', label: 'NIFTY 50 Benchmark', nav: lastPoint.benchmarkNav },
    { key: 'equal_weight', label: 'Equal-Weight Universe', nav: lastPoint.equalWeightNav },
    { key: 'no_regime', label: 'No Regime Scaling', nav: lastPoint.noRegimeNav },
    { key: 'uncapped', label: 'No Risk Caps', nav: lastPoint.uncappedNav },
  ] as const;

  const mainReturnPct = (lastPoint.nav / baseCapital - 1) * 100;

  return comparisons.map((comparison) => {
    const totalReturnPct = (comparison.nav / baseCapital - 1) * 100;
    return {
      key: comparison.key,
      label: comparison.label,
      endingNav: Number(comparison.nav.toFixed(2)),
      totalReturnPct: Number(totalReturnPct.toFixed(2)),
      excessReturnPct: Number((mainReturnPct - totalReturnPct).toFixed(2)),
    } satisfies ModelPortfolioPerformanceComparison;
  });
}

export async function computeModelPortfolioPerformanceSummary() {
  const generatedAt = nowIso();
  const existing = await getModelPortfolioPerformance(MODEL_PORTFOLIO_ID);
  const universeRows = loadHistoricalUniverse();
  const benchmarkDataset = readDataset('day', 'NIFTY50_BENCHMARK');
  const benchmarkCandles = benchmarkDataset?.candles || [];
  if (benchmarkCandles.length < MODEL_PORTFOLIO_BACKTEST.warmupDays + 25) {
    throw new Error('NIFTY50_BENCHMARK day history is required before running the portfolio backtest.');
  }
  if (universeRows.length === 0) {
    throw new Error('No eligible historical datasets were available for the portfolio backtest.');
  }

  const benchmarkCloses = benchmarkCandles.map((candle) => candle.close);
  const startIndex = Math.max(
    MODEL_PORTFOLIO_BACKTEST.warmupDays,
    benchmarkCandles.length - MODEL_PORTFOLIO_BACKTEST.lookbackDays
  );
  const rebalanceIndices: number[] = [];
  for (let index = startIndex; index < benchmarkCandles.length - 1; index += MODEL_PORTFOLIO_BACKTEST.rebalanceEveryBars) {
    rebalanceIndices.push(index);
  }
  const lastTradableIndex = benchmarkCandles.length - 2;
  if (rebalanceIndices[rebalanceIndices.length - 1] !== lastTradableIndex) {
    rebalanceIndices.push(lastTradableIndex);
  }

  const researchManifest = readResearchManifest();
  const manifestCache = new Map<string, ResearchManifest | null>();
  const universeMap = new Map(universeRows.map((row) => [row.symbol, row]));
  const sectorContributionMap = new Map<string, number>();
  const sectorWeightMap = new Map<string, number>();
  const strategyDailyReturns: number[] = [];
  const benchmarkDailyReturns: number[] = [];
  const series: ModelPortfolioPerformancePoint[] = [];
  const holdingDurations: number[] = [];
  const openHoldingDates = new Map<string, string>();

  let mainState: StrategyState = {
    nav: MODEL_PORTFOLIO_BASE_CAPITAL,
    cash: MODEL_PORTFOLIO_BASE_CAPITAL,
    holdings: new Map(),
    latestWeights: new Map(),
    latestPlan: null,
  };
  let noRegimeState: StrategyState = { ...mainState, holdings: new Map(), latestWeights: new Map(), latestPlan: null };
  let uncappedState: StrategyState = { ...mainState, holdings: new Map(), latestWeights: new Map(), latestPlan: null };
  let equalWeightNav = MODEL_PORTFOLIO_BASE_CAPITAL;
  let benchmarkNav = MODEL_PORTFOLIO_BASE_CAPITAL;
  let peakNav = MODEL_PORTFOLIO_BASE_CAPITAL;
  let benchmarkPeak = MODEL_PORTFOLIO_BASE_CAPITAL;
  let turnoverSum = 0;
  let weightedResidualAlphaSum = 0;
  let optimizerCoverageSum = 0;
  let optimizerCorrelationSum = 0;
  let optimizerSnapshots = 0;

  for (let rebalancePosition = 0; rebalancePosition < rebalanceIndices.length; rebalancePosition += 1) {
    const rebalanceIndex = rebalanceIndices[rebalancePosition];
    const rebalanceDateKey = getDateKey(benchmarkCandles[rebalanceIndex].date);
    const nextRebalanceIndex =
      rebalanceIndices[rebalancePosition + 1] !== undefined ? rebalanceIndices[rebalancePosition + 1] : benchmarkCandles.length - 1;

    const baseMetrics = buildHistoricalBaseMetrics(
      universeRows,
      benchmarkCloses.slice(0, rebalanceIndex + 1),
      rebalanceDateKey
    );
    if (baseMetrics.length === 0) continue;

    const previousSectorSnapshot =
      rebalanceIndex > 0
        ? buildSectorSnapshotRows(
            buildHistoricalBaseMetrics(
              universeRows,
              benchmarkCloses.slice(0, rebalanceIndex),
              getDateKey(benchmarkCandles[rebalanceIndex - 1].date)
            )
          )
        : [];
    const sectorContext = applySectorSnapshot(buildSectorContext(baseMetrics), previousSectorSnapshot);
    const regime = buildRegime(baseMetrics, benchmarkCloses.slice(0, rebalanceIndex + 1), benchmarkCloses[rebalanceIndex]);
    const asOfManifest = getManifestAsOf(researchManifest, benchmarkCandles[rebalanceIndex].date, manifestCache);
    const calibrationContext = buildCalibrationContext(asOfManifest);
    const scorePayload = createScreenerScorePayload(baseMetrics, sectorContext, {}, regime, calibrationContext);
    const scoredScreens = MODEL_PORTFOLIO_SCREEN_UNIVERSE.map((screen) => {
      const results = baseMetrics
        .filter((item) => screenMatches(screen, item))
        .map((item) =>
          scoreScreenerResult(screen, item, scorePayload, getProbabilityEstimate(asOfManifest, screen, item.symbol))
        )
        .sort((a, b) => b.score - a.score);
      return {
        screen,
        screenLabel: SCREEN_LABELS[screen],
        scorePayload,
        results,
      } satisfies {
        screen: (typeof MODEL_PORTFOLIO_SCREEN_UNIVERSE)[number];
        screenLabel: string;
        scorePayload: typeof scorePayload;
        results: ScreenerScoredResult[];
      };
    });

    const candidates = buildModelPortfolioCandidates(scoredScreens);
    const mainPlan = buildTargetWeights(candidates, regime.name, {
      asOf: benchmarkCandles[rebalanceIndex].date,
      currentSymbols: Array.from(mainState.latestWeights.keys()),
    });
    const noRegimePlan = buildTargetWeights(candidates, regime.name, {
      asOf: benchmarkCandles[rebalanceIndex].date,
      currentSymbols: Array.from(noRegimeState.latestWeights.keys()),
      targetGrossExposureOverride: 1,
    });
    const uncappedPlan = buildTargetWeights(candidates, regime.name, {
      asOf: benchmarkCandles[rebalanceIndex].date,
      currentSymbols: Array.from(uncappedState.latestWeights.keys()),
      skipCaps: true,
      targetGrossExposureOverride: 1,
    });

    const nextWeights = new Map(mainPlan.selections.map((selection) => [selection.candidate.symbol, selection.targetWeight]));
    const turnoverPct = computeTurnover(nextWeights, mainState.latestWeights);
    turnoverSum += turnoverPct;
    weightedResidualAlphaSum += mainPlan.selections.reduce(
      (sum, selection) => sum + selection.targetWeight * (selection.candidate.screenerResult.residualAlpha20d || 0),
      0
    );
    optimizerCoverageSum += mainPlan.optimizerDiagnostics.coveragePct;
    optimizerCorrelationSum += mainPlan.optimizerDiagnostics.avgPairCorrelation;
    optimizerSnapshots += 1;

    const currentSymbols = new Set(mainState.latestWeights.keys());
    const nextSymbols = new Set(nextWeights.keys());
    for (const symbol of currentSymbols) {
      if (!nextSymbols.has(symbol)) {
        const enteredAt = openHoldingDates.get(symbol);
        if (enteredAt) {
          const startIndexForHolding = benchmarkCandles.findIndex((candle) => getDateKey(candle.date) === enteredAt);
          if (startIndexForHolding >= 0) {
            holdingDurations.push(rebalanceIndex - startIndexForHolding);
          }
        }
        openHoldingDates.delete(symbol);
      }
    }
    const effectiveEntryDate = getDateKey(benchmarkCandles[Math.min(rebalanceIndex + 1, benchmarkCandles.length - 1)].date);
    for (const symbol of nextSymbols) {
      if (!openHoldingDates.has(symbol)) {
        openHoldingDates.set(symbol, effectiveEntryDate);
      }
    }

    mainState = allocateStrategy(mainState.nav, mainPlan);
    noRegimeState = allocateStrategy(noRegimeState.nav, noRegimePlan);
    uncappedState = allocateStrategy(uncappedState.nav, uncappedPlan);

    for (let dayIndex = rebalanceIndex; dayIndex < nextRebalanceIndex; dayIndex += 1) {
      const fromDateKey = getDateKey(benchmarkCandles[dayIndex].date);
      const toDateKey = getDateKey(benchmarkCandles[dayIndex + 1].date);
      const mainReturn = applyStrategyDay(mainState, fromDateKey, toDateKey, universeMap, sectorContributionMap, sectorWeightMap);
      applyStrategyDay(noRegimeState, fromDateKey, toDateKey, universeMap, new Map(), new Map());
      applyStrategyDay(uncappedState, fromDateKey, toDateKey, universeMap, new Map(), new Map());

      const benchmarkReturn = benchmarkCandles[dayIndex].close > 0
        ? (benchmarkCandles[dayIndex + 1].close - benchmarkCandles[dayIndex].close) / benchmarkCandles[dayIndex].close
        : 0;
      const equalWeightReturns = universeRows
        .map((row) => getDailyReturn(row, fromDateKey, toDateKey))
        .filter((value) => Number.isFinite(value));
      const equalWeightReturn = average(equalWeightReturns) || 0;

      strategyDailyReturns.push(mainReturn);
      benchmarkDailyReturns.push(benchmarkReturn);
      benchmarkNav = Number((benchmarkNav * (1 + benchmarkReturn)).toFixed(2));
      equalWeightNav = Number((equalWeightNav * (1 + equalWeightReturn)).toFixed(2));

      peakNav = Math.max(peakNav, mainState.nav);
      benchmarkPeak = Math.max(benchmarkPeak, benchmarkNav);

      const trailingReturns = strategyDailyReturns.slice(-60).sort((a, b) => a - b);
      const var95Pct = Math.max(0, -percentile(trailingReturns, 0.05) * 100);
      const tail = trailingReturns.filter((value) => value <= percentile(trailingReturns, 0.05));
      const cvar95Pct = Math.max(0, -(average(tail) || 0) * 100);

      series.push({
        asOf: benchmarkCandles[dayIndex + 1].date,
        nav: Number(mainState.nav.toFixed(2)),
        benchmarkNav: Number(benchmarkNav.toFixed(2)),
        equalWeightNav: Number(equalWeightNav.toFixed(2)),
        noRegimeNav: Number(noRegimeState.nav.toFixed(2)),
        uncappedNav: Number(uncappedState.nav.toFixed(2)),
        drawdownPct: Number((peakNav > 0 ? ((peakNav - mainState.nav) / peakNav) * 100 : 0).toFixed(2)),
        benchmarkDrawdownPct: Number(
          (benchmarkPeak > 0 ? ((benchmarkPeak - benchmarkNav) / benchmarkPeak) * 100 : 0).toFixed(2)
        ),
        dayReturnPct: Number((mainReturn * 100).toFixed(2)),
        benchmarkDayReturnPct: Number((benchmarkReturn * 100).toFixed(2)),
        rollingVar95Pct: Number(var95Pct.toFixed(2)),
        rollingCvar95Pct: Number(cvar95Pct.toFixed(2)),
        grossExposure: Number((mainState.nav > 0 ? ((mainState.nav - mainState.cash) / mainState.nav) * 100 : 0).toFixed(2)),
        holdingsCount: mainState.holdings.size,
        turnoverPct: dayIndex === rebalanceIndex ? turnoverPct : 0,
        regime: regime.name,
      });
    }
  }

  const finalDateKey = series[series.length - 1]?.asOf ? getDateKey(series[series.length - 1].asOf) : null;
  if (finalDateKey) {
    const finalIndex = benchmarkCandles.findIndex((candle) => getDateKey(candle.date) === finalDateKey);
    for (const [symbol, enteredAt] of openHoldingDates.entries()) {
      const startIndexForHolding = benchmarkCandles.findIndex((candle) => getDateKey(candle.date) === enteredAt);
      if (startIndexForHolding >= 0 && finalIndex >= startIndexForHolding) {
        holdingDurations.push(finalIndex - startIndexForHolding);
      }
      openHoldingDates.delete(symbol);
    }
  }

  const dayCount = Math.max(series.length, 1);
  const sectorAttribution = Array.from(sectorContributionMap.entries())
    .map(([sector, contributionPct]) => ({
      sector,
      contributionPct: Number(contributionPct.toFixed(2)),
      avgWeightPct: Number(((sectorWeightMap.get(sector) || 0) / dayCount).toFixed(2)),
    }))
    .sort((a, b) => b.contributionPct - a.contributionPct)
    .slice(0, MODEL_PORTFOLIO_PERFORMANCE_HISTORY_LIMIT) satisfies ModelPortfolioPerformanceAttribution[];

  const metrics = buildPerformanceMetrics({
    baseCapital: MODEL_PORTFOLIO_BASE_CAPITAL,
    series,
    strategyDailyReturns,
    avgHoldingPeriodDays: holdingDurations.length > 0 ? (average(holdingDurations) || 0) : 0,
    avgMonthlyTurnoverPct:
      strategyDailyReturns.length > 0
        ? (turnoverSum / Math.max(1, strategyDailyReturns.length / 21))
        : 0,
    residualAlphaAttributionPct: optimizerSnapshots > 0 ? weightedResidualAlphaSum / optimizerSnapshots : 0,
    rebalanceCount: rebalanceIndices.length,
  });

  const summary: ModelPortfolioPerformanceSummary = {
    id: existing?.id || createId('model_performance'),
    portfolioId: MODEL_PORTFOLIO_ID,
    generatedAt,
    asOf: series[series.length - 1]?.asOf || generatedAt,
    lookbackDays: MODEL_PORTFOLIO_BACKTEST.lookbackDays,
    rebalanceFrequency: 'WEEKLY',
    optimizerDiagnostics: {
      enabled: true,
      covarianceLookbackDays: mainState.latestPlan?.optimizerDiagnostics.covarianceLookbackDays || 0,
      shrinkage: mainState.latestPlan?.optimizerDiagnostics.shrinkage || 0,
      coveragePct: Number((optimizerSnapshots > 0 ? optimizerCoverageSum / optimizerSnapshots : 0).toFixed(1)),
      avgPairCorrelation: Number((optimizerSnapshots > 0 ? optimizerCorrelationSum / optimizerSnapshots : 0).toFixed(3)),
      turnoverPenaltyApplied: true,
    },
    metrics,
    comparisons: buildComparisons(MODEL_PORTFOLIO_BASE_CAPITAL, series[series.length - 1]),
    sectorAttribution,
    series,
    notes: [
      'Walk-forward replay uses cached daily history and only research labels dated before each rebalance. This avoids using future labels in the evidence layer.',
      'Historical options and microstructure overlays stay neutral when date-aligned history is unavailable, so the backtest is intentionally more conservative than the live scorer.',
      'Optimizer refinement is a shrinkage-covariance heuristic layered on top of the conviction draft. It is a constrained refinement, not a full quadratic-program solver.',
    ],
  };

  await saveModelPortfolioPerformance(summary);
  return summary;
}

export async function getModelPortfolioPerformanceSummary(forceRecompute = false) {
  if (!forceRecompute) {
    const cached = await getModelPortfolioPerformance(MODEL_PORTFOLIO_ID);
    if (cached) return cached;
  }

  return computeModelPortfolioPerformanceSummary();
}
