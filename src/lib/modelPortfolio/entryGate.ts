import { MODEL_PORTFOLIO_ENTRY_POLICY } from '@/lib/modelPortfolio/config';
import { ModelPortfolioRegimeName } from '@/lib/modelPortfolio/types';
import { calculateSma } from '@/lib/stockIndicators';

type MarketEntryGate = {
  score: number;
  threshold: number;
  qualified: boolean;
  activationOpen: boolean;
  activationDate: string | null;
  regimeAllowed: boolean;
  momentumSignal: number;
  volatilitySignal: number;
  drawdownSignal: number;
  benchmarkDrawdownPct: number;
  realizedVolatility30d: number;
  reasons: string[];
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[]) {
  if (values.length <= 1) return 0;
  const mean = average(values);
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function getIstDateKey(value: string | Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .formatToParts(typeof value === 'string' ? new Date(value) : value)
    .reduce<Record<string, string>>((acc, part) => {
      if (part.type !== 'literal') {
        acc[part.type] = part.value;
      }
      return acc;
    }, {});

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function getIstWeekday(value: string | Date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
  }).format(typeof value === 'string' ? new Date(value) : value);
}

function isTradingDay(dateKey: string) {
  const weekday = getIstWeekday(`${dateKey}T00:00:00+05:30`);
  return weekday !== 'Sat' && weekday !== 'Sun';
}

function nextIstDate(dateKey: string) {
  const cursor = new Date(`${dateKey}T00:00:00+05:30`);
  cursor.setUTCDate(cursor.getUTCDate() + 1);
  return getIstDateKey(cursor);
}

function percentileRank(value: number, values: number[]) {
  if (!Number.isFinite(value) || values.length === 0) return 0.5;
  const lowerOrEqual = values.filter((entry) => entry <= value).length;
  return lowerOrEqual / values.length;
}

function computeMomentumSignal(closes: number[]) {
  const sma20 = calculateSma(closes, 20);
  const sma200 = calculateSma(closes, 200);
  if (sma20 === null || sma200 === null || sma200 <= 0) return 0.5;

  const ratio = sma20 / sma200;
  return Number(clamp((ratio - 0.97) / 0.08, 0, 1).toFixed(4));
}

function computeVolatilitySignal(closes: number[]) {
  const returns = closes.slice(1).map((price, index) => {
    const previous = closes[index];
    return previous > 0 ? (price - previous) / previous : 0;
  });
  if (returns.length < 60) return { signal: 0.5, realizedVolatility30d: 0 };

  const currentWindow = returns.slice(-30);
  const currentVolatility = standardDeviation(currentWindow) * Math.sqrt(252) * 100;
  const historicalVolatilities: number[] = [];

  for (let index = 30; index <= returns.length; index += 1) {
    const window = returns.slice(index - 30, index);
    historicalVolatilities.push(standardDeviation(window) * Math.sqrt(252) * 100);
  }

  const percentile = percentileRank(currentVolatility, historicalVolatilities);
  return {
    signal: Number((1 - percentile).toFixed(4)),
    realizedVolatility30d: Number(currentVolatility.toFixed(2)),
  };
}

function computeDrawdownSignal(closes: number[]) {
  const window = closes.slice(-252);
  if (window.length === 0) {
    return { signal: 0.5, drawdownPct: 0 };
  }

  const lastPrice = window[window.length - 1];
  const rollingHigh = Math.max(...window);
  if (rollingHigh <= 0) {
    return { signal: 0.5, drawdownPct: 0 };
  }

  const drawdownPct = ((lastPrice - rollingHigh) / rollingHigh) * 100;
  return {
    signal: Number((1 - clamp(Math.abs(drawdownPct) / 18, 0, 1)).toFixed(4)),
    drawdownPct: Number(drawdownPct.toFixed(2)),
  };
}

export function getNextTradingSessionDate(now: string) {
  let dateKey = getIstDateKey(now);
  do {
    dateKey = nextIstDate(dateKey);
  } while (!isTradingDay(dateKey));

  return dateKey;
}

export function buildMarketEntryGate(params: {
  benchmarkCloses: number[];
  regimeName: ModelPortfolioRegimeName;
  activationDate: string | null;
  now: string;
}): MarketEntryGate {
  const { benchmarkCloses, regimeName, activationDate, now } = params;
  const momentumSignal = computeMomentumSignal(benchmarkCloses);
  const { signal: volatilitySignal, realizedVolatility30d } = computeVolatilitySignal(benchmarkCloses);
  const { signal: drawdownSignal, drawdownPct } = computeDrawdownSignal(benchmarkCloses);
  const score = Number((momentumSignal * 0.4 + volatilitySignal * 0.35 + drawdownSignal * 0.25).toFixed(4));
  const currentIstDate = getIstDateKey(now);
  const activationOpen = activationDate ? currentIstDate >= activationDate : true;
  const regimeAllowed = regimeName !== 'risk-off';
  const reasons: string[] = [];

  if (!activationOpen && activationDate) {
    reasons.push(`Fresh entries stay locked until the next live session on ${activationDate} IST.`);
  }
  if (!regimeAllowed) {
    reasons.push('Fresh entries are blocked while the HMM regime is risk-off.');
  }
  if (score < MODEL_PORTFOLIO_ENTRY_POLICY.marketEntryScoreThreshold) {
    reasons.push(
      `Market entry score is ${score.toFixed(2)}, below the required ${MODEL_PORTFOLIO_ENTRY_POLICY.marketEntryScoreThreshold.toFixed(2)} threshold.`
    );
  }

  return {
    score,
    threshold: MODEL_PORTFOLIO_ENTRY_POLICY.marketEntryScoreThreshold,
    qualified: activationOpen && regimeAllowed && score >= MODEL_PORTFOLIO_ENTRY_POLICY.marketEntryScoreThreshold,
    activationOpen,
    activationDate,
    regimeAllowed,
    momentumSignal,
    volatilitySignal,
    drawdownSignal,
    benchmarkDrawdownPct: drawdownPct,
    realizedVolatility30d,
    reasons,
  };
}
