"use client";

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Activity, ArrowUpRight, CircleHelp, Copy, Gauge, RefreshCw, SearchCheck, TrendingDown, TrendingUp, Wifi, WifiOff } from 'lucide-react';
import { OptionStructureSummary } from '@/lib/optionsStructure/types';
import { buildBuyRecommendation } from '@/lib/research/recommendation';
import { ProbabilityEstimate } from '@/lib/research/types';
import { CATEGORY_LABELS, StockScreenType, StockUniverseCategory, SCREEN_LABELS } from '@/lib/stockUniverse';
import { getScreenerScoreBreakdown, computeScreenerScore, ScreenerScorePayload } from '@/lib/screenerScoring';
import { useStockStream } from '@/lib/useStockStream';

type ScreenerPayload = {
  success?: boolean;
  error?: string;
  needsLogin?: boolean;
  screen?: StockScreenType;
  screenLabel?: string;
  universeSize?: number;
  matched?: number;
  benchmark?: string;
  scorePayload?: ScreenerScorePayload;
  notes?: string[];
  sectorBreadth?: Array<{
    sector: string;
    breadthPct: number;
    aboveSma20Pct: number;
    members: number;
  }>;
  results?: Array<{
    symbol: string;
    instrument: string;
    sector: string;
    category: StockUniverseCategory;
    lastPrice: number;
    previousClose: number;
    openPrice: number;
    dayChangePct: number;
    gapPct: number;
    volume: number;
    avgVolume7: number | null;
    avgVolume7Compare: number | null;
    avgVolume20: number | null;
    volumeExpansion: number | null;
    sma20: number | null;
    sma50: number | null;
    rsi14: number | null;
    atr14: number | null;
    vwap: number | null;
    relativeStrength20d: number | null;
    residualAlpha20d: number | null;
    factorBasketAlpha20d: number | null;
    breakoutLevel: number | null;
    breakdownLevel: number | null;
    aboveVwap: boolean;
    deliveryDataAvailable: boolean;
    microprice: number | null;
    micropriceEdgePct: number | null;
    orderFlowImbalance: number | null;
    rollingOfi: number | null;
    vpin: number | null;
    baseScore: number;
    sectorAdjustment: number;
    regimeAdjustment: number;
    optionsAdjustment: number;
    microstructureAdjustment: number;
    sectorState: 'upgrade' | 'degrade' | 'flat' | 'unknown';
    sectorBreadthPct: number | null;
    sectorBreadthDelta: number | null;
    optionsStructure: {
      available: boolean;
      reason?: string;
      underlying: string;
      expiry: string | null;
      underlyingPrice: number;
      atmStrike: number | null;
      strikeCount: number;
      totalCallOi: number;
      totalPutOi: number;
      totalCallOiChange: number;
      totalPutOiChange: number;
      putCallRatio: number | null;
      netGammaExposure: number;
      grossGammaExposure: number;
      gammaSkew: number | null;
      gammaRegime: 'stabilizing' | 'expansive' | 'neutral' | 'unavailable';
      netVannaExposure: number;
      netCharmExposure: number;
      vannaRegime: 'supportive' | 'dragging' | 'balanced' | 'unavailable';
      charmRegime: 'supportive' | 'dragging' | 'balanced' | 'unavailable';
      averageCallIv: number | null;
      averagePutIv: number | null;
      volSkew: number | null;
      volSkewRegime: 'put_fear' | 'call_chasing' | 'balanced' | 'unavailable';
      gammaFlipLevel: number | null;
      callWall: number | null;
      putWall: number | null;
      nearestResistance: number | null;
      nearestSupport: number | null;
      nearestResistanceDistancePct: number | null;
      nearestSupportDistancePct: number | null;
      dominantOiFlow: 'calls_building' | 'puts_building' | 'balanced' | 'unavailable';
      futuresPrice: number | null;
      futuresOi: number | null;
      futuresOiChange: number | null;
      futuresPriceChangePct: number | null;
      futuresBuildup: 'long_buildup' | 'short_buildup' | 'short_covering' | 'long_unwinding' | 'neutral' | 'unavailable';
      optionsAdjustmentHint: number;
      interpretation: string;
    } | null;
    probabilityEstimate: {
      sampleSize: number;
      winRate: number;
      avgWinPct: number;
      avgLossPct: number;
      expectancyPct: number;
    } | null;
    buyRecommendation: {
      confidenceScore: number;
      confidenceLabel: 'High' | 'Medium' | 'Watchlist' | 'Low';
      historicallySupported: boolean;
      supportLabel: 'Historically Supported' | 'Developing Evidence' | 'Low Sample';
      confidenceExplanation: string;
      supportExplanation: string;
      plan: {
        entryPrice: number;
        stopLoss: number;
        targetPrice: number;
        riskPct: number;
        rewardPct: number;
      };
    };
    score: number;
    thesis: string;
      scoreBreakdown: {
        baseScore: number;
        sectorAdjustment: number;
        regimeAdjustment: number;
        optionsAdjustment: number;
        microstructureAdjustment: number;
        sectorState: 'upgrade' | 'degrade' | 'flat' | 'unknown';
      sectorBreadthPct: number | null;
      sectorBreadthDelta: number | null;
      score: number;
      contributions: Array<{
        key: string;
        label: string;
        value: number;
        displayValue: string;
        impact: number;
      }>;
      topDrivers: Array<{
        key: string;
        label: string;
        value: number;
        displayValue: string;
        impact: number;
      }>;
    };
  }>;
};

type ScreenerResultRow = NonNullable<ScreenerPayload['results']>[number];

