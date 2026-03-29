import { NextResponse } from 'next/server';
import { getPaperTrades } from '@/lib/paperStore';

export const dynamic = 'force-dynamic';

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error';
}

export async function GET() {
  try {
    const trades = await getPaperTrades();
    return NextResponse.json({ trades });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
