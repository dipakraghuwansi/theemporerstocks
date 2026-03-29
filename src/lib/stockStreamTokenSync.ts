"use client";

export const STOCK_STREAM_TOKEN_SYNC_EVENT = "stock-stream:sync-token";

type SyncStockStreamTokenOptions = {
  force?: boolean;
};

let syncedToken = "";
let syncPending = true;
let inFlightSync: Promise<boolean> | null = null;

async function readKiteToken() {
  const response = await fetch("/api/kite/token", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to read Kite token.");
  }

  const data = (await response.json()) as { token?: string };
  return data.token || "";
}

async function postTokenToStream(token: string) {
  const response = await fetch("http://localhost:8080/set-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || "Failed to sync Kite token to stock stream engine.");
  }
}

export async function syncStockStreamToken(options: SyncStockStreamTokenOptions = {}) {
  if (inFlightSync) {
    return inFlightSync;
  }

  const force = Boolean(options.force);

  inFlightSync = (async () => {
    try {
      const token = await readKiteToken();
      if (!token) {
        syncedToken = "";
        syncPending = false;
        return false;
      }

      if (!force && token === syncedToken) {
        syncPending = false;
        return true;
      }

      await postTokenToStream(token);
      syncedToken = token;
      syncPending = false;
      return true;
    } catch (error) {
      syncPending = true;
      throw error;
    } finally {
      inFlightSync = null;
    }
  })();

  return inFlightSync;
}

export function isStockStreamTokenSyncPending() {
  return syncPending;
}

export function requestStockStreamTokenSync(force = false) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(STOCK_STREAM_TOKEN_SYNC_EVENT, {
      detail: { force },
    })
  );
}
