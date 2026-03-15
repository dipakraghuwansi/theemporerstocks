import { calculateImpliedVolatility } from '../lib/blackScholes';
import { KiteConnect, KiteTicker } from 'kiteconnect';

let instrumentMap = new Map<number, any>(); // instrument_token -> instrument info
let activeTokens: number[] = [];let currentAvailableExpiries: string[] = [];
const latestMarketData = new Map<number, { last_price: number, oi: number, volume: number }>();
const cachedStructuralMetrics: any = null;
const lastStructuralFetchTime = 0;

let currentSpotPrice = 0;
let currentIndiaVix = 0;
let lastCalculatedMetrics: any = null;

const intradayHistory: any[] = [];
let ioServer: any = null;

const UNDERLYING = 'NIFTY';
const SPOT_TRADINGSYMBOL = 'NSE:NIFTY 50';
const SPOT_TOKEN = 256265;
const VIX_TOKEN = 264969; // NSE:INDIA VIX

export async function fetchInstruments() {
    try {
        console.log('[Quant Engine] Downloading master instruments CSV from Kite...');
        const response = await fetch('https://api.kite.trade/instruments');
        if (!response.ok) throw new Error('Failed to fetch instruments');
        const csvText = await response.text();
        const lines = csvText.split('\n');
        
        let spotFound = false;
        let vixFound = false;
        const tempMap = new Map<number, any>();
        
        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',');
            if (cols.length < 12) continue;
            
            const token = parseInt(cols[0]);
            const tradingsymbol = cols[2].replace(/"/g, '');
            const name = cols[3].replace(/"/g, '');
            const expiry = cols[5].replace(/"/g, '');
            const strike = parseFloat(cols[6].replace(/"/g, '') || '0');
            const instrument_type = cols[9].replace(/"/g, '');
            const exchange = cols[11].replace(/"/g, '').trim();

            if (token === SPOT_TOKEN) spotFound = true;
            if (token === VIX_TOKEN) vixFound = true;

            if (exchange === 'NFO' && instrument_type !== 'FUT' && name === UNDERLYING) {
                tempMap.set(token, {
                    token, tradingsymbol, name, expiry, strike, instrument_type, exchange
                });
            } else if (token === SPOT_TOKEN) {
                tempMap.set(token, { token, tradingsymbol, name: 'NIFTY 50', type: 'SPOT' });
            } else if (token === VIX_TOKEN) {
                tempMap.set(token, { token, tradingsymbol, name: 'INDIA VIX', type: 'VIX' });
            }
        }
        
        instrumentMap = tempMap;
        console.log(`[Quant Engine] Parsed ${instrumentMap.size} relevant instruments.`);
        return true;
    } catch (err) {
        console.error('[Quant Engine] Error fetching instruments:', err);
        return false;
    }
}

export async function onTickerConnect(ticker: KiteTicker, kite: KiteConnect) {
    if (instrumentMap.size === 0) {
        await fetchInstruments();
    }
    
    // Subscribe to spot and vix first
    try {
        // Fetch current quote to get spot price, which tells us which strikes to subscribe to
        const quotes = await kite.getQuote(['NSE:NIFTY 50']);
        currentSpotPrice = quotes['NSE:NIFTY 50']?.last_price || 24000;
        
        updateSubscriptions(ticker);
    } catch (e) {
        console.error('[Quant Engine] Error starting subscriptions:', e);
    }
}

export function updateSubscriptions(ticker: KiteTicker) {
    if (!currentSpotPrice) return;
    
    // Find nearest expiry
    const now = new Date();
    now.setHours(0,0,0,0);
    
    const allExpiries = new Set<string>();
    for (const inst of instrumentMap.values()) {
        if (inst.expiry) allExpiries.add(inst.expiry);
    }
    const sortedExpiries = Array.from(allExpiries).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    
    let nearestExpiry = sortedExpiries[0];
    for (const exp of sortedExpiries) {
        const d = new Date(exp);
        d.setHours(0,0,0,0);
        if (d.getTime() >= now.getTime()) {
            nearestExpiry = exp;
            break;
        }
    }
    
    let availableExpiries = sortedExpiries.filter(e => {
        const d = new Date(e);
        d.setHours(0,0,0,0);
        return d.getTime() >= now.getTime();
    });
    currentAvailableExpiries = availableExpiries;

    // Get ATM +/- 30 strikes
    const strikeInterval = 50;
    const atmStrike = Math.round(currentSpotPrice / strikeInterval) * strikeInterval;
    const minStrike = atmStrike - (30 * strikeInterval);
    const maxStrike = atmStrike + (30 * strikeInterval);
    
    const tokensToSubscribe = [SPOT_TOKEN, VIX_TOKEN];
    
    for (const inst of instrumentMap.values()) {
        if (inst.expiry === nearestExpiry && inst.strike >= minStrike && inst.strike <= maxStrike) {
            tokensToSubscribe.push(inst.token);
        }
    }
    
    if (activeTokens.length > 0) {
        ticker.unsubscribe(activeTokens);
    }
    
    activeTokens = tokensToSubscribe;
    ticker.subscribe(activeTokens);
    ticker.setMode(ticker.modeFull, activeTokens);
    
    console.log(`[Quant Engine] Subscribed to ${activeTokens.length} tokens for expiry ${nearestExpiry}`);
}

export function handleTick(ticks: any[]) {
    for (const tick of ticks) {
        const token = tick.instrument_token;
        if (token === SPOT_TOKEN) {
            currentSpotPrice = tick.last_price;
        } else if (token === VIX_TOKEN) {
            currentIndiaVix = tick.last_price;
        }
        
        latestMarketData.set(token, {
            last_price: tick.last_price,
            oi: tick.oi || 0,
            volume: tick.volume_traded || 0
        });
    }
}

export function getLatestQuantData() {
    return lastCalculatedMetrics || { status: 'waiting_for_data' };
}

export function getHistoricalMetrics() {
    return intradayHistory;
}

export function startQuantEngine(io: any) {
    ioServer = io;
    
    // Fast Loop: Emit raw non-calculated metrics (Spot, VIX) every 1 second
    setInterval(() => {
        if (!ioServer || !currentSpotPrice) return;
        
        // Merge the latest spot and VIX with the last known calculated metrics
        if (lastCalculatedMetrics) {
            ioServer.emit('update', {
                ...lastCalculatedMetrics,
                spotPrice: currentSpotPrice,
                indiaVix: currentIndiaVix,
                timestamp: new Date().toISOString()
            });
        }
    }, 1000);

    // Main Calculation Loop: Every 2 seconds (Fast enough for scalp trading, slow enough to not overwhelm the frontend render cycle)
    setInterval(() => {
        calculateMetricsAndEmit();
    }, 2000);
}

function calculateMetricsAndEmit() {
    if (!currentSpotPrice || instrumentMap.size === 0 || activeTokens.length < 5) {
        console.log(`[Quant Engine] Waiting for enough data to calculate metrics (Spot: ${currentSpotPrice}, Instruments: ${instrumentMap.size}, Subscribed: ${activeTokens.length})`);
        return;
    }
    
    const startTime = performance.now();
    
    console.log(`[Quant Engine] Calculating metrics at ${currentSpotPrice} for ${activeTokens.length} active options...`);
    const strikeInterval = 50;
    const atmStrike = Math.round(currentSpotPrice / strikeInterval) * strikeInterval;
    
    // Group active tokens
    let totalCallOI = 0;
    let totalPutOI = 0;
    let totalCallVolume = 0;
    let totalPutVolume = 0;
    let netGexScore = 0;
    const strikeGexMap = new Map<number, number>();
    const strikeData = new Map<number, { ce_oi: number, pe_oi: number }>();
    
    let nearestExpiry = '';
    
    for (const token of activeTokens) {
        if (token === SPOT_TOKEN || token === VIX_TOKEN) continue;
        const inst = instrumentMap.get(token);
        const md = latestMarketData.get(token);
        if (!inst || !md) continue;
        
        nearestExpiry = inst.expiry;
        const strike = inst.strike;
        const type = inst.instrument_type;
        
        // Accumulate OI
        if (type === 'CE') {
            totalCallOI += md.oi;
            if (Math.abs(strike - atmStrike) <= (strikeInterval * 10)) totalCallVolume += md.volume;
        } else if (type === 'PE') {
            totalPutOI += md.oi;
            if (Math.abs(strike - atmStrike) <= (strikeInterval * 10)) totalPutVolume += md.volume;
        }
        
        // Max Pain Data (within +/- 15 strikes)
        if (Math.abs(strike - atmStrike) <= (strikeInterval * 15)) {
            const sd = strikeData.get(strike) || { ce_oi: 0, pe_oi: 0 };
            if (type === 'CE') sd.ce_oi = md.oi;
            if (type === 'PE') sd.pe_oi = md.oi;
            strikeData.set(strike, sd);
        }
        
        // GEX Logic (Taper over 20 strikes)
        const weight = Math.max(0, 1 - (Math.abs(strike - currentSpotPrice) / (strikeInterval * 20)));
        if (weight > 0) {
            const currentStrikeGex = strikeGexMap.get(strike) || 0;
            if (type === 'CE') {
                const addedGex = md.oi * weight;
                netGexScore += addedGex;
                strikeGexMap.set(strike, currentStrikeGex + addedGex);
            } else if (type === 'PE') {
                const subGex = md.oi * weight;
                netGexScore -= subGex;
                strikeGexMap.set(strike, currentStrikeGex - subGex);
            }
        }
    }

    const allStrikeGexPairs = Array.from(strikeGexMap.entries());
    const topPositiveStrikes = [...allStrikeGexPairs].sort((a, b) => b[1] - a[1]).filter(p => p[1] > 0).slice(0, 3).map(p => ({ strike: p[0], gex: p[1] }));
    const topNegativeStrikes = [...allStrikeGexPairs].sort((a, b) => a[1] - b[1]).filter(p => p[1] < 0).slice(0, 3).map(p => ({ strike: p[0], gex: p[1] }));
    
    // Calculate PCR
    const pcrVal = totalCallOI > 0 ? totalPutOI / totalCallOI : 0;
    let pcrInverted = (pcrVal - 1.0) * (2.5 / 0.4) * -1;
    if (pcrVal > 1.45) pcrInverted = 2.5;
    if (pcrVal < 0.55) pcrInverted = -2.5;
    const pcrScore = Math.max(-2.5, Math.min(2.5, pcrInverted));

    // Calculate VPCR
    const vpcrVal = totalCallVolume > 0 ? totalPutVolume / totalCallVolume : 0;
    const vpcrScore = Math.max(-2.5, Math.min(2.5, (1.0 - vpcrVal) * 5));

    // Calculate Max Pain
    const strikesToTest = Array.from(strikeData.keys()).sort((a,b)=>a-b);
    let maxPainStrike = atmStrike;
    let minTotalLoss = Number.MAX_SAFE_INTEGER;
    const painDistribution: any[] = [];
    
    for (const assumedSpot of strikesToTest) {
        let totalIntrinsicValue = 0;
        for (const [strike, data] of strikeData.entries()) {
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

    // Skew Logic
    const otmPercentage = 0.03;
    const targetCallStrike = Math.round((currentSpotPrice * (1 + otmPercentage)) / strikeInterval) * strikeInterval;
    const targetPutStrike = Math.round((currentSpotPrice * (1 - otmPercentage)) / strikeInterval) * strikeInterval;
    
    let callLTP = 0, putLTP = 0;
    for (const token of activeTokens) {
        const inst = instrumentMap.get(token);
        if (!inst || inst.expiry !== nearestExpiry) continue;
        if (inst.strike === targetCallStrike && inst.instrument_type === 'CE') {
            callLTP = latestMarketData.get(token)?.last_price || 0;
        }
        if (inst.strike === targetPutStrike && inst.instrument_type === 'PE') {
            putLTP = latestMarketData.get(token)?.last_price || 0;
        }
    }

    const expDate = new Date(nearestExpiry);
    expDate.setHours(23, 59, 59, 999);
    const rightNow = new Date();
    const daysToExpiry = Math.max((expDate.getTime() - rightNow.getTime()) / (1000 * 60 * 60 * 24), 0.001);
    const timeToExpiryYears = daysToExpiry / 365.0;

    let callIV = 0, putIV = 0;
    if (callLTP > 0) {
        try { callIV = calculateImpliedVolatility(callLTP, currentSpotPrice, targetCallStrike, timeToExpiryYears, 0.07, 'CE'); } catch (e) {}
    }
    if (putLTP > 0) {
        try { putIV = calculateImpliedVolatility(putLTP, currentSpotPrice, targetPutStrike, timeToExpiryYears, 0.07, 'PE'); } catch (e) {}
    }
    
    const skewSpread = putIV - callIV;
    const skewNum = parseFloat((skewSpread * 100).toFixed(2) || '0');
    let skewScore = 0;
    if (skewNum > 0) skewScore = Math.max(-2.5, (skewNum / 10) * -2.5);
    else skewScore = Math.min(2.5, (skewNum / -10) * 2.5);

    const skewObj = {
        spotPrice: currentSpotPrice,
        daysToExpiry: daysToExpiry.toFixed(2),
        call: { strike: targetCallStrike, ltp: callLTP, iv: (callIV * 100).toFixed(2) },
        put: { strike: targetPutStrike, ltp: putLTP, iv: (putIV * 100).toFixed(2) },
        skewSpread: (skewSpread * 100).toFixed(2),
        score: skewScore
    };

    // Build Payload
    const gexScore = Math.max(-2.5, Math.min(2.5, (netGexScore / 1000000) * 2.5));
    
    let gexInterpretation = "Neutral GEX";
    if (netGexScore > 1000000) {
        gexInterpretation = "Positive GEX (Volatility Suppressed / Market Pinned)";
    } else if (netGexScore < -1000000) {
        gexInterpretation = "Negative GEX (Volatility Amplified / Breakout Risk)";
    }

    // Zero Gamma
    let zeroGammaLevel = atmStrike;
    let minAbsGex = Infinity;
    for (let simSpot = atmStrike - 1000; simSpot <= atmStrike + 1000; simSpot += strikeInterval) {
        let simGexScore = 0;
        for (const token of activeTokens) {
            const inst = instrumentMap.get(token);
            const md = latestMarketData.get(token);
            if (!inst || !md || inst.type) continue;
            
            const simWeight = Math.max(0, 1 - (Math.abs(inst.strike - simSpot) / (strikeInterval * 20)));
            if (inst.instrument_type === 'CE') simGexScore += (md.oi * simWeight);
            if (inst.instrument_type === 'PE') simGexScore -= (md.oi * simWeight);
        }
        if (Math.abs(simGexScore) < minAbsGex) {
            minAbsGex = Math.abs(simGexScore);
            zeroGammaLevel = simSpot;
        }
    }

    const currentMetrics = {
        timestamp: new Date().toISOString(),
        spotPrice: currentSpotPrice,
        indiaVix: currentIndiaVix,
        atmStrike,
        nearestExpiry,
        availableExpiries: currentAvailableExpiries,
        
        pcr: { pcr: pcrVal.toFixed(4), totalCallOI, totalPutOI, atmStrike, nearestExpiry, score: pcrScore },
        vpcr: { vpcr: vpcrVal.toFixed(2), totalPutVolume, totalCallVolume, score: vpcrScore },
        maxPain: { maxPainStrike, minTotalLoss, atmStrike, nearestExpiry, score: maxPainScore, painDistribution },
        gex: { netGexScore, score: gexScore, zeroGammaLevel, topPositiveStrikes, topNegativeStrikes, interpretation: gexInterpretation },
        skew: skewObj
    };

    lastCalculatedMetrics = currentMetrics;
    
    // Keep Intraday History
    intradayHistory.push(currentMetrics);
    
    // Keep last 12 hours (Assuming 1 update per 10s = 360 per hr = 4320)
    if (intradayHistory.length > 5000) intradayHistory.shift();

    if (ioServer) {
        ioServer.emit('update', currentMetrics);
    }
    
    const endTime = performance.now();
    console.log(`[Quant Engine] Calculations completed in ${(endTime - startTime).toFixed(2)} ms`);
}
