import { NextResponse } from 'next/server';
import { getModelPortfolioPerformanceSummary } from '@/lib/modelPortfolio/performance';

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error';
}

export async function GET() {
  try {
    const summary = await getModelPortfolioPerformanceSummary(false);
    return NextResponse.json({ success: true, data: summary });
  } catch (error: unknown) {
    console.error('Model portfolio performance summary error:', error);
    return NextResponse.json(
      { error: getErrorMessage(error) || 'Failed to load model portfolio performance.' },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    const summary = await getModelPortfolioPerformanceSummary(true);
    return NextResponse.json({ success: true, data: summary });
  } catch (error: unknown) {
    console.error('Model portfolio performance recompute error:', error);
    return NextResponse.json(
      { error: getErrorMessage(error) || 'Failed to recompute model portfolio performance.' },
      { status: 500 }
    );
  }
}
