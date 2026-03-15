import { OptionStructureSummary } from '@/lib/optionsStructure/types';
import { ProbabilityEstimate } from '@/lib/research/types';
import { ScreenerBaseMetrics } from '@/lib/screener/types';
import { StockScreenType } from '@/lib/stockUniverse';

export interface TradePlan {
  entryPrice: number;
  stopLoss: number;
  targetPrice: number;
  riskPct: number;
  rewardPct: number;
}

export interface BuyRecommendation {
  confidenceScore: number;
  confidenceLabel: 'High' | 'Medium' | 'Watchlist' | 'Low';
  historicallySupported: boolean;
  supportLabel: 'Historically Supported' | 'Developing Evidence' | 'Low Sample';
  confidenceExplanation: string;
  supportExplanation: string;
  plan: TradePlan;
}

export function getTradePlan(screen: StockScreenType, metrics: ScreenerBaseMetrics): TradePlan {
  const atr = metrics.atr14 || Math.max(metrics.lastPrice * 0.02, 1);
  const entryPrice =
    screen === 'breakout-watchlist' && metrics.breakoutLevel !== null
      ? Math.max(metrics.lastPrice, metrics.breakoutLevel)
      : metrics.lastPrice;
  const stopDistanceMultiplier = screen === 'intraday-momentum' || screen === 'mean-reversion' ? 0.8 : 1;
  const targetDistanceMultiplier =
    screen === 'intraday-momentum' ? 1.2 : screen === 'mean-reversion' ? 1.5 : 2;
  const stopLoss = entryPrice - atr * stopDistanceMultiplier;
  const targetPrice = entryPrice + atr * targetDistanceMultiplier;

  return {
    entryPrice: Number(entryPrice.toFixed(2)),
    stopLoss: Number(stopLoss.toFixed(2)),
    targetPrice: Number(targetPrice.toFixed(2)),
    riskPct: Number((((entryPrice - stopLoss) / entryPrice) * 100).toFixed(2)),
    rewardPct: Number((((targetPrice - entryPrice) / entryPrice) * 100).toFixed(2)),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getVpinExplanation(metrics: ScreenerBaseMetrics) {
  if (metrics.vpin === null || metrics.vpin === undefined) {
    return '';
  }

  if (metrics.vpin >= 0.8) {
    return ` Live toxicity is elevated with VPIN ${(metrics.vpin * 100).toFixed(0)}%, which suggests informed or one-sided flow risk is high.`;
  }

  if (metrics.vpin >= 0.65) {
    return ` Live toxicity is warm with VPIN ${(metrics.vpin * 100).toFixed(0)}%, so follow-through can be sharp but slippage risk also rises.`;
  }

  if (metrics.vpin <= 0.3) {
    return ` Live toxicity is calm with VPIN ${(metrics.vpin * 100).toFixed(0)}%, which supports cleaner execution if the setup confirms.`;
  }

  return ` Live toxicity is mixed with VPIN ${(metrics.vpin * 100).toFixed(0)}%.`;
}

export function buildBuyRecommendation(
  screen: StockScreenType,
  metrics: ScreenerBaseMetrics,
  score: number,
  probabilityEstimate: ProbabilityEstimate | null,
  optionsStructure: OptionStructureSummary | null = null
): BuyRecommendation {
  const technicalComponent = clamp(score, 0, 100) * 0.55;
  const winRateComponent = probabilityEstimate ? clamp(probabilityEstimate.winRate, 0, 100) * 0.25 : 10;
  const expectancyComponent = probabilityEstimate ? clamp(probabilityEstimate.expectancyPct * 12, -10, 15) : 0;
  const sampleComponent = probabilityEstimate ? clamp(probabilityEstimate.sampleSize, 0, 20) : 0;
  const optionsComponent = optionsStructure?.available ? clamp(optionsStructure.optionsAdjustmentHint * 2, -8, 8) : 0;
  const confidenceScore = Number(
    clamp(technicalComponent + winRateComponent + expectancyComponent + sampleComponent + optionsComponent, 0, 100).toFixed(1)
  );

  const historicallySupported = Boolean(
    probabilityEstimate &&
      probabilityEstimate.sampleSize >= 8 &&
      probabilityEstimate.winRate >= 55 &&
      probabilityEstimate.expectancyPct > 0
  );

  const confidenceLabel =
    confidenceScore >= 78 ? 'High' : confidenceScore >= 64 ? 'Medium' : confidenceScore >= 48 ? 'Watchlist' : 'Low';

  const supportLabel = probabilityEstimate
    ? historicallySupported
      ? 'Historically Supported'
      : probabilityEstimate.sampleSize >= 4
        ? 'Developing Evidence'
        : 'Low Sample'
    : 'Low Sample';

  const optionsExplanation = optionsStructure?.available
    ? ` Options overlay: ${optionsStructure.gammaRegime} gamma, ${optionsStructure.volSkewRegime.replace('_', ' ')} skew, PCR ${optionsStructure.putCallRatio?.toFixed(2) || 'n/a'}, call wall ${optionsStructure.callWall?.toFixed(2) || 'n/a'}, put wall ${optionsStructure.putWall?.toFixed(2) || 'n/a'}, futures ${optionsStructure.futuresBuildup.replace('_', ' ')}.`
    : '';
  const vpinExplanation = getVpinExplanation(metrics);

  const confidenceExplanation = probabilityEstimate
    ? `Score ${score.toFixed(1)}, win rate ${probabilityEstimate.winRate.toFixed(1)}%, EV ${probabilityEstimate.expectancyPct.toFixed(2)}%, sample ${probabilityEstimate.sampleSize}.${optionsExplanation}${vpinExplanation}`
    : `Score ${score.toFixed(1)} with no research sample attached yet, so confidence leans more on technical setup quality.${optionsExplanation}${vpinExplanation}`;

  const supportExplanation = historicallySupported
    ? `This setup is historically supported because the sample is ${probabilityEstimate?.sampleSize}, win rate is ${probabilityEstimate?.winRate.toFixed(1)}%, and EV is positive at ${probabilityEstimate?.expectancyPct.toFixed(2)}%.`
    : probabilityEstimate && probabilityEstimate.sampleSize >= 4
      ? `This setup has developing evidence: sample ${probabilityEstimate.sampleSize}, win rate ${probabilityEstimate.winRate.toFixed(1)}%, EV ${probabilityEstimate.expectancyPct.toFixed(2)}%.`
      : 'This setup does not yet have enough historical sample size to treat the stats as robust.';

  return {
    confidenceScore,
    confidenceLabel,
    historicallySupported,
    supportLabel,
    confidenceExplanation,
    supportExplanation,
    plan: getTradePlan(screen, metrics),
  };
}
