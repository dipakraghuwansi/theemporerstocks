import fs from 'fs';
import path from 'path';
import { FutureContractMeta, OptionContractMeta, OptionStructureRequest, OptionStructureSummary } from '@/lib/optionsStructure/types';

const INSTRUMENTS_URL = 'https://api.kite.trade/instruments';
const RISK_FREE_RATE = 0.08;
const OPTION_CACHE_MS = 30 * 1000;
const CHAIN_STRIKE_WINDOW = 8;
const SNAPSHOT_PATH = path.join(process.cwd(), 'options_structure_snapshots.json');

let optionInstrumentCache: Map<string, OptionContractMeta[]> | null = null;
let optionInstrumentCacheAt = 0;
let futureInstrumentCache: Map<string, FutureContractMeta[]> | null = null;
let futureInstrumentCacheAt = 0;
const summaryCache = new Map<string, { expiresAt: number; summary: OptionStructureSummary }>();

type StoredSnapshot = {
  capturedAt: string;
  expiry: string;
  spotPrice: number;
  totalCallOi: number;
  totalPutOi: number;
  futuresPrice: number | null;
  futuresOi: number | null;
  strikes: Record<string, { callOi: number; putOi: number }>;
};

type SnapshotStore = Record<string, StoredSnapshot>;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function readSnapshotStore(): SnapshotStore {
  if (!fs.existsSync(SNAPSHOT_PATH)) {
    return {};
  }

  try {
    return JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8')) as SnapshotStore;
  } catch {
    return {};
  }
}

function writeSnapshotStore(store: SnapshotStore) {
  fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(store, null, 2), 'utf8');
}

function normPdf(value: number) {
  return Math.exp(-0.5 * value * value) / Math.sqrt(2 * Math.PI);
}

function erfApprox(x: number) {
  const sign = x >= 0 ? 1 : -1;
  const absX = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * absX);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
  return sign * y;
}

function normCdf(value: number) {
  return 0.5 * (1 + erfApprox(value / Math.sqrt(2)));
}

function getTimeToExpiryYears(expiry: string) {
  const expiryDate = new Date(`${expiry}T15:30:00+05:30`);
  const now = new Date();
  const diffMs = expiryDate.getTime() - now.getTime();
  return Math.max(diffMs / (365 * 24 * 60 * 60 * 1000), 1 / 365);
}

function blackScholesPrice(
  optionType: 'CE' | 'PE',
  spot: number,
  strike: number,
  timeToExpiry: number,
  volatility: number,
  rate = RISK_FREE_RATE
) {
  if (spot <= 0 || strike <= 0 || timeToExpiry <= 0 || volatility <= 0) {
    return optionType === 'CE' ? Math.max(spot - strike, 0) : Math.max(strike - spot, 0);
  }

  const sqrtTime = Math.sqrt(timeToExpiry);
  const d1 =
    (Math.log(spot / strike) + (rate + 0.5 * volatility * volatility) * timeToExpiry) /
    (volatility * sqrtTime);
  const d2 = d1 - volatility * sqrtTime;

  if (optionType === 'CE') {
    return spot * normCdf(d1) - strike * Math.exp(-rate * timeToExpiry) * normCdf(d2);
  }

  return strike * Math.exp(-rate * timeToExpiry) * normCdf(-d2) - spot * normCdf(-d1);
}

function calculateGamma(
  spot: number,
  strike: number,
  timeToExpiry: number,
  volatility: number,
  rate = RISK_FREE_RATE
) {
  if (spot <= 0 || strike <= 0 || timeToExpiry <= 0 || volatility <= 0) {
    return 0;
  }

  const sqrtTime = Math.sqrt(timeToExpiry);
  const d1 =
    (Math.log(spot / strike) + (rate + 0.5 * volatility * volatility) * timeToExpiry) /
    (volatility * sqrtTime);

  return normPdf(d1) / (spot * volatility * sqrtTime);
}

function calculateVanna(
  spot: number,
  strike: number,
  timeToExpiry: number,
  volatility: number,
  rate = RISK_FREE_RATE
) {
  if (spot <= 0 || strike <= 0 || timeToExpiry <= 0 || volatility <= 0) {
    return 0;
  }

  const sqrtTime = Math.sqrt(timeToExpiry);
  const d1 =
    (Math.log(spot / strike) + (rate + 0.5 * volatility * volatility) * timeToExpiry) /
    (volatility * sqrtTime);
  const d2 = d1 - volatility * sqrtTime;

  return -normPdf(d1) * d2 / volatility;
}

