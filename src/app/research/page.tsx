"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BarChart3, Database, RefreshCw, Sigma } from "lucide-react";
import { ResearchManifest, ScreenOutcomeLabel } from "@/lib/research/types";
import { SCREEN_LABELS, StockScreenType } from "@/lib/stockUniverse";

type ResearchPayload = {
  success?: boolean;
  manifest: ResearchManifest | null;
  notes?: string[];
  error?: string;
};

type ActionState = "idle" | "loading";

function summarizeLabels(labels: ScreenOutcomeLabel[]) {
  const wins = labels.filter((label) => label.win);
  const losses = labels.filter((label) => !label.win);
  const sampleSize = labels.length;
  const winRate = sampleSize > 0 ? (wins.length / sampleSize) * 100 : 0;
  const avgWinPct = wins.length > 0 ? wins.reduce((sum, label) => sum + label.netReturnPct, 0) / wins.length : 0;
  const avgLossPct = losses.length > 0 ? losses.reduce((sum, label) => sum + Math.abs(label.netReturnPct), 0) / losses.length : 0;
  const expectancyPct = sampleSize > 0 ? labels.reduce((sum, label) => sum + label.netReturnPct, 0) / sampleSize : 0;

  return {
    sampleSize,
    winRate: Number(winRate.toFixed(1)),
    avgWinPct: Number(avgWinPct.toFixed(2)),
    avgLossPct: Number(avgLossPct.toFixed(2)),
    expectancyPct: Number(expectancyPct.toFixed(2)),
  };
}

function getDriftTone(value: number) {
  if (value > 1.5) return "text-emerald-300";
  if (value < -1.5) return "text-rose-300";
  return "text-slate-200";
}

