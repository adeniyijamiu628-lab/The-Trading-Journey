// src/components/WeeklyReview.jsx
import React from "react";
import {
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import Modal from "./Modal";
function WeeklyReview({
  fmt2,
  capital,
  weekData,
  dailyBreakdown,
  weeklyDailyRiskData,
  riskDomain,
  selectedWeek,
  setSelectedWeek,
  getWeekRange,
  openDailyDetails,
  closeDailyDetails,
  dailyDetailsOpen,
  selectedDay,
  selectedDayTrades,
  setImagePreview,
}) {
  // --- Weekly Stats ---
  const weeklyPercent = weekData.startEquity
    ? ((weekData.endEquity - weekData.startEquity) / capital) * 100
    : 0;

  // --- Target and Drawdown Lines ---
  let drawdownLine;
  if (weekData.startEquity < capital) {
    drawdownLine = weekData.endEquity;
  } else {
    drawdownLine = weekData.startEquity * 0.9;
  }
  const targetLine =
    weekData.startEquity >= capital
      ? weekData.startEquity * 1.1
      : capital;

  // --- Weekly Equity Growth dataset ---
  let runningEquity = weekData.startEquity || 0;
  const startPoint = {
    tradeNo: 0,
    date: "",
    label: "Start",
    equity: Number(runningEquity.toFixed(2)),
    pnl: 0,
    target: targetLine,
    drawdown: drawdownLine,
  };

  const weeklyEquityData = [
    startPoint,
    ...[...weekData.trades]
      .sort((a, b) => new Date(a.entryDate) - new Date(b.entryDate))
      .map((trade, index) => {
        runningEquity += trade.pnlCurrency || 0;
        return {
          tradeNo: index + 1,
          date: new Date(trade.entryDate).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
          }),
          label: `${new Date(trade.entryDate).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
          })} #${index + 1}`,
          equity: Number(runningEquity.toFixed(2)),
          pnl: trade.pnlCurrency,
          target: targetLine,
          drawdown: drawdownLine,
        };
      }),
  ];

