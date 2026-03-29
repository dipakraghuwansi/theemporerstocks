import { MODEL_PORTFOLIO_FILTERS } from '@/lib/modelPortfolio/config';
import { ModelPortfolioCandidate } from '@/lib/modelPortfolio/types';
import { ScoredScreenSnapshot } from '@/lib/screener/runtime';

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function percentileRank(value: number | null, values: number[]) {
  if (value === null || !Number.isFinite(value) || values.length === 0) return 50;
  const lowerOrEqual = values.filter((entry) => entry <= value).length;
  return Number(((lowerOrEqual / values.length) * 100).toFixed(1));
}

function computeEvidenceScore(candidate: ScoredScreenSnapshot['results'][number]) {
  const probability = candidate.probabilityEstimate;
  if (!probability) {
    return candidate.buyRecommendation.supportLabel === 'Low Sample' ? 25 : 40;
  }

  return Number(
    clamp(
      probability.winRate * 0.5 + probability.expectancyPct * 8 + Math.min(probability.sampleSize, 20),
      0,
      100
    ).toFixed(1)
  );
}

function computeEvidenceStrength(candidate: ScoredScreenSnapshot['results'][number]) {
  const probability = candidate.probabilityEstimate;
  if (!probability) return 20;
  const sampleBoost = Math.min(probability.sampleSize, 12) * 3;
  return Number(clamp(probability.winRate * 0.55 + probability.expectancyPct * 10 + sampleBoost, 0, 100).toFixed(1));
}

function computeOverlayScore(candidate: ScoredScreenSnapshot['results'][number]) {
  return Number(
    clamp(
      50 + candidate.optionsAdjustment + candidate.microstructureAdjustment + candidate.sectorAdjustment,
      0,
      100
    ).toFixed(1)
  );
}

function passesEntryGate(candidate: ModelPortfolioCandidate) {
  const row = candidate.screenerResult;
  const supportsEnough = row.buyRecommendation.supportLabel !== 'Low Sample';
  const trendGate =
    row.sma20 !== null &&
    (candidate.sourceScreen === 'mean-reversion'
      ? row.lastPrice >= row.sma20 * 0.97
      : row.lastPrice > row.sma20);

  return (
    row.lastPrice >= MODEL_PORTFOLIO_FILTERS.minPrice &&
    row.avgVolume20 !== null &&
    row.avgVolume20 >= MODEL_PORTFOLIO_FILTERS.minAvgVolume20 &&
    row.atr14 !== null &&
    row.sma20 !== null &&
    row.sma50 !== null &&
    candidate.portfolioScore >= MODEL_PORTFOLIO_FILTERS.minPortfolioScore &&
    row.buyRecommendation.confidenceLabel === 'High' &&
    supportsEnough &&
    (row.residualAlpha20d || 0) > 0 &&
    (row.factorBasketAlpha20d || 0) > 0 &&
    trendGate
  );
}

export function buildModelPortfolioCandidates(scoredScreens: ScoredScreenSnapshot[]): ModelPortfolioCandidate[] {
  const allRows = scoredScreens.flatMap((snapshot) =>
    snapshot.results.map((row) => ({
      row,
      screen: snapshot.screen,
      screenLabel: snapshot.screenLabel,
    }))
  );

  const residualValues = allRows
    .map(({ row }) => row.residualAlpha20d)
    .filter((value): value is number => value !== null && Number.isFinite(value))
    .sort((a, b) => a - b);
  const factorValues = allRows
    .map(({ row }) => row.factorBasketAlpha20d)
    .filter((value): value is number => value !== null && Number.isFinite(value))
    .sort((a, b) => a - b);

  const deduped = new Map<string, ModelPortfolioCandidate>();

  for (const { row, screen, screenLabel } of allRows) {
    const alphaScore = Number(
      (
        percentileRank(row.residualAlpha20d, residualValues) * 0.55 +
        percentileRank(row.factorBasketAlpha20d, factorValues) * 0.45
      ).toFixed(1)
    );
    const setupScore = Number(clamp(row.score, 0, 100).toFixed(1));
    const evidenceScore = computeEvidenceScore(row);
    const overlayScore = computeOverlayScore(row);
    const portfolioScore = Number(
      (alphaScore * 0.35 + setupScore * 0.3 + evidenceScore * 0.2 + overlayScore * 0.15).toFixed(1)
    );
    const evidenceStrength = computeEvidenceStrength(row);
    const candidate: ModelPortfolioCandidate = {
      symbol: row.symbol,
      instrument: row.instrument,
      sector: row.sector,
      category: row.category,
      sourceScreen: screen,
      sourceScreenLabel: screenLabel,
      screenerResult: row,
      alphaScore,
      setupScore,
      evidenceScore,
      overlayScore,
      portfolioScore,
      evidenceStrength,
    };
    const existing = deduped.get(candidate.symbol);
    if (!existing || candidate.portfolioScore > existing.portfolioScore) {
      deduped.set(candidate.symbol, candidate);
    }
  }

  const ranked = Array.from(deduped.values()).sort((a, b) => {
    if (b.portfolioScore !== a.portfolioScore) return b.portfolioScore - a.portfolioScore;
    return b.screenerResult.buyRecommendation.confidenceScore - a.screenerResult.buyRecommendation.confidenceScore;
  });
  return ranked.filter((candidate) => passesEntryGate(candidate));
}
