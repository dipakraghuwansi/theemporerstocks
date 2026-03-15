export type StockScreenType =
  | 'intraday-momentum'
  | 'swing-setups'
  | 'mean-reversion'
  | 'breakout-watchlist';

export type StockUniverseCategory = 'nifty50' | 'niftymidcap150' | 'manual';

export interface StockUniverseItem {
  symbol: string;
  instrument: string;
  sector: string;
  category: StockUniverseCategory;
}

export const DEFAULT_STOCK_UNIVERSE: StockUniverseItem[] = [
  { symbol: 'HINDALCO', instrument: 'NSE:HINDALCO', sector: 'Metals', category: 'manual' },
  { symbol: 'RELIANCE', instrument: 'NSE:RELIANCE', sector: 'Energy', category: 'manual' },
  { symbol: 'TCS', instrument: 'NSE:TCS', sector: 'IT', category: 'manual' },
  { symbol: 'INFY', instrument: 'NSE:INFY', sector: 'IT', category: 'manual' },
  { symbol: 'ICICIBANK', instrument: 'NSE:ICICIBANK', sector: 'Financials', category: 'manual' },
  { symbol: 'HDFCBANK', instrument: 'NSE:HDFCBANK', sector: 'Financials', category: 'manual' },
  { symbol: 'SBIN', instrument: 'NSE:SBIN', sector: 'Financials', category: 'manual' },
  { symbol: 'LT', instrument: 'NSE:LT', sector: 'Industrials', category: 'manual' },
  { symbol: 'TATAMOTORS', instrument: 'NSE:TATAMOTORS', sector: 'Auto', category: 'manual' },
  { symbol: 'SUNPHARMA', instrument: 'NSE:SUNPHARMA', sector: 'Pharma', category: 'manual' },
  { symbol: 'BHARTIARTL', instrument: 'NSE:BHARTIARTL', sector: 'Telecom', category: 'manual' },
  { symbol: 'ITC', instrument: 'NSE:ITC', sector: 'Consumer', category: 'manual' },
];

export const SCREEN_LABELS: Record<StockScreenType, string> = {
  'intraday-momentum': 'Intraday Momentum',
  'swing-setups': 'Swing Setups',
  'mean-reversion': 'Mean Reversion',
  'breakout-watchlist': 'Breakout Watchlist',
};

export const CATEGORY_LABELS: Record<StockUniverseCategory, string> = {
  nifty50: 'Nifty 50',
  niftymidcap150: 'Nifty Midcap 150',
  manual: 'Manual',
};
