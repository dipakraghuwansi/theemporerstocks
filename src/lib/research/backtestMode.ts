import { ensureDatasetHydrated, readDataset } from '@/lib/historical/cache';
import { buildHistoricalDataset } from '@/lib/historical/foundation';
import { HistoricalDatasetFile } from '@/lib/historical/types';
import { readResearchManifest, writeResearchManifest } from '@/lib/research/cache';
import { buildOutcomeLabels } from '@/lib/research/labels';
import {
  clearResearchBacktestRun,
  getResearchBacktestRun,
  listResearchBacktestSymbolResults,
  saveResearchBacktestRun,
  saveResearchBacktestSymbolResult,
} from '@/lib/research/store';
import { buildResearchManifest } from '@/lib/research/stats';
import {
  ResearchBacktestBatchReport,
  ResearchBacktestBatchSummary,
  ResearchBacktestMode,
  ResearchBacktestRun,
  ResearchBacktestSymbolResult,
} from '@/lib/research/types';
import { getStockUniverse } from '@/lib/stockUniverseStore';

const BENCHMARK_SYMBOL = 'NIFTY50_BENCHMARK';
const STATUS_RESULT_LIMIT = 12;

const BACKTEST_MODE_CONFIG = {
  day: {
    runId: 'research_weekend_universe_day',
    datasetInterval: 'day',
    defaultLookbackDays: 730,
    minLookbackDays: 365,
    maxLookbackDays: 1095,
    defaultBatchSize: 1,
    maxBatchSize: 5,
    manifestLabel: 'daily',
    notes: [
      'Weekend daily sweep processes long-horizon research evidence one symbol at a time and persists progress to MongoDB.',
      'The aggregate research manifest is rebuilt after each batch so swing, breakout, and mean-reversion evidence improves outside market hours.',
    ],
  },
  minute: {
    runId: 'research_weekend_universe_minute',
    datasetInterval: 'minute',
    defaultLookbackDays: 20,
    minLookbackDays: 10,
    maxLookbackDays: 30,
    defaultBatchSize: 1,
    maxBatchSize: 2,
    manifestLabel: 'minute',
    notes: [
      'Weekend minute sweep fills recent intraday evidence one symbol at a time and persists progress to MongoDB.',
      'The minute lane uses a shorter rolling lookback so you can keep intraday validation current without waiting for live sessions.',
    ],
  },
} as const satisfies Record<
  ResearchBacktestMode,
  {
    runId: string;
    datasetInterval: 'day' | 'minute';
    defaultLookbackDays: number;
    minLookbackDays: number;
    maxLookbackDays: number;
    defaultBatchSize: number;
    maxBatchSize: number;
    manifestLabel: string;
    notes: string[];
  }
>;

type ResearchBacktestBatchOptions = {
  mode?: ResearchBacktestMode;
  token?: string | null;
  lookbackDays?: number;
  batchSize?: number;
  reset?: boolean;
  refreshData?: boolean;
};

function nowIso() {
  return new Date().toISOString();
}

function getModeConfig(mode: ResearchBacktestMode) {
  return BACKTEST_MODE_CONFIG[mode];
}

function clampLookbackDays(mode: ResearchBacktestMode, value?: number) {
  const config = getModeConfig(mode);
  if (!Number.isFinite(value)) return config.defaultLookbackDays;
  return Math.min(
    Math.max(Number(value) || config.defaultLookbackDays, config.minLookbackDays),
    config.maxLookbackDays
  );
}

function clampBatchSize(mode: ResearchBacktestMode, value?: number) {
  const config = getModeConfig(mode);
  if (!Number.isFinite(value)) return config.defaultBatchSize;
  return Math.min(
    Math.max(Number(value) || config.defaultBatchSize, 1),
    config.maxBatchSize
  );
}

function getDateRange(lookbackDays: number) {
  const toDate = new Date();
  const fromDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  return {
    from: fromDate.toISOString().split('T')[0],
    to: toDate.toISOString().split('T')[0],
  };
}

