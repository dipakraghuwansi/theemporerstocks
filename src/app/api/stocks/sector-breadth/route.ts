import fs from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { getKiteInstance } from '@/lib/kiteHelper';
import { calculatePercentChange, calculateSma } from '@/lib/stockIndicators';
import { StockUniverseCategory } from '@/lib/stockUniverse';
import { getStockUniverse } from '@/lib/stockUniverseStore';

const INSTRUMENTS_URL = 'https://api.kite.trade/instruments';
const DAY_MS = 24 * 60 * 60 * 1000;
const SNAPSHOT_PATH = path.join(process.cwd(), 'sector_breadth_snapshot.json');

type InstrumentMeta = {
  instrumentToken: number;
  instrument: string;
};

type StockBaseMetric = {
  symbol: string;
  instrument: string;
  sector: string;
  category: StockUniverseCategory;
  sma20: number | null;
};

type SectorSnapshot = {
  sector: string;
  breadthPct: number;
  aboveSma20Pct: number;
  avgDayChangePct: number;
  generatedAt: string;
};

let instrumentCache: Map<string, InstrumentMeta> | null = null;
let instrumentCacheAt = 0;
let baseMetricCache: StockBaseMetric[] | null = null;
let baseMetricCacheAt = 0;
const CACHE_MS = 5 * 60 * 1000;

