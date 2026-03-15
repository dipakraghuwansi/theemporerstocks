import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getKiteInstance } from '@/lib/kiteHelper';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const instrument = searchParams.get('instrument'); // e.g. "NFO:NIFTY24OCT25600PE"

    if (!instrument) {
        return NextResponse.json({ error: 'Instrument is required' }, { status: 400 });
    }

    const cookieStore = await cookies();
    const accessToken = cookieStore.get('kite_access_token')?.value;

    if (!accessToken) {
        return NextResponse.json({
            error: 'Not authenticated with Kite. Please login.',
            needsLogin: true
        }, { status: 401 });
    }

    try {
        const kite = getKiteInstance(accessToken);
        const quotes = await kite.getQuote([instrument]);
        const instrumentData = quotes[instrument];

        if (!instrumentData) {
            return NextResponse.json({
                error: `Instrument '${instrument}' not found. Please verify the exchange prefix and trading symbol (e.g. NFO:NIFTY24OCT25600PE).`
            }, { status: 400 });
        }

        return NextResponse.json({
            success: true,
            instrument,
            data: {
                last_price: instrumentData.last_price,
                volume: instrumentData.volume,
                open: instrumentData.ohlc.open,
                high: instrumentData.ohlc.high,
                low: instrumentData.ohlc.low,
                close: instrumentData.ohlc.close
            }
        });
    } catch (error: any) {
        console.error("Kite Quote Error:", error);
        return NextResponse.json(
            { error: 'Failed to fetch quote from Kite.', details: error.message },
            { status: 500 }
        );
    }
}
