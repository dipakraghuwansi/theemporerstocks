import { NextResponse } from 'next/server';
import {
  getModelPortfolioExecutionConfig,
  listRecentModelPortfolioExecutions,
} from '@/lib/modelPortfolio/execution';

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error';
}

export async function GET() {
  try {
    const executions = await listRecentModelPortfolioExecutions();
    const config = await getModelPortfolioExecutionConfig();
    return NextResponse.json({
      success: true,
      data: {
        ...config,
        executions,
      },
    });
  } catch (error: unknown) {
    console.error('Model portfolio paper review list error:', error);
    return NextResponse.json(
      { error: getErrorMessage(error) || 'Failed to load model portfolio paper-review audit trail.' },
      { status: 500 }
    );
  }
}