const SCREEN_OPTIONS: StockScreenType[] = ['intraday-momentum', 'swing-setups', 'mean-reversion', 'breakout-watchlist'];
const RESULT_CATEGORY_OPTIONS: Array<'all' | StockUniverseCategory> = ['all', 'nifty50', 'niftymidcap150', 'manual'];
const METRIC_EXPLAINERS: Record<string, string> = {
  LTP: 'Last traded price from the latest streamed or quoted market data.',
  'Day %': 'Percent change versus the previous session close.',
  VWAP: 'Volume-weighted average price. Above it often signals intraday strength.',
  RSI: '14-period Relative Strength Index. Higher values indicate momentum, lower values indicate stretch.',
  SMA20: '20-session simple moving average for short-term trend reference.',
  SMA50: '50-session simple moving average for intermediate trend reference.',
  ATR14: '14-session Average True Range, used as a volatility and stop-distance proxy.',
  'RS 20d': '20-day relative performance measure used as a simple strength proxy.',
  'Residual α': '20-day stock return minus the average 20-day return of its mapped sector cohort.',
  'Factor α': '20-day return versus a blended factor basket using beta-adjusted benchmark, sector, and category context.',
  Breakout: 'Recent 20-session breakout trigger level from prior highs.',
  Breakdown: 'Recent 20-session breakdown level from prior lows.',
  'Gap %': 'Opening gap versus the previous session close.',
  'Avg Vol 7d': 'Average daily traded volume over the prior 7 completed sessions.',
  '7d Vol Compare': 'Recent 7-session average volume divided by the 7 sessions before that. Above 1.0 means volume is building week over week.',
  'Vol Exp': 'Current volume divided by the average of the previous 20 sessions.',
  'Sector Δ': 'Change in sector breadth versus the previous saved breadth snapshot.',
  'Sector Adj': 'Score lift or drag applied from sector breadth context.',
  'Regime Adj': 'Score lift or drag applied from the current market regime.',
  'Options Adj': 'Score lift or drag applied from stock option-chain gamma and OI structure.',
  PCR: 'Put-call open interest ratio for the selected expiry window.',
  'Gamma Regime': 'Proxy read on whether options dealers may be damping moves or amplifying them.',
  'Call IV': 'OI-weighted average call implied volatility in the active stock option window.',
  'Put IV': 'OI-weighted average put implied volatility in the active stock option window.',
  'Vol Skew': 'Put IV minus call IV. Positive values suggest protection demand is richer than upside call demand.',
  'Skew Regime': 'Quick interpretation of whether the chain is showing protection demand, upside chasing, or balance.',
  Vanna: 'Second-order Greek proxy for how dealer delta may shift as implied volatility moves.',
  Charm: 'Second-order Greek proxy for how dealer delta may shift as time passes toward expiry.',
  'Vanna Regime': 'Quick interpretation of whether vanna exposure is supportive or dragging.',
  'Charm Regime': 'Quick interpretation of whether charm exposure is supportive or dragging.',
  'Call Wall': 'Strike with the strongest call open-interest concentration in the active chain window.',
  'Put Wall': 'Strike with the strongest put open-interest concentration in the active chain window.',
  'Gamma Flip': 'Approximate strike where the strike-wise net gamma map flips sign.',
  'OI Flow': 'Whether call OI or put OI is building faster versus the previous saved snapshot.',
  'Res Dist %': 'Distance from current price to the nearest call-heavy resistance strike.',
  'Sup Dist %': 'Distance from current price to the nearest put-heavy support strike.',
  'Fut Buildup': 'Nearest stock future classification using price change and futures OI change.',
  'Fut OI Δ': 'Change in open interest for the nearest stock future versus the previous snapshot.',
  Microprice: 'Depth-weighted fair price from best bid and ask quantities.',
  'Micro Edge %': 'Microprice versus simple mid-price. Positive suggests bid-side pressure.',
  OFI: 'Order flow imbalance approximation from successive best bid/ask queue changes.',
  'Rolling OFI': 'Short rolling sum of recent OFI updates to reduce single-tick noise.',
  VPIN: 'VPIN-style toxicity proxy from recent signed-volume imbalance. Higher values mean more one-sided or informed-looking flow.',
  'Microstructure Adj': 'Explicit score overlay from microprice, rolling OFI, and VPIN-style toxicity.',
  'Win Rate': 'Historical win percentage from the research manifest, using symbol stats when sample size is sufficient.',
  'EV %': 'First-pass expectancy: win rate times average win minus loss rate times average loss.',
  Entry: 'Suggested entry price derived from the current setup state.',
  Stop: 'Suggested stop-loss price derived from ATR-based risk distance for this screen.',
  Target: 'Suggested target price derived from ATR-based reward distance for this screen.',
};

function getMicrostructureSummary(row: ScreenerResultRow) {
  const edge = row.micropriceEdgePct;
  const rolling = row.rollingOfi;
  const vpin = row.vpin;

  if (edge === null || edge === undefined || rolling === null || rolling === undefined) {
    return {
      bias: 'Unavailable',
      accent: 'text-slate-400',
      explanation: 'Live microstructure is unavailable for this symbol right now, so the confidence read leans on the slower setup factors.',
    };
  }

  const supportive = edge > 0 && rolling > 0;
  const opposing = edge < 0 && rolling < 0;

  if (supportive) {
    return {
      bias: 'Supportive',
      accent: 'text-emerald-300',
      explanation: `Live microstructure is supportive: microprice edge is ${edge.toFixed(3)}%, rolling OFI is ${rolling.toLocaleString()}, and VPIN proxy is ${vpin === null || vpin === undefined ? 'n/a' : `${(vpin * 100).toFixed(0)}%`}, which suggests bid-side pressure is backing the setup.`,
    };
  }

  if (opposing) {
    return {
      bias: 'Opposing',
      accent: 'text-rose-300',
      explanation: `Live microstructure is opposing: microprice edge is ${edge.toFixed(3)}%, rolling OFI is ${rolling.toLocaleString()}, and VPIN proxy is ${vpin === null || vpin === undefined ? 'n/a' : `${(vpin * 100).toFixed(0)}%`}, which suggests offer-side pressure is pushing against the setup.`,
    };
  }

  return {
    bias: 'Mixed',
    accent: 'text-amber-300',
    explanation: `Live microstructure is mixed: microprice edge is ${edge.toFixed(3)}%, rolling OFI is ${rolling.toLocaleString()}, and VPIN proxy is ${vpin === null || vpin === undefined ? 'n/a' : `${(vpin * 100).toFixed(0)}%`}, so the order book is not fully aligned in one direction.`,
  };
}

function getConfidenceExplanation(row: ScreenerResultRow) {
  return `${row.buyRecommendation.confidenceExplanation} ${getMicrostructureSummary(row).explanation}`.trim();
}

