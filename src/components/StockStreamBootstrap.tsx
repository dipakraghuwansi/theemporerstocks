"use client";

import { useEffect } from 'react';
import {
  isStockStreamTokenSyncPending,
  STOCK_STREAM_TOKEN_SYNC_EVENT,
  syncStockStreamToken,
} from '@/lib/stockStreamTokenSync';

let bootstrapSyncStarted = false;

export default function StockStreamBootstrap() {
  useEffect(() => {
    const runTokenSync = async (force = false) => {
      try {
        await syncStockStreamToken({ force });
      } catch (error) {
        console.error('Failed to sync Kite token to stock websocket engine', error);
      }
    };

    const handleSyncRequest = (event: Event) => {
      const force = Boolean((event as CustomEvent<{ force?: boolean }>).detail?.force);
      void runTokenSync(force);
    };

    const handleWindowFocus = () => {
      if (isStockStreamTokenSyncPending()) {
        void runTokenSync();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isStockStreamTokenSyncPending()) {
        void runTokenSync();
      }
    };

    if (!bootstrapSyncStarted) {
      bootstrapSyncStarted = true;
      void runTokenSync();
    }

    window.addEventListener(STOCK_STREAM_TOKEN_SYNC_EVENT, handleSyncRequest as EventListener);
    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener(STOCK_STREAM_TOKEN_SYNC_EVENT, handleSyncRequest as EventListener);
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return null;
}
