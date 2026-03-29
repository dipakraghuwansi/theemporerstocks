"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CircleHelp, Gauge, RefreshCw } from "lucide-react";

type UniverseItem = {
  symbol: string;
  instrument: string;
  sector: string;
  category: "nifty50" | "niftymidcap150" | "manual";
};

type OptionStructureSummary = {
  available: boolean;
  reason?: string;
  underlying: string;
  expiry: string | null;
  underlyingPrice: number;
  atmStrike: number | null;
  strikeCount: number;
  totalCallOi: number;
  totalPutOi: number;
  totalCallOiChange: number;
  totalPutOiChange: number;
  putCallRatio: number | null;
  netGammaExposure: number;
  grossGammaExposure: number;
  gammaSkew: number | null;
  gammaRegime: "stabilizing" | "expansive" | "neutral" | "unavailable";
  netVannaExposure: number;
  netCharmExposure: number;
  vannaRegime: "supportive" | "dragging" | "balanced" | "unavailable";
  charmRegime: "supportive" | "dragging" | "balanced" | "unavailable";
  averageCallIv: number | null;
  averagePutIv: number | null;
  atmIv: number | null;
  nearAtmVolSkew: number | null;
  wingCallIv: number | null;
  wingPutIv: number | null;
  volSkew: number | null;
  volSkewRegime: "put_fear" | "call_chasing" | "balanced" | "unavailable";
  termStructureSlope: number | null;
  gammaFlipLevel: number | null;
  callWall: number | null;
  putWall: number | null;
  nearestResistance: number | null;
  nearestSupport: number | null;
  nearestResistanceDistancePct: number | null;
  nearestSupportDistancePct: number | null;
  dominantOiFlow: "calls_building" | "puts_building" | "balanced" | "unavailable";
  futuresPrice: number | null;
  futuresOi: number | null;
  futuresOiChange: number | null;
  futuresPriceChangePct: number | null;
  futuresBuildup: "long_buildup" | "short_buildup" | "short_covering" | "long_unwinding" | "neutral" | "unavailable";
  topCallOis: Array<{ strike: number; oi: number }>;
  topPutOis: Array<{ strike: number; oi: number }>;
  strikeSummaries: Array<{
    strike: number;
    callOi: number;
    putOi: number;
    callOiChange: number;
    putOiChange: number;
    callIv: number | null;
    putIv: number | null;
    netGammaExposure: number;
  }>;
  optionsAdjustmentHint: number;
  interpretation: string;
};

type StructureResponse = {
  success?: boolean;
  needsLogin?: boolean;
  error?: string;
  symbol?: string;
  instrument?: string;
  spotPrice?: number;
  summary?: OptionStructureSummary;
};

const DEFAULT_SYMBOL = "HINDALCO";

const EXPLAINERS: Record<string, string> = {
  PCR: "Put-call ratio from open interest in the selected expiry window. Above 1.0 means puts outweigh calls by OI.",
  "Gamma Regime": "A proxy for whether options positioning may dampen movement or amplify it.",
  "Call Wall": "Highest call OI strike in the active chain slice. Often acts as a resistance zone.",
  "Put Wall": "Highest put OI strike in the active chain slice. Often acts as a support zone.",
  "Gamma Flip": "Approximate strike where the net gamma map changes sign.",
  "Call IV": "OI-weighted average implied volatility across the selected call strikes in the active expiry window.",
  "Put IV": "OI-weighted average implied volatility across the selected put strikes in the active expiry window.",
  "ATM IV": "Average implied volatility around the near-at-the-money strikes in the active expiry.",
  "Wing Put IV": "Average implied volatility across downside put wings in the active expiry slice.",
  "Wing Call IV": "Average implied volatility across upside call wings in the active expiry slice.",
  "Near ATM Skew": "Difference between downside wing put IV and upside wing call IV near the active trading zone.",
  "Vol Skew": "Put IV minus call IV. Positive means protection is being bid harder than upside calls.",
  "Term Slope": "Next expiry ATM IV minus front expiry ATM IV. Positive means forward volatility is richer than the front.",
  "Skew Regime": "Quick interpretation of whether the chain is showing protection demand, upside chasing, or balance.",
  Vanna: "Second-order Greek proxy for how delta shifts as implied volatility moves.",
  Charm: "Second-order Greek proxy for how delta decays with time passing toward expiry.",
  "Vanna Regime": "Simple interpretation of whether vanna exposure is likely supportive or dragging.",
  "Charm Regime": "Simple interpretation of whether charm flow is likely supportive or dragging.",
  "Options Adj": "How much this options structure currently nudges the screener score.",
  "Net Gamma": "Signed gamma proxy aggregated across the selected chain window.",
  "OI Flow": "Whether call OI or put OI is building faster versus the previous captured snapshot.",
  "Res Dist %": "Distance from spot to the nearest resistance strike with heavy call OI.",
  "Sup Dist %": "Distance from spot to the nearest support strike with heavy put OI.",
  "Fut Buildup": "Nearest stock future classification using price change and futures OI change.",
  "Fut OI Δ": "Change in open interest for the nearest stock future versus the previous snapshot.",
};