function calculateCharm(
  spot: number,
  strike: number,
  timeToExpiry: number,
  volatility: number,
  rate = RISK_FREE_RATE
) {
  if (spot <= 0 || strike <= 0 || timeToExpiry <= 0 || volatility <= 0) {
    return 0;
  }

  const sqrtTime = Math.sqrt(timeToExpiry);
  const d1 =
    (Math.log(spot / strike) + (rate + 0.5 * volatility * volatility) * timeToExpiry) /
    (volatility * sqrtTime);
  const d2 = d1 - volatility * sqrtTime;
  const numerator = 2 * rate * timeToExpiry - d2 * volatility * sqrtTime;
  const denominator = 2 * timeToExpiry * volatility * sqrtTime;

  return -normPdf(d1) * (numerator / denominator);
}

function inferImpliedVolatility(
  optionType: 'CE' | 'PE',
  marketPrice: number,
  spot: number,
  strike: number,
  timeToExpiry: number
) {
  const intrinsic = optionType === 'CE' ? Math.max(spot - strike, 0) : Math.max(strike - spot, 0);
  const safePrice = Math.max(marketPrice, intrinsic + 0.01);
  let low = 0.05;
  let high = 2.5;

  for (let i = 0; i < 40; i++) {
    const mid = (low + high) / 2;
    const price = blackScholesPrice(optionType, spot, strike, timeToExpiry, mid);
    if (Math.abs(price - safePrice) < 0.05) {
      return mid;
    }
    if (price > safePrice) {
      high = mid;
    } else {
      low = mid;
    }
  }

  return clamp((low + high) / 2, 0.05, 2.5);
}

function normalizeStrikeWindow(contracts: OptionContractMeta[], spotPrice: number) {
  const uniqueStrikes = Array.from(new Set(contracts.map((contract) => contract.strike))).sort((a, b) => a - b);
  if (uniqueStrikes.length === 0) {
    return { selectedStrikes: new Set<number>(), atmStrike: null as number | null };
  }

  let atmIndex = 0;
  let minDistance = Number.POSITIVE_INFINITY;
  uniqueStrikes.forEach((strike, index) => {
    const distance = Math.abs(strike - spotPrice);
    if (distance < minDistance) {
      minDistance = distance;
      atmIndex = index;
    }
  });

  const start = Math.max(0, atmIndex - CHAIN_STRIKE_WINDOW);
  const end = Math.min(uniqueStrikes.length - 1, atmIndex + CHAIN_STRIKE_WINDOW);
  return {
    selectedStrikes: new Set(uniqueStrikes.slice(start, end + 1)),
    atmStrike: uniqueStrikes[atmIndex] || null,
  };
}

