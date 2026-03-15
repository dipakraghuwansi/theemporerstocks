import { KiteConnect, KiteTicker } from 'kiteconnect';
import fs from 'fs';
import path from 'path';
import { getStockUniverse } from '@/lib/stockUniverseStore';

const TOKEN_FILE = path.join(process.cwd(), '.kite_token');
const INSTRUMENTS_URL = 'https://api.kite.trade/instruments';

type IoLike = {
  emit: (event: string, payload: unknown) => void;
};

type InstrumentMeta = {
  instrumentToken: number;
  instrument: string;
  symbol: string;
  exchange: string;
  segment: string;
};

type StreamQuote = {
  instrumentToken: number;
  instrument: string;
  symbol: string;
  lastPrice: number;
  change: number | null;
  volume: number;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  timestamp: string;
};

let kiteInstance: KiteConnect | null = null;
let tickerInstance: KiteTicker | null = null;
let currentToken = '';
let ioServer: IoLike | null = null;
let instrumentMap = new Map<string, InstrumentMeta>();
let subscribedTokens: number[] = [];
let latestQuotes = new Map<string, StreamQuote>();
let lastSnapshotAt: string | null = null;
let currentUniverseSize = 0;
let reconnectTimer: NodeJS.Timeout | null = null;
let syncIntervalStarted = false;
let tickerConnected = false;
let initializationPromise: Promise<void> | null = null;
let lastUniverseSyncAt: string | null = null;
let lastConnectAttemptAt: string | null = null;
let lastError: string | null = null;

function getApiKey() {
  return process.env.KITE_API_KEY || '';
}

export function getSavedKiteToken(): string | null {
  if (currentToken) return currentToken;
  if (fs.existsSync(TOKEN_FILE)) {
    currentToken = fs.readFileSync(TOKEN_FILE, 'utf8').trim();
    return currentToken;
  }
  return null;
}

function saveKiteToken(token: string) {
  currentToken = token;
  fs.writeFileSync(TOKEN_FILE, token, 'utf8');
}

async function loadInstrumentMap() {
  if (instrumentMap.size > 0) return instrumentMap;

  const response = await fetch(INSTRUMENTS_URL, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('Failed to fetch Kite instruments CSV for websocket subscriptions.');
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

    if (!instrumentToken || !tradingsymbol || !exchange) continue;
    if (exchange !== 'NSE' || segment !== 'NSE') continue;

    nextMap.set(`NSE:${tradingsymbol}`, {
      instrumentToken,
      instrument: `NSE:${tradingsymbol}`,
      symbol: tradingsymbol,
      exchange,
      segment,
    });
  }

  instrumentMap = nextMap;
  return instrumentMap;
}

function getUniverseTokens() {
  const universe = getStockUniverse();
  currentUniverseSize = universe.length;

  return universe
    .map((item) => instrumentMap.get(item.instrument))
    .filter((item): item is InstrumentMeta => Boolean(item));
}

function emitSnapshot() {
  if (!ioServer) return;

  const quotes = Array.from(latestQuotes.values()).sort((a, b) => a.symbol.localeCompare(b.symbol));
  ioServer.emit('stock-stream:update', {
    connected: tickerConnected,
    universeSize: currentUniverseSize,
    subscribed: subscribedTokens.length,
    lastSnapshotAt,
    quotes,
  });
}

export function getStockStreamSnapshot() {
  return {
    connected: tickerConnected,
    universeSize: currentUniverseSize,
    subscribed: subscribedTokens.length,
    lastSnapshotAt,
    lastUniverseSyncAt,
    lastConnectAttemptAt,
    lastError,
    quotes: Array.from(latestQuotes.values()).sort((a, b) => a.symbol.localeCompare(b.symbol)),
  };
}

async function subscribeUniverse() {
  if (!tickerInstance) return;
  await loadInstrumentMap();

  const universeTokens = getUniverseTokens();
  const nextTokens = universeTokens.map((item) => item.instrumentToken);

  if (subscribedTokens.length > 0) {
    try {
      tickerInstance.unsubscribe(subscribedTokens);
    } catch (error) {
      console.error('[Stock Stream] Failed to unsubscribe previous tokens', error);
    }
  }

  subscribedTokens = nextTokens;
  latestQuotes = new Map();
  lastUniverseSyncAt = new Date().toISOString();

  if (nextTokens.length === 0) {
    emitSnapshot();
    return;
  }

  tickerInstance.subscribe(nextTokens);
  tickerInstance.setMode(tickerInstance.modeQuote, nextTokens);

  console.log(`[Stock Stream] Subscribed to ${nextTokens.length} universe instruments.`);
  emitSnapshot();
}

