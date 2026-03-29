import {
  ModelPortfolioDefinition,
  ModelPortfolioExecution,
  ModelPortfolioPerformanceSummary,
  ModelPortfolioPosition,
  ModelPortfolioRebalance,
  ModelPortfolioSnapshot,
  ModelPortfolioTrade,
} from '@/lib/modelPortfolio/types';
import { getMongoCollection, requireMongoConfigured } from '@/lib/mongo';

type MongoRow<T> = T & { _id?: unknown };

function requireModelPortfolioMongo() {
  requireMongoConfigured(
    'Model portfolio persistence requires MongoDB. Set MONGO_URL before using the model portfolio.'
  );
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

async function getPortfolioCollection() {
  requireModelPortfolioMongo();
  return getMongoCollection<ModelPortfolioDefinition>('model_portfolios');
}

async function getPositionCollection() {
  requireModelPortfolioMongo();
  return getMongoCollection<ModelPortfolioPosition>('model_portfolio_positions');
}

async function getRebalanceCollection() {
  requireModelPortfolioMongo();
  return getMongoCollection<ModelPortfolioRebalance>('model_portfolio_rebalances');
}

async function getSnapshotCollection() {
  requireModelPortfolioMongo();
  return getMongoCollection<ModelPortfolioSnapshot>('model_portfolio_snapshots');
}

async function getTradeCollection() {
  requireModelPortfolioMongo();
  return getMongoCollection<ModelPortfolioTrade>('model_portfolio_trades');
}

async function getPerformanceCollection() {
  requireModelPortfolioMongo();
  return getMongoCollection<ModelPortfolioPerformanceSummary>('model_portfolio_performance');
}

async function getExecutionCollection() {
  requireModelPortfolioMongo();
  return getMongoCollection<ModelPortfolioExecution>('model_portfolio_executions');
}

export async function getModelPortfolioDefinition(id: string) {
  const collection = await getPortfolioCollection();
  return stripMongoId<ModelPortfolioDefinition>(await collection.findOne({ id }));
}

export async function saveModelPortfolioDefinition(portfolio: ModelPortfolioDefinition) {
  const collection = await getPortfolioCollection();
  await collection.updateOne({ id: portfolio.id }, { $set: { ...portfolio } }, { upsert: true });
}

export async function getModelPortfolioPositions(portfolioId: string, from?: string) {
  const collection = await getPositionCollection();
  return stripMongoIds<ModelPortfolioPosition>(
    await collection
      .find({
        portfolioId,
        status: 'OPEN',
        ...(from ? { enteredAt: { $gte: from } } : {}),
      })
      .sort({ targetWeight: -1 })
      .toArray()
  );
}

export async function replaceModelPortfolioPositions(portfolioId: string, positions: ModelPortfolioPosition[]) {
  const collection = await getPositionCollection();
  await collection.deleteMany({ portfolioId });
  if (positions.length === 0) return;

  await collection.insertMany(positions.map((position) => ({ ...position })));
}

export async function getModelPortfolioRebalances(portfolioId: string, limit = 10, from?: string) {
  const collection = await getRebalanceCollection();
  return stripMongoIds<ModelPortfolioRebalance>(
    await collection
      .find({
        portfolioId,
        ...(from ? { generatedAt: { $gte: from } } : {}),
      })
      .sort({ generatedAt: -1 })
      .limit(limit)
      .toArray()
  );
}

export async function appendModelPortfolioRebalance(rebalance: ModelPortfolioRebalance, maxItems = 20) {
  const collection = await getRebalanceCollection();
  await collection.insertOne({ ...rebalance });

  const stale = await collection
    .find({ portfolioId: rebalance.portfolioId })
    .sort({ generatedAt: -1 })
    .skip(maxItems)
    .toArray();
  if (stale.length > 0) {
    await collection.deleteMany({ id: { $in: stale.map((row) => row.id) } });
  }
}

export async function getModelPortfolioSnapshots(portfolioId: string, limit = 60, from?: string) {
  const collection = await getSnapshotCollection();
  return stripMongoIds<ModelPortfolioSnapshot>(
    await collection
      .find({
        portfolioId,
        ...(from ? { asOf: { $gte: from } } : {}),
      })
      .sort({ asOf: 1 })
      .limit(limit)
      .toArray()
  );
}

export async function appendModelPortfolioSnapshot(snapshot: ModelPortfolioSnapshot, maxItems = 60) {
  const collection = await getSnapshotCollection();
  await collection.insertOne({ ...snapshot });

  const stale = await collection
    .find({ portfolioId: snapshot.portfolioId })
    .sort({ asOf: -1 })
    .skip(maxItems)
    .toArray();
  if (stale.length > 0) {
    await collection.deleteMany({ id: { $in: stale.map((row) => row.id) } });
  }
}

export async function getModelPortfolioTrades(portfolioId: string, limit = 20, from?: string) {
  const collection = await getTradeCollection();
  return stripMongoIds<ModelPortfolioTrade>(
    await collection
      .find({
        portfolioId,
        ...(from ? { executedAt: { $gte: from } } : {}),
      })
      .sort({ executedAt: -1 })
      .limit(limit)
      .toArray()
  );
}

export async function appendModelPortfolioTrades(trades: ModelPortfolioTrade[], maxItems = 200) {
  if (trades.length === 0) return;

  const collection = await getTradeCollection();
  await collection.insertMany(trades.map((trade) => ({ ...trade })));

  const portfolioId = trades[0]?.portfolioId;
  if (!portfolioId) return;

  const stale = await collection
    .find({ portfolioId })
    .sort({ executedAt: -1 })
    .skip(maxItems)
    .toArray();
  if (stale.length > 0) {
    await collection.deleteMany({ id: { $in: stale.map((row) => row.id) } });
  }
}

export async function getModelPortfolioPerformance(portfolioId: string) {
  const collection = await getPerformanceCollection();
  return stripMongoId<ModelPortfolioPerformanceSummary>(await collection.findOne({ portfolioId }));
}

export async function saveModelPortfolioPerformance(summary: ModelPortfolioPerformanceSummary) {
  const collection = await getPerformanceCollection();
  await collection.updateOne({ portfolioId: summary.portfolioId }, { $set: { ...summary } }, { upsert: true });
}

export async function getModelPortfolioExecutions(portfolioId: string, limit = 20, from?: string) {
  const collection = await getExecutionCollection();
  return stripMongoIds<ModelPortfolioExecution>(
    await collection
      .find({
        portfolioId,
        ...(from ? { approvedAt: { $gte: from } } : {}),
      })
      .sort({ approvedAt: -1 })
      .limit(limit)
      .toArray()
  );
}

export async function appendModelPortfolioExecution(execution: ModelPortfolioExecution, maxItems = 30) {
  const collection = await getExecutionCollection();
  await collection.insertOne({ ...execution });

  const stale = await collection
    .find({ portfolioId: execution.portfolioId })
    .sort({ approvedAt: -1 })
    .skip(maxItems)
    .toArray();
  if (stale.length > 0) {
    await collection.deleteMany({ id: { $in: stale.map((row) => row.id) } });
  }
}
