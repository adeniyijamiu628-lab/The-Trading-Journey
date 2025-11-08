import React, { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import isBetween from "dayjs/plugin/isBetween";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore"; 
import isSameOrAfter from "dayjs/plugin/isSameOrAfter"; 
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie,
  Legend,
} from "recharts";
import { ArrowUpCircle, ArrowDownCircle, AlertTriangle, TrendingUp, DollarSign, Zap, RefreshCw, Percent, Calendar } from "lucide-react"; 

// 🛑 IMPORTANT: This path MUST be correct for your actual Supabase client file.
import { supabase } from './supabaseClient'; 

dayjs.extend(isoWeek);
dayjs.extend(isBetween);
dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);


/* ===========================
    Constants & Helpers
    =========================== */

const CACHE_TTL_MS = 1000 * 60 * 3; // 3 minutes cache
const cacheKeyFor = (userId, accountId) => `weekly_trades_cache:${userId}:${accountId}`;

const fmtMoney = (v) =>
  (typeof v === "number" ? v : Number(v || 0)).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const fmtPct = (v) =>
  `${(typeof v === "number" ? v : Number(v || 0)).toFixed(2)}%`;

// Helper: load + validate cache
function loadCache(userId, accountId) {
  try {
    const key = cacheKeyFor(userId, accountId);
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.fetchedAt || !parsed.data) return null;
    if (Date.now() - parsed.fetchedAt > CACHE_TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return parsed.data;
  } catch (e) {
    console.warn("weekly: cache load failed", e);
    return null;
  }
}
function saveCache(userId, accountId, data) {
  try {
    const key = cacheKeyFor(userId, accountId);
    const payload = { fetchedAt: Date.now(), data };
    localStorage.setItem(key, JSON.stringify(payload));
  } catch (e) {
    console.warn("weekly: cache save failed", e);
  }
}

function getWeekRange(weekOffset = 0) {
  const start = dayjs().startOf("isoWeek").add(weekOffset, "week");
  const end = start.endOf("isoWeek");
  return { start, end };
}

// Ensure numeric PnL fields and handle column name variants
function normalizeTrade(t) {
  return {
    ...t,
    entry_date: t.entry_date || t.entryDate || null, 
    exit_date: t.exit_date || t.exitDate || null,
    pnl_currency: t.pnl_currency !== undefined ? Number(t.pnl_currency) : Number(t.pnlCurrency || 0),
    pnl_percent: t.pnl_percent !== undefined ? Number(t.pnl_percent) : Number(t.pnlPercent || 0),
    value_per_pip: t.value_per_pip !== undefined ? Number(t.value_per_pip) : Number(t.valuePerPip || 0),
    lot_size: t.lot_size !== undefined ? Number(t.lot_size) : Number(t.lotSize || 0),
    risk: t.risk !== undefined ? Number(t.risk) : Number(t.risk || 0),
    status: t.status || "Valid", 
  };
}

// Custom Tooltip for Recharts
const CustomTooltip = ({ active, payload, label, unit = '' }) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-gray-700/80 backdrop-blur-sm p-3 rounded-lg shadow-lg border border-gray-600">
                <p className="text-sm font-semibold text-white mb-1">{label}</p>
                {payload.map((p, i) => (
                    <p key={i} className="text-xs" style={{ color: p.color }}>
                        {p.name}: {fmtMoney(p.value)} {unit}
                    </p>
                ))}
            </div>
        );
    }
    return null;
};

// Custom Label for Pie Chart
const RADIAN = Math.PI / 180;
const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }) => {
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.cos(-midAngle * RADIAN); // Should use sin for y-axis

    if (percent * 100 < 5) return null; 

    return (
        <text 
            x={x} 
            y={y} 
            fill="white" 
            textAnchor={x > cx ? 'start' : 'end'} 
            dominantBaseline="central"
            className="text-xs font-semibold"
        >
            {`${name} (${(percent * 100).toFixed(0)}%)`}
        </text>
    );
};


