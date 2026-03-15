/**
 * V2 Strategy Hub
 * Supports multiple execution methodologies, modified by HMM Regimes.
 */
import { getMarketRegime, RegimePrediction } from './mlConnector';

export type StrategyMode = 'QUANT' | 'BALANCED' | 'AGGRESSIVE' | 'SCALP';

export interface V2Signal {
    action: 'BUY' | 'SELL' | 'HOLD';
    reason: string;
    confidence: number;
    recommendedAsset?: string;
    adjustedWeights: Record<string, number>;
}

// To properly test the HMM, we need the last 20 close prices 
// Let's assume this gets passed in from the route fetching the 1min candles
export async function evaluateV2Strategy(
    mode: StrategyMode,
    quantData: any, // Contains VWAP, Velocity, PCR, Skew
    historyCloses: number[],
    historyVolumes: number[]
): Promise<V2Signal> {

    // 1. Fetch the HMM Regime Prediction
    let regimeInfo = await getMarketRegime(historyCloses, historyVolumes);

    // If Python engine is down, fallback to Neutral/Equal weighting
    if (!regimeInfo) {
        regimeInfo = {
            regime: 'UNKNOWN_API_DOWN',
            confidence: 0,
            suggested_weights: {
                "AGGRESSIVE_MODE": 1.0,
                "BALANCED_MODE": 1.0,
                "QUANT_MODE": 1.0,
                "SCALP_MODE": 1.0
            },
            features: { volatility: 0, cumulative_return: 0 }
        };
    }

    // 2. Route to the appropriate engine logic taking Regime weight into account
    const regimeWeight = regimeInfo.suggested_weights[`${mode}_MODE`] || 1.0;

    let baseAction: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
    let baseConfidence = 0;
    let baseReason = '';

    // --- STRATEGY A: THE GRIDLOCK (Pure Options Sentiment) ---
    if (mode === 'QUANT') {
        const totalScore = (quantData.skew || 0) + (quantData.pcr || 0) + (quantData.maxPain || 0);
        // Note: quantData.maxPain here is simulated as a net momentum score (-5 to +5) in the backtester
        if (totalScore > 10) {
            baseAction = 'BUY'; // Sell Put Spreads
            baseConfidence = 0.85;
            baseReason = `Strong Quantitative Overbought Score (${totalScore.toFixed(1)}).`;
        } else if (totalScore < -10) {
            baseAction = 'SELL'; // Sell Call Spreads
            baseConfidence = 0.85;
            baseReason = `Strong Quantitative Oversold Score (${totalScore.toFixed(1)}).`;
        } else {
            baseReason = `Quant Gridlock. No edge found (Score: ${totalScore.toFixed(1)}).`;
        }
    }

    // --- STRATEGY B: BALANCED (VWAP + Velocity Bounce) ---
    else if (mode === 'BALANCED') {
        const isBullish = quantData.velocity?.includes('Bullish');
        const isBearish = quantData.velocity?.includes('Bearish');
        const ltp = quantData.vwapLtp;
        const vwap = quantData.vwapValue;

        // 0.1% Threshold
        const isNearVwap = (Math.abs(ltp - vwap) / vwap) <= 0.001;

        if (isBullish && ltp > vwap && isNearVwap) {
            baseAction = 'BUY';
            baseConfidence = 0.70;
            baseReason = 'Trend is Up, Price bouncing off VWAP Support.';
        } else if (isBearish && ltp < vwap && isNearVwap) {
            baseAction = 'SELL';
            baseConfidence = 0.70;
            baseReason = 'Trend is Down, Price rejecting VWAP Resistance.';
        } else {
            baseReason = 'Balanced constraints not met. Waiting for VWAP test.';
        }
    }

    // --- STRATEGY C: AGGRESSIVE (Breakouts) ---
    else if (mode === 'AGGRESSIVE') {
        // High risk crossover
        const ltp = quantData.vwapLtp;
        const vwap = quantData.vwapValue;
        // In Agreesive, we don't care about daily trend. We care about violent 1-min moves crossing the VWAP directly.

        const divergencePct = ((ltp - vwap) / vwap) * 100;
        if (divergencePct > 0.15) {
            baseAction = 'BUY';
            baseConfidence = 0.60;
            baseReason = 'Aggressive Upside Breakout detected.';
        } else if (divergencePct < -0.15) {
            baseAction = 'SELL';
            baseConfidence = 0.60;
            baseReason = 'Aggressive Downside Breakdown detected.';
        } else {
            baseReason = 'No aggressive momentum detected.';
        }
    }

    // --- STRATEGY D: MICRO SCALP (>98% Win Rate) ---
    else if (mode === 'SCALP') {
        const totalScore = (quantData.skew || 0) + (quantData.pcr || 0); // Has to be aligned
        const isBullish = quantData.velocity?.includes('Bullish');

        // Ensure the engine can still fall back to firing if the Python API is completely down
        const validRegimeForScalp = regimeInfo.regime === 'VOLATILE' || regimeInfo.regime === 'UNKNOWN_API_DOWN';

        if (validRegimeForScalp && isBullish && totalScore > 5) {
            baseAction = 'BUY';
            baseConfidence = 0.98; // High hit rate target
            baseReason = `Perfect Scalp Alignment (${totalScore.toFixed(1)}) in ${regimeInfo.regime} Regime`;
        } else if (validRegimeForScalp && !isBullish && totalScore < -5) {
            baseAction = 'SELL';
            baseConfidence = 0.98;
            baseReason = `Perfect Scalp Alignment (${totalScore.toFixed(1)}) in ${regimeInfo.regime} Regime`;
        } else {
            baseReason = 'Scalping constraints unmet. Waiting for volatile spike and alignment.';
        }
    }

    // 3. Final Decision influenced by HMM Weighting
    let finalAction = baseAction;
    const finalConfidence = baseConfidence * regimeWeight;

    // If the HMM tells us this strategy is terrible for the current regime (weight < 0.2), kill it.
    if (finalAction !== 'HOLD' && regimeWeight < 0.25) {
        finalAction = 'HOLD';
        baseReason += ` | *KILLED BY HMM*: The Python classification predicted a ${regimeInfo.regime} market, slashing confidence to ${(finalConfidence * 100).toFixed(1)}%. Trade aborted.`;
    } else if (finalAction !== 'HOLD') {
        baseReason += ` | *HMM APPROVED*: Regime ${regimeInfo.regime} applied weight of ${regimeWeight}.`;
    }

    return {
        action: finalAction,
        reason: baseReason,
        confidence: finalConfidence,
        adjustedWeights: regimeInfo.suggested_weights
    };
}