function datasetSatisfiesRequest(dataset: HistoricalDatasetFile | null, lookbackDays: number) {
  if (!dataset) return false;
  const { from, to } = getDateRange(lookbackDays);
  return dataset.from <= from && dataset.to >= to && dataset.candles.length > 0;
}

function getUniverseSymbols() {
  return getStockUniverse()
    .map((item) => item.symbol)
    .sort((a, b) => a.localeCompare(b));
}

function createRun(
  mode: ResearchBacktestMode,
  lookbackDays: number,
  batchSize: number,
  universeSymbols: string[],
  existingResults: ResearchBacktestSymbolResult[] = []
) {
  const config = getModeConfig(mode);
  const processedSet = new Set(existingResults.map((result) => result.symbol));
  const completedSymbols = existingResults
    .filter((result) => result.status === 'COMPLETED')
    .map((result) => result.symbol);
  const failedList = existingResults
    .filter((result) => result.status === 'FAILED')
    .map((result) => result.symbol);
  const pendingSymbols = universeSymbols.filter((symbol) => !processedSet.has(symbol));
  const createdAt = nowIso();
  const isComplete = pendingSymbols.length === 0 && universeSymbols.length > 0;

  return {
    id: config.runId,
    interval: mode,
    status: isComplete ? 'COMPLETED' : 'IDLE',
    lookbackDays,
    batchSize,
    totalSymbols: universeSymbols.length,
    completedSymbols: completedSymbols.length,
    failedSymbols: failedList.length,
    pendingSymbols,
    processedSymbols: existingResults.map((result) => result.symbol),
    failedList,
    activeSymbol: null,
    nextSymbol: pendingSymbols[0] || null,
    lastProcessedSymbol: existingResults[0]?.symbol || null,
    createdAt,
    startedAt:
      existingResults.length > 0
        ? existingResults[existingResults.length - 1]?.processedAt || createdAt
        : null,
    updatedAt: createdAt,
    completedAt: isComplete ? createdAt : null,
    notes: config.notes,
  } satisfies ResearchBacktestRun;
}

async function loadOrCreateRun(
  mode: ResearchBacktestMode,
  lookbackDays: number,
  batchSize: number,
  reset = false
) {
  const config = getModeConfig(mode);
  const universeSymbols = getUniverseSymbols();
  if (reset) {
    await clearResearchBacktestRun(config.runId);
  }

  const existingRun = reset ? null : await getResearchBacktestRun(config.runId);
  if (
    existingRun &&
    existingRun.lookbackDays === lookbackDays &&
    existingRun.interval === mode
  ) {
    const knownSymbols = new Set([...existingRun.pendingSymbols, ...existingRun.processedSymbols]);
    const missingSymbols = universeSymbols.filter((symbol) => !knownSymbols.has(symbol));
    const pendingSymbols = [...existingRun.pendingSymbols, ...missingSymbols];
    const nextRun: ResearchBacktestRun = {
      ...existingRun,
      batchSize,
      totalSymbols: universeSymbols.length,
      pendingSymbols,
      nextSymbol: pendingSymbols[0] || null,
      updatedAt: nowIso(),
    };
    await saveResearchBacktestRun(nextRun);
    return nextRun;
  }

  if (existingRun && (existingRun.lookbackDays !== lookbackDays || existingRun.interval !== mode)) {
    await clearResearchBacktestRun(config.runId);
  }

  const existingResults = reset ? [] : await listResearchBacktestSymbolResults(config.runId);
  const filteredResults = existingResults.filter(
    (result) => result.lookbackDays === lookbackDays && result.interval === mode
  );
  const nextRun = createRun(mode, lookbackDays, batchSize, universeSymbols, filteredResults);
  await saveResearchBacktestRun(nextRun);
  return nextRun;
}

