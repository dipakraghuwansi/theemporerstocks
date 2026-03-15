"use client";

import { useEffect, useState } from 'react';
import { Activity, ArrowUpRight, Gauge, RefreshCw, SearchCheck, TrendingDown, TrendingUp, Wifi, WifiOff } from 'lucide-react';
import { SCREEN_LABELS, StockScreenType } from '@/lib/stockUniverse';
import { useStockStream } from '@/lib/useStockStream';

type ScreenerPayload = {
  success?: boolean;
  error?: string;
  needsLogin?: boolean;
  screen?: StockScreenType;
  screenLabel?: string;
  universeSize?: number;
  matched?: number;
  benchmark?: string;
  notes?: string[];
  sectorBreadth?: Array<{
    sector: string;
    breadthPct: number;
    aboveSma20Pct: number;
    members: number;
  }>;
  results?: Array<{
    symbol: string;
    instrument: string;
    sector: string;
    lastPrice: number;
    dayChangePct: number;
    gapPct: number;
    volume: number;
    avgVolume20: number | null;
    volumeExpansion: number | null;
    sma20: number | null;
    sma50: number | null;
    rsi14: number | null;
    atr14: number | null;
    vwap: number | null;
    relativeStrength20d: number | null;
    breakoutLevel: number | null;
    breakdownLevel: number | null;
    aboveVwap: boolean;
    deliveryDataAvailable: boolean;
    score: number;
    thesis: string;
  }>;
};

const SCREEN_OPTIONS: StockScreenType[] = [
  'intraday-momentum',
  'swing-setups',
  'mean-reversion',
  'breakout-watchlist',
];

function recomputeLiveScore(screen: StockScreenType, row: NonNullable<ScreenerPayload['results']>[number]) {
  const volumeBoost = row.volumeExpansion ? Math.min(row.volumeExpansion, 3) * 12 : 0;
  const rsBoost = row.relativeStrength20d ? Math.max(row.relativeStrength20d, 0) * 8 : 0;
  const momentumBoost = Math.max(row.dayChangePct, 0) * 10;
  const reversalBoost = Math.max((50 - (row.rsi14 || 50)) / 2, 0) * 4;
  const breakoutBoost =
    row.breakoutLevel && row.lastPrice > 0
      ? Math.max(0, 1 - Math.abs(row.breakoutLevel - row.lastPrice) / row.lastPrice) * 20
      : 0;

  switch (screen) {
    case 'intraday-momentum':
      return Number((momentumBoost + volumeBoost + rsBoost + (row.aboveVwap ? 15 : 0)).toFixed(1));
    case 'swing-setups':
      return Number((volumeBoost + rsBoost + breakoutBoost + ((row.rsi14 || 0) - 45)).toFixed(1));
    case 'mean-reversion':
      return Number((reversalBoost + Math.abs(Math.min(row.gapPct, 0)) * 6 + volumeBoost / 2).toFixed(1));
    case 'breakout-watchlist':
      return Number((breakoutBoost + volumeBoost + momentumBoost / 2 + rsBoost).toFixed(1));
  }
}

