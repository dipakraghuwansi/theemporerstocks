import { NextRequest, NextResponse } from 'next/server';
import { getKiteInstance } from '@/lib/kiteHelper';

// We need a way to filter the instruments down to exactly the strikes we care about.
// However, the kite.getQuote() method can take an array of trading symbols.
// Example: ["NFO:NIFTY24OCT25600CE", "NFO:NIFTY24OCT25600PE"]

// In-memory cache for all NFO instruments to avoid 20MB download on every request
let nfoInstrumentCache: any[] | null = null;
let lastFetchTime = 0;
const CACHE_DURATION = 1000 * 60 * 60 * 12; // 12 hours

export async function GET(request: NextRequest) {
    try {
        const url = new URL(request.url);
        const asset = url.searchParams.get('asset') || 'NIFTY'; // Only NIFTY for now
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
            console.log('Fetching fresh instruments from Kite API for Max Pain...');
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
        // Sort all unique expiration dates chronologically
        const uniqueExpiries = Array.from(new Set(nfoInstruments.map((i: any) => i.expiry))).sort((a: any, b: any) => new Date(a).getTime() - new Date(b).getTime());

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

        // 3. Filter down to only options for this specific nearest expiry date
        const nearestExpiryInstruments = nfoInstruments.filter((i: any) => i.expiry === nearestExpiry);

        // 4. Determine the At-The-Money (ATM) strike
        // Nifty strikes are in intervals of 50. Let's round to nearest 50.
        const strikeInterval = 50;
        const atmStrike = Math.round(spotPrice / strikeInterval) * strikeInterval;

        // 5. Scope the search to ATM +/- 15 strikes (approx 30 strikes total = 60 symbols [CE+PE])
        // We do this because Kite limits getQuote() to a certain number of symbols at once.
        const numStrikesEachSide = 15;
        const validStrikes = new Set<number>();
        for (let i = -numStrikesEachSide; i <= numStrikesEachSide; i++) {
            validStrikes.add(atmStrike + (i * strikeInterval));
        }

        const scopedInstruments = nearestExpiryInstruments.filter((i: any) => validStrikes.has(i.strike));

        // Format trading symbols for Kite quote query (Needs 'NFO:' prefix)
        const tradingSymbols = scopedInstruments.map((i: any) => `NFO:${i.tradingsymbol}`);

        // 6. Fetch Live Quotes (including Open Interest and LTP) for these ~60 instruments
        if (tradingSymbols.length === 0) {
            throw new Error("No valid strikes found within range.");
        }

        let quotes: any = {};
        try {
            quotes = await kite.getQuote(tradingSymbols);
        } catch (e: any) {
            console.error("Kite Quote API Error for Max Pain:", e);
            throw new Error(`Kite error: ${e.message}`);
        }

        // 7. Calculate Max Pain
        // Max Pain theory: The price at which option buyers lose the most money (and sellers gain the most).
        // It's the strike price where the sum of the intrinsic value of all open puts and calls is minimized.

        // Aggregate OI by Strike and Type
        // Data structure: { "25600": { "CE": { oi: 10000 }, "PE": { oi: 15000 } } }
        const strikeData: Record<number, { ce_oi: number, pe_oi: number }> = {};

        scopedInstruments.forEach((inst: any) => {
            const quoteData = quotes[`NFO:${inst.tradingsymbol}`];
            if (quoteData) {
                if (!strikeData[inst.strike]) {
                    strikeData[inst.strike] = { ce_oi: 0, pe_oi: 0 };
                }

                if (inst.instrument_type === 'CE') {
                    strikeData[inst.strike].ce_oi = quoteData.oi || 0;
                } else if (inst.instrument_type === 'PE') {
                    strikeData[inst.strike].pe_oi = quoteData.oi || 0;
                }
            }
        });

        // Loop through all assumed expiration prices (we test expiring exactly at each strike)
        const strikesToTest = Array.from(validStrikes).sort((a, b) => a - b);
        let maxPainStrike = 0;
        let minTotalLoss = Number.MAX_SAFE_INTEGER;

        const painDistribution = []; // For charting in the UI

        for (const assumedSpot of strikesToTest) {
            let totalIntrinsicValue = 0;

            // For this assumed spot price, compute the payout value of every open option contract
            for (const [strikeStr, data] of Object.entries(strikeData)) {
                const strike = parseFloat(strikeStr);

                // Intrinsic Value of Calls (if Spot > Strike, Calls are In-The-Money)
                let ceValue = 0;
                if (assumedSpot > strike) {
                    ceValue = (assumedSpot - strike) * data.ce_oi;
                }

                // Intrinsic Value of Puts (if Spot < Strike, Puts are In-The-Money)
                let peValue = 0;
                if (assumedSpot < strike) {
                    peValue = (strike - assumedSpot) * data.pe_oi;
                }

                totalIntrinsicValue += ceValue + peValue;
            }

            painDistribution.push({
                strike: assumedSpot,
                totalPain: totalIntrinsicValue
            });

            // Is this the lowest pain we've seen?
            if (totalIntrinsicValue < minTotalLoss) {
                minTotalLoss = totalIntrinsicValue;
                maxPainStrike = assumedSpot;
            }
        }

        return NextResponse.json({
            maxPainStrike,
            minTotalLoss,
            atmStrike,
            nearestExpiry,
            availableExpiries,
            painDistribution
        });

    } catch (error: any) {
        console.error("Max Pain Engine Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
