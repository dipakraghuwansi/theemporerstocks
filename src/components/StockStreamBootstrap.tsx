"use client";

import { useEffect } from 'react';

export default function StockStreamBootstrap() {
  useEffect(() => {
    let cancelled = false;
    let lastSyncedToken = '';

    const syncToken = async () => {
      try {
        const tokenRes = await fetch('/api/kite/token', { cache: 'no-store' });
        const tokenData = await tokenRes.json();
        const token = tokenData?.token;

        if (!token || cancelled) return;
        if (token === lastSyncedToken) return;

        await fetch('http://localhost:8080/set-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        lastSyncedToken = token;
      } catch (error) {
        console.error('Failed to sync Kite token to stock websocket engine', error);
      }
    };

    syncToken();
    const interval = window.setInterval(syncToken, 5 * 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  return null;
}
