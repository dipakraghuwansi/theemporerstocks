import { NextRequest, NextResponse } from 'next/server';
import {
  getResearchBacktestModeStatus,
  runResearchBacktestBatch,
} from '@/lib/research/backtestMode';
import { ResearchBacktestMode } from '@/lib/research/types';

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown research backtest mode error.';
}

function toBacktestMode(value: unknown): ResearchBacktestMode {
  return value === 'minute' ? 'minute' : 'day';
}

export async function GET() {
  try {
    const status = await getResearchBacktestModeStatus();
    return NextResponse.json({
      success: true,
      ...status,
    });
  } catch (error: unknown) {
    console.error('Research backtest mode status error:', error);
    return NextResponse.json(
      { error: getErrorMessage(error) || 'Failed to load weekend backtest status.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get('kite_access_token')?.value || null;
    const body = await request.json().catch(() => ({}));
    const mode = toBacktestMode(body.mode);
    const report = await runResearchBacktestBatch({
      mode,
      token,
      lookbackDays: Number(body.lookbackDays) || undefined,
      batchSize: Number(body.batchSize) || undefined,
      reset: Boolean(body.reset),
      refreshData: Boolean(body.refreshData),
    });

    return NextResponse.json({
      success: true,
      data: report,
      notes: [
        'Weekend mode processes the universe in resumable Mongo-backed batches, so you can pause and continue later without losing work.',
        mode === 'day'
          ? 'The daily lane only refreshes missing or stale benchmark and symbol history for the current batch instead of rebuilding the whole universe every time.'
          : 'The minute lane refreshes a rolling recent window for the current batch so intraday evidence can keep filling in over weekends.',
        'After each batch, the aggregate research manifest is rebuilt by merging refreshed symbols into the existing evidence set.',
      ],
    });
  } catch (error: unknown) {
    console.error('Research backtest mode run error:', error);
    const message = getErrorMessage(error);
    const status = /authentication|login|token/i.test(message) ? 401 : 500;
    return NextResponse.json(
      {
        error: message || 'Failed to run weekend backtest mode.',
        needsLogin: status === 401,
      },
      { status }
    );
  }
}
