import fs from 'fs';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'active_positions.json');

export interface TrackedPosition {
    id: string;
    assetName: string;
    position: 'BUY' | 'SELL';
    quantity: number;
    entryPrice: number;
    currentPrice?: number;
    stopLoss?: number;
    targetProfit?: number;
    executedAt: string;
    orderId: string;
    status: 'OPEN' | 'CLOSED_SL' | 'CLOSED_TP' | 'CLOSED_MANUAL' | 'ERROR';
}

// Ensure the file exists
const initDB = () => {
    if (!fs.existsSync(DB_PATH)) {
        fs.writeFileSync(DB_PATH, JSON.stringify([]), 'utf8');
    }
};

export const getPositions = (): TrackedPosition[] => {
    initDB();
    try {
        const data = fs.readFileSync(DB_PATH, 'utf8');
        return JSON.parse(data) as TrackedPosition[];
    } catch {
        return [];
    }
};

export const savePositions = (positions: TrackedPosition[]) => {
    fs.writeFileSync(DB_PATH, JSON.stringify(positions, null, 2), 'utf8');
};

export const addPosition = (position: TrackedPosition) => {
    const positions = getPositions();
    positions.push(position);
    savePositions(positions);
};

export const updatePositionStatus = (id: string, status: TrackedPosition['status']) => {
    const positions = getPositions();
    const pos = positions.find(p => p.id === id);
    if (pos) {
        pos.status = status;
        savePositions(positions);
    }
};
