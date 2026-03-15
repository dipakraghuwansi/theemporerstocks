"use client";

import Link from "next/link";
import { ArrowRight, BarChart3, BriefcaseBusiness, ScanSearch } from "lucide-react";

export default function HomePage() {
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
        </div>
      </div>
    </main>
  );
}