async function getInstrumentMap() {
  const now = Date.now();
  if (instrumentCache && now - instrumentCacheAt < 12 * 60 * 60 * 1000) {
    return instrumentCache;
  }

  const response = await fetch(INSTRUMENTS_URL, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('Failed to fetch Kite instruments CSV.');
  }

  const csvText = await response.text();
  const lines = csvText.split('\n');
  const nextMap = new Map<string, InstrumentMeta>();

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (cols.length < 12) continue;

    const instrumentToken = parseInt(cols[0]?.replace(/"/g, '') || '0', 10);
    const tradingsymbol = cols[2]?.replace(/"/g, '').trim();
    const segment = cols[10]?.replace(/"/g, '').trim();
    const exchange = cols[11]?.replace(/"/g, '').trim();

    if (!instrumentToken || !tradingsymbol || exchange !== 'NSE' || segment !== 'NSE') continue;

    nextMap.set(`NSE:${tradingsymbol}`, {
      instrumentToken,
      instrument: `NSE:${tradingsymbol}`,
    });
  }

  instrumentCache = nextMap;
  instrumentCacheAt = now;
  return instrumentCache;
}

function ensureSnapshotFile() {
  if (!fs.existsSync(SNAPSHOT_PATH)) {
    fs.writeFileSync(SNAPSHOT_PATH, '[]', 'utf8');
  }
}

function readPreviousSnapshot() {
  ensureSnapshotFile();
  try {
    const raw = fs.readFileSync(SNAPSHOT_PATH, 'utf8');
    const parsed = JSON.parse(raw) as SectorSnapshot[];
    return parsed;
  } catch {
    return [];
  }
}

function writeSnapshot(snapshot: SectorSnapshot[]) {
  fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2), 'utf8');
}

async function getBaseMetrics(kite: any, instrumentMap: Map<string, InstrumentMeta>) {
  const now = Date.now();
  if (baseMetricCache && now - baseMetricCacheAt < CACHE_MS) {
    return baseMetricCache;
  }

  const universe = getStockUniverse();
  const mapped = universe
    .map((item) => {
      const meta = instrumentMap.get(item.instrument);
      return meta ? { ...item, instrumentToken: meta.instrumentToken } : null;
    })
    .filter(Boolean) as Array<(ReturnType<typeof getStockUniverse>[number]) & { instrumentToken: number }>;

  const today = new Date().toISOString().split('T')[0];
  const fromDaily = new Date(Date.now() - 40 * DAY_MS).toISOString().split('T')[0];

  const metrics = await Promise.all(
    mapped.map(async (item) => {
      const candles = await kite.getHistoricalData(item.instrumentToken, 'day', fromDaily, today, false).catch(() => []);
      if (!candles || candles.length < 20) return null;

      const closes = candles.map((candle: any) => candle.close);
      const sma20 = calculateSma(closes, 20);

      return {
        symbol: item.symbol,
        instrument: item.instrument,
        sector: item.sector,
        category: item.category,
        sma20,
      } satisfies StockBaseMetric;
    })
  );

  const normalizedMetrics = metrics.filter((item): item is StockBaseMetric => Boolean(item));
  baseMetricCache = normalizedMetrics;
  baseMetricCacheAt = now;
  return normalizedMetrics;
}

export async function GET(_request: NextRequest) {
  try {
    const token = _request.cookies.get('kite_access_token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Not authenticated with Kite', needsLogin: true }, { status: 401 });
    }

    const kite = getKiteInstance(token) as any;
    const instrumentMap = await getInstrumentMap();
    const previousSnapshot = readPreviousSnapshot();
    const previousMap = new Map(previousSnapshot.map((row) => [row.sector, row]));

    const baseMetrics = await getBaseMetrics(kite, instrumentMap);
    const quotes = await kite.getQuote(baseMetrics.map((item) => item.instrument));
    const sectorMap = new Map<
      string,
      {
        members: number;
        advancing: number;
        declining: number;
        aboveSma20: number;
        totalDayChange: number;
        categories: Set<string>;
      }
    >();

    for (const item of baseMetrics) {
      const quote = quotes[item.instrument];
      if (!quote) continue;

      const lastPrice = quote.last_price;
      const previousClose = quote.ohlc?.close || lastPrice;
      const dayChangePct = Number(calculatePercentChange(lastPrice, previousClose).toFixed(2));
      const sector = item.sector || 'Unknown';

      const entry = sectorMap.get(sector) || {
        members: 0,
        advancing: 0,
        declining: 0,
        aboveSma20: 0,
        totalDayChange: 0,
        categories: new Set<string>(),
      };

      entry.members += 1;
      if (dayChangePct > 0) entry.advancing += 1;
      if (dayChangePct < 0) entry.declining += 1;
      if (item.sma20 !== null && lastPrice > item.sma20) entry.aboveSma20 += 1;
      entry.totalDayChange += dayChangePct;
      entry.categories.add(item.category);
      sectorMap.set(sector, entry);
    }

    const generatedAt = new Date().toISOString();
    const rows = Array.from(sectorMap.entries()).map(([sector, stats]) => {
      const breadthPct = Number(((stats.advancing / stats.members) * 100).toFixed(1));
      const aboveSma20Pct = Number(((stats.aboveSma20 / stats.members) * 100).toFixed(1));
      const avgDayChangePct = Number((stats.totalDayChange / stats.members).toFixed(2));
      const previous = previousMap.get(sector);
      const breadthDelta = previous ? Number((breadthPct - previous.breadthPct).toFixed(1)) : 0;
      const aboveSma20Delta = previous ? Number((aboveSma20Pct - previous.aboveSma20Pct).toFixed(1)) : 0;

      return {
        sector,
        members: stats.members,
        advancing: stats.advancing,
        declining: stats.declining,
        breadthPct,
        aboveSma20Pct,
        avgDayChangePct,
        breadthDelta,
        aboveSma20Delta,
        categories: Array.from(stats.categories).sort(),
        trend: breadthDelta > 0 ? 'upgrade' : breadthDelta < 0 ? 'degrade' : 'flat',
      };
    });

    rows.sort((a, b) => {
      if (b.breadthDelta !== a.breadthDelta) return b.breadthDelta - a.breadthDelta;
      if (b.breadthPct !== a.breadthPct) return b.breadthPct - a.breadthPct;
      return b.avgDayChangePct - a.avgDayChangePct;
    });

    writeSnapshot(
      rows.map((row) => ({
        sector: row.sector,
        breadthPct: row.breadthPct,
        aboveSma20Pct: row.aboveSma20Pct,
        avgDayChangePct: row.avgDayChangePct,
        generatedAt,
      }))
    );

    return NextResponse.json({
      success: true,
      generatedAt,
      sectors: rows,
      notes: [
        'Breadth delta is measured against the previous saved sector breadth snapshot.',
        'Above-SMA20 uses cached daily history and is refreshed on a short cache window.',
        'Default ordering is strongest breadth upgrade to strongest breadth degradation.',
      ],
    });
  } catch (error: any) {
    console.error('Sector breadth API error:', error);
    return NextResponse.json({ error: error.message || 'Failed to load sector breadth.' }, { status: 500 });
  }
}