export default function OptionsStructurePage() {
  const searchParams = useSearchParams();
  const [universe, setUniverse] = useState<UniverseItem[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState(searchParams.get("symbol")?.toUpperCase() || DEFAULT_SYMBOL);
  const [isLoading, setIsLoading] = useState(true);
  const [payload, setPayload] = useState<StructureResponse | null>(null);

  useEffect(() => {
    const symbolFromQuery = searchParams.get("symbol")?.toUpperCase();
    if (symbolFromQuery) {
      setSelectedSymbol(symbolFromQuery);
    }
  }, [searchParams]);

  useEffect(() => {
    const loadUniverse = async () => {
      try {
        const res = await fetch("/api/stocks/universe", { cache: "no-store" });
        const data = await res.json();
        setUniverse(data.items || []);
      } catch (error) {
        console.error("Failed to load stock universe", error);
      }
    };

    loadUniverse();
  }, []);

  const loadStructure = async (symbol: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/stocks/options-structure/${encodeURIComponent(symbol)}`, { cache: "no-store" });
      const data: StructureResponse = await res.json();
      setPayload(data);
    } catch (error) {
      console.error("Failed to load option structure", error);
      setPayload({ error: "Network error while loading option structure." });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadStructure(selectedSymbol);
  }, [selectedSymbol]);

  const selectedUniverseItem = useMemo(
    () => universe.find((item) => item.symbol === selectedSymbol) || null,
    [selectedSymbol, universe]
  );

  const summary = payload?.summary || null;

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-16 text-slate-100">
      <div className="mx-auto max-w-7xl">
        <div className="max-w-4xl">
          <p className="inline-flex rounded-full border border-sky-500/30 bg-sky-500/10 px-4 py-1 text-sm font-semibold text-sky-300">
            Stock option structure
          </p>
          <h1 className="mt-4 text-4xl font-black tracking-tight">Option chain and dealer gamma workbench</h1>
          <p className="mt-5 text-base leading-7 text-slate-300">
            This page shows the stock option-chain context we are using as a conviction overlay: PCR, call/put walls,
            gamma regime, gamma flip, and the strike-wise net gamma proxy for the selected expiry.
          </p>
        </div>

        <section className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex min-w-[220px] flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Symbol</span>
              <select
                value={selectedSymbol}
                onChange={(event) => setSelectedSymbol(event.target.value)}
                className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none"
              >
                {universe.map((item) => (
                  <option key={item.symbol} value={item.symbol}>
                    {item.symbol} · {item.sector}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={() => loadStructure(selectedSymbol)}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
              Refresh structure
            </button>

            {selectedUniverseItem ? (
              <div className="rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-sm text-slate-300">
                {selectedUniverseItem.instrument} · {selectedUniverseItem.sector}
              </div>
            ) : null}
          </div>
        </section>

        {payload?.needsLogin ? (
          <div className="mt-6 rounded-3xl border border-rose-500/20 bg-rose-500/10 p-6 text-rose-100">
            Kite authentication is required. Open <Link href="/auth-test" className="underline text-emerald-300">/auth-test</Link> and log in first.
          </div>
        ) : null}

        {payload?.error && !payload?.needsLogin ? (
          <div className="mt-6 rounded-3xl border border-rose-500/20 bg-rose-500/10 p-6 text-rose-100">{payload.error}</div>
        ) : null}

        {summary ? (
          <div className="mt-6 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <div className="flex items-center gap-3">
                <Gauge className="h-5 w-5 text-sky-300" />
                <h2 className="text-xl font-bold">Structure Summary</h2>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <SummaryTile label="Spot" value={summary.underlyingPrice.toFixed(2)} />
                <SummaryTile label="Expiry" value={summary.expiry || "n/a"} />
                <SummaryTile label="ATM Strike" value={summary.atmStrike?.toFixed(2) || "n/a"} />
                <SummaryTile label="Strikes" value={String(summary.strikeCount)} />
                <SummaryTile label="Resistance Dist %" value={summary.nearestResistanceDistancePct?.toFixed(2) || "n/a"} />
                <SummaryTile label="Support Dist %" value={summary.nearestSupportDistancePct?.toFixed(2) || "n/a"} />
                <SummaryTile label="Future" value={summary.futuresPrice?.toFixed(2) || "n/a"} />
                <SummaryTile label="Buildup" value={summary.futuresBuildup.replace('_', ' ')} />
              </div>

              <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                    Gamma Regime
                  </span>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      summary.gammaRegime === "stabilizing"
                        ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                        : summary.gammaRegime === "expansive"
                          ? "border border-rose-500/30 bg-rose-500/10 text-rose-300"
                          : "border border-white/10 bg-white/5 text-slate-300"
                    }`}
                  >
                    {summary.gammaRegime}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-300">{summary.interpretation}</p>
              </div>

              <div className="mt-5 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/40">
                <MetricRow label="PCR" value={summary.putCallRatio?.toFixed(2) || "n/a"} />
                <MetricRow label="Call IV" value={summary.averageCallIv?.toFixed(2) ? `${summary.averageCallIv.toFixed(2)}%` : "n/a"} />
                <MetricRow label="Put IV" value={summary.averagePutIv?.toFixed(2) ? `${summary.averagePutIv.toFixed(2)}%` : "n/a"} />
                <MetricRow label="ATM IV" value={summary.atmIv?.toFixed(2) ? `${summary.atmIv.toFixed(2)}%` : "n/a"} />
                <MetricRow label="Wing Put IV" value={summary.wingPutIv?.toFixed(2) ? `${summary.wingPutIv.toFixed(2)}%` : "n/a"} />
                <MetricRow label="Wing Call IV" value={summary.wingCallIv?.toFixed(2) ? `${summary.wingCallIv.toFixed(2)}%` : "n/a"} />
                <MetricRow label="Near ATM Skew" value={summary.nearAtmVolSkew?.toFixed(2) ? `${summary.nearAtmVolSkew.toFixed(2)} pts` : "n/a"} />
                <MetricRow label="Vol Skew" value={summary.volSkew?.toFixed(2) ? `${summary.volSkew.toFixed(2)} pts` : "n/a"} />
                <MetricRow label="Term Slope" value={summary.termStructureSlope?.toFixed(2) ? `${summary.termStructureSlope.toFixed(2)} pts` : "n/a"} />
                <MetricRow label="Skew Regime" value={summary.volSkewRegime.replace('_', ' ')} />
                <MetricRow label="Vanna" value={summary.netVannaExposure.toLocaleString(undefined, { maximumFractionDigits: 0 })} />
                <MetricRow label="Charm" value={summary.netCharmExposure.toLocaleString(undefined, { maximumFractionDigits: 0 })} />
                <MetricRow label="Vanna Regime" value={summary.vannaRegime.replace('_', ' ')} />
                <MetricRow label="Charm Regime" value={summary.charmRegime.replace('_', ' ')} />
                <MetricRow label="Call Wall" value={summary.callWall?.toFixed(2) || "n/a"} />
                <MetricRow label="Put Wall" value={summary.putWall?.toFixed(2) || "n/a"} />
                <MetricRow label="Gamma Flip" value={summary.gammaFlipLevel?.toFixed(2) || "n/a"} />
                <MetricRow label="OI Flow" value={summary.dominantOiFlow.replace('_', ' ')} />
                <MetricRow label="Fut Buildup" value={summary.futuresBuildup.replace('_', ' ')} />
                <MetricRow label="Fut OI Δ" value={summary.futuresOiChange?.toLocaleString() || "n/a"} />
                <MetricRow
                  label="Res Dist %"
                  value={summary.nearestResistanceDistancePct?.toFixed(2) || "n/a"}
                />
                <MetricRow
                  label="Sup Dist %"
                  value={summary.nearestSupportDistancePct?.toFixed(2) || "n/a"}
                />
                <MetricRow label="Options Adj" value={`${summary.optionsAdjustmentHint >= 0 ? "+" : ""}${summary.optionsAdjustmentHint.toFixed(1)}`} />
                <MetricRow label="Net Gamma" value={summary.netGammaExposure.toLocaleString(undefined, { maximumFractionDigits: 0 })} last />
              </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-xl font-bold">Strike Map</h2>
                <span className="text-xs uppercase tracking-[0.2em] text-slate-500">Nearest expiry window</span>
              </div>

              {!summary.available ? (
                <div className="mt-5 rounded-2xl border border-dashed border-white/10 bg-slate-950/40 p-5 text-sm text-slate-400">
                  {summary.reason || "No option structure available for this stock right now."}
                </div>
              ) : (
                <div className="mt-5 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/40">
                  <div className="grid grid-cols-8 border-b border-white/10 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                    <span>Strike</span>
                    <span className="text-right">Call OI</span>
                    <span className="text-right">Put OI</span>
                    <span className="text-right">Call Δ</span>
                    <span className="text-right">Put Δ</span>
                    <span className="text-right">Call IV</span>
                    <span className="text-right">Put IV</span>
                    <span className="text-right">Net Gamma</span>
                  </div>
                  <div className="max-h-[640px] overflow-y-auto">
                    {summary.strikeSummaries.map((row) => (
                      <div key={row.strike} className="grid grid-cols-8 border-b border-white/10 px-4 py-3 text-sm last:border-b-0">
                        <span className="font-medium text-slate-200">{row.strike.toFixed(2)}</span>
                        <span className="text-right text-sky-300">{row.callOi.toLocaleString()}</span>
                        <span className="text-right text-amber-300">{row.putOi.toLocaleString()}</span>
                        <span className={`text-right ${row.callOiChange >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                          {row.callOiChange >= 0 ? "+" : ""}
                          {row.callOiChange.toLocaleString()}
                        </span>
                        <span className={`text-right ${row.putOiChange >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                          {row.putOiChange >= 0 ? "+" : ""}
                          {row.putOiChange.toLocaleString()}
                        </span>
                        <span className="text-right text-slate-300">{row.callIv !== null ? `${(row.callIv * 100).toFixed(1)}%` : "n/a"}</span>
                        <span className="text-right text-slate-300">{row.putIv !== null ? `${(row.putIv * 100).toFixed(1)}%` : "n/a"}</span>
                        <span className={`text-right font-medium ${row.netGammaExposure >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                          {row.netGammaExposure.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </div>
        ) : null}
      </div>
    </main>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-bold text-white">{value}</p>
    </div>
  );
}

function MetricRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-4 px-4 py-3 ${last ? "" : "border-b border-white/10"}`}>
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</span>
        {EXPLAINERS[label] ? <MetricHelp text={EXPLAINERS[label]} /> : null}
      </div>
      <span className="text-sm font-medium tracking-tight text-slate-100">{value}</span>
    </div>
  );
}

function MetricHelp({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex items-center">
      <CircleHelp className="h-3.5 w-3.5 text-slate-500" />
      <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-56 -translate-x-1/2 rounded-xl border border-white/10 bg-slate-950/95 px-3 py-2 text-[10px] leading-4 text-slate-200 shadow-2xl group-hover:block">
        {text}
      </span>
    </span>
  );
}
