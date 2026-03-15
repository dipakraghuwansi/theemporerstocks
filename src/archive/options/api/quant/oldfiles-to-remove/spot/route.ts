import { NextRequest, NextResponse } from 'next/server';
import { getKiteInstance } from '@/lib/kiteHelper';

export async function GET(request: NextRequest) {
    try {
        const url = new URL(request.url);
        const asset = url.searchParams.get('asset') || 'NIFTY 50'; // Default to Nifty 50

        const token = request.cookies.get('kite_access_token')?.value;

        if (!token) {
            return NextResponse.json({ error: "Not authenticated with Kite" }, { status: 401 });
        }

        const kite = getKiteInstance(token);

        let tradingSymbol = 'NSE:NIFTY 50';
        if (asset === 'BANKNIFTY') {
            tradingSymbol = 'NSE:NIFTY BANK';
        } else if (asset === 'FINNIFTY') {
            tradingSymbol = 'NSE:NIFTY FIN SERVICE';
        } else if (asset === 'INDIA_VIX') {
            tradingSymbol = 'NSE:INDIA VIX';
        }

        // Fetch Live Quotes from Kite
        let quotes: any = {};
        try {
            quotes = await kite.getQuote([tradingSymbol]);
        } catch (e: any) {
            console.error("Kite Quote API Error for Spot Price:", e);
            throw new Error(`Kite Quote error: ${e.message}`);
        }

        const quoteData = quotes[tradingSymbol];
        if (!quoteData || !quoteData.last_price) {
            return NextResponse.json({ error: "Could not retrieve last price for " + tradingSymbol }, { status: 404 });
        }

        return NextResponse.json({
            asset: asset,
            symbol: tradingSymbol,
            spot: quoteData.last_price,
            timestamp: quoteData.timestamp || new Date().toISOString()
        });

    } catch (error: any) {
        console.error("Spot Price Engine Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
