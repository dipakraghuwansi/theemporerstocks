import { KiteConnect, KiteTicker } from 'kiteconnect';
import fs from 'fs';
import path from 'path';
import { persistMinuteMicrostructureBuckets, MinuteMicrostructureBucket } from '@/lib/microstructureCache';
import { getStockUniverse } from '@/lib/stockUniverseStore';

const TOKEN_FILE = path.join(process.cwd(), '.kite_token');
const INSTRUMENTS_URL = 'https://api.kite.trade/instruments';
const OFI_WINDOW_SIZE = 12;
const VPIN_WINDOW_SIZE = 24;
const VOLUME_BUCKET_TARGET_SAMPLES = 40;
const MICROSTRUCTURE_PERSIST_BATCH = 20;
const BASE_VPIN_BUCKET_MULTIPLIER = 12;

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
  bestBidPrice: number | null;
  bestBidQuantity: number | null;
  bestAskPrice: number | null;
  bestAskQuantity: number | null;
  microprice: number | null;
  micropriceEdgePct: number | null;
  orderFlowImbalance: number | null;
  rollingOfi: number | null;
  vpin: number | null;
  tradePressureScore: number | null;
  timestamp: string;
};

type BookState = {
  bestBidPrice: number | null;
  bestBidQuantity: number | null;
  bestAskPrice: number | null;
  bestAskQuantity: number | null;
};

type TradeState = {
  lastPrice: number | null;
  volume: number;
};

type FlowBucket = {
  signedVolume: number;
  totalVolume: number;
};

type VpinInProgressBucket = {
  targetVolume: number;
  signedVolume: number;
  totalVolume: number;
};

type MinuteAccumulator = {
  minute: string;
  instrument: string;
  symbol: string;
  micropriceEdgeSum: number;
  micropriceEdgeCount: number;
  ofiSum: number;
  ofiCount: number;
  rollingOfiSum: number;
  rollingOfiCount: number;
  vpinSum: number;
  vpinCount: number;
  tradePressureSum: number;
  tradePressureCount: number;
  depthSampleCount: number;
  sampleCount: number;
};

type KiteDepthLevel = {
  price?: number;
  quantity?: number;
};

type KiteTick = {
  instrument_token: number;
  last_price: number;
  volume_traded?: number;
  ohlc?: {
    open?: number;
    high?: number;
    low?: number;
    close?: number;
  };
  depth?: {
    buy?: KiteDepthLevel[];
    sell?: KiteDepthLevel[];
  };
};

type ReconnectableTicker = KiteTicker & {
  attemptReconnection?: () => void;
  auto_reconnect?: boolean;
  should_reconnect?: boolean;
};

let kiteInstance: KiteConnect | null = null;
let tickerInstance: KiteTicker | null = null;
let currentToken = '';
let ioServer: IoLike | null = null;
let instrumentMap = new Map<string, InstrumentMeta>();
let subscribedTokens: number[] = [];
let latestQuotes = new Map<string, StreamQuote>();
let lastSnapshotAt: string | null = null;
let lastTickAt: string | null = null;
let currentUniverseSize = 0;
let reconnectTimer: NodeJS.Timeout | null = null;
let syncIntervalStarted = false;
let tickerConnected = false;
let initializationPromise: Promise<void> | null = null;
let lastUniverseSyncAt: string | null = null;
let lastConnectAttemptAt: string | null = null;
let lastError: string | null = null;
let previousBookState = new Map<string, BookState>();
let ofiHistory = new Map<string, number[]>();
let previousTradeState = new Map<string, TradeState>();
let vpinHistory = new Map<string, FlowBucket[]>();
let currentVpinBucket = new Map<string, VpinInProgressBucket>();
let recentVolumeDeltas = new Map<string, number[]>();
let minuteAccumulators = new Map<string, MinuteAccumulator>();
let pendingMinuteBuckets: MinuteMicrostructureBucket[] = [];
const averageIntradayVolumeDelta = new Map<string, number>();

