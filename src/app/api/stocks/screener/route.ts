import { NextRequest, NextResponse } from 'next/server';
import { SCREEN_LABELS, StockScreenType } from '@/lib/stockUniverse';
import { computeSectorBreadth, loadScreenerRuntime, scoreScreen } from '@/lib/screener/runtime';

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error';
}

function toScreenType(value: string | null): StockScreenType {
  if (value === 'swing-setups' || value === 'mean-reversion' || value === 'breakout-watchlist') {
    return value;
  }
  return 'intraday-momentum';
}

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('kite_access_token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Not authenticated with Kite', needsLogin: true }, { status: 401 });
    }

    const screen = toScreenType(request.nextUrl.searchParams.get('screen'));
    const runtime = await loadScreenerRuntime(token);
    const scoredScreen = await scoreScreen(runtime, screen);

    return NextResponse.json({
      success: true,
      screen,
      screenLabel: SCREEN_LABELS[screen],
      universeSize: runtime.universe.length,
      matched: scoredScreen.results.length,
      benchmark: 'NIFTY 50',
      scorePayload: scoredScreen.scorePayload,
      notes: [
        'Historical indicators are cached for 5 minutes to reduce repeated Kite historical API load.',
        'The screener now reads day and minute indicator inputs from local historical_cache data instead of fanning out to Kite historical APIs on every load.',
        'VWAP is derived from cached intraday minute candles when they exist; otherwise it stays unavailable.',
        'Live quote, day change, volume, and volume expansion are then updated from the websocket stream in the UI.',
        'Scores are now normalized cross-sectionally and use ATR-adjusted move/proximity factors.',
        'Sector breadth overlay is applied on top of stock-level scores using breadth, breadth delta, above-SMA20 participation, and average day change.',
        'A market regime layer now boosts or suppresses screens based on benchmark trend and broad market participation.',
        'A lightweight HMM-style filter now smooths regime classification across recent benchmark moves before the current breadth state is applied.',
        'Option structure overlay is built only for matched names, then batched into one quote request to reduce Kite load while adding gamma/OI and futures buildup context.',
        'Factor basket alpha now blends beta-adjusted benchmark residuals, sector/category baselines, and volatility-adjusted return context to isolate stock-specific strength.',
        'Overlay aggressiveness is lightly calibrated from historical screen performance so newer microstructure and derivatives signals do not dominate by default.',
        'Delivery expansion is not available from the current Kite data path, so it is marked unavailable.',
        'Sector breadth is computed from the curated stock universe used by this screener.',
      ],
      sectorBreadth: computeSectorBreadth(scoredScreen.results),
      results: scoredScreen.results,
    });
  } catch (error: unknown) {
    console.error('Stock screener API error:', error);
    return NextResponse.json(
      { error: getErrorMessage(error) || 'Failed to run stock screener.' },
      { status: 500 }
    );
  }
}
