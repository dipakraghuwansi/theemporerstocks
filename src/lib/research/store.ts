import {
  ResearchBacktestRun,
  ResearchBacktestSymbolResult,
} from '@/lib/research/types';
import { getMongoCollection, requireMongoConfigured } from '@/lib/mongo';

type MongoRow<T> = T & { _id?: unknown };

function requireResearchMongo() {
  requireMongoConfigured('Research backtest mode requires MongoDB. Set MONGO_URL before using this feature.');
}

function stripMongoId<T>(row: MongoRow<T> | null) {
  if (!row) return null;
  const safeRow = { ...row };
  delete safeRow._id;
  return safeRow as T;
}

function stripMongoIds<T>(rows: MongoRow<T>[]) {
  return rows.map((row) => stripMongoId(row)).filter((row): row is T => Boolean(row));
}

async function getRunCollection() {
  requireResearchMongo();
  return getMongoCollection<ResearchBacktestRun>('research_backtest_runs');
}

async function getSymbolResultCollection() {
  requireResearchMongo();
  return getMongoCollection<ResearchBacktestSymbolResult>('research_backtest_symbol_results');
}

export async function getResearchBacktestRun(id: string) {
  const collection = await getRunCollection();
  return stripMongoId<ResearchBacktestRun>(await collection.findOne({ id }));
}

export async function saveResearchBacktestRun(run: ResearchBacktestRun) {
  const collection = await getRunCollection();
  await collection.updateOne({ id: run.id }, { $set: { ...run } }, { upsert: true });
}

export async function clearResearchBacktestRun(runId: string) {
  const [runCollection, symbolCollection] = await Promise.all([
    getRunCollection(),
    getSymbolResultCollection(),
  ]);

  await Promise.all([
    runCollection.deleteOne({ id: runId }),
    symbolCollection.deleteMany({ runId }),
  ]);
}

export async function saveResearchBacktestSymbolResult(result: ResearchBacktestSymbolResult) {
  const collection = await getSymbolResultCollection();
  await collection.updateOne(
    { runId: result.runId, symbol: result.symbol },
    { $set: { ...result } },
    { upsert: true }
  );
}

export async function listResearchBacktestSymbolResults(runId: string, limit?: number) {
  const collection = await getSymbolResultCollection();
  const cursor = collection
    .find({ runId })
    .sort({ processedAt: -1 });

  if (limit) {
    cursor.limit(limit);
  }

  return stripMongoIds<ResearchBacktestSymbolResult>(await cursor.toArray());
}
