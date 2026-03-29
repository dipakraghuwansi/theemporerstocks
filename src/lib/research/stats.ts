import { StockScreenType } from '@/lib/stockUniverse';
import {
  MicrostructureCoverageSummary,
  MicrostructureResearchSummary,
  ProbabilityEstimate,
  ResearchManifest,
  ScreenOutcomeLabel,
  ScreenResearchSummary,
  ScreenStabilitySummary,
  SymbolResearchStats,
  VolSurfaceResearchSummary,
} from '@/lib/research/types';

const SCREENS: StockScreenType[] = ['intraday-momentum', 'swing-setups', 'mean-reversion', 'breakout-watchlist'];

function summarizeLabels(screen: StockScreenType, labels: ScreenOutcomeLabel[]): ScreenResearchSummary {
  const wins = labels.filter((label) => label.win);
  const losses = labels.filter((label) => !label.win);
  const avgWinPct = wins.length > 0 ? wins.reduce((sum, label) => sum + label.netReturnPct, 0) / wins.length : 0;
  const avgLossPct = losses.length > 0 ? losses.reduce((sum, label) => sum + Math.abs(label.netReturnPct), 0) / losses.length : 0;
  const winRate = labels.length > 0 ? wins.length / labels.length : 0;
  const expectancyPct = winRate * avgWinPct - (1 - winRate) * avgLossPct;
  const avgExcessReturnPct =
    labels.length > 0 ? labels.reduce((sum, label) => sum + label.excessReturnPct, 0) / labels.length : 0;
  const netExpectancyPct =
    labels.length > 0 ? labels.reduce((sum, label) => sum + label.netReturnPct, 0) / labels.length : 0;
  const totalWins = wins.reduce((sum, label) => sum + Math.max(label.netReturnPct, 0), 0);
  const totalLosses = losses.reduce((sum, label) => sum + Math.abs(label.netReturnPct), 0);

  return {
    screen,
    sampleSize: labels.length,
    wins: wins.length,
    losses: losses.length,
    winRate: Number((winRate * 100).toFixed(1)),
    avgWinPct: Number(avgWinPct.toFixed(2)),
    avgLossPct: Number(avgLossPct.toFixed(2)),
    expectancyPct: Number(expectancyPct.toFixed(2)),
    avgExcessReturnPct: Number(avgExcessReturnPct.toFixed(2)),
    netExpectancyPct: Number(netExpectancyPct.toFixed(2)),
    profitFactor: Number((totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? 99 : 0).toFixed(2)),
  };
}

