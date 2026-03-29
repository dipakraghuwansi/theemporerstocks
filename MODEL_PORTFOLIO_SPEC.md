# Model Portfolio Spec

## Objective

Build an adaptive stock model portfolio for the existing stock-first platform. The goal is not to promise an "ultimate alpha" machine. The goal is to turn the app's existing alpha, regime, research, and risk signals into a repeatable portfolio construction process that:

- ranks stocks on stock-specific edge rather than plain market beta
- scales exposure up and down by market regime
- constrains concentration, drawdown, and turnover
- produces a transparent rebalance plan instead of opaque picks
- supports read-only model portfolios first, then paper execution, then live execution later

## Why This Fits The Current App

The codebase already has most of the inputs needed for a first version:

- stock-level residual alpha, factor basket alpha, sector-relative and category-relative context
- normalized screener scores and ATR-aware factor math
- HMM-style regime detection
- research-backed probability estimates and confidence labels
- options structure and microstructure overlays
- Mongo-backed persistence and a positions area that is already being rebuilt around equity holdings

This means the main missing piece is portfolio construction, not raw signal generation.

## Product Shape

### Primary experience

Rebuild the stock positions area around a `Model Portfolio` module.

Default user flow:

1. View the current regime, target gross exposure, cash allocation, and portfolio health.
2. See current model holdings with target weight, live weight, thesis, stop, target, and evidence strength.
3. Review a rebalance preview showing adds, trims, exits, and cash changes.
4. Drill into why each stock is included using score, alpha, probability, options context, and research support.

### Initial release boundary

Version 1 should be read-only plus paper-ready:

- generate portfolio candidates
- generate target weights
- generate rebalance actions
- persist snapshots and performance history
- do not place live orders automatically

Version 2 can connect rebalance actions to paper trading.

Version 3 can connect approved rebalance actions to live execution.

## Portfolio Definition

### Portfolio type

Launch one default portfolio first:

- `Adaptive Alpha 10`

Characteristics:

- long-only NSE stocks
- 6 to 10 names
- regime-aware cash allocation
- weekly rebalance with daily risk checks
- focused on swing holdings, not intraday churn

Do not mix options legs into the core model portfolio. Options data can remain an overlay input.

### Universe

Use the current stock universe as the starting point, then apply filters.

Eligibility filters:

- valid daily history and current quote
- minimum price threshold
- minimum average traded value threshold
- no symbols with poor data coverage
- no symbols with unresolved research or broken manifest state

Recommended first-pass filters:

- `lastPrice >= 100`
- `avgVolume20` available
- at least 60 daily candles
- exclude names with missing ATR, SMA20, or SMA50

Liquidity thresholds should remain configurable because the universe may evolve.

## Signal Stack

### Philosophy

The portfolio score should combine four layers:

1. stock-specific alpha
2. setup quality
3. evidence quality
4. regime and overlay context

The current app already computes much of this, so the portfolio should reuse those outputs rather than invent a second independent scoring system.

### Composite portfolio score

For each eligible stock, compute:

`portfolioScore = 0.35 * alphaScore + 0.30 * setupScore + 0.20 * evidenceScore + 0.15 * overlayScore`

Where:

- `alphaScore`
  - derived from percentile-ranked `residualAlpha20d`
  - blended with percentile-ranked `factorBasketAlpha20d`
  - purpose: isolate stock-specific strength from broad market lift
- `setupScore`
  - derived from existing screener score normalized to `0..100`
  - includes trend, breakout, mean reversion, and ATR-aware setup quality already produced by the app
- `evidenceScore`
  - derived from research `winRate`, `expectancyPct`, and `sampleSize`
  - penalize low-sample setups
- `overlayScore`
  - derived from options structure support, microstructure support, and sector breadth alignment

Recommended first-pass sub-formulas:

- `alphaScore = 0.55 * pctRank(residualAlpha20d) + 0.45 * pctRank(factorBasketAlpha20d)`
- `setupScore = screenerScore`
- `evidenceScore = clamp(0.5 * winRate + 8 * expectancyPct + min(sampleSize, 20), 0, 100)`
- `overlayScore = clamp(50 + optionsAdjustment + microstructureAdjustment + sectorAdjustment, 0, 100)`

