import { NextRequest, NextResponse } from 'next/server';
import { getKiteInstance } from '@/lib/kiteHelper';
import { calculateImpliedVolatility } from '@/lib/blackScholes';

let nfoInstrumentCache: any[] | null = null;
let lastFetchTime = 0;
const CACHE_DURATION = 1000 * 60 * 60 * 12; // 12 hours

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const url = new URL(request.url);
        const underlying = url.searchParams.get('asset') || 'NIFTY';
        const spotPriceOverrideStr = url.searchParams.get('spot');
        const requestedExpiry = url.searchParams.get('expiry');

        const token = request.cookies.get('kite_access_token')?.value;
        if (!token) return NextResponse.json({ error: "Not authenticated with Kite" }, { status: 401 });

        const kite = getKiteInstance(token);

        // --- STEP 1: Fetch True Spot & VIX (if no override) ---
        let spotPrice = spotPriceOverrideStr ? parseFloat(spotPriceOverrideStr) : 0;
        let indiaVix = 0;

        try {
            const spotQuotes = await kite.getQuote(['NSE:NIFTY 50', 'NSE:INDIA VIX']);
            if (spotQuotes['NSE:INDIA VIX']) indiaVix = spotQuotes['NSE:INDIA VIX'].last_price;
            if (!spotPrice && spotQuotes['NSE:NIFTY 50']) spotPrice = spotQuotes['NSE:NIFTY 50'].last_price;
        } catch (e: any) {
            console.error("Kite Quote API Error for Spot Price:", e);
        }

        if (!spotPrice) return NextResponse.json({ error: "Failed to determine Spot Price" }, { status: 400 });

        // --- STEP 2: Fetch/Cache NFO Instruments ---
        const currentTime = Date.now();
        if (!nfoInstrumentCache || (currentTime - lastFetchTime > CACHE_DURATION)) {
            const response = await fetch('https://api.kite.trade/instruments');
            if (response.ok) {
                const csvText = await response.text();
                const lines = csvText.split('\n');
                const parsed = [];
                for (let i = 1; i < lines.length; i++) {
                    const cols = lines[i].split(',');
                    if (cols.length > 11) {
                        const exchange = cols[11]?.replace(/"/g, '').trim();
                        const name = cols[3]?.replace(/"/g, '').trim();
                        const instrument_type = cols[9]?.replace(/"/g, '').trim();
                        if (exchange === 'NFO' && instrument_type !== 'FUT') {
                            const tradingsymbol = cols[2]?.replace(/"/g, '');
                            const expiry = cols[5]?.replace(/"/g, '');
                            const strike = parseFloat(cols[6]?.replace(/"/g, '') || '0');
                            parsed.push({ name, tradingsymbol, expiry, strike, instrument_type });
                        }
                    }
                }
                nfoInstrumentCache = parsed;
                lastFetchTime = currentTime;
            }
        }

        const nfoInstruments = (nfoInstrumentCache || []).filter(i => i.name === underlying);
        if (nfoInstruments.length === 0) throw new Error(`No NFO instruments found for ${underlying}`);

        // --- STEP 3: Identify Nearest Expiry ---
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

        // Calculate Days To Expiry (for Skew)
        const expDate = new Date(nearestExpiry as string);
        expDate.setHours(23, 59, 59, 999);
        const rightNow = new Date();
        const daysToExpiry = Math.max((expDate.getTime() - rightNow.getTime()) / (1000 * 60 * 60 * 24), 0.001);
        const timeToExpiryYears = daysToExpiry / 365.0;

        const nearestExpiryInstruments = nfoInstruments.filter((i: any) => i.expiry === nearestExpiry);

        // --- STEP 4: Scope the Quotes to ATM +/- 30 Strikes (~60 symbols max limit is 500) ---
        const strikeInterval = underlying === 'NIFTY' ? 50 : 100;
        const atmStrike = Math.round(spotPrice / strikeInterval) * strikeInterval;

        const validStrikes = new Set<number>();
        for (let i = -30; i <= 30; i++) {
            validStrikes.add(atmStrike + (i * strikeInterval));
        }

        const scopedInstruments = nearestExpiryInstruments.filter((i: any) => validStrikes.has(i.strike));
        const tradingSymbols = scopedInstruments.map((i: any) => `NFO:${i.tradingsymbol}`);

        if (tradingSymbols.length === 0) throw new Error("No instruments found for the selected expiry.");

        // --- STEP 5: Fire ONE Massive Quote Fetch ---
        const quotes = await kite.getQuote(tradingSymbols);

        // --- MERGED LOGIC EXECUTION ---

        // --- PCR Logic ---
        let totalCallOI = 0;
        let totalPutOI = 0;
        scopedInstruments.forEach((inst: any) => {
            const quoteData = quotes[`NFO:${inst.tradingsymbol}`];
            if (quoteData && quoteData.oi) {
                if (inst.instrument_type === 'CE') totalCallOI += quoteData.oi;
                if (inst.instrument_type === 'PE') totalPutOI += quoteData.oi;
            }
        });
        const pcrVal = totalCallOI > 0 ? totalPutOI / totalCallOI : 0;

        let pcrInverted = (pcrVal - 1.0) * (2.5 / 0.4) * -1;
        if (pcrVal > 1.45) pcrInverted = 2.5;
        if (pcrVal < 0.55) pcrInverted = -2.5;
        const pcrScore = Math.max(-2.5, Math.min(2.5, pcrInverted));

        // --- VPCR Logic ---
        let totalPutVolume = 0;
        let totalCallVolume = 0;
        scopedInstruments.forEach((i: any) => {
            const quoteData = quotes[`NFO:${i.tradingsymbol}`];
            if (quoteData && quoteData.volume !== undefined) {
                // VPCR traditionally only looks tighter, e.g. ATM +/- 10
                if (Math.abs(i.strike - atmStrike) <= (strikeInterval * 10)) {
                    if (i.instrument_type === 'PE') totalPutVolume += quoteData.volume;
                    if (i.instrument_type === 'CE') totalCallVolume += quoteData.volume;
                }
            }
        });
        const vpcrVal = totalCallVolume > 0 ? totalPutVolume / totalCallVolume : 0;
        const vpcrScore = Math.max(-2.5, Math.min(2.5, (1.0 - vpcrVal) * 5));

        // --- Max Pain Logic ---
        const strikeData: Record<number, { ce_oi: number, pe_oi: number }> = {};
        scopedInstruments.forEach((inst: any) => {
            // Max Pain looks at +/- 15 strikes usually
            if (Math.abs(inst.strike - atmStrike) <= (strikeInterval * 15)) {
                const quoteData = quotes[`NFO:${inst.tradingsymbol}`];
                if (quoteData) {
                    if (!strikeData[inst.strike]) strikeData[inst.strike] = { ce_oi: 0, pe_oi: 0 };
                    if (inst.instrument_type === 'CE') strikeData[inst.strike].ce_oi = quoteData.oi || 0;
                    if (inst.instrument_type === 'PE') strikeData[inst.strike].pe_oi = quoteData.oi || 0;
                }
            }
        });
        const strikesToTest = Array.from(validStrikes).filter(s => Math.abs(s - atmStrike) <= (strikeInterval * 15)).sort((a, b) => a - b);
        let maxPainStrike = 0;
        let minTotalLoss = Number.MAX_SAFE_INTEGER;
        const painDistribution = [];

        for (const assumedSpot of strikesToTest) {
            let totalIntrinsicValue = 0;
            for (const [strikeStr, data] of Object.entries(strikeData)) {
                const strike = parseFloat(strikeStr);
                const ceValue = assumedSpot > strike ? (assumedSpot - strike) * data.ce_oi : 0;
                const peValue = assumedSpot < strike ? (strike - assumedSpot) * data.pe_oi : 0;
                totalIntrinsicValue += ceValue + peValue;
            }
            painDistribution.push({ strike: assumedSpot, totalPain: totalIntrinsicValue });
            if (totalIntrinsicValue < minTotalLoss) {
                minTotalLoss = totalIntrinsicValue;
                maxPainStrike = assumedSpot;
            }
        }
        const maxPainDiffPct = ((maxPainStrike - atmStrike) / atmStrike) * 100;
        const maxPainScore = Math.max(-2.5, Math.min(2.5, (maxPainDiffPct / 2) * 2.5));

        // --- GEX Logic ---
        let netGexScore = 0;
        const strikeGexMap = new Map<number, number>();
        const instrumentMap = new Map<string, any>(scopedInstruments.map((i: any) => [`NFO:${i.tradingsymbol}`, i]));

        tradingSymbols.forEach((sym) => {
            const quote = quotes[sym];
            const instInfo = instrumentMap.get(sym);
            if (quote && quote.oi && instInfo && instInfo.strike) {
                const optType = instInfo.instrument_type;
                const strike = instInfo.strike;
                const weight = Math.max(0, 1 - (Math.abs(strike - spotPrice) / (strikeInterval * 20))); // tapers over 20 strikes
                if (weight > 0) {
                    const currentStrikeGex = strikeGexMap.get(strike) || 0;
                    if (optType === 'CE') {
                        const addedGex = quote.oi * weight;
                        netGexScore += addedGex;
                        strikeGexMap.set(strike, currentStrikeGex + addedGex);
                    } else if (optType === 'PE') {
                        const subGex = quote.oi * weight;
                        netGexScore -= subGex;
                        strikeGexMap.set(strike, currentStrikeGex - subGex);
                    }
                }
            }
        });
        const allStrikeGexPairs = Array.from(strikeGexMap.entries());
        const topPositiveStrikes = [...allStrikeGexPairs].sort((a, b) => b[1] - a[1]).filter(p => p[1] > 0).slice(0, 3).map(p => ({ strike: p[0], gex: p[1] }));
        const topNegativeStrikes = [...allStrikeGexPairs].sort((a, b) => a[1] - b[1]).filter(p => p[1] < 0).slice(0, 3).map(p => ({ strike: p[0], gex: p[1] }));
        const gexScore = Math.max(-2.5, Math.min(2.5, (netGexScore / 1000000) * 2.5));

        let gexInterpretation = "Neutral GEX";
        let gexSentimentColor = "text-slate-400";
        if (netGexScore > 1000000) {
            gexInterpretation = "Positive GEX (Volatility Suppressed / Market Pinned)";
            gexSentimentColor = "text-emerald-400";
        } else if (netGexScore < -1000000) {
            gexInterpretation = "Negative GEX (Volatility Amplified / Breakout Risk)";
            gexSentimentColor = "text-rose-400";
        }

        // Zero Gamma Simulation
        let zeroGammaLevel = null;
        let minAbsGex = Infinity;
        const startSimStrike = Math.floor((spotPrice - 2000) / strikeInterval) * strikeInterval;
        const endSimStrike = Math.ceil((spotPrice + 2000) / strikeInterval) * strikeInterval;
        for (let simSpot = startSimStrike; simSpot <= endSimStrike; simSpot += strikeInterval) {
            let simGexScore = 0;
            tradingSymbols.forEach((sym) => {
                const quote = quotes[sym];
                const instInfo = instrumentMap.get(sym);
                if (quote && quote.oi && instInfo && instInfo.strike) {
                    const simWeight = Math.max(0, 1 - (Math.abs(instInfo.strike - simSpot) / (strikeInterval * 20)));
                    if (instInfo.instrument_type === 'CE') simGexScore += (quote.oi * simWeight);
                    if (instInfo.instrument_type === 'PE') simGexScore -= (quote.oi * simWeight);
                }
            });
            if (Math.abs(simGexScore) < minAbsGex) {
                minAbsGex = Math.abs(simGexScore);
                zeroGammaLevel = simSpot;
            }
        }

        // --- Skew Logic ---
        const otmPercentage = 0.03;
        const targetCallStrike = Math.round((spotPrice * (1 + otmPercentage)) / strikeInterval) * strikeInterval;
        const targetPutStrike = Math.round((spotPrice * (1 - otmPercentage)) / strikeInterval) * strikeInterval;

        const callInst = nearestExpiryInstruments.find(i => i.strike === targetCallStrike && i.instrument_type === 'CE');
        const putInst = nearestExpiryInstruments.find(i => i.strike === targetPutStrike && i.instrument_type === 'PE');

        let skewSpread = 0;
        let skewDataObj = {};

        if (callInst && putInst) {
            // Need to fetch these specifically if they fell outside the +/- 30 boundary
            let callLTP = 0, putLTP = 0;
            const cSym = `NFO:${callInst.tradingsymbol}`;
            const pSym = `NFO:${putInst.tradingsymbol}`;

            if (quotes[cSym] && quotes[pSym]) {
                callLTP = quotes[cSym].last_price;
                putLTP = quotes[pSym].last_price;
            } else {
                try {
                    const extraQuotes = await kite.getQuote([cSym, pSym]);
                    callLTP = extraQuotes[cSym]?.last_price || 0;
                    putLTP = extraQuotes[pSym]?.last_price || 0;
                } catch (e) { }
            }

            const riskFreeRate = 0.07;
            let callIV = 0, putIV = 0;
            if (callLTP > 0) try { callIV = calculateImpliedVolatility(callLTP, spotPrice, targetCallStrike, timeToExpiryYears, riskFreeRate, 'CE'); } catch (e) { }
            if (putLTP > 0) try { putIV = calculateImpliedVolatility(putLTP, spotPrice, targetPutStrike, timeToExpiryYears, riskFreeRate, 'PE'); } catch (e) { }

            skewSpread = putIV - callIV;

            skewDataObj = {
                call: { strike: targetCallStrike, ltp: callLTP, iv: (callIV * 100).toFixed(2) },
                put: { strike: targetPutStrike, ltp: putLTP, iv: (putIV * 100).toFixed(2) },
                skewSpread: (skewSpread * 100).toFixed(2)
            }
        }

        let skewScore = 0;
        const skewNum = parseFloat((skewSpread * 100).toFixed(2) || '0');
        if (skewNum > 0) {
            skewScore = Math.max(-2.5, (skewNum / 10) * -2.5);
        } else {
            skewScore = Math.min(2.5, (skewNum / -10) * 2.5);
        }

        // --- Build Mega Response ---
        return NextResponse.json({
            status: "success",
            timestamp: new Date().toISOString(),
            spotPrice,
            indiaVix,
            underlying,
            nearestExpiry,
            availableExpiries,

            pcr: {
                pcr: pcrVal.toFixed(4),
                totalCallOI,
                totalPutOI,
                nearestExpiry,
                availableExpiries,
                atmStrike,
                score: pcrScore
            },

            vpcr: {
                vpcr: vpcrVal.toFixed(2),
                totalPutVolume,
                totalCallVolume,
                underlying,
                expiry: nearestExpiry,
                score: vpcrScore
            },

            maxPain: {
                maxPainStrike,
                minTotalLoss,
                atmStrike,
                nearestExpiry,
                availableExpiries,
                painDistribution,
                score: maxPainScore
            },

            gex: {
                netGexScore,
                totalCallOi: totalCallOI,
                totalPutOi: totalPutOI,
                interpretation: gexInterpretation,
                sentimentColor: gexSentimentColor,
                underlying,
                expiry: nearestExpiry,
                topPositiveStrikes,
                topNegativeStrikes,
                zeroGammaLevel,
                score: gexScore
            },

            skew: {
                spotPrice,
                daysToExpiry: daysToExpiry.toFixed(2),
                expiry_date: nearestExpiry,
                availableExpiries,
                ...skewDataObj,
                score: skewScore
            }
        });

    } catch (error: any) {
        console.error("Live Metrics Master Engine Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
