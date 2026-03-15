/**
 * ML/AI Microservice Connector
 * Bridges the NextJS application to the Python HMM/Execution Engine
 */

const ML_ENGINE_URL = process.env.ML_ENGINE_URL || 'http://127.0.0.1:8000';

export interface RegimePrediction {
    regime: string;
    confidence: number;
    suggested_weights: Record<string, number>;
    features: {
        volatility: number;
        cumulative_return: number;
    }
}

export async function getMarketRegime(closes: number[], volumes: number[]): Promise<RegimePrediction | null> {
    try {
        const res = await fetch(`${ML_ENGINE_URL}/predict_regime`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ closes, volumes })
        });

        if (!res.ok) {
            console.warn(`[ML Connector] Regime prediction failed: ${res.status}`);
            return null;
        }

        const data: RegimePrediction = await res.json();
        return data;
    } catch (err: any) {
        console.warn(`[ML Connector] Cannot connect to python engine at ${ML_ENGINE_URL}. Is it running? Error: ${err.message}`);
        return null;
    }
}
