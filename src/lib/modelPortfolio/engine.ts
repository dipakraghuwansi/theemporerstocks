import {
  MODEL_PORTFOLIO_BASE_CAPITAL,
  MODEL_PORTFOLIO_CONFIG_VERSION,
  MODEL_PORTFOLIO_ENTRY_POLICY,
  MODEL_PORTFOLIO_EXECUTION,
  MODEL_PORTFOLIO_FILTERS,
  MODEL_PORTFOLIO_HISTORY_LIMIT,
  MODEL_PORTFOLIO_ID,
  MODEL_PORTFOLIO_NOTES,
  MODEL_PORTFOLIO_REBALANCE_LOG_LIMIT,
  MODEL_PORTFOLIO_REGIME_POLICY,
  MODEL_PORTFOLIO_SCREEN_UNIVERSE,
  MODEL_PORTFOLIO_TRADE_LOG_LIMIT,
} from '@/lib/modelPortfolio/config';
import { buildMarketEntryGate, getNextTradingSessionDate } from '@/lib/modelPortfolio/entryGate';
import { computePortfolioPaperMetrics, computePortfolioRiskMetrics } from '@/lib/modelPortfolio/risk';
import { buildModelPortfolioCandidates } from '@/lib/modelPortfolio/scoring';
import {
  appendModelPortfolioRebalance,
  appendModelPortfolioSnapshot,
  appendModelPortfolioTrades,
  getModelPortfolioDefinition,
  getModelPortfolioPositions,
  getModelPortfolioRebalances,
  getModelPortfolioSnapshots,
  getModelPortfolioTrades,
  replaceModelPortfolioPositions,
  saveModelPortfolioDefinition,
} from '@/lib/modelPortfolio/store';
import {
  ModelPortfolioCandidate,
  ModelPortfolioDefinition,
  ModelPortfolioPosition,
  ModelPortfolioRebalance,
  ModelPortfolioRebalanceAction,
  ModelPortfolioSnapshot,
  ModelPortfolioSummary,
  ModelPortfolioTrade,
} from '@/lib/modelPortfolio/types';
import { buildTargetWeights } from '@/lib/modelPortfolio/weights';
import { loadScreenerRuntime, scoreScreen } from '@/lib/screener/runtime';

