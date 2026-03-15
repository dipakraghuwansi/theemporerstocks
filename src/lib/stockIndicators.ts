import { ATR, RSI, SMA } from 'technicalindicators';

export interface CandleLike {
  close: number;
  high: number;
  low: number;
  open?: number;
  volume?: number;
  date?: string | Date;
}

export function calculateSma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const result = SMA.calculate({ period, values });
  return result.length > 0 ? result[result.length - 1] : null;
}

export function calculateRsi(values: number[], period = 14): number | null {
  if (values.length <= period) return null;
  const result = RSI.calculate({ period, values });
  return result.length > 0 ? result[result.length - 1] : null;
}

export function calculateAtr(candles: CandleLike[], period = 14): number | null {
  if (candles.length <= period) return null;
  const result = ATR.calculate({
    period,
    high: candles.map((c) => c.high),
    low: candles.map((c) => c.low),
    close: candles.map((c) => c.close),
  });
  return result.length > 0 ? result[result.length - 1] : null;
}

export function calculateAnchoredVwap(candles: CandleLike[]): number | null {
  if (candles.length === 0) return null;

  let cumulativeVolume = 0;
  let cumulativePriceVolume = 0;

  for (const candle of candles) {
    const volume = candle.volume && candle.volume > 0 ? candle.volume : 1;
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    cumulativeVolume += volume;
    cumulativePriceVolume += typicalPrice * volume;
  }

  return cumulativeVolume > 0 ? cumulativePriceVolume / cumulativeVolume : null;
}

export function calculatePercentChange(current: number, previous: number): number {
  if (!previous) return 0;
  return ((current - previous) / previous) * 100;
}

export function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function highest(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.max(...values);
}

export function lowest(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.min(...values);
}
