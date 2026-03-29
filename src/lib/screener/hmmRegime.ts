import { ScreenerBaseMetrics, ScreenerRegime } from '@/lib/screener/types';

type HiddenState = 'trend' | 'risk-off' | 'rebound' | 'mixed';

const TRANSITIONS: Record<HiddenState, Record<HiddenState, number>> = {
  trend: { trend: 0.76, 'risk-off': 0.05, rebound: 0.09, mixed: 0.1 },
  'risk-off': { trend: 0.04, 'risk-off': 0.8, rebound: 0.06, mixed: 0.1 },
  rebound: { trend: 0.22, 'risk-off': 0.08, rebound: 0.58, mixed: 0.12 },
  mixed: { trend: 0.18, 'risk-off': 0.18, rebound: 0.14, mixed: 0.5 },
};

const EMISSIONS: Record<HiddenState, { mean: number; stdDev: number }> = {
  trend: { mean: 0.35, stdDev: 0.7 },
  'risk-off': { mean: -0.45, stdDev: 0.8 },
  rebound: { mean: 0.55, stdDev: 1.1 },
  mixed: { mean: 0, stdDev: 0.6 },
};

let learnedReturnsHistory: number[] = [];
let learnedObservedStatesHistory: HiddenState[] = [];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function gaussianPdf(x: number, mean: number, stdDev: number) {
  const variance = stdDev * stdDev;
  const numerator = Math.exp(-((x - mean) ** 2) / (2 * variance));
  return numerator / Math.sqrt(2 * Math.PI * variance);
}

function normalize(scores: Record<HiddenState, number>) {
  const total = Object.values(scores).reduce((sum, value) => sum + value, 0) || 1;
  return Object.fromEntries(
    Object.entries(scores).map(([key, value]) => [key, value / total])
  ) as Record<HiddenState, number>;
}

