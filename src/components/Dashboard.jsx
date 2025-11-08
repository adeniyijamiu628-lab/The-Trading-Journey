import React, { useEffect, useState, useMemo } from "react";
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
import { supabase } from "./supabaseClient"; 
import { ArrowUpCircle, ArrowDownCircle, AlertTriangle, TrendingUp, DollarSign, Zap, RefreshCw, Percent, Calendar } from "lucide-react";

// --- Constants ---
const LOCAL_STORAGE_ACCOUNT_KEY = 'currentAccountId';
const getCacheKey = (accountId) => `dashboard_cache_${accountId}`;

// ------------------------------
// Helper Utilities
// ------------------------------

// Modernized Dashboard Card
const DashboardCard = ({ title, value, icon: Icon, colorClass = "text-purple-400", subValue = null }) => (
    <div className="p-5 rounded-xl shadow-lg bg-gray-800 border border-gray-700/50 text-white flex flex-col justify-between h-full">
        <div className="flex justify-between items-start">
            <h3 className="text-sm font-medium text-gray-400">{title}</h3>
            {Icon && <Icon size={20} className={colorClass} />}
        </div>
        <div className="mt-4">
            <p className="text-3xl font-bold truncate">{value}</p>
            {subValue && <p className="text-xs text-gray-500 mt-1">{subValue}</p>}
        </div>
    </div>
);

// Helper to safely parse numbers
const safeNum = (n) => {
    const num = Number(n);
    return isNaN(num) ? 0 : num;
};

// Helper for grouping data (used for charts)
const groupBy = (arr, keyFn) => {
    return arr.reduce((acc, item) => {
        const key = keyFn(item);
        if (!acc[key]) {
            acc[key] = [];
        }
        acc[key].push(item);
        return acc;
    }, {});
};

/**
 * Utility to get the current authenticated Supabase User ID.
 * The dashboard uses this to scope fetches, but relies on props for the account context.
 */
const getUserIdFromSupabase = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id || null;
}


// ------------------------------
// Main Component
// ------------------------------