async function getStatusRun(mode: ResearchBacktestMode) {
  const config = getModeConfig(mode);
  const existingRun = await getResearchBacktestRun(config.runId);
  if (!existingRun || existingRun.interval !== mode) {
    return loadOrCreateRun(mode, config.defaultLookbackDays, config.defaultBatchSize);
  }

  const universeSymbols = getUniverseSymbols();
  const knownSymbols = new Set([...existingRun.pendingSymbols, ...existingRun.processedSymbols]);
  const missingSymbols = universeSymbols.filter((symbol) => !knownSymbols.has(symbol));
  const pendingSymbols = [...existingRun.pendingSymbols, ...missingSymbols];
  const nextRun: ResearchBacktestRun = {
    ...existingRun,
    totalSymbols: universeSymbols.length,
    pendingSymbols,
    nextSymbol: pendingSymbols[0] || null,
    updatedAt: nowIso(),
  };
  await saveResearchBacktestRun(nextRun);
  return nextRun;
}

async function ensureBenchmarkDataset(
  token: string | null | undefined,
  lookbackDays: number,
  refreshData: boolean
): Promise<HistoricalDatasetFile> {
  let dataset =
    readDataset('day', BENCHMARK_SYMBOL) ||
    (await ensureDatasetHydrated('day', BENCHMARK_SYMBOL));
  if (dataset && !refreshData && datasetSatisfiesRequest(dataset, lookbackDays)) {
    return dataset;
  }

  if (!token) {
    throw new Error(
      'Weekend daily sweep needs Kite authentication to fetch missing benchmark history.'
    );
  }

  await buildHistoricalDataset(
    {
      token,
      interval: 'day',
      lookbackDays,
      refresh: refreshData,
      maxSymbols: 0,
    },
    { persistManifest: false }
  );

  dataset =
    readDataset('day', BENCHMARK_SYMBOL) ||
    (await ensureDatasetHydrated('day', BENCHMARK_SYMBOL));
  if (!dataset || !datasetSatisfiesRequest(dataset, lookbackDays)) {
    throw new Error('Benchmark history is still incomplete after the daily sweep refresh.');
  }

  return dataset;
}

async function ensureModeDatasets(
  mode: ResearchBacktestMode,
  symbols: string[],
  token: string | null | undefined,
  lookbackDays: number,
  refreshData: boolean
) {
  const config = getModeConfig(mode);
  const missingSymbols: string[] = [];

  for (const symbol of symbols) {
    const dataset =
      readDataset(config.datasetInterval, symbol) ||
      (await ensureDatasetHydrated(config.datasetInterval, symbol));
    if (refreshData || !datasetSatisfiesRequest(dataset, lookbackDays)) {
      missingSymbols.push(symbol);
    }
  }

  if (missingSymbols.length === 0) return;
  if (!token) {
    throw new Error(
      `Weekend ${config.manifestLabel} sweep needs Kite authentication to fetch missing symbol history.`
    );
  }

  await buildHistoricalDataset(
    {
      token,
      interval: config.datasetInterval,
      lookbackDays,
      refresh: refreshData,
      symbols: missingSymbols,
      maxSymbols: missingSymbols.length,
    },
    { persistManifest: false }
  );
}

function mergeCompletedResultsIntoLabels(
  existingLabels: ResearchBacktestSymbolResult['labels'],
  interval: ResearchBacktestMode,
  results: ResearchBacktestSymbolResult[]
) {
  const completed = results.filter((result) => result.status === 'COMPLETED');
  if (completed.length === 0) {
    return existingLabels;
  }

  const refreshedSymbols = new Set(completed.map((result) => result.symbol));
  const preserved = existingLabels.filter(
    (label) => label.interval !== interval || !refreshedSymbols.has(label.symbol)
  );

  return [...preserved, ...completed.flatMap((result) => result.labels)];
}

async function rebuildAggregateManifest() {
  const existingManifest = readResearchManifest();
  const existingLabels = existingManifest?.labels || [];
  const [dailyResults, minuteResults] = await Promise.all([
    listResearchBacktestSymbolResults(BACKTEST_MODE_CONFIG.day.runId),
    listResearchBacktestSymbolResults(BACKTEST_MODE_CONFIG.minute.runId),
  ]);

  const labelsWithDailyRefresh = mergeCompletedResultsIntoLabels(existingLabels, 'day', dailyResults);
  const mergedLabels = mergeCompletedResultsIntoLabels(
    labelsWithDailyRefresh,
    'minute',
    minuteResults
  );

  if (mergedLabels.length === 0) {
    return null;
  }

  const manifest = buildResearchManifest(mergedLabels);
  writeResearchManifest(manifest);
  return manifest;
}

