import { NextRequest, NextResponse } from 'next/server';
import { getPaperTrades, updatePaperTradePrices } from '@/lib/paperStore';
import { getKiteInstance } from '@/lib/kiteHelper';

export const dynamic = 'force-dynamic';

type QuoteKiteClient = {
  getQuote: (instruments: string[]) => Promise<Record<string, { last_price: number }>>;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error';
}

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('kite_access_token')?.value;
    if (!token) return NextResponse.json({ error: 'Missing Kite Token' }, { status: 401 });

    const nowStr = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
    const nowArray = nowStr.split(', ');
    const timeArray = nowArray[1].split(':');

    let hours = parseInt(timeArray[0]);
    const mins = parseInt(timeArray[1]);
    const isPm = nowArray[1].includes('PM');

    if (isPm && hours !== 12) {
      hours += 12;
    } else if (!isPm && hours === 12) {
      hours = 0;
    }

    const currentInt = hours * 100 + mins;
    const dateObj = new Date(nowStr);
    const dayOfWeek = dateObj.getDay();

    if (dayOfWeek === 0 || dayOfWeek === 6 || currentInt < 800 || currentInt > 1600) {
      return NextResponse.json(
        {
          status: 'skipped',
          message: 'Market is closed (Outside 8:00 AM - 4:00 PM IST or Weekend)',
        },
        { status: 200 }
      );
    }

    const trades = (await getPaperTrades()).filter((trade) => trade.status === 'OPEN');
    if (trades.length === 0) {
      return NextResponse.json({ message: 'No open paper trades to settle' });
    }

    const uniqueInstruments = [...new Set(trades.map((trade) => trade.assetName))];
    const kite = getKiteInstance(token) as QuoteKiteClient;
    const quotes = await kite.getQuote(uniqueInstruments);

    const updates: Record<string, number> = {};
    for (const [symbol, data] of Object.entries(quotes)) {
      updates[symbol] = data.last_price;
    }

    await updatePaperTradePrices(updates);

    return NextResponse.json({ message: 'Paper trades settled', updatedPrices: updates });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
