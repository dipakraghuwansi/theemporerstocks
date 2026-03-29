import fs from 'fs';
import path from 'path';
import { getMongoCollection, isMongoConfigured } from '@/lib/mongo';
import { OptionStructureSummary } from '@/lib/optionsStructure/types';

const HISTORY_PATH = path.join(process.cwd(), 'options_surface_history.json');

export type OptionSurfaceHistoryRow = {
  capturedAt: string;
  capturedMinute: string;
  symbol: string;
  sector: string;
  category: string;
  expiry: string | null;
  underlyingPrice: number;
  atmIv: number | null;
  averageCallIv: number | null;
  averagePutIv: number | null;
  nearAtmVolSkew: number | null;
  wingCallIv: number | null;
  wingPutIv: number | null;
  termStructureSlope: number | null;
  volSkewRegime: string;
  gammaRegime: string;
  vannaRegime: string;
  charmRegime: string;
  optionsAdjustmentHint: number;
};

function ensureHistoryFile() {
  if (!fs.existsSync(HISTORY_PATH)) {
    fs.writeFileSync(HISTORY_PATH, '[]', 'utf8');
  }
}

export function readOptionSurfaceHistory() {
  ensureHistoryFile();
  try {
    return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8')) as OptionSurfaceHistoryRow[];
  } catch {
    return [];
  }
}

function writeOptionSurfaceHistory(rows: OptionSurfaceHistoryRow[]) {
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(rows), 'utf8');
}

async function persistOptionSurfaceHistoryToMongo(rows: OptionSurfaceHistoryRow[]) {
  if (!isMongoConfigured() || rows.length === 0) return;
  const collection = await getMongoCollection<OptionSurfaceHistoryRow & { updatedAt: string }>('options_surface_history');
  await Promise.all(
    rows.map((row) =>
      collection.updateOne(
        { symbol: row.symbol, capturedMinute: row.capturedMinute },
        {
          $set: {
            ...row,
            updatedAt: new Date().toISOString(),
          },
        },
        { upsert: true }
      )
    )
  );
}

export function createOptionSurfaceHistoryRow(input: {
  capturedAt?: string;
  symbol: string;
  sector: string;
  category: string;
  summary: OptionStructureSummary;
}) {
  const capturedAt = input.capturedAt || new Date().toISOString();
  return {
    capturedAt,
    capturedMinute: capturedAt.slice(0, 16),
    symbol: input.symbol,
    sector: input.sector,
    category: input.category,
    expiry: input.summary.expiry,
    underlyingPrice: input.summary.underlyingPrice,
    atmIv: input.summary.atmIv,
    averageCallIv: input.summary.averageCallIv,
    averagePutIv: input.summary.averagePutIv,
    nearAtmVolSkew: input.summary.nearAtmVolSkew,
    wingCallIv: input.summary.wingCallIv,
    wingPutIv: input.summary.wingPutIv,
    termStructureSlope: input.summary.termStructureSlope,
    volSkewRegime: input.summary.volSkewRegime,
    gammaRegime: input.summary.gammaRegime,
    vannaRegime: input.summary.vannaRegime,
    charmRegime: input.summary.charmRegime,
    optionsAdjustmentHint: input.summary.optionsAdjustmentHint,
  } satisfies OptionSurfaceHistoryRow;
}

export async function appendOptionSurfaceHistory(rows: OptionSurfaceHistoryRow[]) {
  if (rows.length === 0) {
    return {
      written: 0,
      total: readOptionSurfaceHistory().length,
      lastCapturedAt: null as string | null,
    };
  }

  const existing = readOptionSurfaceHistory();
  const nextMap = new Map(existing.map((row) => [`${row.symbol}:${row.capturedMinute}`, row] as const));
  rows.forEach((row) => {
    nextMap.set(`${row.symbol}:${row.capturedMinute}`, row);
  });
  const merged = Array.from(nextMap.values()).sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
  writeOptionSurfaceHistory(merged);
  persistOptionSurfaceHistoryToMongo(rows).catch((error) => {
    console.error('Failed to persist options surface history to Mongo', error);
  });

  return {
    written: rows.length,
    total: merged.length,
    lastCapturedAt: rows[rows.length - 1]?.capturedAt || null,
  };
}

export function getOptionSurfaceHistorySummary() {
  const rows = readOptionSurfaceHistory();
  const symbolCount = new Set(rows.map((row) => row.symbol)).size;
  const lastCapturedAt = rows.length > 0 ? rows[rows.length - 1].capturedAt : null;
  return {
    totalSnapshots: rows.length,
    uniqueSymbols: symbolCount,
    lastCapturedAt,
  };
}

export function getLatestOptionSurfaceSnapshot(symbol: string, asOf: string) {
  const target = new Date(asOf).getTime();
  if (!Number.isFinite(target)) return null;

  const rows = readOptionSurfaceHistory().filter((row) => row.symbol === symbol);
  let best: OptionSurfaceHistoryRow | null = null;

  for (const row of rows) {
    const captured = new Date(row.capturedAt).getTime();
    if (!Number.isFinite(captured) || captured > target) continue;
    if (!best || captured > new Date(best.capturedAt).getTime()) {
      best = row;
    }
  }

  return best;
}
