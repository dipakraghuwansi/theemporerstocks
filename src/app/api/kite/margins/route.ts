import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getKiteInstance } from '@/lib/kiteHelper';

export async function GET() {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get('kite_access_token')?.value;

    if (!accessToken) {
        return NextResponse.json({ error: 'Not authenticated with Kite' }, { status: 401 });
    }

    try {
        const kite: any = getKiteInstance(accessToken);
        const margins = await kite.getMargins();

        // For equity/options trading on NSE/NFO, we usually look at the 'equity' segment margins.
        const equityMargins = margins.equity;

        return NextResponse.json({
            data: {
                available: equityMargins.available.live_balance,
                utilized: equityMargins.utilised.debits,
                cash: equityMargins.available.cash
            }
        });
    } catch (error: any) {
        console.error("Kite Margins API Error:", error);
        return NextResponse.json({ error: error.message || 'Failed to fetch margins' }, { status: 500 });
    }
}
