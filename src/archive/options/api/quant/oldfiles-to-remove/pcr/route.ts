import { NextRequest, NextResponse } from 'next/server';
import { getKiteInstance } from '@/lib/kiteHelper';

// In-memory cache for all NFO instruments
let nfoInstrumentCache: any[] | null = null;
let lastFetchTime = 0;
const CACHE_DURATION = 1000 * 60 * 60 * 12; // 12 hours

export async function GET(request: NextRequest) {
    try {
        const url = new URL(request.url);
        const asset = url.searchParams.get('asset') || 'NIFTY';
        const spotPriceStr = url.searchParams.get('spot');
        const requestedExpiry = url.searchParams.get('expiry');
        const token = request.cookies.get('kite_access_token')?.value;

        if (!token) {
            return NextResponse.json({ error: "Not authenticated with Kite" }, { status: 401 });
        }

        if (!spotPriceStr) {
            return NextResponse.json({ error: "Spot price is required" }, { status: 400 });
        }

        const spotPrice = parseFloat(spotPriceStr);
        if (isNaN(spotPrice)) {
            return NextResponse.json({ error: "Invalid Spot price" }, { status: 400 });
        }

        const kite = getKiteInstance(token);

        // 1. Fetch NFO instruments directly from Kite master CSV
        const currentTime = Date.now();
        if (!nfoInstrumentCache || (currentTime - lastFetchTime > CACHE_DURATION)) {
            console.log('Fetching fresh instruments from Kite API for PCR...');
            const response = await fetch('https://api.kite.trade/instruments');
            if (!response.ok) {
                throw new Error('Failed to fetch instruments from Kite API');
            }
            const csvText = await response.text();
            const lines = csvText.split('\n');
            const parsed = [];

            for (let i = 1; i < lines.length; i++) {
                const line = lines[i];
                if (!line) continue;
                const cols = line.split(',');
                if (cols.length > 11) {
                    const exchange = cols[11]?.replace(/"/g, '').trim();
                    const name = cols[3]?.replace(/"/g, '').trim();
                    const instrument_type = cols[9]?.replace(/"/g, '').trim();

                    if (exchange === 'NFO' && instrument_type !== 'FUT') {
                        const tradingsymbol = cols[2]?.replace(/"/g, '');
                        const expiry = cols[5]?.replace(/"/g, '');
                        const strike = parseFloat(cols[6]?.replace(/"/g, '') || '0');

                        parsed.push({
                            name,
                            tradingsymbol,
                            expiry,
                            strike,
                            instrument_type
                        });
                    }
                }
            }
            nfoInstrumentCache = parsed;
            lastFetchTime = currentTime;
            console.log(`Successfully cached ${nfoInstrumentCache.length} NFO instruments.`);
        }

        const nfoInstruments = nfoInstrumentCache.filter(i => i.name === asset);

        if (nfoInstruments.length === 0) {
            throw new Error(`No NFO instruments found for ${asset}`);
        }

        // 2. Find the Absolute Nearest Expiration Date
        const uniqueExpiries = Array.from(new Set(nfoInstruments.map((i: any) => i.expiry))).sort((a: any, b: any) => new Date(a).getTime() - new Date(b).getTime());

        const now = new Date();
        now.setHours(0, 0, 0, 0); // Zero out the time to compare pure dates

        let nearestExpiry = requestedExpiry || uniqueExpiries[0];
        if (!requestedExpiry) {
            for (const exp of uniqueExpiries) {
                const expiryDate = new Date(exp as string);
                expiryDate.setHours(0, 0, 0, 0);
                if (expiryDate.getTime() >= now.getTime()) {
                    nearestExpiry = exp;
                    break;
                }
            }
        }

        // Only return expiries that are today or in the future
        const availableExpiries = uniqueExpiries.filter((e: any) => {
            const expiryDate = new Date(e);
            expiryDate.setHours(0, 0, 0, 0);
            return expiryDate.getTime() >= now.getTime();
        });

        console.log("AVAILABLE EXPIRIES length", availableExpiries.length);
        if (availableExpiries.length === 0) {
            console.log("Unique Expiries:", uniqueExpiries.slice(0, 5));
            console.log("Now:", now.getTime());
        }

        // 3. Filter down to only options for this specific nearest expiry date
        const nearestExpiryInstruments = nfoInstruments.filter((i: any) => i.expiry === nearestExpiry);

        // 4. Determine the Strike Interval and Coverage
        const uniqueStrikes = Array.from(new Set(nearestExpiryInstruments.map((i: any) => i.strike))).sort((a: any, b: any) => a - b);
        let strikeInterval = 50;
        if (uniqueStrikes.length > 1) {
            // Find the most frequent difference between adjacent strikes
            const diffs: Record<number, number> = {};
            for (let i = 1; i < uniqueStrikes.length; i++) {
                const d = uniqueStrikes[i] - uniqueStrikes[i - 1];
                diffs[d] = (diffs[d] || 0) + 1;
            }
            strikeInterval = Number(Object.keys(diffs).reduce((a, b) => diffs[Number(a)] > diffs[Number(b)] ? a : b));
        }
        const atmStrike = Math.round(spotPrice / strikeInterval) * strikeInterval;

        // 5. Use ALL instruments for this expiry to get a 100% accurate PCR
        // Kite getQuote limit is 500 symbols, a single expiry usually has < 200.
        const tradingSymbols = nearestExpiryInstruments.map((i: any) => `NFO:${i.tradingsymbol}`);

        if (tradingSymbols.length === 0) {
            throw new Error("No instruments found for the selected expiry.");
        }

        if (tradingSymbols.length > 500) {
            console.warn(`[PCR Engine] Warning: ${tradingSymbols.length} symbols found. Truncating to 500 to meet Kite API limits.`);
            tradingSymbols.splice(500);
        }

        // 6. Fetch Live Quotes to get Open Interest 
        let quotes: any = {};
        try {
            quotes = await kite.getQuote(tradingSymbols);
        } catch (e: any) {
            console.error("Kite Quote API Error for PCR:", e);
            throw new Error(`Kite error: ${e.message}`);
        }

        // 7. Calculate Put-Call Ratio
        let totalCallOI = 0;
        let totalPutOI = 0;

        nearestExpiryInstruments.forEach((inst: any) => {
            const quoteData = quotes[`NFO:${inst.tradingsymbol}`];
            if (quoteData && quoteData.oi) {
                if (inst.instrument_type === 'CE') {
                    totalCallOI += quoteData.oi;
                } else if (inst.instrument_type === 'PE') {
                    totalPutOI += quoteData.oi;
                }
            }
        });

        // Prevent division by zero
        const pcr = totalCallOI > 0 ? totalPutOI / totalCallOI : 0;

        return NextResponse.json({
            pcr: pcr.toFixed(4),
            totalCallOI,
            totalPutOI,
            nearestExpiry,
            availableExpiries,
            atmStrike
        });

    } catch (error: any) {
        console.error("PCR Engine Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