function sameTokenSet(left: number[], right: number[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function getDepthMetrics(tick: KiteTick) {
  const bestBid = tick.depth?.buy?.[0];
  const bestAsk = tick.depth?.sell?.[0];

  if (!bestBid || !bestAsk) {
    return {
      bestBidPrice: null,
      bestBidQuantity: null,
      bestAskPrice: null,
      bestAskQuantity: null,
      microprice: null,
    };
  }

  const bidPrice = Number(bestBid.price || 0);
  const bidQuantity = Number(bestBid.quantity || 0);
  const askPrice = Number(bestAsk.price || 0);
  const askQuantity = Number(bestAsk.quantity || 0);
  const denominator = bidQuantity + askQuantity;

  return {
    bestBidPrice: bidPrice || null,
    bestBidQuantity: bidQuantity || null,
    bestAskPrice: askPrice || null,
    bestAskQuantity: askQuantity || null,
    microprice:
      bidPrice > 0 && askPrice > 0 && denominator > 0
        ? Number((((askPrice * bidQuantity) + (bidPrice * askQuantity)) / denominator).toFixed(2))
        : null,
  };
}

function getOrderFlowImbalance(previous: BookState | null, current: BookState) {
  if (
    !previous ||
    current.bestBidPrice === null ||
    current.bestBidQuantity === null ||
    current.bestAskPrice === null ||
    current.bestAskQuantity === null ||
    previous.bestBidPrice === null ||
    previous.bestBidQuantity === null ||
    previous.bestAskPrice === null ||
    previous.bestAskQuantity === null
  ) {
    return null;
  }

  const bidContribution =
    (current.bestBidPrice >= previous.bestBidPrice ? current.bestBidQuantity : 0) -
    (current.bestBidPrice <= previous.bestBidPrice ? previous.bestBidQuantity : 0);
  const askContribution =
    (current.bestAskPrice <= previous.bestAskPrice ? current.bestAskQuantity : 0) -
    (current.bestAskPrice >= previous.bestAskPrice ? previous.bestAskQuantity : 0);

  return bidContribution - askContribution;
}

function getApiKey() {
  return process.env.KITE_API_KEY || '';
}

function getMinuteKey(timestamp: string) {
  return timestamp.slice(0, 16);
}

function getSessionPhase(timestamp: string) {
  const date = new Date(timestamp);
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const totalMinutes = hours * 60 + minutes;
  const openMinutes = 9 * 60 + 15;
  const closeMinutes = 15 * 60 + 30;

  if (totalMinutes < openMinutes || totalMinutes > closeMinutes) return 'offhours';
  if (totalMinutes <= openMinutes + 45) return 'open';
  if (totalMinutes >= closeMinutes - 45) return 'close';
  return 'mid';
}

function getSessionPhaseMultiplier(phase: ReturnType<typeof getSessionPhase>) {
  switch (phase) {
    case 'open':
      return 1.35;
    case 'close':
      return 1.15;
    case 'mid':
      return 0.9;
    default:
      return 1;
  }
}

function getLiquidityProfileMultiplier(avgVolumeDelta: number) {
  if (avgVolumeDelta >= 50000) return 1.4;
  if (avgVolumeDelta >= 10000) return 1.2;
  if (avgVolumeDelta >= 2500) return 1;
  if (avgVolumeDelta >= 500) return 0.85;
  return 0.7;
}

function getAdaptiveVpinBucketTarget(instrument: string, timestamp: string, fallbackAverage: number) {
  const avgDelta = averageIntradayVolumeDelta.get(instrument) || fallbackAverage || 1;
  const phaseMultiplier = getSessionPhaseMultiplier(getSessionPhase(timestamp));
  const liquidityMultiplier = getLiquidityProfileMultiplier(avgDelta);
  return Math.max(
    Math.round(avgDelta * BASE_VPIN_BUCKET_MULTIPLIER * phaseMultiplier * liquidityMultiplier),
    1
  );
}

function flushMinuteAccumulator(instrument: string) {
  const accumulator = minuteAccumulators.get(instrument);
  if (!accumulator || accumulator.sampleCount === 0) return;

  pendingMinuteBuckets.push({
    symbol: accumulator.symbol,
    instrument: accumulator.instrument,
    minute: accumulator.minute,
    averageMicropriceEdgePct:
      accumulator.micropriceEdgeCount > 0
        ? Number((accumulator.micropriceEdgeSum / accumulator.micropriceEdgeCount).toFixed(4))
        : null,
    averageOrderFlowImbalance:
      accumulator.ofiCount > 0 ? Number((accumulator.ofiSum / accumulator.ofiCount).toFixed(2)) : null,
    averageRollingOfi:
      accumulator.rollingOfiCount > 0
        ? Number((accumulator.rollingOfiSum / accumulator.rollingOfiCount).toFixed(2))
        : null,
    averageVpin:
      accumulator.vpinCount > 0 ? Number((accumulator.vpinSum / accumulator.vpinCount).toFixed(3)) : null,
    averageTradePressureScore:
      accumulator.tradePressureCount > 0
        ? Number((accumulator.tradePressureSum / accumulator.tradePressureCount).toFixed(3))
        : null,
    depthSampleCount: accumulator.depthSampleCount,
    tradePressureCount: accumulator.tradePressureCount,
    sampleCount: accumulator.sampleCount,
  });

  if (pendingMinuteBuckets.length >= MICROSTRUCTURE_PERSIST_BATCH) {
    persistMinuteMicrostructureBuckets(pendingMinuteBuckets);
    pendingMinuteBuckets = [];
  }
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
    lastTickAt,
    quotes,
  });
}

