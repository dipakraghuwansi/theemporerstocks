import { readDataset } from '@/lib/historical/cache';
import { MODEL_PORTFOLIO_OPTIMIZER } from '@/lib/modelPortfolio/config';
import { ModelPortfolioCandidate, ModelPortfolioOptimizerDiagnostics } from '@/lib/modelPortfolio/types';

type OptimizerRow = {
  candidate: ModelPortfolioCandidate;
  rawWeight: number;
  targetWeight: number;
};

type RefineWeightsParams = {
  rows: OptimizerRow[];
  asOf?: string;
  currentSymbols?: string[];
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function normalize(values: number[]) {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max - min < 1e-9) {
    return values.map(() => 0.5);
  }

  return values.map((value) => (value - min) / (max - min));
}

function getDateKey(value: string) {
  return value.slice(0, 10);
}

function getReturnsWindow(symbol: string, asOf: string, lookbackDays: number) {
  const dataset = readDataset('day', symbol);
  const candles = dataset?.candles || [];
  if (candles.length < 25) return [];

  const asOfKey = getDateKey(asOf);
  const asOfIndex = candles.findIndex((candle) => getDateKey(candle.date) === asOfKey);
  if (asOfIndex < 21) return [];

  const closes = candles.slice(0, asOfIndex + 1).map((candle) => candle.close);
  const startIndex = Math.max(1, closes.length - lookbackDays);
  const returns: number[] = [];

  for (let index = startIndex; index < closes.length; index += 1) {
    const previous = closes[index - 1];
    const current = closes[index];
    if (previous > 0) {
      returns.push((current - previous) / previous);
    }
  }

  return returns;
}

function covariance(a: number[], b: number[]) {
  const sample = Math.min(a.length, b.length);
  if (sample < 10) return 0;
  const left = a.slice(-sample);
  const right = b.slice(-sample);
  const meanLeft = average(left);
  const meanRight = average(right);

  return left.reduce((sum, value, index) => sum + (value - meanLeft) * (right[index] - meanRight), 0) / sample;
}

export function refineWeightsWithOptimizer(params: RefineWeightsParams): {
  rows: OptimizerRow[];
  diagnostics: ModelPortfolioOptimizerDiagnostics;
} {
  const { rows, asOf, currentSymbols = [] } = params;
  const baseDiagnostics: ModelPortfolioOptimizerDiagnostics = {
    enabled: Boolean(MODEL_PORTFOLIO_OPTIMIZER.enabled && asOf),
    covarianceLookbackDays: MODEL_PORTFOLIO_OPTIMIZER.covarianceLookbackDays,
    shrinkage: MODEL_PORTFOLIO_OPTIMIZER.shrinkage,
    coveragePct: 0,
    avgPairCorrelation: 0,
    turnoverPenaltyApplied: currentSymbols.length > 0,
  };

  if (!MODEL_PORTFOLIO_OPTIMIZER.enabled || !asOf || rows.length < 2) {
    return {
      rows,
      diagnostics: {
        ...baseDiagnostics,
        enabled: false,
      },
    };
  }

  const returnsMap = new Map<string, number[]>();
  for (const row of rows) {
    const returns = getReturnsWindow(
      row.candidate.symbol,
      asOf,
      MODEL_PORTFOLIO_OPTIMIZER.covarianceLookbackDays
    );
    if (returns.length >= 20) {
      returnsMap.set(row.candidate.symbol, returns);
    }
  }

  const validRows = rows.filter((row) => returnsMap.has(row.candidate.symbol));
  if (validRows.length < 2) {
    return {
      rows,
      diagnostics: {
        ...baseDiagnostics,
        coveragePct: Number(((validRows.length / rows.length) * 100).toFixed(1)),
      },
    };
  }

  const variances = validRows.map((row) => {
    const returns = returnsMap.get(row.candidate.symbol) || [];
    const variance = covariance(returns, returns);
    return Math.max(variance, 0);
  });
  const stableVariances = variances.map((variance) =>
    variance * (1 - MODEL_PORTFOLIO_OPTIMIZER.shrinkage) + variance * MODEL_PORTFOLIO_OPTIMIZER.shrinkage
  );
  const standardDeviations = stableVariances.map((variance) => Math.sqrt(Math.max(variance, 0)));
  const pairCorrelations: number[] = [];
  const averageCorrelations = validRows.map((row, rowIndex) => {
    const correlations: number[] = [];
    for (let otherIndex = 0; otherIndex < validRows.length; otherIndex += 1) {
      if (rowIndex === otherIndex) continue;
      const left = returnsMap.get(row.candidate.symbol) || [];
      const right = returnsMap.get(validRows[otherIndex].candidate.symbol) || [];
      const cov = covariance(left, right) * (1 - MODEL_PORTFOLIO_OPTIMIZER.shrinkage);
      const denom = standardDeviations[rowIndex] * standardDeviations[otherIndex];
      const correlation = denom > 0 ? clamp(cov / denom, -1, 1) : 0;
      correlations.push(Math.abs(correlation));
      pairCorrelations.push(Math.abs(correlation));
    }
    return average(correlations);
  });

  const normalizedVolatility = normalize(standardDeviations);
  const normalizedCorrelation = normalize(averageCorrelations);
  const targetExposure = rows.reduce((sum, row) => sum + row.targetWeight, 0);

  const optimizedRawBySymbol = new Map<string, number>();
  validRows.forEach((row, index) => {
    const turnoverPenalty = currentSymbols.length > 0 && !currentSymbols.includes(row.candidate.symbol)
      ? MODEL_PORTFOLIO_OPTIMIZER.turnoverPenalty
      : 0;
    const penalty =
      1 +
      normalizedVolatility[index] * MODEL_PORTFOLIO_OPTIMIZER.volatilityPenaltyWeight +
      normalizedCorrelation[index] * MODEL_PORTFOLIO_OPTIMIZER.correlationPenaltyWeight +
      turnoverPenalty;
    optimizedRawBySymbol.set(row.candidate.symbol, row.rawWeight / penalty);
  });

  const optimizedRawTotal = Array.from(optimizedRawBySymbol.values()).reduce((sum, value) => sum + value, 0);
  if (optimizedRawTotal <= 0) {
    return {
      rows,
      diagnostics: {
        ...baseDiagnostics,
        coveragePct: Number(((validRows.length / rows.length) * 100).toFixed(1)),
        avgPairCorrelation: Number(average(pairCorrelations).toFixed(3)),
      },
    };
  }

  const refinedRows = rows.map((row) => {
    const optimizedRaw = optimizedRawBySymbol.get(row.candidate.symbol);
    if (optimizedRaw === undefined) {
      return row;
    }

    const optimizedWeight = (optimizedRaw / optimizedRawTotal) * targetExposure;
    return {
      ...row,
      targetWeight: row.targetWeight * 0.65 + optimizedWeight * 0.35,
    };
  });

  return {
    rows: refinedRows,
    diagnostics: {
      ...baseDiagnostics,
      coveragePct: Number(((validRows.length / rows.length) * 100).toFixed(1)),
      avgPairCorrelation: Number(average(pairCorrelations).toFixed(3)),
    },
  };
}
