import { StockUniverseCategory } from '@/lib/stockUniverse';
import { OptionStructureSummary } from '@/lib/optionsStructure/types';
import { ScreenerCalibrationContext } from '@/lib/screener/calibration';
import { ScreenerFactorContext } from '@/lib/screenerFactors';
import { ProbabilityEstimate } from '@/lib/research/types';
import { BuyRecommendation } from '@/lib/research/recommendation';

export interface ScreenerBaseMetrics {
  symbol: string;
  instrument: string;
  sector: string;
  category: StockUniverseCategory;
  lastPrice: number;
  previousClose: number;
  openPrice: number;
  dayChangePct: number;
  gapPct: number;
  volume: number;
  avgVolume7: number | null;
  avgVolume7Compare: number | null;
  avgVolume20: number | null;
  volumeExpansion: number | null;
  sma20: number | null;
  sma50: number | null;
  rsi14: number | null;
  atr14: number | null;
  vwap: number | null;
  microprice: number | null;
  micropriceEdgePct: number | null;
  orderFlowImbalance: number | null;
  rollingOfi: number | null;
  vpin: number | null;
  relativeStrength20d: number | null;
  residualAlpha20d: number | null;
  factorBasketAlpha20d: number | null;
  breakoutLevel: number | null;
  breakdownLevel: number | null;
  aboveVwap: boolean;
  deliveryDataAvailable: boolean;
}

export interface ScreenerScoreContribution {
  key: string;
  label: string;
  value: number;
  displayValue: string;
  impact: number;
}

export interface ScreenerScoreBreakdown {
  baseScore: number;
  sectorAdjustment: number;
  regimeAdjustment: number;
  optionsAdjustment: number;
  microstructureAdjustment: number;
  sectorState: 'upgrade' | 'degrade' | 'flat' | 'unknown';
  sectorBreadthPct: number | null;
  sectorBreadthDelta: number | null;
  score: number;
  contributions: ScreenerScoreContribution[];
  topDrivers: ScreenerScoreContribution[];
}

export interface ScreenerScoredResult extends ScreenerBaseMetrics {
  baseScore: number;
  sectorAdjustment: number;
  regimeAdjustment: number;
  optionsAdjustment: number;
  microstructureAdjustment: number;
  sectorState: 'upgrade' | 'degrade' | 'flat' | 'unknown';
  sectorBreadthPct: number | null;
  sectorBreadthDelta: number | null;
  optionsStructure: OptionStructureSummary | null;
  probabilityEstimate: ProbabilityEstimate | null;
  buyRecommendation: BuyRecommendation;
  score: number;
  thesis: string;
  scoreBreakdown: ScreenerScoreBreakdown;
}

export interface ScreenerSectorContextRow {
  sector: string;
  breadthPct: number;
  breadthDelta: number;
  aboveSma20Pct: number;
  avgDayChangePct: number;
  sectorScore: number;
  trend: 'upgrade' | 'degrade' | 'flat';
}

export interface ScreenerRegime {
  name: 'trend' | 'risk-off' | 'rebound' | 'mixed';
  label: string;
  confidence: number;
  benchmarkDayChangePct: number;
  benchmarkAboveSma20: boolean;
  benchmarkReturn20d: number;
  advancingBreadthPct: number;
  aboveSma20Pct: number;
}

export interface ScreenerScorePayload {
  factorContext: ScreenerFactorContext;
  sectorContext: Record<string, ScreenerSectorContextRow>;
  optionStructureContext: Record<string, OptionStructureSummary | null>;
  calibrationContext: ScreenerCalibrationContext;
  regime: ScreenerRegime;
}
