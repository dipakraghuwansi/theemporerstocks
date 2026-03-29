import fs from "fs";
import path from "path";

import { getMongoCollection, isMongoConfigured } from "@/lib/mongo";
import { HistoricalDatasetFile, HistoricalInterval, HistoricalManifest } from "@/lib/historical/types";
import { ResearchManifest, ScreenOutcomeLabel } from "@/lib/research/types";
import { StockUniverseItem } from "@/lib/stockUniverse";

const RESEARCH_MANIFEST_PATH = path.join(process.cwd(), "research_manifest.json");
const STOCK_UNIVERSE_PATH = path.join(process.cwd(), "stock_universe.json");
const SECTOR_BREADTH_SNAPSHOT_PATH = path.join(process.cwd(), "sector_breadth_snapshot.json");
const OPTIONS_STRUCTURE_SNAPSHOT_PATH = path.join(process.cwd(), "options_structure_snapshots.json");
const MINUTE_MICROSTRUCTURE_PATH = path.join(process.cwd(), "microstructure_minute_cache.json");
const HMM_REGIME_STATE_PATH = path.join(process.cwd(), "hmm_regime_state.json");

type NamedDoc<T> = {
  _id?: string;
  name: string;
  payload: T;
  updatedAt: string;
};

type ResearchManifestPayloadV2 = {
  storageVersion: 2;
  generatedAt: string;
  labelCount: number;
  chunkCount: number;
  manifest: Omit<ResearchManifest, "labels">;
};

type ResearchManifestChunkDoc = {
  _id?: string;
  name: string;
  generatedAt: string;
  chunkIndex: number;
  labels: ScreenOutcomeLabel[];
  updatedAt: string;
};

const RESEARCH_MANIFEST_DOC_NAME = "research_manifest";
const RESEARCH_MANIFEST_CHUNK_TARGET_BYTES = 4 * 1024 * 1024;

async function getNamedCollection<T extends object>() {
  return getMongoCollection<NamedDoc<T>>("app_cache");
}

async function getResearchManifestChunkCollection() {
  return getMongoCollection<ResearchManifestChunkDoc>("research_manifest_chunks");
}

async function readNamedDoc<T extends object>(name: string) {
  if (!isMongoConfigured()) return null;
  const collection = await getNamedCollection<T>();
  return collection.findOne({ name });
}

async function writeNamedDoc<T extends object>(name: string, payload: T) {
  if (!isMongoConfigured()) return;
  const collection = await getNamedCollection<T>();
  await collection.updateOne(
    { name },
    {
      $set: {
        name,
        payload,
        updatedAt: new Date().toISOString(),
      },
    },
    { upsert: true }
  );
}

function ensureFile(filePath: string, defaultValue: string) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, defaultValue, "utf8");
  }
}

function isResearchManifestPayloadV2(payload: unknown): payload is ResearchManifestPayloadV2 {
  if (!payload || typeof payload !== "object") return false;
  const candidate = payload as Partial<ResearchManifestPayloadV2>;
  return candidate.storageVersion === 2 && typeof candidate.generatedAt === "string" && typeof candidate.labelCount === "number";
}

