# Trading Intelligence Roadmap

## In Progress
- Score calibration follow-through
  - Review research dashboard output and tune overlay multipliers from observed train/test drift.
- Vol surface follow-through
  - The first skew, vanna, and charm proxies are live; next pass should improve strike selection and expiry weighting.

## Next
- Research-directed tuning
  - Use train/test drift, regime dependency, and walk-forward spread on `/research` to tune screen weights.
- Sector breadth hardening
  - Move sector breadth route to the same cache-first pattern used by `/screener` so it stops flirting with Kite rate limits.

## After That
- VPIN-style toxicity proxy
  - Current stream has a lightweight rolling proxy; next pass should switch to truer volume bucket construction using minute cache plus live deltas.
- Vol surface refinement
  - Move from simple window averages to skew by moneyness buckets and expiry curves.
- Residual alpha refinement
  - Current screener blends beta-adjusted benchmark, sector, and category context; next pass can add explicit factor baskets.

## Research / Advanced
- Regime HMM
  - First-pass HMM-style filter is live; next pass can add learned emissions and transition re-estimation.
- Minute-level microstructure scoring
  - First pass is live through microstructure overlay; next pass should add minute-bucket persistence and research labels tied directly to microstructure states.
- Score calibration
  - First-pass calibration context is live from manifest stats; next pass should become screen-and-factor specific rather than screen-wide.

## Done
- Residual alpha in screener scoring.
- Market microstructure foundation with `full` mode depth, microprice, OFI, rolling OFI, and VPIN-style proxy.
- Futures buildup integrated into options overlay and confidence text.
- Volatility skew from stock option chains.
- Vanna and charm proxies from the option chain.
- Residual alpha extended with simple factor-basket alpha.
- HMM-style regime smoothing.
- Minute-level microstructure scoring through the live microstructure overlay.
- First-pass score calibration from historical research stats.