/* ===========================
    Component
    =========================== */

export default function WeeklyReview({ userId, accountId, capital = 10000 }) {
  // --- UI / state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [rawTrades, setRawTrades] = useState([]); // all fetched trades (normalized)
  const [weekOffset, setWeekOffset] = useState(0); 
  const [refreshTick, setRefreshTick] = useState(0);

 // Load trades - CORRECTED TO USE REAL SUPABASE
  useEffect(() => {
    let mounted = true;
    const fetchTrades = async () => {
      
      if (!userId || !accountId) {
        console.warn("WeeklyReview: Skipping fetch. Missing userId or accountId. (Check parent component props)");
        setRawTrades([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);

      // Check for local cache first
      const cached = loadCache(userId, accountId);
      if (cached) {
        setRawTrades(cached.map(normalizeTrade));
        setLoading(false);
      }
      
      try {
        // 🛑 This is the correct Supabase fetch
        const { data, error: supaErr } = await supabase
          .from("trades")
          .select("*")
          .eq("user_id", userId)
          .eq("account_id", accountId)
          .order("entry_date", { ascending: true });

        if (supaErr) {
          if (mounted) setError(supaErr.message || "Supabase error");
          return;
        }
        
        const normalized = (data || []).map(normalizeTrade);
        if (mounted) {
          setRawTrades(normalized);
          saveCache(userId, accountId, normalized);
        }
      } catch (err) {
        if (mounted) setError(err.message || "Fetch error (Check supabaseClient import)");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchTrades();
    // Setup a short interval to re-fetch/cache bust
    const interval = setInterval(() => setRefreshTick((t) => t + 1), 1000 * 60 * 4); 
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [userId, accountId, refreshTick]);

  /* ===========================
      Filtering: Finds trades *entered* in the current week range
      =========================== */
  const { start: weekStart, end: weekEnd } = useMemo(() => {
    const r = getWeekRange(weekOffset);
    return { start: r.start.startOf("day"), end: r.end.endOf("day") };
  }, [weekOffset]);

const weeklyTrades = useMemo(() => {
    if (!rawTrades || !rawTrades.length) return [];
    
    const start = dayjs(weekStart);
    const end = dayjs(weekEnd);
    
    return rawTrades.filter((t) => {
      // Must have an entry date
      if (!t.entry_date) return false;
      
      const e = dayjs(t.entry_date);
      
      // Filter by the trade's entry date being within the week boundaries
      const isAfterStart = e.isSameOrAfter(start); 
      const isBeforeEnd = e.isSameOrBefore(end);

      return isAfterStart && isBeforeEnd; 
    });
 }, [rawTrades, weekStart, weekEnd]);

  /* ===========================
      Pre-computations for weekly analytics
      =========================== */

  const analytics = useMemo(() => {
    const trades = weeklyTrades || [];

    // totals
    const totalTrades = trades.length;
    const validCount = trades.filter((t) => (t.status || "Valid") === "Valid").length;
    const invalidCount = trades.filter((t) => (t.status || "Valid") === "Invalid").length;
    const breakevenCount = trades.filter((t) => Number(t.pnl_currency || 0) === 0).length;

    const totalPnL = trades.reduce((s, t) => s + Number(t.pnl_currency || 0), 0);
    const totalPnLPercent = trades.reduce((s, t) => s + Number(t.pnl_percent || 0), 0);
    const PnLColor = totalPnL >= 0 ? "text-green-400" : "text-red-400";
    const PnLSign = totalPnL >= 0 ? "+" : "";

    // opening equity for the week:
    const priorClosed = rawTrades.filter((t) => t.entry_date && t.exit_date && dayjs(t.entry_date).isBefore(weekStart, "day"));
    const priorPnL = priorClosed.reduce((s, t) => s + Number(t.pnl_currency || 0), 0);
    const openingEquity = Number(capital || 0) + priorPnL;
    const closingEquity = openingEquity + totalPnL;

    // win/loss stats
    const wins = trades.filter((t) => Number(t.pnl_currency || 0) > 0).length;
    const losses = trades.filter((t) => Number(t.pnl_currency || 0) < 0).length;
    const winRate = totalTrades ? (wins / totalTrades) * 100 : 0;
    const lossRate = totalTrades ? (losses / totalTrades) * 100 : 0;

    // most profitable pair/session and most traded
    const pairMap = {};
    const sessionMap = {};
    const dowMap = {}; 
    trades.forEach((t) => {
      const pnl = Number(t.pnl_currency || 0);

      const pair = t.pair || "N/A";
      pairMap[pair] = pairMap[pair] || { pnl: 0, count: 0 };
      pairMap[pair].pnl += pnl;
      pairMap[pair].count += 1;

      const sess = t.session || "N/A";
      sessionMap[sess] = sessionMap[sess] || { pnl: 0, count: 0 };
      sessionMap[sess].pnl += pnl;
      sessionMap[sess].count += 1;

      const dow = dayjs(t.entry_date).format("ddd"); // Mon, Tue ...
      dowMap[dow] = dowMap[dow] || 0;
      dowMap[dow] += pnl;
    });

    const pairs = Object.keys(pairMap);
    const sessions = Object.keys(sessionMap);

    // Find extremes
    const mostProfitablePair = pairs.length ? pairs.reduce((a, b) => (pairMap[a].pnl > pairMap[b].pnl ? a : b)) : "—";
    const mostTradedPair = pairs.length ? pairs.reduce((a, b) => (pairMap[a].count > pairMap[b].count ? a : b)) : "—";
    const mostProfitableSession = sessions.length ? sessions.reduce((a, b) => (sessionMap[a].pnl > sessionMap[b].pnl ? a : b)) : "—";

    // day-of-week performance array sorted best -> worst (for chart)
    const dowArray = Object.entries(dowMap).map(([d, pnl]) => ({ day: d, pnl }));
    dowArray.sort((a, b) => b.pnl - a.pnl);

    // pair distribution (for pie/bar)
    const pairDistribution = pairs.map((p) => ({ name: p, value: pairMap[p].count, pnl: pairMap[p].pnl }));

    // session distribution (for pie/bar)
    const sessionDistribution = sessions.map((s) => ({ name: s, value: sessionMap[s].count, pnl: sessionMap[s].pnl }));

    // daily breakdown (entry_date grouped)
    const daily = {};
    trades.forEach((t) => {
      const key = dayjs(t.entry_date).format("YYYY-MM-DD");
      if (!daily[key]) daily[key] = { date: key, trades: 0, pnl: 0, wins: 0, losses: 0, breakeven: 0 };
      daily[key].trades += 1;
      const pnl = Number(t.pnl_currency || 0);
      daily[key].pnl += pnl;
      if (pnl > 0) daily[key].wins += 1;
      else if (pnl < 0) daily[key].losses += 1;
      else daily[key].breakeven += 1;
    });
    const dailyBreakdown = Object.values(daily).sort((a, b) => new Date(a.date) - new Date(b.date));

    // equity curve for the week (trade-by-trade)
    let running = openingEquity;
    const equityCurve = [{ label: "Start", equity: Number(running.toFixed(2)), pnl: 0 }];
    trades
      .slice()
      .sort((a, b) => new Date(a.entry_date) - new Date(b.entry_date))
      .forEach((t, i) => {
        running += Number(t.pnl_currency || 0);
        equityCurve.push({
          label: `${dayjs(t.entry_date).format("ddd D")}`,
          equity: Number(running.toFixed(2)),
          pnl: Number(t.pnl_currency || 0),
        });
      });

    // daily risk used
    const dailyRiskMap = {};
    trades.forEach((t) => {
      const k = dayjs(t.entry_date).format("YYYY-MM-DD");
      const riskPct = Number(t.risk || 0); // risk stored as percent like 2.0
      if (!dailyRiskMap[k]) dailyRiskMap[k] = 0;
      dailyRiskMap[k] += riskPct;
    });
    const dailyRiskArray = Object.entries(dailyRiskMap).map(([date, sumRisk]) => ({
      date,
      usedPercent: Number(sumRisk),
      dayName: dayjs(date).format("ddd"),
    }));
    dailyRiskArray.sort((a, b) => new Date(a.date) - new Date(b.date));


    return {
      totalTrades,
      validCount,
      invalidCount,
      breakevenCount,
      totalPnL,
      totalPnLPercent,
      PnLColor,
      PnLSign,
      openingEquity,
      closingEquity,
      wins,
      losses,
      winRate,
      lossRate,
      mostProfitablePair,
      mostTradedPair,
      mostProfitableSession,
      dowArray,
      pairDistribution,
      sessionDistribution,
      dailyBreakdown,
      equityCurve,
      dailyRiskArray,
    };
  }, [weeklyTrades, rawTrades, capital]);

  /* ===========================
      Render / UI
      =========================== */

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900 text-cyan-400">
        <svg className="animate-spin h-5 w-5 mr-3" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        Loading Weekly Review Data...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center bg-gray-900 text-red-400">
        <p className="font-semibold text-lg mb-2">Error loading weekly review:</p> {error}
        <p className="text-sm mt-4">If the error mentions the Supabase client, double-check the path in the import statement.</p>
      </div>
    );
  }

  const a = analytics;

  // Custom function to create a stylish card
  const StatCard = ({ title, value, subValue, colorClass = 'text-white' }) => (
    <div className="bg-gray-800 p-5 rounded-2xl shadow-xl border border-gray-700/50 transition duration-300 hover:border-cyan-500/50">
      <div className="text-sm font-medium text-gray-400 mb-1">{title}</div>
      <div className={`text-3xl font-extrabold ${colorClass}`}>
        {value}
      </div>
      {subValue && (
        <div className="text-xs text-gray-500 mt-1">{subValue}</div>
      )}
    </div>
  );
  
  // Chart Colors (for the Pie/Bar charts with multiple categories)
  const CHART_COLORS = [
    '#0ea5e9', // Sky Blue
    '#f59e0b', // Amber
    '#a855f7', // Violet
    '#10b981', // Emerald
    '#ef4444', // Red
    '#f472b6', // Pink
    '#6b7280', // Slate
  ];

  return (
    <div className="min-h-screen bg-gray-900 text-white font-inter">
        <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-10">
            
            {/* --- Header and Navigation --- */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between space-y-4 sm:space-y-0 pb-4 border-b border-gray-700/50">
                <div>
                    <h1 className="text-3xl font-extrabold text-cyan-400">Weekly Trading Analysis</h1>
                    <p className="text-base text-gray-400 pt-1">
                        Review period: <span className="font-semibold text-white">{dayjs(weekStart).format("DD MMM YYYY")}</span> —{" "}
                        <span className="font-semibold text-white">{dayjs(weekEnd).format("DD MMM YYYY")}</span>
                    </p>
                </div>

                <div className="flex items-center space-x-3">
                    <button
                        className="p-2.5 bg-gray-700 text-gray-300 rounded-lg shadow-md hover:bg-gray-600 transition duration-150"
                        onClick={() => setWeekOffset((w) => w - 1)}
                        aria-label="Previous Week"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path></svg>
                    </button>
                    <button
                        className="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg shadow-lg hover:bg-indigo-500 transition duration-150"
                        onClick={() => {
                            setWeekOffset(0);
                            setRefreshTick((t) => t + 1); // force refresh
                        }}
                    >
                        Current Week
                    </button>
                    <button
                        className="p-2.5 bg-gray-700 text-gray-300 rounded-lg shadow-md hover:bg-gray-600 transition duration-150"
                        onClick={() => setWeekOffset((w) => w + 1)}
                        aria-label="Next Week"
                        disabled={weekOffset >= 0}
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
                    </button>
                </div>
            </div>

            {/* --- Key Metrics / P&L Summary --- */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
                <StatCard 
                    title="Starting Equity" 
                    value={`$${fmtMoney(a.openingEquity)}`} 
                    colorClass="text-gray-300"
                />
                <StatCard 
                    title="Ending Equity" 
                    value={`$${fmtMoney(a.closingEquity)}`} 
                    colorClass="text-gray-300"
                />
                <StatCard 
                    title="Net P&L (Currency)" 
                    value={`${a.PnLSign}$${fmtMoney(a.totalPnL)}`} 
                    subValue={fmtPct(a.totalPnLPercent)}
                    colorClass={a.PnLColor}
                />
                <StatCard 
                    title="Total Trades" 
                    value={a.totalTrades} 
                    subValue={`${a.wins} Wins / ${a.losses} Losses`}
                />
                <StatCard 
                    title="Win Rate" 
                    value={fmtPct(a.winRate)} 
                    subValue={`${fmtPct(a.lossRate)} Loss Rate`}
                    colorClass={a.winRate >= 50 ? "text-green-400" : "text-amber-400"}
                />
                <StatCard 
                    title="Status Ratio" 
                    value={`${a.validCount} / ${a.invalidCount}`} 
                    subValue="Valid / Invalid Trades"
                    colorClass={a.invalidCount === 0 ? "text-green-400" : "text-red-400"}
                />
            </div>

            {/* --- Section 2: Charts (Equity, Risk, PnL by Day) --- */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Daily Risk Used (%) */}
                <div className="lg:col-span-1 bg-gray-800 p-6 rounded-2xl shadow-xl border border-gray-700/50">
                    <h4 className="text-xl font-semibold text-white mb-4">Daily Risk Used (%)</h4>
                    {a.dailyRiskArray.length === 0 ? (
                        <div className="text-gray-400 h-40 flex items-center justify-center">No risk data recorded.</div>
                    ) : (
                        <ResponsiveContainer width="100%" height={280}>
                            <BarChart data={a.dailyRiskArray} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                                <XAxis dataKey="dayName" stroke="#9ca3af" axisLine={false} tickLine={false} />
                                <YAxis stroke="#9ca3af" domain={[0, 'dataMax + 1']} />
                                <Tooltip formatter={(v) => `${v.toFixed(2)}%`} labelFormatter={(l) => dayjs(l).format("ddd, MMM D")} content={<CustomTooltip unit='%' />} />
                                <Bar dataKey="usedPercent" radius={[10, 10, 0, 0]}>
                                    {a.dailyRiskArray.map((d, i) => (
                                        <Cell key={i} fill={d.usedPercent > 2.0 ? "#f87171" : "#38bdf8"} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </div>

                {/* Weekly Equity Growth */}
                <div className="lg:col-span-2 bg-gray-800 p-6 rounded-2xl shadow-xl border border-gray-700/50">
                    <h4 className="text-xl font-semibold text-white mb-4">Weekly Equity Growth (Trade-by-Trade)</h4>
                    {a.equityCurve.length <= 1 ? (
                        <div className="text-gray-400 h-80 flex items-center justify-center">Insufficient data to draw equity curve.</div>
                    ) : (
                        <div style={{ width: "100%", height: 320 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={a.equityCurve} margin={{ top: 15, right: 10, left: -20, bottom: 5 }}>
                                    <defs>
                                        <linearGradient id="colorEquity" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.8}/>
                                            <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                    <XAxis dataKey="label" stroke="#9ca3af" />
                                    <YAxis 
                                        stroke="#9ca3af" 
                                        tickFormatter={(v) => `$${fmtMoney(v)}`} 
                                        domain={['dataMin - 100', 'dataMax + 100']}
                                    />
                                    <Tooltip 
                                        content={<CustomTooltip unit='$' />} 
                                        labelFormatter={(l) => l === "Start" ? "Start of Week" : `Trade on ${l}`}
                                    />
                                    <Line 
                                        type="monotone" 
                                        dataKey="equity" 
                                        stroke="#06b6d4" 
                                        strokeWidth={4} 
                                        dot={{ r: 4, fill: '#06b6d4' }} 
                                        activeDot={{ r: 6, fill: '#fff', stroke: '#06b6d4' }} 
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>

            </div>

            {/* --- Section 3: Distribution and Performance Analysis --- */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Day Performance P&L */}
                <div className="bg-gray-800 p-6 rounded-2xl shadow-xl border border-gray-700/50">
                    <h4 className="text-xl font-semibold text-white mb-4">P&L by Day (Best to Worst)</h4>
                    {a.dowArray.length === 0 ? (
                        <div className="text-gray-400 h-64 flex items-center justify-center">No daily P&L data.</div>
                    ) : (
                        <ResponsiveContainer width="100%" height={260}>
                            <BarChart data={a.dowArray} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                                <XAxis dataKey="day" stroke="#9ca3af" />
                                <YAxis stroke="#9ca3af" tickFormatter={(v) => `$${v}`} />
                                <Tooltip formatter={(v) => `$${fmtMoney(v)}`} content={<CustomTooltip unit='$' />} />
                                <Bar dataKey="pnl" radius={[10, 10, 0, 0]}>
                                    {a.dowArray.map((d, i) => (
                                        <Cell key={i} fill={d.pnl >= 0 ? "#34d399" : "#f87171"} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </div>

                {/* Pair Distribution (Pie) */}
                <div className="bg-gray-800 p-6 rounded-2xl shadow-xl border border-gray-700/50">
                    <h4 className="text-xl font-semibold text-white mb-4">Trade Distribution by Pair</h4>
                    {a.pairDistribution.length === 0 ? (
                        <div className="text-gray-400 h-64 flex items-center justify-center">No pair distribution data.</div>
                    ) : (
                        <ResponsiveContainer width="100%" height={260}>
                            <PieChart>
                                <Pie
                                    data={a.pairDistribution}
                                    dataKey="value"
                                    nameKey="name"
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={40}
                                    outerRadius={80}
                                    fill="#8884d8"
                                    labelLine={false}
                                    label={renderCustomizedLabel}
                                >
                                    {a.pairDistribution.map((entry, idx) => (
                                        <Cell key={`cell-${idx}`} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                                    ))}
                                </Pie>
                                <Legend layout="vertical" align="right" verticalAlign="middle" wrapperStyle={{ paddingLeft: '20px' }} />
                                <Tooltip formatter={(v, name, payload) => [`${payload.payload.value} trades`, `$${fmtMoney(payload.payload.pnl)} P&L`]} />
                            </PieChart>
                        </ResponsiveContainer>
                    )}
                </div>
                
                {/* Session Distribution (Bar) */}
                <div className="bg-gray-800 p-6 rounded-2xl shadow-xl border border-gray-700/50">
                    <h4 className="text-xl font-semibold text-white mb-4">Trade Distribution by Session</h4>
                    {a.sessionDistribution.length === 0 ? (
                        <div className="text-gray-400 h-64 flex items-center justify-center">No session data.</div>
                    ) : (
                        <ResponsiveContainer width="100%" height={260}>
                            <BarChart data={a.sessionDistribution} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
                                <XAxis type="number" stroke="#9ca3af" />
                                <YAxis type="category" dataKey="name" stroke="#9ca3af" axisLine={false} tickLine={false} />
                                <Tooltip formatter={(v, name, payload) => [`${payload.payload.value} trades`, `$${fmtMoney(payload.payload.pnl)} P&L`]} />
                                <Bar dataKey="value" fill="#fbbf24" radius={[0, 10, 10, 0]}>
                                    {a.sessionDistribution.map((d, i) => (
                                        <Cell key={i} fill={d.pnl >= 0 ? "#818cf8" : "#f59e0b"} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </div>
            </div>

            {/* --- Section 4: Detailed Daily Breakdown Table --- */}
            <div className="bg-gray-800 p-6 rounded-2xl shadow-xl border border-gray-700/50">
                <h4 className="text-xl font-semibold text-white mb-4">Detailed Daily Performance</h4>
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm text-left border-collapse">
                        <thead className="bg-gray-700/50 text-gray-300 uppercase">
                            <tr>
                                <th className="px-4 py-3 rounded-tl-xl">Date</th>
                                <th className="px-4 py-3 text-center">Trades</th>
                                <th className="px-4 py-3 text-center text-green-400">Wins</th>
                                <th className="px-4 py-3 text-center text-red-400">Losses</th>
                                <th className="px-4 py-3 text-center">Breakeven</th>
                                <th className="px-4 py-3 text-right">Net P&L ($)</th>
                                <th className="px-4 py-3 text-right rounded-tr-xl">P&L (%)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                            {a.dailyBreakdown.length === 0 ? (
                                <tr><td colSpan="7" className="py-8 text-center text-gray-400">No trades recorded for this week.</td></tr>
                            ) : (
                                a.dailyBreakdown.map((d, index) => {
                                    const pct = (d.pnl / (capital || 1)) * 100;
                                    const rowClass = index % 2 === 0 ? "bg-gray-800" : "bg-gray-700/30";
                                    return (
                                        <tr key={d.date} className={`${rowClass} hover:bg-gray-700 transition duration-100 text-gray-200`}>
                                            <td className="px-4 py-3 font-medium">{dayjs(d.date).format('ddd, MMM D')}</td>
                                            <td className="px-4 py-3 text-center">{d.trades}</td>
                                            <td className="px-4 py-3 text-center text-green-400">{d.wins}</td>
                                            <td className="px-4 py-3 text-center text-red-400">{d.losses}</td>
                                            <td className="px-4 py-3 text-center text-gray-400">{d.breakeven}</td>
                                            <td className="px-4 py-3 text-right" style={{ color: d.pnl >= 0 ? '#34d399' : '#f87171' }}>{d.pnl >= 0 ? '+' : ''}${fmtMoney(d.pnl)}</td>
                                            <td className="px-4 py-3 text-right">{fmtPct(pct)}</td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* --- Section 5: Key Takeaways/Tips --- */}
            <div className="pt-6">
                <h4 className="text-2xl font-bold text-cyan-400 mb-4">Key Takeaways from This Week</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-gray-800 p-5 rounded-xl shadow-lg border border-gray-700/50">
                        <p className="text-gray-400 text-sm mb-1">Most Profitable:</p>
                        <p className="text-lg font-semibold text-green-400">{a.mostProfitablePair} Pair</p>
                        <p className="text-lg font-semibold text-green-400">{a.mostProfitableSession} Session</p>
                    </div>
                    <div className="bg-gray-800 p-5 rounded-xl shadow-lg border border-gray-700/50">
                        <p className="text-gray-400 text-sm mb-1">Highest Activity:</p>
                        <p className="text-lg font-semibold">{a.mostTradedPair} Pair (Most Traded)</p>
                        <p className="text-lg font-semibold">{a.dailyRiskArray.length > 0 ? a.dailyRiskArray[a.dailyRiskArray.length - 1].dayName : 'N/A'} (Highest Risk Day)</p>
                    </div>
                    <div className="bg-gray-800 p-5 rounded-xl shadow-lg border border-gray-700/50">
                        <p className="text-gray-400 text-sm mb-1">Action Point:</p>
                        <p className="text-lg font-semibold text-amber-400">{a.invalidCount > 0 ? `Review ${a.invalidCount} Invalid Trades!` : 'Great Job on Trade Status!'}</p>
                    </div>
                </div>
            </div>

        </div>
    </div>
  );
}