import { StockScreenType } from '@/lib/stockUniverse';
import { getBoundedFactorScore } from '@/lib/screenerFactors';
import { ScreenerBaseMetrics, ScreenerScorePayload } from '@/lib/screener/types';

export type MicrostructureBias = 'supportive' | 'opposing' | 'mixed' | 'unavailable';

export interface MicrostructureOverlayResult {
  adjustment: number;
  bias: MicrostructureBias;
  displayValue: string;
  explanation: string;
}

function toSigned(value: number) {
  return value > 0 ? 1 : value < 0 ? -1 : 0;
}

export function getMicrostructureOverlay(
  screen: StockScreenType,
  metrics: ScreenerBaseMetrics,
  payload: ScreenerScorePayload
): MicrostructureOverlayResult {
  const edge = metrics.micropriceEdgePct;
  const rolling = metrics.rollingOfi;
  const vpin = metrics.vpin;
  const calibration = payload.calibrationContext[screen]?.microstructureMultiplier ?? 1;

  if (edge === null || rolling === null) {
    return {
      adjustment: 0,
      bias: 'unavailable',
      displayValue: 'n/a',
      explanation: 'Live microstructure is unavailable, so no explicit overlay was applied.',
    };
  }

  const edgeScore = getBoundedFactorScore(payload.factorContext, 'micropriceEdgePct', edge);
  const ofiScore = getBoundedFactorScore(payload.factorContext, 'rollingOfi', rolling);
  const edgeNormalized = (edgeScore - 50) / 50;
  const ofiNormalized = (ofiScore - 50) / 50;

  let raw = edgeNormalized * 3.5 + ofiNormalized * 4.5;

  if (screen === 'intraday-momentum') {
    raw *= 1.2;
  } else if (screen === 'breakout-watchlist') {
    raw *= 0.7;
  } else if (screen === 'mean-reversion') {
    raw *= -0.5;
  } else {
    raw *= 0.35;
  }

  let toxicityPenalty = 0;
  if (vpin !== null) {
    if (vpin >= 0.8) toxicityPenalty = 4;
    else if (vpin >= 0.65) toxicityPenalty = 2;
    else if (vpin <= 0.3 && screen === 'intraday-momentum') toxicityPenalty = -1;
  }

  const signedAlignment = toSigned(edge) + toSigned(rolling);
  const bias: MicrostructureBias =
    signedAlignment >= 2 ? 'supportive' : signedAlignment <= -2 ? 'opposing' : 'mixed';
  const adjustment = Number(((raw - toxicityPenalty) * calibration).toFixed(1));
  const toxicityLabel = vpin === null ? 'n/a' : `${(vpin * 100).toFixed(0)}% tox`;

  return {
    adjustment,
    bias,
    displayValue: `${edge.toFixed(3)}% / ${rolling.toLocaleString()} / ${toxicityLabel}`,
    explanation:
      bias === 'supportive'
        ? `Depth-weighted pressure is supportive with microprice edge ${edge.toFixed(3)}%, rolling OFI ${rolling.toLocaleString()}, and VPIN proxy ${toxicityLabel}.`
        : bias === 'opposing'
          ? `Depth-weighted pressure is opposing with microprice edge ${edge.toFixed(3)}%, rolling OFI ${rolling.toLocaleString()}, and VPIN proxy ${toxicityLabel}.`
          : `Depth-weighted pressure is mixed with microprice edge ${edge.toFixed(3)}%, rolling OFI ${rolling.toLocaleString()}, and VPIN proxy ${toxicityLabel}.`,
  };
}
