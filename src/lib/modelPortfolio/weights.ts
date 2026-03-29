import { MODEL_PORTFOLIO_FILTERS, MODEL_PORTFOLIO_REGIME_POLICY } from '@/lib/modelPortfolio/config';
import { refineWeightsWithOptimizer } from '@/lib/modelPortfolio/optimizer';
import {
  ModelPortfolioCandidate,
  ModelPortfolioOptimizerDiagnostics,
  ModelPortfolioRegimeName,
  ModelPortfolioWeightPlan,
} from '@/lib/modelPortfolio/types';

type WeightedCandidate = {
  candidate: ModelPortfolioCandidate;
  rawWeight: number;
  targetWeight: number;
};

export type BuildTargetWeightsOptions = {
  asOf?: string;
  currentSymbols?: string[];
  targetGrossExposureOverride?: number;
  skipCaps?: boolean;
  skipOptimizer?: boolean;
};

function sumWeights(rows: WeightedCandidate[]) {
  return rows.reduce((sum, row) => sum + row.targetWeight, 0);
}

function rebalanceToExposure(rows: WeightedCandidate[], targetExposure: number) {
  const total = rows.reduce((sum, row) => sum + row.rawWeight, 0);
  if (total <= 0) {
    return rows.map((row) => ({ ...row, targetWeight: 0 }));
  }

  return rows.map((row) => ({
    ...row,
    targetWeight: (row.rawWeight / total) * targetExposure,
  }));
}

function normalizeCurrentWeights(rows: WeightedCandidate[], targetExposure: number) {
  const total = sumWeights(rows);
  if (total <= 0) return rows;
  return rows.map((row) => ({
    ...row,
    targetWeight: (row.targetWeight / total) * targetExposure,
  }));
}

function distributeLeftover(rows: WeightedCandidate[], leftover: number, maxSingleNameWeight: number) {
  let remaining = leftover;
  let safety = 0;

  while (remaining > 0.0001 && safety < 12) {
    safety += 1;
    const eligible = rows.filter((row) => row.targetWeight < maxSingleNameWeight - 0.0001);
    if (eligible.length === 0) break;

    const roomTotal = eligible.reduce((sum, row) => sum + (maxSingleNameWeight - row.targetWeight), 0);
    if (roomTotal <= 0) break;

    for (const row of eligible) {
      const room = maxSingleNameWeight - row.targetWeight;
      const add = Math.min((room / roomTotal) * remaining, room);
      row.targetWeight += add;
      remaining -= add;
    }
  }

  return remaining;
}

function enforceSingleNameCap(rows: WeightedCandidate[], maxSingleNameWeight: number) {
  let leftover = 0;
  for (const row of rows) {
    if (row.targetWeight > maxSingleNameWeight) {
      leftover += row.targetWeight - maxSingleNameWeight;
      row.targetWeight = maxSingleNameWeight;
    }
  }
  distributeLeftover(rows, leftover, maxSingleNameWeight);
}

function enforceGroupCap(
  rows: WeightedCandidate[],
  groupBy: (row: WeightedCandidate) => string,
  maxGroupWeight: number,
  maxSingleNameWeight: number
) {
  let leftover = 0;
  const grouped = new Map<string, WeightedCandidate[]>();

  for (const row of rows) {
    const key = groupBy(row);
    const existing = grouped.get(key) || [];
    existing.push(row);
    grouped.set(key, existing);
  }

  for (const groupRows of grouped.values()) {
    const total = groupRows.reduce((sum, row) => sum + row.targetWeight, 0);
    if (total <= maxGroupWeight) continue;

    const scale = maxGroupWeight / total;
    for (const row of groupRows) {
      const nextWeight = row.targetWeight * scale;
      leftover += row.targetWeight - nextWeight;
      row.targetWeight = nextWeight;
    }
  }

  distributeLeftover(rows, leftover, maxSingleNameWeight);
}

function dropTinyWeights(rows: WeightedCandidate[], minPositionWeight: number, targetExposure: number) {
  const survivors = rows.filter((row) => row.targetWeight >= minPositionWeight);
  if (survivors.length === rows.length) return rows;
  return rebalanceToExposure(survivors, Math.min(targetExposure, sumWeights(survivors)));
}

