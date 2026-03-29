import { ResearchManifest } from '@/lib/research/types';
import { StockScreenType } from '@/lib/stockUniverse';

export interface ScreenerCalibrationRow {
  baseMultiplier: number;
  optionsMultiplier: number;
  microstructureMultiplier: number;
  factorMultipliers: Record<string, number>;
  optionsRegimeMultipliers: {
    volSkew: Record<string, number>;
    gamma: Record<string, number>;
  };
  microstructureBiasMultipliers: Record<string, number>;
}

export type ScreenerCalibrationContext = Record<StockScreenType, ScreenerCalibrationRow>;

type FactorProfile = {
  bullishWeight?: number;
  bearishWeight?: number;
  neutralWeight?: number;
  sampleBias?: number;
  expectancyBias?: number;
  profitFactorBias?: number;
  walkForwardBias?: number;
  netBias?: number;
  driftBias?: number;
  coverageBias?: number;
  min: number;
  max: number;
};

const DEFAULT_CALIBRATION: ScreenerCalibrationContext = {
  'intraday-momentum': {
    baseMultiplier: 1,
    optionsMultiplier: 1,
    microstructureMultiplier: 1,
    factorMultipliers: {
      day_move: 1.05,
      volume: 1.05,
      vwap: 1.1,
      relative_strength: 1.05,
      residual_alpha: 1.05,
      factor_alpha: 1.05,
      microstructure_overlay: 1.1,
    },
    optionsRegimeMultipliers: {
      volSkew: {},
      gamma: {},
    },
    microstructureBiasMultipliers: {},
  },
  'swing-setups': {
    baseMultiplier: 1,
    optionsMultiplier: 1,
    microstructureMultiplier: 0.7,
    factorMultipliers: {
      breakout: 1.05,
      sma20_trend: 1.05,
      sma50_trend: 1.05,
      relative_strength: 1.04,
      residual_alpha: 1.1,
      factor_alpha: 1.1,
    },
    optionsRegimeMultipliers: {
      volSkew: {},
      gamma: {},
    },
    microstructureBiasMultipliers: {},
  },
  'mean-reversion': {
    baseMultiplier: 1,
    optionsMultiplier: 1,
    microstructureMultiplier: 0.75,
    factorMultipliers: {
      rsi_reversal: 1.1,
      gap_reversal: 1.05,
      sma20_stretch: 1.05,
      volume: 1.02,
      residual_alpha: 0.95,
      factor_alpha: 0.95,
    },
    optionsRegimeMultipliers: {
      volSkew: {},
      gamma: {},
    },
    microstructureBiasMultipliers: {},
  },
  'breakout-watchlist': {
    baseMultiplier: 1,
    optionsMultiplier: 1,
    microstructureMultiplier: 0.85,
    factorMultipliers: {
      breakout: 1.12,
      volume: 1.05,
      day_move: 1.02,
      relative_strength: 1.04,
      sma20_trend: 1.02,
      residual_alpha: 1.08,
      factor_alpha: 1.08,
    },
    optionsRegimeMultipliers: {
      volSkew: {},
      gamma: {},
    },
    microstructureBiasMultipliers: {},
  },
};

