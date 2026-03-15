import { NextRequest, NextResponse } from 'next/server';
import { getKiteInstance } from '@/lib/kiteHelper';
import { SCREEN_LABELS, StockScreenType } from '@/lib/stockUniverse';
import {
  average,
  calculateAnchoredVwap,
  calculateAtr,
  calculatePercentChange,
  calculateRsi,
  calculateSma,
  highest,
  lowest,
} from '@/lib/stockIndicators';
import { getStockUniverse } from '@/lib/stockUniverseStore';

const NIFTY_50_TOKEN = 256265;
const DAY_MS = 24 * 60 * 60 * 1000;
const INSTRUMENTS_URL = 'https://api.kite.trade/instruments';

type InstrumentMeta = {
  instrumentToken: number;
  tradingsymbol: string;
  exchange: string;
  segment: string;
};

type ScreenResult = {
  symbol: string;
  instrument: string;
  sector: string;
  lastPrice: number;
  dayChangePct: number;
  gapPct: number;
  volume: number;
  avgVolume20: number | null;
  volumeExpansion: number | null;
  sma20: number | null;
  sma50: number | null;
  rsi14: number | null;
  atr14: number | null;
  vwap: number | null;
  relativeStrength20d: number | null;
  breakoutLevel: number | null;
  breakdownLevel: number | null;
  aboveVwap: boolean;
  deliveryDataAvailable: boolean;
  score: number;
  thesis: string;
};

type BaseUniverseMetrics = Omit<ScreenResult, 'score' | 'thesis'>;

let instrumentCache: Map<string, InstrumentMeta> | null = null;
let lastInstrumentFetch = 0;
let baseMetricsCache: BaseUniverseMetrics[] | null = null;
let baseMetricsCachedAt = 0;
const BASE_METRICS_CACHE_MS = 5 * 60 * 1000;

async function getInstrumentMap() {
  const now = Date.now();
  if (instrumentCache && now - lastInstrumentFetch < 12 * 60 * 60 * 1000) {
    return instrumentCache;
  }

  const response = await fetch(INSTRUMENTS_URL, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('Failed to fetch Kite instruments CSV');
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
    if (exchange !== 'NSE') continue;
    if (segment !== 'NSE') continue;

    nextMap.set(`NSE:${tradingsymbol}`, {
      instrumentToken,
      tradingsymbol,
      exchange,
      segment,
    });
  }

  instrumentCache = nextMap;
  lastInstrumentFetch = now;
  return nextMap;
}

function getISTDateTimeStrings() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const date = `${parts.find((p) => p.type === 'year')?.value}-${parts.find((p) => p.type === 'month')?.value}-${parts.find((p) => p.type === 'day')?.value}`;
  return {
    fromMinute: `${date} 09:15:00`,
    toMinute: `${date} 15:30:00`,
    today: date,
  };
}

function toScreenType(value: string | null): StockScreenType {
  if (value === 'swing-setups' || value === 'mean-reversion' || value === 'breakout-watchlist') {
    return value;
  }
  return 'intraday-momentum';
}

function computeSectorBreadth(results: Array<BaseUniverseMetrics | ScreenResult>) {
  const sectorMap = new Map<string, { total: number; advancing: number; aboveSma20: number }>();

  for (const result of results) {
    const existing = sectorMap.get(result.sector) || { total: 0, advancing: 0, aboveSma20: 0 };
    existing.total += 1;
    if (result.dayChangePct > 0) existing.advancing += 1;
    if (result.sma20 !== null && result.lastPrice > result.sma20) existing.aboveSma20 += 1;
    sectorMap.set(result.sector, existing);
  }

  return Array.from(sectorMap.entries()).map(([sector, stats]) => ({
    sector,
    breadthPct: Number(((stats.advancing / stats.total) * 100).toFixed(1)),
    aboveSma20Pct: Number(((stats.aboveSma20 / stats.total) * 100).toFixed(1)),
    members: stats.total,
  }));
}

function screenMatches(screen: StockScreenType, result: BaseUniverseMetrics) {
  switch (screen) {
    case 'intraday-momentum':
      return Boolean(
        result.aboveVwap &&
        result.dayChangePct > 0.8 &&
        (result.volumeExpansion || 0) >= 1.2 &&
        (result.relativeStrength20d || 0) > 0
      );
    case 'swing-setups':
      return Boolean(
        result.sma20 !== null &&
        result.sma50 !== null &&
        result.sma20 > result.sma50 &&
        result.lastPrice > result.sma20 &&
        (result.rsi14 || 0) >= 50 &&
        (result.rsi14 || 0) <= 68
      );
    case 'mean-reversion':
      return Boolean(
        result.sma20 !== null &&
        result.lastPrice < result.sma20 &&
        (result.rsi14 || 100) <= 42 &&
        result.gapPct < 0
      );
    case 'breakout-watchlist':
      return Boolean(
        result.breakoutLevel !== null &&
        result.lastPrice >= result.breakoutLevel * 0.985 &&
        (result.volumeExpansion || 0) >= 1.1
      );
  }
}

