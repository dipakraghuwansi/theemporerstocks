import { NextRequest, NextResponse } from 'next/server';
import { getKiteInstance } from '@/lib/kiteHelper';

// instrument token for India VIX
const INDIA_VIX_TOKEN = '264969';

export async function GET(request: NextRequest) {
    try {
        const token = request.cookies.get('kite_access_token')?.value;

        if (!token) {
            return NextResponse.json({ error: "Not authenticated with Kite" }, { status: 401 });
        }

        const kite = getKiteInstance(token);

        // Fetch Historical Data for 1 Full Year
        const toDate = new Date();
        const fromDate = new Date();
        fromDate.setFullYear(toDate.getFullYear() - 1); // 365 days back

        let historicalData: any[] = [];
        try {
            const anyKite = kite as any;
            historicalData = await anyKite.getHistoricalData(INDIA_VIX_TOKEN, 'day', fromDate, toDate);
        } catch (e: any) {
            return NextResponse.json({ error: `Kite Historical API Error for INDIA VIX: ${e.message}` }, { status: 500 });
        }

        if (!historicalData || historicalData.length < 50) {
            return NextResponse.json({ error: "Insufficient historical data to calculate IV Rank (requires at least 1 year of VIX data)" }, { status: 400 });
        }

        // Extract closing values (implied volatility percentages)
        const closingVix = historicalData.map(d => d.close);

        // Final LTP
        const currentIV = closingVix[closingVix.length - 1];

        // 1. Calculate IV Rank (IVR)
        // IVR = (Current - Low) / (High - Low) * 100
        const highIV = Math.max(...closingVix);
        const lowIV = Math.min(...closingVix);

        const rawIvRank = ((currentIV - lowIV) / (highIV - lowIV)) * 100;
        const ivRank = Math.max(0, Math.min(100, rawIvRank)); // Clamp between 0-100

        // 2. Calculate IV Percentile (IVP)
        // IVP = (Days where historical IV was lower than current IV) / (Total Days) * 100
        let daysLower = 0;
        for (const vix of closingVix) {
            if (vix < currentIV) {
                daysLower++;
            }
        }
        const ivPercentile = (daysLower / closingVix.length) * 100;

        // Interpretations
        // IV Rank < 20 = Volatility is Cheap (Good for buying options)
        // IV Rank > 50 = Volatility is Expensive (Good for selling options)
        let interpretation = "Neutral Volatility Regime";
        let sentimentColor = "text-slate-400";
        let actionBias = "Directional Plays (Debit Spreads)";
        let biasExplanation = "Implied Volatility is near its historical average. Focus on structure and direction rather than solely isolating options premium.";

        if (ivRank > 80) {
            interpretation = "Extreme Volatility Expansion";
            sentimentColor = "text-rose-400";
            actionBias = "Aggressive Premium Selling (Iron Condors / Naked Shorts)";
            biasExplanation = "Volatility has spiked into the literal top 20% of its 52-week distribution. Options are incredibly expensive. Sell premium to exploit the inevitable Mean Reversion crush.";
        } else if (ivRank > 50) {
            interpretation = "Elevated Volatility (Expensive Puts/Calls)";
            sentimentColor = "text-orange-400";
            actionBias = "Premium Selling (Credit Spreads)";
            biasExplanation = "Volatility is currently running hotter than average. Options premiums are historically rich. Writing Credit Spreads allows you to collect this outsized extrinsic value safely.";
        } else if (ivRank < 20) {
            interpretation = "Volatility Contraction (Cheap Premiums)";
            sentimentColor = "text-emerald-400";
            actionBias = "Premium Buying (Long Straddles / Directional Longs)";
            biasExplanation = "Volatility is crushed. Options are statistically at their cheapest in a year. This is the optimal time to outright Buy Puts/Calls or Long Straddles, anticipating a Volatility Expansion event.";
        }

        return NextResponse.json({
            currentIV: currentIV.toFixed(2),
            ivRank: ivRank.toFixed(1),
            ivPercentile: ivPercentile.toFixed(1),
            highIV: highIV.toFixed(2),
            lowIV: lowIV.toFixed(2),
            totalDaysAnalyzed: closingVix.length,
            interpretation,
            sentimentColor,
            actionBias,
            biasExplanation,
            historicalPoints: closingVix.slice(-60) // Send the last 60 days for a sparkline chart
        });

    } catch (error: any) {
        console.error("IV Rank Engine Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
