import { HistoricalDatasetFile } from '@/lib/historical/types';
import { getLatestOptionSurfaceSnapshot } from '@/lib/optionsStructure/history';
import { screenMatches } from '@/lib/screener/screens';
import { ScreenerBaseMetrics } from '@/lib/screener/types';
import { StockScreenType } from '@/lib/stockUniverse';
import { calculateAtr, calculatePercentChange, calculateRsi, calculateSma, highest, lowest } from '@/lib/stockIndicators';
import { ScreenOutcomeLabel } from '@/lib/research/types';
import { getTradePlan as getRecommendationTradePlan } from '@/lib/research/recommendation';
import { readMinuteMicrostructureBuckets } from '@/lib/microstructureCache';

const SCREENS: StockScreenType[] = ['intraday-momentum', 'swing-setups', 'mean-reversion', 'breakout-watchlist'];
const BENCHMARK_SYMBOL = 'NIFTY50_BENCHMARK';
const DEFAULT_SLIPPAGE_PCT = 0.15;
const DEFAULT_COST_PCT = 0.1;
const TRADE_PRESSURE_SUPPORT_THRESHOLD = 0.12;

function getSplit(index: number, total: number): 'train' | 'test' {
  return index / Math.max(total, 1) < 0.7 ? 'train' : 'test';
}

function getWalkForwardBucket(index: number, total: number) {
  const ratio = index / Math.max(total, 1);
  if (ratio < 0.33) return 'wf-1';
  if (ratio < 0.66) return 'wf-2';
  return 'wf-3';
}

function getRegimeFromBenchmark(benchmarkReturnPct: number): 'bullish' | 'bearish' | 'neutral' {
  if (benchmarkReturnPct >= 1) return 'bullish';
  if (benchmarkReturnPct <= -1) return 'bearish';
  return 'neutral';
}

function toBaseMetrics(dataset: HistoricalDatasetFile, index: number): ScreenerBaseMetrics | null {
  const candles = dataset.candles.slice(0, index + 1);
  if (candles.length < 55) return null;

  const current = candles[candles.length - 1];
  const previous = candles[candles.length - 2];
  const closes = candles.map((candle) => candle.close);
  const highs = candles.map((candle) => candle.high);
  const lows = candles.map((candle) => candle.low);
  const volumes = candles.map((candle) => candle.volume || 0);
  const avgVolume7Raw = volumes.slice(-8, -1).filter((value) => value > 0);
  const priorAvgVolume7Raw = volumes.slice(-15, -8).filter((value) => value > 0);
  const avgVolume20Raw = volumes.slice(-21, -1).filter((value) => value > 0);
  const breakoutLevel = highest(highs.slice(-21, -1));
  const breakdownLevel = lowest(lows.slice(-21, -1));
  const avgVolume7 =
    avgVolume7Raw.length > 0 ? avgVolume7Raw.reduce((sum, value) => sum + value, 0) / avgVolume7Raw.length : null;
  const priorAvgVolume7 =
    priorAvgVolume7Raw.length > 0
      ? priorAvgVolume7Raw.reduce((sum, value) => sum + value, 0) / priorAvgVolume7Raw.length
      : null;
  const avgVolume20 =
    avgVolume20Raw.length > 0 ? avgVolume20Raw.reduce((sum, value) => sum + value, 0) / avgVolume20Raw.length : null;

  return {
    symbol: dataset.symbol,
    instrument: dataset.instrument,
    sector: dataset.sector,
    category: dataset.category,
    lastPrice: current.close,
    previousClose: previous.close,
    openPrice: current.open,
    dayChangePct: Number(calculatePercentChange(current.close, previous.close).toFixed(2)),
    gapPct: Number(calculatePercentChange(current.open, previous.close).toFixed(2)),
    volume: current.volume || 0,
    avgVolume7: avgVolume7 ? Number(avgVolume7.toFixed(0)) : null,
    avgVolume7Compare:
      avgVolume7 && priorAvgVolume7 && priorAvgVolume7 > 0 ? Number((avgVolume7 / priorAvgVolume7).toFixed(2)) : null,
    avgVolume20: avgVolume20 ? Number(avgVolume20.toFixed(0)) : null,
    volumeExpansion: avgVolume20 && avgVolume20 > 0 ? Number(((current.volume || 0) / avgVolume20).toFixed(2)) : null,
    sma20: Number((calculateSma(closes, 20) || 0).toFixed(2)) || null,
    sma50: Number((calculateSma(closes, 50) || 0).toFixed(2)) || null,
    rsi14: Number((calculateRsi(closes, 14) || 0).toFixed(2)) || null,
    atr14: Number((calculateAtr(candles, 14) || 0).toFixed(2)) || null,
    vwap: current.close,
    microprice: null,
    micropriceEdgePct: null,
    orderFlowImbalance: null,
    rollingOfi: null,
    vpin: null,
    relativeStrength20d:
      closes.length >= 21 ? Number(calculatePercentChange(current.close, closes[closes.length - 21]).toFixed(2)) : null,
    residualAlpha20d: null,
    factorBasketAlpha20d: null,
    breakoutLevel: breakoutLevel ? Number(breakoutLevel.toFixed(2)) : null,
    breakdownLevel: breakdownLevel ? Number(breakdownLevel.toFixed(2)) : null,
    aboveVwap: true,
    deliveryDataAvailable: false,
  };
}