function computeScore(screen: StockScreenType, result: BaseUniverseMetrics) {
  const volumeBoost = result.volumeExpansion ? Math.min(result.volumeExpansion, 3) * 12 : 0;
  const rsBoost = result.relativeStrength20d ? Math.max(result.relativeStrength20d, 0) * 8 : 0;
  const momentumBoost = Math.max(result.dayChangePct, 0) * 10;
  const reversalBoost = Math.max((50 - (result.rsi14 || 50)) / 2, 0) * 4;
  const breakoutBoost =
    result.breakoutLevel && result.lastPrice > 0
      ? Math.max(0, 1 - Math.abs(result.breakoutLevel - result.lastPrice) / result.lastPrice) * 20
      : 0;

  switch (screen) {
    case 'intraday-momentum':
      return Number((momentumBoost + volumeBoost + rsBoost + (result.aboveVwap ? 15 : 0)).toFixed(1));
    case 'swing-setups':
      return Number((volumeBoost + rsBoost + breakoutBoost + ((result.rsi14 || 0) - 45)).toFixed(1));
    case 'mean-reversion':
      return Number((reversalBoost + Math.abs(Math.min(result.gapPct, 0)) * 6 + volumeBoost / 2).toFixed(1));
    case 'breakout-watchlist':
      return Number((breakoutBoost + volumeBoost + momentumBoost / 2 + rsBoost).toFixed(1));
  }
}

function buildThesis(screen: StockScreenType, result: BaseUniverseMetrics) {
  switch (screen) {
    case 'intraday-momentum':
      return `${result.symbol} is trading ${result.aboveVwap ? 'above' : 'below'} VWAP with ${formatNullable(
        result.volumeExpansion
      )}x volume expansion and ${result.dayChangePct.toFixed(2)}% day strength.`;
    case 'swing-setups':
      return `${result.symbol} is holding above its trend stack with RSI ${formatNullable(result.rsi14)} and a breakout trigger near ${formatNullable(
        result.breakoutLevel
      )}.`;
    case 'mean-reversion':
      return `${result.symbol} has pulled back ${formatNullable(result.gapPct)}% on the gap with RSI ${formatNullable(
        result.rsi14
      )}, putting it on a rebound watchlist.`;
    case 'breakout-watchlist':
      return `${result.symbol} is approaching a ${formatNullable(result.breakoutLevel)} breakout level with ${formatNullable(
        result.volumeExpansion
      )}x volume versus its 20-day average.`;
  }
}

function formatNullable(value: number | null) {
  return value === null ? 'n/a' : value.toFixed(2);
}

