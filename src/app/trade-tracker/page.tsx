"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { BookOpenCheck, RefreshCw, ShieldCheck, Target } from "lucide-react";

type JournalTrade = {
  id: string;
  source: "SCREENER";
  symbol: string;
  instrument: string;
  sector: string;
  category: "nifty50" | "niftymidcap150" | "manual";
  screen: string;
  screenLabel: string;
  direction: "BUY" | "SELL";
  quantity: number;
  score: number;
  confidenceLabel: "High" | "Medium" | "Watchlist" | "Low";
  entryPrice: number;
  stopLoss: number;
  targetPrice: number;
  currentPrice: number;
  exitPrice?: number;
  pnlPoints: number;
  pnlPct: number;
  status: "OPEN" | "CLOSED_SL" | "CLOSED_TP" | "CLOSED_MANUAL" | "ERROR";
  thesis: string;
  openedAt: string;
  closedAt?: string;
  closeReason?: string;
};

type JournalPayload = {
  success?: boolean;
  staleQuotes?: boolean;
  trades?: JournalTrade[];
  error?: string;
};

function getStatusTone(status: JournalTrade["status"]) {
  switch (status) {
    case "OPEN":
      return "border border-sky-500/30 bg-sky-500/10 text-sky-200";
    case "CLOSED_TP":
      return "border border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
    case "CLOSED_SL":
      return "border border-rose-500/30 bg-rose-500/10 text-rose-200";
    case "CLOSED_MANUAL":
      return "border border-white/10 bg-white/5 text-slate-200";
    default:
      return "border border-amber-500/30 bg-amber-500/10 text-amber-200";
  }
}

