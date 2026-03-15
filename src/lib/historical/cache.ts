import fs from 'fs';
import path from 'path';
import { HistoricalDatasetFile, HistoricalInterval, HistoricalManifest } from '@/lib/historical/types';

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
  fs.writeFileSync(filePath, JSON.stringify(dataset, null, 2), 'utf8');
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
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  return manifestPath;
}
