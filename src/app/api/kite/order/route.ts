import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        return NextResponse.json({
            error: 'The options order flow has been archived during the stocks-only pivot.',
            nextStep: 'Implement a stock order route before re-enabling trade execution.'
        }, { status: 410 });
    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Archived route' }, { status: 500 });
    }
}
