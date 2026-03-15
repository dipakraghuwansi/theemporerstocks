import { NextResponse } from 'next/server';

// In-memory cache to prevent downloading 90,000+ instruments on every keystroke
let instrumentCache: Array<{ label: string; value: string; expiry?: string; strike?: number; lotSize?: number; isMonthly?: boolean }> | null = null;
let lastFetchTime = 0;
const CACHE_DURATION = 1000 * 60 * 60 * 12; // 12 hours

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q')?.toUpperCase() || '';

    // Minimal sanity check to prevent returning all 90k instantly
    if (query.length < 3) {
        return NextResponse.json({ data: [] });
    }

    try {
        const now = Date.now();
        // 1. Fetch and build cache if it's empty or expired
        if (!instrumentCache || (now - lastFetchTime > CACHE_DURATION)) {
            console.log('Fetching fresh instruments from Kite API...');

            const response = await fetch('https://api.kite.trade/instruments');
            if (!response.ok) {
                throw new Error('Failed to fetch instruments from Kite API');
            }

            const csvText = await response.text();

            // Basic CSV parsing to keep it lightning fast
            // Expected CSV headers: instrument_token,exchange_token,tradingsymbol,name,last_price,expiry,strike,tick_size,lot_size,instrument_type,segment,exchange
            const lines = csvText.split('\n');

            const parsed: Array<{ label: string; value: string; expiry?: string; strike?: number; lotSize?: number; isMonthly?: boolean }> = [];
            const monthRegex = /(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\d+(CE|PE)$/i;

            for (let i = 1; i < lines.length; i++) { // Skip header
                const line = lines[i];
                if (!line) continue;

                const cols = line.split(',');
                if (cols.length > 11) {
                    const tradingsymbol = cols[2]?.replace(/"/g, '');
                    const expiry = cols[5]?.replace(/"/g, '');
                    const lot_size = parseInt(cols[8]?.replace(/"/g, '') || '0', 10);
                    const instrument_type = cols[9]?.replace(/"/g, '');
                    const exchange = cols[11]?.replace(/"/g, '').trim();

                    if (tradingsymbol && exchange) {
                        // We format the value exactly how the Kite Quote API expects it: "EXCHANGE:TRADINGSYMBOL"
                        const kiteSearchString = `${exchange}:${tradingsymbol}`;
                        const isMonthly = monthRegex.test(tradingsymbol);
                        const strikePrice = parseFloat(cols[6]?.replace(/"/g, '') || '0');

                        parsed.push({
                            label: kiteSearchString, // e.g., NFO:NIFTY24OCT25600PE
                            value: kiteSearchString,
                            expiry: expiry, // e.g. 2024-10-24
                            strike: strikePrice > 0 ? strikePrice : undefined,
                            lotSize: lot_size > 0 ? lot_size : undefined,
                            isMonthly
                        });
                    }
                }
            }

            instrumentCache = parsed;
            lastFetchTime = now;
            console.log(`Successfully cached ${instrumentCache.length} Kite instruments.`);
        }

        // 2. Filter the pre-built memory cache instantly
        // Restrict the results to 50 max to keep the UI snappy
        const queryTokens = query.split(' ').filter(Boolean);
        const limitParam = searchParams.get('limit');
        const limitCount = limitParam === 'ALL' ? instrumentCache.length : parseInt(limitParam || '50', 10);

        const results = instrumentCache
            .filter(inst => {
                // Return true only if ALL space-separated tokens are found in the label
                return queryTokens.every(token => inst.label.includes(token));
            })
            .slice(0, limitCount);

        return NextResponse.json({ data: results });

    } catch (error: any) {
        console.error("Instrument API Error:", error);
        return NextResponse.json({ error: 'Failed to search instruments' }, { status: 500 });
    }
}
