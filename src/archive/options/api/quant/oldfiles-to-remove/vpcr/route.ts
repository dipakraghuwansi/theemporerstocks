import { NextRequest, NextResponse } from 'next/server';
import { getKiteInstance } from '@/lib/kiteHelper';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const url = new URL(request.url);
        const underlying = url.searchParams.get('asset') || 'NIFTY';
        const spotPrice = parseFloat(url.searchParams.get('spot') || '0');

        const token = request.cookies.get('kite_access_token')?.value;
        if (!token) throw new Error("Missing Kite Token");
        const kite = getKiteInstance(token);

        // 1. Fetch Instruments (Cache/CSV fallback mechanism ideally used here. For speed, using raw active strings temporarily)
        // Since VPCR is highly targeted, we'll scan the immediate ATM strikes +/- 10
        if (!spotPrice) throw new Error("Spot price required for V-PCR");

        const strikeInterval = underlying === 'NIFTY' ? 50 : 100;
        const atmStrike = Math.round(spotPrice / strikeInterval) * strikeInterval;

        // Target specifically the closest monthly or weekly expiry.
        // We need the instrument tokens.
        // We will borrow the logic of looking up instruments here:
        const baseUrl = `${url.protocol}//${url.host}`;
        const instrumentsRes = await fetch(`${baseUrl}/api/instruments?q=NFO:${underlying}&limit=ALL`);
        if (!instrumentsRes.ok) throw new Error("Failed to load base instruments");
        const instrumentsList = await instrumentsRes.json();

        const nfoInstruments = instrumentsList.data.filter((i: any) => {
            if (!i.value || !i.value.startsWith('NFO:')) return false;
            const symbolWithoutExchange = i.value.split(':')[1];
            const regex = new RegExp('^' + underlying + '\\d+');
            return regex.test(symbolWithoutExchange) && !symbolWithoutExchange.endsWith('FUT');
        });

        if (nfoInstruments.length === 0) throw new Error("No derivative instruments found");

        const expiries = Array.from(new Set(nfoInstruments.map((i: any) => i.expiry).filter(Boolean))).sort((a: any, b: any) => new Date(a).getTime() - new Date(b).getTime());
        const nearestExpiry = expiries[0];

        let targetInstruments = nfoInstruments;
        if (nearestExpiry) {
            targetInstruments = nfoInstruments.filter((i: any) => i.expiry === nearestExpiry);
        }

        // Filter to within range
        targetInstruments = targetInstruments.filter((i: any) => {
            if (!i.strike) return false;
            return Math.abs(i.strike - atmStrike) <= (strikeInterval * 10);
        });

        const callSymbols = targetInstruments.filter((i: any) => i.value.endsWith('CE')).map((i: any) => i.value);
        const putSymbols = targetInstruments.filter((i: any) => i.value.endsWith('PE')).map((i: any) => i.value);

        const allSymbols = [...callSymbols, ...putSymbols];

        // 2. Fetch Live Quotes (which contain the intraday Volume field)
        const quotes = await (kite as any).getQuote(allSymbols);
        if (!quotes || typeof quotes !== 'object' || Object.keys(quotes).length === 0) {
            throw new Error("No active quotes returned for the selected Option Chain");
        }

        let totalPutVolume = 0;
        let totalCallVolume = 0;

        for (const symbol of allSymbols) {
            const quote = quotes[symbol];
            if (quote && quote.volume !== undefined) {
                if (symbol.endsWith('PE')) {
                    totalPutVolume += quote.volume;
                } else if (symbol.endsWith('CE')) {
                    totalCallVolume += quote.volume;
                }
            }
        }

        if (totalCallVolume === 0) {
            console.error("DEBUG VPCR - First 3 quotes raw data:", JSON.stringify(Object.values(quotes).slice(0, 3), null, 2));
            throw new Error("Zero Call Volume Found - API Error");
        }

        const vpcr = totalPutVolume / totalCallVolume;

        return NextResponse.json({
            vpcr: vpcr.toFixed(2),
            totalPutVolume,
            totalCallVolume,
            underlying,
            expiry: nearestExpiry
        });

    } catch (error: any) {
        console.error("V-PCR Engine Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
