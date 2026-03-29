import { StockScreenType, StockUniverseCategory } from '@/lib/stockUniverse';

export interface ScreenOutcomeLabel {
  screen: StockScreenType;
  symbol: string;
  instrument: string;
  sector: string;
  interval: 'day' | 'minute';
  tradeDate: string;
  entryDate: string;
  split: 'train' | 'test';
  walkForwardBucket: string;
  regime: 'bullish' | 'bearish' | 'neutral';
  lookaheadBars: number;
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  confirmation: string;
  maxFavorableExcursionPct: number;
  maxAdverseExcursionPct: number;
  outcomeReturnPct: number;
  benchmarkReturnPct: number;
  excessReturnPct: number;
  netReturnPct: number;
  slippagePct: number;
  costPct: number;
  micropriceEdgePct?: number | null;
  rollingOfi?: number | null;
  vpin?: number | null;
  tradePressureScore?: number | null;
  microstructureBias?: 'supportive' | 'opposing' | 'mixed' | 'unavailable';
  microstructureSource?: 'depth' | 'trade_pressure' | 'unavailable';
  atmIv?: number | null;
  nearAtmVolSkew?: number | null;
  termStructureSlope?: number | null;
  volSkewRegime?: 'put_fear' | 'call_chasing' | 'balanced' | 'unavailable';
  gammaRegime?: 'stabilizing' | 'expansive' | 'neutral' | 'unavailable';
  hitTarget: boolean;
  hitStop: boolean;
  win: boolean;
}

export interface ScreenResearchSummary {
  screen: StockScreenType;
  sampleSize: number;
  wins: number;
  losses: number;
  winRate: number;
  avgWinPct: number;
  avgLossPct: number;
  expectancyPct: number;
  avgExcessReturnPct: number;
  netExpectancyPct: number;
  profitFactor: number;
}

export interface SymbolResearchStats {
  symbol: string;
  screen: StockScreenType;
  sampleSize: number;
  wins: number;
  losses: number;
  winRate: number;
  avgWinPct: number;
  avgLossPct: number;
  expectancyPct: number;
  avgExcessReturnPct: number;
  netExpectancyPct: number;
}

export interface ScreenStabilitySummary {
  screen: StockScreenType;
  trainExpectancyPct: number;
  testExpectancyPct: number;
  trainNetExpectancyPct: number;
  testNetExpectancyPct: number;
  driftPct: number;
  walkForwardSpreadPct: number;
  regimeSpreadPct: number;
  stabilityScore: number;
}

export interface MicrostructureResearchSummary {
  screen: StockScreenType;
  bias: 'supportive' | 'opposing' | 'mixed' | 'unavailable';
  sampleSize: number;
  wins: number;
  losses: number;
  winRate: number;
  expectancyPct: number;
  netExpectancyPct: number;
  avgVpin: number | null;
  avgMicropriceEdgePct: number | null;
  avgRollingOfi: number | null;
  avgTradePressureScore: number | null;
}

export interface MicrostructureCoverageSummary {
  screen: StockScreenType;
  totalMinuteLabels: number;
  coveredLabels: number;
  unavailableLabels: number;
  coveragePct: number;
}

export interface VolSurfaceResearchSummary {
  screen: StockScreenType;
  family: 'vol_skew' | 'gamma';
  regime: string;
  sampleSize: number;
  wins: number;
  losses: number;
  winRate: number;
  expectancyPct: number;
  netExpectancyPct: number;
  avgAtmIv: number | null;
  avgNearAtmSkew: number | null;
  avgTermSlope: number | null;
}

export interface ResearchManifest {
  generatedAt: string;
  interval: 'mixed';
  config: {
    benchmarkSymbol: string;
    slippagePct: number;
    costPct: number;
    noLookaheadValidation: boolean;
  };
  screens: ScreenResearchSummary[];
  bySymbol: SymbolResearchStats[];
  splitSummary: Array<ScreenResearchSummary & { split: 'train' | 'test' }>;
  regimeSummary: Array<ScreenResearchSummary & { regime: 'bullish' | 'bearish' | 'neutral' }>;
  walkForwardSummary: Array<ScreenResearchSummary & { bucket: string }>;
  stabilitySummary: ScreenStabilitySummary[];
  microstructureSummary: MicrostructureResearchSummary[];
  microstructureCoverageSummary: MicrostructureCoverageSummary[];
  volSurfaceSummary: VolSurfaceResearchSummary[];
  labels: ScreenOutcomeLabel[];
}

export interface ProbabilityEstimate {
  sampleSize: number;
  winRate: number;
  avgWinPct: number;
  avgLossPct: number;
  expectancyPct: number;
  avgExcessReturnPct: number;
  netExpectancyPct: number;
}

export type ResearchBacktestMode = 'day' | 'minute';
export type ResearchBacktestRunStatus = 'IDLE' | 'RUNNING' | 'COMPLETED' | 'FAILED';
export type ResearchBacktestSymbolStatus = 'COMPLETED' | 'FAILED';

export interface ResearchBacktestSymbolResult {
  id: string;
  runId: string;
  interval: ResearchBacktestMode;
  symbol: string;
  instrument: string;
  sector: string;
  category: StockUniverseCategory;
  status: ResearchBacktestSymbolStatus;
  lookbackDays: number;
  processedAt: string;
  datasetFrom: string | null;
  datasetTo: string | null;
  candleCount: number;
  labelCount: number;
  screens: ScreenResearchSummary[];
  labels: ScreenOutcomeLabel[];
  error?: string;
}

export interface ResearchBacktestRun {
  id: string;
  interval: ResearchBacktestMode;
  status: ResearchBacktestRunStatus;
  lookbackDays: number;
  batchSize: number;
  totalSymbols: number;
  completedSymbols: number;
  failedSymbols: number;
  pendingSymbols: string[];
  processedSymbols: string[];
  failedList: string[];
  activeSymbol: string | null;
  nextSymbol: string | null;
  lastProcessedSymbol: string | null;
  createdAt: string;
  startedAt: string | null;
  updatedAt: string;
  completedAt: string | null;
  notes: string[];
}

export interface ResearchBacktestBatchSummary {
  requested: number;
  processed: number;
  completed: number;
  failed: number;
  symbols: ResearchBacktestSymbolResult[];
}

export interface ResearchBacktestBatchReport {
  run: ResearchBacktestRun;
  aggregateManifest: ResearchManifest | null;
  batch: ResearchBacktestBatchSummary;
}