### Hard entry gates

A stock is portfolio-eligible only if:

- `portfolioScore >= 65`
- `confidenceLabel` is `High` or `Medium`
- `supportLabel` is not `Low Sample` unless the regime is strongly bullish and the stock ranks in the top decile
- `residualAlpha20d > 0`
- `factorBasketAlpha20d > 0`
- price is above `SMA20`

For a stricter launch, require price above both `SMA20` and `SMA50`.

### Ranking and selection

Selection logic:

1. rank all eligible stocks by `portfolioScore`
2. take the top names subject to sector and category caps
3. drop names with conflicting risk flags
4. hold remaining capital as cash if high-quality ideas are insufficient

Target number of names by regime:

- `trend`: 8 to 10
- `rebound`: 6 to 8
- `mixed`: 4 to 6
- `risk-off`: 0 to 3

## Regime Layer

Use the existing HMM-style regime state as the exposure switch for the whole portfolio.

### Regime policy

- `trend`
  - target gross exposure: `95%`
  - target cash: `5%`
  - max position count: `10`
  - max single-name weight: `12%`
- `rebound`
  - target gross exposure: `80%`
  - target cash: `20%`
  - max position count: `8`
  - max single-name weight: `11%`
- `mixed`
  - target gross exposure: `55%`
  - target cash: `45%`
  - max position count: `6`
  - max single-name weight: `10%`
- `risk-off`
  - target gross exposure: `20%`
  - target cash: `80%`
  - max position count: `3`
  - max single-name weight: `8%`

### Regime overrides

Apply extra de-risking when:

- portfolio drawdown exceeds threshold
- one-day VaR exceeds threshold
- breadth collapses while the regime still shows `trend`
- research support deteriorates across the book

Recommended kill switches:

- if portfolio drawdown from peak exceeds `8%`, cut target gross exposure by `35%`
- if drawdown exceeds `12%`, move to capital protection mode and cap gross exposure at `20%`

## Weighting Engine

### Weighting philosophy

Use conviction-weighted risk sizing, not pure mean-variance optimization.

Pure max-Sharpe optimization is too unstable for a first production version because it can over-concentrate in recent winners and noisy covariance estimates.

### Target weight formula

For each selected stock:

`rawWeight = convictionScore / max(atrPct, atrFloor)`

Where:

- `convictionScore = 0.50 * portfolioScore + 0.25 * confidenceScore + 0.25 * evidenceStrength`
- `atrPct = atr14 / lastPrice * 100`
- `atrFloor = 1.5`

Then:

1. normalize all raw weights
2. scale to regime target gross exposure
3. apply single-name caps
4. apply sector caps
5. redistribute leftover weight pro rata
6. keep any unallocated remainder as cash

### Portfolio caps

Recommended first-pass caps:

- max single-name weight: regime dependent, `8%` to `12%`
- max sector weight: `30%`
- max category weight: `35%`
- minimum position weight: `4%`
- minimum rebalance trade size: `1.5%` of NAV to avoid noise

### Optional optimizer overlay

After the conviction-weighted draft is produced, optionally run a constrained optimizer to refine weights. Constraints:

- long-only
- sum of weights plus cash equals `100%`
- per-name cap
- per-sector cap
- turnover penalty vs current holdings
- volatility penalty

The optimizer should refine the draft, not replace it.

## Rebalance Rules

### Schedule

Use a two-speed process:

- weekly scheduled rebalance for ranking and target weights
- daily risk review for exits, stop updates, and regime-driven trims

Recommended first version:

- weekly rebalance every Friday after market close
- daily pre-open health computation

### Rebalance triggers

Create a rebalance when any of the following is true:

- scheduled weekly rebalance time
- regime changes
- a holding falls below exit threshold
- a stop is hit
- a new candidate enters the top rank cohort with materially better score

### Entry rules

Enter a stock when:

- it is inside the target rank bucket
- it passes hard entry gates
- cash is available within regime policy
- adding it does not violate sector or category caps

### Exit rules

Exit fully when any of the following is true:

- rank drops below a defined cutoff, such as outside top `15`
- `portfolioScore < 52`
- `confidenceLabel` becomes `Low`
- regime turns `risk-off` and the stock is not among the top defensive names
- stop-loss is breached