const FACTOR_PROFILES: Record<StockScreenType, Record<string, FactorProfile>> = {
  'intraday-momentum': {
    day_move: { bullishWeight: 0.8, neutralWeight: 0.2, expectancyBias: 0.5, walkForwardBias: 0.4, netBias: 0.5, min: 0.72, max: 1.08 },
    volume: { sampleBias: 0.3, profitFactorBias: 0.55, walkForwardBias: 0.45, min: 0.78, max: 1.08 },
    vwap: { bullishWeight: 0.75, bearishWeight: -0.35, walkForwardBias: 0.35, netBias: 0.35, min: 0.72, max: 1.08 },
    relative_strength: { bullishWeight: 0.7, bearishWeight: -0.3, walkForwardBias: 0.35, netBias: 0.35, min: 0.74, max: 1.08 },
    residual_alpha: { bullishWeight: 0.45, bearishWeight: -0.25, expectancyBias: 0.4, netBias: 0.45, driftBias: -0.25, min: 0.72, max: 1.06 },
    factor_alpha: { bullishWeight: 0.35, bearishWeight: -0.2, profitFactorBias: 0.35, walkForwardBias: 0.45, min: 0.72, max: 1.08 },
    microstructure_overlay: { sampleBias: 0.25, expectancyBias: 0.35, coverageBias: 0.65, netBias: 0.3, min: 0.68, max: 1.06 },
  },
  'swing-setups': {
    breakout: { bullishWeight: 0.8, neutralWeight: 0.25, walkForwardBias: 0.45, netBias: 0.4, min: 0.9, max: 1.24 },
    sma20_trend: { bullishWeight: 0.7, neutralWeight: 0.2, expectancyBias: 0.35, netBias: 0.45, driftBias: -0.2, min: 0.96, max: 1.22 },
    sma50_trend: { bullishWeight: 0.7, neutralWeight: 0.15, walkForwardBias: 0.35, netBias: 0.45, min: 0.95, max: 1.2 },
    relative_strength: { bullishWeight: 0.75, bearishWeight: -0.25, sampleBias: 0.2, expectancyBias: 0.3, min: 0.9, max: 1.22 },
    residual_alpha: { bullishWeight: 0.45, bearishWeight: -0.2, expectancyBias: 0.45, netBias: 0.45, driftBias: -0.2, min: 0.85, max: 1.18 },
    factor_alpha: { bullishWeight: 0.35, bearishWeight: -0.15, profitFactorBias: 0.35, walkForwardBias: 0.45, min: 0.85, max: 1.22 },
  },
  'mean-reversion': {
    rsi_reversal: { bearishWeight: 0.75, expectancyBias: 0.45, netBias: 0.35, driftBias: -0.2, min: 0.9, max: 1.22 },
    gap_reversal: { bearishWeight: 0.65, neutralWeight: 0.2, walkForwardBias: 0.4, netBias: 0.3, min: 0.88, max: 1.18 },
    sma20_stretch: { bearishWeight: 0.55, neutralWeight: 0.15, walkForwardBias: 0.35, netBias: 0.35, min: 0.88, max: 1.16 },
    volume: { sampleBias: 0.2, profitFactorBias: 0.25, walkForwardBias: 0.2, min: 0.9, max: 1.12 },
    residual_alpha: { bearishWeight: -0.15, neutralWeight: 0.1, expectancyBias: 0.25, driftBias: -0.2, min: 0.85, max: 1.12 },
    factor_alpha: { bearishWeight: -0.15, neutralWeight: 0.1, walkForwardBias: 0.25, min: 0.85, max: 1.14 },
  },
  'breakout-watchlist': {
    breakout: { bullishWeight: 0.75, neutralWeight: 0.2, bearishWeight: -0.35, walkForwardBias: 0.45, netBias: 0.35, min: 0.82, max: 1.16 },
    volume: { sampleBias: 0.25, profitFactorBias: 0.4, walkForwardBias: 0.35, min: 0.82, max: 1.1 },
    day_move: { bullishWeight: 0.65, bearishWeight: -0.25, expectancyBias: 0.35, driftBias: -0.2, min: 0.82, max: 1.08 },
    relative_strength: { bullishWeight: 0.65, bearishWeight: -0.2, sampleBias: 0.2, min: 0.8, max: 1.12 },
    sma20_trend: { bullishWeight: 0.55, neutralWeight: 0.15, netBias: 0.25, min: 0.84, max: 1.08 },
    residual_alpha: { bullishWeight: 0.4, bearishWeight: -0.2, expectancyBias: 0.35, netBias: 0.35, min: 0.85, max: 1.16 },
    factor_alpha: { bullishWeight: 0.3, bearishWeight: -0.15, profitFactorBias: 0.3, walkForwardBias: 0.35, min: 0.85, max: 1.18 },
  },
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getSummaryValue(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getSummaryStability(values: number[]) {
  if (values.length <= 1) return 1;
  const mean = getSummaryValue(values);
  const spread = Math.max(...values) - Math.min(...values);
  return clamp(1 - spread / Math.max(Math.abs(mean) + 10, 20), 0.72, 1.12);
}

function getEvidenceMultiplier(netExpectancyPct: number, sampleSize: number, stability = 1) {
  const sampleConfidence = clamp(sampleSize / 25, 0.65, 1.15);
  const expectancyBias = clamp(1 + netExpectancyPct / 12, 0.7, 1.3);
  return Number(clamp(sampleConfidence * expectancyBias * stability, 0.7, 1.3).toFixed(2));
}

function getFactorProfileMultiplier(
  profile: FactorProfile,
  context: {
    sampleBoost: number;
    expectancyBoost: number;
    profitFactorBoost: number;
    walkForwardStability: number;
    netStability: number;
    outOfSampleEdge: number;
    regimeBullish: number;
    regimeBearish: number;
    regimeNeutral: number;
    testNet: number;
    microstructureCoverage: number;
  }
) {
  let score = 1;
  score += ((profile.bullishWeight || 0) * context.regimeBullish) / 20;
  score += ((profile.bearishWeight || 0) * context.regimeBearish) / 20;
  score += ((profile.neutralWeight || 0) * context.regimeNeutral) / 20;
  score += (profile.sampleBias || 0) * (context.sampleBoost - 1);
  score += (profile.expectancyBias || 0) * (context.expectancyBoost - 1);
  score += (profile.profitFactorBias || 0) * (context.profitFactorBoost - 1);
  score += (profile.walkForwardBias || 0) * (context.walkForwardStability - 1);
  score += (profile.netBias || 0) * (clamp(1 + context.testNet / 18, 0.8, 1.2) - 1);
  score += (profile.driftBias || 0) * (context.outOfSampleEdge - 1);
  score += (profile.coverageBias || 0) * (context.microstructureCoverage - 1);
  return Number(clamp(score * context.netStability, profile.min, profile.max).toFixed(2));
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
    const regimes = manifest.regimeSummary.filter((row) => row.screen === screen);
    const walkForward = manifest.walkForwardSummary.filter((row) => row.screen === screen);
    const microstructureRows = (manifest.microstructureSummary || []).filter((row) => row.screen === screen);
    const volSkewRows = (manifest.volSurfaceSummary || []).filter((row) => row.screen === screen && row.family === 'vol_skew');
    const gammaRows = (manifest.volSurfaceSummary || []).filter((row) => row.screen === screen && row.family === 'gamma');

    if (!screenStats) return;

    const sampleBoost = clamp(screenStats.sampleSize / 40, 0.7, 1.2);
    const expectancyBoost = clamp(1 + screenStats.expectancyPct / 20, 0.75, 1.25);
    const driftPenalty =
      train && test ? clamp(1 - Math.abs(test.expectancyPct - train.expectancyPct) / 20, 0.7, 1.05) : 0.9;
    const regimeSpread =
      regimes.length > 1
        ? Math.max(...regimes.map((row) => row.expectancyPct)) - Math.min(...regimes.map((row) => row.expectancyPct))
        : 0;
    const walkForwardSpread =
      walkForward.length > 1
        ? Math.max(...walkForward.map((row) => row.expectancyPct)) - Math.min(...walkForward.map((row) => row.expectancyPct))
        : 0;
    const regimePenalty = clamp(1 - regimeSpread / 25, 0.72, 1.04);
    const walkForwardPenalty = clamp(1 - walkForwardSpread / 25, 0.72, 1.04);
    const testNet = test?.netExpectancyPct ?? screenStats.netExpectancyPct;
    const profitFactorBoost = clamp(0.9 + screenStats.profitFactor / 5, 0.8, 1.2);
    const reliability = clamp(sampleBoost * driftPenalty * regimePenalty * walkForwardPenalty, 0.65, 1.2);
    const directionalBias = clamp(1 + testNet / 18, 0.8, 1.2);
    const regimeBullish = getSummaryValue(regimes.filter((row) => row.regime === 'bullish').map((row) => row.expectancyPct));
    const regimeBearish = getSummaryValue(regimes.filter((row) => row.regime === 'bearish').map((row) => row.expectancyPct));
    const regimeNeutral = getSummaryValue(regimes.filter((row) => row.regime === 'neutral').map((row) => row.expectancyPct));
    const walkForwardExpectancies = walkForward.map((row) => row.expectancyPct);
    const walkForwardNet = walkForward.map((row) => row.netExpectancyPct);
    const walkForwardStability = getSummaryStability(walkForwardExpectancies);
    const netStability = getSummaryStability(walkForwardNet);
    const microstructureCoverage =
      ((manifest.microstructureCoverageSummary || []).find((row) => row.screen === screen)?.coveragePct || 0) / 100;
    const outOfSampleEdge =
      test && train
        ? clamp(1 + (test.netExpectancyPct - train.netExpectancyPct) / 25, 0.82, 1.15)
        : 0.94;

    const factorMultipliers = { ...DEFAULT_CALIBRATION[screen].factorMultipliers };
    const profileContext = {
      sampleBoost,
      expectancyBoost,
      profitFactorBoost,
      walkForwardStability,
      netStability,
      outOfSampleEdge,
      regimeBullish,
      regimeBearish,
      regimeNeutral,
      testNet,
      microstructureCoverage,
    };

    const profiles = FACTOR_PROFILES[screen];
    for (const [key, profile] of Object.entries(profiles)) {
      factorMultipliers[key] = getFactorProfileMultiplier(profile, profileContext);
    }

    const microstructureBiasMultipliers = microstructureRows.reduce<Record<string, number>>((acc, row) => {
      acc[row.bias] = getEvidenceMultiplier(row.netExpectancyPct, row.sampleSize, walkForwardStability);
      return acc;
    }, {});

    const optionsRegimeMultipliers = {
      volSkew: volSkewRows.reduce<Record<string, number>>((acc, row) => {
        acc[row.regime] = getEvidenceMultiplier(row.netExpectancyPct, row.sampleSize, netStability);
        return acc;
      }, {}),
      gamma: gammaRows.reduce<Record<string, number>>((acc, row) => {
        acc[row.regime] = getEvidenceMultiplier(row.netExpectancyPct, row.sampleSize, walkForwardStability);
        return acc;
      }, {}),
    };

    next[screen] = {
      baseMultiplier: Number(
        clamp(
          (screen === 'intraday-momentum' ? 0.88 : screen === 'swing-setups' ? 1.04 : screen === 'breakout-watchlist' ? 0.94 : 1) *
            reliability *
            directionalBias *
            profitFactorBoost *
            outOfSampleEdge,
          0.6,
          1.28
        ).toFixed(2)
      ),
      optionsMultiplier: Number(clamp(sampleBoost * expectancyBoost * driftPenalty * regimePenalty * walkForwardStability, 0.65, 1.3).toFixed(2)),
      microstructureMultiplier: Number(
        clamp(
          (screen === 'intraday-momentum' ? 0.82 : 0.85) * expectancyBoost * driftPenalty * walkForwardPenalty * netStability,
          0.5,
          1.25
        ).toFixed(2)
      ),
      factorMultipliers,
      optionsRegimeMultipliers,
      microstructureBiasMultipliers,
    };
  });

  return next;
}