function createFailedSymbolResult(
  runId: string,
  mode: ResearchBacktestMode,
  lookbackDays: number,
  symbol: string,
  error: unknown
) {
  const universeItem = getStockUniverse().find((item) => item.symbol === symbol);
  const message = error instanceof Error ? error.message : 'Unknown backtest failure';

  return {
    id: `${runId}_${symbol}`,
    runId,
    interval: mode,
    symbol,
    instrument: universeItem?.instrument || `NSE:${symbol}`,
    sector: universeItem?.sector || 'Unknown',
    category: universeItem?.category || 'manual',
    status: 'FAILED',
    lookbackDays,
    processedAt: nowIso(),
    datasetFrom: null,
    datasetTo: null,
    candleCount: 0,
    labelCount: 0,
    screens: [],
    labels: [],
    error: message,
  } satisfies ResearchBacktestSymbolResult;
}

function updateRunAfterBatch(
  run: ResearchBacktestRun,
  results: ResearchBacktestSymbolResult[]
) {
  const processedSymbols = [...run.processedSymbols];
  const failedList = [...run.failedList];

  for (const result of results) {
    if (!processedSymbols.includes(result.symbol)) {
      processedSymbols.push(result.symbol);
    }
    if (result.status === 'FAILED' && !failedList.includes(result.symbol)) {
      failedList.push(result.symbol);
    }
  }

  const pendingSymbols = run.pendingSymbols.filter(
    (symbol) => !results.some((result) => result.symbol === symbol)
  );
  const completedSymbols = results.filter((result) => result.status === 'COMPLETED').length;
  const failedSymbols = results.filter((result) => result.status === 'FAILED').length;
  const timestamp = nowIso();
  const isComplete = pendingSymbols.length === 0;

  return {
    ...run,
    status: isComplete ? 'COMPLETED' : 'IDLE',
    completedSymbols: run.completedSymbols + completedSymbols,
    failedSymbols: run.failedSymbols + failedSymbols,
    pendingSymbols,
    processedSymbols,
    failedList,
    activeSymbol: null,
    nextSymbol: pendingSymbols[0] || null,
    lastProcessedSymbol: results[results.length - 1]?.symbol || run.lastProcessedSymbol,
    updatedAt: timestamp,
    completedAt: isComplete ? timestamp : null,
  } satisfies ResearchBacktestRun;
}

export async function getResearchBacktestModeStatus() {
  const [dayRun, minuteRun] = await Promise.all([
    getStatusRun('day'),
    getStatusRun('minute'),
  ]);
  const [recentDailyResults, recentMinuteResults] = await Promise.all([
    listResearchBacktestSymbolResults(dayRun.id, STATUS_RESULT_LIMIT),
    listResearchBacktestSymbolResults(minuteRun.id, STATUS_RESULT_LIMIT),
  ]);

  return {
    runs: {
      day: dayRun,
      minute: minuteRun,
    },
    recentResultsByMode: {
      day: recentDailyResults,
      minute: recentMinuteResults,
    },
    aggregateManifestGeneratedAt: readResearchManifest()?.generatedAt || null,
    notes: [
      'Daily and minute weekend sweeps are resumable and independent, so you can pause one lane without losing the other.',
      'Each batch only fetches missing or stale history for the symbols being processed instead of refreshing the whole universe.',
      'The aggregate research manifest is merged symbol-by-symbol, which keeps prior evidence in place until a symbol is refreshed.',
    ],
  };
}

