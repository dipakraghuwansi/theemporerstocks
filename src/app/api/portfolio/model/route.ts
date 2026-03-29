import { NextRequest, NextResponse } from 'next/server';
import { getModelPortfolioSummary, recomputeModelPortfolio } from '@/lib/modelPortfolio/engine';

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error';
}

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('kite_access_token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Not authenticated with Kite', needsLogin: true }, { status: 401 });
    }

    const summary = await getModelPortfolioSummary(token);
    return NextResponse.json({ success: true, data: summary });
  } catch (error: unknown) {
    console.error('Model portfolio summary error:', error);
    return NextResponse.json(
      { error: getErrorMessage(error) || 'Failed to load model portfolio.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get('kite_access_token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Not authenticated with Kite', needsLogin: true }, { status: 401 });
    }

    const summary = await recomputeModelPortfolio(token);
    return NextResponse.json({ success: true, data: summary });
  } catch (error: unknown) {
    console.error('Model portfolio recompute error:', error);
    return NextResponse.json(
      { error: getErrorMessage(error) || 'Failed to recompute model portfolio.' },
      { status: 500 }
    );
  }
}
