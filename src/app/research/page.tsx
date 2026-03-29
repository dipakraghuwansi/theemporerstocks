"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BarChart3, Database, Pause, Play, RefreshCw, RotateCcw, Sigma } from "lucide-react";
import {
  ResearchBacktestMode,
  ResearchBacktestBatchReport,
  ResearchBacktestRun,
  ResearchBacktestSymbolResult,
  ResearchManifest,
  ScreenOutcomeLabel,
} from "@/lib/research/types";
import { useStockStream } from "@/lib/useStockStream";
import { SCREEN_LABELS, StockScreenType } from "@/lib/stockUniverse";

type ResearchPayload = {
  success?: boolean;
  manifest: ResearchManifest | null;
  notes?: string[];
  error?: string;
};

type FoundationStatusPayload = {
  success?: boolean;
  interval: string;
  cacheSummary?: {
    interval: string;
    datasetCount: number;
    totalBytes: number;
    totalBytesFormatted: string;
    manifestGeneratedAt: string | null;
    lookbackDays: number | null;
    requestedSymbols: number;
  };
};

type VolSurfacePayload = {
  success?: boolean;
  generatedAt?: string;
  totalSymbols?: number;
  availableCount?: number;
  historySummary?: {
    totalSnapshots: number;
    uniqueSymbols: number;
    lastCapturedAt: string | null;
  };
  skewSummary?: Array<{
    regime: string;
    sampleSize: number;
    avgAtmIv: number | null;
    avgNearAtmSkew: number | null;
    avgTermSlope: number | null;
    avgOptionsAdjustment: number | null;
  }>;
  gammaSummary?: Array<{
    regime: string;
    sampleSize: number;
    avgAtmIv: number | null;
    avgNearAtmSkew: number | null;
    avgTermSlope: number | null;
    avgOptionsAdjustment: number | null;
  }>;
  topPositiveSkew?: Array<{
    symbol: string;
    sector: string;
    nearAtmVolSkew: number | null;
    atmIv: number | null;
    termStructureSlope: number | null;
    optionsAdjustmentHint: number;
  }>;
  topNegativeSkew?: Array<{
    symbol: string;
    sector: string;
    nearAtmVolSkew: number | null;
    atmIv: number | null;
    termStructureSlope: number | null;
    optionsAdjustmentHint: number;
  }>;
  topTermSlope?: Array<{
    symbol: string;
    sector: string;
    nearAtmVolSkew: number | null;
    atmIv: number | null;
    termStructureSlope: number | null;
    optionsAdjustmentHint: number;
  }>;
  notes?: string[];
  error?: string;
};

type ResearchBacktestStatusPayload = {
  success?: boolean;
  runs?: Partial<Record<ResearchBacktestMode, ResearchBacktestRun>>;
  recentResultsByMode?: Partial<Record<ResearchBacktestMode, ResearchBacktestSymbolResult[]>>;
  aggregateManifestGeneratedAt?: string | null;
  notes?: string[];
  error?: string;
  needsLogin?: boolean;
};

type ResearchBacktestRunPayload = {
  success?: boolean;
  data?: ResearchBacktestBatchReport;
  notes?: string[];
  error?: string;
  needsLogin?: boolean;
};

type ActionState = "idle" | "loading";
type BacktestActionKey = "weekendBacktestDay" | "weekendBacktestMinute";

function getBacktestActionKey(mode: ResearchBacktestMode): BacktestActionKey {
  return mode === "minute" ? "weekendBacktestMinute" : "weekendBacktestDay";
}

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

