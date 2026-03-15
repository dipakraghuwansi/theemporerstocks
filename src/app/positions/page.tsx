export default function PositionsPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-16 text-slate-100">
      <div className="mx-auto max-w-4xl rounded-3xl border border-white/10 bg-white/5 p-10">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-300">Positions</p>
        <h1 className="mt-4 text-4xl font-black">Stock positions module is being rebuilt.</h1>
        <p className="mt-4 text-lg text-slate-300">
          The old monitoring flow depended on option-leg metadata and auto-exit logic for premium instruments. It has been
          archived so we can rebuild this area around equity holdings and simpler stock risk controls.
        </p>
      </div>
    </main>
  );
}