function getLabelTradePlan(screen: StockScreenType, metrics: ScreenerBaseMetrics) {
  const plan = getRecommendationTradePlan(screen, metrics);
  return {
    lookaheadBars: screen === 'intraday-momentum' ? 3 : screen === 'mean-reversion' ? 4 : 5,
    stopPrice: plan.stopLoss,
    targetPrice: plan.targetPrice,
  };
}

function getEntryConfirmation(
  screen: StockScreenType,
  metrics: ScreenerBaseMetrics,
  triggerBar: HistoricalDatasetFile['candles'][number],
  nextBar: HistoricalDatasetFile['candles'][number]
) {
  switch (screen) {
    case 'intraday-momentum':
      return {
        confirmed:
          nextBar.close > triggerBar.close &&
          nextBar.close >= nextBar.open &&
          nextBar.low > triggerBar.low,
        entryPrice: Math.max(nextBar.open, triggerBar.close),
        confirmation: 'Next bar continued higher and held above the signal low.',
      };
    case 'swing-setups':
      return {
        confirmed:
          (metrics.sma20 === null || nextBar.low >= metrics.sma20) &&
          nextBar.close >= triggerBar.close,
        entryPrice: Math.max(nextBar.open, triggerBar.close),
        confirmation: 'Next bar held the trend structure and closed at or above the signal close.',
      };
    case 'mean-reversion':
      return {
        confirmed:
          nextBar.close >= nextBar.open &&
          nextBar.close > triggerBar.close * 0.995,
        entryPrice: Math.max(nextBar.open, nextBar.close * 0.995),
        confirmation: 'Next bar showed rebound confirmation with a green close near or above the signal close.',
      };
    case 'breakout-watchlist':
      return {
        confirmed:
          metrics.breakoutLevel !== null &&
          nextBar.close > metrics.breakoutLevel &&
          nextBar.high > metrics.breakoutLevel &&
          (metrics.avgVolume20 === null || nextBar.volume >= metrics.avgVolume20),
        entryPrice: Math.max(nextBar.open, metrics.breakoutLevel || nextBar.open),
        confirmation: 'Next bar confirmed the breakout with a close above trigger and supportive volume.',
      };
  }
}

