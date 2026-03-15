import { NextRequest, NextResponse } from 'next/server';
import { readManifest } from '@/lib/historical/cache';
import { readDataset } from '@/lib/historical/cache';
import { readResearchManifest, writeResearchManifest } from '@/lib/research/cache';
import { buildOutcomeLabels } from '@/lib/research/labels';
import { buildResearchManifest } from '@/lib/research/stats';

export async function GET() {
  const manifest = readResearchManifest();
  return NextResponse.json({
    success: true,
    manifest,
    notes: [
      'Research manifest combines cached daily labels with minute intraday labels when minute data is available.',
      'Per-symbol stats are used when the sample size is sufficient; otherwise screen-level stats are used.',
    ],
  });
}

export async function POST(_request: NextRequest) {
  try {
    const foundationManifest = readManifest('day');
    if (!foundationManifest || foundationManifest.entries.length === 0) {
      return NextResponse.json(
        { error: 'No daily historical foundation found. Build /api/stocks/research/foundation first.' },
        { status: 400 }
      );
    }

    const datasets = foundationManifest.entries
      .filter((entry) => entry.status !== 'error')
      .map((entry) => readDataset('day', entry.symbol))
      .filter((dataset): dataset is NonNullable<typeof dataset> => Boolean(dataset));

    const minuteFoundationManifest = readManifest('minute');
    const minuteDatasets = minuteFoundationManifest
      ? minuteFoundationManifest.entries
          .filter((entry) => entry.status !== 'error')
          .map((entry) => readDataset('minute', entry.symbol))
          .filter((dataset): dataset is NonNullable<typeof dataset> => Boolean(dataset))
      : [];

    const labels = buildOutcomeLabels(datasets, minuteDatasets);
    const manifest = buildResearchManifest(labels);
    writeResearchManifest(manifest);

    return NextResponse.json({
      success: true,
      manifest,
      notes: [
        'Labels now compare net outcome versus the NIFTY benchmark over the same holding window.',
        'Returns include simple execution friction via slippage and cost assumptions.',
        'Train/test, walk-forward, and regime-segmented summaries are included in the manifest.',
        'If minute foundation data exists, intraday momentum labels are built from minute candles.',
        'Targets, stops, and lookahead windows are screen-specific and ATR-scaled.',
      ],
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to build research manifest.' }, { status: 500 });
  }
}
