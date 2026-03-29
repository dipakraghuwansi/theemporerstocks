import fs from "fs";
import path from "path";

import { StockScreenType, StockUniverseCategory, SCREEN_LABELS } from "@/lib/stockUniverse";
import { getMongoCollection, isMongoConfigured } from "@/lib/mongo";

const JOURNAL_DB_PATH = path.join(process.cwd(), "journal_trades.json");

export type JournalTradeStatus = "OPEN" | "CLOSED_SL" | "CLOSED_TP" | "CLOSED_MANUAL" | "ERROR";

export interface JournalTrade {
  id: string;
  source: "SCREENER";
  symbol: string;
  instrument: string;
  sector: string;
  category: StockUniverseCategory;
  screen: StockScreenType;
  screenLabel: string;
  direction: "BUY" | "SELL";
  quantity: number;
  score: number;
  confidenceLabel: "High" | "Medium" | "Watchlist" | "Low";
  entryPrice: number;
  stopLoss: number;
  targetPrice: number;
  currentPrice: number;
  exitPrice?: number;
  pnlPoints: number;
  pnlPct: number;
  status: JournalTradeStatus;
  thesis: string;
  openedAt: string;
  closedAt?: string;
  closeReason?: string;
}

export interface JournalTradeInput {
  symbol: string;
  instrument: string;
  sector: string;
  category: StockUniverseCategory;
  screen: StockScreenType;
  direction: "BUY" | "SELL";
  quantity: number;
  score: number;
  confidenceLabel: "High" | "Medium" | "Watchlist" | "Low";
  entryPrice: number;
  stopLoss: number;
  targetPrice: number;
  thesis: string;
}

function initDB() {
  if (!fs.existsSync(JOURNAL_DB_PATH)) {
    fs.writeFileSync(JOURNAL_DB_PATH, JSON.stringify([], null, 2), "utf8");
  }
}

function getJournalTradesFromFile(): JournalTrade[] {
  initDB();
  try {
    return JSON.parse(fs.readFileSync(JOURNAL_DB_PATH, "utf8")) as JournalTrade[];
  } catch {
    return [];
  }
}

function saveJournalTradesToFile(trades: JournalTrade[]) {
  fs.writeFileSync(JOURNAL_DB_PATH, JSON.stringify(trades, null, 2), "utf8");
}

async function getJournalCollection() {
  return getMongoCollection<JournalTrade>("journal_trades");
}

async function seedJournalFromFileIfNeeded() {
  if (!isMongoConfigured()) return;

  const collection = await getJournalCollection();
  const existingCount = await collection.countDocuments();
  if (existingCount > 0) return;

  const fileTrades = getJournalTradesFromFile();
  if (fileTrades.length > 0) {
    await Promise.all(
      fileTrades.map(async (trade) => {
        const { _id: _legacyMongoId, ...safeTrade } = trade as JournalTrade & { _id?: unknown };
        await collection.updateOne(
          { id: trade.id },
          { $setOnInsert: safeTrade },
          { upsert: true }
        );
      })
    );
  }
}

export async function getJournalTrades(): Promise<JournalTrade[]> {
  if (!isMongoConfigured()) {
    return getJournalTradesFromFile();
  }

  await seedJournalFromFileIfNeeded();
  const collection = await getJournalCollection();
  return collection.find({}).sort({ openedAt: -1 }).toArray();
}

export async function saveJournalTrades(trades: JournalTrade[]) {
  if (!isMongoConfigured()) {
    saveJournalTradesToFile(trades);
    return;
  }

  const collection = await getJournalCollection();
  await collection.deleteMany({});
  if (trades.length > 0) {
    await Promise.all(
      trades.map(async (trade) => {
        const { _id: _legacyMongoId, ...safeTrade } = trade as JournalTrade & { _id?: unknown };
        await collection.updateOne(
          { id: trade.id },
          { $set: safeTrade },
          { upsert: true }
        );
      })
    );
  }
}