function formatSigned(value: number, suffix = "") {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}${suffix}`;
}

export default function ResearchPage() {
  const [payload, setPayload] = useState<ResearchPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionState, setActionState] = useState<Record<string, ActionState>>({
    minute: "idle",
    manifest: "idle",
  });
  const [actionMessage, setActionMessage] = useState("");

  const loadManifest = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/stocks/research/manifest", { cache: "no-store" });
      const data: ResearchPayload = await res.json();
      setPayload(data);
    } catch (error) {
      console.error("Failed to load research manifest", error);
      setPayload({ manifest: null, error: "Network error while loading research manifest." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadManifest();
  }, []);

  const runAction = async (kind: "minute" | "manifest") => {
    setActionState((current) => ({ ...current, [kind]: "loading" }));
    setActionMessage("");

    try {
      const res =
        kind === "minute"
          ? await fetch("/api/stocks/research/foundation", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                interval: "minute",
                lookbackDays: 20,
                category: "all",
                maxSymbols: 120,
                refresh: false,
              }),
            })
          : await fetch("/api/stocks/research/manifest", { method: "POST" });

      const data = await res.json();
      if (!res.ok) {
        setActionMessage(data.error || "Action failed.");
        return;
      }

      setActionMessage(
        kind === "minute"
          ? `Minute cache ready: ${data.fetched || 0} fetched, ${data.cached || 0} cached, ${data.failed || 0} failed.`
          : `Research manifest rebuilt at ${new Date(data.manifest?.generatedAt || Date.now()).toLocaleString()}.`
      );
      await loadManifest();
    } catch (error) {
      console.error(`Failed to run ${kind} action`, error);
      setActionMessage("Network error while running the action.");
    } finally {
      setActionState((current) => ({ ...current, [kind]: "idle" }));
    }
  };

  const manifest = payload?.manifest || null;

  const trainTestDrift = useMemo(() => {
    if (!manifest) return [];
    return (["intraday-momentum", "swing-setups", "mean-reversion", "breakout-watchlist"] as StockScreenType[])
      .map((screen) => {
        const train = manifest.splitSummary.find((row) => row.screen === screen && row.split === "train");
        const test = manifest.splitSummary.find((row) => row.screen === screen && row.split === "test");
        const trainExpectancy = train?.expectancyPct ?? 0;
        const testExpectancy = test?.expectancyPct ?? 0;
        const drift = Number((testExpectancy - trainExpectancy).toFixed(2));

        return {
          screen,
          trainSample: train?.sampleSize ?? 0,
          testSample: test?.sampleSize ?? 0,
          trainExpectancy,
          testExpectancy,
          drift,
          trainWinRate: train?.winRate ?? 0,
          testWinRate: test?.winRate ?? 0,
        };
      });
  }, [manifest]);

  const regimeDependency = useMemo(() => {
    if (!manifest) return [];
    return (["intraday-momentum", "swing-setups", "mean-reversion", "breakout-watchlist"] as StockScreenType[])
      .map((screen) => {
        const rows = manifest.regimeSummary.filter((row) => row.screen === screen);
        const sorted = [...rows].sort((a, b) => b.expectancyPct - a.expectancyPct);
        return {
          screen,
          strongest: sorted[0] || null,
          weakest: sorted[sorted.length - 1] || null,
        };
      });
  }, [manifest]);

  const walkForwardConsistency = useMemo(() => {
    if (!manifest) return [];
    return (["intraday-momentum", "swing-setups", "mean-reversion", "breakout-watchlist"] as StockScreenType[])
      .map((screen) => {
        const rows = manifest.walkForwardSummary.filter((row) => row.screen === screen);
        const expectancies = rows.map((row) => row.expectancyPct);
        const max = expectancies.length > 0 ? Math.max(...expectancies) : 0;
        const min = expectancies.length > 0 ? Math.min(...expectancies) : 0;
        return {
          screen,
          rows,
          spread: Number((max - min).toFixed(2)),
        };
      });
  }, [manifest]);

  const intradayMinuteSummary = useMemo(() => {
    if (!manifest) return null;
    const labels = manifest.labels.filter(
      (label) => label.screen === "intraday-momentum" && label.interval === "minute"
    );
    return summarizeLabels(labels);
  }, [manifest]);

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-16 text-slate-100">
      <div className="mx-auto max-w-7xl">
        <div className="max-w-4xl">
          <p className="inline-flex rounded-full border border-sky-500/30 bg-sky-500/10 px-4 py-1 text-xs font-semibold text-sky-300">
            Validation dashboard
          </p>
          <h1 className="mt-4 text-4xl font-black tracking-tight">Research workbench</h1>
          <p className="mt-5 text-base leading-7 text-slate-300">
            This is where we inspect whether the model is actually holding up. We can compare train versus test,
            see which regimes each screen likes, measure walk-forward drift, and check whether intraday momentum
            still behaves once minute labels are used.
          </p>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => runAction("minute")}
            disabled={actionState.minute === "loading"}
            className="inline-flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/20 disabled:opacity-60"
          >
            {actionState.minute === "loading" ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
            Build Minute Cache
          </button>
          <button
            type="button"
            onClick={() => runAction("manifest")}
            disabled={actionState.manifest === "loading"}
            className="inline-flex items-center gap-2 rounded-2xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm font-semibold text-sky-200 transition hover:bg-sky-500/20 disabled:opacity-60"
          >
            {actionState.manifest === "loading" ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sigma className="h-4 w-4" />}
            Rebuild Research Manifest
          </button>
          <Link
            href="/screener"
            className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            <BarChart3 className="h-4 w-4" />
            Open Screener
          </Link>
        </div>

        {actionMessage ? <p className="mt-4 text-sm text-slate-300">{actionMessage}</p> : null}

        {loading ? (
          <div className="mt-8 rounded-3xl border border-dashed border-white/10 bg-white/5 p-8 text-sm text-slate-400">
            Loading research manifest...
          </div>
        ) : payload?.error ? (
          <div className="mt-8 rounded-3xl border border-rose-500/20 bg-rose-500/10 p-8 text-sm text-rose-100">
            {payload.error}
          </div>
        ) : (
          <>
            <div className="mt-8 grid gap-4 md:grid-cols-4">
              <SummaryCard label="Generated" value={manifest?.generatedAt ? new Date(manifest.generatedAt).toLocaleString() : "--"} />
              <SummaryCard label="Screens" value={String(manifest?.screens.length || 0)} />
              <SummaryCard label="Labels" value={String(manifest?.labels.length || 0)} />
              <SummaryCard label="No Lookahead" value={manifest?.config.noLookaheadValidation ? "Enabled" : "Off"} />
            </div>

            <section className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-6">
              <h2 className="text-lg font-bold">Intraday minute validation</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-4">
                <SummaryCard label="Minute Samples" value={String(intradayMinuteSummary?.sampleSize || 0)} />
                <SummaryCard label="Win Rate" value={intradayMinuteSummary ? `${intradayMinuteSummary.winRate}%` : "--"} />
                <SummaryCard label="Expectancy" value={intradayMinuteSummary ? `${intradayMinuteSummary.expectancyPct.toFixed(2)}%` : "--"} />
                <SummaryCard label="Verdict" value={intradayMinuteSummary && intradayMinuteSummary.sampleSize >= 8 ? (intradayMinuteSummary.expectancyPct > 0 ? "Holding Up" : "Needs Work") : "Thin Sample"} />
              </div>
            </section>

            <section className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-6">
              <h2 className="text-lg font-bold">Train vs Test Drift</h2>
              <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-900/70 text-slate-400">
                    <tr>
                      <th className="px-4 py-3 font-medium">Screen</th>
                      <th className="px-4 py-3 font-medium">Train</th>
                      <th className="px-4 py-3 font-medium">Test</th>
                      <th className="px-4 py-3 font-medium">Drift</th>
                      <th className="px-4 py-3 font-medium">Train WR</th>
                      <th className="px-4 py-3 font-medium">Test WR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trainTestDrift.map((row) => (
                      <tr key={row.screen} className="border-t border-white/10">
                        <td className="px-4 py-3 font-medium text-white">{SCREEN_LABELS[row.screen]}</td>
                        <td className="px-4 py-3 text-slate-300">{row.trainExpectancy.toFixed(2)}% ({row.trainSample})</td>
                        <td className="px-4 py-3 text-slate-300">{row.testExpectancy.toFixed(2)}% ({row.testSample})</td>
                        <td className={`px-4 py-3 font-semibold ${getDriftTone(row.drift)}`}>{formatSigned(row.drift, "%")}</td>
                        <td className="px-4 py-3 text-slate-300">{row.trainWinRate.toFixed(1)}%</td>
                        <td className="px-4 py-3 text-slate-300">{row.testWinRate.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <div className="mt-10 grid gap-6 xl:grid-cols-2">
              <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
                <h2 className="text-lg font-bold">Regime Dependency</h2>
                <div className="mt-4 space-y-4">
                  {regimeDependency.map((row) => (
                    <div key={row.screen} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                      <p className="text-sm font-semibold text-white">{SCREEN_LABELS[row.screen]}</p>
                      <div className="mt-3 flex items-center justify-between gap-4 text-sm">
                        <span className="text-slate-400">Best regime</span>
                        <span className="text-emerald-300">
                          {row.strongest ? `${row.strongest.regime} (${row.strongest.expectancyPct.toFixed(2)}%)` : "--"}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-4 text-sm">
                        <span className="text-slate-400">Weakest regime</span>
                        <span className="text-rose-300">
                          {row.weakest ? `${row.weakest.regime} (${row.weakest.expectancyPct.toFixed(2)}%)` : "--"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
                <h2 className="text-lg font-bold">Walk-Forward Consistency</h2>
                <div className="mt-4 space-y-4">
                  {walkForwardConsistency.map((row) => (
                    <div key={row.screen} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                      <div className="flex items-center justify-between gap-4">
                        <p className="text-sm font-semibold text-white">{SCREEN_LABELS[row.screen]}</p>
                        <span className={`text-sm font-semibold ${getDriftTone(-row.spread)}`}>
                          Spread {row.spread.toFixed(2)}%
                        </span>
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-3">
                        {row.rows.map((bucket) => (
                          <div key={bucket.bucket} className="rounded-xl border border-white/10 bg-white/5 p-3">
                            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{bucket.bucket}</p>
                            <p className="mt-2 text-sm font-semibold text-white">{bucket.expectancyPct.toFixed(2)}%</p>
                            <p className="mt-1 text-xs text-slate-400">WR {bucket.winRate.toFixed(1)} · N {bucket.sampleSize}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            {(payload?.notes || []).length > 0 ? (
              <section className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-6">
                <h2 className="text-lg font-bold">Notes</h2>
                <ul className="mt-4 space-y-2 text-sm text-slate-300">
                  {(payload?.notes || []).map((note) => (
                    <li key={note}>• {note}</li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}
