import { NextRequest, NextResponse } from 'next/server';
import { buildSingleOptionStructure } from '@/lib/optionsStructure/core';
import { getKiteInstance } from '@/lib/kiteHelper';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await context.params;
    const token = request.cookies.get('kite_access_token')?.value;

    if (!token) {
      return NextResponse.json({ needsLogin: true, error: 'Kite authentication required.' }, { status: 401 });
    }

    const kite = getKiteInstance(token);
    const instrument = `NSE:${symbol.toUpperCase()}`;
    const quotes = await kite.getQuote([instrument]);
    const spotPrice = Number(quotes[instrument]?.last_price || 0);

    if (!spotPrice) {
      return NextResponse.json({ error: `No live quote available for ${instrument}.` }, { status: 404 });
    }

    const summary = await buildSingleOptionStructure(kite, symbol.toUpperCase(), spotPrice);

    return NextResponse.json({
      success: true,
      symbol: symbol.toUpperCase(),
      instrument,
      spotPrice,
      summary,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to load stock option structure.' },
      { status: 500 }
    );
  }
}
