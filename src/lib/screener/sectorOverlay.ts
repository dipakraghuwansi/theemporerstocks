import { StockScreenType } from '@/lib/stockUniverse';
import { ScreenerBaseMetrics, ScreenerScorePayload, ScreenerSectorContextRow } from '@/lib/screener/types';

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function buildSectorContext(results: ScreenerBaseMetrics[]) {
  const sectorMap = new Map<
    string,
    {
      members: number;
      advancing: number;
      aboveSma20: number;
      totalDayChange: number;
    }
  >();

  for (const result of results) {
    const entry = sectorMap.get(result.sector) || {
      members: 0,
      advancing: 0,
      aboveSma20: 0,
      totalDayChange: 0,
    };

    entry.members += 1;
    if (result.dayChangePct > 0) entry.advancing += 1;
    if (result.sma20 !== null && result.lastPrice > result.sma20) entry.aboveSma20 += 1;
    entry.totalDayChange += result.dayChangePct;
    sectorMap.set(result.sector, entry);
  }

  return Array.from(sectorMap.entries()).reduce<Record<string, ScreenerSectorContextRow>>((acc, [sector, stats]) => {
    const breadthPct = Number(((stats.advancing / stats.members) * 100).toFixed(1));
    const aboveSma20Pct = Number(((stats.aboveSma20 / stats.members) * 100).toFixed(1));
    const avgDayChangePct = Number((stats.totalDayChange / stats.members).toFixed(2));
    const sectorScore = Number(
      (
        (breadthPct - 50) * 0.45 +
        (aboveSma20Pct - 50) * 0.25 +
        avgDayChangePct * 8
      ).toFixed(1)
    );

    acc[sector] = {
      sector,
      breadthPct,
      breadthDelta: 0,
      aboveSma20Pct,
      avgDayChangePct,
      sectorScore,
      trend: sectorScore > 4 ? 'upgrade' : sectorScore < -4 ? 'degrade' : 'flat',
    };

    return acc;
  }, {});
}

export function applySectorSnapshot(
  context: Record<string, ScreenerSectorContextRow>,
  previousSnapshot: Array<{
    sector: string;
    breadthPct: number;
    aboveSma20Pct: number;
    avgDayChangePct: number;
    generatedAt: string;
  }>
) {
  const previousMap = new Map(previousSnapshot.map((row) => [row.sector, row]));
  return Object.fromEntries(
    Object.entries(context).map(([sector, row]) => {
      const previous = previousMap.get(sector);
      const breadthDelta = previous ? Number((row.breadthPct - previous.breadthPct).toFixed(1)) : 0;
      const sectorScore = Number(
        (
          (row.breadthPct - 50) * 0.45 +
          breadthDelta * 1.1 +
          (row.aboveSma20Pct - 50) * 0.25 +
          row.avgDayChangePct * 8
        ).toFixed(1)
      );

      return [
        sector,
        {
          ...row,
          breadthDelta,
          sectorScore,
          trend: sectorScore > 4 ? 'upgrade' : sectorScore < -4 ? 'degrade' : 'flat',
        } satisfies ScreenerSectorContextRow,
      ];
    })
  );
}

export function getSectorAdjustment(
  screen: StockScreenType,
  metrics: ScreenerBaseMetrics,
  payload: ScreenerScorePayload
) {
  const sector = payload.sectorContext[metrics.sector];
  if (!sector) {
    return {
      sectorAdjustment: 0,
      sectorState: 'unknown' as const,
      sectorBreadthPct: null,
      sectorBreadthDelta: null,
    };
  }

  const breadthBias = clamp((sector.breadthPct - 50) / 50, -1.2, 1.2);
  const trendBias = clamp(sector.breadthDelta / 25, -1.2, 1.2);
  const participationBias = clamp((sector.aboveSma20Pct - 50) / 50, -1.2, 1.2);
  const dayBias = clamp(sector.avgDayChangePct / 2.5, -1.2, 1.2);
  const directionalBias = breadthBias * 0.38 + trendBias * 0.32 + participationBias * 0.18 + dayBias * 0.12;

  const weightedBias =
    screen === 'mean-reversion'
      ? -directionalBias * 0.55
      : screen === 'intraday-momentum'
        ? directionalBias * 1.15
        : directionalBias;

  return {
    sectorAdjustment: Number((weightedBias * 12).toFixed(1)),
    sectorState: sector.trend,
    sectorBreadthPct: sector.breadthPct,
    sectorBreadthDelta: sector.breadthDelta,
  };
}
