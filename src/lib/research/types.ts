import { StockScreenType } from '@/lib/stockUniverse';

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