function evaluateOutcome(
  screen: StockScreenType,
  dataset: HistoricalDatasetFile,
  benchmarkDataset: HistoricalDatasetFile | null,
  index: number,
  metrics: ScreenerBaseMetrics
): ScreenOutcomeLabel | null {
  const plan = getLabelTradePlan(screen, metrics);
  const triggerBar = dataset.candles[index];
  const entryBar = dataset.candles[index + 1];
  if (!entryBar) return null;

  const confirmation = getEntryConfirmation(screen, metrics, triggerBar, entryBar);
  if (!confirmation.confirmed) return null;

  const entryPrice = confirmation.entryPrice;
  const atr = metrics.atr14 || Math.max(metrics.lastPrice * 0.02, 1);
  const stopDistanceMultiplier = screen === 'intraday-momentum' || screen === 'mean-reversion' ? 0.8 : 1;
  const targetDistanceMultiplier =
    screen === 'intraday-momentum' ? 1.2 : screen === 'mean-reversion' ? 1.5 : 2;
  const stopPrice = entryPrice - atr * stopDistanceMultiplier;
  const targetPrice = entryPrice + atr * targetDistanceMultiplier;

  const future = dataset.candles.slice(index + 1, index + 1 + plan.lookaheadBars);
  if (future.length < plan.lookaheadBars) return null;

  let hitTarget = false;
  let hitStop = false;

  for (const candle of future) {
    if (!hitTarget && candle.high >= targetPrice) hitTarget = true;
    if (!hitStop && candle.low <= stopPrice) hitStop = true;
    if (hitTarget || hitStop) break;
  }

  const closes = future.map((candle) => candle.close);
  const highs = future.map((candle) => candle.high);
  const lows = future.map((candle) => candle.low);
  const exitPrice = hitTarget ? targetPrice : hitStop ? stopPrice : closes[closes.length - 1];
  const totalFrictionPct = DEFAULT_SLIPPAGE_PCT + DEFAULT_COST_PCT;
  const grossReturnPct = Number(calculatePercentChange(exitPrice, entryPrice).toFixed(2));
  const netReturnPct = Number((grossReturnPct - totalFrictionPct).toFixed(2));
  const benchmarkEntry = benchmarkDataset?.candles[index + 1];
  const benchmarkExit = benchmarkDataset?.candles[index + plan.lookaheadBars];
  const benchmarkReturnPct =
    benchmarkEntry && benchmarkExit
      ? Number(calculatePercentChange(benchmarkExit.close, benchmarkEntry.close).toFixed(2))
      : 0;
  const excessReturnPct = Number((netReturnPct - benchmarkReturnPct).toFixed(2));
  const optionSurface = getLatestOptionSurfaceSnapshot(dataset.symbol, entryBar.date);

  return {
    screen,
    symbol: dataset.symbol,
    instrument: dataset.instrument,
    sector: dataset.sector,
    interval: 'day',
    tradeDate: triggerBar.date,
    entryDate: entryBar.date,
    split: getSplit(index, dataset.candles.length),
    walkForwardBucket: getWalkForwardBucket(index, dataset.candles.length),
    regime: getRegimeFromBenchmark(benchmarkReturnPct),
    lookaheadBars: plan.lookaheadBars,
    entryPrice: Number(entryPrice.toFixed(2)),
    stopPrice: Number(stopPrice.toFixed(2)),
    targetPrice: Number(targetPrice.toFixed(2)),
    confirmation: confirmation.confirmation,
    maxFavorableExcursionPct: Number(calculatePercentChange(Math.max(...highs), entryPrice).toFixed(2)),
    maxAdverseExcursionPct: Number(calculatePercentChange(Math.min(...lows), entryPrice).toFixed(2)),
    outcomeReturnPct: grossReturnPct,
    benchmarkReturnPct,
    excessReturnPct,
    netReturnPct,
    slippagePct: DEFAULT_SLIPPAGE_PCT,
    costPct: DEFAULT_COST_PCT,
    atmIv: optionSurface?.atmIv ?? null,
    nearAtmVolSkew: optionSurface?.nearAtmVolSkew ?? null,
    termStructureSlope: optionSurface?.termStructureSlope ?? null,
    volSkewRegime: (optionSurface?.volSkewRegime as 'put_fear' | 'call_chasing' | 'balanced' | 'unavailable' | undefined) ?? 'unavailable',
    gammaRegime: (optionSurface?.gammaRegime as 'stabilizing' | 'expansive' | 'neutral' | 'unavailable' | undefined) ?? 'unavailable',
    hitTarget,
    hitStop,
    win: hitTarget || (!hitStop && netReturnPct > benchmarkReturnPct),
  };
}