function getMetricSections(row: ScreenerResultRow) {
  const sections = [
    {
      title: 'Price & Momentum',
      metrics: [
        { label: 'LTP', value: row.lastPrice.toFixed(2) },
        {
          label: 'Day %',
          value: row.dayChangePct.toFixed(2),
          accent: row.dayChangePct >= 0 ? 'text-emerald-300' : 'text-rose-300',
        },
        { label: 'VWAP', value: row.vwap?.toFixed(2) || 'n/a' },
        {
          label: 'RSI',
          value: row.rsi14?.toFixed(2) || 'n/a',
          accent: row.rsi14 !== null ? (row.rsi14 < 35 ? 'text-rose-300' : row.rsi14 > 65 ? 'text-emerald-300' : undefined) : undefined,
        },
      ],
    },
    {
      title: 'Trend & Volatility',
      metrics: [
        { label: 'SMA20', value: row.sma20?.toFixed(2) || 'n/a' },
        { label: 'SMA50', value: row.sma50?.toFixed(2) || 'n/a' },
        { label: 'ATR14', value: row.atr14?.toFixed(2) || 'n/a' },
        {
          label: 'RS 20d',
          value: row.relativeStrength20d?.toFixed(2) || 'n/a',
          accent:
            row.relativeStrength20d !== null
              ? row.relativeStrength20d >= 0
                ? 'text-emerald-300'
                : 'text-rose-300'
              : undefined,
        },
        {
          label: 'Residual α',
          value: row.residualAlpha20d?.toFixed(2) || 'n/a',
          accent:
            row.residualAlpha20d !== null
              ? row.residualAlpha20d >= 0
                ? 'text-emerald-300'
                : 'text-rose-300'
              : undefined,
        },
        {
          label: 'Factor α',
          value: row.factorBasketAlpha20d?.toFixed(2) || 'n/a',
          accent:
            row.factorBasketAlpha20d !== null
              ? row.factorBasketAlpha20d >= 0
                ? 'text-emerald-300'
                : 'text-rose-300'
              : undefined,
        },
      ],
    },
    {
      title: 'Levels & Volume',
      metrics: [
        { label: 'Breakout', value: row.breakoutLevel?.toFixed(2) || 'n/a' },
        { label: 'Breakdown', value: row.breakdownLevel?.toFixed(2) || 'n/a' },
        {
          label: 'Gap %',
          value: row.gapPct.toFixed(2),
          accent: row.gapPct >= 0 ? 'text-emerald-300' : 'text-rose-300',
        },
        { label: 'Avg Vol 7d', value: row.avgVolume7?.toLocaleString() || 'n/a' },
        {
          label: '7d Vol Compare',
          value: row.avgVolume7Compare?.toFixed(2) || 'n/a',
          accent:
            row.avgVolume7Compare === null ? undefined : row.avgVolume7Compare >= 1 ? 'text-emerald-300' : 'text-rose-300',
        },
        { label: 'Vol Exp', value: row.volumeExpansion?.toFixed(2) || 'n/a' },
      ],
    },
    {
      title: 'Relative & Research',
      metrics: [
        {
          label: 'Sector Δ',
          value: row.sectorBreadthDelta !== null ? row.sectorBreadthDelta.toFixed(1) : 'n/a',
          accent:
            row.sectorBreadthDelta === null ? undefined : row.sectorBreadthDelta >= 0 ? 'text-emerald-300' : 'text-rose-300',
        },
        {
          label: 'Sector Adj',
          value: row.sectorAdjustment.toFixed(1),
          accent: row.sectorAdjustment >= 0 ? 'text-emerald-300' : 'text-rose-300',
        },
        {
          label: 'Regime Adj',
          value: row.regimeAdjustment.toFixed(1),
          accent: row.regimeAdjustment >= 0 ? 'text-emerald-300' : 'text-rose-300',
        },
        {
          label: 'Options Adj',
          value: row.optionsAdjustment.toFixed(1),
          accent: row.optionsAdjustment >= 0 ? 'text-emerald-300' : row.optionsAdjustment < 0 ? 'text-rose-300' : undefined,
        },
        {
          label: 'Microstructure Adj',
          value: row.microstructureAdjustment.toFixed(1),
          accent:
            row.microstructureAdjustment >= 0
              ? 'text-emerald-300'
              : row.microstructureAdjustment < 0
                ? 'text-rose-300'
                : undefined,
        },
        {
          label: 'Win Rate',
          value: row.probabilityEstimate ? `${row.probabilityEstimate.winRate.toFixed(1)}%` : 'n/a',
          accent:
            row.probabilityEstimate
              ? row.probabilityEstimate.winRate >= 50
                ? 'text-emerald-300'
                : 'text-rose-300'
              : undefined,
        },
        {
          label: 'EV %',
          value: row.probabilityEstimate ? row.probabilityEstimate.expectancyPct.toFixed(2) : 'n/a',
          accent:
            row.probabilityEstimate
              ? row.probabilityEstimate.expectancyPct >= 0
                ? 'text-emerald-300'
                : 'text-rose-300'
              : undefined,
        },
      ],
    },
  ];

  if (row.optionsStructure?.available) {
    sections.push({
      title: 'Options Structure',
      metrics: [
        {
          label: 'Gamma Regime',
          value: row.optionsStructure.gammaRegime,
          accent:
            row.optionsStructure.gammaRegime === 'stabilizing'
              ? 'text-emerald-300'
              : row.optionsStructure.gammaRegime === 'expansive'
                ? 'text-rose-300'
                : undefined,
        },
        { label: 'Call IV', value: row.optionsStructure.averageCallIv?.toFixed(2) ? `${row.optionsStructure.averageCallIv.toFixed(2)}%` : 'n/a' },
        { label: 'Put IV', value: row.optionsStructure.averagePutIv?.toFixed(2) ? `${row.optionsStructure.averagePutIv.toFixed(2)}%` : 'n/a' },
        {
          label: 'Vol Skew',
          value: row.optionsStructure.volSkew?.toFixed(2) ? `${row.optionsStructure.volSkew.toFixed(2)} pts` : 'n/a',
          accent:
            row.optionsStructure.volSkew === null
              ? undefined
              : row.optionsStructure.volSkew >= 0
                ? 'text-amber-300'
                : 'text-sky-300',
        },
        { label: 'Skew Regime', value: row.optionsStructure.volSkewRegime.replace('_', ' ') },
        {
          label: 'Vanna',
          value: row.optionsStructure.netVannaExposure.toLocaleString(undefined, { maximumFractionDigits: 0 }),
          accent:
            row.optionsStructure.netVannaExposure >= 0 ? 'text-emerald-300' : 'text-rose-300',
        },
        {
          label: 'Charm',
          value: row.optionsStructure.netCharmExposure.toLocaleString(undefined, { maximumFractionDigits: 0 }),
          accent:
            row.optionsStructure.netCharmExposure >= 0 ? 'text-emerald-300' : 'text-rose-300',
        },
        { label: 'Vanna Regime', value: row.optionsStructure.vannaRegime.replace('_', ' ') },
        { label: 'Charm Regime', value: row.optionsStructure.charmRegime.replace('_', ' ') },
        { label: 'PCR', value: row.optionsStructure.putCallRatio?.toFixed(2) || 'n/a' },
        { label: 'Call Wall', value: row.optionsStructure.callWall?.toFixed(2) || 'n/a' },
        { label: 'Put Wall', value: row.optionsStructure.putWall?.toFixed(2) || 'n/a' },
        { label: 'Gamma Flip', value: row.optionsStructure.gammaFlipLevel?.toFixed(2) || 'n/a' },
        { label: 'OI Flow', value: row.optionsStructure.dominantOiFlow.replace('_', ' ') },
        { label: 'Fut Buildup', value: row.optionsStructure.futuresBuildup.replace('_', ' ') },
        {
          label: 'Fut OI Δ',
          value: row.optionsStructure.futuresOiChange?.toLocaleString() || 'n/a',
          accent:
            row.optionsStructure.futuresOiChange === null
              ? undefined
              : row.optionsStructure.futuresOiChange >= 0
                ? 'text-emerald-300'
                : 'text-rose-300',
        },
        {
          label: 'Res Dist %',
          value: row.optionsStructure.nearestResistanceDistancePct?.toFixed(2) || 'n/a',
          accent:
            row.optionsStructure.nearestResistanceDistancePct === null
              ? undefined
              : row.optionsStructure.nearestResistanceDistancePct <= 1.5
                ? 'text-amber-300'
                : undefined,
        },
        {
          label: 'Sup Dist %',
          value: row.optionsStructure.nearestSupportDistancePct?.toFixed(2) || 'n/a',
          accent:
            row.optionsStructure.nearestSupportDistancePct === null
              ? undefined
              : row.optionsStructure.nearestSupportDistancePct <= 1.5
                ? 'text-emerald-300'
                : undefined,
        },
      ],
    });
  }

  if ('microprice' in row || 'orderFlowImbalance' in row) {
    sections.push({
      title: 'Live Microstructure',
      metrics: [
        { label: 'Microprice', value: row.microprice?.toFixed(2) || 'n/a' },
        {
          label: 'Micro Edge %',
          value: row.micropriceEdgePct?.toFixed(3) || 'n/a',
          accent:
            row.micropriceEdgePct === null || row.micropriceEdgePct === undefined
              ? undefined
              : row.micropriceEdgePct >= 0
                ? 'text-emerald-300'
                : 'text-rose-300',
        },
        {
          label: 'OFI',
          value:
            row.orderFlowImbalance === null || row.orderFlowImbalance === undefined
              ? 'n/a'
              : row.orderFlowImbalance.toLocaleString(),
          accent:
            row.orderFlowImbalance === null || row.orderFlowImbalance === undefined
              ? undefined
              : row.orderFlowImbalance >= 0
                ? 'text-emerald-300'
                : 'text-rose-300',
        },
        {
          label: 'Rolling OFI',
          value:
            row.rollingOfi === null || row.rollingOfi === undefined
              ? 'n/a'
              : row.rollingOfi.toLocaleString(),
          accent:
            row.rollingOfi === null || row.rollingOfi === undefined
              ? undefined
              : row.rollingOfi >= 0
                ? 'text-emerald-300'
                : 'text-rose-300',
        },
        {
          label: 'VPIN',
          value: row.vpin === null || row.vpin === undefined ? 'n/a' : `${(row.vpin * 100).toFixed(0)}%`,
          accent:
            row.vpin === null || row.vpin === undefined
              ? undefined
              : row.vpin >= 0.65
                ? 'text-rose-300'
                : row.vpin <= 0.3
                  ? 'text-emerald-300'
                  : 'text-amber-300',
        },
      ],
    });
  }

  return sections;
}

