import { NextResponse } from 'next/server';
import { getKiteInstance } from '@/lib/kiteHelper';
import { buildOptionStructureBatch } from '@/lib/optionsStructure/core';
import { GammaRegime, VolSkewRegime } from '@/lib/optionsStructure/types';
import {
  appendOptionSurfaceHistory,
  createOptionSurfaceHistoryRow,
  getOptionSurfaceHistorySummary,
} from '@/lib/optionsStructure/history';
import { getStockUniverse } from '@/lib/stockUniverseStore';

type VolSurfaceSnapshot = {
  symbol: string;
  sector: string;
  atmIv: number | null;
  nearAtmVolSkew: number | null;
  wingPutIv: number | null;
  wingCallIv: number | null;
  termStructureSlope: number | null;
  volSkewRegime: VolSkewRegime;
  gammaRegime: GammaRegime;
  optionsAdjustmentHint: number;
};

function average(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function summarizeByRegime(rows: VolSurfaceSnapshot[], key: 'volSkewRegime' | 'gammaRegime') {
  return Array.from(
    rows.reduce<Map<string, VolSurfaceSnapshot[]>>((acc, row) => {
      const bucket = row[key] || 'unavailable';
      const existing = acc.get(bucket) || [];
      existing.push(row);
      acc.set(bucket, existing);
      return acc;
    }, new Map())
  )
    .map(([regime, bucket]) => {
      const atmIv = bucket.map((row) => row.atmIv).filter((value): value is number => value !== null);
      const skew = bucket.map((row) => row.nearAtmVolSkew).filter((value): value is number => value !== null);
      const term = bucket.map((row) => row.termStructureSlope).filter((value): value is number => value !== null);
      const adjustment = bucket
        .map((row) => row.optionsAdjustmentHint)
        .filter((value): value is number => Number.isFinite(value));

      return {
        regime,
        sampleSize: bucket.length,
        avgAtmIv: average(atmIv),
        avgNearAtmSkew: average(skew),
        avgTermSlope: average(term),
        avgOptionsAdjustment: average(adjustment),
      };
    })
    .sort((a, b) => b.sampleSize - a.sampleSize);
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const requestedLimit = Number(url.searchParams.get('limit') || '40');
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 5), 80) : 40;

    const kite = getKiteInstance();
    const universe = getStockUniverse().slice(0, limit);
    if (universe.length === 0) {
      return NextResponse.json({
        success: true,
        generatedAt: new Date().toISOString(),
        totalSymbols: 0,
        availableCount: 0,
        skewSummary: [],
        gammaSummary: [],
        topPositiveSkew: [],
        topNegativeSkew: [],
        topTermSlope: [],
      });
    }

    const quotes = await kite.getQuote(universe.map((item) => item.instrument));
    const requests = universe
      .map((item) => {
        const quote = quotes[item.instrument];
        const spotPrice = quote?.last_price || quote?.ohlc?.close || 0;
        return spotPrice > 0 ? { symbol: item.symbol, spotPrice } : null;
      })
      .filter((item): item is { symbol: string; spotPrice: number } => Boolean(item));

    const summaries = await buildOptionStructureBatch(kite, requests);
    const snapshots = universe.reduce<VolSurfaceSnapshot[]>((acc, item) => {
        const summary = summaries[item.symbol];
        if (!summary?.available) return acc;
        acc.push({
          symbol: item.symbol,
          sector: item.sector,
          atmIv: summary.atmIv,
          nearAtmVolSkew: summary.nearAtmVolSkew,
          wingPutIv: summary.wingPutIv,
          wingCallIv: summary.wingCallIv,
          termStructureSlope: summary.termStructureSlope,
          volSkewRegime: summary.volSkewRegime,
          gammaRegime: summary.gammaRegime,
          optionsAdjustmentHint: summary.optionsAdjustmentHint,
        });
        return acc;
      }, []);

    const topPositiveSkew = [...snapshots]
      .filter((row) => row.nearAtmVolSkew !== null)
      .sort((a, b) => (b.nearAtmVolSkew || 0) - (a.nearAtmVolSkew || 0))
      .slice(0, 6);
    const topNegativeSkew = [...snapshots]
      .filter((row) => row.nearAtmVolSkew !== null)
      .sort((a, b) => (a.nearAtmVolSkew || 0) - (b.nearAtmVolSkew || 0))
      .slice(0, 6);
    const topTermSlope = [...snapshots]
      .filter((row) => row.termStructureSlope !== null)
      .sort((a, b) => Math.abs(b.termStructureSlope || 0) - Math.abs(a.termStructureSlope || 0))
      .slice(0, 6);

    return NextResponse.json({
      success: true,
      generatedAt: new Date().toISOString(),
      totalSymbols: universe.length,
      availableCount: snapshots.length,
      historySummary: getOptionSurfaceHistorySummary(),
      skewSummary: summarizeByRegime(snapshots, 'volSkewRegime'),
      gammaSummary: summarizeByRegime(snapshots, 'gammaRegime'),
      topPositiveSkew,
      topNegativeSkew,
      topTermSlope,
      notes: [
        'This section is a live diagnostics read, not a historical backtest of options-surface features yet.',
        'To statistically validate skew and term structure, we would need historical options-surface snapshots in the research pipeline.',
      ],
    });
  } catch (error) {
    console.error('Failed to build vol surface research diagnostics', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to build vol surface diagnostics.',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const requestedLimit = Number(url.searchParams.get('limit') || '40');
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 5), 80) : 40;
    const capturedAt = new Date().toISOString();

    const kite = getKiteInstance();
    const universe = getStockUniverse().slice(0, limit);
    const quotes = await kite.getQuote(universe.map((item) => item.instrument));
    const requests = universe
      .map((item) => {
        const quote = quotes[item.instrument];
        const spotPrice = quote?.last_price || quote?.ohlc?.close || 0;
        return spotPrice > 0 ? { item, spotPrice } : null;
      })
      .filter((row): row is { item: (typeof universe)[number]; spotPrice: number } => Boolean(row));

    const summaries = await buildOptionStructureBatch(
      kite,
      requests.map((row) => ({ symbol: row.item.symbol, spotPrice: row.spotPrice }))
    );
    const rows = requests.reduce<ReturnType<typeof createOptionSurfaceHistoryRow>[]>((acc, row) => {
      const summary = summaries[row.item.symbol];
      if (!summary?.available) return acc;
      acc.push(
        createOptionSurfaceHistoryRow({
          capturedAt,
          symbol: row.item.symbol,
          sector: row.item.sector,
          category: row.item.category,
          summary,
        })
      );
      return acc;
    }, []);
    const writeResult = await appendOptionSurfaceHistory(rows);

    return NextResponse.json({
      success: true,
      capturedAt,
      requestedSymbols: universe.length,
      capturedSymbols: rows.length,
      historySummary: getOptionSurfaceHistorySummary(),
      writeResult,
    });
  } catch (error) {
    console.error('Failed to capture options surface history', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to capture options surface history.',
      },
      { status: 500 }
    );
  }
}
