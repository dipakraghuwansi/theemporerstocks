import { NextRequest, NextResponse } from 'next/server';
import { getPaperTrades, updatePaperTradePrices } from '@/lib/paperStore';
import { getKiteInstance } from '@/lib/kiteHelper';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const token = request.cookies.get('kite_access_token')?.value;
        if (!token) return NextResponse.json({ error: 'Missing Kite Token' }, { status: 401 });

        const nowStr = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
        const nowArray = nowStr.split(', ');
        const timeArray = nowArray[1].split(':');

        let hours = parseInt(timeArray[0]);
        const mins = parseInt(timeArray[1]);
        const isPM = nowArray[1].includes('PM');

        if (isPM && hours !== 12) {
            hours += 12;
        } else if (!isPM && hours === 12) {
            hours = 0;
        }

        const currentInt = hours * 100 + mins;
        const dateObj = new Date(nowStr);
        const dayOfWeek = dateObj.getDay();

        // Block Weekends and Outside 8:00 AM - 4:00 PM IST
        if (dayOfWeek === 0 || dayOfWeek === 6 || currentInt < 800 || currentInt > 1600) {
            return NextResponse.json({
                status: 'skipped',
                message: 'Market is closed (Outside 8:00 AM - 4:00 PM IST or Weekend)'
            }, { status: 200 });
        }

        const trades = getPaperTrades().filter(t => t.status === 'OPEN');
        if (trades.length === 0) {
            return NextResponse.json({ message: 'No open paper trades to settle' });
        }

        // We need exactly 'NFO:NIFTY...' native formats for Kite Quote API
        const instrumentsToQuote = trades.map(t => t.assetName);
        // Deduplicate
        const uniqueInstruments = [...new Set(instrumentsToQuote)];

        const kite = getKiteInstance(token);

        // Fetch live quotes for the exact options contracts
        const quotes = await (kite as any).getQuote(uniqueInstruments);

        const updates: Record<string, number> = {};
        for (const [symbol, data] of Object.entries(quotes)) {
            updates[symbol] = (data as any).last_price;
        }

        // Update memory
        updatePaperTradePrices(updates);

        return NextResponse.json({ message: 'Paper trades settled', updatedPrices: updates });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