function chunkResearchManifestLabels(labels: ScreenOutcomeLabel[]) {
  const chunks: ScreenOutcomeLabel[][] = [];
  let currentChunk: ScreenOutcomeLabel[] = [];
  let currentBytes = 2;

  for (const label of labels) {
    const labelBytes = Buffer.byteLength(JSON.stringify(label), "utf8");
    const nextBytes = currentBytes + labelBytes + (currentChunk.length > 0 ? 1 : 0);

    if (currentChunk.length > 0 && nextBytes > RESEARCH_MANIFEST_CHUNK_TARGET_BYTES) {
      chunks.push(currentChunk);
      currentChunk = [label];
      currentBytes = 2 + labelBytes;
      continue;
    }

    currentChunk.push(label);
    currentBytes = nextBytes;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

export async function hydrateStockUniverseFromMongoIfNeeded() {
  if (fs.existsSync(STOCK_UNIVERSE_PATH) || !isMongoConfigured()) return;
  const doc = await readNamedDoc<StockUniverseItem[]>("stock_universe");
  if (doc?.payload) {
    fs.writeFileSync(STOCK_UNIVERSE_PATH, JSON.stringify(doc.payload, null, 2), "utf8");
  }
}

export async function persistStockUniverseToMongo(items: StockUniverseItem[]) {
  await writeNamedDoc("stock_universe", items);
}

export async function seedStockUniverseMongoFromFileIfNeeded() {
  if (!isMongoConfigured()) return;
  const existing = await readNamedDoc<StockUniverseItem[]>("stock_universe");
  if (existing) return;
  ensureFile(STOCK_UNIVERSE_PATH, "[]");
  const parsed = JSON.parse(fs.readFileSync(STOCK_UNIVERSE_PATH, "utf8")) as StockUniverseItem[];
  await persistStockUniverseToMongo(parsed);
}

export async function persistResearchManifestToMongo(manifest: ResearchManifest) {
  if (!isMongoConfigured()) return;

  const now = new Date().toISOString();
  const namedCollection = await getNamedCollection<ResearchManifest | ResearchManifestPayloadV2>();
  const chunkCollection = await getResearchManifestChunkCollection();
  const { labels, ...manifestSummary } = manifest;
  const labelChunks = chunkResearchManifestLabels(labels);

  await Promise.all(
    labelChunks.map((chunk, chunkIndex) =>
      chunkCollection.updateOne(
        {
          name: RESEARCH_MANIFEST_DOC_NAME,
          generatedAt: manifest.generatedAt,
          chunkIndex,
        },
        {
          $set: {
            name: RESEARCH_MANIFEST_DOC_NAME,
            generatedAt: manifest.generatedAt,
            chunkIndex,
            labels: chunk,
            updatedAt: now,
          },
        },
        { upsert: true }
      )
    )
  );

  await Promise.all([
    chunkCollection.deleteMany({
      name: RESEARCH_MANIFEST_DOC_NAME,
      generatedAt: manifest.generatedAt,
      chunkIndex: { $gte: labelChunks.length },
    }),
    chunkCollection.deleteMany({
      name: RESEARCH_MANIFEST_DOC_NAME,
      generatedAt: { $ne: manifest.generatedAt },
    }),
  ]);

  const payload: ResearchManifestPayloadV2 = {
    storageVersion: 2,
    generatedAt: manifest.generatedAt,
    labelCount: labels.length,
    chunkCount: labelChunks.length,
    manifest: manifestSummary,
  };

  await namedCollection.updateOne(
    { name: RESEARCH_MANIFEST_DOC_NAME },
    {
      $set: {
        name: RESEARCH_MANIFEST_DOC_NAME,
        payload,
        updatedAt: now,
      },
    },
    { upsert: true }
  );
}

export async function hydrateResearchManifestFromMongoIfNeeded(interval: HistoricalInterval) {
  void interval;
  if (fs.existsSync(RESEARCH_MANIFEST_PATH) || !isMongoConfigured()) return;
  const doc = await readNamedDoc<ResearchManifest | ResearchManifestPayloadV2>(RESEARCH_MANIFEST_DOC_NAME);
  if (!doc?.payload) return;

  if (!isResearchManifestPayloadV2(doc.payload)) {
    fs.writeFileSync(RESEARCH_MANIFEST_PATH, JSON.stringify(doc.payload, null, 2), "utf8");
    return;
  }

  const chunkCollection = await getResearchManifestChunkCollection();
  const chunkDocs = await chunkCollection
    .find({
      name: RESEARCH_MANIFEST_DOC_NAME,
      generatedAt: doc.payload.generatedAt,
    })
    .sort({ chunkIndex: 1 })
    .toArray();
  const labels = chunkDocs.flatMap((chunk) => chunk.labels || []);

  if (labels.length < doc.payload.labelCount) {
    throw new Error(
      `Research manifest hydration is incomplete: expected ${doc.payload.labelCount} labels but found ${labels.length}.`
    );
  }

  const manifest: ResearchManifest = {
    ...doc.payload.manifest,
    labels,
  };

  fs.writeFileSync(RESEARCH_MANIFEST_PATH, JSON.stringify(manifest, null, 2), "utf8");
}

export async function persistSectorBreadthSnapshotToMongo(snapshot: unknown) {
  await writeNamedDoc("sector_breadth_snapshot", snapshot as object);
}

export async function hydrateSectorBreadthSnapshotFromMongoIfNeeded() {
  if (fs.existsSync(SECTOR_BREADTH_SNAPSHOT_PATH) || !isMongoConfigured()) return;
  const doc = await readNamedDoc<unknown[]>("sector_breadth_snapshot");
  if (doc?.payload) {
    fs.writeFileSync(SECTOR_BREADTH_SNAPSHOT_PATH, JSON.stringify(doc.payload, null, 2), "utf8");
  }
}

export async function seedSectorBreadthMongoFromFileIfNeeded() {
  if (!isMongoConfigured()) return;
  const existing = await readNamedDoc<unknown[]>("sector_breadth_snapshot");
  if (existing) return;
  ensureFile(SECTOR_BREADTH_SNAPSHOT_PATH, "[]");
  const parsed = JSON.parse(fs.readFileSync(SECTOR_BREADTH_SNAPSHOT_PATH, "utf8")) as unknown[];
  await persistSectorBreadthSnapshotToMongo(parsed);
}

export async function persistOptionStructureSnapshotsToMongo(snapshotStore: unknown) {
  await writeNamedDoc("options_structure_snapshots", snapshotStore as object);
}

export async function hydrateOptionStructureSnapshotsFromMongoIfNeeded() {
  if (fs.existsSync(OPTIONS_STRUCTURE_SNAPSHOT_PATH) || !isMongoConfigured()) return;
  const doc = await readNamedDoc<Record<string, unknown>>("options_structure_snapshots");
  if (doc?.payload) {
    fs.writeFileSync(OPTIONS_STRUCTURE_SNAPSHOT_PATH, JSON.stringify(doc.payload, null, 2), "utf8");
  }
}

export async function seedOptionStructureMongoFromFileIfNeeded() {
  if (!isMongoConfigured()) return;
  const existing = await readNamedDoc<Record<string, unknown>>("options_structure_snapshots");
  if (existing) return;
  ensureFile(OPTIONS_STRUCTURE_SNAPSHOT_PATH, "{}");
  const parsed = JSON.parse(fs.readFileSync(OPTIONS_STRUCTURE_SNAPSHOT_PATH, "utf8")) as Record<string, unknown>;
  await persistOptionStructureSnapshotsToMongo(parsed);
}

export async function persistMinuteMicrostructureToMongo(snapshotStore: unknown) {
  await writeNamedDoc("minute_microstructure_cache", snapshotStore as object);
}

export async function hydrateMinuteMicrostructureFromMongoIfNeeded() {
  if (fs.existsSync(MINUTE_MICROSTRUCTURE_PATH) || !isMongoConfigured()) return;
  const doc = await readNamedDoc<Record<string, unknown>>("minute_microstructure_cache");
  if (doc?.payload) {
    fs.writeFileSync(MINUTE_MICROSTRUCTURE_PATH, JSON.stringify(doc.payload), "utf8");
  }
}

export async function seedMinuteMicrostructureMongoFromFileIfNeeded() {
  if (!isMongoConfigured()) return;
  const existing = await readNamedDoc<Record<string, unknown>>("minute_microstructure_cache");
  if (existing) return;
  ensureFile(MINUTE_MICROSTRUCTURE_PATH, "{}");
  const parsed = JSON.parse(fs.readFileSync(MINUTE_MICROSTRUCTURE_PATH, "utf8")) as Record<string, unknown>;
  await persistMinuteMicrostructureToMongo(parsed);
}

export async function persistHmmRegimeStateToMongo(state: unknown) {
  await writeNamedDoc("hmm_regime_state", state as object);
}

export async function hydrateHmmRegimeStateFromMongoIfNeeded() {
  if (fs.existsSync(HMM_REGIME_STATE_PATH) || !isMongoConfigured()) return;
  const doc = await readNamedDoc<Record<string, unknown>>("hmm_regime_state");
  if (doc?.payload) {
    fs.writeFileSync(HMM_REGIME_STATE_PATH, JSON.stringify(doc.payload), "utf8");
  }
}

export async function seedHmmRegimeMongoFromFileIfNeeded() {
  if (!isMongoConfigured()) return;
  const existing = await readNamedDoc<Record<string, unknown>>("hmm_regime_state");
  if (existing) return;
  ensureFile(HMM_REGIME_STATE_PATH, "{}");
  const parsed = JSON.parse(fs.readFileSync(HMM_REGIME_STATE_PATH, "utf8")) as Record<string, unknown>;
  await persistHmmRegimeStateToMongo(parsed);
}

export async function persistHistoricalDatasetToMongo(dataset: HistoricalDatasetFile) {
  if (!isMongoConfigured()) return;
  const collection = await getMongoCollection<HistoricalDatasetFile & { updatedAt: string }>("historical_datasets");
  await collection.updateOne(
    { interval: dataset.interval, symbol: dataset.symbol },
    {
      $set: {
        ...dataset,
        updatedAt: new Date().toISOString(),
      },
    },
    { upsert: true }
  );
}

export async function persistHistoricalManifestToMongo(manifest: HistoricalManifest) {
  if (!isMongoConfigured()) return;
  const collection = await getMongoCollection<HistoricalManifest & { updatedAt: string }>("historical_manifests");
  await collection.updateOne(
    { interval: manifest.interval },
    {
      $set: {
        ...manifest,
        updatedAt: new Date().toISOString(),
      },
    },
    { upsert: true }
  );
}

export async function hydrateHistoricalDatasetFromMongo(interval: HistoricalInterval, symbol: string) {
  if (!isMongoConfigured()) return null;
  const collection = await getMongoCollection<HistoricalDatasetFile & { updatedAt: string }>("historical_datasets");
  const doc = await collection.findOne({ interval, symbol });
  if (!doc) return null;
  const { updatedAt, _id, ...dataset } = doc;
  void updatedAt;
  void _id;
  return dataset as HistoricalDatasetFile;
}

export async function hydrateHistoricalManifestFromMongo(interval: HistoricalInterval) {
  if (!isMongoConfigured()) return null;
  const collection = await getMongoCollection<HistoricalManifest & { updatedAt: string }>("historical_manifests");
  const doc = await collection.findOne({ interval });
  if (!doc) return null;
  const { updatedAt, _id, ...manifest } = doc;
  void updatedAt;
  void _id;
  return manifest as HistoricalManifest;
}
