import { MongoClient, Db, Collection, Document } from "mongodb";

const MONGO_URL = process.env.MONGO_URL || "";
const DB_NAME = process.env.MONGO_DB_NAME || "theemporerstocks";

let clientPromise: Promise<MongoClient> | null = null;

export function isMongoConfigured() {
  return Boolean(MONGO_URL);
}

export function requireMongoConfigured(message = "MONGO_URL is not configured.") {
  if (!MONGO_URL) {
    throw new Error(message);
  }
}

function getErrorMessages(error: unknown) {
  const messages: string[] = [];
  const visited = new Set<unknown>();
  let current: unknown = error;

  while (current && !visited.has(current)) {
    visited.add(current);
    if (current instanceof Error) {
      messages.push(current.message || "");
      current = "cause" in current ? current.cause : null;
      continue;
    }

    current = null;
  }

  return messages
    .join(" | ")
    .toLowerCase();
}

export function isMongoConnectivityError(error: unknown) {
  if (!(error instanceof Error)) return false;

  const names = new Set<string>();
  const visited = new Set<unknown>();
  let current: unknown = error;

  while (current && !visited.has(current)) {
    visited.add(current);
    if (current instanceof Error) {
      names.add(current.name);
      current = "cause" in current ? current.cause : null;
      continue;
    }

    current = null;
  }

  const message = getErrorMessages(error);

  return (
    names.has("MongoServerSelectionError") ||
    names.has("MongoNetworkError") ||
    names.has("MongoNetworkTimeoutError") ||
    names.has("MongoTopologyClosedError") ||
    message.includes("secureconnect") ||
    message.includes("connecttimeoutms") ||
    message.includes("server selection") ||
    message.includes("topology is closed") ||
    message.includes("timed out") ||
    message.includes("econnrefused") ||
    message.includes("enetunreach") ||
    message.includes("ehostunreach") ||
    message.includes("enotfound") ||
    message.includes("network") ||
    message.includes("tls") ||
    message.includes("ssl")
  );
}

async function getClient() {
  requireMongoConfigured();

  if (!clientPromise) {
    const client = new MongoClient(MONGO_URL);
    clientPromise = client.connect().catch(async (error) => {
      clientPromise = null;
      await client.close().catch(() => undefined);
      throw error;
    });
  }

  return clientPromise;
}

export async function getMongoDb(): Promise<Db> {
  const client = await getClient();
  return client.db(DB_NAME);
}

export async function getMongoCollection<T extends Document>(name: string): Promise<Collection<T>> {
  const db = await getMongoDb();
  return db.collection<T>(name);
}
