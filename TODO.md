# Trading Intelligence Roadmap

## Complete Foundations
- `Stock-first platform pivot`
  - The active app is now stock-focused, with options intelligence layered in as context instead of being the product center.
- `Historical data platform`
  - Day and minute foundation builders, local cache, and Mongo-backed durability are in place.
- `Research workbench`
  - `/research` now covers train/test drift, walk-forward consistency, regime dependency, microstructure bias summaries, coverage tracking, and options-surface diagnostics.
- `Live microstructure stack`
  - `full`-mode depth streaming, microprice, OFI, rolling OFI, and a VPIN-style proxy are live.
- `Options structure stack`
  - Stock option-chain ingestion, gamma, vanna, charm, skew, term structure, OI flow, and futures buildup are live.
- `Journal test loop`
  - Screener `Buy` flow, journal storage, and pseudo trade closure on SL/target are working.
- `Mongo-backed persistence`
  - Universe, journal, positions, research artifacts, snapshots, and caches are wired into Mongo with local hot-cache behavior where appropriate.

## Complete Scoring Upgrades
- `Centralized scoring engine`
  - Shared scoring, factor derivation, overlays, and explainers are all unified.
- `Normalized and ATR-aware factors`
  - Core screen math now uses normalized and ATR-adjusted features instead of only raw heuristics.
- `Sector breadth overlay`
  - Sector breadth and breadth delta feed directly into ranking.
- `Regime layer`
  - Regime adjustments are active and now backed by persisted HMM-style learning state.
- `Options overlay`
  - Gamma, skew, walls, futures buildup, and flow-greek context affect scores and confidence.
- `Microstructure overlay`
  - Live book pressure and toxicity now affect intraday ranking and confidence.
- `Residual alpha refinement`
  - The alpha blend now separates beta-adjusted residuals, sector-relative return, category-relative return, and volatility-adjusted factor context.
- `Factor-profile calibration`
  - Factor multipliers now run through a shared research-driven profile system instead of mostly per-screen branching.

## Ongoing Tuning
- `Research-directed tuning`
  - The system now has enough evidence plumbing that tuning should continue off `/research` rather than intuition.
- `Minute-level microstructure validation`
  - Coverage tracking is now visible, but the edge quality still depends on accumulating more live-minute history.
- `Vol surface follow-through`
  - Live diagnostics, snapshot capture, and first-pass outcome summaries are in place; the remaining work is growing sample depth and tuning from it.
- `Overlay calibration follow-through`
  - Options and microstructure overlays already use research-derived regime/bias multipliers, but weak states still need to be tightened with more evidence.

## Next Engineering
- `Vol surface history depth`
  - Keep capturing options-surface snapshots during market hours so the research joins become statistically meaningful.
- `Minute microstructure sample depth`
  - Keep the stream running and rebuild manifests periodically so the `Unavailable` share falls and supportive/opposing buckets gain sample size.
- `VPIN validation pass`
  - The proxy now adapts by session phase and liquidity; the next step is judging whether that actually improves research stability and live usefulness.
- `Richer factor cohorts`
  - Residual/factor alpha can be improved further with sector ETFs, factor proxies, or bespoke peer cohorts when we want to deepen the cross-sectional model.
- `Broader HMM horizon comparison`
  - The regime learner now persists state; the next step is comparing longer-horizon persisted regime quality over time.

## Nice-To-Have Later
- `Historical options-surface backtest depth`
  - Promote options-surface research from first-pass summaries into a much deeper historical validation loop.
- `Direct out-of-sample factor learning`
  - Replace more of the remaining heuristic factor shaping with stronger evidence-led calibration.
- `More explicit model diagnostics`
  - Add pages or panels for calibration history, factor drift, and regime-state evolution if we want more observability.
