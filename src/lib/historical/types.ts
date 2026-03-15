import { StockUniverseCategory, StockUniverseItem } from '@/lib/stockUniverse';

export type HistoricalInterval = 'day' | '60minute' | '30minute' | '15minute' | '5minute' | 'minute';

export interface HistoricalBuildRequest {
  token: string;
  interval: HistoricalInterval;
  lookbackDays: number;
  refresh?: boolean;
  category?: StockUniverseCategory | 'all';
  symbols?: string[];
  maxSymbols?: number;
}

export interface HistoricalInstrumentMeta {
  instrumentToken: number;
  instrument: string;
}

export interface HistoricalCandle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface HistoricalDatasetFile {
  symbol: string;
  instrument: string;
  instrumentToken: number;
  sector: string;
  category: StockUniverseCategory;
  isBenchmark?: boolean;
  interval: HistoricalInterval;
  from: string;
  to: string;
  fetchedAt: string;
  candles: HistoricalCandle[];
}

export interface HistoricalManifestEntry {
  symbol: string;
  instrument: string;
  sector: string;
  category: StockUniverseCategory;
  isBenchmark?: boolean;
  interval: HistoricalInterval;
  from: string;
  to: string;
  fetchedAt: string;
  candleCount: number;
  status: 'cached' | 'fetched' | 'error';
  error?: string;
}

export interface HistoricalManifest {
  generatedAt: string;
  interval: HistoricalInterval;
  lookbackDays: number;
  category: StockUniverseCategory | 'all';
  requestedSymbols: string[];
  entries: HistoricalManifestEntry[];
}

export interface HistoricalBuildResult {
  generatedAt: string;
  interval: HistoricalInterval;
  lookbackDays: number;
  category: StockUniverseCategory | 'all';
  requested: number;
  fetched: number;
  cached: number;
  failed: number;
  entries: HistoricalManifestEntry[];
}

export interface HistoricalUniverseSelection extends StockUniverseItem {
  instrumentToken: number;
  isBenchmark?: boolean;
}