### Trim rules

Trim when:

- current weight exceeds target weight by more than `2%`
- sector cap is breached
- drawdown kill switch activates
- VaR exceeds the portfolio threshold

## Risk Management

### Position-level risk

Use the existing ATR-derived trade planning as the base for stop logic.

Initial stop logic:

- use existing ATR stop distance
- store stop and target with every model position
- allow trailing stop upgrades only, not downward stop moves

### Portfolio-level risk

Track:

- one-day historical VaR 95
- one-day CVaR 95
- rolling max drawdown
- realized volatility
- hit rate
- turnover
- weighted beta vs benchmark
- sector concentration

First-pass limits:

- one-day VaR 95 <= `1.75%` of NAV
- weighted beta <= `1.10` in `trend`
- weighted beta <= `0.75` in `mixed`
- weighted beta <= `0.40` in `risk-off`
- monthly turnover target <= `35%`, soft cap

If a limit is breached, the rebalance engine should reduce lower-ranked names first.

## Backtest And Validation

### Required before claiming alpha

Do not label the portfolio as alpha-producing until it is validated through:

- walk-forward backtests
- regime-by-regime performance splits
- turnover-adjusted returns
- transaction cost assumptions
- attribution vs benchmark and sector effects

### Minimum backtest outputs

- CAGR
- annualized volatility
- Sharpe
- Sortino
- max drawdown
- hit rate
- profit factor
- average holding period
- turnover
- exposure by regime
- contribution by sector
- residual alpha attribution

### Comparison sets

Compare against:

- equal-weight universe basket
- NIFTY 50 benchmark
- top-ranked names without regime scaling
- top-ranked names without risk caps

This helps isolate whether the edge comes from selection, regime scaling, or risk control.

## Data Model

Add dedicated model portfolio persistence rather than overloading the legacy position store.

### Collections

- `model_portfolios`
- `model_portfolio_positions`
- `model_portfolio_rebalances`
- `model_portfolio_snapshots`
- `model_portfolio_performance`

### `model_portfolios`

One document per portfolio definition.

Suggested shape:

```ts
type ModelPortfolio = {
  id: string;
  slug: string;
  name: string;
  status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
  benchmarkSymbol: string;
  baseCapital: number;
  rebalanceFrequency: 'WEEKLY';
  configVersion: number;
  createdAt: string;
  updatedAt: string;
};
```

### `model_portfolio_positions`

Current holdings for the active model book.

```ts
type ModelPortfolioPosition = {
  id: string;
  portfolioId: string;
  symbol: string;
  instrument: string;
  status: 'OPEN' | 'CLOSED';
  enteredAt: string;
  exitedAt?: string;
  entryPrice: number;
  currentPrice: number;
  shares: number;
  costBasis: number;
  targetWeight: number;
  liveWeight: number;
  stopLoss: number;
  targetPrice?: number;
  thesis: string;
  portfolioScore: number;
  confidenceScore: number;
  regimeAtEntry: string;
  exitReason?: 'RANK_DROP' | 'STOP' | 'REBALANCE' | 'RISK_OFF' | 'MANUAL';
};
```

### `model_portfolio_rebalances`

Stores the decision record and actions.

```ts
type ModelPortfolioRebalance = {
  id: string;
  portfolioId: string;
  generatedAt: string;
  effectiveAt: string;
  regime: string;
  targetGrossExposure: number;
  targetCashWeight: number;
  actions: Array<{
    symbol: string;
    action: 'BUY' | 'TRIM' | 'EXIT' | 'HOLD';
    currentWeight: number;
    targetWeight: number;
    reason: string;
  }>;
  notes: string[];
};
```

### `model_portfolio_snapshots`

Daily portfolio state for analytics.

```ts
type ModelPortfolioSnapshot = {
  id: string;
  portfolioId: string;
  asOf: string;
  nav: number;
  cash: number;
  grossExposure: number;
  netExposure: number;
  dayReturnPct: number;
  drawdownPct: number;
  var95Pct: number;
  cvar95Pct: number;
  weightedBeta: number;
  regime: string;
  holdingsCount: number;
};
```