export function getStockStreamSnapshot() {
  return {
    connected: tickerConnected,
    universeSize: currentUniverseSize,
    subscribed: subscribedTokens.length,
    lastSnapshotAt,
    lastTickAt,
    lastUniverseSyncAt,
    lastConnectAttemptAt,
    lastError,
    quotes: Array.from(latestQuotes.values()).sort((a, b) => a.symbol.localeCompare(b.symbol)),
  };
}

async function subscribeUniverse(options: { force?: boolean } = {}) {
  if (!tickerInstance) return;
  await loadInstrumentMap();

  const universeTokens = getUniverseTokens();
  const nextTokens = universeTokens.map((item) => item.instrumentToken);
  const shouldResetSubscriptions = options.force || !sameTokenSet(subscribedTokens, nextTokens);

  if (!shouldResetSubscriptions) {
    lastUniverseSyncAt = new Date().toISOString();
    emitSnapshot();
    return;
  }

  if (subscribedTokens.length > 0) {
    try {
      tickerInstance.unsubscribe(subscribedTokens);
    } catch (error) {
      console.error('[Stock Stream] Failed to unsubscribe previous tokens', error);
    }
  }

  subscribedTokens = nextTokens;
  const allowedInstruments = new Set(universeTokens.map((item) => item.instrument));
  latestQuotes = new Map(
    Array.from(latestQuotes.entries()).filter(([instrument]) => allowedInstruments.has(instrument))
  );
  previousBookState = new Map(
    Array.from(previousBookState.entries()).filter(([instrument]) => allowedInstruments.has(instrument))
  );
  ofiHistory = new Map(
    Array.from(ofiHistory.entries()).filter(([instrument]) => allowedInstruments.has(instrument))
  );
  previousTradeState = new Map(
    Array.from(previousTradeState.entries()).filter(([instrument]) => allowedInstruments.has(instrument))
  );
  vpinHistory = new Map(
    Array.from(vpinHistory.entries()).filter(([instrument]) => allowedInstruments.has(instrument))
  );
  currentVpinBucket = new Map(
    Array.from(currentVpinBucket.entries()).filter(([instrument]) => allowedInstruments.has(instrument))
  );
  recentVolumeDeltas = new Map(
    Array.from(recentVolumeDeltas.entries()).filter(([instrument]) => allowedInstruments.has(instrument))
  );
  minuteAccumulators = new Map(
    Array.from(minuteAccumulators.entries()).filter(([instrument]) => allowedInstruments.has(instrument))
  );
  lastUniverseSyncAt = new Date().toISOString();

  if (nextTokens.length === 0) {
    emitSnapshot();
    return;
  }

  tickerInstance.subscribe(nextTokens);
  tickerInstance.setMode(tickerInstance.modeFull, nextTokens);

  console.log(`[Stock Stream] Subscribed to ${nextTokens.length} universe instruments.`);
  emitSnapshot();
}

