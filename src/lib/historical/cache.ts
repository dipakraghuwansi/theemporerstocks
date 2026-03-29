import fs from 'fs';
import path from 'path';
import { HistoricalDatasetFile, HistoricalInterval, HistoricalManifest } from '@/lib/historical/types';
import {
  hydrateHistoricalDatasetFromMongo,
  hydrateHistoricalManifestFromMongo,
  persistHistoricalDatasetToMongo,
  persistHistoricalManifestToMongo,
} from '@/lib/mongoBackedCache';
import { isMongoConnectivityError } from '@/lib/mongo';

const CACHE_ROOT = path.join(process.cwd(), 'historical_cache');

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function ensureHistoricalCacheRoot() {
  ensureDir(CACHE_ROOT);
  return CACHE_ROOT;
}

export function getIntervalCacheDir(interval: HistoricalInterval) {
  const dir = path.join(ensureHistoricalCacheRoot(), interval);
  ensureDir(dir);
  return dir;
}

export function getDatasetPath(interval: HistoricalInterval, symbol: string) {
  return path.join(getIntervalCacheDir(interval), `${symbol}.json`);
}

export function readDataset(interval: HistoricalInterval, symbol: string) {
  const filePath = getDatasetPath(interval, symbol);
  if (!fs.existsSync(filePath)) return null;

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as HistoricalDatasetFile;
  } catch {
    return null;
  }
}

export function writeDataset(dataset: HistoricalDatasetFile) {
  const filePath = getDatasetPath(dataset.interval, dataset.symbol);
  fs.writeFileSync(filePath, JSON.stringify(dataset), 'utf8');
  persistHistoricalDatasetToMongo(dataset).catch((error) => {
    console.error(`Failed to persist historical dataset ${dataset.interval}:${dataset.symbol} to Mongo`, error);
  });
  return filePath;
}

export function getManifestPath(interval: HistoricalInterval) {
  ensureHistoricalCacheRoot();
  return path.join(CACHE_ROOT, `manifest.${interval}.json`);
}

export function readManifest(interval: HistoricalInterval) {
  const manifestPath = getManifestPath(interval);
  if (!fs.existsSync(manifestPath)) return null;

  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as HistoricalManifest;
  } catch {
    return null;
  }
}

export function writeManifest(manifest: HistoricalManifest) {
  const manifestPath = getManifestPath(manifest.interval);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest), 'utf8');
  persistHistoricalManifestToMongo(manifest).catch((error) => {
    console.error(`Failed to persist historical manifest ${manifest.interval} to Mongo`, error);
  });
  return manifestPath;
}

export async function ensureDatasetHydrated(interval: HistoricalInterval, symbol: string) {
  const existing = readDataset(interval, symbol);
  if (existing) return existing;

  let dataset: HistoricalDatasetFile | null;

  try {
    dataset = await hydrateHistoricalDatasetFromMongo(interval, symbol);
  } catch (error) {
    if (isMongoConnectivityError(error)) {
      console.warn(`Historical dataset hydrate fell back to cache miss for ${interval}:${symbol}`, error);
      return null;
    }

    throw error;
  }

  if (!dataset) return null;

  writeDataset(dataset);
  return dataset;
}

export async function ensureManifestHydrated(interval: HistoricalInterval) {
  const existing = readManifest(interval);
  if (existing) return existing;

  let manifest: HistoricalManifest | null;

  try {
    manifest = await hydrateHistoricalManifestFromMongo(interval);
  } catch (error) {
    if (isMongoConnectivityError(error)) {
      console.warn(`Historical manifest hydrate fell back to cache miss for ${interval}`, error);
      return null;
    }

    throw error;
  }

  if (!manifest) return null;

  writeManifest(manifest);
  return manifest;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function getHistoricalCacheSummary(interval: HistoricalInterval) {
  const dir = getIntervalCacheDir(interval);
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((file) => file.endsWith('.json')) : [];
  const totalBytes = files.reduce((sum, file) => sum + fs.statSync(path.join(dir, file)).size, 0);
  const manifest = readManifest(interval);

  return {
    interval,
    datasetCount: files.length,
    totalBytes,
    totalBytesFormatted: formatBytes(totalBytes),
    manifestGeneratedAt: manifest?.generatedAt || null,
    lookbackDays: manifest?.lookbackDays || null,
    requestedSymbols: manifest?.requestedSymbols.length || 0,
  };
}
