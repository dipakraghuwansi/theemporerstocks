import { NextRequest, NextResponse } from 'next/server';
import { getPositions, updatePositionStatus } from '@/lib/positionStore';
import { getKiteInstance } from '@/lib/kiteHelper';

export async function GET(request: NextRequest) {
    try {
        const sync = request.nextUrl.searchParams.get('sync');
        let positions = await getPositions();

        if (sync === 'true') {
            const token = request.cookies.get('kite_access_token')?.value;
            if (token) {
                const kite = getKiteInstance(token);
                try {
                    const kitePositions = await (kite as any).getPositions();
                    const netPositions = kitePositions.net || [];

                    // Map tradingsymbol -> native quantity
                    const kiteQtyMap: Record<string, number> = {};
                    netPositions.forEach((p: any) => {
                        kiteQtyMap[p.tradingsymbol] = p.quantity;
                    });

                    // Verify our tracked virtual positions against reality
                    let changed = false;
                    for (const p of positions) {
                        if (p.status === 'OPEN') {
                            const symbol = p.assetName.split(':')[1] || p.assetName;
                            // Natively squared off (or missing meaning cleared)
                            if (kiteQtyMap[symbol] === 0 || kiteQtyMap[symbol] === undefined) {
                                // Double check if it was missing because we never actually placed it?
                                // If undefined, it means no position exists for it in Kite today. SQUARED_OFF.
                                await updatePositionStatus(p.id, 'CLOSED_MANUAL');
                                changed = true;
                            }
                        }
                    }

                    if (changed) {
                        positions = await getPositions(); // Refresh virtual store
                    }
                } catch (e: any) {
                    console.error("Native Kite position sync failed:", e.message);
                }
            }
        }

        return NextResponse.json({ data: positions });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function PATCH(request: Request) {
    try {
        const { id, status } = await request.json();

        if (!id || !status) {
            return NextResponse.json({ error: 'Missing id or status' }, { status: 400 });
        }

        await updatePositionStatus(id, status);

        return NextResponse.json({ success: true, message: `Position ${id} updated to ${status}` });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
