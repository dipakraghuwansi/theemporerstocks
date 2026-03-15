import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getKiteInstance } from '@/lib/kiteHelper';
import { SMA, RSI } from 'technicalindicators';

// Calculate Annualized Historical Volatility (HV)
// Using standard 20-trading-day lookback
function calculateHistoricalVolatility(closes: number[], period: number = 20): number {
    if (closes.length < period + 1) return 0;

    // Get the most recent `period + 1` closes
    const recentCloses = closes.slice(-(period + 1));
    const logReturns: number[] = [];

    for (let i = 1; i < recentCloses.length; i++) {
        logReturns.push(Math.log(recentCloses[i] / recentCloses[i - 1]));
    }

    // Average of Log Returns
    const mean = logReturns.reduce((acc, val) => acc + val, 0) / logReturns.length;

    // Variance
    const squaredDifferences = logReturns.map(r => Math.pow(r - mean, 2));
    const variance = squaredDifferences.reduce((acc, val) => acc + val, 0) / (logReturns.length - 1);

    // Std Deviation of Returns (Daily Volatility)
    const dailyVol = Math.sqrt(variance);

    // Annualized Volatility (assuming 252 trading days)
    const annualizedVol = dailyVol * Math.sqrt(252);

    return annualizedVol * 100; // Return as percentage
}

export async function GET(request: Request) {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get('kite_access_token')?.value;

    if (!accessToken) {
        return NextResponse.json({
            error: 'Not authenticated with Kite. Please login to use Market Analysis.',
            needsLogin: true
        }, { status: 401 });
    }

    try {
        const kite = getKiteInstance(accessToken);

        // NIFTY 50 Spot Instrument Token on Kite is "256265"
        const instrument_token = "256265";

        const to = new Date();
        const from = new Date();
        from.setMonth(from.getMonth() - 12); // ~1 year of data for 200 SMA

        const formatDt = (d: Date) => d.toISOString().split('T')[0] + ' 00:00:00';

        // Fetch Daily Candles
        const historicalData = await (kite as any).getHistoricalData(instrument_token, 'day', formatDt(from), formatDt(to));

        if (!historicalData || historicalData.length < 200) {
            return NextResponse.json({ error: 'Not enough historical data retrieved.' }, { status: 400 });
        }

        const closes = historicalData.map((c: any) => c.close);
        const currentClose = closes[closes.length - 1];

        const sma50Data = SMA.calculate({ period: 50, values: closes });
        const sma200Data = SMA.calculate({ period: 200, values: closes });
        const rsi14Data = RSI.calculate({ period: 14, values: closes });

        const sma50 = sma50Data[sma50Data.length - 1];
        const sma200 = sma200Data[sma200Data.length - 1];
        const rsi14 = rsi14Data[rsi14Data.length - 1];

        const hv20 = calculateHistoricalVolatility(closes, 20);

        // Interpret Market Bias
        let trendBias = 'NEUTRAL';
        if (currentClose > sma50 && sma50 > sma200) trendBias = 'BULLISH';
        if (currentClose < sma50 && sma50 < sma200) trendBias = 'BEARISH';

        // RSI Overbought/Oversold checks
        if (rsi14 > 70) trendBias = 'OVERBOUGHT (Bearish Reversal Risk)';
        if (rsi14 < 30) trendBias = 'OVERSOLD (Bullish Bounce Risk)';

        // Volatility Recommendation
        // Generally, HV > 15-20% is considered high for Indian Indices.
        let volatilityBias = 'NEUTRAL';
        let suggestedStrategy = 'Iron Condor / Credit Spreads';

        if (hv20 > 20) {
            volatilityBias = 'HIGH VOLATILITY';
            suggestedStrategy = 'Long Straddle (Expect Big Moves) or Iron Condor (To Collect Premium)';
        } else if (hv20 < 12) {
            volatilityBias = 'LOW VOLATILITY';
            suggestedStrategy = 'Long Strangle (Limit Theta, Bet on Expansion)';
        }

        return NextResponse.json({
            success: true,
            data: {
                currentClose,
                indicators: {
                    sma50: parseFloat(sma50.toFixed(2)),
                    sma200: parseFloat(sma200.toFixed(2)),
                    rsi14: parseFloat(rsi14.toFixed(2)),
                    historicalVolatility20: parseFloat(hv20.toFixed(2))
                },
                analysis: {
                    trendBias,
                    volatilityBias,
                    suggestedStrategy
                }
            }
        });

    } catch (error: any) {
        console.error("Analysis API Error:", error);
        return NextResponse.json(
            { error: 'Failed to run market analysis.', details: error.message },
            { status: 500 }
        );
    }
}
