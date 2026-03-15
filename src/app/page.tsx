"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, BarChart3, BriefcaseBusiness, Database, Microscope, RefreshCw, ScanSearch } from "lucide-react";

export default function HomePage() {
  const [isBuildingDayCache, setIsBuildingDayCache] = useState(false);
  const [isBackfillingYear, setIsBackfillingYear] = useState(false);
  const [cacheMessage, setCacheMessage] = useState("");

  const buildDayFoundation = async () => {
    setIsBuildingDayCache(true);
    setCacheMessage("");

    try {
      const res = await fetch("/api/stocks/research/foundation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interval: "day",
          lookbackDays: 180,
          category: "all",
          maxSymbols: 201,
          refresh: false,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setCacheMessage(data.error || "Failed to build day cache.");
        return;
      }

      setCacheMessage(`Day cache ready: ${data.fetched || 0} fetched, ${data.cached || 0} cached`);
    } catch (error) {
      console.error("Failed to build day foundation from home page", error);
      setCacheMessage("Network error while building day cache.");
    } finally {
      setIsBuildingDayCache(false);
    }
  };

  const backfillYearFoundation = async () => {
    setIsBackfillingYear(true);
    setCacheMessage("");

    try {
      const res = await fetch("/api/stocks/research/foundation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interval: "day",
          lookbackDays: 365,
          category: "all",
          maxSymbols: 250,
          refresh: false,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setCacheMessage(data.error || "Failed to backfill 365-day cache.");
        return;
      }

      setCacheMessage(`365d cache ready: ${data.fetched || 0} fetched, ${data.cached || 0} cached, ${data.failed || 0} failed`);
    } catch (error) {
      console.error("Failed to backfill 365d foundation from home page", error);
      setCacheMessage("Network error while building 365-day cache.");
    } finally {
      setIsBackfillingYear(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 px-6 py-16">
      <div className="mx-auto max-w-6xl">
        <div className="max-w-3xl">
          <p className="mb-4 inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1 text-sm font-semibold text-emerald-300">
            Stocks-only pivot in progress
          </p>
          <h1 className="text-5xl font-black tracking-tight text-white">
            The Emperor Stocks is now being rebuilt around equities.
          </h1>
          <p className="mt-6 text-lg leading-8 text-slate-300">
            The old options calculator, quant engine, and strategy flows have been archived so we can rebuild the
            product cleanly for stock trading, journaling, screening, and position management.
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <ScanSearch className="h-8 w-8 text-emerald-300" />
            <h2 className="mt-4 text-xl font-bold">Screener Next</h2>
            <p className="mt-2 text-sm text-slate-400">
              Breakouts, pullbacks, relative strength, and volume expansion will become the new stock-first discovery layer.
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <BarChart3 className="h-8 w-8 text-sky-300" />
            <h2 className="mt-4 text-xl font-bold">Journal Refactor</h2>
            <p className="mt-2 text-sm text-slate-400">
              The trade tracker will be refit around equity entries, exits, notes, and review workflows.
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <BriefcaseBusiness className="h-8 w-8 text-orange-300" />
            <h2 className="mt-4 text-xl font-bold">Positions Rebuild</h2>
            <p className="mt-2 text-sm text-slate-400">
              Position monitoring will move from option legs to stock holdings with cleaner risk controls.
            </p>
          </div>
        </div>

        <div className="mt-12 flex flex-wrap gap-4">
          <button
            type="button"
            onClick={buildDayFoundation}
            disabled={isBuildingDayCache}
            className="inline-flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-3 font-semibold text-emerald-200 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isBuildingDayCache ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
            Build Day Cache
          </button>
          <button
            type="button"
            onClick={backfillYearFoundation}
            disabled={isBackfillingYear}
            className="inline-flex items-center gap-2 rounded-2xl border border-sky-500/30 bg-sky-500/10 px-5 py-3 font-semibold text-sky-200 transition hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isBackfillingYear ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
            Backfill 365d Universe
          </button>
          <Link
            href="/trade-tracker"
            className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-5 py-3 font-semibold text-slate-950 transition hover:bg-emerald-400"
          >
            Open Journal
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/positions"
            className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-5 py-3 font-semibold text-white transition hover:bg-white/10"
          >
            Open Positions
          </Link>
          <Link
            href="/screener"
            className="inline-flex items-center gap-2 rounded-2xl border border-sky-500/30 bg-sky-500/10 px-5 py-3 font-semibold text-sky-200 transition hover:bg-sky-500/20"
          >
            Open Screener
          </Link>
          <Link
            href="/auth-test"
            className="inline-flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-3 font-semibold text-emerald-200 transition hover:bg-emerald-500/20"
          >
            Test Auth Flow
          </Link>
          <Link
            href="/options-structure"
            className="inline-flex items-center gap-2 rounded-2xl border border-sky-500/30 bg-sky-500/10 px-5 py-3 font-semibold text-sky-200 transition hover:bg-sky-500/20"
          >
            Open Options Structure
          </Link>
          <Link
            href="/research"
            className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-5 py-3 font-semibold text-white transition hover:bg-white/10"
          >
            <Microscope className="h-4 w-4" />
            Open Research
          </Link>
        </div>

        {cacheMessage ? (
          <p className="mt-4 text-sm text-slate-300">{cacheMessage}</p>
        ) : null}
      </div>
    </main>
  );
}
