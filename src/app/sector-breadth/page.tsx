"use client";

import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, RefreshCw } from 'lucide-react';

type SectorRow = {
  sector: string;
  members: number;
  advancing: number;
  declining: number;
  breadthPct: number;
  aboveSma20Pct: number;
  avgDayChangePct: number;
  breadthDelta: number;
  aboveSma20Delta: number;
  categories: string[];
  trend: 'upgrade' | 'degrade' | 'flat';
};

type BreadthPayload = {
  success?: boolean;
  error?: string;
  needsLogin?: boolean;
  generatedAt?: string;
  sectors?: SectorRow[];
  notes?: string[];
};

type SortKey = 'breadthDelta' | 'breadthPct' | 'aboveSma20Pct' | 'avgDayChangePct' | 'members' | 'sector';

export default function SectorBreadthPage() {
  const [payload, setPayload] = useState<BreadthPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('breadthDelta');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const loadBreadth = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/stocks/sector-breadth', { cache: 'no-store' });
      const data: BreadthPayload = await res.json();
      setPayload(data);
    } catch (error) {
      console.error('Failed to load sector breadth', error);
      setPayload({ error: 'Network error while loading sector breadth.' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadBreadth();
  }, []);

  const rows = useMemo(() => {
    const sectors = [...(payload?.sectors || [])];
    sectors.sort((a, b) => {
      const aValue = a[sortKey];
      const bValue = b[sortKey];
      const multiplier = sortDirection === 'asc' ? 1 : -1;

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return aValue.localeCompare(bValue) * multiplier;
      }

      return ((Number(aValue) || 0) - (Number(bValue) || 0)) * multiplier;
    });
    return sectors;
  }, [payload?.sectors, sortDirection, sortKey]);

  const setSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setSortKey(key);
    setSortDirection(key === 'sector' ? 'asc' : 'desc');
  };

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-16 text-slate-100">
      <div className="mx-auto max-w-7xl">
        <div className="max-w-4xl">
          <p className="inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1 text-sm font-semibold text-emerald-300">
            Market structure
          </p>
          <h1 className="mt-4 text-5xl font-black tracking-tight">Sector breadth monitor</h1>
          <p className="mt-5 text-lg leading-8 text-slate-300">
            All sectors from the current stock universe are loaded into a sortable table and ranked by breadth
            upgrade or degradation. This is designed to surface where leadership is improving and where it is weakening.
          </p>
        </div>

        <div className="mt-10 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={loadBreadth}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-5 py-3 font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh Breadth
          </button>

          <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm text-slate-300">
            Generated at: {payload?.generatedAt ? new Date(payload.generatedAt).toLocaleTimeString() : '--'}
          </div>
        </div>

        {payload?.needsLogin ? (
          <div className="mt-8 rounded-3xl border border-rose-500/20 bg-rose-500/10 p-8 text-rose-100">
            Kite authentication is required. Login from `/auth-test` first.
          </div>
        ) : null}

        {payload?.error && !payload?.needsLogin ? (
          <div className="mt-8 rounded-3xl border border-rose-500/20 bg-rose-500/10 p-8 text-rose-100">
            {payload.error}
          </div>
        ) : null}

        <section className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-8">
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-y-3 text-left">
              <thead>
                <tr className="text-sm uppercase tracking-[0.2em] text-slate-500">
                  <SortableHeader label="Sector" sortKey="sector" activeKey={sortKey} direction={sortDirection} onClick={setSort} />
                  <SortableHeader label="Breadth Δ" sortKey="breadthDelta" activeKey={sortKey} direction={sortDirection} onClick={setSort} />
                  <SortableHeader label="Breadth %" sortKey="breadthPct" activeKey={sortKey} direction={sortDirection} onClick={setSort} />
                  <SortableHeader label="Above SMA20 %" sortKey="aboveSma20Pct" activeKey={sortKey} direction={sortDirection} onClick={setSort} />
                  <SortableHeader label="Avg Day %" sortKey="avgDayChangePct" activeKey={sortKey} direction={sortDirection} onClick={setSort} />
                  <SortableHeader label="Members" sortKey="members" activeKey={sortKey} direction={sortDirection} onClick={setSort} />
                  <th className="px-4">Trend</th>
                  <th className="px-4">Categories</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={8} className="rounded-2xl border border-dashed border-white/10 bg-slate-950/40 px-4 py-6 text-sm text-slate-400">
                      Loading sector breadth…
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="rounded-2xl border border-dashed border-white/10 bg-slate-950/40 px-4 py-6 text-sm text-slate-400">
                      No sector breadth rows available yet.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.sector} className="bg-slate-950/60">
                      <td className="rounded-l-2xl border border-r-0 border-white/10 px-4 py-4 font-semibold text-white">{row.sector}</td>
                      <td className={`border border-r-0 border-white/10 px-4 py-4 font-semibold ${row.breadthDelta > 0 ? 'text-emerald-300' : row.breadthDelta < 0 ? 'text-rose-300' : 'text-slate-300'}`}>
                        {row.breadthDelta > 0 ? '+' : ''}{row.breadthDelta.toFixed(1)}
                      </td>
                      <td className="border border-r-0 border-white/10 px-4 py-4 text-slate-200">{row.breadthPct.toFixed(1)}%</td>
                      <td className="border border-r-0 border-white/10 px-4 py-4 text-slate-200">{row.aboveSma20Pct.toFixed(1)}%</td>
                      <td className={`border border-r-0 border-white/10 px-4 py-4 ${row.avgDayChangePct >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                        {row.avgDayChangePct > 0 ? '+' : ''}{row.avgDayChangePct.toFixed(2)}%
                      </td>
                      <td className="border border-r-0 border-white/10 px-4 py-4 text-slate-200">{row.members}</td>
                      <td className="border border-r-0 border-white/10 px-4 py-4">
                        <TrendChip trend={row.trend} />
                      </td>
                      <td className="rounded-r-2xl border border-white/10 px-4 py-4 text-slate-300">{row.categories.join(', ')}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {(payload?.notes || []).length > 0 ? (
          <section className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-8">
            <h2 className="text-xl font-bold">Notes</h2>
            <div className="mt-4 space-y-2 text-sm text-slate-300">
              {payload?.notes?.map((note) => (
                <p key={note}>{note}</p>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}

function SortableHeader({
  label,
  sortKey,
  activeKey,
  direction,
  onClick,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  direction: 'asc' | 'desc';
  onClick: (key: SortKey) => void;
}) {
  const isActive = activeKey === sortKey;
  return (
    <th className="px-4">
      <button type="button" onClick={() => onClick(sortKey)} className="inline-flex items-center gap-2">
        <span>{label}</span>
        {isActive ? direction === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" /> : <ArrowUpDown className="h-4 w-4" />}
      </button>
    </th>
  );
}

function TrendChip({ trend }: { trend: SectorRow['trend'] }) {
  if (trend === 'upgrade') {
    return <span className="inline-flex rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">Upgrade</span>;
  }
  if (trend === 'degrade') {
    return <span className="inline-flex rounded-full border border-rose-500/20 bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-300">Degrade</span>;
  }
  return <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-300">Flat</span>;
}
