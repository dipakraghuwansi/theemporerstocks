"use client";

import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

export interface StockStreamQuote {
  instrumentToken: number;
  instrument: string;
  symbol: string;
  lastPrice: number;
  change: number | null;
  volume: number;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  bestBidPrice: number | null;
  bestBidQuantity: number | null;
  bestAskPrice: number | null;
  bestAskQuantity: number | null;
  microprice: number | null;
  micropriceEdgePct: number | null;
  orderFlowImbalance: number | null;
  rollingOfi: number | null;
  vpin: number | null;
  tradePressureScore: number | null;
  timestamp: string;
}

export interface StockStreamSnapshot {
  connected: boolean;
  universeSize: number;
  subscribed: number;
  lastSnapshotAt: string | null;
  lastTickAt?: string | null;
  lastUniverseSyncAt?: string | null;
  lastConnectAttemptAt?: string | null;
  lastError?: string | null;
  quotes: StockStreamQuote[];
}

const EMPTY_SNAPSHOT: StockStreamSnapshot = {
  connected: false,
  universeSize: 0,
  subscribed: 0,
  lastSnapshotAt: null,
  lastTickAt: null,
  quotes: [],
};

export function useStockStream() {
  const [snapshot, setSnapshot] = useState<StockStreamSnapshot>(EMPTY_SNAPSHOT);
  const [socketConnected, setSocketConnected] = useState(false);

  useEffect(() => {
    let mounted = true;
    let socket: Socket | null = null;

    const loadInitialSnapshot = async () => {
      try {
        const res = await fetch('http://localhost:8080/snapshot', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as StockStreamSnapshot;
        if (mounted) {
          setSnapshot(data);
        }
      } catch (error) {
        console.error('Failed to fetch initial stock stream snapshot', error);
      }
    };

    loadInitialSnapshot();

    try {
      socket = io('http://localhost:8080', {
        transports: ['websocket', 'polling'],
      });

      socket.on('connect', () => {
        if (!mounted) return;
        setSocketConnected(true);
      });

      socket.on('disconnect', () => {
        if (!mounted) return;
        setSocketConnected(false);
      });

      socket.on('stock-stream:update', (data: StockStreamSnapshot) => {
        if (!mounted) return;
        setSnapshot(data);
      });
    } catch (error) {
      console.error('Failed to connect to stock stream websocket', error);
    }

    return () => {
      mounted = false;
      if (socket) socket.disconnect();
    };
  }, []);

  return {
    snapshot,
    socketConnected,
  };
}
