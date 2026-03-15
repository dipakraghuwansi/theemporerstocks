import { NextRequest, NextResponse } from 'next/server';
import { getKiteInstance } from '@/lib/kiteHelper';

// Map common indices to their Kite instrument tokens
const INDEX_TOKENS: Record<string, string> = {
    'NIFTY': '256265',
    'NIFTY50': '256265',
    'BANKNIFTY': '260105',
    'SENSEX': '265'
};

export async function GET(request: NextRequest) {
    try {
        const url = new URL(request.url);
        const asset = url.searchParams.get('asset')?.toUpperCase() || 'NIFTY50';
        const token = request.cookies.get('kite_access_token')?.value;

        if (!token) {
            return NextResponse.json({ error: "Not authenticated with Kite" }, { status: 401 });
        }

        const instrumentToken = INDEX_TOKENS[asset];
        if (!instrumentToken) {
            return NextResponse.json({ error: `Instrument token mapping not found for ${asset}` }, { status: 400 });
        }

        const kite = getKiteInstance(token);

        const toDate = new Date();
        const fromDate = new Date();
        fromDate.setDate(toDate.getDate() - 45);

        let historicalData: any[] = [];
        try {
            const anyKite = kite as any;
            historicalData = await anyKite.getHistoricalData(instrumentToken, 'day', fromDate, toDate);
        } catch (e: any) {
            return NextResponse.json({ error: `Kite Historical API Error: ${e.message}` }, { status: 500 });
        }

        if (!historicalData || historicalData.length < 20) {
            return NextResponse.json({ error: "Insufficient historical data to calculate 20-day Z-Score" }, { status: 400 });
        }

        const last20Days = historicalData.slice(-20);
        const closingPrices = last20Days.map(d => d.close);
        const currentSpot = closingPrices[closingPrices.length - 1];

        const sum = closingPrices.reduce((a, b) => a + b, 0);
        const sma20 = sum / 20;

        const squaredDifferences = closingPrices.map(price => Math.pow(price - sma20, 2));
        const variance = squaredDifferences.reduce((a, b) => a + b, 0) / 20;
        const stdDev20 = Math.sqrt(variance);

        let zScore = 0;
        if (stdDev20 > 0) {
            zScore = (currentSpot - sma20) / stdDev20;
        }

        // Interpret Z-Score probability bands
        let interpretation = "Mean Channel";
        let sentimentColor = "text-slate-400";
        if (zScore > 2.0) {
            interpretation = "Euphoria Extreme (Strong Reversal Warning)";
            sentimentColor = "text-rose-400";
        } else if (zScore > 1.0) {
            interpretation = "Overbought (Trending Up)";
            sentimentColor = "text-orange-400";
        } else if (zScore < -2.0) {
            interpretation = "Panic Extreme (Strong Reversal Warning)";
            sentimentColor = "text-emerald-400";
        } else if (zScore < -1.0) {
            interpretation = "Oversold (Trending Down)";
            sentimentColor = "text-rose-400";
        }

        return NextResponse.json({
            asset,
            zScore: zScore.toFixed(2),
            currentSpot: currentSpot.toFixed(2),
            sma20: sma20.toFixed(2),
            stdDev20: stdDev20.toFixed(2),
            interpretation,
            sentimentColor,
            historicalPoints: closingPrices // For visual plotting
        });

    } catch (error: any) {
        console.error("Z-Score Engine Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
