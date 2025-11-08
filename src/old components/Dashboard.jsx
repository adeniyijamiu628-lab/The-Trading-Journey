// src/components/Dashboard.jsx
import React from "react";
import PropTypes from "prop-types";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  ReferenceLine,
  BarChart,
  Bar,
  Cell,
} from "recharts";

/** Small reusable card used in the dashboard */
const DashboardCard = ({ title, value, color }) => (
  <div className="p-6 rounded-2xl shadow-lg transition-all duration-300 transform hover:scale-[1.02] bg-gray-800 border border-gray-700">
    <p className="text-sm font-medium text-gray-400 uppercase tracking-wider">{title}</p>
    <p className={`mt-1 text-3xl font-bold ${color || "text-white"}`}>{value}</p>
  </div>
);

export default function Dashboard({
  // View control
  dashboardView,
  setDashboardView,

  // User / account
  userId,
  userSettings,
  capital,

  // Helpers
  fmt2,

  // Stats / chart data (memoized in App.jsx)
  dashboardStats,
  equityChartData,
  pairFrequencyData,
  pairProfitabilityData,
  sessionFrequencyData,
  sessionProfitabilityData,
  dayFrequencyData,
  dayProfitabilityData,
  transactionsData,
}) {
  // fallback format helper if none provided
  const _fmt2 = fmt2 || ((n) => {
    if (n === null || n === undefined || isNaN(Number(n))) return "0.00";
    return Number(n).toFixed(2);
  });

  const DashboardCard = ({ title, value, icon: Icon, gradient }) => (
  <div className={`p-6 rounded-2xl shadow-lg transform hover:-translate-y-1 transition-all duration-300 ${gradient}`}>
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium opacity-80 uppercase tracking-wider">{title}</p>
        <p className="mt-2 text-3xl font-bold text-white">{value}</p>
      </div>
      {Icon && <Icon className="h-8 w-8 opacity-90" />}
    </div>
  </div>
);


  const stats = dashboardStats || {
    totalTrades: 0,
    totalPnLCurrency: 0,
    currentEquity: (capital || 0),
    winRate: 0,
    lossRate: 0,
    breakevenRate: 0,
    mostProfitablePair: "N/A",
    mostLosingPair: "N/A",
    mostTradedPair: "N/A",
    highestBreakevenPair: "N/A",
  };

  const safe = (arr) => Array.isArray(arr) ? arr : [];

  return (
    <div className="flex gap-6 max-w-7xl mx-auto py-8 text-gray-200">
      {/* Sidebar */}
      <div className="w-56 bg-gray-800 p-4 rounded-2xl border border-gray-700 flex flex-col space-y-2">
        <button
          className={`text-left px-4 py-2 rounded-lg transition ${
            dashboardView === "overview" ? "bg-blue-600 text-white font-semibold" : "hover:bg-gray-700"
          }`}
          onClick={() => setDashboardView("overview")}
        >
          Account Overview
        </button>

        <button
          className={`text-left px-4 py-2 rounded-lg transition ${
            dashboardView === "pairs" ? "bg-blue-600 text-white font-semibold" : "hover:bg-gray-700"
          }`}
          onClick={() => setDashboardView("pairs")}
        >
          Pair Statistics
        </button>

        <button
          className={`text-left px-4 py-2 rounded-lg transition ${
            dashboardView === "sessions" ? "bg-blue-600 text-white font-semibold" : "hover:bg-gray-700"
          }`}
          onClick={() => setDashboardView("sessions")}
        >
          Session Statistics
        </button>

        <button
          className={`text-left px-4 py-2 rounded-lg transition ${
            dashboardView === "transactions" ? "bg-blue-600 text-white font-semibold" : "hover:bg-gray-700"
          }`}
          onClick={() => setDashboardView("transactions")}
        >
          Transactions
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 space-y-8">
        {/* Overview */}
        {dashboardView === "overview" && (
          <>
            <div className="flex flex-wrap items-center gap-6 text-sm text-gray-300">
              <span>
                User ID: <span className="font-mono break-all">{userId ?? "—"}</span>
              </span>

              {userSettings?.accountName && (
                <span>
                  Account: <span className="font-semibold">{userSettings.accountName}</span>
                </span>
              )}

              {userSettings?.startingCapital != null && (
                <span>
                  Capital: <span className="font-semibold">${_fmt2(capital)}</span>
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <DashboardCard title="Total Trades" value={stats.totalTrades} gradient="bg-gradient-to-br from-blue-600 to-blue-400" />
<DashboardCard title="Total PnL" value={`$${_fmt2(stats.totalPnLCurrency)}`} gradient="bg-gradient-to-br from-green-600 to-green-400" />
<DashboardCard title="Current Equity" value={`$${_fmt2(stats.currentEquity)}`} gradient="bg-gradient-to-br from-purple-600 to-purple-400" />
<DashboardCard title="Capital" value={`$${_fmt2(capital)}`} gradient="bg-gradient-to-br from-yellow-500 to-yellow-300" />

            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-700">
                <h3 className="text-lg font-semibold text-white mb-4">Progress</h3>
                <ul className="space-y-2">
                  <li>
                    <span className="font-semibold">Win Rate%:</span> {_fmt2(stats.winRate)}%
                  </li>
                  <li>
                    <span className="font-semibold">Loss Rate%:</span> {_fmt2(stats.lossRate)}%
                  </li>
                  <li>
                    <span className="font-semibold">Breakeven Rate%:</span> {_fmt2(stats.breakevenRate)}%
                  </li>
                </ul>
              </div>

              <div className="bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-700">
                <h3 className="text-lg font-semibold text-white mb-4">Pair stat</h3>
                <ul className="space-y-2">
                  <li><span className="font-semibold">Most Profitable Pair:</span> {stats.mostProfitablePair || "N/A"}</li>
                  <li><span className="font-semibold">Most Losing:</span> {stats.mostLosingPair || "N/A"}</li>
                  <li><span className="font-semibold">Most Traded:</span> {stats.mostTradedPair || "N/A"}</li>
                  <li><span className="font-semibold">Highest Breakeven:</span> {stats.highestBreakevenPair || "N/A"}</li>
                </ul>
              </div>
            </div>

            <div className="bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-700">
              <h2 className="text-xl font-semibold mb-4 text-white">Weekly Equity Growth</h2>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={safe(equityChartData)}>
                  <defs>
                    <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#82ca9d" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#82ca9d" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.5} />
                  <XAxis dataKey="label" stroke="#ccc" />
                  <YAxis
                    stroke="#ccc"
                    domain={[dataMin => (dataMin == null ? 0 : Math.floor(dataMin - 50)), dataMax => (dataMax == null ? 0 : Math.ceil(dataMax + 50))]}
                    tickFormatter={(v) => `$${v}`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "rgba(255, 255, 255, 0.15)",
                      backdropFilter: "blur(10px)",
                      border: "1px solid rgba(255, 255, 255, 0.2)",
                      borderRadius: "10px",
                      color: "#fff",
                    }}
                  />
                  <ReferenceLine y={capital || 0} stroke="#ff7300" strokeDasharray="3 3" label={{ position: "top", value: "Start", fill: "#ff7300" }} />
                  <Line
                    type="monotone"
                    dataKey="equity"
                    stroke="#82ca9d"
                    strokeWidth={2}
                    dot={{ stroke: "#82ca9d", strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}

        {/* Pair statistics */}
        {dashboardView === "pairs" && (
          <div className="space-y-8">
            <div className="bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-700">
              <h2 className="text-xl font-semibold text-white mb-4">Traded Pairs Frequency</h2>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart layout="vertical" data={[...safe(pairFrequencyData)].sort((a, b) => b.count - a.count)} margin={{ top: 20, right: 30, left: 50, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                  <XAxis type="number" stroke="#ccc" />
                  <YAxis dataKey="pair" type="category" stroke="#ccc" />
                  <Tooltip />
                  <Bar dataKey="count" fill="#8884d8" barSize={25} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-700">
              <h2 className="text-xl font-semibold text-white mb-4">Profitability by Pair</h2>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={safe(pairProfitabilityData)} margin={{ top: 20, right: 30, left: 20, bottom: 50 }}>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                  <XAxis dataKey="pair" stroke="#ccc" angle={-45} textAnchor="end" interval={0} />
                  <YAxis stroke="#ccc" />
                  <Tooltip />
                  <Bar dataKey="pnl">
                    {safe(pairProfitabilityData).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry && entry.pnl >= 0 ? "#4ade80" : "#f87171"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Sessions & days */}
        {dashboardView === "sessions" && (
          <div className="space-y-12">
            <div className="bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-700 space-y-8">
              <h2 className="text-xl font-semibold text-white mb-4">Session Statistics</h2>

              <div>
                <h3 className="text-lg font-semibold text-white mb-2">Trade Frequency by Session</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart layout="vertical" data={[...safe(sessionFrequencyData)].sort((a, b) => b.count - a.count)}>
                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                    <XAxis type="number" stroke="#ccc" />
                    <YAxis dataKey="session" type="category" stroke="#ccc" />
                    <Tooltip />
                    <Bar dataKey="count" fill="#8884d8" barSize={25} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-white mb-2">Profitability by Session</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={safe(sessionProfitabilityData)}>
                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                    <XAxis dataKey="session" stroke="#ccc" />
                    <YAxis stroke="#ccc" />
                    <Tooltip />
                    <Bar dataKey="pnl">
                      {safe(sessionProfitabilityData).map((entry, index) => (
                        <Cell key={`cell-s-${index}`} fill={entry && entry.pnl >= 0 ? "#4ade80" : "#f87171"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-700 space-y-8">
              <h2 className="text-xl font-semibold text-white mb-4">Day of the Week Statistics</h2>

              <div>
                <h3 className="text-lg font-semibold text-white mb-2">Trade Frequency by Day</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={safe(dayFrequencyData)}>
                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                    <XAxis dataKey="day" stroke="#ccc" />
                    <YAxis stroke="#ccc" />
                    <Tooltip />
                    <Bar dataKey="count" fill="#8884d8" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-white mb-2">Profitability by Day</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={safe(dayProfitabilityData)}>
                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                    <XAxis dataKey="day" stroke="#ccc" />
                    <YAxis stroke="#ccc" />
                    <Tooltip />
                    <Bar dataKey="pnl">
                      {safe(dayProfitabilityData).map((entry, idx) => (
                        <Cell key={`cell-d-${idx}`} fill={entry && entry.pnl >= 0 ? "#4ade80" : "#f87171"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* Transactions */}
        {dashboardView === "transactions" && (
          <div className="bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-700">
            <h2 className="text-xl font-semibold mb-4 text-white">Transactions</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-700 text-sm">
                <thead>
                  <tr className="text-gray-400">
                    <th className="px-4 py-2 text-left">Date</th>
                    <th className="px-4 py-2 text-left">Type</th>
                    <th className="px-4 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {safe(transactionsData).length === 0 ? (
                    <tr><td colSpan={3} className="px-4 py-4 text-center text-gray-400">No transactions</td></tr>
                  ) : (
                    safe(transactionsData).map((txn, idx) => (
                      <tr key={idx}>
                        <td className="px-4 py-2">{txn?.date ? new Date(txn.date).toLocaleDateString() : "—"}</td>
                        <td className="px-4 py-2">{txn?.type ?? "—"}</td>
                        <td className={`px-4 py-2 text-right font-semibold ${txn?.amount >= 0 ? "text-green-400" : "text-red-400"}`}>
                          {txn?.amount >= 0 ? "+" : ""}
                          ${_fmt2(txn?.amount)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

Dashboard.propTypes = {
  dashboardView: PropTypes.string.isRequired,
  setDashboardView: PropTypes.func.isRequired,
  userId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  userSettings: PropTypes.object,
  capital: PropTypes.number,
  fmt2: PropTypes.func,
  dashboardStats: PropTypes.object,
  equityChartData: PropTypes.array,
  pairFrequencyData: PropTypes.array,
  pairProfitabilityData: PropTypes.array,
  sessionFrequencyData: PropTypes.array,
  sessionProfitabilityData: PropTypes.array,
  dayFrequencyData: PropTypes.array,
  dayProfitabilityData: PropTypes.array,
  transactionsData: PropTypes.array,
};

Dashboard.defaultProps = {
  userId: null,
  userSettings: {},
  capital: 0,
  fmt2: null,
  dashboardStats: null,
  equityChartData: [],
  pairFrequencyData: [],
  pairProfitabilityData: [],
  sessionFrequencyData: [],
  sessionProfitabilityData: [],
  dayFrequencyData: [],
  dayProfitabilityData: [],
  transactionsData: [],
};