export async function runResearchBacktestBatch(
  options: ResearchBacktestBatchOptions = {}
): Promise<ResearchBacktestBatchReport> {
  const mode = options.mode || 'day';
  const config = getModeConfig(mode);
  const lookbackDays = clampLookbackDays(mode, options.lookbackDays);
  const batchSize = clampBatchSize(mode, options.batchSize);
  let run = await loadOrCreateRun(mode, lookbackDays, batchSize, Boolean(options.reset));

  if (run.pendingSymbols.length === 0) {
    const completedRun = {
      ...run,
      status: 'COMPLETED',
      completedAt: run.completedAt || nowIso(),
      updatedAt: nowIso(),
    } satisfies ResearchBacktestRun;
    await saveResearchBacktestRun(completedRun);
    const aggregateManifest = await rebuildAggregateManifest();
    return {
      run: completedRun,
      aggregateManifest,
      batch: {
        requested: 0,
        processed: 0,
        completed: 0,
        failed: 0,
        symbols: [],
      },
    };
  }

  const batchSymbols = run.pendingSymbols.slice(0, batchSize);
  run = {
    ...run,
    status: 'RUNNING',
    activeSymbol: batchSymbols[0] || null,
    startedAt: run.startedAt || nowIso(),
    updatedAt: nowIso(),
  };
  await saveResearchBacktestRun(run);

  const benchmarkDataset =
    mode === 'day'
      ? await ensureBenchmarkDataset(options.token, lookbackDays, Boolean(options.refreshData))
      : null;

  await ensureModeDatasets(
    mode,
    batchSymbols,
    options.token,
    lookbackDays,
    Boolean(options.refreshData)
  );

  const batchResults: ResearchBacktestSymbolResult[] = [];
  const universeMap = new Map(getStockUniverse().map((item) => [item.symbol, item]));

  for (const symbol of batchSymbols) {
    const universeItem = universeMap.get(symbol);
    if (!universeItem) {
      batchResults.push(
        createFailedSymbolResult(run.id, mode, lookbackDays, symbol, new Error(`Universe entry missing for ${symbol}.`))
      );
      continue;
    }

    try {
      const dataset =
        readDataset(config.datasetInterval, symbol) ||
        (await ensureDatasetHydrated(config.datasetInterval, symbol));
      if (!dataset || !datasetSatisfiesRequest(dataset, lookbackDays)) {
        const coverageLabel = mode === 'day' ? 'Daily history' : 'Minute history';
        throw new Error(
          `${coverageLabel} coverage is incomplete for ${symbol}.`
        );
      }

      const labels =
        mode === 'day'
          ? buildOutcomeLabels([benchmarkDataset!, dataset])
          : buildOutcomeLabels([], [dataset]);
      const manifest = buildResearchManifest(labels);
      const result: ResearchBacktestSymbolResult = {
        id: `${run.id}_${symbol}`,
        runId: run.id,
        interval: mode,
        symbol,
        instrument: universeItem.instrument,
        sector: universeItem.sector,
        category: universeItem.category,
        status: 'COMPLETED',
        lookbackDays,
        processedAt: nowIso(),
        datasetFrom: dataset.from,
        datasetTo: dataset.to,
        candleCount: dataset.candles.length,
        labelCount: labels.length,
        screens: manifest.screens,
        labels,
      };

      await saveResearchBacktestSymbolResult(result);
      batchResults.push(result);
    } catch (error: unknown) {
      const failedResult = createFailedSymbolResult(run.id, mode, lookbackDays, symbol, error);
      await saveResearchBacktestSymbolResult(failedResult);
      batchResults.push(failedResult);
    }
  }

  const nextRun = updateRunAfterBatch(run, batchResults);
  await saveResearchBacktestRun(nextRun);
  const aggregateManifest = await rebuildAggregateManifest();

  const batchSummary = {
    requested: batchSymbols.length,
    processed: batchResults.length,
    completed: batchResults.filter((result) => result.status === 'COMPLETED').length,
    failed: batchResults.filter((result) => result.status === 'FAILED').length,
    symbols: batchResults,
  } satisfies ResearchBacktestBatchSummary;

  return {
    run: nextRun,
    aggregateManifest,
    batch: batchSummary,
  };
}
