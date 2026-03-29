import { ModelPortfolioRegimeName } from '@/lib/modelPortfolio/types';
import { StockScreenType } from '@/lib/stockUniverse';

export const MODEL_PORTFOLIO_ID = 'adaptive_alpha_10';
export const MODEL_PORTFOLIO_CONFIG_VERSION = 2;
export const MODEL_PORTFOLIO_BASE_CAPITAL = 100_000;
export const MODEL_PORTFOLIO_HISTORY_LIMIT = 60;
export const MODEL_PORTFOLIO_REBALANCE_LOG_LIMIT = 20;
export const MODEL_PORTFOLIO_TRADE_LOG_LIMIT = 200;
export const MODEL_PORTFOLIO_PERFORMANCE_HISTORY_LIMIT = 8;
export const MODEL_PORTFOLIO_EXECUTION_LOG_LIMIT = 30;
export const MODEL_PORTFOLIO_ENTRY_POLICY = {
  marketEntryScoreThreshold: 0.6,
  requireHighConfidence: true,
  maxAvgPairCorrelation: 0.65,
} as const;
export const MODEL_PORTFOLIO_EXECUTION = {
  feeRate: 0.001,
  mode: 'PAPER',
  persistence: 'MONGODB',
  approvalPhrase: 'APPROVE',
} as const;
export const MODEL_PORTFOLIO_OPTIMIZER = {
  enabled: true,
  covarianceLookbackDays: 60,
  shrinkage: 0.35,
  turnoverPenalty: 0.08,
  volatilityPenaltyWeight: 0.45,
  correlationPenaltyWeight: 0.2,
} as const;
export const MODEL_PORTFOLIO_BACKTEST = {
  lookbackDays: 252,
  warmupDays: 80,
  rebalanceEveryBars: 5,
  annualTradingDays: 252,
  riskFreeRatePct: 6,
} as const;

export const MODEL_PORTFOLIO_SCREEN_UNIVERSE: StockScreenType[] = [
  'swing-setups',
  'breakout-watchlist',
  'mean-reversion',
];

export const MODEL_PORTFOLIO_FILTERS = {
  minPrice: 100,
  minAvgVolume20: 1,
  minPortfolioScore: 65,
  maxSectorWeight: 0.3,
  maxCategoryWeight: 0.35,
  minPositionWeight: 0.04,
  minTradeWeightChange: 0.015,
  atrFloorPct: 1.5,
  rebalanceWeightTolerance: 0.02,
  liveVarLimitPct: 1.75,
  maxDrawdownSoftPct: 8,
  maxDrawdownHardPct: 12,
} as const;

export const MODEL_PORTFOLIO_REGIME_POLICY: Record<
  ModelPortfolioRegimeName,
  {
    targetGrossExposure: number;
    targetCashWeight: number;
    targetPositionsMin: number;
    targetPositionsMax: number;
    maxSingleNameWeight: number;
  }
> = {
  trend: {
    targetGrossExposure: 0.95,
    targetCashWeight: 0.05,
    targetPositionsMin: 8,
    targetPositionsMax: 10,
    maxSingleNameWeight: 0.12,
  },
  rebound: {
    targetGrossExposure: 0.8,
    targetCashWeight: 0.2,
    targetPositionsMin: 6,
    targetPositionsMax: 8,
    maxSingleNameWeight: 0.11,
  },
  mixed: {
    targetGrossExposure: 0.55,
    targetCashWeight: 0.45,
    targetPositionsMin: 4,
    targetPositionsMax: 6,
    maxSingleNameWeight: 0.1,
  },
  'risk-off': {
    targetGrossExposure: 0.2,
    targetCashWeight: 0.8,
    targetPositionsMin: 0,
    targetPositionsMax: 3,
    maxSingleNameWeight: 0.08,
  },
};

export const MODEL_PORTFOLIO_NOTES = [
  'Model portfolio reuses the existing screener, research manifest, and HMM regime layer instead of maintaining a separate alpha engine.',
  'Phase 1 is read-only plus theoretical rebalancing. No live orders are placed from this module.',
  'Target weights are conviction-weighted and ATR-aware, then constrained by single-name, sector, and category caps.',
  'Intraday momentum candidates are intentionally excluded from the initial portfolio because this first version is designed for swing holdings.',
];
