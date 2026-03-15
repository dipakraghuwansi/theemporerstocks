import { calculatePercentChange, calculateSma } from '@/lib/stockIndicators';
import { inferHmmRegime } from '@/lib/screener/hmmRegime';
import { StockScreenType } from '@/lib/stockUniverse';
import { ScreenerBaseMetrics, ScreenerRegime, ScreenerScorePayload } from '@/lib/screener/types';

export function buildRegime(
  results: ScreenerBaseMetrics[],
  benchmarkCloses: number[],
  benchmarkLastPrice: number
): ScreenerRegime {
  const advancingBreadthPct =
    results.length > 0 ? Number(((results.filter((item) => item.dayChangePct > 0).length / results.length) * 100).toFixed(1)) : 0;
  const aboveSma20Pct =
    results.length > 0
      ? Number(
          (
            (results.filter((item) => item.sma20 !== null && item.lastPrice > (item.sma20 || 0)).length / results.length) *
            100
          ).toFixed(1)
        )
      : 0;
  const benchmarkSma20 = calculateSma(benchmarkCloses, 20);
  const benchmarkReturn20d =
    benchmarkCloses.length >= 21
      ? Number(calculatePercentChange(benchmarkLastPrice, benchmarkCloses[benchmarkCloses.length - 21]).toFixed(2))
      : 0;
  const benchmarkPreviousClose =
    benchmarkCloses.length >= 2 ? benchmarkCloses[benchmarkCloses.length - 2] : benchmarkLastPrice;
  const benchmarkDayChangePct = Number(calculatePercentChange(benchmarkLastPrice, benchmarkPreviousClose).toFixed(2));
  const benchmarkAboveSma20 = benchmarkSma20 !== null ? benchmarkLastPrice > benchmarkSma20 : false;

  let name: ScreenerRegime['name'] = 'mixed';
  if (benchmarkAboveSma20 && benchmarkReturn20d > 1.5 && advancingBreadthPct >= 58 && aboveSma20Pct >= 55) {
    name = 'trend';
  } else if (!benchmarkAboveSma20 && benchmarkDayChangePct < 0 && advancingBreadthPct <= 42 && aboveSma20Pct <= 45) {
    name = 'risk-off';
  } else if (benchmarkDayChangePct > 0.6 && advancingBreadthPct >= 52 && !benchmarkAboveSma20) {
    name = 'rebound';
  }

  const confidenceParts = [
    Math.min(Math.abs(advancingBreadthPct - 50) / 25, 1),
    Math.min(Math.abs(aboveSma20Pct - 50) / 25, 1),
    Math.min(Math.abs(benchmarkReturn20d) / 4, 1),
    Math.min(Math.abs(benchmarkDayChangePct) / 1.5, 1),
  ];
  const confidence = Number(
    (
      0.45 +
      (confidenceParts.reduce((sum, value) => sum + value, 0) / confidenceParts.length) * 0.55
    ).toFixed(2)
  );

  const fallbackRegime = {
    name,
    label:
      name === 'trend'
        ? 'Trend Regime'
        : name === 'risk-off'
          ? 'Risk-Off Regime'
          : name === 'rebound'
            ? 'Rebound Regime'
            : 'Mixed Regime',
    confidence,
    benchmarkDayChangePct,
    benchmarkAboveSma20,
    benchmarkReturn20d,
    advancingBreadthPct,
    aboveSma20Pct,
  };

  return inferHmmRegime(results, benchmarkCloses, benchmarkLastPrice, fallbackRegime);
}

export function getRegimeAdjustment(screen: StockScreenType, payload: ScreenerScorePayload) {
  const { regime } = payload;
  const regimeBias =
    regime.name === 'trend'
      ? screen === 'intraday-momentum'
        ? 8
        : screen === 'breakout-watchlist'
          ? 6
          : screen === 'swing-setups'
            ? 5
            : -4
      : regime.name === 'risk-off'
        ? screen === 'mean-reversion'
          ? 6
          : screen === 'swing-setups'
            ? -4
            : -7
        : regime.name === 'rebound'
          ? screen === 'mean-reversion'
            ? 8
            : screen === 'swing-setups'
              ? 3
              : screen === 'breakout-watchlist'
                ? -1
                : 2
          : screen === 'mean-reversion'
            ? 1
            : 0;

  return Number((regimeBias * regime.confidence).toFixed(1));
}
