// src/lib/blackScholes.ts

// Standard Normal Cumulative Distribution Function approximation
export function standardNormalCDF(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const prob =
    d * t *
    (0.3193815 +
      t *
      (-0.3565638 +
        t * (1.7814779 + t * (-1.8212559 + t * 1.3302744))));
  return x > 0 ? 1 - prob : prob;
}

export type OptionType = 'CE' | 'PE';
export type OptionPosition = 'BUY' | 'SELL';

export interface OptionLeg {
  id: string;
  assetName: string;
  optionType: OptionType;
  position: OptionPosition;
  strikePrice: number;
  lotSize: number;
  numLots: number;
  entryPrice: number; // The premium paid or received
  currentLTP: number;
  expiry: string;
  targetProfit?: number; // Target price in points
  stopLoss?: number; // Stop loss price in points
}

/**
 * Calculates the theoretical price of an option using Black-Scholes.
 */
export function calculateBSPrice(
  spot: number,
  strike: number,
  timeToExpiryYears: number,
  riskFreeRate: number,
  volatility: number,
  optionType: OptionType
): number {
  // Handle edge cases
  if (timeToExpiryYears <= 0) {
    if (optionType === 'CE') return Math.max(0, spot - strike);
    else return Math.max(0, strike - spot);
  }

  const d1 =
    (Math.log(spot / strike) +
      (riskFreeRate + (volatility * volatility) / 2) * timeToExpiryYears) /
    (volatility * Math.sqrt(timeToExpiryYears));
  const d2 = d1 - volatility * Math.sqrt(timeToExpiryYears);

  if (optionType === 'CE') {
    return (
      spot * standardNormalCDF(d1) -
      strike * Math.exp(-riskFreeRate * timeToExpiryYears) * standardNormalCDF(d2)
    );
  } else {
    // Put Option
    return (
      strike * Math.exp(-riskFreeRate * timeToExpiryYears) * standardNormalCDF(-d2) -
      spot * standardNormalCDF(-d1)
    );
  }
}

/**
 * Calculates the Implied Volatility given standard option parameters and its current price.
 * Uses a binary search approach.
 */
export function calculateImpliedVolatility(
  targetPrice: number,
  spot: number,
  strike: number,
  timeToExpiryYears: number,
  riskFreeRate: number,
  optionType: OptionType,
  tolerance = 1e-4,
  maxIterations = 100
): number {
  // If intrinsic value is higher than target price, the model fails (arbitrage).
  const intrinsic = optionType === 'CE' ? Math.max(0, spot - strike) : Math.max(0, strike - spot);
  if (targetPrice < intrinsic) {
    return 0.0001; // Can't be negative, return minimum vol
  }

  let lowVol = 0.0001;
  let highVol = 5.0; // 500% max volatility assumed safe upper bound

  for (let i = 0; i < maxIterations; i++) {
    const midVol = (lowVol + highVol) / 2;
    const price = calculateBSPrice(
      spot,
      strike,
      timeToExpiryYears,
      riskFreeRate,
      midVol,
      optionType
    );

    if (Math.abs(price - targetPrice) < tolerance) {
      return midVol;
    }

    // Vega is generally positive for both calls and puts unless extremely deep ITM edge cases
    if (price > targetPrice) {
      highVol = midVol;
    } else {
      lowVol = midVol;
    }
  }
  return (lowVol + highVol) / 2;
}

/**
 * Finds what the Underlying Spot price needs to be for an option to hit a specific `targetOptionPrice`.
 * Assumes IV, Time to Expiry, and Risk-free rate stay constant.
 */
export function findTargetSpotPrice(
  targetOptionPrice: number,
  currentSpot: number,
  strike: number,
  timeToExpiryYears: number,
  riskFreeRate: number,
  impliedVolatility: number,
  optionType: OptionType,
  tolerance = 1e-2, // ~1 cent or paisa tolerance
  maxIterations = 100
): number {
  // Set boundaries for binary search of spot price
  let lowSpot = currentSpot * 0.1;
  let highSpot = currentSpot * 3.0;

  for (let i = 0; i < maxIterations; i++) {
    const midSpot = (lowSpot + highSpot) / 2;
    const price = calculateBSPrice(
      midSpot,
      strike,
      timeToExpiryYears,
      riskFreeRate,
      impliedVolatility,
      optionType
    );

    if (Math.abs(price - targetOptionPrice) < tolerance) {
      return midSpot;
    }

    if (optionType === 'CE') {
      // Call pricing goes UP as Spot price goes UP
      if (price > targetOptionPrice) {
        highSpot = midSpot;
      } else {
        lowSpot = midSpot;
      }
    } else {
      // Put pricing goes UP as Spot price goes DOWN
      if (price > targetOptionPrice) {
        lowSpot = midSpot; // we need a higher spot to lower the put price
      } else {
        highSpot = midSpot; // we need a lower spot to raise the put price
      }
    }
  }

  return (lowSpot + highSpot) / 2;
}

// -----------------------------------------------------------------------------------
// ADVANCED REFINEMENTS: GREEKS & CURVES
// -----------------------------------------------------------------------------------

export interface OptionGreeks {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
}