## API Shape

### Read endpoints

- `GET /api/portfolio/model`
  - portfolio summary, regime, exposure, current holdings, top metrics
- `GET /api/portfolio/model/holdings`
  - current holdings table
- `GET /api/portfolio/model/rebalance-preview`
  - proposed actions and weight diffs
- `GET /api/portfolio/model/performance`
  - NAV curve, drawdown, rolling metrics
- `GET /api/portfolio/model/history`
  - snapshots and rebalance log

### Compute endpoints

- `POST /api/portfolio/model/recompute`
  - recompute rankings, weights, and preview only
- `POST /api/portfolio/model/rebalance`
  - persist approved rebalance actions
- `POST /api/portfolio/model/settle`
  - settle paper fills and refresh live weights

### Internal service boundaries

Suggested new library modules:

- `src/lib/modelPortfolio/types.ts`
- `src/lib/modelPortfolio/config.ts`
- `src/lib/modelPortfolio/scoring.ts`
- `src/lib/modelPortfolio/constraints.ts`
- `src/lib/modelPortfolio/weights.ts`
- `src/lib/modelPortfolio/rebalance.ts`
- `src/lib/modelPortfolio/risk.ts`
- `src/lib/modelPortfolio/store.ts`

## UI Shape

### Preferred location

Repurpose the rebuilt positions surface into the portfolio experience:

- keep `/positions` as the user-facing route
- make it the model portfolio dashboard for equities

This fits the current direction of the app better than adding a disconnected new route first.

### Page sections

1. Hero
   - portfolio NAV
   - current regime
   - gross exposure
   - cash
   - daily return
   - drawdown

2. Holdings table
   - symbol
   - target weight
   - live weight
   - portfolio score
   - confidence
   - support label
   - stop
   - target
   - pnl

3. Rebalance preview
   - adds
   - trims
   - exits
   - reason chips

4. Risk panel
   - VaR
   - CVaR
   - beta
   - sector concentration
   - turnover

5. Attribution panel
   - stock contribution
   - sector contribution
   - residual alpha contribution
   - benchmark relative return

6. History panel
   - NAV chart
   - drawdown chart
   - regime timeline

## Explainability Requirements

Every holding should have a plain-language thesis generated from existing signals. Example structure:

- why it ranks highly
- what alpha signals support it
- what regime supports or limits it
- what risk controls are attached
- what would cause exit

This should reuse the current recommendation and research explanation style rather than introducing generic AI summaries.

## Phased Build Plan

### Phase 1

Read-only portfolio engine:

- reusable scoring layer
- regime-aware selection
- target weights
- rebalance preview
- snapshot persistence
- portfolio dashboard on `/positions`

### Phase 2

Paper portfolio operations:

- paper fills
- drift tracking
- transaction cost model
- realized pnl and contribution tracking

### Phase 3

Research and optimizer depth:

- constrained optimizer refinement
- rolling covariance stabilization
- historical VaR and CVaR engine
- walk-forward portfolio backtest page

### Phase 4

Live execution:

- reviewed rebalance actions
- manual approval path
- broker order handoff
- execution audit trail

### Phase 5

Paper-only operating mode:

- hard-disable live broker order placement in the app
- treat `Recompute Portfolio` as the only step that mutates the paper book
- store portfolio, paper trades, and review checkpoints in MongoDB only
- use manual approval as a reconciliation checkpoint against saved paper trades, not a broker handoff

## Open Decisions

These should be confirmed before implementation begins:

- exact rebalance day and time
- whether `Adaptive Alpha 10` should permit low-sample names during strong trend regimes
- default base capital for paper tracking
- liquidity floor per stock
- whether beta caps should be hard constraints or soft penalties
- whether the first version should allow partial target fills or assume frictionless rebalances

## Recommended Start

Implement Phase 1 first with no optimizer.

The fastest high-signal path is:

1. reuse current screener outputs
2. add portfolio ranking and constraint logic
3. generate target weights with conviction divided by ATR percent
4. persist portfolio snapshots
5. rebuild `/positions` into the model portfolio dashboard

That gives the project a usable portfolio brain quickly, while leaving room for deeper optimization later.
