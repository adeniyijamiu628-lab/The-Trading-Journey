// src/pages/WeeklyReview.jsx
import React from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { ChevronLeft, ChevronRight, BarChart3 } from 'lucide-react';

// Helper component for Recharts Tooltip content customization
const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const equityValue = payload[0].value;
    return (
      <div className="p-2 bg-gray-900 border border-gray-700 rounded-lg shadow-lg text-sm text-white">
        <p className="font-semibold text-purple-400">{label}</p>
        <p className="text-sm mt-1">
          Equity: <span className="font-bold text-green-400">${equityValue.toFixed(2)}</span>
        </p>
      </div>
    );
  }
  return null;
};

// Helper function to format PnL for display with color
const formatPnl = (pnl) => {
    const amount = Number(pnl || 0);
    const colorClass = amount >= 0 ? 'text-green-400' : 'text-red-400';
    return (
        <span className={colorClass}>
            {amount >= 0 ? '+' : ''}${amount.toFixed(2)}
        </span>
    );
};


export default function WeeklyReview({
  selectedWeek = 1,
  setSelectedWeek = null,
  // weekData contains aggregate stats and the list of trades
  weekData = { trades: [], totalPnL: 0, startEquity: 0, endEquity: 0, winRate: 0.0, RtoR: 0.0 }, 
  // weeklyEquityData contains the data points for the equity curve
  weeklyEquityData = [], 
}) {
  
  const handlePrevWeek = () => {
    if (setSelectedWeek) setSelectedWeek((w) => Math.max(1, (w || 1) - 1));
  };

  const handleNextWeek = () => {
    if (setSelectedWeek) setSelectedWeek((w) => (w || 1) + 1);
  };
  
  const summary = weekData || {};
  const isPositive = summary.totalPnL >= 0;
  const pnlClass = isPositive ? 'text-green-400' : 'text-red-400';
  const data = weeklyEquityData.length > 0 ? weeklyEquityData : [{ label: 'Start', equity: summary.startEquity || 0 }];


  return (
    <div className="space-y-8 max-w-7xl mx-auto py-4">
      
      {/* Weekly Header and Navigation */}
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-extrabold text-white flex items-center gap-2">
            <BarChart3 className="text-purple-400" size={24} /> 
            Week <span className="text-purple-400">{selectedWeek}</span> Review
        </h2>
        <div className="flex gap-2">
          <button
            onClick={handlePrevWeek}
            disabled={selectedWeek <= 1}
            className="p-2 rounded-full bg-gray-700 hover:bg-gray-600 disabled:opacity-30 transition-colors text-white"
            title="Previous Week"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={handleNextWeek}
            className="p-2 rounded-full bg-gray-700 hover:bg-gray-600 transition-colors text-white"
            title="Next Week"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* --- Summary Cards --- */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <div className="bg-gray-800 p-5 rounded-xl shadow-md border border-gray-700">
          <p className="text-sm text-gray-400 font-medium">Net PnL</p>
          <p className={`text-2xl font-bold mt-1 ${pnlClass}`}>
            {formatPnl(summary.totalPnL)}
          </p>
        </div>
        <div className="bg-gray-800 p-5 rounded-xl shadow-md border border-gray-700">
          <p className="text-sm text-gray-400 font-medium">Trades</p>
          <p className="text-2xl font-bold mt-1 text-blue-400">
            {summary.trades.length}
          </p>
        </div>
        <div className="bg-gray-800 p-5 rounded-xl shadow-md border border-gray-700">
          <p className="text-sm text-gray-400 font-medium">Win Rate</p>
          <p className="text-2xl font-bold mt-1 text-green-400">
            {(summary.winRate * 100 || 0).toFixed(1)}%
          </p>
        </div>
        <div className="bg-gray-800 p-5 rounded-xl shadow-md border border-gray-700">
          <p className="text-sm text-gray-400 font-medium">R:R Ratio</p>
          <p className="text-2xl font-bold mt-1 text-yellow-400">
            {(summary.RtoR || 0).toFixed(2)}
          </p>
        </div>
      </div>
      
      {/* --- Equity Curve Chart --- */}
      <div className="bg-gray-800 p-6 rounded-2xl shadow-xl border border-gray-700">
        <h3 className="text-xl text-white font-bold mb-4">Weekly Equity Curve</h3>
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart 
                data={data}
                margin={{ top: 10, right: 30, left: 0, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" strokeOpacity={0.6} />
              <XAxis 
                dataKey="label" 
                stroke="#9CA3AF" 
                tick={{ fill: '#9CA3AF', fontSize: 12 }} 
                axisLine={false}
              />
              <YAxis 
                stroke="#9CA3AF" 
                tickFormatter={(value) => `$${value.toFixed(0)}`}
                tick={{ fill: '#9CA3AF', fontSize: 12 }} 
                domain={['auto', 'auto']}
              />
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="monotone"
                dataKey="equity"
                // Conditional stroke color based on overall weekly performance (startEquity to endEquity)
                stroke={summary.endEquity > summary.startEquity ? "#34D399" : "#F87171"} 
                strokeWidth={3}
                dot={{ stroke: isPositive ? '#34D399' : '#F87171', strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* --- Trades Table --- */}
      <div className="bg-gray-800 p-6 rounded-2xl shadow-xl border border-gray-700">
        <h4 className="text-xl text-white font-bold mb-4">Closed Trades this Week ({summary.trades.length})</h4>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm text-gray-300 border-collapse">
            <thead className="text-gray-400 border-b border-gray-700">
              <tr>
                <th className="px-3 py-3 font-semibold">Trade ID</th>
                <th className="px-3 py-3 font-semibold">Pair</th>
                <th className="px-3 py-3 font-semibold">Entry Time</th>
                <th className="px-3 py-3 font-semibold">Exit Time</th>
                <th className="px-3 py-3 font-semibold">PnL ($)</th>
              </tr>
            </thead>
            <tbody>
              {summary.trades.length > 0 ? (
                summary.trades.map((t, i) => (
                  <tr key={t.id || i} className="border-t border-gray-700 hover:bg-gray-700/50 transition-colors">
                    <td className="px-3 py-2 text-gray-400">{t.id?.substring(0, 8) || i + 1}</td>
                    <td className="px-3 py-2 font-medium text-white">{t.pair}</td>
                    <td className="px-3 py-2 text-xs">{new Date(t.entryTime).toLocaleDateString()}</td>
                    <td className="px-3 py-2 text-xs">{new Date(t.exitTime).toLocaleDateString()}</td>
                    <td className="px-3 py-2 font-semibold">
                      {formatPnl(t.pnlCurrency)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-gray-500 italic">
                    No closed trades found for Week {selectedWeek}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}