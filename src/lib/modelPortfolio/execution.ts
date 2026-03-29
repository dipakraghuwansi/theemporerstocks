import {
  MODEL_PORTFOLIO_EXECUTION,
  MODEL_PORTFOLIO_EXECUTION_LOG_LIMIT,
  MODEL_PORTFOLIO_ID,
} from '@/lib/modelPortfolio/config';
import {
  appendModelPortfolioExecution,
  getModelPortfolioDefinition,
  getModelPortfolioExecutions,
  getModelPortfolioRebalances,
  getModelPortfolioTrades,
} from '@/lib/modelPortfolio/store';
import {
  ModelPortfolioExecution,
  ModelPortfolioExecutionOrder,
  ModelPortfolioRebalance,
  ModelPortfolioRebalanceAction,
  ModelPortfolioTrade,
} from '@/lib/modelPortfolio/types';

type ActionableRebalanceAction = ModelPortfolioRebalanceAction & {
  action: 'BUY' | 'TRIM' | 'EXIT';
};

function createId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function parseInstrument(instrument: string) {
  const [exchange, tradingsymbol] = instrument.split(':');
  if (!exchange || !tradingsymbol) {
    throw new Error(`Invalid instrument format '${instrument}'. Expected EXCHANGE:SYMBOL.`);
  }

  return { exchange, tradingsymbol };
}

function buildTradeMatchKey(action: ActionableRebalanceAction) {
  return [
    action.symbol,
    action.action,
    action.executedShares,
    Number(action.price.toFixed(2)),
    Number(action.amount.toFixed(2)),
  ].join('|');
}

function groupTradesForRebalance(trades: ModelPortfolioTrade[], rebalance: ModelPortfolioRebalance) {
  const grouped = new Map<string, ModelPortfolioTrade[]>();
  const rebalanceTimestamp = rebalance.effectiveAt || rebalance.generatedAt;

  for (const trade of trades) {
    if (trade.executedAt !== rebalanceTimestamp) continue;

    const action = trade.action === 'BUY' ? 'BUY' : trade.action === 'TRIM' ? 'TRIM' : 'EXIT';
    const key = [
      trade.symbol,
      action,
      trade.shares,
      Number(trade.price.toFixed(2)),
      Number(trade.grossAmount.toFixed(2)),
    ].join('|');

    const existing = grouped.get(key) || [];
    existing.push(trade);
    grouped.set(key, existing);
  }

  return grouped;
}

function buildExecutionOrders(rebalance: ModelPortfolioRebalance, trades: ModelPortfolioTrade[]) {
  const actionableActions = rebalance.actions.filter(
    (action): action is ActionableRebalanceAction => action.action !== 'HOLD' && action.executedShares > 0
  );
  const groupedTrades = groupTradesForRebalance(trades, rebalance);

  return actionableActions.map((action) => {
    const { exchange, tradingsymbol } = parseInstrument(action.instrument);
    const matchKey = buildTradeMatchKey(action);
    const matchingTrades = groupedTrades.get(matchKey) || [];
    const matchedTrade = matchingTrades.shift();

    if (matchingTrades.length === 0) {
      groupedTrades.delete(matchKey);
    } else {
      groupedTrades.set(matchKey, matchingTrades);
    }

    return {
      id: createId('model_execution_order'),
      symbol: action.symbol,
      instrument: action.instrument,
      action: action.action,
      transactionType: action.action === 'BUY' ? 'BUY' : 'SELL',
      exchange,
      tradingsymbol,
      quantity: action.executedShares,
      orderType: 'MARKET',
      product: 'CNC',
      status: matchedTrade ? 'RECORDED' : 'FAILED',
      paperTradeId: matchedTrade?.id,
      amount: action.amount,
      reason: action.reason,
      error: matchedTrade ? undefined : 'No matching paper trade was found in MongoDB for this rebalance action.',
    } satisfies ModelPortfolioExecutionOrder;
  });
}

function summarizeExecutionStatus(orders: ModelPortfolioExecutionOrder[]) {
  const recorded = orders.filter((order) => order.status === 'RECORDED').length;
  const failed = orders.filter((order) => order.status === 'FAILED').length;
  const skipped = 0;

  if (recorded > 0 && failed === 0 && skipped === 0) return 'RECORDED';
  if (recorded > 0) return 'PARTIAL';
  if (failed > 0) return 'FAILED';
  return 'BLOCKED';
}

