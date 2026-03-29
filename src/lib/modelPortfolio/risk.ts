import { readDataset } from '@/lib/historical/cache';
import { ModelPortfolioMetrics, ModelPortfolioPosition, ModelPortfolioSnapshot, ModelPortfolioTrade } from '@/lib/modelPortfolio/types';

function percentile(sortedValues: number[], fraction: number) {
  if (sortedValues.length === 0) return 0;
  const index = Math.max(0, Math.min(sortedValues.length - 1, Math.floor((sortedValues.length - 1) * fraction)));
  return sortedValues[index];
}

function computePositionReturns(symbol: string, lookback = 90) {
  const dataset = readDataset('day', symbol);
  const candles = dataset?.candles || [];
  if (candles.length < 30) return [];

  const closes = candles.slice(-lookback).map((candle) => candle.close);
  return closes.slice(1).map((price, index) => {
    const previous = closes[index];
    return previous > 0 ? (price - previous) / previous : 0;
  });
}

export function computePortfolioRiskMetrics(positions: ModelPortfolioPosition[], snapshots: ModelPortfolioSnapshot[]) {
  const openPositions = positions.filter((position) => position.status === 'OPEN' && position.liveWeight > 0);
  const weightedBeta = Number(
    openPositions.reduce((sum, position) => sum + (position.beta20 || 0) * position.liveWeight, 0).toFixed(3)
  );
  const dayReturnPct = Number(
    (
      openPositions.reduce((sum, position) => sum + position.liveWeight * (position.dayChangePct / 100), 0) * 100
    ).toFixed(2)
  );

  const alignedReturns = openPositions
    .map((position) => ({
      weight: position.liveWeight,
      returns: computePositionReturns(position.symbol),
    }))
    .filter((entry) => entry.returns.length > 20);

  let portfolioReturns: number[] = [];
  if (alignedReturns.length > 0) {
    const minLength = Math.min(...alignedReturns.map((entry) => entry.returns.length));
    portfolioReturns = Array.from({ length: minLength }, (_, index) =>
      alignedReturns.reduce((sum, entry) => sum + entry.returns[entry.returns.length - minLength + index] * entry.weight, 0)
    );
  }

  const sortedReturns = [...portfolioReturns].sort((a, b) => a - b);
  const var95Pct = Number(Math.max(0, -percentile(sortedReturns, 0.05) * 100).toFixed(2));
  const tailReturns = sortedReturns.filter((value) => value <= percentile(sortedReturns, 0.05));
  const cvar95Pct = Number(
    Math.max(
      0,
      -(tailReturns.length > 0 ? tailReturns.reduce((sum, value) => sum + value, 0) / tailReturns.length : 0) * 100
    ).toFixed(2)
  );

  let peak = 0;
  let drawdownPct = 0;
  for (const snapshot of snapshots) {
    peak = Math.max(peak, snapshot.nav);
    if (peak > 0) {
      drawdownPct = Math.min(drawdownPct, (snapshot.nav - peak) / peak);
    }
  }

  return {
    weightedBeta,
    dayReturnPct,
    var95Pct,
    cvar95Pct,
    drawdownPct: Number(Math.abs(drawdownPct * 100).toFixed(2)),
  };
}

export function computePortfolioPaperMetrics(
  positions: ModelPortfolioPosition[],
  trades: ModelPortfolioTrade[],
  nav: number,
  asOf: string
): ModelPortfolioMetrics {
  const unrealizedPnl = Number(
    positions.reduce((sum, position) => sum + position.unrealizedPnl, 0).toFixed(2)
  );
  const openPositionsCostBasis = Number(
    positions.reduce((sum, position) => sum + position.costBasis, 0).toFixed(2)
  );
  const totalFees = Number(trades.reduce((sum, trade) => sum + trade.fees, 0).toFixed(2));
  const realizedPnl = Number(trades.reduce((sum, trade) => sum + trade.realizedPnl, 0).toFixed(2));
  const driftPct = Number(
    (
      positions.reduce((sum, position) => sum + Math.abs(position.liveWeight - position.targetWeight), 0) * 100
    ).toFixed(2)
  );

  const cutoffDate = new Date(asOf);
  cutoffDate.setDate(cutoffDate.getDate() - 30);
  const turnoverGross = trades
    .filter((trade) => new Date(trade.executedAt) >= cutoffDate)
    .reduce((sum, trade) => sum + trade.grossAmount, 0);
  const turnoverPct30d = Number((nav > 0 ? (turnoverGross / nav) * 100 : 0).toFixed(2));

  return {
    realizedPnl,
    unrealizedPnl,
    totalFees,
    turnoverPct30d,
    driftPct,
    openPositionsCostBasis,
  };
}