function getMicrostructureBias(bucket: ReturnType<typeof readMinuteMicrostructureBuckets>[number] | null) {
  if (!bucket) {
    return {
      bias: 'unavailable',
      source: 'unavailable',
    } as const;
  }

  if (bucket.averageMicropriceEdgePct !== null && bucket.averageRollingOfi !== null) {
    return {
      bias:
        bucket.averageMicropriceEdgePct > 0 && bucket.averageRollingOfi > 0
          ? 'supportive'
          : bucket.averageMicropriceEdgePct < 0 && bucket.averageRollingOfi < 0
            ? 'opposing'
            : 'mixed',
      source: 'depth',
    } as const;
  }

  const tradePressureScore = bucket.averageTradePressureScore ?? null;
  const enoughFallbackSamples = (bucket.tradePressureCount ?? 0) >= 2 || bucket.sampleCount >= 3;
  if (!enoughFallbackSamples || tradePressureScore === null) {
    return {
      bias: 'unavailable',
      source: 'unavailable',
    } as const;
  }

  return {
    bias:
      tradePressureScore >= TRADE_PRESSURE_SUPPORT_THRESHOLD
        ? 'supportive'
        : tradePressureScore <= -TRADE_PRESSURE_SUPPORT_THRESHOLD
          ? 'opposing'
          : 'mixed',
    source: 'trade_pressure',
  } as const;
}