// IMPORTANT: Now relies on accountId and capital props from the parent (App.jsx)
export default function Dashboard({ 
    accountId,      // The active account ID
    capital,        // The starting capital of the active account
    fmt2 = (v) => Number(v || 0).toFixed(2) 
}) {
    // Initial state set using props, falling back to 0/null if App hasn't loaded them yet
    const [trades, setTrades] = useState([]);
    const [transactions, setTransactions] = useState([]); 
    const [loading, setLoading] = useState(true);
    const [localUserId, setLocalUserId] = useState(null);
    const [dbCapital, setDbCapital] = useState(0);
    const [initialLoadComplete, setInitialLoadComplete] = useState(false); 

    // State for transaction modals
    const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
    const [isWithdrawalModalOpen, setIsWithdrawalModalOpen] = useState(false);

    // Computed analytics states
    const [stats, setStats] = useState({
        totalTrades: 0,
        totalPnLCurrency: 0,
        totalPnLPercent: 0, 
        currentEquity: safeNum(capital),
        winRate: 0,
        lossRate: 0,
        breakevenRate: 0,
        mostProfitablePair: null,
    });
    const [equityData, setEquityData] = useState([]);
    const [pairProfit, setPairProfit] = useState([]);
    const [dayProfit, setDayProfit] = useState([]);


    // --- Data Fetching (Supabase & Local Storage) ---

  const loadData = useMemo(() => async (currentAccountIdProp) => {
        if (!currentAccountIdProp) {
            setLoading(false);
            return;
        }

        const userId = await getUserIdFromSupabase();
        setLocalUserId(userId);

        if (!userId) {
            console.warn("Dashboard: Missing User context (User not logged in).");
            setLoading(false);
            return;
        }

        const cacheKey = getCacheKey(currentAccountIdProp);
        
        // 1. Initial Load from Local Cache for instant display
        try {
            const cachedData = JSON.parse(localStorage.getItem(cacheKey));
            if (cachedData && !initialLoadComplete) {
                console.log("Dashboard: Loaded data from local cache.");
                setTrades(cachedData.trades || []);
                setTransactions(cachedData.transactions || []);
                // If capital is cached, use it, otherwise rely on the prop/default
                setDbCapital(safeNum(cachedData.capital) || safeNum(capital));
            }
        } catch (err) {
            console.warn("Dashboard: Failed to read local cache.");
        }
        
        setLoading(true);

        // 2. Fetch Fresh Data from Supabase
        
        // --- MODIFICATION START: REMOVED REDUNDANT SUPABASE FETCH ---
        
        // **CRITICAL FIX**: Rely entirely on the 'capital' prop passed from App.jsx.
        // The fetch block has been removed. We use the prop directly for the base value.
        const finalCapital = safeNum(capital);
        setDbCapital(finalCapital); 
        
        // --- MODIFICATION END ---

        // --- Fetch Trade Data (Unchanged)
        const { data: tradesData } = await supabase
            .from("trades")
            // Fetch necessary fields for history (type is 'Buy/Sell') and analytics
            .select("pnl_currency, pair, entry_date, exit_date, note, type") 
            .eq("user_id", userId)
            .eq("account_id", currentAccountIdProp) 
            .order("entry_date", { ascending: true });
        
        setTrades(tradesData || []);

        // --- Fetch Transaction Data (Unchanged)
        const { data: txnData } = await supabase
            .from("transactions")
            // Fetch necessary fields for history (type is 'deposit/withdrawal')
            .select("date, type, amount, description") 
            .eq("user_id", userId)
            .eq("account_id", currentAccountIdProp) 
            .order("date", { ascending: false }); 
        
        setTransactions(txnData || []);

        // 3. Update Local Cache
        try {
            localStorage.setItem(cacheKey, JSON.stringify({ 
                trades: tradesData, 
                transactions: txnData,
                // **CRITICAL FIX**: Use the prop's value (finalCapital) for caching
                capital: finalCapital 
            }));
        } catch (err) {
            console.warn("Dashboard: Failed to write cache", err);
        }
        
        setLoading(false);
        setInitialLoadComplete(true);
    }, [accountId, capital, initialLoadComplete]);

    useEffect(() => {
        // Trigger load whenever the accountId prop changes
        loadData(accountId);
    }, [loadData, accountId]);


    // --- COMPUTED: Unified History (Trades + Transactions) ---
    const combinedHistory = useMemo(() => {
        if (!trades.length && !transactions.length) return [];
        
const tradeHistory = trades
    // Only include closed trades with non-zero PnL
    .filter((t) => (t.exit_date && safeNum(t.pnl_currency ?? 0) !== 0))
    .map(t => ({
        // Trade Type includes Buy/Sell + Pair name (e.g., 'Buy EUR/USD')
        type: `${t.type || 'Trade'} ${t.pair || 'Unknown'}`, 
        date: t.entry_date, // ✅ NOW USES ENTRY_DATE
        amount: safeNum(t.pnl_currency),
        description: t.note || 'Trade Profit/Loss',
        isTrade: true,
    }));

        // 2. Format Transactions (Deposit/Withdrawal)
        const transactionHistory = transactions.map(t => ({
            type: t.type, // 'deposit' or 'withdrawal'
            date: t.date,
            // Withdrawal amounts are negative in the combined history
            amount: safeNum(t.amount) * (t.type.toLowerCase() === 'withdrawal' ? -1 : 1),
            description: t.description || 'Account Transaction',
            isTrade: false,
        }));

        // 3. Merge and Sort by Date (latest first for table display)
        const merged = [...tradeHistory, ...transactionHistory];
        
        merged.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        
        return merged;

    }, [trades, transactions]);


    // --- Computation (Analytics) ---
    useEffect(() => {
        if (!accountId) return; // Wait for prop context

        const closedTrades = trades.filter((t) => (t.exit_date));
        const totalTrades = closedTrades.length; 
        
        const totalTradePnL = closedTrades.reduce((sum, t) => sum + safeNum(t.pnl_currency ?? 0), 0);
        
        const netTransactions = transactions.reduce((sum, t) => {
            const amount = safeNum(t.amount ?? 0);
            return sum + (t.type.toLowerCase() === 'deposit' ? amount : -amount);
        }, 0);
        
        // Equity = Starting Capital + Net Transactions + Total PnL
        const currentEquity = safeNum(dbCapital) + totalTradePnL;
        const originalStartingCapital = safeNum(dbCapital) - netTransactions;
        
        const totalPnLPercent = dbCapital > 0 ? (totalTradePnL / dbCapital) * 100 : 0;
        
        // Win/Loss/Break-even Rates (based on original logic)
        const wins = closedTrades.filter((t) => safeNum(t.pnl_currency ?? 0) > 0).length;
        const losses = closedTrades.filter((t) => safeNum(t.pnl_currency ?? 0) < 0).length;
        const breakevens = closedTrades.filter((t) => safeNum(t.pnl_currency ?? 0) === 0).length;
        const closedCount = closedTrades.length || 1;
        const winRate = (wins / closedCount) * 100;
        const lossRate = (losses / closedCount) * 100;
        const breakevenRate = (breakevens / closedCount) * 100;

        // Pair/Day aggregations (based on original logic)
        const byPair = groupBy(closedTrades, (t) => (t.pair || "Unknown"));
        const pairProfitArr = Object.entries(byPair).map(([pair, items]) => ({
            pair,
            count: items.length,
            pnl: items.reduce((s, it) => s + safeNum(it.pnl_currency ?? 0), 0),
        })).sort((a, b) => b.pnl - a.pnl);

        const dayOrder = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
        const byDay = groupBy(closedTrades, (t) => {
            const d = t.entry_date; 
            if (!d) return "Unknown";
            const dow = new Date(d).getDay();
            const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
            return names[dow] || String(dow);
        });
        const dayProfitArr = Object.entries(byDay).map(([day, items]) => ({
            day,
            count: items.length,
            pnl: items.reduce((s, it) => s + safeNum(it.pnl_currency ?? 0), 0),
        })).sort((a, b) => dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day));


        // Equity chart data: Combine ALL movements and sort by date ascending
        let runningEquity = originalStartingCapital;
        const equityChart = [{ label: "Start", equity: Number(runningEquity.toFixed(2)) }];

        const allMovements = [...combinedHistory].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        
        allMovements.forEach((m) => {
            runningEquity += m.amount;
            equityChart.push({
                label: m.date ? new Date(m.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : 'T',
                equity: Number(runningEquity.toFixed(2)),
            });
        });
        
        const mostProfitable = pairProfitArr.length ? pairProfitArr[0].pair : null;

        setStats({
            totalTrades: totalTrades,
            totalPnLCurrency: totalTradePnL,
            totalPnLPercent: Number(totalPnLPercent.toFixed(2)),
            currentEquity,
            winRate: Number(winRate.toFixed(2)),
            lossRate: Number(lossRate.toFixed(2)),
            breakevenRate: Number(breakevenRate.toFixed(2)),
            mostProfitablePair: mostProfitable,
        });

        setEquityData(equityChart);
        setPairProfit(pairProfitArr);
        setDayProfit(dayProfitArr);
    }, [trades, transactions, dbCapital, accountId, combinedHistory]); 


    if (loading && !initialLoadComplete) {
        return (
            <div className="text-white text-center py-20 bg-gray-900 min-h-screen">
                <p className="text-xl flex items-center justify-center gap-2"><RefreshCw className="animate-spin" size={20} /> Loading Analytics...</p>
            </div>
        );
    }

    // --- No Context State ---
    if (!accountId) {
        return (
            <div className="p-4 md:p-8 space-y-8 bg-gray-900 min-h-screen">
                <h1 className="text-4xl font-extrabold text-white">Dashboard Analytics</h1>
                <div className="bg-red-900/50 border border-red-700 p-6 rounded-xl text-white flex flex-col items-center justify-center gap-4 min-h-[300px]">
                    <AlertTriangle size={36} className="text-red-400" />
                    <p className="text-xl font-semibold">No Active Account Context.</p>
                    <p className="text-gray-300 text-center">
                        The main application needs to provide the active account ID to load data.
                    </p>
                </div>
            </div>
        );
    }
    
    // --- No Data State (Account is selected, but no trades/capital exist) ---
    const hasData = trades.length > 0 || transactions.length > 0 || dbCapital > 0;
    
    if (!hasData) {
        return (
            <div className="p-4 md:p-8 space-y-8 bg-gray-900 min-h-screen">
                <h1 className="text-4xl font-extrabold text-white">Dashboard Analytics</h1>
                <div className="bg-blue-900/50 border border-blue-700 p-6 rounded-xl text-white flex flex-col items-center justify-center gap-4 min-h-[300px]">
                    <AlertTriangle size={36} className="text-blue-400" />
                    <p className="text-xl font-semibold">Dashboard Ready, Awaiting Data.</p>
                    <p className="text-gray-300 text-center">
                        The dashboard is linked to the active account ({accountId?.substring(0, 8)}...). No trades or transactions have been recorded yet. 
                        Start logging a trade or make a deposit to see analytics here!
                    </p>
                </div>
            </div>
        );
    }


    // --- Main Render ---
    return (
        <div className="p-4 md:p-8 space-y-8 bg-gray-900 min-h-screen">
            <h1 className="text-4xl font-extrabold text-white">
                Dashboard Analytics (Account: {accountId?.substring(0, 8)}...)
            </h1>
            
            {/* --- Main Equity and Performance Row --- */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                <DashboardCard 
                    title="Current Equity" 
                    value={`$${fmt2(stats.currentEquity)}`} 
                    icon={DollarSign} 
                    colorClass="text-green-400"
                    subValue={`Starting Capital: $${fmt2(dbCapital)}`}
                />
                <DashboardCard 
                    title="Total Trade PnL" 
                    value={`${stats.totalPnLCurrency >= 0 ? '+' : ''}$${fmt2(stats.totalPnLCurrency)}`} 
                    icon={TrendingUp} 
                    colorClass={stats.totalPnLCurrency >= 0 ? "text-green-400" : "text-red-400"}
                    subValue={`Total Trades: ${stats.totalTrades}`}
                />
                <DashboardCard 
                    title="PnL % of Capital" 
                    value={`${stats.totalPnLPercent >= 0 ? '+' : ''}${fmt2(stats.totalPnLPercent)}%`} 
                    icon={Percent} 
                    colorClass={stats.totalPnLCurrency >= 0 ? "text-green-400" : "text-red-400"}
                    subValue={`Equity vs. Capital`}
                />
                <DashboardCard 
                    title="Win Rate" 
                    value={`${stats.winRate}%`} 
                    icon={Zap} 
                    colorClass="text-yellow-400"
                    subValue={`Based on ${stats.totalTrades} closed trades`}
                />
                <DashboardCard 
                    title="Most Profitable Pair" 
                    value={stats.mostProfitablePair || 'N/A'} 
                    icon={TrendingUp} 
                    colorClass="text-blue-400"
                    subValue={stats.mostProfitablePair ? `PnL: $${fmt2(pairProfit.find(p => p.pair === stats.mostProfitablePair)?.pnl)}` : 'N/A'}
                />
            </div>

            {/* --- Charts and Detailed Analysis Section --- */}
            <div className="grid grid-cols-12 gap-6">
                
                {/* Equity Curve Chart */}
                <section className="col-span-12 lg:col-span-8 p-6 bg-gray-800 rounded-2xl shadow-xl border border-gray-700/50 h-[400px]">
                    <h2 className="text-xl font-semibold mb-4 text-white">Cumulative Equity Curve</h2>
                    <ResponsiveContainer width="100%" height="90%">
                        <LineChart data={equityData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                            <XAxis dataKey="label" stroke="#9ca3af" tickFormatter={(label, index) => index === 0 ? label : label} />
                            <YAxis domain={['auto', 'auto']} stroke="#9ca3af" tickFormatter={(value) => `$${fmt2(value)}`} />
                            <Tooltip
                                contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #4b5563", borderRadius: "8px" }}
                                labelFormatter={(label) => `Date: ${label}`}
                                formatter={(value, name) => [`$${fmt2(value)}`, name]}
                            />
                            <Line type="monotone" dataKey="equity" stroke="#a78bfa" strokeWidth={2} dot={false} />
                            <ReferenceLine y={dbCapital} stroke="#f87171" strokeDasharray="3 3" label={{ position: 'top', value: 'Capital', fill: '#f87171', fontSize: 12 }} />
                        </LineChart>
                    </ResponsiveContainer>
                </section>

                {/* Trade Distribution/Rate Summary */}
                <section className="col-span-12 lg:col-span-4 p-6 bg-gray-800 rounded-2xl shadow-xl border border-gray-700/50 h-[400px]">
                    <h2 className="text-xl font-semibold mb-4 text-white">Trade Distribution</h2>
                    <div className="space-y-6 pt-8">
                        <div className="text-center">
                            <p className="text-5xl font-extrabold text-green-400">{stats.winRate}%</p>
                            <p className="text-sm text-gray-400">Winning Trades</p>
                        </div>

                        <div className="w-full bg-gray-700 rounded-full h-4 flex overflow-hidden">
                            <div className="bg-green-500 h-4" style={{ width: `${stats.winRate}%` }}></div>
                            <div className="bg-red-500 h-4" style={{ width: `${stats.lossRate}%` }}></div>
                            <div className="bg-yellow-500 h-4" style={{ width: `${stats.breakevenRate}%` }}></div>
                        </div>

                        <div className="flex justify-between text-sm font-medium pt-4">
                            <div className="text-center">
                                <span className="text-green-400">Wins</span>
                                <p className="text-white">{Math.round(stats.totalTrades * (stats.winRate / 100))}</p>
                            </div>
                            <div className="text-center">
                                <span className="text-red-400">Losses</span>
                                <p className="text-white">{Math.round(stats.totalTrades * (stats.lossRate / 100))}</p>
                            </div>
                            <div className="text-center">
                                <span className="text-yellow-400">BE</span>
                                <p className="text-white">{Math.round(stats.totalTrades * (stats.breakevenRate / 100))}</p>
                            </div>
                        </div>
                    </div>
                </section>
                
                {/* Pair Profitability Chart */}
                <section className="col-span-12 lg:col-span-6 p-6 bg-gray-800 rounded-2xl shadow-xl border border-gray-700/50 h-[350px]">
                    <h2 className="text-xl font-semibold mb-4 text-white">Pair Profitability (Top 8)</h2>
                    <ResponsiveContainer width="100%" height="90%">
                        <BarChart data={pairProfit.slice(0, 8)} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                            <XAxis type="number" stroke="#9ca3af" tickFormatter={(value) => `$${fmt2(value)}`} />
                            <YAxis dataKey="pair" type="category" stroke="#9ca3af" axisLine={false} tickLine={false} />
                            <Tooltip
                                contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #4b5563", borderRadius: "8px" }}
                                formatter={(value) => [`$${fmt2(value)}`, 'Total PnL']}
                            />
                            <Bar dataKey="pnl">
                                {pairProfit.slice(0, 8).map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.pnl >= 0 ? "#10b981" : "#ef4444"} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </section>
                
                {/* Day-of-Week Profitability Chart */}
                <section className="col-span-12 lg:col-span-6 p-6 bg-gray-800 rounded-2xl shadow-xl border border-gray-700/50 h-[350px]">
                    <h2 className="text-xl font-semibold mb-4 text-white">Day of Week Performance</h2>
                    <ResponsiveContainer width="100%" height="90%">
                        <BarChart data={dayProfit} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                            <XAxis dataKey="day" stroke="#9ca3af" />
                            <YAxis stroke="#9ca3af" tickFormatter={(value) => `$${fmt2(value)}`} />
                            <Tooltip
                                contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #4b5563", borderRadius: "8px" }}
                                formatter={(value) => [`$${fmt2(value)}`, 'Total PnL']}
                            />
                            <Bar dataKey="pnl">
                                {dayProfit.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.pnl >= 0 ? "#3b82f6" : "#f59e0b"} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </section>

            </div>
            
            ---
            
            {/* --- Unified Transactions & Trades History Table --- */}
            <section className="p-6 bg-gray-800 rounded-2xl shadow-xl border border-gray-700/50">
                <h2 className="text-2xl font-bold mb-6 text-white flex items-center justify-between">
                    <span className="flex items-center gap-2">
                        <Calendar size={24} className="text-purple-400" />
                        Account Activity History
                    </span>
                    <div className="flex gap-3">
                        {/* Deposit/Withdrawal Buttons (Toggle Modals) */}
                        <button
                            onClick={() => setIsDepositModalOpen(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition duration-200 text-sm"
                        >
                            <ArrowUpCircle size={18} /> Deposit
                        </button>
                        <button
                            onClick={() => setIsWithdrawalModalOpen(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition duration-200 text-sm"
                        >
                            <ArrowDownCircle size={18} /> Withdraw
                        </button>
                    </div>
                </h2>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-700 text-sm">
                        <thead>
                            <tr className="text-gray-400">
                                <th className="px-4 py-3 text-left">Type</th>
                                <th className="px-4 py-3 text-left">Date</th>
                                <th className="px-4 py-3 text-right">Amount</th>
                                <th className="px-4 py-3 text-left">Description</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                            {combinedHistory.length > 0 ? (
                                combinedHistory.map((item, idx) => {
                                    const isPositive = item.amount >= 0;
                                    // Use distinct colors for trades (blue/orange) vs. transactions (green/red)
                                    const colorClass = item.isTrade 
                                        ? (isPositive ? 'text-blue-400' : 'text-orange-400')
                                        : (isPositive ? 'text-green-400' : 'text-red-400');
                                    
                                    return (
                                        <tr key={idx} className="hover:bg-gray-700/50">
                                            <td className={`px-4 py-3 font-semibold ${colorClass}`}>
                                                {item.type}
                                            </td>
                                            <td className="px-4 py-3">
                                                {item.date ? new Date(item.date).toLocaleDateString() : 'N/A'}
                                            </td>
                                            <td className={`px-4 py-3 text-right font-semibold ${colorClass}`}>
                                                {item.amount >= 0 ? '+' : ''}${fmt2(item.amount)}
                                            </td>
                                            <td className="px-4 py-3 text-gray-400 truncate max-w-lg">
                                                {item.description || 'No notes'}
                                            </td>
                                        </tr>
                                    );
                                })
                            ) : (
                                <tr>
                                    <td colSpan="4" className="text-center py-6 text-gray-400">
                                        No financial activity (trades or transactions) recorded yet.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>
            
            {/* --- Transaction Modals (Placeholders) --- */}
            {isDepositModalOpen && (
                <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center">
                    <div className="bg-gray-800 p-8 rounded-xl shadow-2xl">
                        <p className="text-white">Deposit Modal Placeholder (Need a parent component to handle this)</p>
                        <button onClick={() => setIsDepositModalOpen(false)} className="mt-4 text-sm text-purple-400">Close</button>
                    </div>
                </div>
            )}
            {isWithdrawalModalOpen && (
                <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center">
                    <div className="bg-gray-800 p-8 rounded-xl shadow-2xl">
                        <p className="text-white">Withdrawal Modal Placeholder (Need a parent component to handle this)</p>
                        <button onClick={() => setIsWithdrawalModalOpen(false)} className="mt-4 text-sm text-purple-400">Close</button>
                    </div>
                </div>
            )}

        </div>
    );
}
