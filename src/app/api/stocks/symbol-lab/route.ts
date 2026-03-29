import { NextRequest, NextResponse } from 'next/server';
import { runStockLabAnalysis } from '@/lib/stockLab/service';
import { StockLabStreamEvent } from '@/lib/stockLab/types';

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Failed to run stock lab analysis.';
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get('kite_access_token')?.value || null;
  const body = await request.json().catch(() => ({}));
  const symbol = typeof body.symbol === 'string' ? body.symbol : '';
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: StockLabStreamEvent) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      try {
        send({
          type: 'progress',
          progress: {
            key: 'request-received',
            title: 'Request received',
            detail: 'Opening the stock lab pipeline and preparing the server-side analysis steps for the selected symbol.',
            timestamp: new Date().toISOString(),
          },
        });

        const analysis = await runStockLabAnalysis(symbol, token, async (progress) => {
          send({
            type: 'progress',
            progress: {
              ...progress,
              timestamp: progress.timestamp || new Date().toISOString(),
            },
          });
        });

        send({
          type: 'result',
          success: true,
          data: analysis,
          notes: [
            'Single-stock lab reuses cached day and minute history when available, and only builds missing data for the selected symbol when needed.',
            'Out-of-universe symbols are analyzed through an ad-hoc historical build path, so the main curated universe list and universe-wide manifests stay untouched.',
            'Per-model backtests are derived from the same research label engine used elsewhere in the app, then reshaped into chart-friendly series for this page.',
          ],
        });
      } catch (error: unknown) {
        console.error('Stock lab analysis error:', error);
        const message = getErrorMessage(error);
        send({
          type: 'error',
          error: message,
          needsLogin: /login|token|auth/i.test(message),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
