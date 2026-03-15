"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, KeyRound, RefreshCw, Wifi, WifiOff, XCircle } from "lucide-react";
import { useStockStream } from "@/lib/useStockStream";

const HINDALCO_INSTRUMENT = "NSE:HINDALCO";

type TokenResponse = {
  token?: string;
};

type QuoteResponse = {
  success?: boolean;
  error?: string;
  needsLogin?: boolean;
  instrument?: string;
  data?: {
    last_price: number;
    volume: number;
    open: number;
    high: number;
    low: number;
    close: number;
  };
};

export default function AuthTestPage() {
  const [isCheckingToken, setIsCheckingToken] = useState(false);
  const [isFetchingQuote, setIsFetchingQuote] = useState(false);
  const [tokenPresent, setTokenPresent] = useState<boolean | null>(null);
  const [tokenPreview, setTokenPreview] = useState<string>("");
  const [quote, setQuote] = useState<QuoteResponse["data"] | null>(null);
  const [quoteError, setQuoteError] = useState<string>("");
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [isRunningStreamAction, setIsRunningStreamAction] = useState(false);
  const [streamActionError, setStreamActionError] = useState("");
  const { snapshot, socketConnected } = useStockStream();

  const checkToken = async () => {
    setIsCheckingToken(true);
    try {
      const res = await fetch("/api/kite/token", { cache: "no-store" });
      const data: TokenResponse = await res.json();
      const token = data.token || "";

      setTokenPresent(Boolean(token));
      setTokenPreview(token ? `${token.slice(0, 6)}...${token.slice(-4)}` : "");
    } catch (error) {
      setTokenPresent(false);
      setTokenPreview("");
      console.error("Failed to inspect Kite token", error);
    } finally {
      setIsCheckingToken(false);
    }
  };

  const fetchHindalcoQuote = async () => {
    setIsFetchingQuote(true);
    setQuoteError("");

    try {
      const res = await fetch(`/api/quote?instrument=${encodeURIComponent(HINDALCO_INSTRUMENT)}`, {
        cache: "no-store",
      });
      const data: QuoteResponse = await res.json();

      if (!res.ok || !data.success || !data.data) {
        setQuote(null);
        setQuoteError(data.error || "Unable to fetch HINDALCO quote.");
        if (data.needsLogin) {
          setTokenPresent(false);
          setTokenPreview("");
        }
        return;
      }

      setQuote(data.data);
      setLastUpdated(new Date().toLocaleTimeString());
      await checkToken();
    } catch (error) {
      setQuote(null);
      setQuoteError("Network error while fetching HINDALCO quote.");
      console.error("Failed to fetch HINDALCO quote", error);
    } finally {
      setIsFetchingQuote(false);
    }
  };

  useEffect(() => {
    checkToken();
  }, []);

  const liveHindalco = snapshot.quotes.find((item) => item.instrument === HINDALCO_INSTRUMENT);

  const runStreamAction = async (action: "reconnect" | "resubscribe") => {
    setIsRunningStreamAction(true);
    setStreamActionError("");

    try {
      const res = await fetch("http://localhost:8080/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStreamActionError(data.error || `Failed to ${action} stream.`);
      }
    } catch (error) {
      console.error(`Failed to ${action} stream`, error);
      setStreamActionError(`Network error while trying to ${action} the stream.`);
    } finally {
      setIsRunningStreamAction(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-16 text-slate-100">
      <div className="mx-auto max-w-5xl">
        <div className="max-w-3xl">
          <p className="inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1 text-sm font-semibold text-emerald-300">
            Authentication test bench
          </p>
          <h1 className="mt-4 text-5xl font-black tracking-tight">Kite auth flow and HINDALCO quote test</h1>
          <p className="mt-5 text-lg leading-8 text-slate-300">
            This page is meant for quick manual validation while we rebuild the stocks product. It checks whether the
            Kite auth cookie exists and whether the current session can fetch a live quote for {HINDALCO_INSTRUMENT}.
          </p>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-3xl border border-white/10 bg-white/5 p-8">
            <div className="flex flex-wrap gap-3">
              <a
                href="/api/kite/login"
                className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-5 py-3 font-semibold text-slate-950 transition hover:bg-emerald-400"
              >
                <ExternalLink className="h-4 w-4" />
                Start Kite Login
              </a>

              <button
                type="button"
                onClick={checkToken}
                disabled={isCheckingToken}
                className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-5 py-3 font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${isCheckingToken ? "animate-spin" : ""}`} />
                Check Auth Cookie
              </button>

              <button
                type="button"
                onClick={fetchHindalcoQuote}
                disabled={isFetchingQuote}
                className="inline-flex items-center gap-2 rounded-2xl border border-sky-500/30 bg-sky-500/10 px-5 py-3 font-semibold text-sky-200 transition hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <KeyRound className="h-4 w-4" />
                Fetch HINDALCO Quote
              </button>

              <button
                type="button"
                onClick={() => runStreamAction("reconnect")}
                disabled={isRunningStreamAction}
                className="inline-flex items-center gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-3 font-semibold text-amber-200 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${isRunningStreamAction ? "animate-spin" : ""}`} />
                Reconnect Stream
              </button>

              <button
                type="button"
                onClick={() => runStreamAction("resubscribe")}
                disabled={isRunningStreamAction}
                className="inline-flex items-center gap-2 rounded-2xl border border-violet-500/30 bg-violet-500/10 px-5 py-3 font-semibold text-violet-200 transition hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${isRunningStreamAction ? "animate-spin" : ""}`} />
                Resubscribe Universe
              </button>
            </div>

            {streamActionError ? (
              <div className="mt-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-100">
                {streamActionError}
              </div>
            ) : null}

            <div className="mt-8 rounded-3xl border border-white/10 bg-slate-950/60 p-6">
              <div className="flex items-start justify-between gap-6">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Auth status</p>
                  <h2 className="mt-2 text-2xl font-bold">
                    {tokenPresent === null ? "Checking..." : tokenPresent ? "Authenticated" : "Not authenticated"}
                  </h2>
                </div>

                {tokenPresent ? (
                  <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-300">
                    <CheckCircle2 className="h-4 w-4" />
                    Cookie present
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-2 rounded-full border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-300">
                    <XCircle className="h-4 w-4" />
                    Cookie missing
                  </span>
                )}
              </div>

              <div className="mt-4 text-sm text-slate-400">
                {tokenPreview ? (
                  <p>Detected token: <span className="font-mono text-slate-200">{tokenPreview}</span></p>
                ) : (
                  <p>No Kite access token cookie was found for this browser session.</p>
                )}
              </div>
            </div>

            <div className="mt-6 rounded-3xl border border-white/10 bg-slate-950/60 p-6">
              <div className="flex items-start justify-between gap-6">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Stream status</p>
                  <h2 className="mt-2 text-2xl font-bold">
                    {socketConnected ? "Websocket connected" : "Websocket offline"}
                  </h2>
                </div>

                {socketConnected ? (
                  <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-300">
                    <Wifi className="h-4 w-4" />
                    Live
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-2 rounded-full border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-300">
                    <WifiOff className="h-4 w-4" />
                    Offline
                  </span>
                )}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <MetricCard label="Universe Size" value={snapshot.universeSize} />
                <MetricCard label="Subscribed" value={snapshot.subscribed} />
                <MetricCard label="Last Tick" value={snapshot.lastSnapshotAt ? new Date(snapshot.lastSnapshotAt).toLocaleTimeString() : "--"} />
                <MetricCard label="Universe Sync" value={snapshot.lastUniverseSyncAt ? new Date(snapshot.lastUniverseSyncAt).toLocaleTimeString() : "--"} />
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 text-sm">
                <MetricCard label="Last Connect Attempt" value={snapshot.lastConnectAttemptAt ? new Date(snapshot.lastConnectAttemptAt).toLocaleTimeString() : "--"} />
                <MetricCard label="Last Stream Error" value={snapshot.lastError || "None"} />
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/5 p-8">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Live quote</p>
            <h2 className="mt-2 text-2xl font-bold">HINDALCO</h2>
            <p className="mt-2 text-sm text-slate-400">Instrument: {HINDALCO_INSTRUMENT}</p>

            {quote ? (
              <div className="mt-6 space-y-4">
                <div>
                  <p className="text-sm text-slate-400">Last traded price</p>
                  <p className="text-5xl font-black text-white">{quote.last_price}</p>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <MetricCard label="Open" value={quote.open} />
                  <MetricCard label="High" value={quote.high} />
                  <MetricCard label="Low" value={quote.low} />
                  <MetricCard label="Close" value={quote.close} />
                </div>

                <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                  <p className="text-sm text-slate-400">Volume</p>
                  <p className="mt-1 text-lg font-semibold text-slate-100">{quote.volume}</p>
                  {lastUpdated ? <p className="mt-2 text-xs text-slate-500">Updated at {lastUpdated}</p> : null}
                </div>

                {liveHindalco ? (
                  <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                    <p className="text-sm text-emerald-200">Websocket live price</p>
                    <p className="mt-1 text-2xl font-black text-white">{liveHindalco.lastPrice}</p>
                    <p className="mt-2 text-xs text-emerald-100/80">
                      Stream update at {new Date(liveHindalco.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="mt-6 rounded-2xl border border-dashed border-white/10 bg-slate-950/40 p-6 text-sm text-slate-400">
                {quoteError || "Run the quote test after authenticating with Kite."}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

function MetricCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
      <p className="text-slate-400">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-100">{value}</p>
    </div>
  );
}
