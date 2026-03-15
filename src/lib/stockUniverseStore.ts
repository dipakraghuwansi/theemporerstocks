import fs from 'fs';
import path from 'path';
import { DEFAULT_STOCK_UNIVERSE, StockUniverseCategory, StockUniverseItem } from '@/lib/stockUniverse';

const DB_PATH = path.join(process.cwd(), 'stock_universe.json');

const NIFTY_50_CSV_URL = 'https://www.niftyindices.com/IndexConstituent/ind_nifty50list.csv';
const NIFTY_MIDCAP_150_CSV_URL = 'https://www.niftyindices.com/IndexConstituent/ind_niftymidcap150list.csv';

type CsvUniverseRow = {
  symbol: string;
  sector: string;
  category: StockUniverseCategory;
};

function ensureUniverseFile() {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(DEFAULT_STOCK_UNIVERSE, null, 2), 'utf8');
  }
}

function normalizeSymbol(symbol: string) {
  return symbol.trim().toUpperCase();
}

function normalizeSector(sector: string) {
  const trimmed = sector.trim();
  return trimmed || 'Unknown';
}

function normalizeCategory(category: string): StockUniverseCategory {
  if (category === 'nifty50' || category === 'niftymidcap150') return category;
  return 'manual';
}

function normalizeItem(item: Partial<StockUniverseItem>): StockUniverseItem | null {
  const symbol = normalizeSymbol(item.symbol || '');
  if (!symbol) return null;

  return {
    symbol,
    instrument: item.instrument?.trim() || `NSE:${symbol}`,
    sector: normalizeSector(item.sector || 'Unknown'),
    category: normalizeCategory(item.category || 'manual'),
  };
}

export function getStockUniverse(): StockUniverseItem[] {
  ensureUniverseFile();

  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<StockUniverseItem>[];

    return parsed
      .map(normalizeItem)
      .filter((item): item is StockUniverseItem => Boolean(item))
      .sort((a, b) => a.symbol.localeCompare(b.symbol));
  } catch {
    return [...DEFAULT_STOCK_UNIVERSE];
  }
}

export function saveStockUniverse(items: StockUniverseItem[]) {
  const normalized = items
    .map(normalizeItem)
    .filter((item): item is StockUniverseItem => Boolean(item))
    .sort((a, b) => a.symbol.localeCompare(b.symbol));

  fs.writeFileSync(DB_PATH, JSON.stringify(normalized, null, 2), 'utf8');
  return normalized;
}

export function upsertStockUniverseItem(item: Partial<StockUniverseItem>) {
  const normalized = normalizeItem(item);
  if (!normalized) {
    throw new Error('Symbol is required.');
  }

  const current = getStockUniverse();
  const next = current.filter((entry) => entry.symbol !== normalized.symbol);
  next.push(normalized);
  return saveStockUniverse(next);
}

export function deleteStockUniverseItem(symbol: string) {
  const normalizedSymbol = normalizeSymbol(symbol);
  const current = getStockUniverse();
  const next = current.filter((entry) => entry.symbol !== normalizedSymbol);
  return saveStockUniverse(next);
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

async function fetchIndexConstituents(url: string, category: StockUniverseCategory): Promise<CsvUniverseRow[]> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${category} constituents.`);
  }

  const csvText = await response.text();
  const lines = csvText.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map((header) => header.toLowerCase());
  const symbolIndex = headers.findIndex((header) => header === 'symbol');
  const industryIndex = headers.findIndex((header) => header === 'industry');

  if (symbolIndex === -1) {
    throw new Error(`Symbol column not found in ${category} CSV.`);
  }

  const items: CsvUniverseRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const symbol = normalizeSymbol(cols[symbolIndex] || '');
    if (!symbol) continue;

    items.push({
      symbol,
      sector: normalizeSector(industryIndex >= 0 ? cols[industryIndex] || 'Unknown' : 'Unknown'),
      category,
    });
  }

  return items;
}

export async function refreshStockUniverseFromIndices() {
  const [nifty50Rows, midcapRows] = await Promise.all([
    fetchIndexConstituents(NIFTY_50_CSV_URL, 'nifty50'),
    fetchIndexConstituents(NIFTY_MIDCAP_150_CSV_URL, 'niftymidcap150'),
  ]);

  const current = getStockUniverse();
  const manualItems = current.filter((item) => item.category === 'manual');
  const nextMap = new Map<string, StockUniverseItem>();

  for (const item of manualItems) {
    nextMap.set(item.symbol, item);
  }

  for (const row of [...midcapRows, ...nifty50Rows]) {
    nextMap.set(row.symbol, {
      symbol: row.symbol,
      instrument: `NSE:${row.symbol}`,
      sector: row.sector,
      category: row.category,
    });
  }

  return saveStockUniverse(Array.from(nextMap.values()));
}
