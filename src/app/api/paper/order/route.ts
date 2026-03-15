import { NextRequest, NextResponse } from 'next/server';
import { addPaperTrade } from '@/lib/paperStore';

export async function POST(req: NextRequest) {
    try {
        const nowStr = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
        const nowArray = nowStr.split(', ');
        const timeArray = nowArray[1].split(':');

        let hours = parseInt(timeArray[0]);
        const mins = parseInt(timeArray[1]);
        const isPM = nowArray[1].includes('PM');

        if (isPM && hours !== 12) {
            hours += 12;
        } else if (!isPM && hours === 12) {
            hours = 0;
        }

        const currentInt = hours * 100 + mins;
        const dateObj = new Date(nowStr);
        const dayOfWeek = dateObj.getDay();

        // Block Weekends and Outside 8:00 AM - 4:00 PM IST
        if (dayOfWeek === 0 || dayOfWeek === 6 || currentInt < 800 || currentInt > 1600) {
            return NextResponse.json({
                status: 'skipped',
                message: 'Market is closed (Outside 8:00 AM - 4:00 PM IST or Weekend)'
            }, { status: 200 });
        }

        const body = await req.json();

        // Expected payload: { strategySource: 'QUANT', assetName: 'NFO:NIFTY...', direction: 'BUY', entryPrice: 150, qty: 25 }
        if (!body.strategySource || !body.assetName || !body.direction || !body.entryPrice || !body.qty) {
            return NextResponse.json({ error: 'Missing required paper trade fields' }, { status: 400 });
        }

        const newTrade = addPaperTrade({
            strategySource: body.strategySource,
            assetName: body.assetName,
            direction: body.direction,
            entryPrice: body.entryPrice,
            qty: body.qty
        });

        return NextResponse.json({ success: true, trade: newTrade });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
