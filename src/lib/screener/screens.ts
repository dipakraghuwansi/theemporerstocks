import { deriveScreenerFactors, getBoundedFactorScore, getBreakoutProximityScore } from '@/lib/screenerFactors';
import { StockScreenType } from '@/lib/stockUniverse';
import {
  ScreenerBaseMetrics,
  ScreenerScoreBreakdown,
  ScreenerScoreContribution,
  ScreenerScorePayload,
} from '@/lib/screener/types';
import { getRegimeAdjustment } from '@/lib/screener/regime';
import { getMicrostructureOverlay } from '@/lib/screener/microstructureOverlay';
import { getOptionsAdjustment } from '@/lib/screener/optionsOverlay';
import { getSectorAdjustment } from '@/lib/screener/sectorOverlay';

function formatNullable(value: number | null) {
  return value === null ? 'n/a' : value.toFixed(2);
}

function sortDrivers(contributions: ScreenerScoreContribution[]) {
  return [...contributions].sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact)).slice(0, 4);
}

export function screenMatches(screen: StockScreenType, metrics: ScreenerBaseMetrics) {
  const factors = deriveScreenerFactors(metrics);

  switch (screen) {
    case 'intraday-momentum':
      return Boolean(
        metrics.aboveVwap &&
          (factors.dayMoveAtr || 0) >= 0.35 &&
          (metrics.volumeExpansion || 0) >= 1.2 &&
          (metrics.relativeStrength20d || 0) > 0
      );
    case 'swing-setups':
      return Boolean(
        metrics.sma20 !== null &&
          metrics.sma50 !== null &&
          metrics.sma20 > metrics.sma50 &&
          metrics.lastPrice > metrics.sma20 &&
          (metrics.rsi14 || 0) >= 50 &&
          (metrics.rsi14 || 0) <= 68 &&
          (factors.breakoutDistanceAtr === null || factors.breakoutDistanceAtr >= -1.5)
      );
    case 'mean-reversion':
      return Boolean(
        metrics.sma20 !== null &&
          metrics.lastPrice < metrics.sma20 &&
          (metrics.rsi14 || 100) <= 42 &&
          (factors.gapMoveAtr || 0) < 0
      );
    case 'breakout-watchlist':
      return Boolean(
        factors.breakoutDistanceAtr !== null &&
          factors.breakoutDistanceAtr >= -1.25 &&
          factors.breakoutDistanceAtr <= 0.75 &&
          (metrics.volumeExpansion || 0) >= 1.1
      );
  }
}

export function buildScreenerThesis(screen: StockScreenType, metrics: ScreenerBaseMetrics) {
  const factors = deriveScreenerFactors(metrics);

  switch (screen) {
    case 'intraday-momentum':
      return `${metrics.symbol} is trading ${metrics.aboveVwap ? 'above' : 'below'} VWAP with ${formatNullable(
        metrics.volumeExpansion
      )}x volume expansion, ${formatNullable(factors.dayMoveAtr)} ATR day impulse, and ${metrics.dayChangePct.toFixed(2)}% day strength.`;
    case 'swing-setups':
      return `${metrics.symbol} is holding above its trend stack with RSI ${formatNullable(
        metrics.rsi14
      )}, ${formatNullable(factors.sma20DistanceAtr)} ATR above SMA20, and a breakout trigger near ${formatNullable(
        metrics.breakoutLevel
      )}.`;
    case 'mean-reversion':
      return `${metrics.symbol} has pulled back ${formatNullable(metrics.gapPct)}% on the gap with RSI ${formatNullable(
        metrics.rsi14
      )} and ${formatNullable(factors.sma20DistanceAtr)} ATR displacement versus SMA20, putting it on a rebound watchlist.`;
    case 'breakout-watchlist':
      return `${metrics.symbol} is approaching a ${formatNullable(metrics.breakoutLevel)} breakout level from ${formatNullable(
        factors.breakoutDistanceAtr
      )} ATR away with ${formatNullable(metrics.volumeExpansion)}x volume versus its 20-day average.`;
  }
}

