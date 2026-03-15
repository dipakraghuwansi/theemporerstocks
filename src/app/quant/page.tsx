export default function QuantArchivedPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-16 text-slate-100">
      <div className="mx-auto max-w-4xl rounded-3xl border border-white/10 bg-white/5 p-10">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">Archived</p>
        <h1 className="mt-4 text-4xl font-black">The options quant dashboard has been archived.</h1>
        <p className="mt-4 text-lg text-slate-300">
          PCR, GEX, Max Pain, skew, and the options websocket engine now live under <code>src/archive/options</code>.
        </p>
      </div>
    </main>
  );
}
