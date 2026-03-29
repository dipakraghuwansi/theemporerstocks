import { getMongoCollection, requireMongoConfigured } from '@/lib/mongo';

export interface PaperTrade {
  id: string;
  strategySource: 'QUANT' | 'BALANCED' | 'AGGRESSIVE' | 'SCALP';
  assetName: string;
  direction: 'BUY' | 'SELL';
  entryPrice: number;
  currentPrice: number;
  qty: number;
  status: 'OPEN' | 'CLOSED';
  openedAt: string;
  closedAt?: string;
  pl: number;
}

function requirePaperMongo() {
  requireMongoConfigured('Paper-trade persistence requires MongoDB. Set MONGO_URL before using paper trading.');
}

async function getPaperTradeCollection() {
  requirePaperMongo();
  return getMongoCollection<PaperTrade>('paper_trades');
}

export async function getPaperTrades(): Promise<PaperTrade[]> {
  const collection = await getPaperTradeCollection();
  return collection.find({}).sort({ openedAt: -1 }).toArray();
}

export async function addPaperTrade(
  trade: Omit<PaperTrade, 'id' | 'currentPrice' | 'pl' | 'status' | 'openedAt'>
): Promise<PaperTrade> {
  const collection = await getPaperTradeCollection();
  const newTrade: PaperTrade = {
    ...trade,
    id: `PAPER_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    currentPrice: trade.entryPrice,
    pl: 0,
    status: 'OPEN',
    openedAt: new Date().toISOString(),
  };

  await collection.insertOne({ ...newTrade });
  return newTrade;
}

export async function updatePaperTradePrices(priceUpdates: Record<string, number>) {
  const assetNames = Object.keys(priceUpdates);
  if (assetNames.length === 0) return;

  const collection = await getPaperTradeCollection();
  const openTrades = await collection.find({ status: 'OPEN', assetName: { $in: assetNames } }).toArray();
  if (openTrades.length === 0) return;

  await collection.bulkWrite(
    openTrades.map((trade) => {
      const latestLtp = priceUpdates[trade.assetName] ?? trade.currentPrice;
      const priceDiff = trade.direction === 'BUY' ? latestLtp - trade.entryPrice : trade.entryPrice - latestLtp;
      const pl = Number((priceDiff * trade.qty).toFixed(2));

      return {
        updateOne: {
          filter: { id: trade.id },
          update: {
            $set: {
              currentPrice: latestLtp,
              pl,
            },
          },
        },
      };
    })
  );
}

export async function closePaperTrade(id: string, exitPrice: number) {
  const collection = await getPaperTradeCollection();
  const trade = await collection.findOne({ id, status: 'OPEN' });
  if (!trade) return null;

  const priceDiff = trade.direction === 'BUY' ? exitPrice - trade.entryPrice : trade.entryPrice - exitPrice;
  const closedTrade: PaperTrade = {
    ...trade,
    status: 'CLOSED',
    currentPrice: exitPrice,
    pl: Number((priceDiff * trade.qty).toFixed(2)),
    closedAt: new Date().toISOString(),
  };

  await collection.updateOne(
    { id },
    {
      $set: {
        status: closedTrade.status,
        currentPrice: closedTrade.currentPrice,
        pl: closedTrade.pl,
        closedAt: closedTrade.closedAt,
      },
    }
  );

  return closedTrade;
}

export async function clearPaperStore() {
  const collection = await getPaperTradeCollection();
  await collection.deleteMany({});
}