function attachTickerHandlers(ticker: KiteTicker) {
  ticker.on('ticks', (ticks: KiteTick[]) => {
    const now = new Date().toISOString();

    for (const tick of ticks) {
      const instrumentToken = tick.instrument_token;
      const meta = Array.from(instrumentMap.values()).find((item) => item.instrumentToken === instrumentToken);
      if (!meta) continue;

      const close = tick.ohlc?.close ?? null;
      const lastPrice = tick.last_price;
      const change = close ? ((lastPrice - close) / close) * 100 : null;
      const depth = getDepthMetrics(tick);
      const previous = previousBookState.get(meta.instrument) || null;
      const currentBook = {
        bestBidPrice: depth.bestBidPrice,
        bestBidQuantity: depth.bestBidQuantity,
        bestAskPrice: depth.bestAskPrice,
        bestAskQuantity: depth.bestAskQuantity,
      };
      const orderFlowImbalance = getOrderFlowImbalance(previous, currentBook);
      previousBookState.set(meta.instrument, currentBook);
      const nextOfiHistory = ofiHistory.get(meta.instrument) || [];
      if (orderFlowImbalance !== null) {
        nextOfiHistory.push(orderFlowImbalance);
      }
      while (nextOfiHistory.length > OFI_WINDOW_SIZE) {
        nextOfiHistory.shift();
      }
      ofiHistory.set(meta.instrument, nextOfiHistory);
      const mid =
        depth.bestBidPrice !== null && depth.bestAskPrice !== null
          ? (depth.bestBidPrice + depth.bestAskPrice) / 2
          : null;
      const micropriceEdgePct =
        depth.microprice !== null && mid && mid > 0 ? Number((((depth.microprice - mid) / mid) * 100).toFixed(3)) : null;
      const rollingOfi =
        nextOfiHistory.length > 0
          ? nextOfiHistory.reduce((sum, value) => sum + value, 0)
          : null;
      const previousTrade = previousTradeState.get(meta.instrument) || { lastPrice: null, volume: 0 };
      const volumeDelta = Math.max(0, Number((tick.volume_traded || 0) - previousTrade.volume));
      const direction =
        previousTrade.lastPrice === null
          ? 0
          : lastPrice > previousTrade.lastPrice
            ? 1
            : lastPrice < previousTrade.lastPrice
              ? -1
              : orderFlowImbalance !== null
                ? Math.sign(orderFlowImbalance)
                : 0;
      const nextVolumeDeltas = recentVolumeDeltas.get(meta.instrument) || [];
      if (volumeDelta > 0) {
        nextVolumeDeltas.push(volumeDelta);
      }
      while (nextVolumeDeltas.length > VOLUME_BUCKET_TARGET_SAMPLES) {
        nextVolumeDeltas.shift();
      }
      recentVolumeDeltas.set(meta.instrument, nextVolumeDeltas);
      const trailingAverageDelta =
        nextVolumeDeltas.length > 0
          ? nextVolumeDeltas.reduce((sum, value) => sum + value, 0) / nextVolumeDeltas.length
          : 1;
      averageIntradayVolumeDelta.set(meta.instrument, trailingAverageDelta);
      const tradePressureScore =
        direction !== 0 && volumeDelta > 0
          ? Number((direction * Math.log1p(volumeDelta / Math.max(trailingAverageDelta, 1))).toFixed(3))
          : null;
      const bucketTarget = getAdaptiveVpinBucketTarget(meta.instrument, now, trailingAverageDelta);
      const nextVpinHistory = vpinHistory.get(meta.instrument) || [];
      let activeBucket = currentVpinBucket.get(meta.instrument) || {
        targetVolume: bucketTarget,
        signedVolume: 0,
        totalVolume: 0,
      };
      let remainingVolume = volumeDelta;

      while (remainingVolume > 0) {
        const room = Math.max(activeBucket.targetVolume - activeBucket.totalVolume, 0);
        const fill = Math.min(room || activeBucket.targetVolume, remainingVolume);
        activeBucket.totalVolume += fill;
        activeBucket.signedVolume += fill * direction;
        remainingVolume -= fill;

        if (activeBucket.totalVolume >= activeBucket.targetVolume) {
          nextVpinHistory.push({
            signedVolume: activeBucket.signedVolume,
            totalVolume: activeBucket.totalVolume,
          });
          while (nextVpinHistory.length > VPIN_WINDOW_SIZE) {
            nextVpinHistory.shift();
          }
          activeBucket = {
            targetVolume: bucketTarget,
            signedVolume: 0,
            totalVolume: 0,
          };
        }
      }

      currentVpinBucket.set(meta.instrument, activeBucket);
      vpinHistory.set(meta.instrument, nextVpinHistory);
      previousTradeState.set(meta.instrument, {
        lastPrice,
        volume: tick.volume_traded || 0,
      });
      const totalBucketVolume = nextVpinHistory.reduce((sum, item) => sum + item.totalVolume, 0);
      const totalSignedImbalance = nextVpinHistory.reduce((sum, item) => sum + Math.abs(item.signedVolume), 0);
      const vpin =
        totalBucketVolume > 0 ? Number((totalSignedImbalance / totalBucketVolume).toFixed(3)) : null;
      const minuteKey = getMinuteKey(now);
      const existingAccumulator = minuteAccumulators.get(meta.instrument);
      if (existingAccumulator && existingAccumulator.minute !== minuteKey) {
        flushMinuteAccumulator(meta.instrument);
        minuteAccumulators.delete(meta.instrument);
      }
      const accumulator = minuteAccumulators.get(meta.instrument) || {
        minute: minuteKey,
        instrument: meta.instrument,
        symbol: meta.symbol,
        micropriceEdgeSum: 0,
        micropriceEdgeCount: 0,
        ofiSum: 0,
        ofiCount: 0,
        rollingOfiSum: 0,
        rollingOfiCount: 0,
        vpinSum: 0,
        vpinCount: 0,
        tradePressureSum: 0,
        tradePressureCount: 0,
        depthSampleCount: 0,
        sampleCount: 0,
      };
      if (depth.bestBidPrice !== null && depth.bestAskPrice !== null) {
        accumulator.depthSampleCount += 1;
      }
      if (micropriceEdgePct !== null) {
        accumulator.micropriceEdgeSum += micropriceEdgePct;
        accumulator.micropriceEdgeCount += 1;
      }
      if (orderFlowImbalance !== null) {
        accumulator.ofiSum += orderFlowImbalance;
        accumulator.ofiCount += 1;
      }
      if (rollingOfi !== null) {
        accumulator.rollingOfiSum += rollingOfi;
        accumulator.rollingOfiCount += 1;
      }
      if (vpin !== null) {
        accumulator.vpinSum += vpin;
        accumulator.vpinCount += 1;
      }
      if (tradePressureScore !== null) {
        accumulator.tradePressureSum += tradePressureScore;
        accumulator.tradePressureCount += 1;
      }
      accumulator.sampleCount += 1;
      minuteAccumulators.set(meta.instrument, accumulator);

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
        bestBidPrice: depth.bestBidPrice,
        bestBidQuantity: depth.bestBidQuantity,
        bestAskPrice: depth.bestAskPrice,
        bestAskQuantity: depth.bestAskQuantity,
        microprice: depth.microprice,
        micropriceEdgePct,
        orderFlowImbalance,
        rollingOfi,
        vpin,
        tradePressureScore,
        timestamp: now,
      });
    }

    lastTickAt = now;
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
    for (const instrument of minuteAccumulators.keys()) {
      flushMinuteAccumulator(instrument);
    }
    if (pendingMinuteBuckets.length > 0) {
      persistMinuteMicrostructureBuckets(pendingMinuteBuckets);
      pendingMinuteBuckets = [];
    }
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

  const reconnectableTicker = ticker as ReconnectableTicker;
  const originalAttemptReconnection = reconnectableTicker.attemptReconnection;
  reconnectableTicker.attemptReconnection = function patchedAttemptReconnection() {
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
  await subscribeUniverse({ force: true });
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