/**
 * Calculates the standard Greeks (Delta, Gamma, Theta, Vega)
 */
export function calculateGreeks(
  spot: number,
  strike: number,
  timeToExpiryYears: number,
  riskFreeRate: number,
  volatility: number,
  optionType: OptionType
): OptionGreeks {
  if (timeToExpiryYears <= 0 || volatility <= 0) {
    // Expiry cases
    return {
      delta: optionType === 'CE' ? (spot > strike ? 1 : 0) : (spot < strike ? -1 : 0),
      gamma: 0,
      theta: 0,
      vega: 0
    };
  }

  const d1 =
    (Math.log(spot / strike) +
      (riskFreeRate + (volatility * volatility) / 2) * timeToExpiryYears) /
    (volatility * Math.sqrt(timeToExpiryYears));
  const d2 = d1 - volatility * Math.sqrt(timeToExpiryYears);

  // Normal PDF
  const nd1 = (1 / Math.sqrt(2 * Math.PI)) * Math.exp((-d1 * d1) / 2);

  const delta = optionType === 'CE'
    ? standardNormalCDF(d1)
    : standardNormalCDF(d1) - 1;

  const gamma = nd1 / (spot * volatility * Math.sqrt(timeToExpiryYears));

  // Theta (usually represented as value loss per DAY)
  const term1 = -(spot * volatility * nd1) / (2 * Math.sqrt(timeToExpiryYears));
  let theta: number;

  if (optionType === 'CE') {
    const term2 = riskFreeRate * strike * Math.exp(-riskFreeRate * timeToExpiryYears) * standardNormalCDF(d2);
    theta = term1 - term2;
  } else {
    const term2 = riskFreeRate * strike * Math.exp(-riskFreeRate * timeToExpiryYears) * standardNormalCDF(-d2);
    theta = term1 + term2;
  }

  // Convert annual theta to daily theta
  const dailyTheta = theta / 365;

  // Vega (usually represented as value change per 1% change in vol)
  const vega = (spot * Math.sqrt(timeToExpiryYears) * nd1) / 100;

  return {
    delta,
    gamma,
    theta: dailyTheta,
    vega
  };
}

export interface CurvePoint {
  spot: number;
  price: number;
}

/**
 * Generates an array of theoretical Option Prices across a range of underlying Spot Prices
 * useful for plotting Interactive UI Sensitivity Charts.
 */
export function generatePriceCurve(
  currentSpot: number,
  strike: number,
  timeToExpiryYears: number,
  riskFreeRate: number,
  volatility: number,
  optionType: OptionType,
  rangePct = 0.05, // e.g., +/- 5% range around current spot
  dataPoints = 50
): CurvePoint[] {
  const curve: CurvePoint[] = [];
  const minSpot = currentSpot * (1 - rangePct);
  const maxSpot = currentSpot * (1 + rangePct);
  const step = (maxSpot - minSpot) / dataPoints;

  for (let s = minSpot; s <= maxSpot; s += step) {
    const theoreticalPrice = calculateBSPrice(
      s,
      strike,
      timeToExpiryYears,
      riskFreeRate,
      volatility,
      optionType
    );
    curve.push({
      spot: s,
      price: theoreticalPrice
    });
  }

  return curve;
}

/**
 * Calculates the combined Net Payoff at Expiration for a multi-leg options strategy across a range of spot prices.
 * Used for Strategy Builder Area Charts.
 */
export function calculateCombinedPayoff(
  legs: OptionLeg[],
  minSpot: number,
  maxSpot: number,
  stepPoints: number = 10
): { spot: number; netPayoff: number }[] {
  const payoffMatrix: { spot: number; netPayoff: number }[] = [];

  for (let spot = minSpot; spot <= maxSpot; spot += stepPoints) {
    let combinedPayoffAtSpot = 0;

    for (const leg of legs) {
      if (!leg.strikePrice || !leg.entryPrice || !leg.lotSize || !leg.numLots) continue;

      let intrinsicValueAtExpiry = 0;

      // Calculate the intrinsic value of this specific leg at expiration if exercised
      if (leg.optionType === 'CE') {
        intrinsicValueAtExpiry = Math.max(0, spot - leg.strikePrice);
      } else if (leg.optionType === 'PE') {
        intrinsicValueAtExpiry = Math.max(0, leg.strikePrice - spot);
      }

      // Calculate Profit/Loss per share
      let pnlPerShare = 0;
      if (leg.position === 'BUY') {
        // Buyer pays the premium upfront, gains intrinsic value
        pnlPerShare = intrinsicValueAtExpiry - leg.entryPrice;
      } else if (leg.position === 'SELL') {
        // Seller receives the premium upfront, loses intrinsic value
        pnlPerShare = leg.entryPrice - intrinsicValueAtExpiry;
      }

      // Multiply by total quantity (lot size * number of lots)
      const totalPnlForLeg = pnlPerShare * (leg.lotSize * leg.numLots);
      combinedPayoffAtSpot += totalPnlForLeg;
    }

    payoffMatrix.push({
      spot: Number(spot.toFixed(2)),
      netPayoff: Number(combinedPayoffAtSpot.toFixed(2))
    });
  }

  return payoffMatrix;
}
