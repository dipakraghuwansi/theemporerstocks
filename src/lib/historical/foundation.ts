import { getKiteInstance } from '@/lib/kiteHelper';
import { getStockUniverse } from '@/lib/stockUniverseStore';
import {
  HistoricalBuildRequest,
  HistoricalBuildResult,
  HistoricalCandle,
  HistoricalDatasetFile,
  HistoricalInstrumentMeta,
  HistoricalManifest,
  HistoricalManifestEntry,
  HistoricalUniverseSelection,
} from '@/lib/historical/types';
import { readDataset, readManifest, writeDataset, writeManifest } from '@/lib/historical/cache';

const INSTRUMENTS_URL = 'https://api.kite.trade/instruments';
const HISTORICAL_REQUESTS_PER_SECOND = 3;
const MIN_REQUEST_GAP_MS = Math.ceil(1000 / HISTORICAL_REQUESTS_PER_SECOND) + 40;
const MAX_RETRIES = 3;
const NIFTY_50_TOKEN = 256265;
const BENCHMARK_SYMBOL = 'NIFTY50_BENCHMARK';

let instrumentCache: Map<string, HistoricalInstrumentMeta> | null = null;
let instrumentCacheAt = 0;
let lastHistoricalRequestAt = 0;
let activeBuild: Promise<HistoricalBuildResult> | null = null;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function paceHistoricalRequests() {
  const now = Date.now();
  const waitMs = Math.max(0, MIN_REQUEST_GAP_MS - (now - lastHistoricalRequestAt));
  if (waitMs > 0) {
    await sleep(waitMs);
  }
  lastHistoricalRequestAt = Date.now();
}

function getDateRange(lookbackDays: number) {
  const toDate = new Date();
  const fromDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  return {
    from: fromDate.toISOString().split('T')[0],
    to: toDate.toISOString().split('T')[0],
  };
}

function normalizeCandles(rows: any[]): HistoricalCandle[] {
  return rows.map((row) => ({
    date: new Date(row.date).toISOString(),
    open: row.open,
    high: row.high,
    low: row.low,
    close: row.close,
    volume: row.volume || 0,
  }));
}

async function getInstrumentMap() {
  const now = Date.now();
  if (instrumentCache && now - instrumentCacheAt < 12 * 60 * 60 * 1000) {
    return instrumentCache;
  }

  const response = await fetch(INSTRUMENTS_URL, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('Failed to fetch Kite instruments CSV');
  }

  const csvText = await response.text();
  const lines = csvText.split('\n');
  const nextMap = new Map<string, HistoricalInstrumentMeta>();

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
  return nextMap;
}

function selectUniverse(
  request: HistoricalBuildRequest,
  instrumentMap: Map<string, HistoricalInstrumentMeta>
) {
  const universe = getStockUniverse();
  const symbolSet = request.symbols?.length ? new Set(request.symbols.map((symbol) => symbol.trim().toUpperCase())) : null;

  const filtered = universe
    .filter((item) => (request.category && request.category !== 'all' ? item.category === request.category : true))
    .filter((item) => (symbolSet ? symbolSet.has(item.symbol) : true))
    .map((item) => {
      const meta = instrumentMap.get(item.instrument);
      return meta ? { ...item, instrumentToken: meta.instrumentToken } : null;
    })
    .filter((item): item is HistoricalUniverseSelection => Boolean(item))
    .sort((a, b) => a.symbol.localeCompare(b.symbol));

  const selected = request.maxSymbols ? filtered.slice(0, request.maxSymbols) : filtered;

  if (request.interval === 'day' && !request.symbols?.length) {
    selected.unshift({
      symbol: BENCHMARK_SYMBOL,
      instrument: 'NSE:NIFTY 50',
      sector: 'Benchmark',
      category: 'manual',
      instrumentToken: NIFTY_50_TOKEN,
      isBenchmark: true,
    });
  }

  return selected;
}

function datasetSatisfiesRequest(
  dataset: HistoricalDatasetFile | null,
  from: string,
  to: string
) {
  if (!dataset) return false;
  return dataset.from <= from && dataset.to >= to && dataset.candles.length > 0;
}