async function getOptionInstrumentMap() {
  const now = Date.now();
  if (
    optionInstrumentCache &&
    futureInstrumentCache &&
    now - optionInstrumentCacheAt < 12 * 60 * 60 * 1000 &&
    now - futureInstrumentCacheAt < 12 * 60 * 60 * 1000
  ) {
    return optionInstrumentCache;
  }

  const response = await fetch(INSTRUMENTS_URL, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('Failed to fetch Kite instruments CSV for option structure.');
  }

  const csvText = await response.text();
  const lines = csvText.split('\n');
  const nextMap = new Map<string, OptionContractMeta[]>();
  const nextFutureMap = new Map<string, FutureContractMeta[]>();

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (cols.length < 12) continue;

    const instrumentToken = parseInt(cols[0]?.replace(/"/g, '') || '0', 10);
    const tradingsymbol = cols[2]?.replace(/"/g, '').trim();
    const underlying = cols[3]?.replace(/"/g, '').trim();
    const expiry = cols[5]?.replace(/"/g, '').trim();
    const strike = parseFloat(cols[6]?.replace(/"/g, '') || '0');
    const lotSize = parseInt(cols[8]?.replace(/"/g, '') || '0', 10);
    const instrumentType = cols[9]?.replace(/"/g, '').trim() as 'CE' | 'PE' | 'FUT';
    const exchange = cols[11]?.replace(/"/g, '').trim();

    if (!instrumentToken || !tradingsymbol || !underlying || !expiry || !lotSize) continue;
    if (exchange !== 'NFO') continue;
    if (instrumentType === 'FUT') {
      const future: FutureContractMeta = {
        instrument: `NFO:${tradingsymbol}`,
        instrumentToken,
        underlying,
        expiry,
        lotSize,
      };
      const existingFutures = nextFutureMap.get(underlying) || [];
      existingFutures.push(future);
      nextFutureMap.set(underlying, existingFutures);
      continue;
    }
    if ((instrumentType !== 'CE' && instrumentType !== 'PE') || !strike) continue;

    const contract: OptionContractMeta = {
      instrument: `NFO:${tradingsymbol}`,
      instrumentToken,
      underlying,
      expiry,
      strike,
      lotSize,
      optionType: instrumentType,
    };

    const existing = nextMap.get(underlying) || [];
    existing.push(contract);
    nextMap.set(underlying, existing);
  }

  optionInstrumentCache = nextMap;
  optionInstrumentCacheAt = now;
  futureInstrumentCache = nextFutureMap;
  futureInstrumentCacheAt = now;
  return nextMap;
}

function getCacheKey(symbol: string, spotPrice: number) {
  return `${symbol}:${spotPrice.toFixed(2)}`;
}

function getCachedSummary(symbol: string, spotPrice: number) {
  const key = getCacheKey(symbol, spotPrice);
  const entry = summaryCache.get(key);
  if (!entry || entry.expiresAt < Date.now()) {
    summaryCache.delete(key);
    return null;
  }
  return entry.summary;
}

function setCachedSummary(symbol: string, spotPrice: number, summary: OptionStructureSummary) {
  summaryCache.set(getCacheKey(symbol, spotPrice), {
    expiresAt: Date.now() + OPTION_CACHE_MS,
    summary,
  });
}

function buildUnavailableSummary(symbol: string, spotPrice: number, reason: string): OptionStructureSummary {
  return {
    available: false,
    reason,
    underlying: symbol,
    expiry: null,
    underlyingPrice: spotPrice,
    atmStrike: null,
    strikeCount: 0,
    totalCallOi: 0,
    totalPutOi: 0,
    totalCallOiChange: 0,
    totalPutOiChange: 0,
    putCallRatio: null,
    netGammaExposure: 0,
    grossGammaExposure: 0,
    gammaSkew: null,
    gammaRegime: 'unavailable',
    netVannaExposure: 0,
    netCharmExposure: 0,
    vannaRegime: 'unavailable',
    charmRegime: 'unavailable',
    averageCallIv: null,
    averagePutIv: null,
    volSkew: null,
    volSkewRegime: 'unavailable',
    gammaFlipLevel: null,
    callWall: null,
    putWall: null,
    nearestResistance: null,
    nearestSupport: null,
    nearestResistanceDistancePct: null,
    nearestSupportDistancePct: null,
    dominantOiFlow: 'unavailable',
    futuresPrice: null,
    futuresOi: null,
    futuresOiChange: null,
    futuresPriceChangePct: null,
    futuresBuildup: 'unavailable',
    topCallOis: [],
    topPutOis: [],
    strikeSummaries: [],
    optionsAdjustmentHint: 0,
    interpretation: reason,
  };
}

function createSummaryFromQuotes(
  symbol: string,
  spotPrice: number,
  expiry: string,
  atmStrike: number | null,
  contracts: OptionContractMeta[],
  quotes: Record<string, any>,
  previousSnapshot: StoredSnapshot | null,
  futureQuote: any | null
) {
  const timeToExpiry = getTimeToExpiryYears(expiry);
  const strikeMap = new Map<number, { callOi: number; putOi: number; callOiChange: number; putOiChange: number; callIv: number | null; putIv: number | null; netGammaExposure: number }>();
  let totalCallOi = 0;
  let totalPutOi = 0;
  let totalCallOiChange = 0;
  let totalPutOiChange = 0;
  let netGammaExposure = 0;
  let grossGammaExposure = 0;
  let netVannaExposure = 0;
  let netCharmExposure = 0;
  let weightedCallIvSum = 0;
  let weightedPutIvSum = 0;
  let weightedCallIvOi = 0;
  let weightedPutIvOi = 0;

  for (const contract of contracts) {
    const quote = quotes[contract.instrument];
    if (!quote) continue;

    const oi = Number(quote.oi || 0);
    const optionPrice = Number(quote.last_price || 0);
    if (oi <= 0 || optionPrice <= 0) continue;

    const impliedVolatility = inferImpliedVolatility(
      contract.optionType,
      optionPrice,
      spotPrice,
      contract.strike,
      timeToExpiry
    );
    const gamma = calculateGamma(spotPrice, contract.strike, timeToExpiry, impliedVolatility);
    const vanna = calculateVanna(spotPrice, contract.strike, timeToExpiry, impliedVolatility);
    const charm = calculateCharm(spotPrice, contract.strike, timeToExpiry, impliedVolatility);
    const signedGammaExposure =
      gamma * oi * contract.lotSize * spotPrice * spotPrice * 0.01 * (contract.optionType === 'CE' ? 1 : -1);
    const signedVannaExposure =
      vanna * oi * contract.lotSize * spotPrice * 0.01 * (contract.optionType === 'CE' ? 1 : -1);
    const signedCharmExposure =
      charm * oi * contract.lotSize * spotPrice * 0.01 * (contract.optionType === 'CE' ? 1 : -1);

    const previousStrike = previousSnapshot?.strikes?.[String(contract.strike)] || null;
    const strikeRow = strikeMap.get(contract.strike) || {
      callOi: 0,
      putOi: 0,
      callOiChange: 0,
      putOiChange: 0,
      callIv: null,
      putIv: null,
      netGammaExposure: 0,
    };
    if (contract.optionType === 'CE') {
      strikeRow.callOi += oi;
      strikeRow.callOiChange += oi - (previousStrike?.callOi || 0);
      strikeRow.callIv = impliedVolatility;
      totalCallOi += oi;
      totalCallOiChange += oi - (previousStrike?.callOi || 0);
      weightedCallIvSum += impliedVolatility * oi;
      weightedCallIvOi += oi;
    } else {
      strikeRow.putOi += oi;
      strikeRow.putOiChange += oi - (previousStrike?.putOi || 0);
      strikeRow.putIv = impliedVolatility;
      totalPutOi += oi;
      totalPutOiChange += oi - (previousStrike?.putOi || 0);
      weightedPutIvSum += impliedVolatility * oi;
      weightedPutIvOi += oi;
    }
    strikeRow.netGammaExposure += signedGammaExposure;
    strikeMap.set(contract.strike, strikeRow);

    netGammaExposure += signedGammaExposure;
    grossGammaExposure += Math.abs(signedGammaExposure);
    netVannaExposure += signedVannaExposure;
    netCharmExposure += signedCharmExposure;
  }

  const strikeSummaries = Array.from(strikeMap.entries())
    .map(([strike, row]) => ({ strike, ...row }))
    .sort((a, b) => a.strike - b.strike);

  if (strikeSummaries.length === 0) {
    return buildUnavailableSummary(symbol, spotPrice, 'Option chain is listed, but no live OI was returned for the selected expiry window.');
  }

  const gammaSkew = grossGammaExposure > 0 ? netGammaExposure / grossGammaExposure : null;
  const averageCallIv = weightedCallIvOi > 0 ? weightedCallIvSum / weightedCallIvOi : null;
  const averagePutIv = weightedPutIvOi > 0 ? weightedPutIvSum / weightedPutIvOi : null;
  const volSkew =
    averageCallIv !== null && averagePutIv !== null ? averagePutIv - averageCallIv : null;
  const volSkewRegime =
    volSkew === null
      ? 'unavailable'
      : volSkew >= 0.03
        ? 'put_fear'
        : volSkew <= -0.02
          ? 'call_chasing'
          : 'balanced';
  const putCallRatio = totalCallOi > 0 ? totalPutOi / totalCallOi : null;
  const dominantOiFlow =
    totalCallOiChange === 0 && totalPutOiChange === 0
      ? 'balanced'
      : totalCallOiChange > totalPutOiChange + Math.max(Math.abs(totalPutOiChange) * 0.1, 1)
        ? 'calls_building'
        : totalPutOiChange > totalCallOiChange + Math.max(Math.abs(totalCallOiChange) * 0.1, 1)
          ? 'puts_building'
          : 'balanced';
  const futuresPrice = futureQuote ? Number(futureQuote.last_price || 0) : null;
  const futuresOi = futureQuote ? Number(futureQuote.oi || 0) : null;
  const futuresOiChange = futuresOi !== null ? futuresOi - (previousSnapshot?.futuresOi || 0) : null;
  const futuresPriceChangePct =
    futuresPrice !== null && previousSnapshot?.futuresPrice
      ? ((futuresPrice - previousSnapshot.futuresPrice) / previousSnapshot.futuresPrice) * 100
      : futuresPrice !== null && spotPrice > 0
        ? ((futuresPrice - spotPrice) / spotPrice) * 100
        : null;
  const futuresBuildup =
    futuresPriceChangePct === null || futuresOiChange === null || futuresOi === 0
      ? 'unavailable'
      : futuresPriceChangePct > 0.05 && futuresOiChange > 0
        ? 'long_buildup'
        : futuresPriceChangePct < -0.05 && futuresOiChange > 0
          ? 'short_buildup'
          : futuresPriceChangePct > 0.05 && futuresOiChange < 0
            ? 'short_covering'
            : futuresPriceChangePct < -0.05 && futuresOiChange < 0
              ? 'long_unwinding'
              : 'neutral';
  const topCallOis = [...strikeSummaries]
    .sort((a, b) => b.callOi - a.callOi)
    .filter((row) => row.callOi > 0)
    .slice(0, 3)
    .map((row) => ({ strike: row.strike, oi: row.callOi }));
  const topPutOis = [...strikeSummaries]
    .sort((a, b) => b.putOi - a.putOi)
    .filter((row) => row.putOi > 0)
    .slice(0, 3)
    .map((row) => ({ strike: row.strike, oi: row.putOi }));

  const callWall = topCallOis[0]?.strike ?? null;
  const putWall = topPutOis[0]?.strike ?? null;
  const nearestResistance = strikeSummaries.find((row) => row.strike >= spotPrice && row.callOi > 0)?.strike ?? callWall;
  const nearestSupport = [...strikeSummaries].reverse().find((row) => row.strike <= spotPrice && row.putOi > 0)?.strike ?? putWall;
  const nearestResistanceDistancePct =
    nearestResistance && spotPrice > 0 ? ((nearestResistance - spotPrice) / spotPrice) * 100 : null;
  const nearestSupportDistancePct =
    nearestSupport && spotPrice > 0 ? ((spotPrice - nearestSupport) / spotPrice) * 100 : null;

  let gammaFlipLevel: number | null = null;
  for (let i = 1; i < strikeSummaries.length; i++) {
    const prev = strikeSummaries[i - 1];
    const current = strikeSummaries[i];
    if ((prev.netGammaExposure <= 0 && current.netGammaExposure >= 0) || (prev.netGammaExposure >= 0 && current.netGammaExposure <= 0)) {
      gammaFlipLevel = current.strike;
      break;
    }
  }

  const gammaRegime =
    gammaSkew === null
      ? 'neutral'
      : gammaSkew >= 0.15
        ? 'stabilizing'
        : gammaSkew <= -0.15
          ? 'expansive'
          : 'neutral';
  const vannaRegime =
    Math.abs(netVannaExposure) < 1
      ? 'balanced'
      : netVannaExposure > 0
        ? 'supportive'
        : 'dragging';
  const charmRegime =
    Math.abs(netCharmExposure) < 1
      ? 'balanced'
      : netCharmExposure > 0
        ? 'supportive'
        : 'dragging';

  const optionsAdjustmentHint =
    gammaRegime === 'stabilizing'
      ? 6
      : gammaRegime === 'expansive'
        ? -6
        : putCallRatio !== null
          ? clamp((putCallRatio - 1) * 4, -3, 3)
          : 0;
  const skewSentence =
    volSkewRegime === 'put_fear'
      ? ` Put IV is running richer than calls by ${((volSkew || 0) * 100).toFixed(1)} vol points, which suggests protection demand is elevated.`
      : volSkewRegime === 'call_chasing'
        ? ` Call IV is running richer than puts by ${Math.abs((volSkew || 0) * 100).toFixed(1)} vol points, which suggests upside chasing is showing up.`
        : volSkewRegime === 'balanced'
          ? ' Put and call IV are fairly balanced in the active chain window.'
          : '';

  const interpretation =
    gammaRegime === 'stabilizing'
      ? `Positive net gamma proxy suggests pinning or mean-reversion pressure near major OI walls. ${dominantOiFlow === 'calls_building' ? 'Call OI is building faster than puts.' : dominantOiFlow === 'puts_building' ? 'Put OI is building faster than calls.' : 'OI flow is relatively balanced.'}${skewSentence} Vanna reads ${vannaRegime} and charm reads ${charmRegime}. ${futuresBuildup !== 'unavailable' ? `Nearest future reads as ${futuresBuildup.replace('_', ' ')}.` : ''}`
      : gammaRegime === 'expansive'
        ? `Negative net gamma proxy suggests easier directional expansion and breakout follow-through. ${dominantOiFlow === 'calls_building' ? 'Call OI is building, which can reinforce overhead resistance.' : dominantOiFlow === 'puts_building' ? 'Put OI is building, which may reflect stronger hedging demand.' : 'OI flow is relatively balanced.'}${skewSentence} Vanna reads ${vannaRegime} and charm reads ${charmRegime}. ${futuresBuildup !== 'unavailable' ? `Nearest future reads as ${futuresBuildup.replace('_', ' ')}.` : ''}`
        : `Options structure is balanced, so OI is acting more as context than as a strong directional force. ${dominantOiFlow === 'calls_building' ? 'Call OI is building slightly faster.' : dominantOiFlow === 'puts_building' ? 'Put OI is building slightly faster.' : 'Calls and puts are building at a similar pace.'}${skewSentence} Vanna reads ${vannaRegime} and charm reads ${charmRegime}. ${futuresBuildup !== 'unavailable' ? `Nearest future reads as ${futuresBuildup.replace('_', ' ')}.` : ''}`;

  return {
    available: true,
    underlying: symbol,
    expiry,
    underlyingPrice: Number(spotPrice.toFixed(2)),
    atmStrike,
    strikeCount: strikeSummaries.length,
    totalCallOi,
    totalPutOi,
    totalCallOiChange,
    totalPutOiChange,
    putCallRatio: putCallRatio !== null ? Number(putCallRatio.toFixed(2)) : null,
    netGammaExposure: Number(netGammaExposure.toFixed(2)),
    grossGammaExposure: Number(grossGammaExposure.toFixed(2)),
    gammaSkew: gammaSkew !== null ? Number(gammaSkew.toFixed(3)) : null,
    gammaRegime,
    netVannaExposure: Number(netVannaExposure.toFixed(2)),
    netCharmExposure: Number(netCharmExposure.toFixed(2)),
    vannaRegime,
    charmRegime,
    averageCallIv: averageCallIv !== null ? Number((averageCallIv * 100).toFixed(2)) : null,
    averagePutIv: averagePutIv !== null ? Number((averagePutIv * 100).toFixed(2)) : null,
    volSkew: volSkew !== null ? Number((volSkew * 100).toFixed(2)) : null,
    volSkewRegime,
    gammaFlipLevel,
    callWall,
    putWall,
    nearestResistance,
    nearestSupport,
    nearestResistanceDistancePct:
      nearestResistanceDistancePct !== null ? Number(nearestResistanceDistancePct.toFixed(2)) : null,
    nearestSupportDistancePct:
      nearestSupportDistancePct !== null ? Number(nearestSupportDistancePct.toFixed(2)) : null,
    dominantOiFlow,
    futuresPrice: futuresPrice !== null ? Number(futuresPrice.toFixed(2)) : null,
    futuresOi,
    futuresOiChange,
    futuresPriceChangePct: futuresPriceChangePct !== null ? Number(futuresPriceChangePct.toFixed(2)) : null,
    futuresBuildup,
    topCallOis,
    topPutOis,
    strikeSummaries,
    optionsAdjustmentHint,
    interpretation,
  } satisfies OptionStructureSummary;
}

export async function buildOptionStructureBatch(kite: any, requests: OptionStructureRequest[]) {
  const result: Record<string, OptionStructureSummary | null> = {};
  const cleanRequests = requests.filter((request) => request.symbol && request.spotPrice > 0);
  if (cleanRequests.length === 0) {
    return result;
  }

  const optionMap = await getOptionInstrumentMap();
  const futuresMap = futureInstrumentCache || new Map<string, FutureContractMeta[]>();
  const snapshotStore = readSnapshotStore();
  const quoteSymbols = new Set<string>();
  const pendingRequests: Array<{
    symbol: string;
    spotPrice: number;
    expiry: string;
    atmStrike: number | null;
    contracts: OptionContractMeta[];
    futureInstrument: string | null;
  }> = [];

  for (const request of cleanRequests) {
    const cached = getCachedSummary(request.symbol, request.spotPrice);
    if (cached) {
      result[request.symbol] = cached;
      continue;
    }

    const listed = optionMap.get(request.symbol) || [];
    if (listed.length === 0) {
      const unavailable = buildUnavailableSummary(request.symbol, request.spotPrice, 'No listed stock options were found for this symbol.');
      result[request.symbol] = unavailable;
      setCachedSummary(request.symbol, request.spotPrice, unavailable);
      continue;
    }

    const validExpiries = Array.from(
      new Set(
        listed
          .map((contract) => contract.expiry)
          .filter((expiry) => new Date(`${expiry}T15:30:00+05:30`).getTime() >= Date.now())
      )
    ).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    const expiry = validExpiries[0];
    if (!expiry) {
      const unavailable = buildUnavailableSummary(request.symbol, request.spotPrice, 'Listed options exist, but no active future expiry was found.');
      result[request.symbol] = unavailable;
      setCachedSummary(request.symbol, request.spotPrice, unavailable);
      continue;
    }

    const sameExpiry = listed.filter((contract) => contract.expiry === expiry);
    const sameExpiryFutures = (futuresMap.get(request.symbol) || []).filter((future) => future.expiry === expiry);
    const futureInstrument = sameExpiryFutures[0]?.instrument || null;
    const { selectedStrikes, atmStrike } = normalizeStrikeWindow(sameExpiry, request.spotPrice);
    const selectedContracts = sameExpiry.filter((contract) => selectedStrikes.has(contract.strike));

    if (selectedContracts.length === 0) {
      const unavailable = buildUnavailableSummary(request.symbol, request.spotPrice, 'No contracts were selected in the active strike window.');
      result[request.symbol] = unavailable;
      setCachedSummary(request.symbol, request.spotPrice, unavailable);
      continue;
    }

    selectedContracts.forEach((contract) => quoteSymbols.add(contract.instrument));
    if (futureInstrument) {
      quoteSymbols.add(futureInstrument);
    }
    pendingRequests.push({
      symbol: request.symbol,
      spotPrice: request.spotPrice,
      expiry,
      atmStrike,
      contracts: selectedContracts,
      futureInstrument,
    });
  }

  const quotes =
    quoteSymbols.size > 0 ? await kite.getQuote(Array.from(quoteSymbols)).catch(() => ({} as Record<string, any>)) : {};

  for (const pending of pendingRequests) {
    const previousSnapshot = snapshotStore[`${pending.symbol}:${pending.expiry}`] || null;
    const summary = createSummaryFromQuotes(
      pending.symbol,
      pending.spotPrice,
      pending.expiry,
      pending.atmStrike,
      pending.contracts,
      quotes,
      previousSnapshot,
      pending.futureInstrument ? quotes[pending.futureInstrument] || null : null
    );
    result[pending.symbol] = summary;
    setCachedSummary(pending.symbol, pending.spotPrice, summary);
    if (summary.available) {
      snapshotStore[`${pending.symbol}:${pending.expiry}`] = {
        capturedAt: new Date().toISOString(),
        expiry: pending.expiry,
        spotPrice: pending.spotPrice,
        totalCallOi: summary.totalCallOi,
        totalPutOi: summary.totalPutOi,
        futuresPrice: summary.futuresPrice,
        futuresOi: summary.futuresOi,
        strikes: Object.fromEntries(
          summary.strikeSummaries.map((row) => [
            String(row.strike),
            { callOi: row.callOi, putOi: row.putOi },
          ])
        ),
      };
    }
  }

  if (pendingRequests.length > 0) {
    writeSnapshotStore(snapshotStore);
  }

  return result;
}

export async function buildSingleOptionStructure(kite: any, symbol: string, spotPrice: number) {
  const summaries = await buildOptionStructureBatch(kite, [{ symbol, spotPrice }]);
  return summaries[symbol] || buildUnavailableSummary(symbol, spotPrice, 'No option structure could be derived.');
}
