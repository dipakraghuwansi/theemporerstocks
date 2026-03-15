import { ResearchManifest } from '@/lib/research/types';
import { StockScreenType } from '@/lib/stockUniverse';

export interface ScreenerCalibrationRow {
  optionsMultiplier: number;
  microstructureMultiplier: number;
}

export type ScreenerCalibrationContext = Record<StockScreenType, ScreenerCalibrationRow>;

const DEFAULT_CALIBRATION: ScreenerCalibrationContext = {
  'intraday-momentum': { optionsMultiplier: 1, microstructureMultiplier: 1 },
  'swing-setups': { optionsMultiplier: 1, microstructureMultiplier: 0.7 },
  'mean-reversion': { optionsMultiplier: 1, microstructureMultiplier: 0.75 },
  'breakout-watchlist': { optionsMultiplier: 1, microstructureMultiplier: 0.85 },
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function buildCalibrationContext(manifest: ResearchManifest | null): ScreenerCalibrationContext {
  if (!manifest) {
    return DEFAULT_CALIBRATION;
  }

  const next = { ...DEFAULT_CALIBRATION };

  (Object.keys(DEFAULT_CALIBRATION) as StockScreenType[]).forEach((screen) => {
    const screenStats = manifest.screens.find((row) => row.screen === screen);
    const train = manifest.splitSummary.find((row) => row.screen === screen && row.split === 'train');
    const test = manifest.splitSummary.find((row) => row.screen === screen && row.split === 'test');

    if (!screenStats) return;

    const sampleBoost = clamp(screenStats.sampleSize / 40, 0.7, 1.2);
    const expectancyBoost = clamp(1 + screenStats.expectancyPct / 20, 0.75, 1.25);
    const driftPenalty =
      train && test ? clamp(1 - Math.abs(test.expectancyPct - train.expectancyPct) / 20, 0.7, 1.05) : 0.9;

    next[screen] = {
      optionsMultiplier: Number(clamp(sampleBoost * expectancyBoost * driftPenalty, 0.65, 1.3).toFixed(2)),
      microstructureMultiplier: Number(
        clamp(
          (screen === 'intraday-momentum' ? 1.05 : 0.85) * expectancyBoost * driftPenalty,
          0.6,
          1.25
        ).toFixed(2)
      ),
    };
  });

  return next;
}
