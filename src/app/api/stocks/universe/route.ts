import { NextRequest, NextResponse } from 'next/server';
import { deleteStockUniverseItem, getStockUniverse, refreshStockUniverseFromIndices, upsertStockUniverseItem } from '@/lib/stockUniverseStore';

export async function GET() {
  try {
    const items = getStockUniverse();
    return NextResponse.json({ success: true, items });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to load stock universe.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const items = upsertStockUniverseItem(body);
    return NextResponse.json({ success: true, items });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to save stock universe item.' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const symbol = request.nextUrl.searchParams.get('symbol') || '';
    if (!symbol) {
      return NextResponse.json({ error: 'symbol is required.' }, { status: 400 });
    }

    const items = deleteStockUniverseItem(symbol);
    return NextResponse.json({ success: true, items });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to delete stock universe item.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    if (body.action !== 'refresh-from-indices') {
      return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 });
    }

    const items = await refreshStockUniverseFromIndices();
    return NextResponse.json({ success: true, items });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to refresh stock universe.' }, { status: 500 });
  }
}
