/**
 * Paper Trading State Store (In-Memory for MVP)
 */

export interface PaperTrade {
    id: string;
    strategySource: 'QUANT' | 'BALANCED' | 'AGGRESSIVE' | 'SCALP';
    assetName: string; // e.g. "NIFTY24OCT25600CE"
    direction: 'BUY' | 'SELL';
    entryPrice: number;
    currentPrice: number;
    qty: number;
    status: 'OPEN' | 'CLOSED';
    openedAt: string;
    closedAt?: string;
    pl: number;
}

let paperStore: PaperTrade[] = [];

export function getPaperTrades(): PaperTrade[] {
    return paperStore;
}

export function addPaperTrade(trade: Omit<PaperTrade, 'id' | 'currentPrice' | 'pl' | 'status' | 'openedAt'>): PaperTrade {
    const newTrade: PaperTrade = {
        ...trade,
        id: `PAPER_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        currentPrice: trade.entryPrice,
        pl: 0,
        status: 'OPEN',
        openedAt: new Date().toISOString()
    };

    // Prepend for newest first
    paperStore = [newTrade, ...paperStore];
    return newTrade;
}

export function updatePaperTradePrices(priceUpdates: Record<string, number>) {
    paperStore = paperStore.map(trade => {
        if (trade.status !== 'OPEN') return trade;

        const latestLTP = priceUpdates[trade.assetName];
        if (latestLTP !== undefined) {
            trade.currentPrice = latestLTP;

            // Re-calculate PnL visually
            const priceDiff = trade.direction === 'BUY'
                ? (latestLTP - trade.entryPrice)
                : (trade.entryPrice - latestLTP);

            trade.pl = priceDiff * trade.qty;
        }
        return trade;
    });
}

export function closePaperTrade(id: string, exitPrice: number) {
    paperStore = paperStore.map(trade => {
        if (trade.id === id && trade.status === 'OPEN') {
            const priceDiff = trade.direction === 'BUY'
                ? (exitPrice - trade.entryPrice)
                : (trade.entryPrice - exitPrice);

            return {
                ...trade,
                status: 'CLOSED',
                currentPrice: exitPrice,
                pl: priceDiff * trade.qty,
                closedAt: new Date().toISOString()
            };
        }
        return trade;
    });
}

// For dev reset
export function clearPaperStore() {
    paperStore = [];
}