export default function ScreenerPage() {
  const [selectedScreen, setSelectedScreen] = useState<StockScreenType>('intraday-momentum');
  const [resultCategoryFilter, setResultCategoryFilter] = useState<'all' | StockUniverseCategory>('all');
  const [payload, setPayload] = useState<ScreenerPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBuildingDayFoundation, setIsBuildingDayFoundation] = useState(false);
  const [foundationMessage, setFoundationMessage] = useState('');
  const [copiedSymbol, setCopiedSymbol] = useState<string | null>(null);
  const { snapshot, socketConnected } = useStockStream();

  const loadScreen = async (screen: StockScreenType) => {
    setSelectedScreen(screen);
    setIsLoading(true);

    try {
      const res = await fetch(`/api/stocks/screener?screen=${screen}`, { cache: 'no-store' });
      const data: ScreenerPayload = await res.json();
      setPayload(data);
    } catch (error) {
      console.error('Failed to load stock screener', error);
      setPayload({ error: 'Network error while loading the screener.' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadScreen(selectedScreen);
  }, []);

  const buildDayFoundation = async () => {
    setIsBuildingDayFoundation(true);
    setFoundationMessage('');

    try {
      const res = await fetch('/api/stocks/research/foundation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interval: 'day',
          lookbackDays: 180,
          category: 'all',
          maxSymbols: 201,
          refresh: false,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFoundationMessage(data.error || 'Failed to build day foundation.');
        return;
      }

      setFoundationMessage(`Day foundation built. ${data.fetched || 0} fetched, ${data.cached || 0} cached, ${data.failed || 0} failed.`);
      await loadScreen(selectedScreen);
    } catch (error) {
      console.error('Failed to build day foundation', error);
      setFoundationMessage('Network error while building day foundation.');
    } finally {
      setIsBuildingDayFoundation(false);
    }
  };

  const copyCardMetrics = async (row: ScreenerResultRow) => {
    let latestOptionStructure: OptionStructureSummary | null = row.optionsStructure as OptionStructureSummary | null;

    try {
      const structureRes = await fetch(`/api/stocks/options-structure/${encodeURIComponent(row.symbol)}`, {
        cache: 'no-store',
      });
      const structureData = await structureRes.json();
      if (structureRes.ok && structureData?.summary) {
        latestOptionStructure = structureData.summary as OptionStructureSummary;
      }
    } catch (error) {
      console.error('Failed to refresh option structure before copy', error);
    }

    const exportScorePayload =
      payload?.scorePayload && latestOptionStructure
        ? {
            ...payload.scorePayload,
            optionStructureContext: {
              ...payload.scorePayload.optionStructureContext,
              [row.symbol]: latestOptionStructure,
            },
          }
        : payload?.scorePayload || null;

    const recalculatedBreakdown = exportScorePayload
      ? getScreenerScoreBreakdown(selectedScreen, row, exportScorePayload)
      : row.scoreBreakdown;
    const recalculatedScore = exportScorePayload
      ? computeScreenerScore(selectedScreen, row, exportScorePayload)
      : row.score;
    const exportProbabilityEstimate: ProbabilityEstimate | null = row.probabilityEstimate
      ? {
          sampleSize: row.probabilityEstimate.sampleSize,
          winRate: row.probabilityEstimate.winRate,
          avgWinPct: row.probabilityEstimate.avgWinPct,
          avgLossPct: row.probabilityEstimate.avgLossPct,
          expectancyPct: row.probabilityEstimate.expectancyPct,
          avgExcessReturnPct: 0,
          netExpectancyPct: row.probabilityEstimate.expectancyPct,
        }
      : null;
    const recalculatedBuyRecommendation = buildBuyRecommendation(
      selectedScreen,
      row,
      recalculatedScore,
      exportProbabilityEstimate,
      latestOptionStructure
    );

    const payloadToCopy = {
      exportedAt: new Date().toISOString(),
      screen: selectedScreen,
      screenLabel: payload?.screenLabel || SCREEN_LABELS[selectedScreen],
      benchmark: payload?.benchmark || 'NIFTY 50',
      regime: exportScorePayload?.regime || null,
      stock: {
        ...row,
        optionsStructure: latestOptionStructure,
        optionsAdjustment: recalculatedBreakdown.optionsAdjustment,
        microstructureAdjustment: recalculatedBreakdown.microstructureAdjustment,
        baseScore: recalculatedBreakdown.baseScore,
        sectorAdjustment: recalculatedBreakdown.sectorAdjustment,
        regimeAdjustment: recalculatedBreakdown.regimeAdjustment,
        buyRecommendation: recalculatedBuyRecommendation,
        score: recalculatedScore,
        scoreBreakdown: recalculatedBreakdown,
      },
    };

    try {
      await navigator.clipboard.writeText(JSON.stringify(payloadToCopy, null, 2));
      setCopiedSymbol(row.symbol);
      window.setTimeout(() => {
        setCopiedSymbol((current) => (current === row.symbol ? null : current));
      }, 1800);
    } catch (error) {
      console.error('Failed to copy screener card payload', error);
    }
  };

  const results = (payload?.results || []).map((row) => {
    const liveQuote = snapshot.quotes.find((quote) => quote.instrument === row.instrument);
    if (!liveQuote) return row;

    const liveLastPrice = liveQuote.lastPrice;
    const referenceClose = liveQuote.close ?? row.lastPrice;
    const liveDayChangePct = referenceClose ? ((liveLastPrice - referenceClose) / referenceClose) * 100 : row.dayChangePct;
    const liveVolume = liveQuote.volume || row.volume;
    const liveVolumeExpansion =
      row.avgVolume20 && row.avgVolume20 > 0 ? Number((liveVolume / row.avgVolume20).toFixed(2)) : row.volumeExpansion;
    const liveAboveVwap = row.vwap !== null ? liveLastPrice > row.vwap : row.aboveVwap;
    const liveMicroprice = liveQuote.microprice ?? null;
    const liveMicropriceEdgePct = liveQuote.micropriceEdgePct ?? null;
    const liveOfi = liveQuote.orderFlowImbalance ?? null;
    const liveRollingOfi = liveQuote.rollingOfi ?? null;
    const liveVpin = liveQuote.vpin ?? null;

    const liveRow = {
      ...row,
      lastPrice: liveLastPrice,
      dayChangePct: Number(liveDayChangePct.toFixed(2)),
      volume: liveVolume,
      volumeExpansion: liveVolumeExpansion,
      aboveVwap: liveAboveVwap,
      microprice: liveMicroprice,
      micropriceEdgePct: liveMicropriceEdgePct,
      orderFlowImbalance: liveOfi,
      rollingOfi: liveRollingOfi,
      vpin: liveVpin,
    };
    return {
      ...liveRow,
      ...(payload?.scorePayload
        ? (() => {
            const liveBreakdown = getScreenerScoreBreakdown(selectedScreen, liveRow, payload.scorePayload);
            const liveScore = computeScreenerScore(selectedScreen, liveRow, payload.scorePayload);
            const liveBuyRecommendation = buildBuyRecommendation(
              selectedScreen,
              liveRow,
              liveScore,
              row.probabilityEstimate as ProbabilityEstimate | null,
              row.optionsStructure as OptionStructureSummary | null
            );
            return {
              baseScore: liveBreakdown.baseScore,
              sectorAdjustment: liveBreakdown.sectorAdjustment,
              regimeAdjustment: liveBreakdown.regimeAdjustment,
              optionsAdjustment: liveBreakdown.optionsAdjustment,
              microstructureAdjustment: liveBreakdown.microstructureAdjustment,
              sectorState: liveBreakdown.sectorState,
              sectorBreadthPct: liveBreakdown.sectorBreadthPct,
              sectorBreadthDelta: liveBreakdown.sectorBreadthDelta,
              optionsStructure: row.optionsStructure,
              probabilityEstimate: row.probabilityEstimate,
              buyRecommendation: liveBuyRecommendation,
              score: liveScore,
              scoreBreakdown: liveBreakdown,
            };
          })()
        : {
            baseScore: row.baseScore,
            sectorAdjustment: row.sectorAdjustment,
            regimeAdjustment: row.regimeAdjustment,
            optionsAdjustment: row.optionsAdjustment,
            microstructureAdjustment: row.microstructureAdjustment,
            sectorState: row.sectorState,
            sectorBreadthPct: row.sectorBreadthPct,
            sectorBreadthDelta: row.sectorBreadthDelta,
            optionsStructure: row.optionsStructure,
            probabilityEstimate: row.probabilityEstimate,
            score: row.score,
            scoreBreakdown: row.scoreBreakdown,
            buyRecommendation: row.buyRecommendation,
          }),
    };
  }).filter((row) => resultCategoryFilter === 'all' ? true : row.category === resultCategoryFilter)
    .sort((a, b) => b.score - a.score);

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-16 text-slate-100">
      <div className="mx-auto max-w-7xl">
        <div className="max-w-4xl">
          <p className="inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1 text-xs font-semibold text-emerald-300">
            Stock analytics foundation
          </p>
          <h1 className="mt-4 text-4xl font-black tracking-tight">Equity screener workbench</h1>
          <p className="mt-5 text-base leading-7 text-slate-300">
            This is the first stock-first screen layer. It combines price action, volume, VWAP, moving averages, RSI,
            ATR, relative strength, breakout levels, gap analysis, and sector breadth into practical watchlists.
          </p>
        </div>

        <div className="mt-10 flex flex-wrap gap-3">
          {SCREEN_OPTIONS.map((screen) => (
            <button
              key={screen}
              type="button"
              onClick={() => loadScreen(screen)}
              disabled={isLoading}
              className={`rounded-2xl px-5 py-3 text-xs font-semibold transition ${
                selectedScreen === screen
                  ? 'bg-emerald-500 text-slate-950'
                  : 'border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'
              }`}
            >
              {SCREEN_LABELS[screen]}
            </button>
          ))}

          <button
            type="button"
            onClick={() => loadScreen(selectedScreen)}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-xs font-semibold text-white hover:bg-white/10"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <SummaryCard label="Socket" value={socketConnected ? 'Connected' : 'Offline'} icon={socketConnected ? <Wifi className="h-5 w-5 text-emerald-300" /> : <WifiOff className="h-5 w-5 text-rose-300" />} />
          <SummaryCard label="Universe Streamed" value={String(snapshot.universeSize || '--')} />
          <SummaryCard label="Subscribed Tokens" value={String(snapshot.subscribed || '--')} />
          <SummaryCard
            label="Last Tick"
            value={snapshot.lastSnapshotAt ? new Date(snapshot.lastSnapshotAt).toLocaleTimeString() : '--'}
          />
        </div>

        {payload?.needsLogin ? (
          <div className="mt-10 rounded-3xl border border-rose-500/20 bg-rose-500/10 p-8">
            <h2 className="text-xl font-bold text-white">Kite authentication required</h2>
            <p className="mt-3 text-slate-200">
              Login first from <a href="/auth-test" className="text-emerald-300 underline">/auth-test</a>, then come back here to run the screeners.
            </p>
          </div>
        ) : null}

        {payload?.error && !payload?.needsLogin ? (
          <div className="mt-10 rounded-3xl border border-rose-500/20 bg-rose-500/10 p-8 text-rose-100">
            <p>{payload.error}</p>
            {payload.error.includes('Build /api/stocks/research/foundation') ? (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={buildDayFoundation}
                  disabled={isBuildingDayFoundation}
                  className="inline-flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RefreshCw className={`h-4 w-4 ${isBuildingDayFoundation ? 'animate-spin' : ''}`} />
                  Build Day Foundation
                </button>
                {foundationMessage ? <span className="text-sm text-slate-200">{foundationMessage}</span> : null}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-10 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-3xl border border-white/10 bg-white/5 p-8">
            <div className="flex items-start justify-between gap-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Current screen</p>
                <h2 className="mt-2 text-2xl font-black">{payload?.screenLabel || SCREEN_LABELS[selectedScreen]}</h2>
              </div>
              <SearchCheck className="h-10 w-10 text-emerald-300" />
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <SummaryCard label="Universe" value={String(payload?.universeSize ?? '--')} />
              <SummaryCard label="Matches" value={String(payload?.matched ?? '--')} />
              <SummaryCard label="Benchmark" value={payload?.benchmark || 'NIFTY 50'} />
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-4">
              <SummaryCard label="Regime" value={payload?.scorePayload?.regime.label || '--'} />
              <SummaryCard label="Confidence" value={payload?.scorePayload?.regime ? `${Math.round(payload.scorePayload.regime.confidence * 100)}%` : '--'} />
              <SummaryCard label="Breadth" value={payload?.scorePayload?.regime ? `${payload.scorePayload.regime.advancingBreadthPct.toFixed(1)}%` : '--'} />
              <SummaryCard label="Nifty 20d" value={payload?.scorePayload?.regime ? `${payload.scorePayload.regime.benchmarkReturn20d.toFixed(2)}%` : '--'} />
            </div>

            <div className="mt-6 rounded-2xl border border-white/10 bg-slate-950/50 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">What this screen looks for</p>
              <p className="mt-3 text-xs leading-6 text-slate-300">
                {selectedScreen === 'intraday-momentum' &&
                  'Stocks holding above VWAP with positive day strength, strong relative strength, and expanding volume.'}
                {selectedScreen === 'swing-setups' &&
                  'Trend-aligned names above their moving averages with healthy but not overheated RSI and a nearby breakout trigger.'}
                {selectedScreen === 'mean-reversion' &&
                  'Names under short-term pressure with lower RSI and a negative opening gap that could set up a rebound trade.'}
                {selectedScreen === 'breakout-watchlist' &&
                  'Stocks closing in on their recent breakout levels while volume and trend structure stay supportive.'}
              </p>
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/5 p-8">
            <div className="flex items-center gap-3">
              <Gauge className="h-6 w-6 text-sky-300" />
              <h2 className="text-xl font-bold">Sector breadth</h2>
            </div>
            <div className="mt-6 space-y-3">
              {(payload?.sectorBreadth || []).length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/40 p-5 text-xs text-slate-400">
                  Sector breadth will populate once the selected screen has qualifying names.
                </div>
              ) : (
                payload?.sectorBreadth?.map((row) => (
                  <div key={row.sector} className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-white">{row.sector}</p>
                      <p className="text-xs text-slate-400">{row.members} names</p>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs">
                      <span className="text-slate-400">Advancing breadth</span>
                      <span className="font-semibold text-emerald-300">{row.breadthPct}%</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs">
                      <span className="text-slate-400">Above SMA20</span>
                      <span className="font-semibold text-sky-300">{row.aboveSma20Pct}%</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        <section className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-8">
          <div className="flex items-center gap-3">
            <Activity className="h-6 w-6 text-emerald-300" />
            <h2 className="text-xl font-bold">Screen results</h2>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            {RESULT_CATEGORY_OPTIONS.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setResultCategoryFilter(category)}
                className={`rounded-2xl px-4 py-2 text-xs font-semibold transition ${
                  resultCategoryFilter === category
                    ? 'bg-emerald-500 text-slate-950'
                    : 'border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'
                }`}
              >
                {category === 'all' ? 'All' : CATEGORY_LABELS[category]}
              </button>
            ))}
          </div>

          {isLoading ? (
            <div className="mt-6 rounded-2xl border border-dashed border-white/10 bg-slate-950/40 p-6 text-xs text-slate-400">
              Running the screener...
            </div>
          ) : results.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-white/10 bg-slate-950/40 p-6 text-xs text-slate-400">
              No names matched this screen right now.
            </div>
          ) : (
            <div className="mt-6 grid gap-4 xl:grid-cols-2">
              {results.map((row) => (
                <article key={row.symbol} className="rounded-3xl border border-white/10 bg-slate-950/50 p-6">
                  <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{row.sector}</p>
                      <h3 className="mt-2 text-xl font-black text-white">{row.symbol}</h3>
                      <p className="mt-1 text-xs text-slate-400">{row.instrument} · {CATEGORY_LABELS[row.category]}</p>

                      <div className="mt-5 flex flex-wrap items-center gap-3 text-xs">
                        <span
                          className={`inline-flex items-center gap-2 rounded-full px-3 py-1 ${
                            row.buyRecommendation.confidenceLabel === 'High'
                              ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                              : row.buyRecommendation.confidenceLabel === 'Medium'
                                ? 'border border-sky-500/30 bg-sky-500/10 text-sky-300'
                                : row.buyRecommendation.confidenceLabel === 'Watchlist'
                                  ? 'border border-amber-500/30 bg-amber-500/10 text-amber-300'
                                  : 'border border-rose-500/30 bg-rose-500/10 text-rose-300'
                          }`}
                        >
                          Buy Confidence {row.buyRecommendation.confidenceLabel} ({row.buyRecommendation.confidenceScore.toFixed(1)})
                          <MetricHelp text={getConfidenceExplanation(row)} />
                        </span>
                        <span
                          className={`inline-flex items-center gap-2 rounded-full px-3 py-1 ${
                            row.buyRecommendation.historicallySupported
                              ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                              : row.buyRecommendation.supportLabel === 'Developing Evidence'
                                ? 'border border-amber-500/30 bg-amber-500/10 text-amber-300'
                                : 'border border-white/10 bg-white/5 text-slate-300'
                          }`}
                        >
                          {row.buyRecommendation.supportLabel}
                          <MetricHelp text={row.buyRecommendation.supportExplanation} />
                        </span>
                      </div>

                      <div className="mt-5 flex flex-wrap items-center gap-3 text-xs">
                        {row.aboveVwap ? (
                          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-emerald-300">
                            <TrendingUp className="h-4 w-4" />
                            Above VWAP
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-2 rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-rose-300">
                            <TrendingDown className="h-4 w-4" />
                            Below VWAP
                          </span>
                        )}
                        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-300">
                          <ArrowUpRight className="h-4 w-4" />
                          Delivery data unavailable
                        </span>
                        <span
                          className={`inline-flex items-center gap-2 rounded-full px-3 py-1 ${
                            row.sectorState === 'upgrade'
                              ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                              : row.sectorState === 'degrade'
                                ? 'border border-rose-500/30 bg-rose-500/10 text-rose-300'
                                : 'border border-white/10 bg-white/5 text-slate-300'
                          }`}
                        >
                          <ArrowUpRight className="h-4 w-4" />
                          Sector {row.sectorState}
                        </span>
                        {row.optionsStructure?.available ? (
                          <span
                            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 ${
                              row.optionsStructure.gammaRegime === 'stabilizing'
                                ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                                : row.optionsStructure.gammaRegime === 'expansive'
                                  ? 'border border-rose-500/30 bg-rose-500/10 text-rose-300'
                                  : 'border border-white/10 bg-white/5 text-slate-300'
                            }`}
                          >
                            <Gauge className="h-4 w-4" />
                            Gamma {row.optionsStructure.gammaRegime}
                          </span>
                        ) : null}
                        {row.optionsStructure?.available ? (
                          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-300">
                            OI {row.optionsStructure.dominantOiFlow.replace('_', ' ')}
                          </span>
                        ) : null}
                        {row.optionsStructure?.available ? (
                          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-300">
                            Fut {row.optionsStructure.futuresBuildup.replace('_', ' ')}
                          </span>
                        ) : null}
                        <Link
                          href={`/options-structure?symbol=${encodeURIComponent(row.symbol)}`}
                          className="inline-flex items-center gap-2 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-sky-200 transition hover:bg-sky-500/20"
                        >
                          <Gauge className="h-4 w-4" />
                          Open structure
                        </Link>
                      </div>

                      <div className="mt-5 rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Thesis</p>
                        <p className="mt-3 text-xs leading-6 text-slate-300">{row.thesis}</p>
                        {row.optionsStructure?.available ? (
                          <p className="mt-3 text-[11px] leading-5 text-slate-400">{row.optionsStructure.interpretation}</p>
                        ) : null}
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Score</p>
                            <p className="mt-2 text-4xl font-black tracking-tight text-emerald-300">{row.score.toFixed(1)}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => copyCardMetrics(row)}
                            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-semibold text-slate-200 transition hover:bg-white/10"
                            title="Copy card metrics as JSON"
                          >
                            <Copy className="h-4 w-4" />
                            {copiedSymbol === row.symbol ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                        <div className="mt-4 h-2 rounded-full bg-white/10">
                          <div
                            className="h-2 rounded-full bg-emerald-400 transition-all"
                            style={{ width: `${Math.min(Math.max(row.score, 0), 100)}%` }}
                          />
                        </div>
                      </div>

                      <div className="rounded-3xl border border-emerald-500/20 bg-emerald-500/5 p-5">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-300">Trade Levels</p>
                        <div className="mt-4 grid gap-3 sm:grid-cols-1">
                          <TradeLevelCard label="Entry" value={row.buyRecommendation.plan.entryPrice.toFixed(2)} tone="entry" />
                          <TradeLevelCard label="Stop" value={row.buyRecommendation.plan.stopLoss.toFixed(2)} tone="stop" />
                          <TradeLevelCard label="Target" value={row.buyRecommendation.plan.targetPrice.toFixed(2)} tone="target" />
                        </div>
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          <MiniStat label="Risk %" value={`${row.buyRecommendation.plan.riskPct.toFixed(2)}%`} accent="text-rose-300" />
                          <MiniStat label="Reward %" value={`${row.buyRecommendation.plan.rewardPct.toFixed(2)}%`} accent="text-emerald-300" />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 rounded-3xl border border-white/10 bg-slate-900/35 p-5">
                    {getMetricSections(row).map((section) => (
                      <MetricSection key={section.title} title={section.title} metrics={section.metrics} />
                    ))}
                  </div>

                  <div className="mt-6 rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Score Explainer</p>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-slate-400">Base</span>
                        <span className="font-semibold text-white">{row.scoreBreakdown.baseScore.toFixed(1)}</span>
                        <span className="text-slate-400">Sector</span>
                        <span className={row.scoreBreakdown.sectorAdjustment >= 0 ? 'font-semibold text-emerald-300' : 'font-semibold text-rose-300'}>
                          {row.scoreBreakdown.sectorAdjustment >= 0 ? '+' : ''}
                          {row.scoreBreakdown.sectorAdjustment.toFixed(1)}
                        </span>
                        <span className="text-slate-400">Regime</span>
                        <span className={row.scoreBreakdown.regimeAdjustment >= 0 ? 'font-semibold text-emerald-300' : 'font-semibold text-rose-300'}>
                          {row.scoreBreakdown.regimeAdjustment >= 0 ? '+' : ''}
                          {row.scoreBreakdown.regimeAdjustment.toFixed(1)}
                        </span>
                        <span className="text-slate-400">Options</span>
                        <span className={row.scoreBreakdown.optionsAdjustment >= 0 ? 'font-semibold text-emerald-300' : 'font-semibold text-rose-300'}>
                          {row.scoreBreakdown.optionsAdjustment >= 0 ? '+' : ''}
                          {row.scoreBreakdown.optionsAdjustment.toFixed(1)}
                        </span>
                        <span className="text-slate-400">Micro</span>
                        <span className={row.scoreBreakdown.microstructureAdjustment >= 0 ? 'font-semibold text-emerald-300' : 'font-semibold text-rose-300'}>
                          {row.scoreBreakdown.microstructureAdjustment >= 0 ? '+' : ''}
                          {row.scoreBreakdown.microstructureAdjustment.toFixed(1)}
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Microstructure Bias</p>
                        <p className="mt-1 text-xs text-slate-300">{getMicrostructureSummary(row).explanation}</p>
                      </div>
                      <span className={`text-xs font-semibold ${getMicrostructureSummary(row).accent}`}>
                        {getMicrostructureSummary(row).bias}
                      </span>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      {row.scoreBreakdown.topDrivers.map((driver) => (
                        <div key={driver.key} className="rounded-2xl border border-white/10 bg-slate-950/50 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-xs font-semibold text-white">{driver.label}</p>
                            <span className={driver.impact >= 0 ? 'text-xs font-semibold text-emerald-300' : 'text-xs font-semibold text-rose-300'}>
                              {driver.impact >= 0 ? '+' : ''}
                              {driver.impact.toFixed(1)}
                            </span>
                          </div>
                          <p className="mt-2 text-xs uppercase tracking-[0.2em] text-slate-500">Input</p>
                          <p className="mt-1 text-xs text-slate-300">{driver.displayValue}</p>
                        </div>
                      ))}
                    </div>

                    {row.probabilityEstimate ? (
                      <div className="mt-4 rounded-2xl border border-sky-500/20 bg-sky-500/10 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-300">Historical Edge</p>
                        <div className="mt-3 grid gap-3 sm:grid-cols-4">
                          <div>
                            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Sample</p>
                            <p className="mt-1 text-base font-bold text-white">{row.probabilityEstimate.sampleSize}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Win Rate</p>
                            <p className="mt-1 text-base font-bold text-white">{row.probabilityEstimate.winRate.toFixed(1)}%</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Avg Win</p>
                            <p className="mt-1 text-base font-bold text-emerald-300">{row.probabilityEstimate.avgWinPct.toFixed(2)}%</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Avg Loss</p>
                            <p className="mt-1 text-base font-bold text-rose-300">{row.probabilityEstimate.avgLossPct.toFixed(2)}%</p>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    <details className="mt-4 rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                      <summary className="cursor-pointer text-xs font-semibold text-slate-200">Show full factor breakdown</summary>
                      <div className="mt-4 space-y-2">
                        {row.scoreBreakdown.contributions.map((driver) => (
                          <div key={driver.key} className="flex items-center justify-between gap-4 text-xs">
                            <div>
                              <p className="font-medium text-white">{driver.label}</p>
                              <p className="text-slate-400">{driver.displayValue}</p>
                            </div>
                            <span className={driver.impact >= 0 ? 'font-semibold text-emerald-300' : 'font-semibold text-rose-300'}>
                              {driver.impact >= 0 ? '+' : ''}
                              {driver.impact.toFixed(1)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </details>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {(payload?.notes || []).length > 0 ? (
          <section className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-8">
            <h2 className="text-lg font-bold">Notes</h2>
            <div className="mt-4 space-y-2 text-xs text-slate-300">
              {payload?.notes?.map((note) => (
                <p key={note}>{note}</p>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}

function SummaryCard({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-400">{label}</p>
        {icon || null}
      </div>
      <p className="mt-2 text-xl font-bold text-white">{value}</p>
    </div>
  );
}

function MetricSection({
  title,
  metrics,
}: {
  title: string;
  metrics: Array<{ label: string; value: string; accent?: string }>;
}) {
  return (
    <section className="border-t border-white/10 py-5 first:border-t-0 first:pt-0 last:pb-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">{title}</p>
      <div className="mt-3 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/30">
        <div className="px-5 py-2">
          {metrics.map((metric) => (
            <TableMetric key={metric.label} label={metric.label} value={metric.value} accent={metric.accent} />
          ))}
        </div>
      </div>
    </section>
  );
}

function TradeLevelCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'entry' | 'stop' | 'target';
}) {
  const toneClass =
    tone === 'entry'
      ? 'border-emerald-500/30 bg-emerald-500/5'
      : tone === 'stop'
        ? 'border-rose-500/30 bg-rose-500/5'
        : 'border-sky-500/30 bg-sky-500/5';

  const valueClass =
    tone === 'entry' ? 'text-white' : tone === 'stop' ? 'text-rose-300' : 'text-sky-300';

  return (
    <div className={`rounded-2xl border p-4 ${toneClass}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">{label}</p>
      <p className={`mt-3 break-all text-2xl font-black tracking-tight ${valueClass}`}>{value}</p>
    </div>
  );
}

function MiniStat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-3">
      <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className={`mt-2 text-base font-bold text-white ${accent || ''}`}>{value}</p>
    </div>
  );
}

function TableMetric({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/10 py-1 last:border-b-0">
      <div className="flex min-w-0 items-center gap-2 pr-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">{label}</p>
        {METRIC_EXPLAINERS[label] ? <MetricHelp text={METRIC_EXPLAINERS[label]} /> : null}
      </div>
      <p className={`text-right text-xs font-medium tracking-tight text-slate-100 ${accent || ''}`}>{value}</p>
    </div>
  );
}

function MetricHelp({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex items-center">
      <CircleHelp className="h-3.5 w-3.5 text-slate-500" />
      <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-56 -translate-x-1/2 rounded-xl border border-white/10 bg-slate-950/95 px-3 py-2 text-[10px] normal-case leading-4 text-slate-200 shadow-2xl group-hover:block">
        {text}
      </span>
    </span>
  );
}
