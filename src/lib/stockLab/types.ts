import { StockScreenType, StockUniverseCategory } from '@/lib/stockUniverse';

export type StockLabDatasetSource = 'cache' | 'built' | 'missing';

export interface StockLabProgressUpdate {
  key: string;
  title: string;
  detail: string;
  timestamp: string;
}

export type StockLabProgressReporter = (progress: StockLabProgressUpdate) => Promise<void> | void;

export type StockLabStreamEvent =
  | {
      type: 'progress';
      progress: StockLabProgressUpdate;
    }
  | {
      type: 'result';
      success: true;
      data: StockLabAnalysis;
      notes: string[];
    }
  | {
      type: 'error';
      error: string;
      needsLogin?: boolean;
    };

export interface StockLabCurrentScreenSnapshot {
  screen: StockScreenType;
  screenLabel: string;
  matched: boolean;
  score: number;
  thesis: string;
  confidenceScore: number;
  confidenceLabel: 'High' | 'Medium' | 'Watchlist' | 'Low';
  supportLabel: 'Historically Supported' | 'Developing Evidence' | 'Low Sample';
  historicallySupported: boolean;
  confidenceExplanation: string;
  supportExplanation: string;
  aboveVwap: boolean;
  sectorState: 'upgrade' | 'degrade' | 'flat' | 'unknown';
  gammaRegime: string | null;
  dominantOiFlow: string | null;
  futuresBuildup: string | null;
  microstructureBias: 'Supportive' | 'Opposing' | 'Mixed' | 'Unavailable';
  topDrivers: string[];
  entryPrice: number;
  stopLoss: number;
  targetPrice: number;
  riskPct: number;
  rewardPct: number;
}

export interface StockLabCurrentSnapshot {
  available: boolean;
  reason: string | null;
  regimeLabel: string | null;
  regimeConfidencePct: number | null;
  activeScreens: StockLabCurrentScreenSnapshot[];
  allScreens: StockLabCurrentScreenSnapshot[];
  bestScreen: StockLabCurrentScreenSnapshot | null;
}

export interface StockLabOverview {
  symbol: string;
  instrument: string;
  sector: string;
  category: StockUniverseCategory;
  inUniverse: boolean;
  analyzedAt: string;
  priceReturnPct: number;
  totalLabels: number;
  bestModel: {
    screen: StockScreenType;
    screenLabel: string;
    netExpectancyPct: number;
    winRate: number;
    sampleSize: number;
  } | null;
}

export interface StockLabDataStatus {
  daySource: StockLabDatasetSource;
  minuteSource: StockLabDatasetSource;
  benchmarkSource: StockLabDatasetSource;
  dayCandleCount: number;
  minuteCandleCount: number;
  benchmarkCandleCount: number;
  dayFrom: string | null;
  dayTo: string | null;
  minuteFrom: string | null;
  minuteTo: string | null;
}

export interface StockLabModelSummary {
  screen: StockScreenType;
  screenLabel: string;
  sampleSize: number;
  winRate: number;
  expectancyPct: number;
  netExpectancyPct: number;
  avgWinPct: number;
  avgLossPct: number;
  profitFactor: number;
  stabilityScore: number;
  totalReturnPct: number;
  benchmarkReturnPct: number;
  excessReturnPct: number;
  maxDrawdownPct: number;
  latestTradeDate: string | null;
}

export interface StockLabCurvePoint {
  screen: StockScreenType;
  screenLabel: string;
  date: string;
  tradeNumber: number;
  nav: number;
  benchmarkNav: number;
  drawdownPct: number;
  netReturnPct: number;
  benchmarkReturnPct: number;
}

export interface StockLabPricePoint {
  date: string;
  close: number;
  sma20: number | null;
  sma50: number | null;
  volume: number;
}

export interface StockLabMinuteCoveragePoint {
  date: string;
  candles: number;
}

export interface StockLabRegimePoint {
  screen: StockScreenType;
  screenLabel: string;
  regime: 'bullish' | 'bearish' | 'neutral';
  sampleSize: number;
  winRate: number;
  expectancyPct: number;
  netExpectancyPct: number;
}

export interface StockLabWalkForwardPoint {
  screen: StockScreenType;
  screenLabel: string;
  bucket: string;
  sampleSize: number;
  expectancyPct: number;
  netExpectancyPct: number;
}

export interface StockLabReturnBucketPoint {
  screen: StockScreenType;
  screenLabel: string;
  bucket: string;
  count: number;
}

export interface StockLabRecentTrade {
  screen: StockScreenType;
  screenLabel: string;
  tradeDate: string;
  entryDate: string;
  confirmation: string;
  regime: 'bullish' | 'bearish' | 'neutral';
  netReturnPct: number;
  benchmarkReturnPct: number;
  win: boolean;
}

export interface StockLabAnalysis {
  overview: StockLabOverview;
  dataStatus: StockLabDataStatus;
  currentSnapshot: StockLabCurrentSnapshot | null;
  modelSummaries: StockLabModelSummary[];
  modelCurves: StockLabCurvePoint[];
  priceSeries: StockLabPricePoint[];
  minuteCoverageSeries: StockLabMinuteCoveragePoint[];
  regimeSeries: StockLabRegimePoint[];
  walkForwardSeries: StockLabWalkForwardPoint[];
  returnBucketSeries: StockLabReturnBucketPoint[];
  recentTrades: StockLabRecentTrade[];
  notes: string[];
}
