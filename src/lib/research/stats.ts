import { StockScreenType } from '@/lib/stockUniverse';
import {
  ProbabilityEstimate,
  ResearchManifest,
  ScreenOutcomeLabel,
  ScreenResearchSummary,
  SymbolResearchStats,
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
