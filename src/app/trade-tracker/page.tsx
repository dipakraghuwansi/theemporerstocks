export default function TradeTrackerPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-16 text-slate-100">
      <div className="mx-auto max-w-4xl rounded-3xl border border-white/10 bg-white/5 p-10">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-orange-300">Journal</p>
        <h1 className="mt-4 text-4xl font-black">Stock trade journal coming next.</h1>
        <p className="mt-4 text-lg text-slate-300">
          The previous tracker was tightly coupled to option premiums, DTE, and option-specific AI prompts. That code has
          been archived so this route can be rebuilt around stock entries, exits, notes, and review metrics.
        </p>
      </div>
    </main>
  );
}