export default function TradeTrackerPage() {
  const [payload, setPayload] = useState<JournalPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTradeId, setActiveTradeId] = useState<string | null>(null);

  const loadTrades = async (sync = true) => {
    setIsLoading(true);

    try {
      const res = await fetch(`/api/journal/trades${sync ? "?sync=true" : ""}`, { cache: "no-store" });
      const data: JournalPayload = await res.json();
      setPayload(data);
    } catch (error) {
      console.error("Failed to load journal trades", error);
      setPayload({ error: "Unable to load the journal right now." });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTrades(true);

    const intervalId = window.setInterval(() => {
      loadTrades(true);
    }, 10000);

    return () => window.clearInterval(intervalId);
  }, []);

  const closeTrade = async (id: string) => {
    setActiveTradeId(id);

    try {
      const res = await fetch("/api/journal/trades", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });

      const data: JournalPayload = await res.json();
      if (!res.ok) {
        setPayload({ error: data.error || "Unable to close this trade.", trades: payload?.trades || [] });
        return;
      }

      await loadTrades(false);
    } catch (error) {
      console.error("Failed to close journal trade", error);
      setPayload({ error: "Network error while closing the trade.", trades: payload?.trades || [] });
    } finally {
      setActiveTradeId(null);
    }
  };

  const trades = payload?.trades || [];
  const openTrades = useMemo(() => trades.filter((trade) => trade.status === "OPEN"), [trades]);
  const closedTrades = useMemo(() => trades.filter((trade) => trade.status !== "OPEN"), [trades]);

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-16 text-slate-100">
      <div className="mx-auto max-w-6xl">
        <div className="max-w-4xl">
          <p className="inline-flex rounded-full border border-orange-500/30 bg-orange-500/10 px-4 py-1 text-sm font-semibold text-orange-300">
            Journal
          </p>
          <h1 className="mt-4 text-4xl font-black tracking-tight text-white">Pseudo-trade monitor for screener buys</h1>
          <p className="mt-4 text-lg leading-8 text-slate-300">
            Buy setups added from the screener land here with entry, stop, and target. The journal refreshes LTP in the
            background and marks trades as closed when stop-loss or target is hit.
          </p>
        </div>

        <div className="mt-8 flex flex-wrap gap-4">
          <button
            type="button"
            onClick={() => loadTrades(true)}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-3 font-semibold text-emerald-200 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            Refresh Journal
          </button>
          <Link
            href="/screener"
            className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-5 py-3 font-semibold text-white transition hover:bg-white/10"
          >
            Back to Screener
          </Link>
        </div>

        {payload?.staleQuotes ? (
          <div className="mt-6 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            Quotes are stale because the Kite session is not available. Open <Link href="/auth-test" className="underline">Auth Test</Link> and login again if needed.
          </div>
        ) : null}

        {payload?.error ? (
          <div className="mt-6 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {payload.error}
          </div>
        ) : null}

        <div className="mt-8 grid gap-4 md:grid-cols-4">
          <SummaryCard label="Open Trades" value={String(openTrades.length)} icon={<BookOpenCheck className="h-5 w-5 text-sky-300" />} />
          <SummaryCard label="Closed TP" value={String(closedTrades.filter((trade) => trade.status === "CLOSED_TP").length)} icon={<Target className="h-5 w-5 text-emerald-300" />} />
          <SummaryCard label="Closed SL" value={String(closedTrades.filter((trade) => trade.status === "CLOSED_SL").length)} icon={<ShieldCheck className="h-5 w-5 text-rose-300" />} />
          <SummaryCard
            label="Net P&L"
            value={`${trades.reduce((sum, trade) => sum + trade.pnlPoints, 0).toFixed(2)}`}
            accent={trades.reduce((sum, trade) => sum + trade.pnlPoints, 0) >= 0 ? "text-emerald-300" : "text-rose-300"}
          />
        </div>

        <section className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-8">
          <h2 className="text-xl font-bold text-white">Open Trades</h2>

          {openTrades.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-white/10 bg-slate-950/40 p-6 text-sm text-slate-400">
              No open pseudo-trades yet. Use the <span className="text-white">Buy</span> button on a screener card to start one.
            </div>
          ) : (
            <div className="mt-6 grid gap-4 xl:grid-cols-2">
              {openTrades.map((trade) => (
                <article key={trade.id} className="rounded-3xl border border-white/10 bg-slate-950/50 p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{trade.sector}</p>
                      <h3 className="mt-2 text-2xl font-black text-white">{trade.symbol}</h3>
                      <p className="mt-1 text-xs text-slate-400">{trade.screenLabel} · {trade.instrument}</p>
                    </div>
                    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getStatusTone(trade.status)}`}>
                      {trade.status}
                    </span>
                  </div>

                  <div className="mt-5 rounded-2xl border border-white/10 bg-slate-900/50">
                    <MetricRow label="Entry" value={trade.entryPrice.toFixed(2)} />
                    <MetricRow label="LTP" value={trade.currentPrice.toFixed(2)} />
                    <MetricRow label="Stop" value={trade.stopLoss.toFixed(2)} />
                    <MetricRow label="Target" value={trade.targetPrice.toFixed(2)} />
                    <MetricRow label="P&L %" value={`${trade.pnlPct.toFixed(2)}%`} accent={trade.pnlPct >= 0 ? "text-emerald-300" : "text-rose-300"} />
                    <MetricRow label="P&L" value={trade.pnlPoints.toFixed(2)} accent={trade.pnlPoints >= 0 ? "text-emerald-300" : "text-rose-300"} last />
                  </div>

                  <p className="mt-4 text-sm leading-6 text-slate-300">{trade.thesis}</p>

                  <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                    <span>Opened {new Date(trade.openedAt).toLocaleString()}</span>
                    <span>Score {trade.score.toFixed(1)}</span>
                    <span>{trade.confidenceLabel}</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => closeTrade(trade.id)}
                    disabled={activeTradeId === trade.id}
                    className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {activeTradeId === trade.id ? "Closing..." : "Close Manually"}
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-8">
          <h2 className="text-xl font-bold text-white">Closed Trades</h2>

          {closedTrades.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-white/10 bg-slate-950/40 p-6 text-sm text-slate-400">
              Closed trades will appear here once stop-loss or target gets hit, or when you close a trade manually.
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              {closedTrades.map((trade) => (
                <article key={trade.id} className="rounded-3xl border border-white/10 bg-slate-950/50 p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h3 className="text-xl font-black text-white">{trade.symbol}</h3>
                      <p className="mt-1 text-sm text-slate-400">{trade.screenLabel} · {trade.instrument}</p>
                    </div>
                    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getStatusTone(trade.status)}`}>
                      {trade.status}
                    </span>
                  </div>

                  <div className="mt-4 rounded-2xl border border-white/10 bg-slate-900/50">
                    <MetricRow label="Entry" value={trade.entryPrice.toFixed(2)} />
                    <MetricRow label="Exit" value={(trade.exitPrice ?? trade.currentPrice).toFixed(2)} />
                    <MetricRow label="Result" value={trade.closeReason || trade.status} />
                    <MetricRow label="P&L %" value={`${trade.pnlPct.toFixed(2)}%`} accent={trade.pnlPct >= 0 ? "text-emerald-300" : "text-rose-300"} />
                    <MetricRow label="P&L" value={trade.pnlPoints.toFixed(2)} accent={trade.pnlPoints >= 0 ? "text-emerald-300" : "text-rose-300"} last />
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                    <span>Opened {new Date(trade.openedAt).toLocaleString()}</span>
                    <span>Closed {trade.closedAt ? new Date(trade.closedAt).toLocaleString() : "--"}</span>
                    <span>Score {trade.score.toFixed(1)}</span>
                    <span>{trade.confidenceLabel}</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  accent = "text-white",
}: {
  label: string;
  value: string;
  icon?: ReactNode;
  accent?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</p>
        {icon}
      </div>
      <p className={`mt-2 text-lg font-semibold ${accent}`}>{value}</p>
    </div>
  );
}

function MetricRow({
  label,
  value,
  accent,
  last = false,
}: {
  label: string;
  value: string;
  accent?: string;
  last?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-4 px-4 py-3 ${last ? "" : "border-b border-white/10"}`}>
      <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</span>
      <span className={`text-right text-sm font-medium tracking-tight ${accent || "text-slate-100"}`}>{value}</span>
    </div>
  );
}
