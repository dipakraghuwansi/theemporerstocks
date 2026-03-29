import { ScreenerScoredResult } from '@/lib/screener/types';
import { StockScreenType } from '@/lib/stockUniverse';

export type ModelPortfolioStatus = 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
export type ModelPortfolioRebalanceFrequency = 'WEEKLY';
export type ModelPortfolioRegimeName = 'trend' | 'risk-off' | 'rebound' | 'mixed';
export type ModelPortfolioPositionStatus = 'OPEN' | 'CLOSED';
export type ModelPortfolioActionType = 'BUY' | 'TRIM' | 'EXIT' | 'HOLD';
export type ModelPortfolioExitReason = 'RANK_DROP' | 'STOP' | 'REBALANCE' | 'RISK_OFF' | 'MANUAL';
export type ModelPortfolioTradeSide = 'BUY' | 'SELL';
export type ModelPortfolioExecutionStatus = 'RECORDED' | 'PARTIAL' | 'FAILED' | 'BLOCKED';
export type ModelPortfolioExecutionOrderStatus = 'RECORDED' | 'FAILED' | 'SKIPPED';

export interface ModelPortfolioDefinition {
  id: string;
  slug: string;
  name: string;
  status: ModelPortfolioStatus;
  benchmarkSymbol: string;
  baseCapital: number;
  rebalanceFrequency: ModelPortfolioRebalanceFrequency;
  configVersion: number;
  cash: number;
  bookStartAt: string;
  entryActivationDate: string | null;
  lastComputedAt: string | null;
  lastRebalancedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ModelPortfolioPosition {
  id: string;
  portfolioId: string;
  symbol: string;
  instrument: string;
  sector: string;
  category: string;
  status: ModelPortfolioPositionStatus;
  enteredAt: string;
  updatedAt: string;
  exitedAt?: string;
  entryPrice: number;
  currentPrice: number;
  shares: number;
  costBasis: number;
  marketValue: number;
  targetWeight: number;
  liveWeight: number;
  weightDriftPct: number;
  stopLoss: number;
  targetPrice?: number;
  thesis: string;
  portfolioScore: number;
  confidenceScore: number;
  confidenceLabel: 'High' | 'Medium' | 'Watchlist' | 'Low';
  supportLabel: 'Historically Supported' | 'Developing Evidence' | 'Low Sample';
  sourceScreen: StockScreenType;
  regimeAtEntry: ModelPortfolioRegimeName;
  beta20: number | null;
  dayChangePct: number;
  residualAlpha20d: number | null;
  factorBasketAlpha20d: number | null;
  score: number;
  feesPaid: number;
  realizedPnl: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  scoreComponents: {
    alphaScore: number;
    setupScore: number;
    evidenceScore: number;
    overlayScore: number;
  };
  exitReason?: ModelPortfolioExitReason;
}

export interface ModelPortfolioSnapshot {
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
  regime: ModelPortfolioRegimeName;
  holdingsCount: number;
}

export interface ModelPortfolioRebalanceAction {
  symbol: string;
  instrument: string;
  action: ModelPortfolioActionType;
  currentWeight: number;
  targetWeight: number;
  currentShares: number;
  targetShares: number;
  executedShares: number;
  price: number;
  amount: number;
  fees: number;
  realizedPnl?: number;
  reason: string;
  sourceScreen?: StockScreenType;
}

export interface ModelPortfolioRebalance {
  id: string;
  portfolioId: string;
  generatedAt: string;
  effectiveAt: string;
  regime: ModelPortfolioRegimeName;
  targetGrossExposure: number;
  targetCashWeight: number;
  actions: ModelPortfolioRebalanceAction[];
  notes: string[];
}

export interface ModelPortfolioCandidate {
  symbol: string;
  instrument: string;
  sector: string;
  category: string;
  sourceScreen: StockScreenType;
  sourceScreenLabel: string;
  screenerResult: ScreenerScoredResult;
  alphaScore: number;
  setupScore: number;
  evidenceScore: number;
  overlayScore: number;
  portfolioScore: number;
  evidenceStrength: number;
}

export interface ModelPortfolioTrade {
  id: string;
  portfolioId: string;
  positionId?: string;
  symbol: string;
  instrument: string;
  side: ModelPortfolioTradeSide;
  action: Exclude<ModelPortfolioActionType, 'HOLD'>;
  executedAt: string;
  shares: number;
  price: number;
  grossAmount: number;
  fees: number;
  netCashImpact: number;
  realizedPnl: number;
  regime: ModelPortfolioRegimeName;
  sourceScreen?: StockScreenType;
  reason: string;
}

export interface ModelPortfolioMetrics {
  realizedPnl: number;
  unrealizedPnl: number;
  totalFees: number;
  turnoverPct30d: number;
  driftPct: number;
  openPositionsCostBasis: number;
}

export interface ModelPortfolioOptimizerDiagnostics {
  enabled: boolean;
  covarianceLookbackDays: number;
  shrinkage: number;
  coveragePct: number;
  avgPairCorrelation: number;
  turnoverPenaltyApplied: boolean;
}

export interface ModelPortfolioWeightPlan {
  selections: Array<{
    candidate: ModelPortfolioCandidate;
    targetWeight: number;
  }>;
  targetGrossExposure: number;
  targetCashWeight: number;
  targetPositionsMin: number;
  targetPositionsMax: number;
  maxSingleNameWeight: number;
  optimizerDiagnostics: ModelPortfolioOptimizerDiagnostics;
}

export interface ModelPortfolioPerformancePoint {
  asOf: string;
  nav: number;
  benchmarkNav: number;
  equalWeightNav: number;
  noRegimeNav: number;
  uncappedNav: number;
  drawdownPct: number;
  benchmarkDrawdownPct: number;
  dayReturnPct: number;
  benchmarkDayReturnPct: number;
  rollingVar95Pct: number;
  rollingCvar95Pct: number;
  grossExposure: number;
  holdingsCount: number;
  turnoverPct: number;
  regime: ModelPortfolioRegimeName;
}

export interface ModelPortfolioPerformanceMetrics {
  totalReturnPct: number;
  benchmarkReturnPct: number;
  excessReturnPct: number;
  cagrPct: number;
  annualizedVolatilityPct: number;
  sharpe: number;
  sortino: number;
  maxDrawdownPct: number;
  hitRatePct: number;
  profitFactor: number;
  avgHoldingPeriodDays: number;
  avgMonthlyTurnoverPct: number;
  realizedVolatilityPct: number;
  latestVar95Pct: number;
  latestCvar95Pct: number;
  residualAlphaAttributionPct: number;
  rebalanceCount: number;
}

export interface ModelPortfolioPerformanceComparison {
  key: 'benchmark' | 'equal_weight' | 'no_regime' | 'uncapped';
  label: string;
  endingNav: number;
  totalReturnPct: number;
  excessReturnPct: number;
}

export interface ModelPortfolioPerformanceAttribution {
  sector: string;
  contributionPct: number;
  avgWeightPct: number;
}

export interface ModelPortfolioPerformanceSummary {
  id: string;
  portfolioId: string;
  generatedAt: string;
  asOf: string;
  lookbackDays: number;
  rebalanceFrequency: ModelPortfolioRebalanceFrequency;
  optimizerDiagnostics: ModelPortfolioOptimizerDiagnostics;
  metrics: ModelPortfolioPerformanceMetrics;
  comparisons: ModelPortfolioPerformanceComparison[];
  sectorAttribution: ModelPortfolioPerformanceAttribution[];
  series: ModelPortfolioPerformancePoint[];
  notes: string[];
}

export interface ModelPortfolioExecutionOrder {
  id: string;
  symbol: string;
  instrument: string;
  action: Exclude<ModelPortfolioActionType, 'HOLD'>;
  transactionType: 'BUY' | 'SELL';
  exchange: string;
  tradingsymbol: string;
  quantity: number;
  orderType: 'MARKET';
  product: 'CNC';
  status: ModelPortfolioExecutionOrderStatus;
  paperTradeId?: string;
  amount: number;
  reason: string;
  error?: string;
}

export interface ModelPortfolioExecution {
  id: string;
  portfolioId: string;
  rebalanceId: string | null;
  createdAt: string;
  approvedAt: string;
  submittedBy: 'manual';
  confirmationText: string;
  status: ModelPortfolioExecutionStatus;
  mode: 'PAPER';
  persistence: 'MONGODB';
  actionCount: number;
  recordedCount: number;
  failedCount: number;
  skippedCount: number;
  totalNotional: number;
  notes: string[];
  orders: ModelPortfolioExecutionOrder[];
}

export interface ModelPortfolioSummary {
  portfolio: ModelPortfolioDefinition;
  snapshot: ModelPortfolioSnapshot | null;
  regime: {
    name: ModelPortfolioRegimeName;
    label: string;
    confidence: number;
    targetGrossExposure: number;
    targetCashWeight: number;
    targetPositionsMin: number;
    targetPositionsMax: number;
    maxSingleNameWeight: number;
  };
  holdings: ModelPortfolioPosition[];
  topCandidates: ModelPortfolioCandidate[];
  rebalancePreview: ModelPortfolioRebalance | null;
  history: ModelPortfolioSnapshot[];
  recentTrades: ModelPortfolioTrade[];
  metrics: ModelPortfolioMetrics;
  notes: string[];
}
