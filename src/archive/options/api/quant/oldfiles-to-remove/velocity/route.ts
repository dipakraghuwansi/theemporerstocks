import { NextRequest, NextResponse } from 'next/server';
import { getKiteInstance } from '@/lib/kiteHelper';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const url = new URL(request.url);
        const underlying = url.searchParams.get('asset') || 'NIFTY';

        const token = request.cookies.get('kite_access_token')?.value;
        if (!token) throw new Error("Missing Kite Token");
        const kite = getKiteInstance(token);

        // 1. We need the instrument token for the underlying index
        const baseUrl = `${url.protocol}//${url.host}`;
        const instrumentsRes = await fetch(`${baseUrl}/api/instruments?q=${underlying}`);
        if (!instrumentsRes.ok) throw new Error("Failed to load base instruments");
        const instrumentsList = await instrumentsRes.json();

        // Identify the exact Nifty 50 Index token
        // Usually, the index token is found in NSE.
        const idxTarget = underlying === 'NIFTY' ? 'NIFTY 50' : underlying;
        const indexInstrument = instrumentsList.data.find((i: any) => i.exchange === 'NSE' && i.tradingsymbol === idxTarget);

        let instrumentToken = 256265; // Fallback hardcode for Nifty 50
        if (indexInstrument) instrumentToken = indexInstrument.instrument_token;

        // 2. Fetch Historical Data (Last 45 days roughly)
        const toDate = new Date();
        const fromDate = new Date();
        fromDate.setDate(toDate.getDate() - 45);

        // Fetch 15-Minute or Day candles. For broader "Velocity" day chart crosses (9 EMA / 21 EMA) are robust.
        const historyData = await (kite as any).getHistoricalData(
            instrumentToken,
            "day",
            fromDate.toISOString().split('T')[0],
            toDate.toISOString().split('T')[0],
            false
        );

        if (!historyData || historyData.length < 21) {
            throw new Error("Insufficient historical data for EMA calculation");
        }

        const closePrices = historyData.map((d: any) => d.close);

        // 3. Calculate 9 EMA and 21 EMA
        const calculateEMA = (data: number[], window: number) => {
            if (data.length < window) return [];
            const k = 2 / (window + 1);
            const emaArr = [data[0]]; // Seed with first close
            for (let i = 1; i < data.length; i++) {
                emaArr.push(data[i] * k + emaArr[i - 1] * (1 - k));
            }
            return emaArr;
        };

        const ema9 = calculateEMA(closePrices, 9);
        const ema21 = calculateEMA(closePrices, 21);

        const currentEma9 = ema9[ema9.length - 1];
        const currentEma21 = ema21[ema21.length - 1];

        const previousEma9 = ema9[ema9.length - 2];
        const previousEma21 = ema21[ema21.length - 2];

        // 4. Determine Velocity Signal
        let velocityStatus = "Neutral Structure";
        let trendColor = "text-slate-400";
        let isGoldenCross = false;
        let isDeathCross = false;

        const difference = currentEma9 - currentEma21;
        const currentSpot = closePrices[closePrices.length - 1];

        if (currentEma9 > currentEma21) {
            velocityStatus = "Bullish Uptrend (9 EMA > 21 EMA)";
            trendColor = "text-emerald-400";
            if (previousEma9 <= previousEma21) isGoldenCross = true;
        } else if (currentEma9 < currentEma21) {
            velocityStatus = "Bearish Downtrend (9 EMA < 21 EMA)";
            trendColor = "text-rose-400";
            if (previousEma9 >= previousEma21) isDeathCross = true;
        }

        if (isGoldenCross) velocityStatus = "Fresh Golden Cross (Bullish Outbreak)";
        if (isDeathCross) velocityStatus = "Fresh Death Cross (Bearish Breakdown)";

        return NextResponse.json({
            velocityStatus,
            trendColor,
            isGoldenCross,
            isDeathCross,
            currentEma9: currentEma9.toFixed(2),
            currentEma21: currentEma21.toFixed(2),
            currentSpot,
            spread: difference.toFixed(2)
        });

    } catch (error: any) {
        console.error("Velocity Engine Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