export function getScreenerScoreBreakdown(
  screen: StockScreenType,
  metrics: ScreenerBaseMetrics,
  payload: ScreenerScorePayload
): ScreenerScoreBreakdown {
  const factors = deriveScreenerFactors(metrics);
  const volumeScore = getBoundedFactorScore(payload.factorContext, 'volumeExpansionLog', factors.volumeExpansionLog);
  const relativeStrengthScore = getBoundedFactorScore(
    payload.factorContext,
    'relativeStrength20d',
    factors.relativeStrength20d
  );
  const residualAlphaScore = getBoundedFactorScore(
    payload.factorContext,
    'residualAlpha20d',
    factors.residualAlpha20d
  );
  const factorBasketAlphaScore = getBoundedFactorScore(
    payload.factorContext,
    'factorBasketAlpha20d',
    factors.factorBasketAlpha20d
  );
  const dayMoveScore = getBoundedFactorScore(payload.factorContext, 'dayMoveAtr', factors.dayMoveAtr);
  const vwapScore = getBoundedFactorScore(payload.factorContext, 'vwapDistanceAtr', factors.vwapDistanceAtr);
  const breakoutScore = getBreakoutProximityScore(factors.breakoutDistanceAtr);
  const sma20TrendScore = getBoundedFactorScore(payload.factorContext, 'sma20DistanceAtr', factors.sma20DistanceAtr);
  const sma50TrendScore = getBoundedFactorScore(payload.factorContext, 'sma50DistanceAtr', factors.sma50DistanceAtr);
  const meanReversionRsiScore = getBoundedFactorScore(payload.factorContext, 'rsi14', factors.rsi14, true);
  const meanReversionGapScore = getBoundedFactorScore(payload.factorContext, 'gapMoveAtr', factors.gapMoveAtr, true);
  const meanReversionStretchScore = getBoundedFactorScore(
    payload.factorContext,
    'sma20DistanceAtr',
    factors.sma20DistanceAtr,
    true
  );

  let contributions: ScreenerScoreContribution[] = [];

  switch (screen) {
    case 'intraday-momentum':
      contributions = [
        { key: 'day_move', label: 'ATR Day Impulse', value: dayMoveScore, displayValue: dayMoveScore.toFixed(1), impact: Number((dayMoveScore * 0.32).toFixed(1)) },
        { key: 'volume', label: 'Volume Expansion', value: volumeScore, displayValue: volumeScore.toFixed(1), impact: Number((volumeScore * 0.24).toFixed(1)) },
        { key: 'relative_strength', label: 'Relative Strength', value: relativeStrengthScore, displayValue: relativeStrengthScore.toFixed(1), impact: Number((relativeStrengthScore * 0.2).toFixed(1)) },
        { key: 'residual_alpha', label: 'Residual Alpha', value: residualAlphaScore, displayValue: residualAlphaScore.toFixed(1), impact: Number((residualAlphaScore * 0.12).toFixed(1)) },
        { key: 'factor_alpha', label: 'Factor Basket Alpha', value: factorBasketAlphaScore, displayValue: factorBasketAlphaScore.toFixed(1), impact: Number((factorBasketAlphaScore * 0.1).toFixed(1)) },
        { key: 'vwap', label: 'VWAP Distance', value: vwapScore, displayValue: vwapScore.toFixed(1), impact: Number((vwapScore * 0.12).toFixed(1)) },
        { key: 'vwap_state', label: 'VWAP State', value: metrics.aboveVwap ? 1 : 0, displayValue: metrics.aboveVwap ? 'Above' : 'Below', impact: metrics.aboveVwap ? 5 : -6 },
      ];
      break;
    case 'swing-setups':
      contributions = [
        { key: 'sma20_trend', label: 'SMA20 Trend', value: sma20TrendScore, displayValue: sma20TrendScore.toFixed(1), impact: Number((sma20TrendScore * 0.24).toFixed(1)) },
        { key: 'sma50_trend', label: 'SMA50 Trend', value: sma50TrendScore, displayValue: sma50TrendScore.toFixed(1), impact: Number((sma50TrendScore * 0.18).toFixed(1)) },
        { key: 'relative_strength', label: 'Relative Strength', value: relativeStrengthScore, displayValue: relativeStrengthScore.toFixed(1), impact: Number((relativeStrengthScore * 0.2).toFixed(1)) },
        { key: 'residual_alpha', label: 'Residual Alpha', value: residualAlphaScore, displayValue: residualAlphaScore.toFixed(1), impact: Number((residualAlphaScore * 0.12).toFixed(1)) },
        { key: 'factor_alpha', label: 'Factor Basket Alpha', value: factorBasketAlphaScore, displayValue: factorBasketAlphaScore.toFixed(1), impact: Number((factorBasketAlphaScore * 0.12).toFixed(1)) },
        { key: 'breakout', label: 'Breakout Proximity', value: breakoutScore, displayValue: breakoutScore.toFixed(1), impact: Number((breakoutScore * 0.22).toFixed(1)) },
        { key: 'volume', label: 'Volume Expansion', value: volumeScore, displayValue: volumeScore.toFixed(1), impact: Number((volumeScore * 0.14).toFixed(1)) },
      ];
      break;
    case 'mean-reversion':
      contributions = [
        { key: 'rsi_reversal', label: 'RSI Reversal', value: meanReversionRsiScore, displayValue: meanReversionRsiScore.toFixed(1), impact: Number((meanReversionRsiScore * 0.34).toFixed(1)) },
        { key: 'gap_reversal', label: 'Gap Stretch', value: meanReversionGapScore, displayValue: meanReversionGapScore.toFixed(1), impact: Number((meanReversionGapScore * 0.26).toFixed(1)) },
        { key: 'sma20_stretch', label: 'SMA20 Stretch', value: meanReversionStretchScore, displayValue: meanReversionStretchScore.toFixed(1), impact: Number((meanReversionStretchScore * 0.24).toFixed(1)) },
        { key: 'residual_alpha', label: 'Residual Alpha', value: residualAlphaScore, displayValue: residualAlphaScore.toFixed(1), impact: Number((residualAlphaScore * 0.12).toFixed(1)) },
        { key: 'factor_alpha', label: 'Factor Basket Alpha', value: factorBasketAlphaScore, displayValue: factorBasketAlphaScore.toFixed(1), impact: Number((factorBasketAlphaScore * 0.1).toFixed(1)) },
        { key: 'volume', label: 'Volume Expansion', value: volumeScore, displayValue: volumeScore.toFixed(1), impact: Number((volumeScore * 0.16).toFixed(1)) },
      ];
      break;
    case 'breakout-watchlist':
      contributions = [
        { key: 'breakout', label: 'Breakout Proximity', value: breakoutScore, displayValue: breakoutScore.toFixed(1), impact: Number((breakoutScore * 0.34).toFixed(1)) },
        { key: 'volume', label: 'Volume Expansion', value: volumeScore, displayValue: volumeScore.toFixed(1), impact: Number((volumeScore * 0.22).toFixed(1)) },
        { key: 'relative_strength', label: 'Relative Strength', value: relativeStrengthScore, displayValue: relativeStrengthScore.toFixed(1), impact: Number((relativeStrengthScore * 0.18).toFixed(1)) },
        { key: 'residual_alpha', label: 'Residual Alpha', value: residualAlphaScore, displayValue: residualAlphaScore.toFixed(1), impact: Number((residualAlphaScore * 0.12).toFixed(1)) },
        { key: 'factor_alpha', label: 'Factor Basket Alpha', value: factorBasketAlphaScore, displayValue: factorBasketAlphaScore.toFixed(1), impact: Number((factorBasketAlphaScore * 0.12).toFixed(1)) },
        { key: 'day_move', label: 'ATR Day Impulse', value: dayMoveScore, displayValue: dayMoveScore.toFixed(1), impact: Number((dayMoveScore * 0.14).toFixed(1)) },
        { key: 'sma20_trend', label: 'SMA20 Trend', value: sma20TrendScore, displayValue: sma20TrendScore.toFixed(1), impact: Number((sma20TrendScore * 0.1).toFixed(1)) },
      ];
      break;
  }

  const baseScore = Number(contributions.reduce((sum, item) => sum + item.impact, 0).toFixed(1));
  const sectorDetails = getSectorAdjustment(screen, metrics, payload);
  const regimeAdjustment = getRegimeAdjustment(screen, payload);
  const optionsDetails = getOptionsAdjustment(screen, metrics, payload);
  const microstructureDetails = getMicrostructureOverlay(screen, metrics, payload);
  const expandedContributions = [
    ...contributions,
    {
      key: 'sector_overlay',
      label: 'Sector Overlay',
      value: sectorDetails.sectorAdjustment,
      displayValue:
        sectorDetails.sectorBreadthDelta === null
          ? 'n/a'
          : `${sectorDetails.sectorBreadthPct?.toFixed(1) || 'n/a'}% / ${sectorDetails.sectorBreadthDelta >= 0 ? '+' : ''}${sectorDetails.sectorBreadthDelta.toFixed(1)}`,
      impact: sectorDetails.sectorAdjustment,
    },
    {
      key: 'regime_overlay',
      label: payload.regime.label,
      value: regimeAdjustment,
      displayValue: `${Math.round(payload.regime.confidence * 100)}% confidence`,
      impact: regimeAdjustment,
    },
    {
      key: 'options_overlay',
      label: 'Options Structure',
      value: optionsDetails.optionsAdjustment,
      displayValue: optionsDetails.optionsStructure?.available
        ? `${optionsDetails.optionsStructure.gammaRegime} / ${optionsDetails.optionsStructure.futuresBuildup.replace('_', ' ')} / PCR ${optionsDetails.optionsStructure.putCallRatio?.toFixed(2) || 'n/a'}`
        : optionsDetails.optionsStructure?.reason || 'n/a',
      impact: optionsDetails.optionsAdjustment,
    },
    {
      key: 'microstructure_overlay',
      label: 'Microstructure Adj',
      value: microstructureDetails.adjustment,
      displayValue: microstructureDetails.displayValue,
      impact: microstructureDetails.adjustment,
    },
  ];

  return {
    baseScore,
    regimeAdjustment,
    optionsAdjustment: optionsDetails.optionsAdjustment,
    microstructureAdjustment: microstructureDetails.adjustment,
    ...sectorDetails,
    score: Number(
      (
        baseScore +
        sectorDetails.sectorAdjustment +
        regimeAdjustment +
        optionsDetails.optionsAdjustment +
        microstructureDetails.adjustment
      ).toFixed(1)
    ),
    contributions: expandedContributions,
    topDrivers: sortDrivers(expandedContributions),
  };
}
