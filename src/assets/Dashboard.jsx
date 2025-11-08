import React, { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import { supabase } from "./supabaseClient"; // adjust path if your client file is elsewhere

// Simple reusable dashboard card
const DashboardCard = ({ title, value }) => (
  <div className="p-6 rounded-2xl shadow-lg transition-all duration-300 transform hover:scale-105 backdrop-blur-md bg-white/10 border border-white/20 text-white">
    <h3 className="text-sm font-semibold opacity-75">{title}</h3>
    <p className="text-3xl font-bold mt-2 truncate">{value}</p>
  </div>
);

/**
 * Dashboard.jsx
 *
 * Props kept compatible with previous component call sites.
 * - userId: string (required to fetch user trades)
 * - userSettings: object (optional, used only for display)
 * - capital: number (starting capital)
 * - fmt2: function to format numbers (e.g. (v) => v.toFixed(2))
 *
 * The component will:
 * - try to fetch trades from Supabase by userId
 * - if fetching fails, fallback to a read-only local cache: localStorage.getItem(`dashboard_${userId}`)
 * - never write or modify trades offline
 * - compute derived stats and chart data from fetched trades
 */
export default function Dashboard({
  userId,
  userSettings,
  capital = 0,
  fmt2 = (v) => Number(v || 0).toFixed(2),
  // Keep these props in signature so parent calls still work; they will be ignored
  dashboardStats: incomingDashboardStats,
  equityChartData: incomingEquityData,
  pairFrequencyData: incomingPairFreq,
  pairProfitabilityData: incomingPairProfit,
  sessionFrequencyData: incomingSessionFreq,
  sessionProfitabilityData: incomingSessionProfit,
  dayFrequencyData: incomingDayFreq,
  dayProfitabilityData: incomingDayProfit,
  transactionsData: incomingTransactions,
}) {
  // Local state for computed values
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);

  // computed derived states
  const [stats, setStats] = useState({
    totalTrades: 0,
    totalPnLCurrency: 0,
    currentEquity: capital,
    winRate: 0,
    lossRate: 0,
    breakevenRate: 0,
    mostProfitablePair: null,
    mostLosingPair: null,
    mostTradedPair: null,
    highestBreakevenPair: null,
  });
  const [equityData, setEquityData] = useState([]);
  const [pairFreq, setPairFreq] = useState([]);
  const [pairProfit, setPairProfit] = useState([]);
  const [sessionFreq, setSessionFreq] = useState([]);
  const [sessionProfit, setSessionProfit] = useState([]);
  const [dayFreq, setDayFreq] = useState([]);
  const [dayProfit, setDayProfit] = useState([]);
  const [transactions, setTransactions] = useState([]);

  const CACHE_KEY = userId ? `dashboard_${userId}` : null;

  // --- Helper utilities ---
  const groupBy = (arr, keyFn) => {
    return arr.reduce((acc, item) => {
      const k = keyFn(item);
      if (!acc[k]) acc[k] = [];
      acc[k].push(item);
      return acc;
    }, {});
  };

  const safeNum = (v) => (typeof v === "number" ? v : Number(v || 0));

  // --- Fetch trades (Supabase) with local fallback (read-only) ---
  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      let fetched = null;

      try {
        const { data, error } = await supabase
          .from("trades")
          .select("*")
          .eq("user_id", userId)
          .order("entry_date", { ascending: true });

        if (error) {
          console.warn("Dashboard: supabase fetch error", error);
        } else if (data && data.length > 0) {
          fetched = data;
          // Save local snapshot for offline viewing only
          try {
            localStorage.setItem(CACHE_KEY, JSON.stringify({ trades: data, lastSync: new Date().toISOString() }));
          } catch (err) {
            console.warn("Dashboard: failed to write cache", err);
          }
        }
      } catch (err) {
        console.warn("Dashboard: supabase request failed:", err);
      }

      // fallback to cache if fetch failed or returned no results
      if (!fetched) {
        try {
          const raw = CACHE_KEY ? localStorage.getItem(CACHE_KEY) : null;
          if (raw) {
            const parsed = JSON.parse(raw);
            fetched = parsed.trades || [];
            console.log("Dashboard: loaded trades from local cache (read-only).");
          } else {
            fetched = [];
          }
        } catch (err) {
          console.error("Dashboard: failed to read cache", err);
          fetched = [];
        }
      }

      if (!cancelled) {
        setTrades(fetched);
        setLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  // --- Compute stats & charts whenever trades or capital change ---
  useEffect(() => {
    // compute derived stats
    const closedTrades = trades.filter((t) => (t.status ? t.status === "closed" : (t.exit_date || t.exit_price || t.exitPrice)));
    const totalTrades = trades.length;
    const totalPnL = closedTrades.reduce((sum, t) => sum + safeNum(t.pnl_currency ?? t.pnlCurrency ?? 0), 0);
    const currentEquity = safeNum(capital) + totalPnL;

    const wins = closedTrades.filter((t) => {
      const val = safeNum(t.pnl_currency ?? t.pnlCurrency ?? 0);
      return val > 0;
    }).length;
    const losses = closedTrades.filter((t) => {
      const val = safeNum(t.pnl_currency ?? t.pnlCurrency ?? 0);
      return val < 0;
    }).length;
    const breakevens = closedTrades.filter((t) => {
      const val = safeNum(t.pnl_currency ?? t.pnlCurrency ?? 0);
      return val === 0;
    }).length;
    const closedCount = closedTrades.length || 1;
    const winRate = (wins / closedCount) * 100;
    const lossRate = (losses / closedCount) * 100;
    const breakevenRate = (breakevens / closedCount) * 100;

    // Pair aggregations
    const byPair = groupBy(closedTrades, (t) => (t.pair || t.pair?.toString() || "Unknown"));
    const pairFreqArr = Object.entries(byPair).map(([pair, items]) => ({
      pair,
      count: items.length,
      pnl: items.reduce((s, it) => s + safeNum(it.pnl_currency ?? it.pnlCurrency ?? 0), 0),
      avg: items.reduce((s, it) => s + safeNum(it.pnl_currency ?? it.pnlCurrency ?? 0), 0) / items.length,
    }));

    pairFreqArr.sort((a, b) => b.count - a.count);
    const pairProfitArr = [...pairFreqArr].sort((a, b) => b.pnl - a.pnl);

    // Session aggregations (session field might be null)
    const bySession = groupBy(closedTrades, (t) => (t.session || "Unknown"));
    const sessionFreqArr = Object.entries(bySession).map(([session, items]) => ({
      session,
      count: items.length,
      pnl: items.reduce((s, it) => s + safeNum(it.pnl_currency ?? it.pnlCurrency ?? 0), 0),
    }));
    sessionFreqArr.sort((a, b) => b.count - a.count);
    const sessionProfitArr = [...sessionFreqArr].sort((a, b) => b.pnl - a.pnl);

    // Day-of-week aggregations (using exit_date or entry_date)
    const byDay = groupBy(closedTrades, (t) => {
      const d = t.exit_date || t.exitDate || t.entry_date || t.entryDate;
      if (!d) return "Unknown";
      const dow = new Date(d).getDay(); // 0..6
      const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      return names[dow] || String(dow);
    });
    const dayFreqArr = Object.entries(byDay).map(([day, items]) => ({
      day,
      count: items.length,
      pnl: items.reduce((s, it) => s + safeNum(it.pnl_currency ?? it.pnlCurrency ?? 0), 0),
    }));
    const dayProfitArr = [...dayFreqArr].sort((a, b) => b.pnl - a.pnl);

    // Equity chart: cumulative equity points ordered by trade close date (or entry date)
    const sortedClosed = [...closedTrades].sort((a, b) => {
      const ad = new Date(a.exit_date || a.exitDate || a.entry_date || a.entryDate || 0).getTime();
      const bd = new Date(b.exit_date || b.exitDate || b.entry_date || b.entryDate || 0).getTime();
      return ad - bd;
    });

    let running = safeNum(capital);
    const equityChart = [{ label: "Start", equity: Number(running.toFixed(2)) }];

    sortedClosed.forEach((t, idx) => {
      const pnl = safeNum(t.pnl_currency ?? t.pnlCurrency ?? 0);
      running += pnl;
      equityChart.push({
        label:
          t.exit_date || t.exitDate
            ? new Date(t.exit_date || t.exitDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
            : `T${idx + 1}`,
        equity: Number(running.toFixed(2)),
        pnl,
      });
    });

    // Transactions: if you have transactions (deposits/withdrawals) in a separate table,
    // parent component can pass them via props; otherwise keep empty array.
    const txn = Array.isArray(incomingTransactions) ? incomingTransactions : [];

    // Find pair-level highlights
    const mostTraded = pairFreqArr.length ? pairFreqArr[0].pair : null;
    const mostProfitable = pairProfitArr.length ? pairProfitArr[0].pair : null;
    const mostLosing = pairProfitArr.length ? pairProfitArr[pairProfitArr.length - 1].pair : null;
    const highestBreakeven = pairFreqArr.length ? pairFreqArr.reduce((acc, p) => {
      // breakeven pairs = avg close near 0; measure absolute avg closest to 0 but >=0 maybe
      const absAvg = Math.abs(p.avg || 0);
      if (acc === null || absAvg < acc.abs) return { pair: p.pair, abs: absAvg };
      return acc;
    }, null) : null;

    // commit computed states
    setStats({
      totalTrades: totalTrades,
      totalPnLCurrency: totalPnL,
      currentEquity,
      winRate: Number(winRate.toFixed(2)),
      lossRate: Number(lossRate.toFixed(2)),
      breakevenRate: Number(breakevenRate.toFixed(2)),
      mostProfitablePair: mostProfitable,
      mostLosingPair: mostLosing,
      mostTradedPair: mostTraded,
      highestBreakevenPair: highestBreakeven ? highestBreakeven.pair : null,
    });

    setEquityData(equityChart);
    setPairFreq(pairFreqArr);
    setPairProfit(pairProfitArr);
    setSessionFreq(sessionFreqArr);
    setSessionProfit(sessionProfitArr);
    setDayFreq(dayFreqArr);
    setDayProfit(dayProfitArr);
    setTransactions(txn);
  }, [trades, capital]); // re-compute when trades or capital change

  // --- Render ---
  return (
    <div className="flex gap-6 max-w-7xl mx-auto py-8 text-gray-200">
      {/* Sidebar */}
      <div className="w-56 bg-gray-800 p-4 rounded-2xl border border-gray-700 flex flex-col space-y-2">
        {[
          { key: "overview", label: "Account Overview" },
          { key: "pairs", label: "Pair Statistics" },
          { key: "sessions", label: "Session Statistics" },
          { key: "transactions", label: "Transactions" },
        ].map((tab) => (
          <button
            key={tab.key}
            // the original kept an internal dashboardView state; keep simple tab switching inside this element
            onClick={() => {
              // update URL hash or focus logic could go here; for simplicity, use a shallow state change
              // We'll use a small local shim to store the last selected tab in sessionStorage
              sessionStorage.setItem("dashboard_view", tab.key);
              window.dispatchEvent(new Event("dashboard_view_change"));
            }}
            className={`text-left px-4 py-2 rounded-lg transition hover:bg-gray-700`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main Content */}
      <div className="flex-1 space-y-8">
        {/* OVERVIEW */}
        <div>
          {/* User Info */}
          <div className="flex flex-wrap items-center gap-6 text-sm text-gray-300">
            <span>
              User ID: <span className="font-mono break-all">{userId}</span>
            </span>

            {userSettings?.accountName && (
              <span>
                Account: <span className="font-semibold">{userSettings.accountName}</span>
              </span>
            )}

            <span>
              Capital: <span className="font-semibold">${fmt2(capital)}</span>
            </span>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-4">
            <DashboardCard title="Total Trades" value={stats.totalTrades ?? 0} />
            <DashboardCard
              title="Total PnL"
              value={`$${fmt2(stats.totalPnLCurrency ?? 0)}`}
            />
            <DashboardCard
              title="Current Equity"
              value={`$${fmt2(stats.currentEquity ?? capital)}`}
            />
            <DashboardCard title="Capital" value={`$${fmt2(capital)}`} />
          </div>

          {/* Progress + Pair Summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
            <div className="bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-700">
              <h3 className="text-lg font-semibold text-white mb-4">Progress</h3>
              <ul className="space-y-2">
                <li>
                  <span className="font-semibold">Win Rate%:</span>{" "}
                  {fmt2(stats.winRate)}%
                </li>
                <li>
                  <span className="font-semibold">Loss Rate%:</span>{" "}
                  {fmt2(stats.lossRate)}%
                </li>
                <li>
                  <span className="font-semibold">Breakeven Rate%:</span>{" "}
                  {fmt2(stats.breakevenRate)}%
                </li>
              </ul>
            </div>

            <div className="bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-700">
              <h3 className="text-lg font-semibold text-white mb-4">Pair Statistics</h3>
              <ul className="space-y-2">
                <li>
                  <span className="font-semibold">Most Profitable Pair:</span>{" "}
                  {stats.mostProfitablePair || "N/A"}
                </li>
                <li>
                  <span className="font-semibold">Most Losing:</span>{" "}
                  {stats.mostLosingPair || "N/A"}
                </li>
                <li>
                  <span className="font-semibold">Most Traded:</span>{" "}
                  {stats.mostTradedPair || "N/A"}
                </li>
                <li>
                  <span className="font-semibold">Highest Breakeven:</span>{" "}
                  {stats.highestBreakevenPair || "N/A"}
                </li>
              </ul>
            </div>
          </div>

          {/* Equity Growth Chart */}
          <div className="bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-700 mt-6">
            <h2 className="text-xl font-semibold mb-4 text-white">Weekly Equity Growth</h2>
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={equityData}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.5} />
                <XAxis dataKey="label" stroke="#ccc" />
                <YAxis
                  stroke="#ccc"
                  domain={["dataMin - 50", "dataMax + 50"]}
                  tickFormatter={(v) => `${v}`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "rgba(255, 255, 255, 0.06)",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    borderRadius: "10px",
                    color: "#fff",
                  }}
                />
                <ReferenceLine
                  y={capital}
                  stroke="#ff7300"
                  strokeDasharray="3 3"
                  label={{ position: "top", value: "Start", fill: "#ff7300" }}
                />
                <Line
                  type="monotone"
                  dataKey="equity"
                  stroke="#82ca9d"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* PAIRS */}
        <div className="space-y-8">
          <div className="bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-700">
            <h2 className="text-xl font-semibold text-white mb-4">Traded Pairs Frequency</h2>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart layout="vertical" data={[...pairFreq].sort((a,b)=>b.count-a.count)} margin={{ top: 20, right: 30, left: 50, bottom: 20 }}>
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
              <BarChart data={pairProfit} margin={{ top: 20, right: 30, left: 20, bottom: 50 }}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                <XAxis dataKey="pair" stroke="#ccc" angle={-45} textAnchor="end" interval={0} />
                <YAxis stroke="#ccc" />
                <Tooltip />
                <Bar dataKey="pnl" fill="#82ca9d">
                  {pairProfit.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.pnl >= 0 ? "#4ade80" : "#f87171"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* SESSIONS and DAY OF WEEK */}
        <div className="space-y-12">
          <div className="bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-700 space-y-8">
            <h2 className="text-xl font-semibold text-white mb-4">Session Statistics</h2>

            <div>
              <h3 className="text-lg font-semibold text-white mb-2">Trade Frequency by Session</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart layout="vertical" data={[...sessionFreq].sort((a,b)=>b.count-a.count)}>
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
                <BarChart data={sessionProfit}>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                  <XAxis dataKey="session" stroke="#ccc" />
                  <YAxis stroke="#ccc" />
                  <Tooltip />
                  <Bar dataKey="pnl">
                    {sessionProfit.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.pnl >= 0 ? "#4ade80" : "#f87171"} />
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
                <BarChart data={dayFreq}>
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
                <BarChart data={dayProfit}>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                  <XAxis dataKey="day" stroke="#ccc" />
                  <YAxis stroke="#ccc" />
                  <Tooltip />
                  <Bar dataKey="pnl">
                    {dayProfit.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.pnl >= 0 ? "#4ade80" : "#f87171"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* TRANSACTIONS */}
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
                {transactions.length > 0 ? (
                  transactions.map((txn, idx) => (
                    <tr key={idx}>
                      <td className="px-4 py-2">
                        {new Date(txn.date).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-2">{txn.type}</td>
                      <td className={`px-4 py-2 text-right font-semibold ${txn.amount >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {txn.amount >= 0 ? "+" : ""}${fmt2(txn.amount)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="3" className="text-center py-6 text-gray-400">No transactions found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