export async function addJournalTrade(input: JournalTradeInput) {
  const trades = await getJournalTrades();
  const existingOpenTrade = trades.find(
    (trade) => trade.symbol === input.symbol && trade.screen === input.screen && trade.status === "OPEN"
  );

  if (existingOpenTrade) {
    return { created: false as const, trade: existingOpenTrade };
  }

  const trade: JournalTrade = {
    id: `JRNL_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    source: "SCREENER",
    symbol: input.symbol,
    instrument: input.instrument,
    sector: input.sector,
    category: input.category,
    screen: input.screen,
    screenLabel: SCREEN_LABELS[input.screen],
    direction: input.direction,
    quantity: input.quantity,
    score: input.score,
    confidenceLabel: input.confidenceLabel,
    entryPrice: input.entryPrice,
    stopLoss: input.stopLoss,
    targetPrice: input.targetPrice,
    currentPrice: input.entryPrice,
    pnlPoints: 0,
    pnlPct: 0,
    status: "OPEN",
    thesis: input.thesis,
    openedAt: new Date().toISOString(),
  };

  trades.unshift(trade);
  await saveJournalTrades(trades);
  return { created: true as const, trade };
}

function computePnl(direction: JournalTrade["direction"], entryPrice: number, currentPrice: number, quantity: number) {
  const signedMove = direction === "BUY" ? currentPrice - entryPrice : entryPrice - currentPrice;
  return {
    pnlPoints: Number((signedMove * quantity).toFixed(2)),
    pnlPct: entryPrice > 0 ? Number(((signedMove / entryPrice) * 100).toFixed(2)) : 0,
  };
}

export async function syncJournalTrades(priceMap: Record<string, number>) {
  const trades = await getJournalTrades();

  const updatedTrades: JournalTrade[] = trades.map((trade) => {
    const latestPrice = priceMap[trade.instrument];
    if (latestPrice === undefined) {
      return trade;
    }

    const nextTrade: JournalTrade = {
      ...trade,
      currentPrice: latestPrice,
      ...computePnl(trade.direction, trade.entryPrice, latestPrice, trade.quantity),
    };

    if (trade.status !== "OPEN") {
      return nextTrade;
    }

    if (trade.direction === "BUY") {
      if (latestPrice <= trade.stopLoss) {
        const exitPrice = trade.stopLoss;
        return {
          ...nextTrade,
          currentPrice: exitPrice,
          exitPrice,
          status: "CLOSED_SL" as const,
          closedAt: new Date().toISOString(),
          closeReason: "Trade closed: SL hit",
          ...computePnl(trade.direction, trade.entryPrice, exitPrice, trade.quantity),
        };
      }

      if (latestPrice >= trade.targetPrice) {
        const exitPrice = trade.targetPrice;
        return {
          ...nextTrade,
          currentPrice: exitPrice,
          exitPrice,
          status: "CLOSED_TP" as const,
          closedAt: new Date().toISOString(),
          closeReason: "Trade closed: Target hit",
          ...computePnl(trade.direction, trade.entryPrice, exitPrice, trade.quantity),
        };
      }
    }

    if (trade.direction === "SELL") {
      if (latestPrice >= trade.stopLoss) {
        const exitPrice = trade.stopLoss;
        return {
          ...nextTrade,
          currentPrice: exitPrice,
          exitPrice,
          status: "CLOSED_SL" as const,
          closedAt: new Date().toISOString(),
          closeReason: "Trade closed: SL hit",
          ...computePnl(trade.direction, trade.entryPrice, exitPrice, trade.quantity),
        };
      }

      if (latestPrice <= trade.targetPrice) {
        const exitPrice = trade.targetPrice;
        return {
          ...nextTrade,
          currentPrice: exitPrice,
          exitPrice,
          status: "CLOSED_TP" as const,
          closedAt: new Date().toISOString(),
          closeReason: "Trade closed: Target hit",
          ...computePnl(trade.direction, trade.entryPrice, exitPrice, trade.quantity),
        };
      }
    }

    return nextTrade;
  });

  await saveJournalTrades(updatedTrades);
  return updatedTrades;
}

export async function closeJournalTrade(id: string) {
  const trades = await getJournalTrades();
  const updatedTrades = trades.map((trade) => {
    if (trade.id !== id || trade.status !== "OPEN") {
      return trade;
    }

    return {
      ...trade,
      status: "CLOSED_MANUAL" as const,
      exitPrice: trade.currentPrice,
      closedAt: new Date().toISOString(),
      closeReason: "Trade closed manually",
    };
  });

  await saveJournalTrades(updatedTrades);
  return updatedTrades;
}