function attachTickerHandlers(ticker: KiteTicker) {
  ticker.on('ticks', (ticks: any[]) => {
    const now = new Date().toISOString();

    for (const tick of ticks) {
      const instrumentToken = tick.instrument_token;
      const meta = Array.from(instrumentMap.values()).find((item) => item.instrumentToken === instrumentToken);
      if (!meta) continue;

      const close = tick.ohlc?.close ?? null;
      const lastPrice = tick.last_price;
      const change = close ? ((lastPrice - close) / close) * 100 : null;

      latestQuotes.set(meta.instrument, {
        instrumentToken,
        instrument: meta.instrument,
        symbol: meta.symbol,
        lastPrice,
        change: change !== null ? Number(change.toFixed(2)) : null,
        volume: tick.volume_traded || 0,
        open: tick.ohlc?.open ?? null,
        high: tick.ohlc?.high ?? null,
        low: tick.ohlc?.low ?? null,
        close,
        timestamp: now,
      });
    }

    lastSnapshotAt = now;
    emitSnapshot();
  });

  ticker.on('connect', async () => {
    console.log('[Stock Stream] Kite ticker connected.');
    tickerConnected = true;
    await subscribeUniverse();
    emitSnapshot();
  });

  ticker.on('disconnect', () => {
    console.log('[Stock Stream] Kite ticker disconnected.');
    tickerConnected = false;
    emitSnapshot();
  });

  ticker.on('error', (error: unknown) => {
    console.error('[Stock Stream] Kite ticker error:', error);
    lastError = error instanceof Error ? error.message : String(error);
    emitSnapshot();
  });
}

function connectTicker() {
  const apiKey = getApiKey();
  if (!apiKey || !currentToken) return;
  lastConnectAttemptAt = new Date().toISOString();
  lastError = null;

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (tickerInstance) {
    try {
      tickerInstance.disconnect();
    } catch {
      // no-op
    }
  }

  const ticker = new KiteTicker({
    api_key: apiKey,
    access_token: currentToken,
  });

  const originalAttemptReconnection = (ticker as any).attemptReconnection;
  (ticker as any).attemptReconnection = function patchedAttemptReconnection() {
    if (!this.auto_reconnect || this.should_reconnect === false) {
      console.log('[Stock Stream] Suppressed KiteTicker process.exit on disconnect.');
      return;
    }
    if (originalAttemptReconnection) originalAttemptReconnection.apply(this);
  };

  tickerInstance = ticker;
  attachTickerHandlers(ticker);
  ticker.connect();
  emitSnapshot();
}

export async function initializeStockStream(token: string, io: IoLike) {
  if (initializationPromise) {
    await initializationPromise;
  }

  initializationPromise = (async () => {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('KITE_API_KEY is not set.');
  }

  ioServer = io;
  await loadInstrumentMap();

  const isSameToken = token === currentToken;
  saveKiteToken(token);

  if (!kiteInstance || !isSameToken) {
    kiteInstance = new KiteConnect({ api_key: apiKey });
    kiteInstance.setAccessToken(token);
  }

  // Avoid creating duplicate Kite websocket sessions when the browser re-posts the same token.
  if (!tickerInstance || !isSameToken) {
    connectTicker();
  } else {
    await subscribeUniverse();
    emitSnapshot();
  }

  if (!syncIntervalStarted) {
    syncIntervalStarted = true;
    setInterval(async () => {
      try {
        await subscribeUniverse();
      } catch (error) {
        console.error('[Stock Stream] Failed to resync universe subscriptions', error);
      }
    }, 60_000);
  }
  })();

  try {
    await initializationPromise;
  } finally {
    initializationPromise = null;
  }
}

export async function forceResubscribeUniverse() {
  await subscribeUniverse();
  emitSnapshot();
  return getStockStreamSnapshot();
}

export async function reconnectStockStream() {
  if (!currentToken) {
    throw new Error('No saved Kite token available for reconnect.');
  }

  connectTicker();
  return getStockStreamSnapshot();
}