return (
  <div className="space-y-8 max-w-7xl mx-auto py-8 text-gray-200">
    {/* HEADER */}
    <div className="bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-700">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-2xl font-bold text-white">Weekly Review</h3>
        <div className="flex space-x-2">
          <button
            onClick={() => setSelectedWeek((w) => (w > 1 ? w - 1 : w))}
            className="px-4 py-2 bg-gradient-to-r from-gray-700 to-gray-600 text-white font-semibold rounded-lg shadow-md hover:from-gray-600 hover:to-gray-500 hover:shadow-lg transition-all duration-200"
          >
            &lt; Prev
          </button>

          <span className="text-lg font-semibold text-white px-4 py-2 rounded-full bg-gray-700 shadow-inner border border-gray-600">
            Week {selectedWeek} (
            {getWeekRange(selectedWeek, new Date().getFullYear()).start} -{" "}
            {getWeekRange(selectedWeek, new Date().getFullYear()).end})
          </span>

          <button
            onClick={() => setSelectedWeek((w) => (w < 52 ? w + 1 : w))}
            className="px-4 py-2 bg-gradient-to-r from-gray-700 to-gray-600 text-white font-semibold rounded-lg shadow-md hover:from-gray-600 hover:to-gray-500 hover:shadow-lg transition-all duration-200"
          >
            Next &gt;
          </button>
        </div>
      </div>

      {/* --- Grouped Weekly Stats --- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-6">
        {/* 📊 Equity & Performance */}
        <div className="space-y-4">
          <h4 className="text-lg font-bold text-white mb-2">Equity & Performance</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gray-700 p-4 rounded-xl shadow hover:bg-gray-600 transition">
              <h5 className="text-sm font-semibold opacity-75">Starting Equity</h5>
              <p className="text-xl font-bold mt-1">${fmt2(weekData.startEquity)}</p>
            </div>

            <div className="bg-gray-700 p-4 rounded-xl shadow hover:bg-gray-600 transition">
              <h5 className="text-sm font-semibold opacity-75">Total P&L</h5>
              <p
                className={`text-xl font-bold mt-1 ${
                  weekData.totalPnL >= 0 ? "text-green-400" : "text-red-400"
                }`}
              >
                ${fmt2(weekData.totalPnL)}
              </p>
            </div>

            <div className="bg-gray-700 p-4 rounded-xl shadow hover:bg-gray-600 transition">
              <h5 className="text-sm font-semibold opacity-75">Total Trades</h5>
              <p className="text-xl font-bold mt-1">{weekData.trades.length}</p>
            </div>

            <div className="bg-gray-700 p-4 rounded-xl shadow hover:bg-gray-600 transition col-span-1 md:col-span-2">
              <h5 className="text-sm font-semibold opacity-75">Weekly %</h5>
              <p
                className={`text-lg font-bold flex items-center space-x-1 ${
                  weeklyPercent >= 0 ? "text-green-400" : "text-red-500"
                }`}
              >
                {weeklyPercent >= 0 ? (
                  <>
                    <span>▲</span> <span>{fmt2(weeklyPercent)}%</span>
                  </>
                ) : (
                  <>
                    <span>▼</span>
                    <span>{fmt2(Math.abs(weeklyPercent))}%</span>
                  </>
                )}
              </p>
            </div>

            <div className="bg-gray-700 p-4 rounded-xl shadow hover:bg-gray-600 transition">
              <h5 className="text-sm font-semibold opacity-75">Ending Equity</h5>
              <p className="text-xl font-bold mt-1">${fmt2(weekData.endEquity)}</p>
            </div>
          </div>
        </div>

        {/* 💱 Pair Analysis */}
        <div className="space-y-4">
          <h4 className="text-lg font-bold text-white mb-2">Pair Analysis</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gray-700 p-4 rounded-xl shadow hover:bg-gray-600 transition">
              <h5 className="text-sm font-semibold opacity-75">Most Traded Pair</h5>
              <p className="text-xl font-bold mt-1">{weekData.mostTradedPair || "—"}</p>
            </div>

            <div className="bg-gray-700 p-4 rounded-xl shadow hover:bg-gray-600 transition">
              <h5 className="text-sm font-semibold opacity-75">Most Profitable Pair</h5>
              <p className="text-xl font-bold mt-1 text-green-400">
                {weekData.mostProfitablePair || "—"}
              </p>
            </div>

            <div className="bg-gray-700 p-4 rounded-xl shadow hover:bg-gray-600 transition">
              <h5 className="text-sm font-semibold opacity-75">Most Losing Pair</h5>
              <p className="text-xl font-bold mt-1 text-red-400">
                {weekData.mostLosingPair || "—"}
              </p>
            </div>

            <div className="bg-gray-700 p-4 rounded-xl shadow hover:bg-gray-600 transition">
              <h5 className="text-sm font-semibold opacity-75">Breakeven Pairs</h5>
              <p className="text-xl font-bold mt-1">
                {weekData.breakevenPairs?.length
                  ? weekData.breakevenPairs.join(", ")
                  : "—"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* --- Daily Breakdown --- */}
      <div className="mt-8">
        <h4 className="text-xl font-bold mb-4 text-white">Daily Breakdown</h4>
        {/* Keep your existing table + charts below unchanged */}
      </div>
    </div>

    {/* DAILY DETAILS (More) Modal */}
    <Modal
      isOpen={dailyDetailsOpen}
      onClose={closeDailyDetails}
      title={
        selectedDay
          ? `Trades for ${new Date(selectedDay).toLocaleDateString("en-GB")}`
          : "Day Trades"
      }
    >
      {/* Modal content remains same, but update Close button style */}
      <div className="flex justify-end mt-4">
        <button
          onClick={closeDailyDetails}
          className="px-4 py-2 bg-gradient-to-r from-gray-700 to-gray-600 text-white font-semibold rounded-lg shadow-md hover:from-gray-600 hover:to-gray-500 hover:shadow-lg transition-all duration-200"
        >
          Close
        </button>
      </div>
    </Modal>
  </div>
);

}
export default WeeklyReview;
