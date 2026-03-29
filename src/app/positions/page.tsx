"use client";

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  BarChart3,
  BriefcaseBusiness,
  CircleDollarSign,
  Receipt,
  RefreshCw,
  ShieldCheck,
  Target,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ModelPortfolioExecution, ModelPortfolioSummary } from '@/lib/modelPortfolio/types';

type PortfolioApiPayload = {
  success?: boolean;
  error?: string;
  needsLogin?: boolean;
  data?: ModelPortfolioSummary;
};

type PortfolioExecutionsPayload = {
  success?: boolean;
  error?: string;
  needsLogin?: boolean;
  data?: {
    mode: 'PAPER';
    persistence: 'MONGODB';
    approvalPhrase: string;
    latestRebalanceId: string | null;
    latestRebalanceGeneratedAt: string | null;
    latestRebalanceActionCount: number;
    latestRebalanceNotional: number;
    executions: ModelPortfolioExecution[];
  };
};

const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

function formatCurrency(value: number) {
  return currencyFormatter.format(value || 0);
}

function formatSignedCurrency(value: number) {
  const sign = value > 0 ? '+' : '';
  return `${sign}${formatCurrency(value)}`;
}

function formatPct(value: number, digits = 2) {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(digits)}%`;
}

function formatAllocationPct(value: number) {
  return `${value.toFixed(2)}%`;
}

function formatWholeNumber(value: number) {
  return Math.round(value || 0).toLocaleString('en-IN');
}

function statTone(value: number) {
  if (value > 0) return 'text-emerald-300';
  if (value < 0) return 'text-rose-300';
  return 'text-slate-300';
}

function formatDateLabel(value: string) {
  try {
    return new Intl.DateTimeFormat('en-IN', { month: 'short', day: 'numeric' }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatDateTimeLabel(value: string) {
  try {
    return new Intl.DateTimeFormat('en-IN', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Failed to load model portfolio.';
}

export default function PositionsPage() {
  const [payload, setPayload] = useState<PortfolioApiPayload | null>(null);
  const [executionsPayload, setExecutionsPayload] = useState<PortfolioExecutionsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [recomputing, setRecomputing] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [approvalText, setApprovalText] = useState('');
  const [executionFeedback, setExecutionFeedback] = useState<string | null>(null);

  const loadSummary = async (method: 'GET' | 'POST' = 'GET') => {
    const isRecompute = method === 'POST';
    if (isRecompute) {
      setRecomputing(true);
    } else {
      setLoading(true);
    }

    try {
      const response = await fetch('/api/portfolio/model', {
        method,
        cache: 'no-store',
      });
      const data = (await response.json()) as PortfolioApiPayload;
      setPayload(data);
    } catch (error: unknown) {
      setPayload({
        error: getErrorMessage(error),
      });
    } finally {
      setLoading(false);
      setRecomputing(false);
    }
  };

  const loadExecutions = async () => {
    try {
      const response = await fetch('/api/portfolio/model/executions', {
        cache: 'no-store',
      });
      const data = (await response.json()) as PortfolioExecutionsPayload;
      setExecutionsPayload(data);
    } catch (error: unknown) {
      setExecutionsPayload({
        error: getErrorMessage(error),
      });
    }
  };

  const submitExecution = async () => {
    setExecuting(true);
    setExecutionFeedback(null);

    try {
      const response = await fetch('/api/portfolio/model/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          confirmationText: approvalText,
        }),
      });
      const data = (await response.json()) as { error?: string; needsLogin?: boolean; data?: ModelPortfolioExecution };
      if (!response.ok || data.error) {
        throw new Error(data.error || 'Failed to record the paper-review checkpoint.');
      }

      setExecutionFeedback(
        data.data?.status === 'PARTIAL'
          ? 'Paper review checkpoint was saved, but some rebalance rows did not match saved Mongo paper trades.'
          : data.data?.status === 'FAILED'
            ? 'Paper review checkpoint was saved, but no matching Mongo paper trades were found for that rebalance.'
            : 'Paper review checkpoint was saved. The audit trail below now points to the latest Mongo paper trades.'
      );
      setApprovalText('');
      await Promise.all([loadSummary(), loadExecutions()]);
    } catch (error: unknown) {
      setExecutionFeedback(getErrorMessage(error));
    } finally {
      setExecuting(false);
    }
  };

  useEffect(() => {
    loadSummary();
    loadExecutions();
  }, []);

  const summary = payload?.data || null;
  const executionConfig = executionsPayload?.data;
  const recentExecutions = executionConfig?.executions || [];
  const history = useMemo(
    () =>
      (summary?.history || []).map((snapshot) => ({
        date: formatDateLabel(snapshot.asOf),
        nav: Math.round(snapshot.nav),
        drawdown: Number(snapshot.drawdownPct.toFixed(2)),
      })),
    [summary?.history]
  );

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 px-6 py-16 text-slate-100">
        <div className="mx-auto max-w-7xl">
          <div className="animate-pulse rounded-3xl border border-white/10 bg-white/5 p-10">
            <div className="h-4 w-40 rounded bg-white/10" />
            <div className="mt-4 h-10 w-96 rounded bg-white/10" />
            <div className="mt-8 grid gap-4 md:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-28 rounded-2xl bg-white/10" />
              ))}
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (payload?.needsLogin) {
    return (
      <main className="min-h-screen bg-slate-950 px-6 py-16 text-slate-100">
        <div className="mx-auto max-w-4xl rounded-3xl border border-amber-400/30 bg-amber-500/10 p-10">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-200">Model Portfolio</p>
          <h1 className="mt-4 text-4xl font-black">Kite login is required.</h1>
          <p className="mt-4 text-lg text-amber-50/80">
            The model portfolio depends on live quotes, the cached research foundation, and the existing screener runtime. Log in to Kite first, then reload this page.
          </p>
        </div>
      </main>
    );
  }

  if (!summary || payload?.error) {
    return (
      <main className="min-h-screen bg-slate-950 px-6 py-16 text-slate-100">
        <div className="mx-auto max-w-4xl rounded-3xl border border-rose-400/30 bg-rose-500/10 p-10">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-rose-200">Model Portfolio</p>
          <h1 className="mt-4 text-4xl font-black">Portfolio load failed.</h1>
          <p className="mt-4 text-lg text-rose-50/80">{payload?.error || 'An unknown error occurred.'}</p>
        </div>
      </main>
    );
  }

  const snapshot = summary.snapshot;
  const reviewableActionCount = executionConfig?.latestRebalanceActionCount ?? 0;
  const reviewableNotional = executionConfig?.latestRebalanceNotional ?? 0;

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-16 text-slate-100">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.18),_transparent_38%),linear-gradient(135deg,_rgba(15,23,42,0.98),_rgba(2,6,23,0.92))] p-8 shadow-2xl shadow-slate-950/40">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-300">Model Portfolio</p>
              <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">{summary.portfolio.name}</h1>
              <p className="mt-4 max-w-2xl text-base text-slate-300 sm:text-lg">
                The stock positions area is now running a regime-aware, research-backed model book built from the existing screener, alpha blend, and risk controls.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-full border border-sky-300/30 bg-sky-400/10 px-4 py-2 text-sm font-semibold text-sky-100">
                {summary.regime.label} · {(summary.regime.confidence * 100).toFixed(0)}% confidence
              </div>
              <Link
                href="/positions/performance"
                className="inline-flex items-center gap-2 rounded-full border border-sky-300/30 bg-sky-400/10 px-4 py-2 text-sm font-semibold text-sky-100 transition hover:bg-sky-400/20"
              >
                <BarChart3 className="h-4 w-4" />
                View Backtest
              </Link>
              <button
                type="button"
                onClick={() => loadSummary('POST')}
                disabled={recomputing}
                className="inline-flex items-center gap-2 rounded-full border border-emerald-300/30 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${recomputing ? 'animate-spin' : ''}`} />
                {recomputing ? 'Recomputing' : 'Recompute Portfolio'}
              </button>
            </div>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon={<Wallet className="h-5 w-5" />}
              label="NAV"
              value={formatCurrency(snapshot?.nav || summary.portfolio.baseCapital)}
              detail={`Cash ${formatCurrency(snapshot?.cash || summary.portfolio.cash)}`}
            />
            <StatCard
              icon={<TrendingUp className="h-5 w-5" />}
              label="Daily Return"
              value={formatPct(snapshot?.dayReturnPct || 0)}
              valueClassName={statTone(snapshot?.dayReturnPct || 0)}
              detail={`Gross exposure ${(snapshot?.grossExposure || 0).toFixed(1)}%`}
            />
            <StatCard
              icon={<ShieldCheck className="h-5 w-5" />}
              label="Risk"
              value={`VaR ${formatPct(snapshot?.var95Pct || 0)}`}
              detail={`CVaR ${formatPct(snapshot?.cvar95Pct || 0)} · Beta ${(snapshot?.weightedBeta || 0).toFixed(2)}`}
            />
            <StatCard
              icon={<Target className="h-5 w-5" />}
              label="Drawdown"
              value={formatPct(-(snapshot?.drawdownPct || 0))}
              valueClassName="text-amber-200"
              detail={`${summary.holdings.length} holdings · Target cash ${(summary.regime.targetCashWeight * 100).toFixed(0)}%`}
            />
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <StatCard
              icon={<CircleDollarSign className="h-5 w-5" />}
              label="Realized P&L"
              value={formatSignedCurrency(summary.metrics.realizedPnl)}
              valueClassName={statTone(summary.metrics.realizedPnl)}
              detail="Closed-paper trade profit after trims and exits"
            />
            <StatCard
              icon={<TrendingUp className="h-5 w-5" />}
              label="Unrealized P&L"
              value={formatSignedCurrency(summary.metrics.unrealizedPnl)}
              valueClassName={statTone(summary.metrics.unrealizedPnl)}
              detail={`Open cost basis ${formatCurrency(summary.metrics.openPositionsCostBasis)}`}
            />
            <StatCard
              icon={<Receipt className="h-5 w-5" />}
              label="Fees Paid"
              value={formatCurrency(summary.metrics.totalFees)}
              detail="Paper execution costs charged to the model book"
            />
            <StatCard
              icon={<ArrowLeftRight className="h-5 w-5" />}
              label="30D Turnover"
              value={formatAllocationPct(summary.metrics.turnoverPct30d)}
              detail="Gross traded notional over the last 30 days"
            />
            <StatCard
              icon={<Target className="h-5 w-5" />}
              label="Weight Drift"
              value={formatAllocationPct(summary.metrics.driftPct)}
              detail="Absolute gap between live and target weights"
            />
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
          <div className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Holdings</p>
                <h2 className="mt-2 text-2xl font-bold">Current Model Book</h2>
              </div>
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-300">
                {summary.holdings.length} positions
              </div>
            </div>

            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.16em] text-slate-400">
                  <tr>
                    <th className="pb-3">Symbol</th>
                    <th className="pb-3">Target</th>
                    <th className="pb-3">Live</th>
                    <th className="pb-3">Drift</th>
                    <th className="pb-3">Shares</th>
                    <th className="pb-3">Price</th>
                    <th className="pb-3">Day</th>
                    <th className="pb-3">P&L</th>
                    <th className="pb-3">Score</th>
                    <th className="pb-3">Confidence</th>
                    <th className="pb-3">Stop / Target</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.holdings.map((holding) => (
                    <tr key={holding.id} className="border-t border-white/5 align-top">
                      <td className="py-4 pr-6">
                        <div className="font-semibold text-slate-100">{holding.symbol}</div>
                        <div className="mt-1 text-xs text-slate-400">
                          {holding.sector} · {holding.sourceScreen.replace('-', ' ')}
                        </div>
                      </td>
                      <td className="py-4 pr-6 text-slate-200">{formatAllocationPct(holding.targetWeight * 100)}</td>
                      <td className="py-4 pr-6 text-slate-200">{formatAllocationPct(holding.liveWeight * 100)}</td>
                      <td className={`py-4 pr-6 font-semibold ${statTone(-Math.abs(holding.weightDriftPct))}`}>
                        {formatAllocationPct(Math.abs(holding.weightDriftPct))}
                      </td>
                      <td className="py-4 pr-6 text-slate-200">{formatWholeNumber(holding.shares)}</td>
                      <td className="py-4 pr-6 text-slate-200">{formatCurrency(holding.currentPrice)}</td>
                      <td className={`py-4 pr-6 font-semibold ${statTone(holding.dayChangePct)}`}>{formatPct(holding.dayChangePct)}</td>
                      <td className="py-4 pr-6">
                        <div className={`font-semibold ${statTone(holding.unrealizedPnl)}`}>
                          {formatSignedCurrency(holding.unrealizedPnl)}
                        </div>
                        <div className={`mt-1 text-xs ${statTone(holding.unrealizedPnlPct)}`}>{formatPct(holding.unrealizedPnlPct)}</div>
                      </td>
                      <td className="py-4 pr-6">
                        <div className="font-semibold text-slate-100">{holding.portfolioScore.toFixed(1)}</div>
                        <div className="mt-1 text-xs text-slate-400">Screener {holding.score.toFixed(1)}</div>
                      </td>
                      <td className="py-4 pr-6">
                        <div className="font-semibold text-slate-100">{holding.confidenceLabel}</div>
                        <div className="mt-1 text-xs text-slate-400">{holding.supportLabel}</div>
                      </td>
                      <td className="py-4">
                        <div className="text-slate-100">SL {formatCurrency(holding.stopLoss)}</div>
                        <div className="mt-1 text-xs text-slate-400">
                          TGT {holding.targetPrice ? formatCurrency(holding.targetPrice) : 'n/a'}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6">
            <div className="flex items-center gap-3">
              <BarChart3 className="h-5 w-5 text-sky-300" />
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">History</p>
                <h2 className="mt-1 text-2xl font-bold">NAV & Drawdown</h2>
              </div>
            </div>

            <div className="mt-6 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={history}>
                  <defs>
                    <linearGradient id="navFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#38bdf8" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 12 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} tickLine={false} axisLine={false} width={80} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(2,6,23,0.95)',
                      border: '1px solid rgba(148,163,184,0.2)',
                      borderRadius: 16,
                    }}
                  />
                  <Area type="monotone" dataKey="nav" stroke="#38bdf8" fill="url(#navFill)" strokeWidth={2.5} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-4 rounded-2xl border border-white/5 bg-slate-950/50 p-4 text-sm text-slate-300">
              <div className="flex items-center justify-between">
                <span>Target exposure</span>
                <span className="font-semibold text-slate-100">{(summary.regime.targetGrossExposure * 100).toFixed(0)}%</span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span>Target cash</span>
                <span className="font-semibold text-slate-100">{(summary.regime.targetCashWeight * 100).toFixed(0)}%</span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span>Max single name</span>
                <span className="font-semibold text-slate-100">{(summary.regime.maxSingleNameWeight * 100).toFixed(0)}%</span>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr_1fr]">
          <div className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6">
            <div className="flex items-center gap-3">
              <BriefcaseBusiness className="h-5 w-5 text-emerald-300" />
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Rebalance</p>
                <h2 className="mt-1 text-2xl font-bold">Preview</h2>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {(summary.rebalancePreview?.actions || []).length === 0 ? (
                <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-4 text-sm text-emerald-100">
                  The live book already aligns with the latest constrained target weights.
                </div>
              ) : (
                summary.rebalancePreview?.actions.map((action, index) => (
                  <div key={`${action.symbol}-${index}`} className="rounded-2xl border border-white/5 bg-slate-950/50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-base font-semibold text-slate-100">
                          {action.action} {action.symbol}
                        </div>
                        <div className="mt-1 text-xs text-slate-400">{action.reason}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-slate-100">{formatCurrency(action.amount)}</div>
                        <div className="mt-1 text-xs text-slate-400">
                          {formatAllocationPct(action.currentWeight * 100)} → {formatAllocationPct(action.targetWeight * 100)}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-3 text-xs text-slate-300">
                      <MetricPill label="Shares" value={`${formatWholeNumber(action.executedShares)} / ${formatWholeNumber(action.targetShares)}`} />
                      <MetricPill label="Fees" value={formatCurrency(action.fees)} />
                      <MetricPill
                        label="Realized"
                        value={action.realizedPnl ? formatSignedCurrency(action.realizedPnl) : formatCurrency(0)}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6">
            <div className="flex items-center gap-3">
              <ArrowLeftRight className="h-5 w-5 text-cyan-300" />
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Execution</p>
                <h2 className="mt-1 text-2xl font-bold">Recent Trades</h2>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {summary.recentTrades.length === 0 ? (
                <div className="rounded-2xl border border-white/5 bg-slate-950/50 p-4 text-sm text-slate-300">
                  No paper fills have been recorded yet. The first recompute will initialize the trade ledger.
                </div>
              ) : (
                summary.recentTrades.map((trade) => (
                  <div key={trade.id} className="rounded-2xl border border-white/5 bg-slate-950/50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className={`text-base font-semibold ${trade.side === 'BUY' ? 'text-emerald-200' : 'text-amber-200'}`}>
                          {trade.side} {trade.symbol}
                        </div>
                        <div className="mt-1 text-xs text-slate-400">{formatDateTimeLabel(trade.executedAt)} · {trade.reason}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-slate-100">{formatCurrency(trade.grossAmount)}</div>
                        <div className="mt-1 text-xs text-slate-400">
                          {formatWholeNumber(trade.shares)} @ {formatCurrency(trade.price)}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-3 text-xs text-slate-300">
                      <MetricPill label="Cash Impact" value={formatSignedCurrency(trade.netCashImpact)} />
                      <MetricPill label="Fees" value={formatCurrency(trade.fees)} />
                      <MetricPill label="Realized" value={formatSignedCurrency(trade.realizedPnl)} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6">
            <div className="flex items-center gap-3">
              <Target className="h-5 w-5 text-violet-300" />
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Candidates</p>
                <h2 className="mt-1 text-2xl font-bold">Top Ranked Names</h2>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {summary.topCandidates.map((candidate) => (
                <div key={`${candidate.symbol}-${candidate.sourceScreen}`} className="rounded-2xl border border-white/5 bg-slate-950/50 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-base font-semibold text-slate-100">
                        {candidate.symbol}
                        <span className="ml-2 text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                          {candidate.sourceScreenLabel}
                        </span>
                      </div>
                      <div className="mt-1 text-sm text-slate-300">{candidate.screenerResult.thesis}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-slate-100">{candidate.portfolioScore.toFixed(1)}</div>
                      <div className="text-xs text-slate-400">Portfolio score</div>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-slate-300">
                    <MetricPill label="Alpha" value={candidate.alphaScore.toFixed(1)} />
                    <MetricPill label="Setup" value={candidate.setupScore.toFixed(1)} />
                    <MetricPill label="Evidence" value={candidate.evidenceScore.toFixed(1)} />
                    <MetricPill label="Overlay" value={candidate.overlayScore.toFixed(1)} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-rose-300" />
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Paper Review</p>
                <h2 className="mt-1 text-2xl font-bold">Manual Reconciliation Checkpoint</h2>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-white/5 bg-slate-950/50 p-4 text-sm text-slate-300">
              <div className="flex items-center justify-between gap-4">
                <span>Execution mode</span>
                <span className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-100">
                  {executionConfig?.mode || 'PAPER'}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-4">
                <span>Persistence</span>
                <span className="font-semibold text-slate-100">{executionConfig?.persistence || 'MONGODB'}</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-4">
                <span>Actionable rows</span>
                <span className="font-semibold text-slate-100">{reviewableActionCount}</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-4">
                <span>Estimated notional</span>
                <span className="font-semibold text-slate-100">{formatCurrency(reviewableNotional)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-4">
                <span>Latest saved rebalance</span>
                <span className="font-semibold text-slate-100">
                  {executionConfig?.latestRebalanceGeneratedAt
                    ? formatDateTimeLabel(executionConfig.latestRebalanceGeneratedAt)
                    : 'None yet'}
                </span>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-rose-300/20 bg-rose-400/10 p-4 text-sm text-rose-50/90">
              Recompute Portfolio writes the paper book and trade ledger into MongoDB. This review step never sends broker orders and only records a manual checkpoint against the latest saved rebalance.
            </div>

            <div className="mt-4">
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Type {executionConfig?.approvalPhrase || 'APPROVE'} to record review
              </label>
              <input
                value={approvalText}
                onChange={(event) => setApprovalText(event.target.value)}
                placeholder={executionConfig?.approvalPhrase || 'APPROVE'}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-rose-300/50"
              />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => submitExecution()}
                disabled={
                  executing ||
                  reviewableActionCount === 0 ||
                  approvalText.trim().toUpperCase() !== (executionConfig?.approvalPhrase || 'APPROVE')
                }
                className="inline-flex items-center gap-2 rounded-full border border-rose-300/30 bg-rose-400/10 px-4 py-2 text-sm font-semibold text-rose-100 transition hover:bg-rose-400/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <ShieldCheck className={`h-4 w-4 ${executing ? 'animate-pulse' : ''}`} />
                {executing ? 'Saving Review' : 'Record Review Checkpoint'}
              </button>
              <div className="text-xs text-slate-400">
                No live orders are ever placed from this screen. The checkpoint only reconciles the latest rebalance against saved Mongo paper trades.
              </div>
            </div>

            {executionFeedback ? (
              <div
                className={`mt-4 rounded-2xl border p-4 text-sm ${
                  executionFeedback.toLowerCase().includes('failed') || executionFeedback.toLowerCase().includes('error')
                    ? 'border-rose-300/20 bg-rose-400/10 text-rose-100'
                    : executionFeedback.toLowerCase().includes('did not match')
                      ? 'border-amber-300/20 bg-amber-400/10 text-amber-100'
                    : 'border-emerald-300/20 bg-emerald-400/10 text-emerald-100'
                }`}
              >
                {executionFeedback}
              </div>
            ) : null}
          </div>

          <div className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6">
            <div className="flex items-center gap-3">
              <Receipt className="h-5 w-5 text-sky-300" />
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Audit Trail</p>
                <h2 className="mt-1 text-2xl font-bold">Recent Review Checkpoints</h2>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {recentExecutions.length === 0 ? (
                <div className="rounded-2xl border border-white/5 bg-slate-950/50 p-4 text-sm text-slate-300">
                  No paper-review checkpoints have been recorded yet.
                </div>
              ) : (
                recentExecutions.map((execution) => (
                  <div key={execution.id} className="rounded-2xl border border-white/5 bg-slate-950/50 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="font-semibold text-slate-100">{formatDateTimeLabel(execution.approvedAt)}</div>
                        <div className="mt-1 text-xs text-slate-400">
                          {execution.actionCount} rows · {formatCurrency(execution.totalNotional)} notional
                        </div>
                      </div>
                      <div
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          execution.status === 'RECORDED'
                            ? 'border border-emerald-300/30 bg-emerald-400/10 text-emerald-100'
                            : execution.status === 'PARTIAL'
                              ? 'border border-amber-300/30 bg-amber-400/10 text-amber-100'
                              : execution.status === 'BLOCKED'
                                ? 'border border-sky-300/30 bg-sky-400/10 text-sky-100'
                                : 'border border-rose-300/30 bg-rose-400/10 text-rose-100'
                        }`}
                      >
                        {execution.status}
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-3 text-xs text-slate-300">
                      <MetricPill label="Recorded" value={String(execution.recordedCount)} />
                      <MetricPill label="Failed" value={String(execution.failedCount)} />
                      <MetricPill label="Skipped" value={String(execution.skippedCount)} />
                    </div>

                    <div className="mt-3 space-y-2">
                      {execution.orders.slice(0, 4).map((order) => (
                        <div key={order.id} className="rounded-xl border border-white/5 bg-white/5 px-3 py-2 text-xs text-slate-300">
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-semibold text-slate-100">
                              {order.transactionType} {order.symbol} x {formatWholeNumber(order.quantity)}
                            </span>
                            <span>{order.status}</span>
                          </div>
                          {order.error ? <div className="mt-1 text-rose-200">{order.error}</div> : null}
                          {order.paperTradeId ? <div className="mt-1 text-slate-400">Paper trade {order.paperTradeId}</div> : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-6">
            <div className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6">
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-5 w-5 text-amber-300" />
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Risk Frame</p>
                  <h2 className="mt-1 text-2xl font-bold">Current Limits</h2>
                </div>
              </div>

              <div className="mt-6 space-y-3 text-sm text-slate-300">
                <RiskRow label="One-day VaR 95" value={formatPct(snapshot?.var95Pct || 0)} />
                <RiskRow label="One-day CVaR 95" value={formatPct(snapshot?.cvar95Pct || 0)} />
                <RiskRow label="Weighted beta" value={(snapshot?.weightedBeta || 0).toFixed(2)} />
                <RiskRow label="Gross exposure" value={formatPct(snapshot?.grossExposure || 0)} />
                <RiskRow label="Cash" value={formatCurrency(snapshot?.cash || summary.portfolio.cash)} />
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6">
              <div className="flex items-center gap-3">
                <Receipt className="h-5 w-5 text-sky-300" />
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Paper Ledger</p>
                  <h2 className="mt-1 text-2xl font-bold">Execution Health</h2>
                </div>
              </div>

              <div className="mt-6 space-y-3 text-sm text-slate-300">
                <RiskRow label="Last computed" value={summary.portfolio.lastComputedAt ? formatDateTimeLabel(summary.portfolio.lastComputedAt) : 'Not yet run'} />
                <RiskRow label="Last rebalanced" value={summary.portfolio.lastRebalancedAt ? formatDateTimeLabel(summary.portfolio.lastRebalancedAt) : 'Not yet run'} />
                <RiskRow label="Trades logged" value={formatWholeNumber(summary.recentTrades.length)} />
                <RiskRow label="Open holdings cost" value={formatCurrency(summary.metrics.openPositionsCostBasis)} />
                <RiskRow label="Target positions band" value={`${summary.regime.targetPositionsMin}-${summary.regime.targetPositionsMax}`} />
              </div>
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-slate-300" />
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Notes</p>
                <h2 className="mt-1 text-2xl font-bold">Engine Commentary</h2>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {summary.notes.map((note, index) => (
                <div key={index} className="rounded-2xl border border-white/5 bg-slate-950/50 p-4 text-sm text-slate-300">
                  {note}
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function StatCard({
  icon,
  label,
  value,
  detail,
  valueClassName = 'text-slate-100',
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/45 p-5">
      <div className="flex items-center gap-3 text-slate-300">
        <div className="rounded-full border border-white/10 bg-white/5 p-2">{icon}</div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
      </div>
      <div className={`mt-4 text-2xl font-black ${valueClassName}`}>{value}</div>
      <p className="mt-2 text-sm text-slate-400">{detail}</p>
    </div>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/5 px-3 py-2">
      <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-100">{value}</div>
    </div>
  );
}

function RiskRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-white/5 bg-slate-950/50 px-4 py-3">
      <span>{label}</span>
      <span className="font-semibold text-slate-100">{value}</span>
    </div>
  );
}