function mean(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdDev(values: number[]) {
  if (values.length <= 1) return 1;
  const avg = mean(values);
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;
  return Math.max(Math.sqrt(variance), 0.2);
}

function classifyObservedState(dailyReturn: number, trailingReturn: number): HiddenState {
  if (dailyReturn >= 0.4 && trailingReturn >= 0.75) return 'trend';
  if (dailyReturn <= -0.5 && trailingReturn <= -1) return 'risk-off';
  if (dailyReturn >= 0.45 && trailingReturn <= 0) return 'rebound';
  return 'mixed';
}

function blendTransitionModel(observed: HiddenState[]) {
  const counts: Record<HiddenState, Record<HiddenState, number>> = {
    trend: { trend: 1, 'risk-off': 1, rebound: 1, mixed: 1 },
    'risk-off': { trend: 1, 'risk-off': 1, rebound: 1, mixed: 1 },
    rebound: { trend: 1, 'risk-off': 1, rebound: 1, mixed: 1 },
    mixed: { trend: 1, 'risk-off': 1, rebound: 1, mixed: 1 },
  };

  for (let index = 1; index < observed.length; index++) {
    counts[observed[index - 1]][observed[index]] += 1;
  }

  return (Object.keys(counts) as HiddenState[]).reduce(
    (acc, from) => {
      const rowTotal = Object.values(counts[from]).reduce((sum, value) => sum + value, 0);
      acc[from] = (Object.keys(counts[from]) as HiddenState[]).reduce(
        (row, to) => {
          const learned = counts[from][to] / rowTotal;
          row[to] = TRANSITIONS[from][to] * 0.45 + learned * 0.55;
          return row;
        },
        {} as Record<HiddenState, number>
      );
      return acc;
    },
    {} as Record<HiddenState, Record<HiddenState, number>>
  );
}

function blendEmissionModel(returns: number[], observed: HiddenState[]) {
  return (Object.keys(EMISSIONS) as HiddenState[]).reduce(
    (acc, state) => {
      const stateReturns = returns.filter((_, index) => observed[index] === state);
      const learnedMean = stateReturns.length > 0 ? mean(stateReturns) : EMISSIONS[state].mean;
      const learnedStdDev = stateReturns.length > 1 ? stdDev(stateReturns) : EMISSIONS[state].stdDev;
      acc[state] = {
        mean: EMISSIONS[state].mean * 0.4 + learnedMean * 0.6,
        stdDev: clamp(EMISSIONS[state].stdDev * 0.4 + learnedStdDev * 0.6, 0.2, 2.5),
      };
      return acc;
    },
    {} as Record<HiddenState, { mean: number; stdDev: number }>
  );
}

export function inferHmmRegime(
  results: ScreenerBaseMetrics[],
  benchmarkCloses: number[],
  benchmarkLastPrice: number,
  fallback: ScreenerRegime
) {
  if (benchmarkCloses.length < 6) {
    return {
      ...fallback,
      confidence: Number((fallback.confidence * 0.85).toFixed(2)),
    };
  }

  const returns = benchmarkCloses.slice(-15).map((price, index, array) => {
    if (index === 0) return null;
    const previous = array[index - 1];
    return previous > 0 ? ((price - previous) / previous) * 100 : null;
  }).filter((value): value is number => value !== null);
  const trailingReturns = returns.map((_, index) => {
    const window = returns.slice(Math.max(0, index - 2), index + 1);
    return window.reduce((sum, value) => sum + value, 0);
  });
  const observedStates = returns.map((dailyReturn, index) =>
    classifyObservedState(dailyReturn, trailingReturns[index] || dailyReturn)
  );
  const combinedReturns = [...learnedReturnsHistory, ...returns].slice(-240);
  const combinedObservedStates = [...learnedObservedStatesHistory, ...observedStates].slice(-240);
  const transitions = blendTransitionModel(combinedObservedStates);
  const emissions = blendEmissionModel(combinedReturns, combinedObservedStates);

  let probabilities: Record<HiddenState, number> = {
    trend: 0.25,
    'risk-off': 0.25,
    rebound: 0.2,
    mixed: 0.3,
  };

  for (const dailyReturn of returns) {
    const next: Record<HiddenState, number> = {
      trend: 0,
      'risk-off': 0,
      rebound: 0,
      mixed: 0,
    };

    (Object.keys(next) as HiddenState[]).forEach((state) => {
      const transitionPrior = (Object.keys(probabilities) as HiddenState[]).reduce(
        (sum, from) => sum + probabilities[from] * transitions[from][state],
        0
      );
      next[state] = transitionPrior * gaussianPdf(dailyReturn, emissions[state].mean, emissions[state].stdDev);
    });

    probabilities = normalize(next);
  }

  const advancingBreadthPct =
    results.length > 0 ? (results.filter((item) => item.dayChangePct > 0).length / results.length) * 100 : 50;
  const aboveSma20Pct =
    results.length > 0
      ? (results.filter((item) => item.sma20 !== null && item.lastPrice > (item.sma20 || 0)).length / results.length) * 100
      : 50;
  const benchmarkPreviousClose = benchmarkCloses[benchmarkCloses.length - 1] || benchmarkLastPrice;
  const benchmarkDayChangePct =
    benchmarkPreviousClose > 0 ? ((benchmarkLastPrice - benchmarkPreviousClose) / benchmarkPreviousClose) * 100 : 0;

  probabilities.trend *= 1 + Math.max(0, (advancingBreadthPct - 50) / 100) + Math.max(0, (aboveSma20Pct - 50) / 120);
  probabilities['risk-off'] *= 1 + Math.max(0, (50 - advancingBreadthPct) / 100) + Math.max(0, (50 - aboveSma20Pct) / 120);
  probabilities.rebound *= benchmarkDayChangePct > 0 ? 1 + benchmarkDayChangePct / 10 : 0.95;
  probabilities.trend *= trailingReturns[trailingReturns.length - 1] > 0 ? 1.03 : 0.97;
  probabilities['risk-off'] *= trailingReturns[trailingReturns.length - 1] < 0 ? 1.03 : 0.97;
  probabilities.mixed *= 1;

  probabilities = normalize(probabilities);
  const ordered = (Object.entries(probabilities) as Array<[HiddenState, number]>).sort((a, b) => b[1] - a[1]);
  const [state, probability] = ordered[0];

  learnedReturnsHistory = combinedReturns;
  learnedObservedStatesHistory = combinedObservedStates;

  return {
    ...fallback,
    name: state,
    label:
      state === 'trend'
        ? 'Adaptive HMM Trend Regime'
        : state === 'risk-off'
          ? 'Adaptive HMM Risk-Off Regime'
          : state === 'rebound'
            ? 'Adaptive HMM Rebound Regime'
            : 'Adaptive HMM Mixed Regime',
    confidence: Number((Math.max(probability, fallback.confidence) * 0.95).toFixed(2)),
  };
}
