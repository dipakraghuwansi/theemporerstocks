import os
import json
import numpy as np
import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List

# In a real environment, you would use hmmlearn:
# from hmmlearn import hmm
# But since we are mocking the structure first to ensure the NextJS -> Python bridge works,
# we will use native math to mock a 3-state regime classification.

app = FastAPI(title="Quant HMM Regime Classifier")

class MarketDataPayload(BaseModel):
    # E.g. last 20 periods of close prices
    closes: List[float]
    volumes: List[float]

@app.get("/health")
def health_check():
    return {"status": "up", "model": "HMM-Mock-v1"}

@app.post("/predict_regime")
def predict_market_regime(data: MarketDataPayload):
    if len(data.closes) < 2:
        raise HTTPException(status_code=400, detail="Insufficient data points for HMM")

    # 1. Feature Engineering (Returns & Volatility)
    prices = np.array(data.closes)
    returns = np.diff(prices) / prices[:-1]
    
    # Simple Volatility over the window
    volatility = np.std(returns)
    
    # Cumulative Return over the window
    cum_ret = (prices[-1] - prices[0]) / prices[0]

    # --- MOCK HMM CLASSIFICATION LOGIC ---
    # Intended Regimes: 0=Choppy, 1=Trending Up, 2=Trending Down, 3=Volatile Whipsaw
    
    regime = "CHOPPY"
    confidence = 0.50
    weights = {
        "AGGRESSIVE_MODE": 0.0,
        "BALANCED_MODE": 0.0,
        "QUANT_MODE": 1.0,
        "SCALP_MODE": 0.5
    }

    # If volatility is extreme
    if volatility > 0.015:
        regime = "VOLATILE"
        confidence = 0.85
        weights = {
            "AGGRESSIVE_MODE": 0.2, # Very dangerous
            "BALANCED_MODE": 0.0,
            "QUANT_MODE": 0.5,
            "SCALP_MODE": 1.0 # Excellent for scalping
        }
    # If strongly trending up
    elif cum_ret > 0.02:
        regime = "TRENDING_BULL"
        confidence = 0.90
        weights = {
            "AGGRESSIVE_MODE": 1.0,
            "BALANCED_MODE": 1.0,
            "QUANT_MODE": 0.2,
            "SCALP_MODE": 0.8
        }
    # If strongly trending down
    elif cum_ret < -0.02:
        regime = "TRENDING_BEAR"
        confidence = 0.90
        weights = {
            "AGGRESSIVE_MODE": 1.0,
            "BALANCED_MODE": 1.0,
            "QUANT_MODE": 0.2,
            "SCALP_MODE": 0.8
        }

    return {
        "regime": regime,
        "confidence": confidence,
        "suggested_weights": weights,
        "features": {
            "volatility": float(volatility),
            "cumulative_return": float(cum_ret)
        }
    }

if __name__ == "__main__":
    # Run locally on port 8000
    uvicorn.run(app, host="0.0.0.0", port=8000)