function summarizeByDimension(
  labels: ScreenOutcomeLabel[],
  discriminator: (label: ScreenOutcomeLabel) => string
) {
  return Array.from(
    labels.reduce<Map<string, ScreenOutcomeLabel[]>>((acc, label) => {
      const key = `${label.screen}:${discriminator(label)}`;
      const rows = acc.get(key) || [];
      rows.push(label);
      acc.set(key, rows);
      return acc;
    }, new Map())
  );
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function buildResearchManifest(labels: ScreenOutcomeLabel[]): ResearchManifest {
  const screens = SCREENS.map((screen) => summarizeLabels(screen, labels.filter((label) => label.screen === screen)));
  const bySymbol = Array.from(
    labels.reduce<Map<string, ScreenOutcomeLabel[]>>((acc, label) => {
      const key = `${label.screen}:${label.symbol}`;
      const existing = acc.get(key) || [];
      existing.push(label);
      acc.set(key, existing);
      return acc;
    }, new Map())
  ).map(([key, grouped]) => {
    const [screen, symbol] = key.split(':') as [StockScreenType, string];
    const summary = summarizeLabels(screen, grouped);

    return {
      symbol,
      screen,
      sampleSize: summary.sampleSize,
      wins: summary.wins,
      losses: summary.losses,
      winRate: summary.winRate,
      avgWinPct: summary.avgWinPct,
      avgLossPct: summary.avgLossPct,
      expectancyPct: summary.expectancyPct,
      avgExcessReturnPct: summary.avgExcessReturnPct,
      netExpectancyPct: summary.netExpectancyPct,
    } satisfies SymbolResearchStats;
  });

  const splitSummary = summarizeByDimension(labels, (label) => label.split).map(([key, grouped]) => {
    const [screen, split] = key.split(':') as [StockScreenType, 'train' | 'test'];
    return {
      ...summarizeLabels(screen, grouped),
      split,
    };
  });

  const regimeSummary = summarizeByDimension(labels, (label) => label.regime).map(([key, grouped]) => {
    const [screen, regime] = key.split(':') as [StockScreenType, 'bullish' | 'bearish' | 'neutral'];
    return {
      ...summarizeLabels(screen, grouped),
      regime,
    };
  });

  const walkForwardSummary = summarizeByDimension(labels, (label) => label.walkForwardBucket).map(([key, grouped]) => {
    const [screen, bucket] = key.split(':') as [StockScreenType, string];
    return {
      ...summarizeLabels(screen, grouped),
      bucket,
    };
  });

  const stabilitySummary: ScreenStabilitySummary[] = SCREENS.map((screen) => {
    const train = splitSummary.find((row) => row.screen === screen && row.split === 'train');
    const test = splitSummary.find((row) => row.screen === screen && row.split === 'test');
    const regimes = regimeSummary.filter((row) => row.screen === screen);
    const walkForward = walkForwardSummary.filter((row) => row.screen === screen);
    const regimeExpectancies = regimes.map((row) => row.expectancyPct);
    const walkForwardExpectancies = walkForward.map((row) => row.expectancyPct);
    const regimeSpread =
      regimeExpectancies.length > 1 ? Math.max(...regimeExpectancies) - Math.min(...regimeExpectancies) : 0;
    const walkForwardSpread =
      walkForwardExpectancies.length > 1 ? Math.max(...walkForwardExpectancies) - Math.min(...walkForwardExpectancies) : 0;
    const drift = (test?.expectancyPct ?? 0) - (train?.expectancyPct ?? 0);
    const stabilityScore = Math.max(
      0,
      Math.min(
        100,
        100 -
          Math.abs(drift) * 12 -
          walkForwardSpread * 8 -
          regimeSpread * 6 +
          (test?.netExpectancyPct ?? 0) * 4
      )
    );

    return {
      screen,
      trainExpectancyPct: Number((train?.expectancyPct ?? 0).toFixed(2)),
      testExpectancyPct: Number((test?.expectancyPct ?? 0).toFixed(2)),
      trainNetExpectancyPct: Number((train?.netExpectancyPct ?? 0).toFixed(2)),
      testNetExpectancyPct: Number((test?.netExpectancyPct ?? 0).toFixed(2)),
      driftPct: Number(drift.toFixed(2)),
      walkForwardSpreadPct: Number(walkForwardSpread.toFixed(2)),
      regimeSpreadPct: Number(regimeSpread.toFixed(2)),
      stabilityScore: Number(stabilityScore.toFixed(1)),
    };
  });

  const microstructureSummary: MicrostructureResearchSummary[] = Array.from(
    labels.reduce<Map<string, ScreenOutcomeLabel[]>>((acc, label) => {
      if (label.interval !== 'minute') return acc;
      const bias = label.microstructureBias || 'unavailable';
      const key = `${label.screen}:${bias}`;
      const rows = acc.get(key) || [];
      rows.push(label);
      acc.set(key, rows);
      return acc;
    }, new Map())
  ).map(([key, grouped]) => {
    const [screen, bias] = key.split(':') as [StockScreenType, MicrostructureResearchSummary['bias']];
    const summary = summarizeLabels(screen, grouped);
    const vpinValues = grouped
      .map((label) => label.vpin)
      .filter((value): value is number => value !== null && value !== undefined);
    const microEdgeValues = grouped
      .map((label) => label.micropriceEdgePct)
      .filter((value): value is number => value !== null && value !== undefined);
    const rollingOfiValues = grouped
      .map((label) => label.rollingOfi)
      .filter((value): value is number => value !== null && value !== undefined);
    const tradePressureValues = grouped
      .map((label) => label.tradePressureScore)
      .filter((value): value is number => value !== null && value !== undefined);

    return {
      screen,
      bias,
      sampleSize: summary.sampleSize,
      wins: summary.wins,
      losses: summary.losses,
      winRate: summary.winRate,
      expectancyPct: summary.expectancyPct,
      netExpectancyPct: summary.netExpectancyPct,
      avgVpin: vpinValues.length > 0 ? Number(average(vpinValues).toFixed(3)) : null,
      avgMicropriceEdgePct: microEdgeValues.length > 0 ? Number(average(microEdgeValues).toFixed(4)) : null,
      avgRollingOfi: rollingOfiValues.length > 0 ? Number(average(rollingOfiValues).toFixed(2)) : null,
      avgTradePressureScore: tradePressureValues.length > 0 ? Number(average(tradePressureValues).toFixed(3)) : null,
    };
  });

  const microstructureCoverageSummary: MicrostructureCoverageSummary[] = SCREENS.map((screen) => {
    const minuteRows = labels.filter((label) => label.screen === screen && label.interval === 'minute');
    const coveredLabels = minuteRows.filter((label) => label.microstructureBias && label.microstructureBias !== 'unavailable').length;
    const unavailableLabels = minuteRows.length - coveredLabels;
    return {
      screen,
      totalMinuteLabels: minuteRows.length,
      coveredLabels,
      unavailableLabels,
      coveragePct: minuteRows.length > 0 ? Number(((coveredLabels / minuteRows.length) * 100).toFixed(1)) : 0,
    };
  });

  const volSurfaceSummary: VolSurfaceResearchSummary[] = [
    ...Array.from(
      labels.reduce<Map<string, ScreenOutcomeLabel[]>>((acc, label) => {
        const regime = label.volSkewRegime || 'unavailable';
        const key = `${label.screen}:vol_skew:${regime}`;
        const rows = acc.get(key) || [];
        rows.push(label);
        acc.set(key, rows);
        return acc;
      }, new Map())
    ).map(([key, grouped]) => {
      const [screen, family, regime] = key.split(':') as [StockScreenType, 'vol_skew', string];
      const summary = summarizeLabels(screen, grouped);
      const atmIvValues = grouped
        .map((label) => label.atmIv)
        .filter((value): value is number => value !== null && value !== undefined);
      const skewValues = grouped
        .map((label) => label.nearAtmVolSkew)
        .filter((value): value is number => value !== null && value !== undefined);
      const termValues = grouped
        .map((label) => label.termStructureSlope)
        .filter((value): value is number => value !== null && value !== undefined);

      return {
        screen,
        family,
        regime,
        sampleSize: summary.sampleSize,
        wins: summary.wins,
        losses: summary.losses,
        winRate: summary.winRate,
        expectancyPct: summary.expectancyPct,
        netExpectancyPct: summary.netExpectancyPct,
        avgAtmIv: atmIvValues.length > 0 ? Number(average(atmIvValues).toFixed(2)) : null,
        avgNearAtmSkew: skewValues.length > 0 ? Number(average(skewValues).toFixed(2)) : null,
        avgTermSlope: termValues.length > 0 ? Number(average(termValues).toFixed(2)) : null,
      };
    }),
    ...Array.from(
      labels.reduce<Map<string, ScreenOutcomeLabel[]>>((acc, label) => {
        const regime = label.gammaRegime || 'unavailable';
        const key = `${label.screen}:gamma:${regime}`;
        const rows = acc.get(key) || [];
        rows.push(label);
        acc.set(key, rows);
        return acc;
      }, new Map())
    ).map(([key, grouped]) => {
      const [screen, family, regime] = key.split(':') as [StockScreenType, 'gamma', string];
      const summary = summarizeLabels(screen, grouped);
      const atmIvValues = grouped
        .map((label) => label.atmIv)
        .filter((value): value is number => value !== null && value !== undefined);
      const skewValues = grouped
        .map((label) => label.nearAtmVolSkew)
        .filter((value): value is number => value !== null && value !== undefined);
      const termValues = grouped
        .map((label) => label.termStructureSlope)
        .filter((value): value is number => value !== null && value !== undefined);

      return {
        screen,
        family,
        regime,
        sampleSize: summary.sampleSize,
        wins: summary.wins,
        losses: summary.losses,
        winRate: summary.winRate,
        expectancyPct: summary.expectancyPct,
        netExpectancyPct: summary.netExpectancyPct,
        avgAtmIv: atmIvValues.length > 0 ? Number(average(atmIvValues).toFixed(2)) : null,
        avgNearAtmSkew: skewValues.length > 0 ? Number(average(skewValues).toFixed(2)) : null,
        avgTermSlope: termValues.length > 0 ? Number(average(termValues).toFixed(2)) : null,
      };
    }),
  ];

  return {
    generatedAt: new Date().toISOString(),
    interval: 'mixed',
    config: {
      benchmarkSymbol: 'NIFTY50_BENCHMARK',
      slippagePct: 0.15,
      costPct: 0.1,
      noLookaheadValidation: true,
    },
    screens,
    bySymbol: bySymbol.sort((a, b) => b.expectancyPct - a.expectancyPct),
    splitSummary,
    regimeSummary,
    walkForwardSummary,
    stabilitySummary,
    microstructureSummary,
    microstructureCoverageSummary,
    volSurfaceSummary,
    labels,
  };
}

export function getProbabilityEstimate(
  manifest: ResearchManifest | null,
  screen: StockScreenType,
  symbol: string
): ProbabilityEstimate | null {
  if (!manifest) return null;

  const symbolStats = manifest.bySymbol.find((row) => row.screen === screen && row.symbol === symbol);
  if (symbolStats && symbolStats.sampleSize >= 4) {
    return {
      sampleSize: symbolStats.sampleSize,
      winRate: symbolStats.winRate,
      avgWinPct: symbolStats.avgWinPct,
      avgLossPct: symbolStats.avgLossPct,
      expectancyPct: symbolStats.expectancyPct,
      avgExcessReturnPct: symbolStats.avgExcessReturnPct,
      netExpectancyPct: symbolStats.netExpectancyPct,
    };
  }

  const screenStats = manifest.screens.find((row) => row.screen === screen);
  if (!screenStats || screenStats.sampleSize === 0) return null;

  return {
    sampleSize: screenStats.sampleSize,
    winRate: screenStats.winRate,
    avgWinPct: screenStats.avgWinPct,
    avgLossPct: screenStats.avgLossPct,
    expectancyPct: screenStats.expectancyPct,
    avgExcessReturnPct: screenStats.avgExcessReturnPct,
    netExpectancyPct: screenStats.netExpectancyPct,
  };
}
