import { NextRequest, NextResponse } from 'next/server';
import { getHistoricalCacheSummary } from '@/lib/historical/cache';
import { buildHistoricalDataset, getHistoricalFoundationStatus } from '@/lib/historical/foundation';
import { HistoricalBuildRequest, HistoricalInterval } from '@/lib/historical/types';

function toInterval(value: string | null): HistoricalInterval {
  switch (value) {
    case '60minute':
    case '30minute':
    case '15minute':
    case '5minute':
    case 'minute':
      return value;
    default:
      return 'day';
  }
}

export async function GET(request: NextRequest) {
  try {
    const interval = toInterval(request.nextUrl.searchParams.get('interval'));
    const manifest = getHistoricalFoundationStatus(interval);
    const cacheSummary = getHistoricalCacheSummary(interval);

    return NextResponse.json({
      success: true,
      interval,
      manifest,
      cacheSummary,
      notes: [
        'Historical dataset pulls are cache-first and only fetch missing or stale symbol ranges unless refresh=true.',
        'The fetch queue is paced to stay under Kite historical API rate limits.',
        'Use day candles first for swing, mean-reversion, and breakout outcome modeling before moving into minute-level intraday labels.',
      ],
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to load historical foundation status.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get('kite_access_token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Not authenticated with Kite', needsLogin: true }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const buildRequest: HistoricalBuildRequest = {
      token,
      interval: toInterval(body.interval || null),
      lookbackDays: Math.min(Math.max(Number(body.lookbackDays) || 180, 20), 365),
      refresh: Boolean(body.refresh),
      category: body.category === 'nifty50' || body.category === 'niftymidcap150' || body.category === 'manual' ? body.category : 'all',
      symbols: Array.isArray(body.symbols) ? body.symbols : undefined,
      maxSymbols: body.maxSymbols ? Math.min(Math.max(Number(body.maxSymbols), 1), 300) : undefined,
    };

    const result = await buildHistoricalDataset(buildRequest);

    return NextResponse.json({
      success: true,
      ...result,
      cacheSummary: getHistoricalCacheSummary(buildRequest.interval),
      notes: [
        'The builder uses one shared instruments fetch, then reads from local candle cache before making any Kite historical requests.',
        'Historical requests are serialized and paced to respect documented Kite rate limits and reduce the chance of 429 responses.',
        'If Kite returns a token/session exception, re-authentication is required before retrying the build.',
      ],
    });
  } catch (error: any) {
    const message = error.message || 'Failed to build historical research foundation.';
    const status = /login again/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message, needsLogin: status === 401 }, { status });
  }
}