function buildIntradayMomentumLabels(datasets: HistoricalDatasetFile[]) {
  const labels: ScreenOutcomeLabel[] = [];

  for (const dataset of datasets) {
    if (dataset.symbol === BENCHMARK_SYMBOL || dataset.interval !== 'minute' || dataset.candles.length < 90) continue;
    const microstructureMap = new Map(
      readMinuteMicrostructureBuckets(dataset.symbol).map((row) => [row.minute.slice(0, 16), row])
    );

    for (let index = 50; index < dataset.candles.length - 13; index++) {
      const window = dataset.candles.slice(0, index + 1);
      const current = window[window.length - 1];
      const previous = window[window.length - 2];
      const nextBar = dataset.candles[index + 1];
      if (!nextBar) continue;

      const closes = window.map((candle) => candle.close);
      const volumes = window.map((candle) => candle.volume || 0);
      const sma20 = calculateSma(closes, 20);
      const sma50 = calculateSma(closes, 50);
      const rsi14 = calculateRsi(closes, 14);
      const atr14 = calculateAtr(window, 14);
      const avgVolume20Raw = volumes.slice(-21, -1).filter((value) => value > 0);
      const avgVolume20 =
        avgVolume20Raw.length > 0
          ? avgVolume20Raw.reduce((sum, value) => sum + value, 0) / avgVolume20Raw.length
          : null;
      const atrScale = atr14 || Math.max(current.close * 0.003, 0.5);
      const minuteKey = current.date.slice(0, 16);
      const microstructure = microstructureMap.get(minuteKey) || null;
      const optionSurface = getLatestOptionSurfaceSnapshot(dataset.symbol, nextBar.date);
      const microstructureClassification = getMicrostructureBias(microstructure);
      const microstructureBias = microstructureClassification.bias;

      const matched = Boolean(
        sma20 !== null &&
          sma50 !== null &&
          atr14 !== null &&
          rsi14 !== null &&
          current.close > sma20 &&
          sma20 > sma50 &&
          rsi14 >= 55 &&
          rsi14 <= 78 &&
          current.close > previous.close &&
          current.volume > (avgVolume20 || 0) * 1.2 &&
          nextBar.close > current.close &&
          (microstructureBias === 'unavailable' || microstructureBias !== 'opposing')
      );

      if (!matched) continue;

      const entryPrice = Math.max(nextBar.open, current.close);
      const stopPrice = entryPrice - atrScale * 0.8;
      const targetPrice = entryPrice + atrScale * 1.2;
      const future = dataset.candles.slice(index + 1, index + 1 + 12);
      if (future.length < 12) continue;

      let hitTarget = false;
      let hitStop = false;
      for (const candle of future) {
        if (!hitTarget && candle.high >= targetPrice) hitTarget = true;
        if (!hitStop && candle.low <= stopPrice) hitStop = true;
        if (hitTarget || hitStop) break;
      }

      const exitPrice = hitTarget ? targetPrice : hitStop ? stopPrice : future[future.length - 1].close;
      const grossReturnPct = Number(calculatePercentChange(exitPrice, entryPrice).toFixed(2));
      const netReturnPct = Number((grossReturnPct - (DEFAULT_SLIPPAGE_PCT + DEFAULT_COST_PCT)).toFixed(2));

      labels.push({
        screen: 'intraday-momentum',
        symbol: dataset.symbol,
        instrument: dataset.instrument,
        sector: dataset.sector,
        interval: 'minute',
        tradeDate: current.date,
        entryDate: nextBar.date,
        split: getSplit(index, dataset.candles.length),
        walkForwardBucket: getWalkForwardBucket(index, dataset.candles.length),
        regime: netReturnPct >= 0.5 ? 'bullish' : netReturnPct <= -0.5 ? 'bearish' : 'neutral',
        lookaheadBars: 12,
        entryPrice: Number(entryPrice.toFixed(2)),
        stopPrice: Number(stopPrice.toFixed(2)),
        targetPrice: Number(targetPrice.toFixed(2)),
        confirmation: 'Minute momentum confirmed by higher close, trend alignment, and volume expansion.',
        maxFavorableExcursionPct: Number(
          calculatePercentChange(Math.max(...future.map((row) => row.high)), entryPrice).toFixed(2)
        ),
        maxAdverseExcursionPct: Number(
          calculatePercentChange(Math.min(...future.map((row) => row.low)), entryPrice).toFixed(2)
        ),
        outcomeReturnPct: grossReturnPct,
        benchmarkReturnPct: 0,
        excessReturnPct: netReturnPct,
        netReturnPct,
        slippagePct: DEFAULT_SLIPPAGE_PCT,
        costPct: DEFAULT_COST_PCT,
        micropriceEdgePct: microstructure?.averageMicropriceEdgePct ?? null,
        rollingOfi: microstructure?.averageRollingOfi ?? null,
        vpin: microstructure?.averageVpin ?? null,
        tradePressureScore: microstructure?.averageTradePressureScore ?? null,
        microstructureBias,
        microstructureSource: microstructureClassification.source,
        atmIv: optionSurface?.atmIv ?? null,
        nearAtmVolSkew: optionSurface?.nearAtmVolSkew ?? null,
        termStructureSlope: optionSurface?.termStructureSlope ?? null,
        volSkewRegime: (optionSurface?.volSkewRegime as 'put_fear' | 'call_chasing' | 'balanced' | 'unavailable' | undefined) ?? 'unavailable',
        gammaRegime: (optionSurface?.gammaRegime as 'stabilizing' | 'expansive' | 'neutral' | 'unavailable' | undefined) ?? 'unavailable',
        hitTarget,
        hitStop,
        win: netReturnPct > 0,
      });
    }
  }

  return labels;
}

export function buildOutcomeLabels(datasets: HistoricalDatasetFile[], minuteDatasets: HistoricalDatasetFile[] = []) {
  const labels: ScreenOutcomeLabel[] = [];
  const benchmarkDataset = datasets.find((dataset) => dataset.symbol === BENCHMARK_SYMBOL) || null;

  for (const dataset of datasets) {
    if (dataset.symbol === BENCHMARK_SYMBOL) continue;
    const metricsRows: ScreenerBaseMetrics[] = [];
    const indexedMetrics = new Map<number, ScreenerBaseMetrics>();

    for (let index = 54; index < dataset.candles.length - 5; index++) {
      const metrics = toBaseMetrics(dataset, index);
      if (!metrics) continue;
      metricsRows.push(metrics);
      indexedMetrics.set(index, metrics);
    }

    if (metricsRows.length === 0) continue;

    for (const screen of SCREENS) {
      for (const [index, metrics] of indexedMetrics.entries()) {
        if (!screenMatches(screen, metrics)) continue;
        const label = evaluateOutcome(screen, dataset, benchmarkDataset, index, metrics);
        if (label) {
          labels.push(label);
        }
      }
    }
  }

  return [...labels, ...buildIntradayMomentumLabels(minuteDatasets)];
}