async function getBaseUniverseMetrics(kite: any, instrumentMap: Map<string, InstrumentMeta>) {
  const now = Date.now();
  if (baseMetricsCache && now - baseMetricsCachedAt < BASE_METRICS_CACHE_MS) {
    return baseMetricsCache;
  }

  const universe = getStockUniverse();
  const universeWithTokens = universe.map((item) => {
    const meta = instrumentMap.get(item.instrument);
    return meta ? { ...item, instrumentToken: meta.instrumentToken } : null;
  }).filter(Boolean) as Array<(typeof universe)[number] & { instrumentToken: number }>;

  const quotes = await kite.getQuote(universeWithTokens.map((item) => item.instrument));
  const { fromMinute, toMinute, today } = getISTDateTimeStrings();

  const todayDate = new Date(today);
  const fromDaily = new Date(todayDate.getTime() - 90 * DAY_MS).toISOString().split('T')[0];
  const benchmarkDaily = await kite.getHistoricalData(NIFTY_50_TOKEN, 'day', fromDaily, today, false);
  const benchmarkCloses = benchmarkDaily.map((candle: any) => candle.close);

  const stockResults = await Promise.all(
    universeWithTokens.map(async (item) => {
      const [dailyCandles, minuteCandles] = await Promise.all([
        kite.getHistoricalData(item.instrumentToken, 'day', fromDaily, today, false).catch(() => []),
        kite.getHistoricalData(item.instrumentToken, 'minute', fromMinute, toMinute, false).catch(() => []),
      ]);

      const quote = quotes[item.instrument];
      if (!quote || dailyCandles.length < 25) return null;

      const closes = dailyCandles.map((candle: any) => candle.close);
      const highs = dailyCandles.map((candle: any) => candle.high);
      const lows = dailyCandles.map((candle: any) => candle.low);
      const volumes = dailyCandles.map((candle: any) => candle.volume || 0);

      const previousClose = quote.ohlc?.close || closes[closes.length - 2];
      const open = quote.ohlc?.open || dailyCandles[dailyCandles.length - 1]?.open || previousClose;
      const lastPrice = quote.last_price;
      const volume = quote.volume || 0;

      const previous20Volumes = volumes.slice(-21, -1).filter((value: number) => value > 0);
      const previous20Highs = highs.slice(-21, -1);
      const previous20Lows = lows.slice(-21, -1);
      const benchmark20 = benchmarkCloses.slice(-21);
      const stock20 = closes.slice(-21);

      const avgVolume20 = average(previous20Volumes);
      const volumeExpansion = avgVolume20 && avgVolume20 > 0 ? volume / avgVolume20 : null;
      const sma20 = calculateSma(closes, 20);
      const sma50 = calculateSma(closes, 50);
      const rsi14 = calculateRsi(closes, 14);
      const atr14 = calculateAtr(dailyCandles, 14);
      const vwap = calculateAnchoredVwap(minuteCandles);
      const breakoutLevel = highest(previous20Highs);
      const breakdownLevel = lowest(previous20Lows);

      const benchmarkReturn20 =
        benchmark20.length >= 2 ? calculatePercentChange(benchmark20[benchmark20.length - 1], benchmark20[0]) : null;
      const stockReturn20 = stock20.length >= 2 ? calculatePercentChange(stock20[stock20.length - 1], stock20[0]) : null;
      const relativeStrength20d =
        benchmarkReturn20 !== null && stockReturn20 !== null ? stockReturn20 - benchmarkReturn20 : null;

      const baseResult: BaseUniverseMetrics = {
        symbol: item.symbol,
        instrument: item.instrument,
        sector: item.sector,
        lastPrice,
        dayChangePct: Number(calculatePercentChange(lastPrice, previousClose).toFixed(2)),
        gapPct: Number(calculatePercentChange(open, previousClose).toFixed(2)),
        volume,
        avgVolume20: avgVolume20 ? Number(avgVolume20.toFixed(0)) : null,
        volumeExpansion: volumeExpansion ? Number(volumeExpansion.toFixed(2)) : null,
        sma20: sma20 ? Number(sma20.toFixed(2)) : null,
        sma50: sma50 ? Number(sma50.toFixed(2)) : null,
        rsi14: rsi14 ? Number(rsi14.toFixed(2)) : null,
        atr14: atr14 ? Number(atr14.toFixed(2)) : null,
        vwap: vwap ? Number(vwap.toFixed(2)) : null,
        relativeStrength20d: relativeStrength20d ? Number(relativeStrength20d.toFixed(2)) : null,
        breakoutLevel: breakoutLevel ? Number(breakoutLevel.toFixed(2)) : null,
        breakdownLevel: breakdownLevel ? Number(breakdownLevel.toFixed(2)) : null,
        aboveVwap: vwap !== null ? lastPrice > vwap : false,
        deliveryDataAvailable: false,
      };

      return baseResult;
    })
  );

  baseMetricsCache = stockResults.filter((item): item is BaseUniverseMetrics => Boolean(item));
  baseMetricsCachedAt = now;
  return baseMetricsCache;
}

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('kite_access_token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Not authenticated with Kite', needsLogin: true }, { status: 401 });
    }

    const screen = toScreenType(request.nextUrl.searchParams.get('screen'));
    const kite = getKiteInstance(token) as any;
    const instrumentMap = await getInstrumentMap();
    const universe = getStockUniverse();
    const baseMetrics = await getBaseUniverseMetrics(kite, instrumentMap);
    const matches = baseMetrics
      .filter((item) => screenMatches(screen, item))
      .map((item) => ({
        ...item,
        score: computeScore(screen, item),
        thesis: buildThesis(screen, item),
      }))
      .sort((a, b) => b.score - a.score);

    return NextResponse.json({
      success: true,
      screen,
      screenLabel: SCREEN_LABELS[screen],
      universeSize: universe.length,
      matched: matches.length,
      benchmark: 'NIFTY 50',
      notes: [
        'Historical indicators are cached for 5 minutes to reduce repeated Kite historical API load.',
        'VWAP is derived from intraday minute candles inside that cached analytics layer.',
        'Live quote, day change, volume, and volume expansion are then updated from the websocket stream in the UI.',
        'Delivery expansion is not available from the current Kite data path, so it is marked unavailable.',
        'Sector breadth is computed from the curated stock universe used by this screener.',
      ],
      sectorBreadth: computeSectorBreadth(matches),
      results: matches,
    });
  } catch (error: any) {
    console.error('Stock screener API error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to run stock screener.' },
      { status: 500 }
    );
  }
}
