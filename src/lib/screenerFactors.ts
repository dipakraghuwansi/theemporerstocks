export type ScreenerFactorKey =
  | 'dayMoveAtr'
  | 'gapMoveAtr'
  | 'vwapDistanceAtr'
  | 'micropriceEdgePct'
  | 'rollingOfi'
  | 'breakoutDistanceAtr'
  | 'breakdownDistanceAtr'
  | 'sma20DistanceAtr'
  | 'sma50DistanceAtr'
  | 'relativeStrength20d'
  | 'residualAlpha20d'
  | 'factorBasketAlpha20d'
  | 'volumeExpansionLog'
  | 'rsi14';

export interface ScreenerDerivedFactors {
  dayMoveAtr: number | null;
  gapMoveAtr: number | null;
  vwapDistanceAtr: number | null;
  micropriceEdgePct: number | null;
  rollingOfi: number | null;
  breakoutDistanceAtr: number | null;
  breakdownDistanceAtr: number | null;
  sma20DistanceAtr: number | null;
  sma50DistanceAtr: number | null;
  relativeStrength20d: number | null;
  residualAlpha20d: number | null;
  factorBasketAlpha20d: number | null;
  volumeExpansionLog: number | null;
  rsi14: number | null;
}

export interface ScreenerFactorStats {
  mean: number;
  stdDev: number;
  min: number;
  max: number;
  count: number;
}

export type ScreenerFactorContext = Record<ScreenerFactorKey, ScreenerFactorStats | null>;

interface FactorInput {
  lastPrice: number;
  previousClose: number;
  openPrice: number;
  volumeExpansion: number | null;
  sma20: number | null;
  sma50: number | null;
  rsi14: number | null;
  atr14: number | null;
  vwap: number | null;
  micropriceEdgePct: number | null;
  rollingOfi: number | null;
  relativeStrength20d: number | null;
  residualAlpha20d: number | null;
  factorBasketAlpha20d: number | null;
  breakoutLevel: number | null;
  breakdownLevel: number | null;
}

const FACTOR_KEYS: ScreenerFactorKey[] = [
  'dayMoveAtr',
  'gapMoveAtr',
  'vwapDistanceAtr',
  'micropriceEdgePct',
  'rollingOfi',
  'breakoutDistanceAtr',
  'breakdownDistanceAtr',
  'sma20DistanceAtr',
  'sma50DistanceAtr',
  'relativeStrength20d',
  'residualAlpha20d',
  'factorBasketAlpha20d',
  'volumeExpansionLog',
  'rsi14',
];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getAtrScale(input: FactorInput) {
  const atr = input.atr14 && input.atr14 > 0 ? input.atr14 : null;
  if (atr) return atr;
  return input.lastPrice > 0 ? input.lastPrice * 0.01 : null;
}

export function deriveScreenerFactors(input: FactorInput): ScreenerDerivedFactors {
  const atrScale = getAtrScale(input);

  const divideByAtr = (delta: number | null) => {
    if (delta === null || !atrScale || atrScale <= 0) return null;
    return delta / atrScale;
  };

  return {
    dayMoveAtr: divideByAtr(input.lastPrice - input.previousClose),
    gapMoveAtr: divideByAtr(input.openPrice - input.previousClose),
    vwapDistanceAtr: input.vwap !== null ? divideByAtr(input.lastPrice - input.vwap) : null,
    micropriceEdgePct: input.micropriceEdgePct,
    rollingOfi: input.rollingOfi,
    breakoutDistanceAtr: input.breakoutLevel !== null ? divideByAtr(input.lastPrice - input.breakoutLevel) : null,
    breakdownDistanceAtr: input.breakdownLevel !== null ? divideByAtr(input.lastPrice - input.breakdownLevel) : null,
    sma20DistanceAtr: input.sma20 !== null ? divideByAtr(input.lastPrice - input.sma20) : null,
    sma50DistanceAtr: input.sma50 !== null ? divideByAtr(input.lastPrice - input.sma50) : null,
    relativeStrength20d: input.relativeStrength20d,
    residualAlpha20d: input.residualAlpha20d,
    factorBasketAlpha20d: input.factorBasketAlpha20d,
    volumeExpansionLog:
      input.volumeExpansion !== null && input.volumeExpansion > 0
        ? Math.log(Math.max(input.volumeExpansion, 0.1))
        : null,
    rsi14: input.rsi14,
  };
}

export function buildScreenerFactorContext(
  rows: FactorInput[]
): ScreenerFactorContext {
  const factors = rows.map((row) => deriveScreenerFactors(row));

  return FACTOR_KEYS.reduce((acc, key) => {
    const values = factors.map((row) => row[key]).filter((value): value is number => value !== null && Number.isFinite(value));
    if (values.length === 0) {
      acc[key] = null;
      return acc;
    }

    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
    const stdDev = variance > 0 ? Math.sqrt(variance) : 1;

    acc[key] = {
      mean,
      stdDev,
      min: Math.min(...values),
      max: Math.max(...values),
      count: values.length,
    };
    return acc;
  }, {} as ScreenerFactorContext);
}

export function getNormalizedFactorValue(
  context: ScreenerFactorContext,
  key: ScreenerFactorKey,
  value: number | null,
  invert = false
) {
  if (value === null) return 0;
  const stats = context[key];
  if (!stats) return 0;

  const zScore = (value - stats.mean) / (stats.stdDev || 1);
  return clamp(invert ? -zScore : zScore, -3, 3);
}

export function getBoundedFactorScore(
  context: ScreenerFactorContext,
  key: ScreenerFactorKey,
  value: number | null,
  invert = false
) {
  const normalized = getNormalizedFactorValue(context, key, value, invert);
  return clamp(50 + normalized * 15, 0, 100);
}

export function getBreakoutProximityScore(distanceAtr: number | null) {
  if (distanceAtr === null) return 0;
  return clamp((1 - Math.min(Math.abs(distanceAtr), 3) / 3) * 100, 0, 100);
}
