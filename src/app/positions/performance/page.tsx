"use client";

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  BarChart3,
  Gauge,
  RefreshCw,
  ShieldCheck,
  Target,
  TrendingUp,
} from 'lucide-react';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ModelPortfolioPerformanceSummary } from '@/lib/modelPortfolio/types';

type PerformancePayload = {
  success?: boolean;
  error?: string;
  data?: ModelPortfolioPerformanceSummary;
};

const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

function formatCurrency(value: number) {
  return currencyFormatter.format(value || 0);
}

function formatPct(value: number, digits = 2) {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(digits)}%`;
}

function statTone(value: number) {
  if (value > 0) return 'text-emerald-300';
  if (value < 0) return 'text-rose-300';
  return 'text-slate-100';
}

function formatDateLabel(value: string) {
  try {
    return new Intl.DateTimeFormat('en-IN', { month: 'short', day: 'numeric' }).format(new Date(value));
  } catch {
    return value;
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Failed to load model portfolio performance.';
}

export default function ModelPortfolioPerformancePage() {
  const [payload, setPayload] = useState<PerformancePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [recomputing, setRecomputing] = useState(false);

  const loadSummary = async (method: 'GET' | 'POST' = 'GET') => {
    const isRecompute = method === 'POST';
    if (isRecompute) {
      setRecomputing(true);
    } else {
      setLoading(true);
    }

    try {
      const response = await fetch('/api/portfolio/model/performance', {
        method,
        cache: 'no-store',
      });
      const data = (await response.json()) as PerformancePayload;
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

  useEffect(() => {
    loadSummary();
  }, []);

  const summary = payload?.data || null;
  const chartData = useMemo(
    () =>
      (summary?.series || []).map((point) => ({
        date: formatDateLabel(point.asOf),
        nav: Math.round(point.nav),
        benchmark: Math.round(point.benchmarkNav),
        equalWeight: Math.round(point.equalWeightNav),
        noRegime: Math.round(point.noRegimeNav),
        uncapped: Math.round(point.uncappedNav),
      })),
    [summary?.series]
  );

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 px-6 py-16 text-slate-100">
        <div className="mx-auto max-w-7xl animate-pulse rounded-3xl border border-white/10 bg-white/5 p-10">
          <div className="h-4 w-44 rounded bg-white/10" />
          <div className="mt-4 h-10 w-80 rounded bg-white/10" />
          <div className="mt-8 grid gap-4 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-28 rounded-2xl bg-white/10" />
            ))}
          </div>
        </div>
      </main>
    );
  }

  if (!summary || payload?.error) {
    return (
      <main className="min-h-screen bg-slate-950 px-6 py-16 text-slate-100">
        <div className="mx-auto max-w-4xl rounded-3xl border border-rose-400/30 bg-rose-500/10 p-10">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-rose-200">Model Portfolio Performance</p>
          <h1 className="mt-4 text-4xl font-black">Backtest load failed.</h1>
          <p className="mt-4 text-lg text-rose-50/80">{payload?.error || 'An unknown error occurred.'}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-16 text-slate-100">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.18),_transparent_38%),linear-gradient(135deg,_rgba(15,23,42,0.98),_rgba(2,6,23,0.92))] p-8 shadow-2xl shadow-slate-950/40">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <Link
                href="/positions"
                className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-emerald-200/80 transition hover:text-emerald-100"
              >
                <ArrowLeft className="h-4 w-4" />
                Model Portfolio
              </Link>
              <p className="mt-5 text-sm font-semibold uppercase tracking-[0.24em] text-emerald-300">Phase 3</p>
              <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">Walk-Forward Backtest</h1>
              <p className="mt-4 max-w-2xl text-base text-slate-300 sm:text-lg">
                This page replays the model portfolio over historical daily data so we can separate stock selection, regime scaling, and risk caps from simple benchmark drift.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-100">
                {summary.lookbackDays} trading days · Weekly rebalance
              </div>
              <button
                type="button"
                onClick={() => loadSummary('POST')}
                disabled={recomputing}
                className="inline-flex items-center gap-2 rounded-full border border-emerald-300/30 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${recomputing ? 'animate-spin' : ''}`} />
                {recomputing ? 'Recomputing' : 'Recompute Backtest'}
              </button>
            </div>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <StatCard
              icon={<TrendingUp className="h-5 w-5" />}
              label="Total Return"
              value={formatPct(summary.metrics.totalReturnPct)}
              valueClassName={statTone(summary.metrics.totalReturnPct)}
              detail={`Benchmark ${formatPct(summary.metrics.benchmarkReturnPct)}`}
            />
            <StatCard
              icon={<BarChart3 className="h-5 w-5" />}
              label="Excess Return"
              value={formatPct(summary.metrics.excessReturnPct)}
              valueClassName={statTone(summary.metrics.excessReturnPct)}
              detail={`CAGR ${formatPct(summary.metrics.cagrPct)}`}
            />
            <StatCard
              icon={<Gauge className="h-5 w-5" />}
              label="Sharpe / Sortino"
              value={`${summary.metrics.sharpe.toFixed(2)} / ${summary.metrics.sortino.toFixed(2)}`}
              detail={`Vol ${formatPct(summary.metrics.annualizedVolatilityPct)}`}
            />
            <StatCard
              icon={<ShieldCheck className="h-5 w-5" />}
              label="Max Drawdown"
              value={formatPct(-summary.metrics.maxDrawdownPct)}
              valueClassName="text-amber-200"
              detail={`VaR ${formatPct(summary.metrics.latestVar95Pct)} · CVaR ${formatPct(summary.metrics.latestCvar95Pct)}`}
            />
            <StatCard
              icon={<Target className="h-5 w-5" />}
              label="Turnover"
              value={formatPct(summary.metrics.avgMonthlyTurnoverPct)}
              detail={`${summary.metrics.rebalanceCount} rebalances · Hold ${summary.metrics.avgHoldingPeriodDays.toFixed(1)}d`}
            />
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
          <div className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6">
            <div className="flex items-center gap-3">
              <Activity className="h-5 w-5 text-emerald-300" />
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Performance Curve</p>
                <h2 className="mt-1 text-2xl font-bold">Strategy vs Comparisons</h2>
              </div>
            </div>

            <div className="mt-6 h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 12 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} tickLine={false} axisLine={false} width={80} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(2,6,23,0.95)',
                      border: '1px solid rgba(148,163,184,0.2)',
                      borderRadius: 16,
                    }}
                  />
                  <Line type="monotone" dataKey="nav" stroke="#10b981" strokeWidth={2.8} dot={false} name="Strategy" />
                  <Line type="monotone" dataKey="benchmark" stroke="#38bdf8" strokeWidth={2} dot={false} name="Benchmark" />
                  <Line type="monotone" dataKey="equalWeight" stroke="#f59e0b" strokeWidth={1.7} dot={false} name="Equal Weight" />
                  <Line type="monotone" dataKey="noRegime" stroke="#a78bfa" strokeWidth={1.7} dot={false} name="No Regime" />
                  <Line type="monotone" dataKey="uncapped" stroke="#fb7185" strokeWidth={1.7} dot={false} name="No Caps" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6">
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-5 w-5 text-sky-300" />
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Risk Lens</p>
                  <h2 className="mt-1 text-2xl font-bold">Backtest Quality</h2>
                </div>
              </div>

              <div className="mt-6 space-y-3 text-sm text-slate-300">
                <MetricRow label="Hit rate" value={formatPct(summary.metrics.hitRatePct)} />
                <MetricRow label="Profit factor" value={summary.metrics.profitFactor.toFixed(2)} />
                <MetricRow label="Residual alpha" value={formatPct(summary.metrics.residualAlphaAttributionPct)} />
                <MetricRow label="Optimizer coverage" value={formatPct(summary.optimizerDiagnostics.coveragePct)} />
                <MetricRow label="Avg pair correlation" value={summary.optimizerDiagnostics.avgPairCorrelation.toFixed(3)} />
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6">
              <div className="flex items-center gap-3">
                <BarChart3 className="h-5 w-5 text-violet-300" />
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Comparison Set</p>
                  <h2 className="mt-1 text-2xl font-bold">What Drove Edge</h2>
                </div>
              </div>

              <div className="mt-6 space-y-3">
                {summary.comparisons.map((comparison) => (
                  <div key={comparison.key} className="rounded-2xl border border-white/5 bg-slate-950/50 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="font-semibold text-slate-100">{comparison.label}</div>
                        <div className="mt-1 text-xs text-slate-400">Ending NAV {formatCurrency(comparison.endingNav)}</div>
                      </div>
                      <div className="text-right">
                        <div className={`font-semibold ${statTone(comparison.totalReturnPct)}`}>{formatPct(comparison.totalReturnPct)}</div>
                        <div className={`mt-1 text-xs ${statTone(comparison.excessReturnPct)}`}>Edge {formatPct(comparison.excessReturnPct)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6">
            <div className="flex items-center gap-3">
              <Target className="h-5 w-5 text-amber-300" />
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Sector Attribution</p>
                <h2 className="mt-1 text-2xl font-bold">Contribution Map</h2>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {summary.sectorAttribution.map((row) => (
                <div key={row.sector} className="rounded-2xl border border-white/5 bg-slate-950/50 px-4 py-3">
                  <div className="flex items-center justify-between gap-4">
                    <span className="font-semibold text-slate-100">{row.sector}</span>
                    <span className={`font-semibold ${statTone(row.contributionPct)}`}>{formatPct(row.contributionPct)}</span>
                  </div>
                  <div className="mt-1 text-xs text-slate-400">Average weight {formatPct(row.avgWeightPct)}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6">
            <div className="flex items-center gap-3">
              <Gauge className="h-5 w-5 text-slate-300" />
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Notes</p>
                <h2 className="mt-1 text-2xl font-bold">Validation Context</h2>
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

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-white/5 bg-slate-950/50 px-4 py-3">
      <span>{label}</span>
      <span className="font-semibold text-slate-100">{value}</span>
    </div>
  );
}
