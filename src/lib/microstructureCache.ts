import fs from 'fs';
import path from 'path';
import {
  hydrateMinuteMicrostructureFromMongoIfNeeded,
  persistMinuteMicrostructureToMongo,
} from '@/lib/mongoBackedCache';

export interface MinuteMicrostructureBucket {
  symbol: string;
  instrument: string;
  minute: string;
  averageMicropriceEdgePct: number | null;
  averageOrderFlowImbalance: number | null;
  averageRollingOfi: number | null;
  averageVpin: number | null;
  averageTradePressureScore: number | null;
  depthSampleCount: number;
  tradePressureCount: number;
  sampleCount: number;
}

type MinuteMicrostructureStore = Record<string, MinuteMicrostructureBucket[]>;

const STORE_PATH = path.join(process.cwd(), 'microstructure_minute_cache.json');

hydrateMinuteMicrostructureFromMongoIfNeeded().catch((error) => {
  console.error('Failed to hydrate minute microstructure cache from Mongo', error);
});

function readStore(): MinuteMicrostructureStore {
  if (!fs.existsSync(STORE_PATH)) {
    return {};
  }

  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')) as MinuteMicrostructureStore;
  } catch {
    return {};
  }
}

function writeStore(store: MinuteMicrostructureStore) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(store), 'utf8');
  persistMinuteMicrostructureToMongo(store).catch((error) => {
    console.error('Failed to persist minute microstructure cache to Mongo', error);
  });
}

export function persistMinuteMicrostructureBuckets(buckets: MinuteMicrostructureBucket[]) {
  if (buckets.length === 0) return;

  const store = readStore();

  for (const bucket of buckets) {
    const rows = store[bucket.symbol] || [];
    const next = [...rows.filter((row) => row.minute !== bucket.minute), bucket]
      .sort((a, b) => a.minute.localeCompare(b.minute))
      .slice(-600);
    store[bucket.symbol] = next;
  }

  writeStore(store);
}

export function readMinuteMicrostructureBuckets(symbol: string) {
  const store = readStore();
  return store[symbol] || [];
}