export async function getModelPortfolioExecutionConfig() {
  const portfolio = await getModelPortfolioDefinition(MODEL_PORTFOLIO_ID);
  const bookStartAt = portfolio?.bookStartAt;
  const [rebalance] = await getModelPortfolioRebalances(MODEL_PORTFOLIO_ID, 1, bookStartAt);
  const actionableActions =
    rebalance?.actions.filter(
      (action): action is ActionableRebalanceAction => action.action !== 'HOLD' && action.executedShares > 0
    ) || [];

  return {
    mode: MODEL_PORTFOLIO_EXECUTION.mode,
    persistence: MODEL_PORTFOLIO_EXECUTION.persistence,
    approvalPhrase: MODEL_PORTFOLIO_EXECUTION.approvalPhrase,
    latestRebalanceId: rebalance?.id || null,
    latestRebalanceGeneratedAt: rebalance?.generatedAt || null,
    latestRebalanceActionCount: actionableActions.length,
    latestRebalanceNotional: Number(actionableActions.reduce((sum, action) => sum + action.amount, 0).toFixed(2)),
  };
}

export async function listRecentModelPortfolioExecutions() {
  const portfolio = await getModelPortfolioDefinition(MODEL_PORTFOLIO_ID);
  return getModelPortfolioExecutions(MODEL_PORTFOLIO_ID, MODEL_PORTFOLIO_EXECUTION_LOG_LIMIT, portfolio?.bookStartAt);
}

export async function recordModelPortfolioPaperReview(params: { confirmationText: string }) {
  const normalizedPhrase = params.confirmationText.trim().toUpperCase();
  if (normalizedPhrase !== MODEL_PORTFOLIO_EXECUTION.approvalPhrase) {
    throw new Error(`Type '${MODEL_PORTFOLIO_EXECUTION.approvalPhrase}' to record the paper-review checkpoint.`);
  }

  const portfolio = await getModelPortfolioDefinition(MODEL_PORTFOLIO_ID);
  const bookStartAt = portfolio?.bookStartAt;
  const [rebalance] = await getModelPortfolioRebalances(MODEL_PORTFOLIO_ID, 1, bookStartAt);
  if (!rebalance) {
    throw new Error('Recompute the model portfolio first so there is a persisted paper rebalance to review.');
  }

  const actionableActions = rebalance.actions.filter(
    (action): action is ActionableRebalanceAction => action.action !== 'HOLD' && action.executedShares > 0
  );
  if (actionableActions.length === 0) {
    throw new Error('The latest persisted rebalance has no actionable paper trades to review.');
  }

  const trades = await getModelPortfolioTrades(
    MODEL_PORTFOLIO_ID,
    Math.max(MODEL_PORTFOLIO_EXECUTION_LOG_LIMIT, actionableActions.length * 4),
    bookStartAt
  );
  const orders = buildExecutionOrders(rebalance, trades);
  const recordedCount = orders.filter((order) => order.status === 'RECORDED').length;
  const failedCount = orders.filter((order) => order.status === 'FAILED').length;
  const skippedCount = 0;

  const approvedAt = nowIso();
  const execution: ModelPortfolioExecution = {
    id: createId('model_execution'),
    portfolioId: rebalance.portfolioId,
    rebalanceId: rebalance.id,
    createdAt: approvedAt,
    approvedAt,
    submittedBy: 'manual',
    confirmationText: normalizedPhrase,
    status: summarizeExecutionStatus(orders),
    mode: MODEL_PORTFOLIO_EXECUTION.mode,
    persistence: MODEL_PORTFOLIO_EXECUTION.persistence,
    actionCount: orders.length,
    recordedCount,
    failedCount,
    skippedCount,
    totalNotional: Number(orders.reduce((sum, order) => sum + order.amount, 0).toFixed(2)),
    notes: [
      `Manual review was recorded against persisted rebalance ${rebalance.id}.`,
      'This checkpoint never places live orders. Recompute Portfolio is the step that mutates the paper book in MongoDB.',
    ],
    orders,
  };

  if (execution.status === 'RECORDED') {
    execution.notes.push('All actionable rebalance rows matched saved paper trades in MongoDB.');
  } else if (execution.status === 'PARTIAL') {
    execution.notes.push('Some rebalance rows matched paper trades, while others need reconciliation.');
  } else if (execution.status === 'FAILED') {
    execution.notes.push('No matching paper trades were found for this rebalance. Review the trade ledger before trusting the audit trail.');
  }

  await appendModelPortfolioExecution(execution, MODEL_PORTFOLIO_EXECUTION_LOG_LIMIT);
  return execution;
}
