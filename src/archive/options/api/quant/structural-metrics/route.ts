import { NextRequest, NextResponse } from 'next/server';
import { getKiteInstance } from '@/lib/kiteHelper';

// Map common indices to their Kite instrument tokens
const INDEX_TOKENS: Record<string, string> = {
    'NIFTY': '256265',
    'NIFTY50': '256265',
    'BANKNIFTY': '260105',
    'SENSEX': '265'
};
const INDIA_VIX_TOKEN = '264969';

const DAY_MS = 24 * 60 * 60 * 1000;

// Global caches for constituents
let nifty50Cache: string[] | null = null;
let lastNifty50FetchTime = 0;
let midcap150Cache: string[] | null = null;
let lastMidcap150FetchTime = 0;

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const url = new URL(request.url);
        const asset = url.searchParams.get('asset')?.toUpperCase() || 'NIFTY';
        const token = request.cookies.get('kite_access_token')?.value;

        if (!token) return NextResponse.json({ error: "Not authenticated with Kite" }, { status: 401 });

        const instrumentToken = INDEX_TOKENS[asset] || INDEX_TOKENS['NIFTY'];
        if (!instrumentToken) return NextResponse.json({ error: `Instrument token mapping not found for ${asset}` }, { status: 400 });

        const kite = getKiteInstance(token) as any;

        // Ensure dates are correctly formatted for Kite
        const toDate = new Date();
        const fromDate45 = new Date();
        fromDate45.setDate(toDate.getDate() - 45);
        const fromDate365 = new Date();
        fromDate365.setFullYear(toDate.getFullYear() - 1);

        const formatDate = (date: Date) => date.toISOString().split('T')[0];

        // --- STEP 1: Execute concurrent historical data fetches ---
        const [vixData, assetData] = await Promise.all([
            kite.getHistoricalData(INDIA_VIX_TOKEN, 'day', formatDate(fromDate365), formatDate(toDate), false).catch(() => []),
            kite.getHistoricalData(instrumentToken, 'day', formatDate(fromDate45), formatDate(toDate), false).catch(() => [])
        ]);

        if (!vixData || vixData.length < 50) {
            console.warn("Insufficient historical data for INDIA VIX IV Rank");
        }
        if (!assetData || assetData.length < 21) {
            console.warn("Insufficient historical data for Z-Score/Velocity");
        }

        // --- IV RANK LOGIC (Requires 1 Year VIX) ---
        let ivRankData = null;
        if (vixData.length >= 50) {
            const closingVix = vixData.map((d: any) => d.close);
            const currentIV = closingVix[closingVix.length - 1];
            const highIV = Math.max(...closingVix);
            const lowIV = Math.min(...closingVix);

            const rawIvRank = ((currentIV - lowIV) / (highIV - lowIV)) * 100;
            const ivRank = Math.max(0, Math.min(100, rawIvRank));

            let daysLower = 0;
            for (const vix of closingVix) {
                if (vix < currentIV) daysLower++;
            }
            const ivPercentile = (daysLower / closingVix.length) * 100;

            let interpretation = "Neutral Volatility Regime";
            let sentimentColor = "text-slate-400";
            let actionBias = "Directional Plays (Debit Spreads)";
            let biasExplanation = "Implied Volatility is near its historical average.";

            if (ivRank > 80) {
                interpretation = "Extreme Volatility Expansion";
                sentimentColor = "text-rose-400";
                actionBias = "Aggressive Premium Selling";
                biasExplanation = "Volatility has spiked into top 20%. Options are incredibly expensive. Sell premium.";
            } else if (ivRank > 50) {
                interpretation = "Elevated Volatility (Expensive Options)";
                sentimentColor = "text-orange-400";
                actionBias = "Premium Selling (Credit Spreads)";
                biasExplanation = "Volatility is higher than average. Writing Credit Spreads is favorable.";
            } else if (ivRank < 20) {
                interpretation = "Volatility Contraction (Cheap Premiums)";
                sentimentColor = "text-emerald-400";
                actionBias = "Premium Buying (Long Straddles)";
                biasExplanation = "Volatility is crushed. Options are statistically cheap. Buy Puts/Calls.";
            }

            ivRankData = {
                currentIV: currentIV.toFixed(2),
                ivRank: ivRank.toFixed(1),
                ivPercentile: ivPercentile.toFixed(1),
                highIV: highIV.toFixed(2),
                lowIV: lowIV.toFixed(2),
                totalDaysAnalyzed: closingVix.length,
                interpretation,
                sentimentColor,
                actionBias,
                biasExplanation,
                historicalPoints: closingVix.slice(-60)
            };
        }

        // --- Z-SCORE LOGIC (Requires 20 day Asset closes) ---
        let zScoreData = null;
        if (assetData.length >= 20) {
            const closingPrices = assetData.slice(-20).map((d: any) => d.close);
            const currentSpot = closingPrices[closingPrices.length - 1];
            const sum = closingPrices.reduce((a: number, b: number) => a + b, 0);
            const sma20 = sum / 20;
            const variance = closingPrices.map((p: number) => Math.pow(p - sma20, 2)).reduce((a: number, b: number) => a + b, 0) / 20;
            const stdDev20 = Math.sqrt(variance);

            let zScore = 0;
            if (stdDev20 > 0) zScore = (currentSpot - sma20) / stdDev20;

            let interpretation = "Mean Channel";
            let sentimentColor = "text-slate-400";
            if (zScore > 2.0) { interpretation = "Euphoria Extreme (Reversal Warning)"; sentimentColor = "text-rose-400"; }
            else if (zScore > 1.0) { interpretation = "Overbought (Trending Up)"; sentimentColor = "text-orange-400"; }
            else if (zScore < -2.0) { interpretation = "Panic Extreme (Reversal Warning)"; sentimentColor = "text-emerald-400"; }
            else if (zScore < -1.0) { interpretation = "Oversold (Trending Down)"; sentimentColor = "text-rose-400"; }

            zScoreData = {
                asset: asset,
                zScore: zScore.toFixed(2),
                currentSpot: currentSpot.toFixed(2),
                sma20: sma20.toFixed(2),
                stdDev20: stdDev20.toFixed(2),
                interpretation,
                sentimentColor,
                historicalPoints: closingPrices
            };
        }

        // --- VELOCITY LOGIC (Requires 21 day Asset closes) ---
        let velocityData = null;
        if (assetData.length >= 21) {
            const closePrices = assetData.map((d: any) => d.close);

            const ema9Arr = [closePrices[0]];
            const k9 = 2 / 10;
            for (let i = 1; i < closePrices.length; i++) ema9Arr.push(closePrices[i] * k9 + ema9Arr[i - 1] * (1 - k9));

            const ema21Arr = [closePrices[0]];
            const k21 = 2 / 22;
            for (let i = 1; i < closePrices.length; i++) ema21Arr.push(closePrices[i] * k21 + ema21Arr[i - 1] * (1 - k21));

            const currentSpot = closePrices[closePrices.length - 1];
            const currentEma9 = ema9Arr[ema9Arr.length - 1];
            const currentEma21 = ema21Arr[ema21Arr.length - 1];
            const previousEma9 = ema9Arr[ema9Arr.length - 2];
            const previousEma21 = ema21Arr[ema21Arr.length - 2];

            let velocityStatus = "Neutral Structure";
            let trendColor = "text-slate-400";
            let isGoldenCross = false;
            let isDeathCross = false;

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

            velocityData = {
                velocityStatus,
                trendColor,
                isGoldenCross,
                isDeathCross,
                currentEma9: currentEma9.toFixed(2),
                currentEma21: currentEma21.toFixed(2),
                currentSpot,
                spread: (currentEma9 - currentEma21).toFixed(2)
            };
        }

        // --- NIFTY 50 VWAP BREADTH LOGIC ---
        let niftyBreadthData = null;
        try {
            // STEP A: Hydrate Cache if dead
            const nowMs = Date.now();
            if (!nifty50Cache || (nowMs - lastNifty50FetchTime > DAY_MS)) {
                // Dynamically fetch from Official NSE Source: https://www.niftyindices.com/IndexConstituent/ind_nifty50list.csv
                try {
                    const response = await fetch('https://www.niftyindices.com/IndexConstituent/ind_nifty50list.csv', {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                        },
                        cache: 'no-store'
                    });

                    if (response.ok) {
                        const csvText = await response.text();
                        const lines = csvText.split('\n');
                        const symbols: string[] = [];

                        // Header: Company Name,Industry,Symbol,Series,ISIN Code
                        for (let i = 1; i < lines.length; i++) {
                            const line = lines[i].trim();
                            if (!line) continue;
                            const parts = line.split(',');
                            if (parts.length >= 3) {
                                const symbol = parts[2].trim();
                                if (symbol && symbol !== 'Symbol') {
                                    symbols.push(`NSE:${symbol}`);
                                }
                            }
                        }

                        if (symbols.length >= 45) { // Sanity check to ensure we didn't get a partial or garbled response
                            nifty50Cache = symbols.slice(0, 50);
                            console.log(`Successfully hydrated Nifty 50 cache with ${nifty50Cache.length} stocks from NSE CSV`);
                        }
                    }
                } catch (fetchError) {
                    console.error("Failed to fetch official Nifty 50 CSV, falling back to static cache:", fetchError);
                }

                // Initial Fallback / Safety Catch
                if (!nifty50Cache) {
                    nifty50Cache = [
                        "NSE:ADANIENT", "NSE:ADANIPORTS", "NSE:APOLLOHOSP", "NSE:ASIANPAINT", "NSE:AXISBANK",
                        "NSE:BAJAJ-AUTO", "NSE:BAJFINANCE", "NSE:BAJAJFINSV", "NSE:BEL", "NSE:BHARTIARTL",
                        "NSE:CIPLA", "NSE:COALINDIA", "NSE:DRREDDY", "NSE:EICHERMOT", "NSE:ETERNAL",
                        "NSE:GRASIM", "NSE:HCLTECH", "NSE:HDFCBANK", "NSE:HDFCLIFE", "NSE:HINDALCO",
                        "NSE:HINDUNILVR", "NSE:ICICIBANK", "NSE:ITC", "NSE:INFY", "NSE:INDIGO",
                        "NSE:JSWSTEEL", "NSE:JIOFIN", "NSE:KOTAKBANK", "NSE:LT", "NSE:M&M",
                        "NSE:MARUTI", "NSE:MAXHEALTH", "NSE:NTPC", "NSE:NESTLEIND", "NSE:ONGC",
                        "NSE:POWERGRID", "NSE:RELIANCE", "NSE:SBILIFE", "NSE:SHRIRAMFIN", "NSE:SBIN",
                        "NSE:SUNPHARMA", "NSE:TCS", "NSE:TATACONSUM", "NSE:TMPV", "NSE:TATASTEEL",
                        "NSE:TECHM", "NSE:TITAN", "NSE:TRENT", "NSE:ULTRACEMCO", "NSE:WIPRO"
                    ];
                }

                lastNifty50FetchTime = nowMs;
            }

            // STEP A2: Hydrate Midcap 150 Cache if dead
            if (!midcap150Cache || (nowMs - lastMidcap150FetchTime > DAY_MS)) {
                try {
                    const response = await fetch('https://www.niftyindices.com/IndexConstituent/ind_niftymidcap150list.csv', {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                        },
                        cache: 'no-store'
                    });

                    if (response.ok) {
                        const csvText = await response.text();
                        const lines = csvText.split('\n');
                        const symbols: string[] = [];

                        for (let i = 1; i < lines.length; i++) {
                            const line = lines[i].trim();
                            if (!line) continue;
                            const parts = line.split(',');
                            if (parts.length >= 3) {
                                const symbol = parts[2].trim();
                                if (symbol && symbol !== 'Symbol') {
                                    symbols.push(`NSE:${symbol}`);
                                }
                            }
                        }

                        if (symbols.length >= 140) {
                            midcap150Cache = symbols.slice(0, 150);
                            console.log(`Successfully hydrated Midcap 150 cache with ${midcap150Cache.length} stocks from NSE CSV`);
                        }
                    }
                } catch (fetchError) {
                    console.error("Failed to fetch official Midcap 150 CSV:", fetchError);
                }

                if (!midcap150Cache) {
                    // Minimal fallback if fetch fails - in a real app we'd keep previous cache or fetch from DB
                    midcap150Cache = [];
                }
                lastMidcap150FetchTime = nowMs;
            }

            // STEP B: Fire single CONSOLIDATED array getQuote (Nifty 50 + Midcap 150)
            const allSymbols = [...(nifty50Cache || []), ...(midcap150Cache || [])];
            const quotes = await kite.getQuote(allSymbols);

            // PROCESS NIFTY 50 BREADTH
            let bullishCount = 0;
            let bearishCount = 0;
            let totalProcessed = 0;

            if (nifty50Cache) {
                for (const sym of nifty50Cache) {
                    const q = quotes[sym];
                    if (q && q.last_price !== undefined) {
                        const anchorPrice = q.average_price ? q.average_price : (q.ohlc?.close || q.last_price);
                        totalProcessed++;
                        if (q.last_price > anchorPrice) bullishCount++;
                        else bearishCount++;
                    }
                }
            }

            const missing = (nifty50Cache || []).filter((sym: string) => !quotes[sym] || quotes[sym].last_price === undefined);

            if (totalProcessed > 0) {
                const percentage = (bullishCount / totalProcessed) * 100;

                let interpretation = "Neutral Market Breadth";
                let sentimentColor = "text-slate-400";

                if (percentage >= 80) { interpretation = "Extreme Euphoria (>80% Bullish)"; sentimentColor = "text-emerald-400"; }
                else if (percentage >= 65) { interpretation = "Strong Bullish Control"; sentimentColor = "text-emerald-400"; }
                else if (percentage <= 20) { interpretation = "Extreme Panic (<20% Bullish)"; sentimentColor = "text-rose-400"; }
                else if (percentage <= 35) { interpretation = "Strong Bearish Control"; sentimentColor = "text-rose-400"; }

                const scaledScore = Math.max(-2.5, Math.min(2.5, ((percentage - 50) / 50) * 2.5));

                const llmContext = `${percentage.toFixed(1)}% (${bullishCount} out of ${totalProcessed}) of the Nifty 50 heavyweight components are currently trading above their daily VWAP (Volume-Weighted Average Price). This indicates ${interpretation}. If the index spot price is rising but this breadth percentage is very low (e.g., < 30%), the rally is highly fragile and likely manipulated by 1 or 2 specific heavyweights while the rest of the broader market bleeds. Conversely, a high breadth reading confirms a healthy, structurally sound rally.`;

                niftyBreadthData = {
                    bullishCount,
                    bearishCount,
                    totalProcessed,
                    percentage: percentage.toFixed(1),
                    interpretation,
                    sentimentColor,
                    score: scaledScore,
                    llmContext: llmContext,
                    missing: missing
                };
            }

            // PROCESS MIDCAP 150 BREADTH
            let midBullish = 0;
            let midBearish = 0;
            let midTotal = 0;

            if (midcap150Cache) {
                for (const sym of midcap150Cache) {
                    const q = quotes[sym];
                    if (q && q.last_price !== undefined) {
                        const anchorPrice = q.average_price ? q.average_price : (q.ohlc?.close || q.last_price);
                        midTotal++;
                        if (q.last_price > anchorPrice) midBullish++;
                        else midBearish++;
                    }
                }
            }

            if (midTotal > 0) {
                const midPercentage = (midBullish / midTotal) * 100;
                let midInterpretation = "Neutral Midcap Breadth";
                let midColor = "text-slate-400";

                if (midPercentage >= 75) { midInterpretation = "Extreme Risk-On (Bullish Midcaps)"; midColor = "text-emerald-400"; }
                else if (midPercentage <= 30) { midInterpretation = "Extreme Risk-Off (Midcap Bleeding)"; midColor = "text-rose-400"; }

                const midLlmContext = `${midPercentage.toFixed(1)}% (${midBullish} out of ${midTotal}) of the Nifty Midcap 150 components are above their daily VWAP. High midcap breadth indicates broad-based retail and institutional participation (Risk-On), whereas divergence between the Nifty 50 and Midcap Breadth often precedes a trend reversal.`;

                // Add to internal midcapBreadthData
                if (!niftyBreadthData) {
                    niftyBreadthData = {};
                }
                (niftyBreadthData as any).midcapBreadth = {
                    bullishCount: midBullish,
                    bearishCount: midBearish,
                    totalProcessed: midTotal,
                    percentage: midPercentage.toFixed(1),
                    interpretation: midInterpretation,
                    sentimentColor: midColor,
                    llmContext: midLlmContext
                };
            }
            // --- NEW: BREADTH EXTREMES EXTRACTION ---
            const getExtremes = (cache: string[] | null) => {
                if (!cache) return { topGainers: [], topLosers: [] };
                const data: any[] = [];
                for (const sym of cache) {
                    const q = quotes[sym];
                    if (q && q.last_price !== undefined) {
                        const anchorPrice = q.average_price ? q.average_price : (q.ohlc?.close || q.last_price);
                        if (anchorPrice > 0) {
                            const dev = ((q.last_price - anchorPrice) / anchorPrice) * 100;
                            data.push({
                                symbol: sym.replace('NSE:', ''),
                                price: q.last_price,
                                vwap: anchorPrice,
                                deviation: dev
                            });
                        }
                    }
                }
                const sorted = [...data].sort((a, b) => b.deviation - a.deviation);
                return {
                    topGainers: sorted.slice(0, 10),
                    topLosers: sorted.slice(-10).reverse()
                };
            };

            if (niftyBreadthData) {
                (niftyBreadthData as any).extremes = getExtremes(nifty50Cache);
                if ((niftyBreadthData as any).midcapBreadth) {
                    (niftyBreadthData as any).midcapBreadth.extremes = getExtremes(midcap150Cache);
                }
            }

        } catch (e: any) {
            console.error("Failed to compute Nifty Breadth:", e);
            niftyBreadthData = { error: e.message || String(e), stack: e.stack };
        }

        return NextResponse.json({
            status: "success",
            timestamp: new Date().toISOString(),
            ivRank: ivRankData,
            zScore: zScoreData,
            velocity: velocityData,
            niftyBreadth: niftyBreadthData,
            midcapBreadthData: (niftyBreadthData as any)?.midcapBreadth || null
        });

    } catch (error: any) {
        console.error("Structural Metrics Master Engine Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
