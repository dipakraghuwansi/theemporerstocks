import { NextRequest, NextResponse } from 'next/server';
import { getKiteInstance } from '@/lib/kiteHelper';
import { calculateImpliedVolatility } from '@/lib/blackScholes';

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

        // 1. Fetch NFO instruments directly from Kite master CSV (cached)
        const currentTime = Date.now();
        if (!nfoInstrumentCache || (currentTime - lastFetchTime > CACHE_DURATION)) {
            console.log('Fetching fresh instruments from Kite API for Volatility Skew...');
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
        }

        const nfoInstruments = nfoInstrumentCache.filter(i => i.name === asset);

        if (nfoInstruments.length === 0) {
            throw new Error(`No NFO instruments found for ${asset}`);
        }

        // 2. Find the Nearest Expiration Date
        const uniqueExpiries = Array.from(new Set(nfoInstruments.map((i: any) => i.expiry))).sort((a: any, b: any) => new Date(a).getTime() - new Date(b).getTime());
        // Find the first expiry that is today or in the future
        const now = new Date();
        now.setHours(0, 0, 0, 0);

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

        const availableExpiries = uniqueExpiries.filter((e: any) => {
            const expiryDate = new Date(e);
            expiryDate.setHours(0, 0, 0, 0);
            return expiryDate.getTime() >= now.getTime();
        });

        const nearestExpiryInstruments = nfoInstruments.filter((i: any) => i.expiry === nearestExpiry);

        // Calculate Days To Expiry (T)
        // Force end of expiry day (approx 3:30 PM IST)
        const expDate = new Date(nearestExpiry as string);
        expDate.setHours(23, 59, 59, 999);
        const rightNow = new Date();
        const diffMs = expDate.getTime() - rightNow.getTime();
        const daysToExpiry = Math.max(diffMs / (1000 * 60 * 60 * 24), 0.001);
        const timeToExpiryYears = daysToExpiry / 365.0;

        // 3. Determine Strikes
        const strikeInterval = 50;
        const otmPercentage = 0.03; // We use 3% OTM instead of 5% because 5% OTM might be illiquid depending on days to expiry

        // Call target is higher than spot
        const unroundedCallStrike = spotPrice * (1 + otmPercentage);
        const targetCallStrike = Math.round(unroundedCallStrike / strikeInterval) * strikeInterval;

        // Put target is lower than spot
        const unroundedPutStrike = spotPrice * (1 - otmPercentage);
        const targetPutStrike = Math.round(unroundedPutStrike / strikeInterval) * strikeInterval;

        const callInst = nearestExpiryInstruments.find(i => i.strike === targetCallStrike && i.instrument_type === 'CE');
        const putInst = nearestExpiryInstruments.find(i => i.strike === targetPutStrike && i.instrument_type === 'PE');

        if (!callInst || !putInst) {
            throw new Error("Could not locate liquid OTM strikes for Skew calculation");
        }

        const tradingSymbols = [`NFO:${callInst.tradingsymbol}`, `NFO:${putInst.tradingsymbol}`];

        // 4. Fetch Live Quotes from Kite
        let quotes: any = {};
        try {
            quotes = await kite.getQuote(tradingSymbols);
        } catch (e: any) {
            throw new Error(`Kite error: ${e.message}`);
        }

        const callQuote = quotes[`NFO:${callInst.tradingsymbol}`];
        const putQuote = quotes[`NFO:${putInst.tradingsymbol}`];

        if (!callQuote || !putQuote) {
            throw new Error("Quotes missing for targeted OTM strikes");
        }

        // 5. Calculate Black Scholes IV for both
        const riskFreeRate = 0.07; // 7% standard estimation for India
        const callLTP = callQuote.last_price;
        const putLTP = putQuote.last_price;

        let callIV = 0;
        let putIV = 0;

        try {
            callIV = calculateImpliedVolatility(callLTP, spotPrice, targetCallStrike, timeToExpiryYears, riskFreeRate, 'CE');
        } catch (e) { console.error("IV Solver failed on Call", e) }

        try {
            putIV = calculateImpliedVolatility(putLTP, spotPrice, targetPutStrike, timeToExpiryYears, riskFreeRate, 'PE');
        } catch (e) { console.error("IV Solver failed on Put", e) }


        // 6. Return the difference
        const skewSpread = putIV - callIV;

        // Volatility Skew Interpretation:
        // Normally, Put IV is higher than Call IV (Fear of downside crash > FOMO of upside rally).
        // If Put IV is significantly higher, "Fear" is high (Bearish bias, high demand for downside protection).
        // If Call IV exceeds Put IV (Positive skew, rare), market is aggressively chasing the rally (Euphoria/Bullish).

        return NextResponse.json({
            spotPrice,
            daysToExpiry: daysToExpiry.toFixed(2),
            expiry_date: nearestExpiry,
            availableExpiries,
            call: {
                strike: targetCallStrike,
                ltp: callLTP,
                iv: (callIV * 100).toFixed(2)
            },
            put: {
                strike: targetPutStrike,
                ltp: putLTP,
                iv: (putIV * 100).toFixed(2)
            },
            skewSpread: (skewSpread * 100).toFixed(2) // e.g., "4.50" meaning Put IV is 4.5% higher
        });

    } catch (error: any) {
        console.error("Volatility Skew Engine Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
