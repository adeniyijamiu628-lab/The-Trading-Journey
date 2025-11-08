// src/utils/tradeUtils.js
// Utility helpers for trade and performance calculations

/**
 * Returns the current Forex session based on UTC hour.
 * London: 7–16, New York: 12–21, Tokyo: 0–9, Sydney: 21–6
 */
export function detectSession(date = new Date()) {
  const hour = date.getUTCHours();
  if (hour >= 7 && hour < 16) return 'London';
  if (hour >= 12 && hour < 21) return 'New York';
  if (hour >= 0 && hour < 9) return 'Tokyo';
  return 'Sydney';
}

/**
 * Get ISO week number (1–53)
 */
export function getWeekNumber(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

/**
 * Calculate profit/loss in currency
 * type: 'buy' or 'sell'
 */
export function calculatePnL(entry = 0, exit = 0, lotSize = 0, type = 'buy') {
  const diff = type.toLowerCase() === 'buy' ? exit - entry : entry - exit;
  return diff * lotSize * 10000;
}

/**
 * Build equity curve data for charts
 */
export function processEquityCurve(trades = [], startingCapital = 1000) {
  let equity = startingCapital;
  return trades.map((trade, i) => {
    const pnl = Number(trade.pnlCurrency) || 0;
    equity += pnl;
    return {
      index: i + 1,
      label: trade.exitDate || `Trade ${i + 1}`,
      equity,
    };
  });
}

/**
 * Aggregate PnL per pair for charting
 */
export function aggregatePnLByPair(trades = []) {
  const agg = {};
  trades.forEach(t => {
    const pair = t.pair || 'Unknown';
    agg[pair] = (agg[pair] || 0) + (Number(t.pnlCurrency) || 0);
  });
  return Object.entries(agg).map(([pair, pnl]) => ({ pair, pnl }));
}

/**
 * Aggregate count per session
 */
export function aggregateCountBySession(trades = []) {
  const agg = {};
  trades.forEach(t => {
    const session = t.session || 'Unknown';
    agg[session] = (agg[session] || 0) + 1;
  });
  return Object.entries(agg).map(([session, count]) => ({ session, count }));
}

/**
 * Compute total statistics
 */
export function computeDashboardStats(trades = [], capital = 1000) {
  const totalTrades = trades.length;
  const totalPnLCurrency = trades.reduce((sum, t) => sum + (Number(t.pnlCurrency) || 0), 0);
  const currentEquity = capital + totalPnLCurrency;
  return { totalTrades, totalPnLCurrency, currentEquity };
}
