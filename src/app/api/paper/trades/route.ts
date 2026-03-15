import { NextResponse } from 'next/server';
import { getPaperTrades } from '@/lib/paperStore';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const trades = getPaperTrades();
        return NextResponse.json({ trades });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