function hasNumericValue(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export default function ResearchPage() {
  const { snapshot: streamSnapshot, socketConnected } = useStockStream();
  const [payload, setPayload] = useState<ResearchPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionState, setActionState] = useState<Record<string, ActionState>>({
    day365: "idle",
    minute: "idle",
    manifest: "idle",
    volSurface: "idle",
    weekendBacktestDay: "idle",
    weekendBacktestMinute: "idle",
  });
  const [actionMessage, setActionMessage] = useState("");
  const [dayCacheStatus, setDayCacheStatus] = useState<FoundationStatusPayload["cacheSummary"] | null>(null);
  const [minuteCacheStatus, setMinuteCacheStatus] = useState<FoundationStatusPayload["cacheSummary"] | null>(null);
  const [volSurface, setVolSurface] = useState<VolSurfacePayload | null>(null);
  const [backtestMode, setBacktestMode] = useState<ResearchBacktestStatusPayload | null>(null);
  const [autoBacktestDay, setAutoBacktestDay] = useState(false);
  const [autoBacktestMinute, setAutoBacktestMinute] = useState(false);

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

  const loadBacktestMode = async () => {
    try {
      const res = await fetch("/api/stocks/research/backtest-mode", { cache: "no-store" });
      const data: ResearchBacktestStatusPayload = await res.json();
      setBacktestMode(data);
    } catch (error) {
      console.error("Failed to load weekend backtest mode", error);
      setBacktestMode({
        error: "Network error while loading weekend backtest mode.",
        recentResultsByMode: {
          day: [],
          minute: [],
        },
      });
    }
  };

  useEffect(() => {
    loadManifest();
  }, []);

  useEffect(() => {
    loadBacktestMode();
  }, []);

  useEffect(() => {
    const loadCacheStatuses = async () => {
      try {
        const [dayRes, minuteRes] = await Promise.all([
          fetch("/api/stocks/research/foundation?interval=day", { cache: "no-store" }),
          fetch("/api/stocks/research/foundation?interval=minute", { cache: "no-store" }),
        ]);
        const dayData: FoundationStatusPayload = await dayRes.json();
        const minuteData: FoundationStatusPayload = await minuteRes.json();
        setDayCacheStatus(dayData.cacheSummary || null);
        setMinuteCacheStatus(minuteData.cacheSummary || null);
      } catch (error) {
        console.error("Failed to load historical cache status", error);
      }
    };

    loadCacheStatuses();
  }, []);

  useEffect(() => {
    const loadVolSurface = async () => {
      try {
        const res = await fetch("/api/stocks/research/vol-surface?limit=40", { cache: "no-store" });
        const data: VolSurfacePayload = await res.json();
        setVolSurface(data);
      } catch (error) {
        console.error("Failed to load vol surface diagnostics", error);
        setVolSurface({ success: false, error: "Network error while loading vol surface diagnostics." });
      }
    };

    loadVolSurface();
  }, []);

  const runAction = async (kind: "day365" | "minute" | "manifest" | "volSurface") => {
    setActionState((current) => ({ ...current, [kind]: "loading" }));
    setActionMessage("");

    try {
      const res =
        kind === "day365"
          ? await fetch("/api/stocks/research/foundation", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                interval: "day",
                lookbackDays: 365,
                category: "all",
                maxSymbols: 250,
                refresh: false,
              }),
            })
          : kind === "minute"
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
          : kind === "volSurface"
          ? await fetch("/api/stocks/research/vol-surface?limit=40", {
              method: "POST",
            })
          : await fetch("/api/stocks/research/manifest", { method: "POST" });

      const data = await res.json();
      if (!res.ok) {
        setActionMessage(data.error || "Action failed.");
        return;
      }

      setActionMessage(
        kind === "day365"
          ? `365d day cache ready: ${data.fetched || 0} fetched, ${data.cached || 0} cached, ${data.failed || 0} failed.`
          : kind === "minute"
          ? `Minute cache ready: ${data.fetched || 0} fetched, ${data.cached || 0} cached, ${data.failed || 0} failed.`
          : kind === "volSurface"
          ? `Options surface snapshot captured for ${data.capturedSymbols || 0} symbols.`
          : `Research manifest rebuilt at ${new Date(data.manifest?.generatedAt || Date.now()).toLocaleString()}.`
      );
      await loadManifest();
      const volSurfaceRes = await fetch("/api/stocks/research/vol-surface?limit=40", { cache: "no-store" });
      const volSurfaceData: VolSurfacePayload = await volSurfaceRes.json();
      setVolSurface(volSurfaceData);
      const [dayFoundationRes, minuteFoundationRes] = await Promise.all([
        fetch("/api/stocks/research/foundation?interval=day", { cache: "no-store" }),
        fetch("/api/stocks/research/foundation?interval=minute", { cache: "no-store" }),
      ]);
      const dayFoundationData: FoundationStatusPayload = await dayFoundationRes.json();
      const minuteFoundationData: FoundationStatusPayload = await minuteFoundationRes.json();
      setDayCacheStatus(dayFoundationData.cacheSummary || null);
      setMinuteCacheStatus(minuteFoundationData.cacheSummary || null);
    } catch (error) {
      console.error(`Failed to run ${kind} action`, error);
      setActionMessage("Network error while running the action.");
    } finally {
      setActionState((current) => ({ ...current, [kind]: "idle" }));
    }
  };

  const runWeekendBacktest = async (mode: ResearchBacktestMode, options: { reset?: boolean } = {}) => {
    const actionKey = getBacktestActionKey(mode);
    setActionState((current) => ({ ...current, [actionKey]: "loading" }));
    setActionMessage("");

    try {
      const res = await fetch("/api/stocks/research/backtest-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          lookbackDays: mode === "day" ? 730 : 20,
          batchSize: 1,
          reset: Boolean(options.reset),
          refreshData: false,
        }),
      });

      const data: ResearchBacktestRunPayload = await res.json();
      if (!res.ok || !data.data) {
        if (data.needsLogin) {
          if (mode === "day") {
            setAutoBacktestDay(false);
          } else {
            setAutoBacktestMinute(false);
          }
        }
        setActionMessage(data.error || `${mode === "day" ? "Daily" : "Minute"} weekend sweep batch failed.`);
        return;
      }

      setBacktestMode((current) => ({
        success: true,
        runs: {
          ...(current?.runs || {}),
          [mode]: data.data?.run,
        },
        recentResultsByMode: {
          ...(current?.recentResultsByMode || {}),
          [mode]: [
            ...(data.data?.batch.symbols || []),
            ...(((current?.recentResultsByMode?.[mode] || []).filter(
              (row) => !(data.data?.batch.symbols || []).some((batchRow) => batchRow.symbol === row.symbol)
            ))),
          ].slice(0, 12),
        },
        aggregateManifestGeneratedAt:
          data.data?.aggregateManifest?.generatedAt || current?.aggregateManifestGeneratedAt || null,
        notes: data.notes || current?.notes || [],
      }));

      if (data.data.aggregateManifest) {
        setPayload((current) => ({
          success: true,
          manifest: data.data?.aggregateManifest || current?.manifest || null,
          notes: current?.notes,
        }));
      }

      const laneLabel = mode === "day" ? "Daily" : "Minute";
      const nextSymbol = data.data.run.nextSymbol ? ` Next: ${data.data.run.nextSymbol}.` : "";
      setActionMessage(
        `${laneLabel} weekend sweep processed ${data.data.batch.processed} symbol(s): ${data.data.batch.completed} completed, ${data.data.batch.failed} failed.${nextSymbol}`
      );
    } catch (error) {
      console.error("Failed to run weekend backtest mode", error);
      if (mode === "day") {
        setAutoBacktestDay(false);
      } else {
        setAutoBacktestMinute(false);
      }
      setActionMessage("Network error while running weekend backtest mode.");
    } finally {
      setActionState((current) => ({ ...current, [actionKey]: "idle" }));
    }
  };

  useEffect(() => {
    if (!autoBacktestDay) return;
    if (actionState.weekendBacktestDay === "loading") return;
    const run = backtestMode?.runs?.day;
    if (!run || run.status === "COMPLETED") {
      setAutoBacktestDay(false);
      return;
    }

    const timeout = window.setTimeout(() => {
      runWeekendBacktest("day");
    }, 700);

    return () => window.clearTimeout(timeout);
  }, [
    autoBacktestDay,
    actionState.weekendBacktestDay,
    backtestMode?.runs?.day,
    backtestMode?.runs?.day?.status,
    backtestMode?.runs?.day?.nextSymbol,
  ]);

  useEffect(() => {
    if (!autoBacktestMinute) return;
    if (actionState.weekendBacktestMinute === "loading") return;
    const run = backtestMode?.runs?.minute;
    if (!run || run.status === "COMPLETED") {
      setAutoBacktestMinute(false);
      return;
    }

    const timeout = window.setTimeout(() => {
      runWeekendBacktest("minute");
    }, 700);

    return () => window.clearTimeout(timeout);
  }, [
    autoBacktestMinute,
    actionState.weekendBacktestMinute,
    backtestMode?.runs?.minute,
    backtestMode?.runs?.minute?.status,
    backtestMode?.runs?.minute?.nextSymbol,
  ]);

  const manifest = payload?.manifest || null;
  const dayWeekendRun = backtestMode?.runs?.day || null;
  const minuteWeekendRun = backtestMode?.runs?.minute || null;

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

  const microstructureBiasSummary = useMemo(() => {
    if (!manifest) return [];
    return (manifest.microstructureSummary || [])
      .filter((row) => row.screen === "intraday-momentum")
      .sort((a, b) => b.netExpectancyPct - a.netExpectancyPct);
  }, [manifest]);

  const microstructureCoverage = useMemo(() => {
    if (!manifest) return [];
    return [...(manifest.microstructureCoverageSummary || [])].sort((a, b) => b.coveragePct - a.coveragePct);
  }, [manifest]);

  const liveMicrostructureSummary = useMemo(() => {
    const quotes = streamSnapshot.quotes || [];
    const depthReady = quotes.filter((quote) => hasNumericValue(quote.micropriceEdgePct) && hasNumericValue(quote.rollingOfi)).length;
    const tradePressureReady = quotes.filter((quote) => hasNumericValue(quote.tradePressureScore)).length;
    const vpinReady = quotes.filter((quote) => hasNumericValue(quote.vpin)).length;
    const recentSignals = quotes
      .filter(
        (quote) =>
          hasNumericValue(quote.micropriceEdgePct) ||
          hasNumericValue(quote.rollingOfi) ||
          hasNumericValue(quote.tradePressureScore) ||
          hasNumericValue(quote.vpin)
      )
      .sort((a, b) => {
        const left = Math.abs(a.tradePressureScore || 0) + Math.abs(a.micropriceEdgePct || 0);
        const right = Math.abs(b.tradePressureScore || 0) + Math.abs(b.micropriceEdgePct || 0);
        return right - left;
      })
      .slice(0, 8);

    return {
      quoteCount: quotes.length,
      depthReady,
      tradePressureReady,
      vpinReady,
      recentSignals,
    };
  }, [streamSnapshot.quotes]);

  const stabilitySummary = useMemo(() => {
    if (!manifest) return [];
    return [...(manifest.stabilitySummary || [])].sort((a, b) => b.stabilityScore - a.stabilityScore);
  }, [manifest]);

  const volSurfaceResearch = useMemo(() => {
    if (!manifest) return { skew: [], gamma: [] };
    return {
      skew: (manifest.volSurfaceSummary || [])
        .filter((row) => row.family === "vol_skew")
        .sort((a, b) => b.netExpectancyPct - a.netExpectancyPct),
      gamma: (manifest.volSurfaceSummary || [])
        .filter((row) => row.family === "gamma")
        .sort((a, b) => b.netExpectancyPct - a.netExpectancyPct),
    };
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
            onClick={() => runAction("day365")}
            disabled={actionState.day365 === "loading"}
            className="inline-flex items-center gap-2 rounded-2xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm font-semibold text-sky-200 transition hover:bg-sky-500/20 disabled:opacity-60"
          >
            {actionState.day365 === "loading" ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
            Backfill 365d Universe
          </button>
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
          <button
            type="button"
            onClick={() => runAction("volSurface")}
            disabled={actionState.volSurface === "loading"}
            className="inline-flex items-center gap-2 rounded-2xl border border-violet-500/30 bg-violet-500/10 px-4 py-3 text-sm font-semibold text-violet-200 transition hover:bg-violet-500/20 disabled:opacity-60"
          >
            {actionState.volSurface === "loading" ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sigma className="h-4 w-4" />}
            Capture Options Surface
          </button>
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
              <h2 className="text-lg font-bold">Local Historical Cache</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-3 xl:grid-cols-6">
                <SummaryCard label="Day Datasets" value={String(dayCacheStatus?.datasetCount || 0)} />
                <SummaryCard label="Day Size" value={dayCacheStatus?.totalBytesFormatted || "--"} />
                <SummaryCard label="Day Lookback" value={dayCacheStatus?.lookbackDays ? `${dayCacheStatus.lookbackDays}d` : "--"} />
                <SummaryCard label="Minute Datasets" value={String(minuteCacheStatus?.datasetCount || 0)} />
                <SummaryCard label="Minute Size" value={minuteCacheStatus?.totalBytesFormatted || "--"} />
                <SummaryCard label="Minute Lookback" value={minuteCacheStatus?.lookbackDays ? `${minuteCacheStatus.lookbackDays}d` : "--"} />
              </div>
            </section>

            <SweepSection
              title="Weekend Daily Universe Sweep"
              description="This lane walks the universe one symbol at a time, builds 2-year daily evidence, saves every step to MongoDB, and keeps the aggregate research manifest fresh without depending on live market hours."
              run={dayWeekendRun}
              recentResults={backtestMode?.recentResultsByMode?.day || []}
              actionState={actionState.weekendBacktestDay}
              autoRunning={autoBacktestDay}
              onRun={() => runWeekendBacktest("day")}
              onToggleAuto={() => setAutoBacktestDay((current) => !current)}
              onRestart={() => {
                setAutoBacktestDay(false);
                runWeekendBacktest("day", { reset: true });
              }}
              error={backtestMode?.error}
              emptyMessage="No daily weekend sweep symbols have been processed yet."
            />

            <SweepSection
              title="Weekend Minute Universe Sweep"
              description="This lane fills recent intraday validation over a rolling 20-day minute window, one symbol at a time, so the intraday evidence set can keep compounding over weekends without needing live-market hours."
              run={minuteWeekendRun}
              recentResults={backtestMode?.recentResultsByMode?.minute || []}
              actionState={actionState.weekendBacktestMinute}
              autoRunning={autoBacktestMinute}
              onRun={() => runWeekendBacktest("minute")}
              onToggleAuto={() => setAutoBacktestMinute((current) => !current)}
              onRestart={() => {
                setAutoBacktestMinute(false);
                runWeekendBacktest("minute", { reset: true });
              }}
              error={backtestMode?.error}
              emptyMessage="No minute weekend sweep symbols have been processed yet."
            />

            {backtestMode?.notes?.length ? (
              <section className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-6">
                <h2 className="text-lg font-bold">Weekend Sweep Notes</h2>
                <div className="mt-4 space-y-2 text-sm text-slate-400">
                  {backtestMode.notes.map((note) => (
                    <p key={note}>{note}</p>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold">Microstructure Capture Status</h2>
                  <p className="mt-2 text-sm text-slate-400">
                    Live stream health and current signal coverage. Depth-backed readings are ideal, while trade-pressure is the fallback path when order-book depth is missing.
                  </p>
                </div>
                <div className={`rounded-full px-4 py-2 text-sm font-semibold ${socketConnected && streamSnapshot.connected ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border border-amber-500/30 bg-amber-500/10 text-amber-200"}`}>
                  {socketConnected && streamSnapshot.connected ? "Stream Connected" : "Stream Waiting"}
                </div>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-5">
                <SummaryCard label="Quotes Live" value={String(liveMicrostructureSummary.quoteCount || 0)} />
                <SummaryCard label="Depth Ready" value={String(liveMicrostructureSummary.depthReady || 0)} />
                <SummaryCard label="Trade Pressure Ready" value={String(liveMicrostructureSummary.tradePressureReady || 0)} />
                <SummaryCard label="VPIN Ready" value={String(liveMicrostructureSummary.vpinReady || 0)} />
                <SummaryCard
                  label="Last Tick"
                  value={streamSnapshot.lastTickAt ? new Date(streamSnapshot.lastTickAt).toLocaleTimeString() : "--"}
                />
              </div>

              <div className="mt-6 overflow-x-auto rounded-2xl border border-white/10">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-900/70 text-slate-400">
                    <tr>
                      <th className="px-4 py-3 font-medium">Symbol</th>
                      <th className="px-4 py-3 font-medium">Edge</th>
                      <th className="px-4 py-3 font-medium">Rolling OFI</th>
                      <th className="px-4 py-3 font-medium">Trade Pressure</th>
                      <th className="px-4 py-3 font-medium">VPIN</th>
                      <th className="px-4 py-3 font-medium">Tick Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {liveMicrostructureSummary.recentSignals.map((quote) => (
                      <tr key={quote.instrument} className="border-t border-white/10">
                        <td className="px-4 py-3 font-medium text-white">{quote.symbol}</td>
                        <td className="px-4 py-3 text-slate-300">{hasNumericValue(quote.micropriceEdgePct) ? `${quote.micropriceEdgePct.toFixed(3)}%` : "--"}</td>
                        <td className="px-4 py-3 text-slate-300">{hasNumericValue(quote.rollingOfi) ? quote.rollingOfi.toFixed(1) : "--"}</td>
                        <td className="px-4 py-3 text-slate-300">{hasNumericValue(quote.tradePressureScore) ? quote.tradePressureScore.toFixed(3) : "--"}</td>
                        <td className="px-4 py-3 text-slate-300">{hasNumericValue(quote.vpin) ? `${(quote.vpin * 100).toFixed(1)}%` : "--"}</td>
                        <td className="px-4 py-3 text-slate-300">{new Date(quote.timestamp).toLocaleTimeString()}</td>
                      </tr>
                    ))}
                    {liveMicrostructureSummary.recentSignals.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                          No live microstructure signals have been captured yet.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-6">
              <h2 className="text-lg font-bold">Intraday minute validation</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-4">
                <SummaryCard label="Minute Samples" value={String(intradayMinuteSummary?.sampleSize || 0)} />
                <SummaryCard label="Win Rate" value={intradayMinuteSummary ? `${intradayMinuteSummary.winRate}%` : "--"} />
                <SummaryCard label="Expectancy" value={intradayMinuteSummary ? `${intradayMinuteSummary.expectancyPct.toFixed(2)}%` : "--"} />
                <SummaryCard label="Verdict" value={intradayMinuteSummary && intradayMinuteSummary.sampleSize >= 8 ? (intradayMinuteSummary.expectancyPct > 0 ? "Holding Up" : "Needs Work") : "Thin Sample"} />
              </div>
              <div className="mt-6 overflow-x-auto rounded-2xl border border-white/10">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-900/70 text-slate-400">
                    <tr>
                      <th className="px-4 py-3 font-medium">Screen</th>
                      <th className="px-4 py-3 font-medium">Minute Labels</th>
                      <th className="px-4 py-3 font-medium">Covered</th>
                      <th className="px-4 py-3 font-medium">Unavailable</th>
                      <th className="px-4 py-3 font-medium">Coverage %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {microstructureCoverage.map((row) => (
                      <tr key={row.screen} className="border-t border-white/10">
                        <td className="px-4 py-3 font-medium text-white">{SCREEN_LABELS[row.screen]}</td>
                        <td className="px-4 py-3 text-slate-300">{row.totalMinuteLabels}</td>
                        <td className="px-4 py-3 text-emerald-300">{row.coveredLabels}</td>
                        <td className="px-4 py-3 text-amber-300">{row.unavailableLabels}</td>
                        <td className={row.coveragePct >= 60 ? "px-4 py-3 font-semibold text-emerald-300" : row.coveragePct >= 30 ? "px-4 py-3 font-semibold text-amber-300" : "px-4 py-3 font-semibold text-rose-300"}>
                          {row.coveragePct.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-6 overflow-x-auto rounded-2xl border border-white/10">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-900/70 text-slate-400">
                    <tr>
                      <th className="px-4 py-3 font-medium">Microstructure Bias</th>
                      <th className="px-4 py-3 font-medium">Samples</th>
                      <th className="px-4 py-3 font-medium">Win Rate</th>
                      <th className="px-4 py-3 font-medium">Net EV</th>
                      <th className="px-4 py-3 font-medium">Avg VPIN</th>
                      <th className="px-4 py-3 font-medium">Avg Edge</th>
                      <th className="px-4 py-3 font-medium">Avg Rolling OFI</th>
                      <th className="px-4 py-3 font-medium">Avg Trade Pressure</th>
                    </tr>
                  </thead>
                  <tbody>
                    {microstructureBiasSummary.map((row) => (
                      <tr key={row.bias} className="border-t border-white/10">
                        <td className="px-4 py-3 font-medium capitalize text-white">{row.bias}</td>
                        <td className="px-4 py-3 text-slate-300">{row.sampleSize}</td>
                        <td className="px-4 py-3 text-slate-300">{row.winRate.toFixed(1)}%</td>
                        <td className={row.netExpectancyPct >= 0 ? "px-4 py-3 font-semibold text-emerald-300" : "px-4 py-3 font-semibold text-rose-300"}>
                          {row.netExpectancyPct.toFixed(2)}%
                        </td>
                        <td className="px-4 py-3 text-slate-300">{hasNumericValue(row.avgVpin) ? `${(row.avgVpin * 100).toFixed(1)}%` : "--"}</td>
                        <td className="px-4 py-3 text-slate-300">{hasNumericValue(row.avgMicropriceEdgePct) ? `${row.avgMicropriceEdgePct.toFixed(4)}%` : "--"}</td>
                        <td className="px-4 py-3 text-slate-300">{hasNumericValue(row.avgRollingOfi) ? row.avgRollingOfi.toFixed(1) : "--"}</td>
                        <td className="px-4 py-3 text-slate-300">{hasNumericValue(row.avgTradePressureScore) ? row.avgTradePressureScore.toFixed(3) : "--"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-6">
              <h2 className="text-lg font-bold">Screen Stability Score</h2>
              <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-900/70 text-slate-400">
                    <tr>
                      <th className="px-4 py-3 font-medium">Screen</th>
                      <th className="px-4 py-3 font-medium">Stability</th>
                      <th className="px-4 py-3 font-medium">Drift</th>
                      <th className="px-4 py-3 font-medium">WF Spread</th>
                      <th className="px-4 py-3 font-medium">Regime Spread</th>
                      <th className="px-4 py-3 font-medium">Test Net EV</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stabilitySummary.map((row) => (
                      <tr key={row.screen} className="border-t border-white/10">
                        <td className="px-4 py-3 font-medium text-white">{SCREEN_LABELS[row.screen]}</td>
                        <td className={row.stabilityScore >= 65 ? "px-4 py-3 font-semibold text-emerald-300" : row.stabilityScore >= 45 ? "px-4 py-3 font-semibold text-amber-300" : "px-4 py-3 font-semibold text-rose-300"}>
                          {row.stabilityScore.toFixed(1)}
                        </td>
                        <td className={`px-4 py-3 ${getDriftTone(row.driftPct)}`}>{formatSigned(row.driftPct, "%")}</td>
                        <td className="px-4 py-3 text-slate-300">{row.walkForwardSpreadPct.toFixed(2)}%</td>
                        <td className="px-4 py-3 text-slate-300">{row.regimeSpreadPct.toFixed(2)}%</td>
                        <td className={row.testNetExpectancyPct >= 0 ? "px-4 py-3 text-emerald-300" : "px-4 py-3 text-rose-300"}>
                          {row.testNetExpectancyPct.toFixed(2)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold">Live Vol Surface Diagnostics</h2>
                  <p className="mt-2 text-sm text-slate-400">
                    Current chain read across the live universe slice. This helps us inspect skew and term structure
                    now while we line up historical options-surface research later.
                  </p>
                </div>
                <div className="text-right text-xs text-slate-400">
                  <p>Available {volSurface?.availableCount || 0} / {volSurface?.totalSymbols || 0}</p>
                  <p>{volSurface?.generatedAt ? new Date(volSurface.generatedAt).toLocaleString() : "--"}</p>
                </div>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <SummaryCard label="Surface History Rows" value={String(volSurface?.historySummary?.totalSnapshots || 0)} />
                <SummaryCard label="Unique Symbols" value={String(volSurface?.historySummary?.uniqueSymbols || 0)} />
                <SummaryCard
                  label="Last Capture"
                  value={volSurface?.historySummary?.lastCapturedAt ? new Date(volSurface.historySummary.lastCapturedAt).toLocaleString() : "--"}
                />
              </div>

              {volSurface?.error ? (
                <div className="mt-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-100">
                  {volSurface.error}
                </div>
              ) : (
                <>
                  <div className="mt-6 grid gap-6 xl:grid-cols-2">
                    <div className="overflow-x-auto rounded-2xl border border-white/10">
                      <table className="min-w-full text-left text-sm">
                        <thead className="bg-slate-900/70 text-slate-400">
                          <tr>
                            <th className="px-4 py-3 font-medium">Skew Regime</th>
                            <th className="px-4 py-3 font-medium">N</th>
                            <th className="px-4 py-3 font-medium">ATM IV</th>
                            <th className="px-4 py-3 font-medium">Near ATM Skew</th>
                            <th className="px-4 py-3 font-medium">Term Slope</th>
                            <th className="px-4 py-3 font-medium">Adj</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(volSurface?.skewSummary || []).map((row) => (
                            <tr key={row.regime} className="border-t border-white/10">
                              <td className="px-4 py-3 font-medium capitalize text-white">{row.regime.replace("_", " ")}</td>
                              <td className="px-4 py-3 text-slate-300">{row.sampleSize}</td>
                              <td className="px-4 py-3 text-slate-300">{row.avgAtmIv !== null ? `${row.avgAtmIv.toFixed(2)}%` : "--"}</td>
                              <td className={row.avgNearAtmSkew !== null && row.avgNearAtmSkew >= 0 ? "px-4 py-3 text-amber-300" : "px-4 py-3 text-sky-300"}>
                                {row.avgNearAtmSkew !== null ? formatSigned(row.avgNearAtmSkew, "%") : "--"}
                              </td>
                              <td className={row.avgTermSlope !== null && row.avgTermSlope >= 0 ? "px-4 py-3 text-amber-300" : "px-4 py-3 text-sky-300"}>
                                {row.avgTermSlope !== null ? formatSigned(row.avgTermSlope, "%") : "--"}
                              </td>
                              <td className="px-4 py-3 text-slate-300">{row.avgOptionsAdjustment !== null ? formatSigned(row.avgOptionsAdjustment) : "--"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="overflow-x-auto rounded-2xl border border-white/10">
                      <table className="min-w-full text-left text-sm">
                        <thead className="bg-slate-900/70 text-slate-400">
                          <tr>
                            <th className="px-4 py-3 font-medium">Gamma Regime</th>
                            <th className="px-4 py-3 font-medium">N</th>
                            <th className="px-4 py-3 font-medium">ATM IV</th>
                            <th className="px-4 py-3 font-medium">Near ATM Skew</th>
                            <th className="px-4 py-3 font-medium">Term Slope</th>
                            <th className="px-4 py-3 font-medium">Adj</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(volSurface?.gammaSummary || []).map((row) => (
                            <tr key={row.regime} className="border-t border-white/10">
                              <td className="px-4 py-3 font-medium capitalize text-white">{row.regime.replace("_", " ")}</td>
                              <td className="px-4 py-3 text-slate-300">{row.sampleSize}</td>
                              <td className="px-4 py-3 text-slate-300">{row.avgAtmIv !== null ? `${row.avgAtmIv.toFixed(2)}%` : "--"}</td>
                              <td className={row.avgNearAtmSkew !== null && row.avgNearAtmSkew >= 0 ? "px-4 py-3 text-amber-300" : "px-4 py-3 text-sky-300"}>
                                {row.avgNearAtmSkew !== null ? formatSigned(row.avgNearAtmSkew, "%") : "--"}
                              </td>
                              <td className={row.avgTermSlope !== null && row.avgTermSlope >= 0 ? "px-4 py-3 text-amber-300" : "px-4 py-3 text-sky-300"}>
                                {row.avgTermSlope !== null ? formatSigned(row.avgTermSlope, "%") : "--"}
                              </td>
                              <td className="px-4 py-3 text-slate-300">{row.avgOptionsAdjustment !== null ? formatSigned(row.avgOptionsAdjustment) : "--"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="mt-6 grid gap-6 xl:grid-cols-3">
                    <SurfaceSpotlightCard
                      title="Strongest Put Fear"
                      rows={volSurface?.topPositiveSkew || []}
                      tone="amber"
                    />
                    <SurfaceSpotlightCard
                      title="Strongest Call Chasing"
                      rows={volSurface?.topNegativeSkew || []}
                      tone="sky"
                    />
                    <SurfaceSpotlightCard
                      title="Largest Term Slope"
                      rows={volSurface?.topTermSlope || []}
                      tone="violet"
                    />
                  </div>

                  {(volSurface?.notes || []).length > 0 ? (
                    <ul className="mt-4 space-y-2 text-sm text-slate-400">
                      {(volSurface?.notes || []).map((note) => (
                        <li key={note}>• {note}</li>
                      ))}
                    </ul>
                  ) : null}
                </>
              )}
            </section>

            <section className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-6">
              <h2 className="text-lg font-bold">Options Surface Outcome Research</h2>
              <p className="mt-2 text-sm text-slate-400">
                This joins captured options-surface snapshots to later research labels, so we can start measuring whether
                skew and gamma regimes actually improve outcomes instead of just looking interesting live.
              </p>
              <div className="mt-6 grid gap-6 xl:grid-cols-2">
                <div className="overflow-x-auto rounded-2xl border border-white/10">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-slate-900/70 text-slate-400">
                      <tr>
                        <th className="px-4 py-3 font-medium">Skew Regime</th>
                        <th className="px-4 py-3 font-medium">Screen</th>
                        <th className="px-4 py-3 font-medium">N</th>
                        <th className="px-4 py-3 font-medium">WR</th>
                        <th className="px-4 py-3 font-medium">Net EV</th>
                        <th className="px-4 py-3 font-medium">ATM IV</th>
                      </tr>
                    </thead>
                    <tbody>
                      {volSurfaceResearch.skew.map((row) => (
                        <tr key={`${row.family}-${row.screen}-${row.regime}`} className="border-t border-white/10">
                          <td className="px-4 py-3 font-medium capitalize text-white">{row.regime.replace("_", " ")}</td>
                          <td className="px-4 py-3 text-slate-300">{SCREEN_LABELS[row.screen]}</td>
                          <td className="px-4 py-3 text-slate-300">{row.sampleSize}</td>
                          <td className="px-4 py-3 text-slate-300">{row.winRate.toFixed(1)}%</td>
                          <td className={row.netExpectancyPct >= 0 ? "px-4 py-3 font-semibold text-emerald-300" : "px-4 py-3 font-semibold text-rose-300"}>
                            {row.netExpectancyPct.toFixed(2)}%
                          </td>
                          <td className="px-4 py-3 text-slate-300">{row.avgAtmIv !== null ? `${row.avgAtmIv.toFixed(2)}%` : "--"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="overflow-x-auto rounded-2xl border border-white/10">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-slate-900/70 text-slate-400">
                      <tr>
                        <th className="px-4 py-3 font-medium">Gamma Regime</th>
                        <th className="px-4 py-3 font-medium">Screen</th>
                        <th className="px-4 py-3 font-medium">N</th>
                        <th className="px-4 py-3 font-medium">WR</th>
                        <th className="px-4 py-3 font-medium">Net EV</th>
                        <th className="px-4 py-3 font-medium">Term</th>
                      </tr>
                    </thead>
                    <tbody>
                      {volSurfaceResearch.gamma.map((row) => (
                        <tr key={`${row.family}-${row.screen}-${row.regime}`} className="border-t border-white/10">
                          <td className="px-4 py-3 font-medium capitalize text-white">{row.regime.replace("_", " ")}</td>
                          <td className="px-4 py-3 text-slate-300">{SCREEN_LABELS[row.screen]}</td>
                          <td className="px-4 py-3 text-slate-300">{row.sampleSize}</td>
                          <td className="px-4 py-3 text-slate-300">{row.winRate.toFixed(1)}%</td>
                          <td className={row.netExpectancyPct >= 0 ? "px-4 py-3 font-semibold text-emerald-300" : "px-4 py-3 font-semibold text-rose-300"}>
                            {row.netExpectancyPct.toFixed(2)}%
                          </td>
                          <td className="px-4 py-3 text-slate-300">{row.avgTermSlope !== null ? formatSigned(row.avgTermSlope, "%") : "--"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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

function SweepSection({
  title,
  description,
  run,
  recentResults,
  actionState,
  autoRunning,
  onRun,
  onToggleAuto,
  onRestart,
  error,
  emptyMessage,
}: {
  title: string;
  description: string;
  run: ResearchBacktestRun | null;
  recentResults: ResearchBacktestSymbolResult[];
  actionState: ActionState;
  autoRunning: boolean;
  onRun: () => void;
  onToggleAuto: () => void;
  onRestart: () => void;
  error?: string;
  emptyMessage: string;
}) {
  return (
    <section className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="max-w-3xl">
          <h2 className="text-lg font-bold">{title}</h2>
          <p className="mt-2 text-sm text-slate-400">{description}</p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onRun}
            disabled={actionState === "loading"}
            className="inline-flex items-center gap-2 rounded-2xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm font-semibold text-sky-200 transition hover:bg-sky-500/20 disabled:opacity-60"
          >
            {actionState === "loading" ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Process Next Symbol
          </button>
          <button
            type="button"
            onClick={onToggleAuto}
            disabled={actionState === "loading" && !autoRunning}
            className="inline-flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/20 disabled:opacity-60"
          >
            {autoRunning ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {autoRunning ? "Stop Auto Sweep" : "Run Continuously"}
          </button>
          <button
            type="button"
            onClick={onRestart}
            disabled={actionState === "loading"}
            className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10 disabled:opacity-60"
          >
            <RotateCcw className="h-4 w-4" />
            Restart Sweep
          </button>
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-100">
          {error}
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 md:grid-cols-5">
        <SummaryCard label="Status" value={run?.status || "--"} />
        <SummaryCard
          label="Coverage"
          value={run ? `${run.completedSymbols + run.failedSymbols}/${run.totalSymbols}` : "--"}
        />
        <SummaryCard label="Failed" value={String(run?.failedSymbols || 0)} />
        <SummaryCard label="Next Symbol" value={run?.nextSymbol || "--"} />
        <SummaryCard label="Lookback" value={run ? `${run.lookbackDays}d` : "--"} />
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-white/10">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-900/70 text-slate-400">
            <tr>
              <th className="px-4 py-3 font-medium">Symbol</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Labels</th>
              <th className="px-4 py-3 font-medium">Coverage</th>
              <th className="px-4 py-3 font-medium">Best Screen</th>
              <th className="px-4 py-3 font-medium">Processed</th>
            </tr>
          </thead>
          <tbody>
            {recentResults.map((row) => {
              const bestScreen = [...row.screens]
                .sort((a, b) => b.netExpectancyPct - a.netExpectancyPct)
                .find((screen) => screen.sampleSize > 0) || null;

              return (
                <tr key={`${row.interval}-${row.symbol}`} className="border-t border-white/10">
                  <td className="px-4 py-3 font-medium text-white">{row.symbol}</td>
                  <td className={row.status === "COMPLETED" ? "px-4 py-3 font-semibold text-emerald-300" : "px-4 py-3 font-semibold text-rose-300"}>
                    {row.status}
                  </td>
                  <td className="px-4 py-3 text-slate-300">{row.labelCount}</td>
                  <td className="px-4 py-3 text-slate-300">
                    {row.datasetFrom && row.datasetTo ? `${row.datasetFrom} to ${row.datasetTo}` : "--"}
                  </td>
                  <td className="px-4 py-3 text-slate-300">
                    {bestScreen ? `${SCREEN_LABELS[bestScreen.screen]} (${bestScreen.netExpectancyPct.toFixed(2)}%)` : row.error || "--"}
                  </td>
                  <td className="px-4 py-3 text-slate-300">{new Date(row.processedAt).toLocaleString()}</td>
                </tr>
              );
            })}
            {recentResults.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  {emptyMessage}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
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

function SurfaceSpotlightCard({
  title,
  rows,
  tone,
}: {
  title: string;
  rows: Array<{
    symbol: string;
    sector: string;
    nearAtmVolSkew: number | null;
    atmIv: number | null;
    termStructureSlope: number | null;
    optionsAdjustmentHint: number;
  }>;
  tone: "amber" | "sky" | "violet";
}) {
  const toneClass =
    tone === "amber"
      ? "border-amber-500/20 bg-amber-500/5"
      : tone === "sky"
        ? "border-sky-500/20 bg-sky-500/5"
        : "border-violet-500/20 bg-violet-500/5";

  return (
    <div className={`rounded-2xl border p-4 ${toneClass}`}>
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <div className="mt-4 space-y-3">
        {rows.map((row) => (
          <div key={`${title}-${row.symbol}`} className="rounded-xl border border-white/10 bg-slate-950/40 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">{row.symbol}</p>
                <p className="text-xs text-slate-400">{row.sector}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-white">
                  {row.nearAtmVolSkew !== null ? formatSigned(row.nearAtmVolSkew, "%") : "--"}
                </p>
                <p className="text-xs text-slate-400">
                  Term {row.termStructureSlope !== null ? formatSigned(row.termStructureSlope, "%") : "--"}
                </p>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-400">
              <span>ATM IV {row.atmIv !== null ? `${row.atmIv.toFixed(2)}%` : "--"}</span>
              <span>Adj {formatSigned(row.optionsAdjustmentHint)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
