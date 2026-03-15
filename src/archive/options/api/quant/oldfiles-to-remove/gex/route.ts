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

        if (!spotPrice) throw new Error("Spot price required for Gamma Exposure (GEX)");

        const strikeInterval = underlying === 'NIFTY' ? 50 : 100;
        const atmStrike = Math.round(spotPrice / strikeInterval) * strikeInterval;

        // Target specifically the closest monthly or weekly expiry.
        // We need the instrument tokens.
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

        // The mapped data returned by /api/instruments usually has `expiry` attached,
        // but if it's missing or empty string, we can extract it defensively from the symbol later.
        // For now, let's assume `expiry` exists as returned by the cache.
        const expiries = Array.from(new Set(nfoInstruments.map((i: any) => i.expiry).filter(Boolean))).sort((a: any, b: any) => new Date(a).getTime() - new Date(b).getTime());

        const nearestExpiry = expiries[0];

        // If expiries array is somehow empty, fallback to taking all NFO instruments.
        // It's safer to filter down by expiry, so let's try to infer nearest expiry if needed.
        let targetInstruments = nfoInstruments;
        if (nearestExpiry) {
            targetInstruments = nfoInstruments.filter((i: any) => i.expiry === nearestExpiry);
        }

        // Filter to within +/- 30 strikes for deep GEX modelling
        targetInstruments = targetInstruments.filter((i: any) => {
            if (!i.strike) return false;
            return Math.abs(i.strike - atmStrike) <= (strikeInterval * 30);
        });

        const callSymbols = targetInstruments.filter((i: any) => i.value.endsWith('CE')).map((i: any) => i.value);
        const putSymbols = targetInstruments.filter((i: any) => i.value.endsWith('PE')).map((i: any) => i.value);

        const allSymbols = [...callSymbols, ...putSymbols];

        // Fetch Live Quotes (which contain the Open Interest field)
        const quotes = await (kite as any).getQuote(allSymbols);
        if (!quotes || typeof quotes !== 'object' || Object.keys(quotes).length === 0) {
            throw new Error("No active quotes returned for the selected Option Chain");
        }

        // Very basic GEX approximation:
        // True GEX requires calculating the exact Black-Scholes Gamma for every strike.
        // As a fast proxy, we know ATM Gamma is highest and tapers off.
        // For a normalized indicator, we can assume Call OI adds positive GEX, Put OI adds negative GEX, weighted by proximity to Spot.

        let netGexScore = 0;
        let totalCallOi = 0;
        let totalPutOi = 0;

        // Track net GEX per strike to identify institutional brick walls
        const strikeGexMap = new Map<number, number>();

        const instrumentMap = new Map<string, any>(targetInstruments.map((i: any) => [i.value, i]));

        for (const sym of allSymbols) {
            const quote = quotes[sym];
            if (!quote || !quote.oi) continue;

            const instInfo = instrumentMap.get(sym);
            if (!instInfo || !instInfo.strike) continue;

            const optType = sym.endsWith('CE') ? 'CE' : 'PE';
            const strike = instInfo.strike;

            // Distance weighting (Gamma peaks at ATM)
            const distance = Math.abs(strike - spotPrice);
            const weight = Math.max(0, 1 - (distance / (strikeInterval * 20))); // fades to 0 further out

            const currentStrikeGex = strikeGexMap.get(strike) || 0;

            if (optType === 'CE') {
                const addedGex = (quote.oi * weight);
                netGexScore += addedGex;
                totalCallOi += quote.oi;
                strikeGexMap.set(strike, currentStrikeGex + addedGex);
            } else {
                const subGex = (quote.oi * weight);
                netGexScore -= subGex; // Puts subtract from GEX
                totalPutOi += quote.oi;
                strikeGexMap.set(strike, currentStrikeGex - subGex);
            }
        }

        // Find Top 3 Positive Gamma Strikes and Top 3 Negative Gamma Strikes
        const allStrikeGexPairs = Array.from(strikeGexMap.entries());
        // Sort descending (highest positive first)
        const sortedByPositive = [...allStrikeGexPairs].sort((a, b) => b[1] - a[1]);
        const topPositiveStrikes = sortedByPositive.filter(p => p[1] > 0).slice(0, 3).map(p => ({ strike: p[0], gex: p[1] }));

        // Sort ascending (highest absolute negative first)
        const sortedByNegative = [...allStrikeGexPairs].sort((a, b) => a[1] - b[1]);
        const topNegativeStrikes = sortedByNegative.filter(p => p[1] < 0).slice(0, 3).map(p => ({ strike: p[0], gex: p[1] }));

        // --- Zero Gamma Level (ZGL) Simulation ---
        // We simulate the spot moving across all relevant strikes (-2000 to +2000 points from current spot)
        // to find where the theoretical Next GEX score crosses zero.
        let zeroGammaLevel = null;
        let minAbsGex = Infinity;

        // Iterate from Spot - 2000 to Spot + 2000 in strike intervals
        const startSimStrike = Math.floor((spotPrice - 2000) / strikeInterval) * strikeInterval;
        const endSimStrike = Math.ceil((spotPrice + 2000) / strikeInterval) * strikeInterval;

        for (let simSpot = startSimStrike; simSpot <= endSimStrike; simSpot += strikeInterval) {
            let simGexScore = 0;
            for (const sym of allSymbols) {
                const quote = quotes[sym];
                if (!quote || !quote.oi) continue;

                const instInfo = instrumentMap.get(sym);
                if (!instInfo || !instInfo.strike) continue;

                const optType = sym.endsWith('CE') ? 'CE' : 'PE';
                const strike = instInfo.strike;

                const simDistance = Math.abs(strike - simSpot);
                const simWeight = Math.max(0, 1 - (simDistance / (strikeInterval * 20)));

                if (optType === 'CE') {
                    simGexScore += (quote.oi * simWeight);
                } else {
                    simGexScore -= (quote.oi * simWeight);
                }
            }

            // Is this the closest we've gotten to exactly zero?
            if (Math.abs(simGexScore) < minAbsGex) {
                minAbsGex = Math.abs(simGexScore);
                zeroGammaLevel = simSpot;
            }
        }

        let interpretation = "Neutral GEX";
        let sentimentColor = "text-slate-400";
        if (netGexScore > 1000000) {
            interpretation = "Positive GEX (Volatility Suppressed / Market Pinned)";
            sentimentColor = "text-emerald-400";
        } else if (netGexScore < -1000000) {
            interpretation = "Negative GEX (Volatility Amplified / Breakout Risk)";
            sentimentColor = "text-rose-400";
        }

        return NextResponse.json({
            netGexScore,
            totalCallOi,
            totalPutOi,
            interpretation,
            sentimentColor,
            underlying,
            expiry: nearestExpiry,
            topPositiveStrikes,
            topNegativeStrikes,
            zeroGammaLevel
        });

    } catch (error: any) {
        console.error("GEX Engine Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
