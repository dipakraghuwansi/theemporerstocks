import { NextRequest, NextResponse } from 'next/server';
import { recordModelPortfolioPaperReview } from '@/lib/modelPortfolio/execution';

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error';
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { confirmationText?: string };
    const execution = await recordModelPortfolioPaperReview({
      confirmationText: body.confirmationText || '',
    });

    return NextResponse.json({ success: true, data: execution });
  } catch (error: unknown) {
    console.error('Model portfolio paper review error:', error);
    return NextResponse.json(
      { error: getErrorMessage(error) || 'Failed to record the model portfolio paper-review checkpoint.' },
      { status: 500 }
    );
  }
}