async function fetchHistoricalWithRetry(
  kite: any,
  selection: HistoricalUniverseSelection,
  from: string,
  to: string,
  interval: HistoricalBuildRequest['interval']
) {
  let attempt = 0;
  let lastError: any = null;

  while (attempt < MAX_RETRIES) {
    try {
      await paceHistoricalRequests();
      const rows = await kite.getHistoricalData(selection.instrumentToken, interval, from, to, false);
      return normalizeCandles(rows || []);
    } catch (error: any) {
      lastError = error;
      const message = String(error?.message || error || '');

      if (message.includes('TokenException') || message.includes('403')) {
        throw new Error('Kite session expired. Please login again.');
      }

      if (message.includes('429') || /rate limit/i.test(message)) {
        await sleep((attempt + 1) * 1000);
        attempt += 1;
        continue;
      }

      throw error;
    }
  }

  throw lastError || new Error(`Failed historical fetch for ${selection.symbol}`);
}

async function buildHistoricalDatasetInternal(request: HistoricalBuildRequest): Promise<HistoricalBuildResult> {
  const kite = getKiteInstance(request.token) as any;
  const instrumentMap = await getInstrumentMap();
  const selections = selectUniverse(request, instrumentMap);
  const { from, to } = getDateRange(request.lookbackDays);
  const generatedAt = new Date().toISOString();

  const entries: HistoricalManifestEntry[] = [];

  for (const selection of selections) {
    const cached = readDataset(request.interval, selection.symbol);
    if (!request.refresh && datasetSatisfiesRequest(cached, from, to)) {
      entries.push({
        symbol: selection.symbol,
        instrument: selection.instrument,
        sector: selection.sector,
        category: selection.category,
        isBenchmark: Boolean(selection.isBenchmark),
        interval: request.interval,
        from: cached!.from,
        to: cached!.to,
        fetchedAt: cached!.fetchedAt,
        candleCount: cached!.candles.length,
        status: 'cached',
      });
      continue;
    }

    try {
      const candles = await fetchHistoricalWithRetry(kite, selection, from, to, request.interval);
      const dataset: HistoricalDatasetFile = {
        symbol: selection.symbol,
        instrument: selection.instrument,
        instrumentToken: selection.instrumentToken,
        sector: selection.sector,
        category: selection.category,
        isBenchmark: Boolean(selection.isBenchmark),
        interval: request.interval,
        from,
        to,
        fetchedAt: new Date().toISOString(),
        candles,
      };

      writeDataset(dataset);
      entries.push({
        symbol: selection.symbol,
        instrument: selection.instrument,
        sector: selection.sector,
        category: selection.category,
        isBenchmark: Boolean(selection.isBenchmark),
        interval: request.interval,
        from,
        to,
        fetchedAt: dataset.fetchedAt,
        candleCount: candles.length,
        status: 'fetched',
      });
    } catch (error: any) {
      entries.push({
        symbol: selection.symbol,
        instrument: selection.instrument,
        sector: selection.sector,
        category: selection.category,
        isBenchmark: Boolean(selection.isBenchmark),
        interval: request.interval,
        from,
        to,
        fetchedAt: new Date().toISOString(),
        candleCount: 0,
        status: 'error',
        error: error?.message || `Failed to fetch ${selection.symbol}`,
      });
    }
  }

  const manifest: HistoricalManifest = {
    generatedAt,
    interval: request.interval,
    lookbackDays: request.lookbackDays,
    category: request.category || 'all',
    requestedSymbols: selections.map((item) => item.symbol),
    entries,
  };

  writeManifest(manifest);

  return {
    generatedAt,
    interval: request.interval,
    lookbackDays: request.lookbackDays,
    category: request.category || 'all',
    requested: selections.length,
    fetched: entries.filter((entry) => entry.status === 'fetched').length,
    cached: entries.filter((entry) => entry.status === 'cached').length,
    failed: entries.filter((entry) => entry.status === 'error').length,
    entries,
  };
}

export async function buildHistoricalDataset(request: HistoricalBuildRequest) {
  if (activeBuild) {
    return activeBuild;
  }

  activeBuild = buildHistoricalDatasetInternal(request).finally(() => {
    activeBuild = null;
  });

  return activeBuild;
}

export function getHistoricalFoundationStatus(interval: HistoricalBuildRequest['interval']) {
  return readManifest(interval);
}
