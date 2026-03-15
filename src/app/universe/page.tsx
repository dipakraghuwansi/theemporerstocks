"use client";

import { useEffect, useState } from 'react';
import { CATEGORY_LABELS, StockUniverseCategory, StockUniverseItem } from '@/lib/stockUniverse';
import { DatabaseZap, Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
import { useStockStream } from '@/lib/useStockStream';

type UniverseResponse = {
  success?: boolean;
  error?: string;
  items?: StockUniverseItem[];
};

const EMPTY_FORM = {
  symbol: '',
  instrument: '',
  sector: '',
  category: 'manual' as StockUniverseCategory,
};

export default function UniversePage() {
  const [items, setItems] = useState<StockUniverseItem[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingSymbol, setEditingSymbol] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRunningStreamAction, setIsRunningStreamAction] = useState(false);
  const [error, setError] = useState('');
  const { snapshot, socketConnected } = useStockStream();

  const loadUniverse = async () => {
    setIsLoading(true);
    setError('');

    try {
      const res = await fetch('/api/stocks/universe', { cache: 'no-store' });
      const data: UniverseResponse = await res.json();
      if (!res.ok || !data.items) {
        setError(data.error || 'Failed to load stock universe.');
        return;
      }
      setItems(data.items);
    } catch (loadError) {
      console.error('Failed to load stock universe', loadError);
      setError('Network error while loading stock universe.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadUniverse();
  }, []);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingSymbol(null);
  };

  const saveRow = async () => {
    setIsSaving(true);
    setError('');

    try {
      const payload = {
        ...form,
        symbol: form.symbol.trim().toUpperCase(),
        instrument: form.instrument.trim() || `NSE:${form.symbol.trim().toUpperCase()}`,
      };

      const res = await fetch('/api/stocks/universe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data: UniverseResponse = await res.json();
      if (!res.ok || !data.items) {
        setError(data.error || 'Failed to save stock universe item.');
        return;
      }

      setItems(data.items);
      resetForm();
    } catch (saveError) {
      console.error('Failed to save stock universe item', saveError);
      setError('Network error while saving the stock universe item.');
    } finally {
      setIsSaving(false);
    }
  };

  const deleteRow = async (symbol: string) => {
    setError('');

    try {
      const res = await fetch(`/api/stocks/universe?symbol=${encodeURIComponent(symbol)}`, {
        method: 'DELETE',
      });
      const data: UniverseResponse = await res.json();
      if (!res.ok || !data.items) {
        setError(data.error || 'Failed to delete stock universe item.');
        return;
      }

      setItems(data.items);
      if (editingSymbol === symbol) resetForm();
    } catch (deleteError) {
      console.error('Failed to delete stock universe item', deleteError);
      setError('Network error while deleting the stock universe item.');
    }
  };

  const refreshFromIndices = async () => {
    setIsRefreshing(true);
    setError('');

    try {
      const res = await fetch('/api/stocks/universe', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'refresh-from-indices' }),
      });
      const data: UniverseResponse = await res.json();
      if (!res.ok || !data.items) {
        setError(data.error || 'Failed to refresh stock universe from index constituents.');
        return;
      }

      setItems(data.items);
    } catch (refreshError) {
      console.error('Failed to refresh stock universe', refreshError);
      setError('Network error while refreshing the stock universe.');
    } finally {
      setIsRefreshing(false);
    }
  };

  const runStreamAction = async (action: 'reconnect' | 'resubscribe') => {
    setIsRunningStreamAction(true);
    setError('');

    try {
      const res = await fetch('http://localhost:8080/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `Failed to ${action} stream.`);
      }
    } catch (streamError) {
      console.error(`Failed to ${action} stream`, streamError);
      setError(`Network error while trying to ${action} the stream.`);
    } finally {
      setIsRunningStreamAction(false);
    }
  };

  const editRow = (item: StockUniverseItem) => {
    setEditingSymbol(item.symbol);
    setForm(item);
  };

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-16 text-slate-100">
      <div className="mx-auto max-w-7xl">
        <div className="max-w-4xl">
          <p className="inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1 text-sm font-semibold text-emerald-300">
            Universe management
          </p>
          <h1 className="mt-4 text-5xl font-black tracking-tight">Stock universe table</h1>
          <p className="mt-5 text-lg leading-8 text-slate-300">
            Manage the stock universe used by the screener. You can manually add names or refresh the list from the
            Nifty 50 and Nifty Midcap 150 constituent CSVs. Each row is tagged as <code>manual</code>, <code>nifty50</code>,
            or <code>niftymidcap150</code>.
          </p>
        </div>

        <div className="mt-10 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={refreshFromIndices}
            disabled={isRefreshing}
            className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-5 py-3 font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <DatabaseZap className="h-4 w-4" />
            {isRefreshing ? 'Refreshing…' : 'Refresh from Nifty CSVs'}
          </button>

          <button
            type="button"
            onClick={loadUniverse}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-5 py-3 font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Reload Table
          </button>

          <button
            type="button"
            onClick={() => runStreamAction('resubscribe')}
            disabled={isRunningStreamAction}
            className="inline-flex items-center gap-2 rounded-2xl border border-violet-500/30 bg-violet-500/10 px-5 py-3 font-semibold text-violet-200 transition hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${isRunningStreamAction ? 'animate-spin' : ''}`} />
            Resubscribe Stream
          </button>
        </div>

        {error ? (
          <div className="mt-6 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-100">{error}</div>
        ) : null}

        <section className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-8">
          <div className="mb-6 grid gap-4 md:grid-cols-4">
            <StatCard label="Socket" value={socketConnected ? 'Connected' : 'Offline'} />
            <StatCard label="Universe Size" value={String(snapshot.universeSize || '--')} />
            <StatCard label="Subscribed" value={String(snapshot.subscribed || '--')} />
            <StatCard label="Last Sync" value={snapshot.lastUniverseSyncAt ? new Date(snapshot.lastUniverseSyncAt).toLocaleTimeString() : '--'} />
          </div>

          <div className="flex items-center gap-3">
            <Plus className="h-6 w-6 text-emerald-300" />
            <h2 className="text-2xl font-bold">{editingSymbol ? `Edit ${editingSymbol}` : 'Add stock to universe'}</h2>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Symbol">
              <input
                value={form.symbol}
                onChange={(event) => setForm((current) => ({ ...current, symbol: event.target.value.toUpperCase() }))}
                className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none focus:border-emerald-400"
                placeholder="HINDALCO"
              />
            </Field>

            <Field label="Instrument">
              <input
                value={form.instrument}
                onChange={(event) => setForm((current) => ({ ...current, instrument: event.target.value.toUpperCase() }))}
                className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none focus:border-emerald-400"
                placeholder="NSE:HINDALCO"
              />
            </Field>

            <Field label="Sector">
              <input
                value={form.sector}
                onChange={(event) => setForm((current) => ({ ...current, sector: event.target.value }))}
                className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none focus:border-emerald-400"
                placeholder="Metals"
              />
            </Field>

            <Field label="Category">
              <select
                value={form.category}
                onChange={(event) => setForm((current) => ({ ...current, category: event.target.value as StockUniverseCategory }))}
                className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none focus:border-emerald-400"
              >
                <option value="manual">Manual</option>
                <option value="nifty50">Nifty 50</option>
                <option value="niftymidcap150">Nifty Midcap 150</option>
              </select>
            </Field>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={saveRow}
              disabled={isSaving}
              className="inline-flex items-center gap-2 rounded-2xl bg-sky-500 px-5 py-3 font-semibold text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              {isSaving ? 'Saving…' : editingSymbol ? 'Update Row' : 'Add Row'}
            </button>

            {editingSymbol ? (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 font-semibold text-white transition hover:bg-white/10"
              >
                Cancel Edit
              </button>
            ) : null}
          </div>
        </section>

        <section className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-8">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-2xl font-bold">Universe table</h2>
            <p className="text-sm text-slate-400">{items.length} stocks</p>
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-y-3 text-left">
              <thead>
                <tr className="text-sm uppercase tracking-[0.2em] text-slate-500">
                  <th className="px-4">Symbol</th>
                  <th className="px-4">Instrument</th>
                  <th className="px-4">Sector</th>
                  <th className="px-4">Category</th>
                  <th className="px-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="rounded-2xl border border-dashed border-white/10 bg-slate-950/40 px-4 py-6 text-sm text-slate-400">
                      Loading universe…
                    </td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr key={item.symbol} className="rounded-2xl bg-slate-950/60">
                      <td className="rounded-l-2xl border border-r-0 border-white/10 px-4 py-4 font-semibold text-white">{item.symbol}</td>
                      <td className="border border-r-0 border-white/10 px-4 py-4 text-slate-300">{item.instrument}</td>
                      <td className="border border-r-0 border-white/10 px-4 py-4 text-slate-300">{item.sector}</td>
                      <td className="border border-r-0 border-white/10 px-4 py-4">
                        <span className="inline-flex rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                          {CATEGORY_LABELS[item.category]}
                        </span>
                      </td>
                      <td className="rounded-r-2xl border border-white/10 px-4 py-4">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => editRow(item)}
                            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteRow(item.symbol)}
                            className="inline-flex items-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm font-semibold text-rose-200 transition hover:bg-rose-500/20"
                          >
                            <Trash2 className="h-4 w-4" />
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">{label}</span>
      {children}
    </label>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-2 text-xl font-bold text-white">{value}</p>
    </div>
  );
}
