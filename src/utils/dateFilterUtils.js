// src/utils/dateFilterUtils.js

import { getWeekNumber } from './tradeUtils'; // Assuming getWeekNumber is imported from tradeUtils.js for week number calculation.

/**
 * Filters and groups trades into weeks based on the trade's exitDate.
 * * @param {Array<Object>} tradesHistory - Array of closed trade objects.
 * @returns {Array<Object>} An array of objects, each representing a week, 
 * sorted with the most recent week first.
 */
export function getTradesGroupedByWeek(tradesHistory = []) {
    const weeklyMap = new Map();

    tradesHistory.forEach(trade => {
        // We use exitDate for closed trades to determine which week they belong to.
        const date = trade.exitDate ? new Date(trade.exitDate) : new Date(trade.entryDate);
        
        // Ensure the date is valid and we only process closed trades with PnL
        if (isNaN(date) || trade.status !== 'closed') return;

        const year = date.getFullYear();
        // Uses the getWeekNumber utility (assumed to be from tradeUtils)
        const weekNum = getWeekNumber(date); 
        
        const weekKey = `${year}-${weekNum}`;

        if (!weeklyMap.has(weekKey)) {
            weeklyMap.set(weekKey, {
                id: weekKey,
                year: year,
                weekNumber: weekNum,
                trades: [],
                totalPnL: 0,
            });
        }

        const weekData = weeklyMap.get(weekKey);
        const pnl = Number(trade.pnlCurrency) || 0;

        weekData.trades.push(trade);
        weekData.totalPnL += pnl;
    });

    // Convert Map values to an array and sort by year/week descending (most recent first)
    return Array.from(weeklyMap.values()).sort((a, b) => {
        if (b.year !== a.year) {
            return b.year - a.year;
        }
        return b.weekNumber - a.weekNumber;
    });
}