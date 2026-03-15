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

        // 1. Identify Target Instrument
        const baseUrl = `${url.protocol}//${url.host}`;
        const instrumentsRes = await fetch(`${baseUrl}/api/instruments?q=${underlying}`);
        if (!instrumentsRes.ok) throw new Error("Failed to load base instruments");
        const instrumentsList = await instrumentsRes.json();

        // Target spot or futures. (Note: Indian Spot Indices often report 0 volume. 
        // If volume is 0, regular moving average will be used as fallback).
        const idxTarget = underlying === 'NIFTY' ? 'NIFTY 50' : underlying;

        let targetInstrument = instrumentsList.data.find((i: any) => i.exchange === 'NFO' && i.name === underlying && i.instrument_type === 'FUT' && i.expiry === getNearestExpiry(instrumentsList.data, underlying)); // Try Future first for volume

        if (!targetInstrument) {
            targetInstrument = instrumentsList.data.find((i: any) => i.exchange === 'NSE' && i.tradingsymbol === idxTarget);
        }

        let instrumentToken = 256265; // Fallback hardcode for Nifty 50
        if (targetInstrument) instrumentToken = targetInstrument.instrument_token;

        // 2. Determine Timeframe (15:00 to 15:30 Today IST)
        const d = new Date();
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const todayStr = `${yyyy}-${mm}-${dd}`;

        const fromDateStr = `${todayStr} 15:00:00`;
        const toDateStr = `${todayStr} 15:30:00`;

        // Wait, what if it's currently earlier than 15:00?
        // We will return a 'dormant' status.
        const currentHourIST = parseInt(new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false }).format(d));
        const currentMinIST = parseInt(new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', minute: 'numeric' }).format(d));

        // Before 3:00 PM IST (15:00), the model is dormant.
        if (currentHourIST < 15) {
            return NextResponse.json({
                status: 'dormant',
                message: 'Terminal VWAP Engine wakes up at 15:00 IST for MOC prediction.'
            });
        }

        // 3. Fetch Historical Data (1-minute candles from 15:00 onwards)
        const historyData = await (kite as any).getHistoricalData(
            instrumentToken,
            "minute",
            fromDateStr,
            toDateStr,
            false
        );

        if (!historyData || historyData.length === 0) {
            return NextResponse.json({ status: 'dormant', message: 'Waiting for 15:00 volume data to stream...' });
        }

        // 4. Calculate Accumulative Anchored VWAP
        let cumulativeVol = 0;
        let cumulativePriceVol = 0;

        const vwapSeries = historyData.map((candle: any) => {
            const timeRaw = new Date(candle.date);
            const timeLabel = timeRaw.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });

            // Kite Historical returns: open, high, low, close, volume, date
            let vol = candle.volume;
            // Fallback for Spot Indices that do not report volume
            if (vol === 0) vol = 1;

            const typicalPrice = (candle.high + candle.low + candle.close) / 3;

            cumulativeVol += vol;
            cumulativePriceVol += (typicalPrice * vol);

            const vwap = cumulativePriceVol / cumulativeVol;

            return {
                time: timeLabel,
                ltp: candle.close,
                vwap: parseFloat(vwap.toFixed(2)),
                volume: candle.volume,
                divergence: parseFloat((candle.close - vwap).toFixed(2)) // Spread: Positive = LTP above VWAP
            };
        });

        const latestPoint = vwapSeries[vwapSeries.length - 1];

        return NextResponse.json({
            status: 'active',
            symbol: targetInstrument?.tradingsymbol || underlying,
            latestLtp: latestPoint.ltp,
            latestVwap: latestPoint.vwap,
            divergence: latestPoint.divergence,
            history: vwapSeries
        });

    } catch (error: any) {
        console.error("VWAP Engine Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// Helper to find current expiry for selecting the active Future
function getNearestExpiry(instruments: any[], underlying: string) {
    const futs = instruments.filter(i => i.name === underlying && i.instrument_type === 'FUT');
    if (futs.length === 0) return '';
    const expiries = futs.map(i => i.expiry).sort((a: string, b: string) => new Date(a).getTime() - new Date(b).getTime());
    return expiries[0];
}