export default function ScreenerPage() {
  const [selectedScreen, setSelectedScreen] = useState<StockScreenType>('intraday-momentum');
  const [payload, setPayload] = useState<ScreenerPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { snapshot, socketConnected } = useStockStream();

  const loadScreen = async (screen: StockScreenType) => {
    setSelectedScreen(screen);
    setIsLoading(true);

    try {
      const res = await fetch(`/api/stocks/screener?screen=${screen}`, { cache: 'no-store' });
      const data: ScreenerPayload = await res.json();
      setPayload(data);
    } catch (error) {
      console.error('Failed to load stock screener', error);
      setPayload({ error: 'Network error while loading the screener.' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadScreen(selectedScreen);
  }, []);

  const results = (payload?.results || []).map((row) => {
    const liveQuote = snapshot.quotes.find((quote) => quote.instrument === row.instrument);
    if (!liveQuote) return row;

    const liveLastPrice = liveQuote.lastPrice;
    const referenceClose = liveQuote.close ?? row.lastPrice;
    const liveDayChangePct = referenceClose ? ((liveLastPrice - referenceClose) / referenceClose) * 100 : row.dayChangePct;
    const liveVolume = liveQuote.volume || row.volume;
    const liveVolumeExpansion =
      row.avgVolume20 && row.avgVolume20 > 0 ? Number((liveVolume / row.avgVolume20).toFixed(2)) : row.volumeExpansion;
    const liveAboveVwap = row.vwap !== null ? liveLastPrice > row.vwap : row.aboveVwap;

    const liveRow = {
      ...row,
      lastPrice: liveLastPrice,
      dayChangePct: Number(liveDayChangePct.toFixed(2)),
      volume: liveVolume,
      volumeExpansion: liveVolumeExpansion,
      aboveVwap: liveAboveVwap,
    };
    return {
      ...liveRow,
      score: recomputeLiveScore(selectedScreen, liveRow),
    };
  }).sort((a, b) => b.score - a.score);

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-16 text-slate-100">
      <div className="mx-auto max-w-7xl">
        <div className="max-w-4xl">
          <p className="inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1 text-sm font-semibold text-emerald-300">
            Stock analytics foundation
          </p>
          <h1 className="mt-4 text-5xl font-black tracking-tight">Equity screener workbench</h1>
          <p className="mt-5 text-lg leading-8 text-slate-300">
            This is the first stock-first screen layer. It combines price action, volume, VWAP, moving averages, RSI,
            ATR, relative strength, breakout levels, gap analysis, and sector breadth into practical watchlists.
          </p>
        </div>

        <div className="mt-10 flex flex-wrap gap-3">
          {SCREEN_OPTIONS.map((screen) => (
            <button
              key={screen}
              type="button"
              onClick={() => loadScreen(screen)}
              disabled={isLoading}
              className={`rounded-2xl px-5 py-3 text-sm font-semibold transition ${
                selectedScreen === screen
                  ? 'bg-emerald-500 text-slate-950'
                  : 'border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'
              }`}
            >
              {SCREEN_LABELS[screen]}
            </button>
          ))}

          <button
            type="button"
            onClick={() => loadScreen(selectedScreen)}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <SummaryCard label="Socket" value={socketConnected ? 'Connected' : 'Offline'} icon={socketConnected ? <Wifi className="h-5 w-5 text-emerald-300" /> : <WifiOff className="h-5 w-5 text-rose-300" />} />
          <SummaryCard label="Universe Streamed" value={String(snapshot.universeSize || '--')} />
          <SummaryCard label="Subscribed Tokens" value={String(snapshot.subscribed || '--')} />
          <SummaryCard
            label="Last Tick"
            value={snapshot.lastSnapshotAt ? new Date(snapshot.lastSnapshotAt).toLocaleTimeString() : '--'}
          />
        </div>

        {payload?.needsLogin ? (
          <div className="mt-10 rounded-3xl border border-rose-500/20 bg-rose-500/10 p-8">
            <h2 className="text-2xl font-bold text-white">Kite authentication required</h2>
            <p className="mt-3 text-slate-200">
              Login first from <a href="/auth-test" className="text-emerald-300 underline">/auth-test</a>, then come back here to run the screeners.
            </p>
          </div>
        ) : null}

        {payload?.error && !payload?.needsLogin ? (
          <div className="mt-10 rounded-3xl border border-rose-500/20 bg-rose-500/10 p-8 text-rose-100">
            {payload.error}
          </div>
        ) : null}

        <div className="mt-10 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-3xl border border-white/10 bg-white/5 p-8">
            <div className="flex items-start justify-between gap-6">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Current screen</p>
                <h2 className="mt-2 text-3xl font-black">{payload?.screenLabel || SCREEN_LABELS[selectedScreen]}</h2>
              </div>
              <SearchCheck className="h-10 w-10 text-emerald-300" />
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <SummaryCard label="Universe" value={String(payload?.universeSize ?? '--')} />
              <SummaryCard label="Matches" value={String(payload?.matched ?? '--')} />
              <SummaryCard label="Benchmark" value={payload?.benchmark || 'NIFTY 50'} />
            </div>

            <div className="mt-6 rounded-2xl border border-white/10 bg-slate-950/50 p-5">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">What this screen looks for</p>
              <p className="mt-3 text-sm leading-7 text-slate-300">
                {selectedScreen === 'intraday-momentum' &&
                  'Stocks holding above VWAP with positive day strength, strong relative strength, and expanding volume.'}
                {selectedScreen === 'swing-setups' &&
                  'Trend-aligned names above their moving averages with healthy but not overheated RSI and a nearby breakout trigger.'}
                {selectedScreen === 'mean-reversion' &&
                  'Names under short-term pressure with lower RSI and a negative opening gap that could set up a rebound trade.'}
                {selectedScreen === 'breakout-watchlist' &&
                  'Stocks closing in on their recent breakout levels while volume and trend structure stay supportive.'}
              </p>
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/5 p-8">
            <div className="flex items-center gap-3">
              <Gauge className="h-6 w-6 text-sky-300" />
              <h2 className="text-2xl font-bold">Sector breadth</h2>
            </div>
            <div className="mt-6 space-y-3">
              {(payload?.sectorBreadth || []).length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/40 p-5 text-sm text-slate-400">
                  Sector breadth will populate once the selected screen has qualifying names.
                </div>
              ) : (
                payload?.sectorBreadth?.map((row) => (
                  <div key={row.sector} className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-white">{row.sector}</p>
                      <p className="text-sm text-slate-400">{row.members} names</p>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-sm">
                      <span className="text-slate-400">Advancing breadth</span>
                      <span className="font-semibold text-emerald-300">{row.breadthPct}%</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-sm">
                      <span className="text-slate-400">Above SMA20</span>
                      <span className="font-semibold text-sky-300">{row.aboveSma20Pct}%</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        <section className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-8">
          <div className="flex items-center gap-3">
            <Activity className="h-6 w-6 text-emerald-300" />
            <h2 className="text-2xl font-bold">Screen results</h2>
          </div>

          {isLoading ? (
            <div className="mt-6 rounded-2xl border border-dashed border-white/10 bg-slate-950/40 p-6 text-sm text-slate-400">
              Running the screener...
            </div>
          ) : results.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-white/10 bg-slate-950/40 p-6 text-sm text-slate-400">
              No names matched this screen right now.
            </div>
          ) : (
            <div className="mt-6 grid gap-4 xl:grid-cols-2">
              {results.map((row) => (
                <article key={row.symbol} className="rounded-3xl border border-white/10 bg-slate-950/50 p-6">
                  <div className="flex items-start justify-between gap-6">
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">{row.sector}</p>
                      <h3 className="mt-2 text-2xl font-black text-white">{row.symbol}</h3>
                      <p className="mt-1 text-sm text-slate-400">{row.instrument}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-slate-400">Score</p>
                      <p className="text-3xl font-black text-emerald-300">{row.score.toFixed(1)}</p>
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
                    <Metric label="LTP" value={row.lastPrice.toFixed(2)} />
                    <Metric
                      label="Day %"
                      value={row.dayChangePct.toFixed(2)}
                      accent={row.dayChangePct >= 0 ? 'text-emerald-300' : 'text-rose-300'}
                    />
                    <Metric label="VWAP" value={row.vwap?.toFixed(2) || 'n/a'} />
                    <Metric label="RSI" value={row.rsi14?.toFixed(2) || 'n/a'} />
                    <Metric label="SMA20" value={row.sma20?.toFixed(2) || 'n/a'} />
                    <Metric label="SMA50" value={row.sma50?.toFixed(2) || 'n/a'} />
                    <Metric label="ATR14" value={row.atr14?.toFixed(2) || 'n/a'} />
                    <Metric label="RS 20d" value={row.relativeStrength20d?.toFixed(2) || 'n/a'} />
                    <Metric label="Breakout" value={row.breakoutLevel?.toFixed(2) || 'n/a'} />
                    <Metric label="Breakdown" value={row.breakdownLevel?.toFixed(2) || 'n/a'} />
                    <Metric label="Gap %" value={row.gapPct.toFixed(2)} />
                    <Metric label="Vol Exp" value={row.volumeExpansion?.toFixed(2) || 'n/a'} />
                  </div>

                  <div className="mt-5 flex items-center gap-3 text-sm">
                    {row.aboveVwap ? (
                      <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-emerald-300">
                        <TrendingUp className="h-4 w-4" />
                        Above VWAP
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-2 rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-rose-300">
                        <TrendingDown className="h-4 w-4" />
                        Below VWAP
                      </span>
                    )}
                    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-300">
                      <ArrowUpRight className="h-4 w-4" />
                      Delivery data unavailable
                    </span>
                  </div>

                  <p className="mt-5 text-sm leading-7 text-slate-300">{row.thesis}</p>
                </article>
              ))}
            </div>
          )}
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

function SummaryCard({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-400">{label}</p>
        {icon || null}
      </div>
      <p className="mt-2 text-2xl font-bold text-white">{value}</p>
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-3">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className={`mt-2 text-base font-semibold text-slate-100 ${accent || ''}`}>{value}</p>
    </div>
  );
}
