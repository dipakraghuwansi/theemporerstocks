import { buildScreenerFactorContext } from '@/lib/screenerFactors';
import { buildCalibrationContext } from '@/lib/screener/calibration';
import { StockScreenType } from '@/lib/stockUniverse';
import { buildRegime, getRegimeAdjustment } from '@/lib/screener/regime';
import { getMicrostructureOverlay } from '@/lib/screener/microstructureOverlay';
import { buildScreenerThesis, getScreenerScoreBreakdown, screenMatches } from '@/lib/screener/screens';
import { applySectorSnapshot, buildSectorContext, getSectorAdjustment } from '@/lib/screener/sectorOverlay';
import { ScreenerBaseMetrics, ScreenerScoredResult, ScreenerScorePayload } from '@/lib/screener/types';
import { ProbabilityEstimate } from '@/lib/research/types';
import { buildBuyRecommendation } from '@/lib/research/recommendation';

export function createScreenerScorePayload(
  metrics: ScreenerBaseMetrics[],
  sectorContext: ScreenerScorePayload['sectorContext'] = {},
  optionStructureContext: ScreenerScorePayload['optionStructureContext'] = {},
  regime: ScreenerScorePayload['regime'],
  calibrationContext: ScreenerScorePayload['calibrationContext']
): ScreenerScorePayload {
  return {
    factorContext: buildScreenerFactorContext(metrics),
    sectorContext,
    optionStructureContext,
    calibrationContext,
    regime,
  };
}

export function computeScreenerScore(
  screen: StockScreenType,
  metrics: ScreenerBaseMetrics,
  payload: ScreenerScorePayload
) {
  return getScreenerScoreBreakdown(screen, metrics, payload).score;
}

export function scoreScreenerResult(
  screen: StockScreenType,
  metrics: ScreenerBaseMetrics,
  payload: ScreenerScorePayload,
  probabilityEstimate: ProbabilityEstimate | null = null
): ScreenerScoredResult {
  const breakdown = getScreenerScoreBreakdown(screen, metrics, payload);
  const optionsStructure = payload.optionStructureContext[metrics.symbol] || null;
  const buyRecommendation = buildBuyRecommendation(screen, metrics, breakdown.score, probabilityEstimate, optionsStructure);
  return {
    ...metrics,
    baseScore: breakdown.baseScore,
    sectorAdjustment: breakdown.sectorAdjustment,
    regimeAdjustment: breakdown.regimeAdjustment,
    optionsAdjustment: breakdown.optionsAdjustment,
    microstructureAdjustment: breakdown.microstructureAdjustment,
    sectorState: breakdown.sectorState,
    sectorBreadthPct: breakdown.sectorBreadthPct,
    sectorBreadthDelta: breakdown.sectorBreadthDelta,
    optionsStructure,
    probabilityEstimate,
    buyRecommendation,
    score: breakdown.score,
    thesis: buildScreenerThesis(screen, metrics),
    scoreBreakdown: breakdown,
  };
}

export {
  applySectorSnapshot,
  buildRegime,
  buildCalibrationContext,
  buildScreenerThesis,
  buildSectorContext,
  getRegimeAdjustment,
  getMicrostructureOverlay,
  getScreenerScoreBreakdown,
  getSectorAdjustment,
  screenMatches,
};

export type {
  ScreenerBaseMetrics,
  ScreenerRegime,
  ScreenerScoredResult,
  ScreenerScoreBreakdown,
  ScreenerScoreContribution,
  ScreenerScorePayload,
  ScreenerSectorContextRow,
} from '@/lib/screener/types';