function createId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function buildDefaultPortfolio(now: string): ModelPortfolioDefinition {
  return {
    id: MODEL_PORTFOLIO_ID,
    slug: 'adaptive-alpha-10',
    name: 'Adaptive Alpha 10',
    status: 'ACTIVE',
    benchmarkSymbol: 'NIFTY 50',
    baseCapital: MODEL_PORTFOLIO_BASE_CAPITAL,
    rebalanceFrequency: 'WEEKLY',
    configVersion: MODEL_PORTFOLIO_CONFIG_VERSION,
    cash: MODEL_PORTFOLIO_BASE_CAPITAL,
    bookStartAt: now,
    entryActivationDate: getNextTradingSessionDate(now),
    lastComputedAt: null,
    lastRebalancedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

function shouldResetPortfolio(portfolio: ModelPortfolioDefinition) {
  return (
    portfolio.configVersion !== MODEL_PORTFOLIO_CONFIG_VERSION ||
    portfolio.baseCapital !== MODEL_PORTFOLIO_BASE_CAPITAL ||
    !portfolio.bookStartAt ||
    !portfolio.entryActivationDate
  );
}

function buildResetPortfolio(portfolio: ModelPortfolioDefinition, now: string): ModelPortfolioDefinition {
  return {
    ...portfolio,
    baseCapital: MODEL_PORTFOLIO_BASE_CAPITAL,
    cash: MODEL_PORTFOLIO_BASE_CAPITAL,
    configVersion: MODEL_PORTFOLIO_CONFIG_VERSION,
    bookStartAt: now,
    entryActivationDate: getNextTradingSessionDate(now),
    lastComputedAt: null,
    lastRebalancedAt: null,
    updatedAt: now,
  };
}

function calculateFees(grossAmount: number) {
  return Number((grossAmount * MODEL_PORTFOLIO_EXECUTION.feeRate).toFixed(2));
}

function computeCurrentNav(portfolio: ModelPortfolioDefinition, positions: ModelPortfolioPosition[]) {
  return Number((portfolio.cash + positions.reduce((sum, position) => sum + position.marketValue, 0)).toFixed(2));
}

function computeDrawdownPct(history: ModelPortfolioSnapshot[], nav: number) {
  let peak = 0;
  let drawdown = 0;
  for (const snapshot of history) {
    peak = Math.max(peak, snapshot.nav);
    if (peak > 0) {
      drawdown = Math.min(drawdown, (snapshot.nav - peak) / peak);
    }
  }

  peak = Math.max(peak, nav);
  if (peak > 0) {
    drawdown = Math.min(drawdown, (nav - peak) / peak);
  }

  return Number(Math.abs(drawdown * 100).toFixed(2));
}

function decoratePositions(positions: ModelPortfolioPosition[], nav: number) {
  return positions.map((position) => {
    const marketValue = Number((position.shares * position.currentPrice).toFixed(2));
    const liveWeight = nav > 0 ? Number((marketValue / nav).toFixed(4)) : 0;
    const unrealizedPnl = Number((marketValue - position.costBasis).toFixed(2));
    const unrealizedPnlPct =
      position.costBasis > 0 ? Number(((unrealizedPnl / position.costBasis) * 100).toFixed(2)) : 0;
    return {
      ...position,
      marketValue,
      liveWeight,
      unrealizedPnl,
      unrealizedPnlPct,
      weightDriftPct: Number(((liveWeight - position.targetWeight) * 100).toFixed(2)),
    };
  });
}

function updatePositionLiveData(
  positions: ModelPortfolioPosition[],
  latestBySymbol: Map<string, { price: number; dayChangePct: number }>
) {
  return positions.map((position) => {
    const latest = latestBySymbol.get(position.symbol);
    return {
      ...position,
      currentPrice: latest?.price ?? position.currentPrice,
      dayChangePct: latest?.dayChangePct ?? position.dayChangePct,
    };
  });
}

function buildReason(candidate: ModelPortfolioCandidate) {
  return `${candidate.sourceScreenLabel} candidate with portfolio score ${candidate.portfolioScore.toFixed(1)} and ${candidate.screenerResult.buyRecommendation.confidenceLabel.toLowerCase()} confidence.`;
}

function buildCandidatePosition(
  portfolioId: string,
  candidate: ModelPortfolioCandidate,
  regimeName: ModelPortfolioSummary['regime']['name'],
  now: string,
  existing?: ModelPortfolioPosition
): ModelPortfolioPosition {
  return {
    id: existing?.id || createId(`model_position_${candidate.symbol}`),
    portfolioId,
    symbol: candidate.symbol,
    instrument: candidate.instrument,
    sector: candidate.sector,
    category: String(candidate.category),
    status: 'OPEN',
    enteredAt: existing?.enteredAt || now,
    updatedAt: now,
    entryPrice: existing?.entryPrice || candidate.screenerResult.lastPrice,
    currentPrice: candidate.screenerResult.lastPrice,
    shares: existing?.shares || 0,
    costBasis: existing?.costBasis || 0,
    marketValue: existing?.marketValue || 0,
    targetWeight: existing?.targetWeight || 0,
    liveWeight: existing?.liveWeight || 0,
    weightDriftPct: existing?.weightDriftPct || 0,
    stopLoss: candidate.screenerResult.buyRecommendation.plan.stopLoss,
    targetPrice: candidate.screenerResult.buyRecommendation.plan.targetPrice,
    thesis: candidate.screenerResult.thesis,
    portfolioScore: candidate.portfolioScore,
    confidenceScore: candidate.screenerResult.buyRecommendation.confidenceScore,
    confidenceLabel: candidate.screenerResult.buyRecommendation.confidenceLabel,
    supportLabel: candidate.screenerResult.buyRecommendation.supportLabel,
    sourceScreen: candidate.sourceScreen,
    regimeAtEntry: existing?.regimeAtEntry || regimeName,
    beta20: candidate.screenerResult.beta20 ?? null,
    dayChangePct: candidate.screenerResult.dayChangePct,
    residualAlpha20d: candidate.screenerResult.residualAlpha20d,
    factorBasketAlpha20d: candidate.screenerResult.factorBasketAlpha20d,
    score: candidate.screenerResult.score,
    feesPaid: existing?.feesPaid || 0,
    realizedPnl: existing?.realizedPnl || 0,
    unrealizedPnl: existing?.unrealizedPnl || 0,
    unrealizedPnlPct: existing?.unrealizedPnlPct || 0,
    scoreComponents: {
      alphaScore: candidate.alphaScore,
      setupScore: candidate.setupScore,
      evidenceScore: candidate.evidenceScore,
      overlayScore: candidate.overlayScore,
    },
  };
}

type SimulationResult = {
  nav: number;
  cash: number;
  positions: ModelPortfolioPosition[];
  actions: ModelPortfolioRebalanceAction[];
  trades: ModelPortfolioTrade[];
  notes: string[];
};

function simulateRebalance(params: {
  portfolio: ModelPortfolioDefinition;
  currentPositions: ModelPortfolioPosition[];
  selections: Array<{ candidate: ModelPortfolioCandidate; targetWeight: number }>;
  regimeName: ModelPortfolioSummary['regime']['name'];
  now: string;
}) {
  const { portfolio, currentPositions, selections, regimeName, now } = params;
  const currentNav = computeCurrentNav(portfolio, currentPositions);
  const actions: ModelPortfolioRebalanceAction[] = [];
  const trades: ModelPortfolioTrade[] = [];
  const notes: string[] = [];
  let cash = portfolio.cash;

  const selectionMap = new Map(
    selections.map((selection) => [
      selection.candidate.symbol,
      {
        ...selection,
        targetShares: Math.max(0, Math.floor((currentNav * selection.targetWeight) / selection.candidate.screenerResult.lastPrice)),
      },
    ])
  );

  const workingMap = new Map<string, ModelPortfolioPosition>();
  for (const position of currentPositions) {
    workingMap.set(position.symbol, { ...position });
  }

  for (const current of currentPositions) {
    const target = selectionMap.get(current.symbol);
    const targetShares = target?.targetShares || 0;
    const sharesToSell = Math.max(current.shares - targetShares, 0);
    if (sharesToSell <= 0) continue;

    const price = target?.candidate.screenerResult.lastPrice ?? current.currentPrice;
    const grossAmount = Number((sharesToSell * price).toFixed(2));
    const fees = calculateFees(grossAmount);
    const avgCostPerShare = current.shares > 0 ? current.costBasis / current.shares : current.currentPrice;
    const realizedPnl = Number((grossAmount - fees - avgCostPerShare * sharesToSell).toFixed(2));
    const remainingShares = current.shares - sharesToSell;
    const remainingCostBasis = Number((avgCostPerShare * remainingShares).toFixed(2));
    const currentWeight = Number(current.liveWeight.toFixed(4));
    const targetWeight = Number((target?.targetWeight || 0).toFixed(4));
    const action = target ? 'TRIM' : 'EXIT';

    cash = Number((cash + grossAmount - fees).toFixed(2));
    actions.push({
      symbol: current.symbol,
      instrument: current.instrument,
      action,
      currentWeight,
      targetWeight,
      currentShares: current.shares,
      targetShares,
      executedShares: sharesToSell,
      price,
      amount: grossAmount,
      fees,
      realizedPnl,
      reason: target ? `Trim toward target weight. ${buildReason(target.candidate)}` : 'Exit because the symbol is no longer in the constrained target set.',
      sourceScreen: target?.candidate.sourceScreen,
    });
    trades.push({
      id: createId('model_trade'),
      portfolioId: portfolio.id,
      positionId: current.id,
      symbol: current.symbol,
      instrument: current.instrument,
      side: 'SELL',
      action,
      executedAt: now,
      shares: sharesToSell,
      price,
      grossAmount,
      fees,
      netCashImpact: Number((grossAmount - fees).toFixed(2)),
      realizedPnl,
      regime: regimeName,
      sourceScreen: target?.candidate.sourceScreen ?? current.sourceScreen,
      reason: target ? `Trim toward target weight. ${buildReason(target.candidate)}` : 'Exit because the symbol is no longer in the constrained target set.',
    });

    if (remainingShares > 0) {
      const base = target
        ? buildCandidatePosition(portfolio.id, target.candidate, regimeName, now, current)
        : { ...current };
      workingMap.set(current.symbol, {
        ...base,
        shares: remainingShares,
        costBasis: remainingCostBasis,
        feesPaid: Number(((current.feesPaid || 0) + fees).toFixed(2)),
        realizedPnl: Number(((current.realizedPnl || 0) + realizedPnl).toFixed(2)),
        currentPrice: price,
        targetWeight,
        updatedAt: now,
      });
    } else {
      workingMap.delete(current.symbol);
    }
  }

  const underfilledSymbols: string[] = [];
  const orderedSelections = [...selections].sort((a, b) => b.targetWeight - a.targetWeight);

  for (const selection of orderedSelections) {
    const { candidate, targetWeight } = selection;
    const targetShares = selectionMap.get(candidate.symbol)?.targetShares || 0;
    if (targetShares <= 0) continue;

    const current = workingMap.get(candidate.symbol);
    const basePosition = buildCandidatePosition(portfolio.id, candidate, regimeName, now, current);
    const currentShares = current?.shares || 0;
    const desiredBuyShares = Math.max(targetShares - currentShares, 0);

    if (desiredBuyShares > 0) {
      const price = candidate.screenerResult.lastPrice;
      const maxAffordableShares = Math.max(0, Math.floor(cash / (price * (1 + MODEL_PORTFOLIO_EXECUTION.feeRate))));
      const executedShares = Math.min(desiredBuyShares, maxAffordableShares);

      if (executedShares > 0) {
        const grossAmount = Number((executedShares * price).toFixed(2));
        const fees = calculateFees(grossAmount);
        const totalCost = Number((grossAmount + fees).toFixed(2));
        cash = Number((cash - totalCost).toFixed(2));

        actions.push({
          symbol: candidate.symbol,
          instrument: candidate.instrument,
          action: 'BUY',
          currentWeight: Number((current?.liveWeight || 0).toFixed(4)),
          targetWeight: Number(targetWeight.toFixed(4)),
          currentShares,
          targetShares,
          executedShares,
          price,
          amount: grossAmount,
          fees,
          reason:
            executedShares < desiredBuyShares
              ? `${buildReason(candidate)} Partial fill in paper mode because available cash after costs was limited.`
              : buildReason(candidate),
          sourceScreen: candidate.sourceScreen,
        });
        trades.push({
          id: createId('model_trade'),
          portfolioId: portfolio.id,
          positionId: basePosition.id,
          symbol: candidate.symbol,
          instrument: candidate.instrument,
          side: 'BUY',
          action: 'BUY',
          executedAt: now,
          shares: executedShares,
          price,
          grossAmount,
          fees,
          netCashImpact: Number((-totalCost).toFixed(2)),
          realizedPnl: 0,
          regime: regimeName,
          sourceScreen: candidate.sourceScreen,
          reason:
            executedShares < desiredBuyShares
              ? `${buildReason(candidate)} Partial fill in paper mode because available cash after costs was limited.`
              : buildReason(candidate),
        });

        workingMap.set(candidate.symbol, {
          ...basePosition,
          shares: currentShares + executedShares,
          costBasis: Number(((current?.costBasis || 0) + totalCost).toFixed(2)),
          feesPaid: Number(((current?.feesPaid || 0) + fees).toFixed(2)),
          realizedPnl: current?.realizedPnl || 0,
          currentPrice: price,
          targetWeight: Number(targetWeight.toFixed(4)),
          updatedAt: now,
        });

        if (executedShares < desiredBuyShares) {
          underfilledSymbols.push(candidate.symbol);
        }
      } else {
        underfilledSymbols.push(candidate.symbol);
      }
    } else if (current) {
      workingMap.set(candidate.symbol, {
        ...basePosition,
        shares: current.shares,
        costBasis: current.costBasis,
        feesPaid: current.feesPaid,
        realizedPnl: current.realizedPnl,
        currentPrice: candidate.screenerResult.lastPrice,
        targetWeight: Number(targetWeight.toFixed(4)),
        updatedAt: now,
      });
    }
  }

  if (underfilledSymbols.length > 0) {
    notes.push(`Paper execution underfilled ${underfilledSymbols.length} buy${underfilledSymbols.length > 1 ? 's' : ''} because fees reduce available cash at the margin.`);
  }

  const nextPositions = Array.from(workingMap.values())
    .filter((position) => position.shares > 0)
    .sort((a, b) => b.targetWeight - a.targetWeight);
  const nav = Number((cash + nextPositions.reduce((sum, position) => sum + position.shares * position.currentPrice, 0)).toFixed(2));
  const decoratedPositions = decoratePositions(nextPositions, nav);

  return {
    nav,
    cash,
    positions: decoratedPositions,
    actions,
    trades,
    notes,
  } satisfies SimulationResult;
}

async function buildPortfolioContext(
  token: string,
  weightOptions: {
    asOf?: string;
    currentSymbols?: string[];
  } = {}
) {
  const runtime = await loadScreenerRuntime(token);
  const scoredScreens = await Promise.all(MODEL_PORTFOLIO_SCREEN_UNIVERSE.map((screen) => scoreScreen(runtime, screen)));
  const candidates = buildModelPortfolioCandidates(scoredScreens);
  const weightPlan = buildTargetWeights(candidates, runtime.regime.name, weightOptions);
  return {
    runtime,
    candidates,
    weightPlan,
  };
}

async function buildSummary(token: string, persistRebalance: boolean): Promise<ModelPortfolioSummary> {
  const now = nowIso();
  const storedDefinition = (await getModelPortfolioDefinition(MODEL_PORTFOLIO_ID)) || buildDefaultPortfolio(now);
  const resetTriggered = shouldResetPortfolio(storedDefinition);
  const portfolio = resetTriggered ? buildResetPortfolio(storedDefinition, now) : storedDefinition;
  const bookStartAt = portfolio.bookStartAt || now;

  if (resetTriggered) {
    await saveModelPortfolioDefinition(portfolio);
    await replaceModelPortfolioPositions(portfolio.id, []);
  }

  const storedPositions = await getModelPortfolioPositions(portfolio.id, bookStartAt);
  const history = await getModelPortfolioSnapshots(portfolio.id, MODEL_PORTFOLIO_HISTORY_LIMIT, bookStartAt);
  const rebalances = await getModelPortfolioRebalances(portfolio.id, MODEL_PORTFOLIO_REBALANCE_LOG_LIMIT, bookStartAt);
  const existingTrades = await getModelPortfolioTrades(portfolio.id, MODEL_PORTFOLIO_TRADE_LOG_LIMIT, bookStartAt);
  const { runtime, candidates } = await buildPortfolioContext(token, {
    asOf: now,
    currentSymbols: storedPositions.map((position) => position.symbol),
  });
  const marketEntryGate = buildMarketEntryGate({
    benchmarkCloses: runtime.benchmarkCloses,
    regimeName: runtime.regime.name,
    activationDate: portfolio.entryActivationDate,
    now,
  });
  const latestBySymbol = new Map(
    runtime.baseMetrics.map((metric) => [metric.symbol, { price: metric.lastPrice, dayChangePct: metric.dayChangePct }])
  );
  const policy = MODEL_PORTFOLIO_REGIME_POLICY[runtime.regime.name];
  const buildPlan = (targetGrossExposureOverride?: number) =>
    buildTargetWeights(candidates, runtime.regime.name, {
      asOf: now,
      currentSymbols: storedPositions.map((position) => position.symbol),
      targetGrossExposureOverride,
    });
  let weightPlan = buildPlan(marketEntryGate.qualified ? undefined : 0);
  const entryPolicyNotes = [...marketEntryGate.reasons];

  let livePositions = updatePositionLiveData(storedPositions, latestBySymbol);
  const effectivePersist = persistRebalance;

  const currentNav =
    livePositions.length > 0
      ? computeCurrentNav(portfolio, decoratePositions(livePositions, computeCurrentNav(portfolio, livePositions)))
      : portfolio.baseCapital;
  livePositions = decoratePositions(livePositions, currentNav);
  const workingPortfolio: ModelPortfolioDefinition = {
    ...portfolio,
    cash: livePositions.length > 0 ? portfolio.cash : portfolio.baseCapital,
  };

  let simulation = simulateRebalance({
    portfolio: workingPortfolio,
    currentPositions: livePositions,
    selections: weightPlan.selections,
    regimeName: runtime.regime.name,
    now,
  });

  if (
    weightPlan.targetGrossExposure > 0 &&
    weightPlan.optimizerDiagnostics.enabled &&
    weightPlan.optimizerDiagnostics.avgPairCorrelation > MODEL_PORTFOLIO_ENTRY_POLICY.maxAvgPairCorrelation
  ) {
    entryPolicyNotes.push(
      `Average pair correlation ${weightPlan.optimizerDiagnostics.avgPairCorrelation.toFixed(3)} exceeded the allowed ${MODEL_PORTFOLIO_ENTRY_POLICY.maxAvgPairCorrelation.toFixed(2)} cap, so the model stayed in cash.`
    );
    weightPlan = buildPlan(0);
    simulation = simulateRebalance({
      portfolio: workingPortfolio,
      currentPositions: livePositions,
      selections: weightPlan.selections,
      regimeName: runtime.regime.name,
      now,
    });
  }

  const projectedRiskMetrics = computePortfolioRiskMetrics(simulation.positions, history);
  if (weightPlan.targetGrossExposure > 0 && projectedRiskMetrics.var95Pct > MODEL_PORTFOLIO_FILTERS.liveVarLimitPct) {
    entryPolicyNotes.push(
      `Projected one-day VaR ${projectedRiskMetrics.var95Pct.toFixed(2)}% exceeded the ${MODEL_PORTFOLIO_FILTERS.liveVarLimitPct.toFixed(2)}% entry cap, so the model stayed in cash.`
    );
    weightPlan = buildPlan(0);
    simulation = simulateRebalance({
      portfolio: workingPortfolio,
      currentPositions: livePositions,
      selections: weightPlan.selections,
      regimeName: runtime.regime.name,
      now,
    });
  }

  let effectivePortfolio = workingPortfolio;
  let effectivePositions = livePositions;
  let effectiveSnapshot: ModelPortfolioSnapshot | null = history.length > 0 ? history[history.length - 1] : null;
  let rebalancePreview: ModelPortfolioRebalance | null = null;
  let tradesForSummary = existingTrades;
  let historyForSummary = history.slice(-MODEL_PORTFOLIO_HISTORY_LIMIT);

  if (effectivePersist) {
    effectivePortfolio = {
      ...workingPortfolio,
      cash: simulation.cash,
      lastComputedAt: now,
      lastRebalancedAt: now,
      updatedAt: now,
    };
    effectivePositions = simulation.positions;
    tradesForSummary = [...simulation.trades, ...existingTrades]
      .sort((a, b) => b.executedAt.localeCompare(a.executedAt))
      .slice(0, MODEL_PORTFOLIO_TRADE_LOG_LIMIT);

    const riskMetrics = computePortfolioRiskMetrics(effectivePositions, history);
    effectiveSnapshot = {
      id: createId('model_snapshot'),
      portfolioId: effectivePortfolio.id,
      asOf: now,
      nav: simulation.nav,
      cash: simulation.cash,
      grossExposure: Number((effectivePositions.reduce((sum, position) => sum + position.liveWeight, 0) * 100).toFixed(2)),
      netExposure: Number((effectivePositions.reduce((sum, position) => sum + position.liveWeight, 0) * 100).toFixed(2)),
      dayReturnPct: riskMetrics.dayReturnPct,
      drawdownPct: computeDrawdownPct(history, simulation.nav),
      var95Pct: riskMetrics.var95Pct,
      cvar95Pct: riskMetrics.cvar95Pct,
      weightedBeta: riskMetrics.weightedBeta,
      regime: runtime.regime.name,
      holdingsCount: effectivePositions.length,
    };
    rebalancePreview = {
      id: createId('model_rebalance'),
      portfolioId: effectivePortfolio.id,
      generatedAt: now,
      effectiveAt: now,
      regime: runtime.regime.name,
      targetGrossExposure: weightPlan.targetGrossExposure,
      targetCashWeight: weightPlan.targetCashWeight,
      actions: simulation.actions,
      notes: [
        `${effectivePositions.length} holdings selected from ${candidates.length} eligible candidates.`,
        `Current regime is ${runtime.regime.label} with ${(runtime.regime.confidence * 100).toFixed(0)}% confidence.`,
        `Market entry score is ${marketEntryGate.score.toFixed(2)} versus the ${marketEntryGate.threshold.toFixed(2)} threshold.`,
        `Paper fills recorded: ${simulation.trades.length}.`,
        weightPlan.optimizerDiagnostics.enabled
          ? `Optimizer refinement covered ${weightPlan.optimizerDiagnostics.coveragePct.toFixed(1)}% of selected names with average pair correlation ${weightPlan.optimizerDiagnostics.avgPairCorrelation.toFixed(3)}.`
          : 'Optimizer refinement was skipped because covariance coverage was not available for enough names.',
        ...entryPolicyNotes,
        ...simulation.notes,
      ],
    };

    await saveModelPortfolioDefinition(effectivePortfolio);
    await replaceModelPortfolioPositions(effectivePortfolio.id, effectivePositions);
    await appendModelPortfolioSnapshot(effectiveSnapshot, MODEL_PORTFOLIO_HISTORY_LIMIT);
    await appendModelPortfolioRebalance(rebalancePreview, MODEL_PORTFOLIO_REBALANCE_LOG_LIMIT);
    await appendModelPortfolioTrades(simulation.trades, MODEL_PORTFOLIO_TRADE_LOG_LIMIT);

    historyForSummary = [...history.slice(-(MODEL_PORTFOLIO_HISTORY_LIMIT - 1)), effectiveSnapshot];
  } else {
    const riskMetrics = computePortfolioRiskMetrics(livePositions, history);
    effectiveSnapshot = {
      id: history[history.length - 1]?.id || createId('model_snapshot_virtual'),
      portfolioId: workingPortfolio.id,
      asOf: now,
      nav: currentNav,
      cash: workingPortfolio.cash,
      grossExposure: Number((livePositions.reduce((sum, position) => sum + position.liveWeight, 0) * 100).toFixed(2)),
      netExposure: Number((livePositions.reduce((sum, position) => sum + position.liveWeight, 0) * 100).toFixed(2)),
      dayReturnPct: riskMetrics.dayReturnPct,
      drawdownPct: computeDrawdownPct(history, currentNav),
      var95Pct: riskMetrics.var95Pct,
      cvar95Pct: riskMetrics.cvar95Pct,
      weightedBeta: riskMetrics.weightedBeta,
      regime: runtime.regime.name,
      holdingsCount: livePositions.length,
    };
    rebalancePreview = {
      id: rebalances[0]?.id || createId('model_rebalance_preview'),
      portfolioId: workingPortfolio.id,
      generatedAt: now,
      effectiveAt: now,
      regime: runtime.regime.name,
      targetGrossExposure: weightPlan.targetGrossExposure,
      targetCashWeight: weightPlan.targetCashWeight,
      actions: simulation.actions,
      notes: [
        `${weightPlan.selections.length} holdings would be targeted if you recompute now.`,
        `Market entry score is ${marketEntryGate.score.toFixed(2)} versus the ${marketEntryGate.threshold.toFixed(2)} threshold.`,
        simulation.actions.length === 0
          ? 'Current holdings already align with the latest target weights.'
          : 'Preview only. Persist by recomputing the model portfolio.',
        ...entryPolicyNotes,
        ...simulation.notes,
      ],
    };
  }

  const metrics = computePortfolioPaperMetrics(
    effectivePositions,
    tradesForSummary,
    effectiveSnapshot?.nav || effectivePortfolio.baseCapital,
    now
  );

  const notes = [...MODEL_PORTFOLIO_NOTES];
  if (resetTriggered) {
    notes.push(
      `Portfolio book was reset to cash at INR ${MODEL_PORTFOLIO_BASE_CAPITAL.toLocaleString('en-IN')} and will only allow fresh entries from ${portfolio.entryActivationDate} IST onward.`
    );
  }
  notes.push(
    `Locked entry policy: High confidence only, no Low Sample support, score >= ${MODEL_PORTFOLIO_FILTERS.minPortfolioScore}, positive residual alpha, positive factor alpha, trend alignment, market entry score gate, and no fresh entries during risk-off regimes.`
  );
  if (effectiveSnapshot.var95Pct > MODEL_PORTFOLIO_FILTERS.liveVarLimitPct) {
    notes.push(
      `Warning: historical one-day VaR is ${effectiveSnapshot.var95Pct.toFixed(2)}%, above the current soft limit of ${MODEL_PORTFOLIO_FILTERS.liveVarLimitPct.toFixed(2)}%.`
    );
  }
  if (metrics.driftPct > 3) {
    notes.push(`Weight drift is ${metrics.driftPct.toFixed(2)} percentage points, so a recompute would materially rebalance the paper book.`);
  }
  if (weightPlan.optimizerDiagnostics.enabled) {
    notes.push(
      `Optimizer refinement is active with ${weightPlan.optimizerDiagnostics.coveragePct.toFixed(1)}% covariance coverage and average pair correlation ${weightPlan.optimizerDiagnostics.avgPairCorrelation.toFixed(3)}.`
    );
  }
  notes.push(
    `Market entry score components: momentum ${marketEntryGate.momentumSignal.toFixed(2)}, volatility ${marketEntryGate.volatilitySignal.toFixed(2)}, drawdown ${marketEntryGate.drawdownSignal.toFixed(2)}.`
  );
  if (entryPolicyNotes.length > 0) {
    notes.push(...entryPolicyNotes);
  }

  return {
    portfolio: effectivePortfolio,
    snapshot: effectiveSnapshot,
    regime: {
      name: runtime.regime.name,
      label: runtime.regime.label,
      confidence: runtime.regime.confidence,
      targetGrossExposure: policy.targetGrossExposure,
      targetCashWeight: policy.targetCashWeight,
      targetPositionsMin: policy.targetPositionsMin,
      targetPositionsMax: policy.targetPositionsMax,
      maxSingleNameWeight: policy.maxSingleNameWeight,
    },
    holdings: effectivePositions.sort((a, b) => b.targetWeight - a.targetWeight),
    topCandidates: candidates.slice(0, 12),
    rebalancePreview,
    history: historyForSummary,
    recentTrades: tradesForSummary.slice(0, 12),
    metrics,
    notes,
  };
}

export async function getModelPortfolioSummary(token: string) {
  return buildSummary(token, false);
}

export async function recomputeModelPortfolio(token: string) {
  return buildSummary(token, true);
}
