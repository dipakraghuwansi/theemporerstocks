"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  CandlestickChart,
  Database,
  Gauge,
  Microscope,
  RefreshCw,
  SearchCheck,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { StockUniverseCategory } from '@/lib/stockUniverse';
import { StockLabAnalysis, StockLabProgressUpdate, StockLabStreamEvent } from '@/lib/stockLab/types';

type UniversePayload = {
  success?: boolean;
  error?: string;
  items?: Array<{
    symbol: string;
    instrument: string;
    sector: string;
    category: StockUniverseCategory;
  }>;
};

type StockLabPayload = {
  success?: boolean;
  error?: string;
  needsLogin?: boolean;
  notes?: string[];
  data?: StockLabAnalysis;
};

const SCREEN_META = [
  { screen: 'intraday-momentum', key: 'intradayMomentum', label: 'Intraday Momentum', color: '#22c55e' },
  { screen: 'swing-setups', key: 'swingSetups', label: 'Swing Setups', color: '#38bdf8' },
  { screen: 'mean-reversion', key: 'meanReversion', label: 'Mean Reversion', color: '#f59e0b' },
  { screen: 'breakout-watchlist', key: 'breakoutWatchlist', label: 'Breakout Watchlist', color: '#f472b6' },
] as const;

function formatDateLabel(value: string) {
  try {
    return new Intl.DateTimeFormat('en-IN', { month: 'short', day: 'numeric' }).format(new Date(value));
  } catch {
    return value;
  }
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

function sourceTone(source: string) {
  if (source === 'built') return 'text-emerald-200';
  if (source === 'cache') return 'text-sky-200';
  return 'text-amber-200';
}

function formatStateLabel(value: string | null) {
  if (!value) return null;
  return value.replace(/_/g, ' ');
}

function confidenceTagTone(label: string) {
  if (label === 'High') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
  if (label === 'Medium') return 'border-sky-500/30 bg-sky-500/10 text-sky-300';
  if (label === 'Watchlist') return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
  return 'border-rose-500/30 bg-rose-500/10 text-rose-300';
}

function supportTagTone(label: string, supported: boolean) {
  if (supported) return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
  if (label === 'Developing Evidence') return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
  return 'border-white/10 bg-white/5 text-slate-300';
}

function sectorTagTone(state: string) {
  if (state === 'upgrade') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
  if (state === 'degrade') return 'border-rose-500/30 bg-rose-500/10 text-rose-300';
  return 'border-white/10 bg-white/5 text-slate-300';
}

function microstructureTagTone(bias: string) {
  if (bias === 'Supportive') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
  if (bias === 'Opposing') return 'border-rose-500/30 bg-rose-500/10 text-rose-300';
  if (bias === 'Mixed') return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
  return 'border-white/10 bg-white/5 text-slate-300';
}

function scoreTone(score: number) {
  if (score >= 75) return 'text-emerald-300';
  if (score >= 60) return 'text-sky-300';
  if (score >= 45) return 'text-amber-300';
  return 'text-slate-300';
}

export default function StockLabPage() {
  const [symbol, setSymbol] = useState('');
  const [universe, setUniverse] = useState<UniversePayload['items']>([]);
  const [payload, setPayload] = useState<StockLabPayload | null>(null);
  const [progressLog, setProgressLog] = useState<StockLabProgressUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const loadUniverse = useCallback(async () => {
    try {
      const response = await fetch('/api/stocks/universe', { cache: 'no-store' });
      const data = (await response.json()) as UniversePayload;
      setUniverse(data.items || []);
    } catch (error) {
      console.error('Failed to load stock universe for stock lab', error);
      setUniverse([]);
    }
  }, []);

  const runAnalysis = useCallback(async (nextSymbol: string) => {
    const normalized = nextSymbol.trim().toUpperCase();
    if (!normalized) {
      setPayload({ error: 'Select or type a valid NSE stock symbol.' });
      setProgressLog([]);
      setLoading(false);
      return;
    }

    setRunning(true);
    setLoading(false);
    setPayload(null);
    setProgressLog([]);

    try {
      const response = await fetch('/api/stocks/symbol-lab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: normalized }),
      });

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('The stock lab response did not include a readable analysis stream.');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      const handleEvent = (event: StockLabStreamEvent) => {
        if (event.type === 'progress') {
          setProgressLog((current) => [...current, event.progress]);
          return;
        }

        if (event.type === 'result') {
          setPayload({
            success: event.success,
            notes: event.notes,
            data: event.data,
          });
          return;
        }

        setPayload({
          error: event.error,
          needsLogin: event.needsLogin,
        });
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        let boundary = buffer.indexOf('\n');
        while (boundary >= 0) {
          const line = buffer.slice(0, boundary).trim();
          buffer = buffer.slice(boundary + 1);

          if (line) {
            handleEvent(JSON.parse(line) as StockLabStreamEvent);
          }

          boundary = buffer.indexOf('\n');
        }
      }

      const tail = buffer.trim();
      if (tail) {
        handleEvent(JSON.parse(tail) as StockLabStreamEvent);
      }
    } catch (error) {
      console.error('Failed to run stock lab analysis', error);
      setPayload({
        error: 'Network error while running stock lab analysis.',
      });
    } finally {
      setRunning(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const bootstrap = async () => {
      setLoading(true);
      await loadUniverse();
      setLoading(false);
    };

    void bootstrap();
  }, [loadUniverse]);

  const analysis = payload?.data || null;
  const activeProgress = progressLog[progressLog.length - 1] || null;
  const currentSnapshot = analysis?.currentSnapshot || null;
  const currentBestScreen = currentSnapshot?.bestScreen || null;

  const curveChartData = useMemo(() => {
    if (!analysis) return [];
    const maxTrades = Math.max(0, ...analysis.modelSummaries.map((row) => row.sampleSize));
    return Array.from({ length: maxTrades }, (_, index) => {
      const tradeNumber = index + 1;
      const row: Record<string, string | number | null> = {
        tradeNumber,
        label: `#${tradeNumber}`,
      };

      for (const meta of SCREEN_META) {
        const point = analysis.modelCurves.find(
          (curve) => curve.screen === meta.screen && curve.tradeNumber === tradeNumber
        );
        row[meta.key] = point?.nav ?? null;
      }

      return row;
    });
  }, [analysis]);

  const screenSummaryChartData = useMemo(
    () =>
      (analysis?.modelSummaries || []).map((row) => ({
        screenLabel: row.screenLabel,
        netExpectancyPct: row.netExpectancyPct,
        winRate: row.winRate,
        sampleSize: row.sampleSize,
        totalReturnPct: row.totalReturnPct,
        maxDrawdownPct: row.maxDrawdownPct,
      })),
    [analysis?.modelSummaries]
  );

  const regimeChartData = useMemo(() => {
    if (!analysis) return [];
    return analysis.modelSummaries.map((summary) => {
      const row: Record<string, string | number> = {
        screenLabel: summary.screenLabel,
        bullish: 0,
        neutral: 0,
        bearish: 0,
      };

      for (const point of analysis.regimeSeries.filter((entry) => entry.screen === summary.screen)) {
        row[point.regime] = point.netExpectancyPct;
      }

      return row;
    });
  }, [analysis]);

  const walkForwardChartData = useMemo(() => {
    if (!analysis) return [];
    const buckets = Array.from(
      new Set(analysis.walkForwardSeries.map((row) => row.bucket))
    ).sort((a, b) => a.localeCompare(b));

    return buckets.map((bucket) => {
      const row: Record<string, string | number | null> = { bucket };
      for (const meta of SCREEN_META) {
        const point = analysis.walkForwardSeries.find(
          (entry) => entry.bucket === bucket && entry.screen === meta.screen
        );
        row[meta.key] = point?.netExpectancyPct ?? null;
      }
      return row;
    });
  }, [analysis]);

  const distributionChartData = useMemo(() => {
    if (!analysis) return [];
    const buckets = Array.from(
      new Set(analysis.returnBucketSeries.map((row) => row.bucket))
    );

    return buckets.map((bucket) => {
      const row: Record<string, string | number> = { bucket };
      for (const meta of SCREEN_META) {
        row[meta.key] =
          analysis.returnBucketSeries.find(
            (entry) => entry.bucket === bucket && entry.screen === meta.screen
          )?.count || 0;
      }
      return row;
    });
  }, [analysis]);

  const priceChartData = useMemo(
    () =>
      (analysis?.priceSeries || []).map((point) => ({
        ...point,
        label: formatDateLabel(point.date),
      })),
    [analysis?.priceSeries]
  );

  const minuteCoverageChartData = useMemo(
    () =>
      (analysis?.minuteCoverageSeries || []).map((point) => ({
        ...point,
        label: formatDateLabel(point.date),
      })),
    [analysis?.minuteCoverageSeries]
  );

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await runAnalysis(symbol);
  };

  const formatProgressTime = (value: string) => {
    try {
      return new Date(value).toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return value;
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-16 text-slate-100">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.18),_transparent_40%),linear-gradient(135deg,_rgba(15,23,42,0.98),_rgba(2,6,23,0.94))] p-8 shadow-2xl shadow-slate-950/40">
          <div className="flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <p className="inline-flex items-center gap-2 rounded-full border border-sky-400/30 bg-sky-400/10 px-4 py-1 text-sm font-semibold text-sky-200">
                <Microscope className="h-4 w-4" />
                Symbol Research Lab
              </p>
              <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">
                One stock, every model, full historical read
              </h1>
              <p className="mt-4 max-w-2xl text-base text-slate-300 sm:text-lg">
                Select a stock, reuse cached universe data when it already exists, or build day and minute history on demand when it does not. Then we backtest each model on that symbol and turn the output into a full analytics pack.
              </p>
            </div>

            <form onSubmit={onSubmit} className="w-full max-w-xl rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-4">
              <label className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                NSE Symbol
              </label>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                <input
                  list="stock-lab-universe"
                  value={symbol}
                  onChange={(event) => setSymbol(event.target.value.toUpperCase())}
                  className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base font-semibold text-white outline-none transition focus:border-sky-400/60 focus:bg-white/10"
                  placeholder="Type RELIANCE or any NSE symbol"
                />
                <button
                  type="submit"
                  disabled={running}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-sky-400/30 bg-sky-400/10 px-5 py-3 text-sm font-semibold text-sky-100 transition hover:bg-sky-400/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {running ? <RefreshCw className="h-4 w-4 animate-spin" /> : <SearchCheck className="h-4 w-4" />}
                  {running ? 'Analyzing Symbol' : 'Analyze Symbol'}
                </button>
              </div>
              <datalist id="stock-lab-universe">
                {(universe || []).map((item) => (
                  <option key={item.symbol} value={item.symbol}>
                    {item.sector}
                  </option>
                ))}
              </datalist>
              <p className="mt-3 text-sm text-slate-400">
                Universe suggestions: {(universe || []).length} cached names. Manual symbols are allowed too.
              </p>
            </form>
          </div>
        </section>

        {progressLog.length > 0 ? (
          <section className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div className="max-w-3xl">
                <p className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200">
                  <Activity className="h-4 w-4" />
                  {running ? 'Live Analysis Trace' : payload?.error ? 'Analysis Trace Before Failure' : 'Latest Analysis Trace'}
                </p>
                <h2 className="mt-4 text-2xl font-bold text-white">
                  {activeProgress?.title || 'Preparing analysis'}
                </h2>
                <p className="mt-3 text-sm text-slate-300">
                  {activeProgress?.detail || 'The stock lab will show each stage here as it runs.'}
                </p>
              </div>

              <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/40 px-5 py-4 text-sm text-slate-300">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Current state</p>
                <p className="mt-3 flex items-center gap-2 text-base font-semibold text-white">
                  {running ? <RefreshCw className="h-4 w-4 animate-spin text-sky-300" /> : <SearchCheck className="h-4 w-4 text-emerald-300" />}
                  {running ? 'Analysis in progress' : payload?.error ? 'Analysis stopped' : 'Analysis complete'}
                </p>
                <p className="mt-2 text-xs text-slate-400">
                  {progressLog.length} logged step{progressLog.length === 1 ? '' : 's'}
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-3">
              {progressLog.map((step, index) => {
                const isLatest = index === progressLog.length - 1;

                return (
                  <div
                    key={`${step.key}-${step.timestamp}-${index}`}
                    className={`rounded-2xl border px-4 py-4 ${
                      isLatest
                        ? 'border-sky-400/30 bg-sky-400/10'
                        : 'border-white/10 bg-slate-950/40'
                    }`}
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`rounded-full p-2 ${isLatest ? 'bg-sky-400/20 text-sky-100' : 'bg-white/5 text-slate-300'}`}>
                          {isLatest && running ? <RefreshCw className="h-4 w-4 animate-spin" /> : <SearchCheck className="h-4 w-4" />}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-white">{step.title}</p>
                          <p className="text-xs text-slate-400">
                            Step {index + 1} · {formatProgressTime(step.timestamp)}
                          </p>
                        </div>
                      </div>
                      <span className={`text-xs font-semibold uppercase tracking-[0.2em] ${isLatest && running ? 'text-sky-200' : 'text-emerald-200'}`}>
                        {isLatest && running ? 'Running' : 'Logged'}
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-slate-300">{step.detail}</p>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {payload?.error ? (
          <section className="rounded-[1.75rem] border border-rose-400/30 bg-rose-500/10 p-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-rose-200" />
              <div>
                <h2 className="text-xl font-bold text-rose-50">Analysis failed</h2>
                <p className="mt-2 text-sm text-rose-100/80">{payload.error}</p>
                {payload.needsLogin ? (
                  <p className="mt-2 text-sm text-rose-100/80">
                    The selected symbol needs fresh Kite access before missing history can be built.
                  </p>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}

        {loading ? (
          <section className="rounded-[1.75rem] border border-white/10 bg-white/5 p-10">
            <div className="flex items-center gap-3 text-slate-300">
              <RefreshCw className="h-5 w-5 animate-spin" />
              Loading stock lab…
            </div>
          </section>
        ) : null}

        {!loading && !analysis && !payload?.error ? (
          <section className="rounded-[1.75rem] border border-dashed border-white/10 bg-white/5 p-10">
            <div className="max-w-2xl">
              <h2 className="text-2xl font-bold text-white">Ready when you are.</h2>
              <p className="mt-3 text-sm text-slate-400">
                Pick a stock from the universe suggestions or type any NSE symbol, then click `Analyze Symbol` to build the historical research pack and charts.
              </p>
            </div>
          </section>
        ) : null}

        {analysis ? (
          <>
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <StatCard
                icon={<CandlestickChart className="h-5 w-5" />}
                label="Underlying Return"
                value={formatPct(analysis.overview.priceReturnPct)}
                valueClassName={statTone(analysis.overview.priceReturnPct)}
                detail={`${analysis.overview.sector} · ${analysis.overview.inUniverse ? 'In universe' : 'Ad-hoc symbol'}`}
              />
              <StatCard
                icon={<Activity className="h-5 w-5" />}
                label="Total Labels"
                value={String(analysis.overview.totalLabels)}
                detail={`${analysis.dataStatus.dayCandleCount} day candles`}
              />
              <StatCard
                icon={<BarChart3 className="h-5 w-5" />}
                label="Best Model"
                value={analysis.overview.bestModel?.screenLabel || 'No model yet'}
                detail={
                  analysis.overview.bestModel
                    ? `${formatPct(analysis.overview.bestModel.netExpectancyPct)} EV · ${analysis.overview.bestModel.sampleSize} trades`
                    : 'No triggered trades'
                }
              />
              <StatCard
                icon={<Database className="h-5 w-5" />}
                label="Day Source"
                value={analysis.dataStatus.daySource.toUpperCase()}
                valueClassName={sourceTone(analysis.dataStatus.daySource)}
                detail={analysis.dataStatus.dayFrom && analysis.dataStatus.dayTo ? `${analysis.dataStatus.dayFrom} → ${analysis.dataStatus.dayTo}` : '--'}
              />
              <StatCard
                icon={<TrendingUp className="h-5 w-5" />}
                label="Minute Source"
                value={analysis.dataStatus.minuteSource.toUpperCase()}
                valueClassName={sourceTone(analysis.dataStatus.minuteSource)}
                detail={analysis.dataStatus.minuteCandleCount > 0 ? `${analysis.dataStatus.minuteCandleCount} minute candles` : 'No minute history'}
              />
            </section>

            <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
              <ChartCard
                title="Current Screener Read"
                description="This mirrors the live screener lens so the stock lab can show today’s setup context alongside the historical backtest."
              >
                {currentSnapshot?.available && currentBestScreen ? (
                  <div className="space-y-5">
                    <div className="flex flex-col gap-4 rounded-[1.5rem] border border-white/10 bg-slate-950/40 p-5">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Best current setup</p>
                          <h3 className="mt-2 text-2xl font-black text-white">{currentBestScreen.screenLabel}</h3>
                          <p className="mt-3 text-sm leading-6 text-slate-300">{currentBestScreen.thesis}</p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-right">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Current score</p>
                          <p className={`mt-2 text-3xl font-black ${scoreTone(currentBestScreen.score)}`}>
                            {currentBestScreen.score.toFixed(1)}
                          </p>
                          <p className="mt-1 text-xs text-slate-400">
                            {currentBestScreen.matched ? 'Active screen match' : 'Closest current screen'}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-3 text-xs">
                        <SignalTag className={confidenceTagTone(currentBestScreen.confidenceLabel)}>
                          Buy Confidence {currentBestScreen.confidenceLabel} ({currentBestScreen.confidenceScore.toFixed(1)})
                        </SignalTag>
                        <SignalTag className={supportTagTone(currentBestScreen.supportLabel, currentBestScreen.historicallySupported)}>
                          {currentBestScreen.supportLabel}
                        </SignalTag>
                        <SignalTag className={currentBestScreen.aboveVwap ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-rose-500/30 bg-rose-500/10 text-rose-300'}>
                          {currentBestScreen.aboveVwap ? (
                            <>
                              <TrendingUp className="h-4 w-4" />
                              Above VWAP
                            </>
                          ) : (
                            <>
                              <TrendingDown className="h-4 w-4" />
                              Below VWAP
                            </>
                          )}
                        </SignalTag>
                        <SignalTag className={sectorTagTone(currentBestScreen.sectorState)}>
                          <ArrowUpRight className="h-4 w-4" />
                          Sector {currentBestScreen.sectorState}
                        </SignalTag>
                        <SignalTag className={microstructureTagTone(currentBestScreen.microstructureBias)}>
                          Microstructure {currentBestScreen.microstructureBias}
                        </SignalTag>
                        {currentSnapshot.regimeLabel ? (
                          <SignalTag className="border-sky-500/30 bg-sky-500/10 text-sky-200">
                            Market {currentSnapshot.regimeLabel} {currentSnapshot.regimeConfidencePct ? `${currentSnapshot.regimeConfidencePct}%` : ''}
                          </SignalTag>
                        ) : null}
                        {currentBestScreen.gammaRegime ? (
                          <SignalTag className={currentBestScreen.gammaRegime === 'stabilizing' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : currentBestScreen.gammaRegime === 'expansive' ? 'border-rose-500/30 bg-rose-500/10 text-rose-300' : 'border-white/10 bg-white/5 text-slate-300'}>
                            <Gauge className="h-4 w-4" />
                            Gamma {formatStateLabel(currentBestScreen.gammaRegime)}
                          </SignalTag>
                        ) : null}
                        {currentBestScreen.dominantOiFlow ? (
                          <SignalTag className="border-white/10 bg-white/5 text-slate-300">
                            OI {formatStateLabel(currentBestScreen.dominantOiFlow)}
                          </SignalTag>
                        ) : null}
                        {currentBestScreen.futuresBuildup ? (
                          <SignalTag className="border-white/10 bg-white/5 text-slate-300">
                            Fut {formatStateLabel(currentBestScreen.futuresBuildup)}
                          </SignalTag>
                        ) : null}
                      </div>

                      <div className="grid gap-3 md:grid-cols-3">
                        <MiniMetricCard label="Entry" value={currentBestScreen.entryPrice.toFixed(2)} accent="text-sky-200" />
                        <MiniMetricCard label="Stop" value={currentBestScreen.stopLoss.toFixed(2)} accent="text-rose-300" />
                        <MiniMetricCard label="Target" value={currentBestScreen.targetPrice.toFixed(2)} accent="text-emerald-300" />
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                        <MiniMetricCard label="Risk %" value={`${currentBestScreen.riskPct.toFixed(2)}%`} accent="text-rose-300" />
                        <MiniMetricCard label="Reward %" value={`${currentBestScreen.rewardPct.toFixed(2)}%`} accent="text-emerald-300" />
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 text-sm text-slate-300">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Top live drivers</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {currentBestScreen.topDrivers.map((driver) => (
                            <SignalTag key={driver} className="border-white/10 bg-white/5 text-slate-300">
                              {driver}
                            </SignalTag>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/40 p-6 text-sm text-slate-400">
                    {currentSnapshot?.reason || 'Current screener-style setup tags are unavailable for this symbol right now.'}
                  </div>
                )}
              </ChartCard>

              <ChartCard
                title="Screen Snapshot"
                description="Every screen scored on the current tape, so you can compare what the stock looks like today versus what worked historically."
              >
                {currentSnapshot?.allScreens?.length ? (
                  <div className="space-y-3">
                    {currentSnapshot.allScreens.map((screen) => (
                      <div key={screen.screen} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-white">{screen.screenLabel}</p>
                            <p className="mt-1 text-xs text-slate-400">
                              {screen.matched ? 'Active match right now' : 'Not actively matched right now'}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className={`text-lg font-black ${scoreTone(screen.score)}`}>{screen.score.toFixed(1)}</p>
                            <p className="text-xs text-slate-400">{screen.confidenceLabel}</p>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                          <SignalTag className={screen.matched ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-white/10 bg-white/5 text-slate-300'}>
                            {screen.matched ? 'Matched' : 'Watch only'}
                          </SignalTag>
                          <SignalTag className={confidenceTagTone(screen.confidenceLabel)}>
                            {screen.confidenceLabel}
                          </SignalTag>
                          <SignalTag className={supportTagTone(screen.supportLabel, screen.historicallySupported)}>
                            {screen.supportLabel}
                          </SignalTag>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/40 p-6 text-sm text-slate-400">
                    No current screener snapshot is available yet.
                  </div>
                )}
              </ChartCard>
            </section>

            <section className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
              <ChartCard
                title="Daily Price Structure"
                description="Close, SMA20, and SMA50 so we can see where the symbol has spent its time while the backtests were being measured."
              >
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={priceChartData}>
                      <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
                      <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 12 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} tickLine={false} axisLine={false} width={80} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend />
                      <Line type="monotone" dataKey="close" stroke="#f8fafc" strokeWidth={2.4} dot={false} name="Close" />
                      <Line type="monotone" dataKey="sma20" stroke="#38bdf8" strokeWidth={1.8} dot={false} name="SMA20" />
                      <Line type="monotone" dataKey="sma50" stroke="#f59e0b" strokeWidth={1.8} dot={false} name="SMA50" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>

              <ChartCard
                title="Data Status"
                description="This shows whether the lab reused cache, built data on demand, or had to fall back because a dataset was unavailable."
              >
                <div className="space-y-4 text-sm text-slate-300">
                  <MetricRow label="Instrument" value={analysis.overview.instrument} />
                  <MetricRow label="Category" value={analysis.overview.category} />
                  <MetricRow label="Benchmark source" value={analysis.dataStatus.benchmarkSource.toUpperCase()} valueClassName={sourceTone(analysis.dataStatus.benchmarkSource)} />
                  <MetricRow label="Day range" value={analysis.dataStatus.dayFrom && analysis.dataStatus.dayTo ? `${analysis.dataStatus.dayFrom} → ${analysis.dataStatus.dayTo}` : '--'} />
                  <MetricRow label="Minute range" value={analysis.dataStatus.minuteFrom && analysis.dataStatus.minuteTo ? `${analysis.dataStatus.minuteFrom} → ${analysis.dataStatus.minuteTo}` : '--'} />
                  <MetricRow label="Benchmark candles" value={String(analysis.dataStatus.benchmarkCandleCount)} />
                  <MetricRow label="Last analysis" value={new Date(analysis.overview.analyzedAt).toLocaleString()} />
                </div>
              </ChartCard>
            </section>

            <section className="grid gap-6 xl:grid-cols-[1.3fr_0.9fr]">
              <ChartCard
                title="Model Equity Curves"
                description="Each line compounds the net return of that model’s triggered trades on this symbol. This is trade-sequence based, which makes the models directly comparable even when they trigger on different dates."
              >
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={curveChartData}>
                      <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
                      <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 12 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} tickLine={false} axisLine={false} width={80} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend />
                      {SCREEN_META.map((meta) => (
                        <Line
                          key={meta.screen}
                          type="monotone"
                          dataKey={meta.key}
                          stroke={meta.color}
                          strokeWidth={2.2}
                          dot={false}
                          name={meta.label}
                          connectNulls={false}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>

              <ChartCard
                title="Model Scoreboard"
                description="Quick ranking of the backtested models on this symbol."
              >
                <div className="space-y-4">
                  {(analysis.modelSummaries || []).map((row) => (
                    <div key={row.screen} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-white">{row.screenLabel}</p>
                          <p className="mt-1 text-xs text-slate-400">{row.sampleSize} trades · PF {row.profitFactor.toFixed(2)} · Stability {row.stabilityScore.toFixed(1)}</p>
                        </div>
                        <div className="text-right">
                          <p className={`text-sm font-semibold ${statTone(row.netExpectancyPct)}`}>{formatPct(row.netExpectancyPct)}</p>
                          <p className="text-xs text-slate-400">Win {row.winRate.toFixed(1)}%</p>
                        </div>
                      </div>
                      <div className="mt-3 grid gap-2 text-xs text-slate-400 sm:grid-cols-3">
                        <span>Total return {formatPct(row.totalReturnPct)}</span>
                        <span>Benchmark {formatPct(row.benchmarkReturnPct)}</span>
                        <span>Max DD {formatPct(-row.maxDrawdownPct)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </ChartCard>
            </section>

            <section className="grid gap-6 xl:grid-cols-2">
              <ChartCard
                title="Net Expectancy by Model"
                description="Average net return per trade after slippage and costs."
              >
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={screenSummaryChartData}>
                      <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
                      <XAxis dataKey="screenLabel" tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} tickLine={false} axisLine={false} width={80} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Bar dataKey="netExpectancyPct" fill="#38bdf8" radius={[8, 8, 0, 0]} name="Net EV %" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>

              <ChartCard
                title="Win Rate by Model"
                description="How often each model actually won on this symbol."
              >
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={screenSummaryChartData}>
                      <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
                      <XAxis dataKey="screenLabel" tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} tickLine={false} axisLine={false} width={80} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Bar dataKey="winRate" fill="#22c55e" radius={[8, 8, 0, 0]} name="Win Rate %" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>
            </section>

            <section className="grid gap-6 xl:grid-cols-2">
              <ChartCard
                title="Regime Breakdown"
                description="Net expectancy grouped by bullish, neutral, and bearish benchmark regimes."
              >
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={regimeChartData}>
                      <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
                      <XAxis dataKey="screenLabel" tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} tickLine={false} axisLine={false} width={80} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend />
                      <Bar dataKey="bullish" fill="#22c55e" radius={[6, 6, 0, 0]} name="Bullish" />
                      <Bar dataKey="neutral" fill="#38bdf8" radius={[6, 6, 0, 0]} name="Neutral" />
                      <Bar dataKey="bearish" fill="#f87171" radius={[6, 6, 0, 0]} name="Bearish" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>

              <ChartCard
                title="Walk-Forward Stability"
                description="Net expectancy over the walk-forward buckets to expose decay or consistency."
              >
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={walkForwardChartData}>
                      <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
                      <XAxis dataKey="bucket" tick={{ fill: '#94a3b8', fontSize: 12 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} tickLine={false} axisLine={false} width={80} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend />
                      {SCREEN_META.map((meta) => (
                        <Line
                          key={meta.screen}
                          type="monotone"
                          dataKey={meta.key}
                          stroke={meta.color}
                          strokeWidth={2.2}
                          dot={{ r: 3 }}
                          name={meta.label}
                          connectNulls={false}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>
            </section>

            <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
              <ChartCard
                title="Return Distribution"
                description="How each model’s trade outcomes are distributed across return buckets."
              >
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={distributionChartData}>
                      <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
                      <XAxis dataKey="bucket" tick={{ fill: '#94a3b8', fontSize: 12 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} tickLine={false} axisLine={false} width={64} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend />
                      {SCREEN_META.map((meta) => (
                        <Bar key={meta.screen} dataKey={meta.key} fill={meta.color} radius={[4, 4, 0, 0]} name={meta.label} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>

              <ChartCard
                title="Minute Coverage"
                description="A quick view of how much minute data was actually available for the intraday model."
              >
                {minuteCoverageChartData.length > 0 ? (
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={minuteCoverageChartData}>
                        <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
                        <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 12 }} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} tickLine={false} axisLine={false} width={64} />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Line type="monotone" dataKey="candles" stroke="#a78bfa" strokeWidth={2.4} dot={false} name="Minute candles" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/40 p-6 text-sm text-slate-400">
                    No minute coverage is available yet for this symbol, so the intraday chart is intentionally empty.
                  </div>
                )}
              </ChartCard>
            </section>

            <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
              <ChartCard
                title="Lab Notes"
                description="High-level interpretation of what the lab found."
              >
                <div className="space-y-3 text-sm text-slate-300">
                  {[...(payload?.notes || []), ...(analysis.notes || [])].map((note) => (
                    <p key={note}>{note}</p>
                  ))}
                </div>
              </ChartCard>

              <ChartCard
                title="Recent Trigger Samples"
                description="The latest historical trades found by the model engine for this symbol."
              >
                <div className="overflow-x-auto rounded-2xl border border-white/10">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-slate-900/70 text-slate-400">
                      <tr>
                        <th className="px-4 py-3 font-medium">Model</th>
                        <th className="px-4 py-3 font-medium">Entry</th>
                        <th className="px-4 py-3 font-medium">Regime</th>
                        <th className="px-4 py-3 font-medium">Net</th>
                        <th className="px-4 py-3 font-medium">Beat Bench</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.recentTrades.map((trade) => (
                        <tr key={`${trade.screen}-${trade.entryDate}-${trade.tradeDate}`} className="border-t border-white/10">
                          <td className="px-4 py-3 font-medium text-white">{trade.screenLabel}</td>
                          <td className="px-4 py-3 text-slate-300">{new Date(trade.entryDate).toLocaleDateString('en-IN')}</td>
                          <td className="px-4 py-3 capitalize text-slate-300">{trade.regime}</td>
                          <td className={`px-4 py-3 font-semibold ${trade.netReturnPct >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                            {formatPct(trade.netReturnPct)}
                          </td>
                          <td className={`px-4 py-3 font-semibold ${trade.netReturnPct - trade.benchmarkReturnPct >= 0 ? 'text-sky-300' : 'text-amber-200'}`}>
                            {formatPct(trade.netReturnPct - trade.benchmarkReturnPct)}
                          </td>
                        </tr>
                      ))}
                      {analysis.recentTrades.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                            No triggered trades were found for this symbol yet.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </ChartCard>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}

const tooltipStyle = {
  backgroundColor: 'rgba(2,6,23,0.95)',
  border: '1px solid rgba(148,163,184,0.2)',
  borderRadius: 16,
};

function StatCard({
  icon,
  label,
  value,
  detail,
  valueClassName = 'text-white',
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5">
      <div className="flex items-center gap-3 text-slate-300">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-2">{icon}</div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{label}</p>
      </div>
      <p className={`mt-4 text-2xl font-black ${valueClassName}`}>{value}</p>
      <p className="mt-2 text-sm text-slate-400">{detail}</p>
    </div>
  );
}

function ChartCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6">
      <h2 className="text-xl font-bold text-white">{title}</h2>
      <p className="mt-2 text-sm text-slate-400">{description}</p>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function MetricRow({
  label,
  value,
  valueClassName = 'text-slate-100',
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/5 pb-3 last:border-b-0 last:pb-0">
      <span className="text-slate-400">{label}</span>
      <span className={`font-semibold ${valueClassName}`}>{value}</span>
    </div>
  );
}

function SignalTag({
  children,
  className,
}: {
  children: ReactNode;
  className: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 ${className}`}>
      {children}
    </span>
  );
}

function MiniMetricCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className={`mt-3 text-xl font-black ${accent}`}>{value}</p>
    </div>
  );
}