function buildWeightedCandidates(candidates: ModelPortfolioCandidate[], regime: ModelPortfolioRegimeName) {
  const regimePolicy = MODEL_PORTFOLIO_REGIME_POLICY[regime];
  const selected = candidates.slice(0, regimePolicy.targetPositionsMax);

  return selected.map((candidate) => {
    const atrPct = candidate.screenerResult.atr14
      ? (candidate.screenerResult.atr14 / candidate.screenerResult.lastPrice) * 100
      : MODEL_PORTFOLIO_FILTERS.atrFloorPct;
    const convictionScore =
      candidate.portfolioScore * 0.5 +
      candidate.screenerResult.buyRecommendation.confidenceScore * 0.25 +
      candidate.evidenceStrength * 0.25;
    return {
      candidate,
      rawWeight: convictionScore / Math.max(atrPct, MODEL_PORTFOLIO_FILTERS.atrFloorPct),
      targetWeight: 0,
    } satisfies WeightedCandidate;
  });
}

function applyConstraints(
  rows: WeightedCandidate[],
  targetExposure: number,
  maxSingleNameWeight: number,
  skipCaps = false
) {
  let next = normalizeCurrentWeights(rows, targetExposure);
  if (skipCaps) {
    return next;
  }

  enforceSingleNameCap(next, maxSingleNameWeight);
  enforceGroupCap(next, (row) => row.candidate.sector, MODEL_PORTFOLIO_FILTERS.maxSectorWeight, maxSingleNameWeight);
  enforceGroupCap(
    next,
    (row) => String(row.candidate.category),
    MODEL_PORTFOLIO_FILTERS.maxCategoryWeight,
    maxSingleNameWeight
  );
  next = dropTinyWeights(next, MODEL_PORTFOLIO_FILTERS.minPositionWeight, targetExposure);
  next = normalizeCurrentWeights(next, Math.min(targetExposure, sumWeights(next)));
  enforceSingleNameCap(next, maxSingleNameWeight);
  return next;
}

export function buildTargetWeights(
  candidates: ModelPortfolioCandidate[],
  regime: ModelPortfolioRegimeName,
  options: BuildTargetWeightsOptions = {}
): ModelPortfolioWeightPlan {
  const regimePolicy = MODEL_PORTFOLIO_REGIME_POLICY[regime];
  const targetGrossExposure = options.targetGrossExposureOverride ?? regimePolicy.targetGrossExposure;
  const maxSingleNameWeight = options.skipCaps
    ? Math.max(regimePolicy.maxSingleNameWeight, 1)
    : regimePolicy.maxSingleNameWeight;

  let weighted = rebalanceToExposure(buildWeightedCandidates(candidates, regime), targetGrossExposure);
  let optimizerDiagnostics: ModelPortfolioOptimizerDiagnostics = {
    enabled: false,
    covarianceLookbackDays: 0,
    shrinkage: 0,
    coveragePct: 0,
    avgPairCorrelation: 0,
    turnoverPenaltyApplied: Boolean(options.currentSymbols?.length),
  };

  if (!options.skipOptimizer) {
    const optimized = refineWeightsWithOptimizer({
      rows: weighted,
      asOf: options.asOf,
      currentSymbols: options.currentSymbols,
    });
    weighted = optimized.rows;
    optimizerDiagnostics = optimized.diagnostics;
  }

  weighted = applyConstraints(weighted, targetGrossExposure, maxSingleNameWeight, options.skipCaps);

  return {
    selections: weighted
      .sort((a, b) => b.targetWeight - a.targetWeight)
      .map((row) => ({
        candidate: row.candidate,
        targetWeight: Number(row.targetWeight.toFixed(4)),
      })),
    targetGrossExposure: Number(targetGrossExposure.toFixed(4)),
    targetCashWeight: Number(Math.max(0, 1 - targetGrossExposure).toFixed(4)),
    targetPositionsMin: regimePolicy.targetPositionsMin,
    targetPositionsMax: regimePolicy.targetPositionsMax,
    maxSingleNameWeight: regimePolicy.maxSingleNameWeight,
    optimizerDiagnostics,
  };
}
