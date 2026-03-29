import fs from 'fs';
import path from 'path';
import { getMongoCollection, isMongoConfigured } from '@/lib/mongo';

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

const getPositionsFromFile = (): TrackedPosition[] => {
    initDB();
    try {
        const data = fs.readFileSync(DB_PATH, 'utf8');
        return JSON.parse(data) as TrackedPosition[];
    } catch {
        return [];
    }
};

const savePositionsToFile = (positions: TrackedPosition[]) => {
    fs.writeFileSync(DB_PATH, JSON.stringify(positions, null, 2), 'utf8');
};

async function getPositionCollection() {
    return getMongoCollection<TrackedPosition>('tracked_positions');
}

async function seedPositionsFromFileIfNeeded() {
    if (!isMongoConfigured()) return;

    const collection = await getPositionCollection();
    const existingCount = await collection.countDocuments();
    if (existingCount > 0) return;

    const filePositions = getPositionsFromFile();
    if (filePositions.length > 0) {
        await Promise.all(
            filePositions.map(async (position) => {
                const { _id: _legacyMongoId, ...safePosition } = position as TrackedPosition & { _id?: unknown };
                await collection.updateOne(
                    { id: position.id },
                    { $setOnInsert: safePosition },
                    { upsert: true }
                );
            })
        );
    }
}

export const getPositions = async (): Promise<TrackedPosition[]> => {
    if (!isMongoConfigured()) {
        return getPositionsFromFile();
    }

    await seedPositionsFromFileIfNeeded();
    const collection = await getPositionCollection();
    return collection.find({}).sort({ executedAt: -1 }).toArray();
};

export const savePositions = async (positions: TrackedPosition[]) => {
    if (!isMongoConfigured()) {
        savePositionsToFile(positions);
        return;
    }

    const collection = await getPositionCollection();
    await collection.deleteMany({});
    if (positions.length > 0) {
        await Promise.all(
            positions.map(async (position) => {
                const { _id: _legacyMongoId, ...safePosition } = position as TrackedPosition & { _id?: unknown };
                await collection.updateOne(
                    { id: position.id },
                    { $set: safePosition },
                    { upsert: true }
                );
            })
        );
    }
};

export const addPosition = async (position: TrackedPosition) => {
    const positions = await getPositions();
    positions.push(position);
    await savePositions(positions);
};

export const updatePositionStatus = async (id: string, status: TrackedPosition['status']) => {
    const positions = await getPositions();
    const pos = positions.find(p => p.id === id);
    if (pos) {
        pos.status = status;
        await savePositions(positions);
    }
};
