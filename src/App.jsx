import { useState, useMemo, useEffect } from "react";
import AuthPage from "./components/AuthPage";
import { supabase } from "./components/supabaseClient";
import { signOut } from "./components/authService";
import { Toaster } from "react-hot-toast";
import { v4 as uuidv4 } from "uuid";
import TradeLog from "./components/TradeLog";
import Dashboard from "./components/Dashboard";
import WeeklyReview from "./components/WeeklyReview";
import Settings from "./components/Settings";
import AccountCreation from "./components/AccountCreation"; // adjust if App.jsx is in /src/components


// ------------------- Helpers -------------------
// --- Helpers for DB normalization ---
/**
 * Normalizes a trade object for Supabase upsert operation.
 * Ensures all keys match the database schema exactly (e.g., uses 'afterimage' not 'after_image').
 */
const normalizeTradeForDB = (trade, userId, currentAccountId) => {
  if (!trade) return null;

  if (!userId || !currentAccountId) {
    console.warn(
      "normalizeTradeForDB skipped: Missing userId or currentAccountId for trade:",
      trade.id
    );
    return null;
  }

  const normalizedTrade = {
    // Required foreign keys
    user_id: userId,
    account_id: currentAccountId,

    pair: trade.pair || trade.symbol || null,
    type: trade.type || null,

    entry_date: trade.entryDate
      ? new Date(trade.entryDate).toISOString()
      : null,
    entry_price: trade.entryPrice ?? null,

    sl: trade.sl ?? null,
    tp: trade.tp ?? null,
    risk: trade.risk ?? 0,
    ratio: trade.ratio ?? null,

    lot_size: trade.lotSize ?? null,
    value_per_pip: trade.valuePerPip ?? null,

    status: trade.status || "open",

    // ✅ CRITICAL FIX: Match schema columns 'beforeimage' and 'afterimage'
    beforeimage: trade.beforeImage || null,
    afterimage: trade.afterImage || null,

    exit_date: trade.exitDate ? new Date(trade.exitDate).toISOString() : null,
    exit_price: trade.exitPrice ?? null,

    points: trade.points ?? null,
    pnl_currency: trade.pnlCurrency ?? null,
    pnl_percent: trade.pnlPercent ?? null,

    session: trade.session || null,
    strategy: trade.strategy || null,
    note: trade.note || null,

    created_at: trade.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Preserve the ID for updates (Fix for the previous "no rows to upsert" error)
  if (trade.id) {
    normalizedTrade.id = trade.id;
  }

  // 🚨 DEBUG: Check final normalized keys
  console.debug(
    "normalizeTradeForDB normalized keys check:",
    Object.keys(normalizedTrade).filter((k) => k.includes("image"))
  );

  return normalizedTrade;
};

const denormalizeTradeRow = (r) => ({
  id: r.id,
  pair: r.pair,
  type: r.type,
  entryDate: r.entry_date ?? r.entrydate ?? r.entryDate ?? "",
  entryPrice: r.entry_price ?? r.entryprice ?? r.entryPrice ?? null,
  stopLoss: r.sl ?? r.stoploss ?? null,
  takeProfit: r.tp ?? r.takeprofit ?? null,
  risk: r.risk ?? 0,
  lotSize: r.lot_size ?? r.lotsize ?? r.lotSize ?? 0,
  valuePerPip: r.value_per_pip ?? r.valuePerPip ?? 0,
  status: r.status ?? "closed",
  ratio: r.ratio ?? null,
  beforeImage: r.before_image ?? r.beforeimage ?? r.beforeImage ?? null,
  afterImage: r.after_image ?? r.afterimage ?? r.afterImage ?? null,
  exitDate: r.exit_date ?? r.exitdate ?? r.exitDate ?? null,
  exitPrice: r.exit_price ?? r.exitprice ?? r.exitPrice ?? null,
  points: r.points ?? null,
  pnlCurrency: r.pnl_currency ?? r.pnlcurrency ?? r.pnlCurrency ?? null,
  pnlPercent: r.pnl_percent ?? r.pnlpercent ?? r.pnlPercent ?? null,
  session: r.session ?? "",
  strategy: r.strategy ?? "",
  note: r.note ?? null,
  created_at: r.created_at,
  updated_at: r.updated_at,
});

// Helper: get ISO week number
const getWeekNumber = (d) => {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 4 - (date.getDay() || 7)); // shift to Thursday
  const yearStart = new Date(date.getFullYear(), 0, 1);
  return Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
};

const classifyTrade = (trade, capital) => {
  const pnl = trade.pnlCurrency || 0;
  const riskAmount = (trade.risk / 100) * capital;
  if (pnl < 0) return "loss";
  if (pnl >= 0 && pnl <= riskAmount) return "breakeven";
  return "win";
};

// ✅ Cleaner weekly equity calculation
const processWeeklyEquityData = (trades, startingCapital = 1000) => {
  if (!trades || trades.length === 0) {
    return [{ week: "Start", label: "Start", equity: Number(startingCapital) }];
  }

  const sortedTrades = [...trades].sort(
    (a, b) => new Date(a.exitDate) - new Date(b.exitDate)
  );

  const weeklyDataMap = new Map();

  sortedTrades.forEach((trade) => {
    const weekNum = getWeekNumber(trade.exitDate);
    const pnl = Number(trade.pnlCurrency) || 0;
    weeklyDataMap.set(weekNum, (weeklyDataMap.get(weekNum) || 0) + pnl);
  });

  let cumulativeEquity = Number(startingCapital);
  const weeklyEquityData = [
    {
      week: "Start",
      label: "Start",
      equity: Number(cumulativeEquity.toFixed(2)),
    },
  ];

  Array.from(weeklyDataMap.keys())
    .sort((a, b) => a - b)
    .forEach((week) => {
      const weekPnL = Number(weeklyDataMap.get(week)) || 0;
      cumulativeEquity = Number(cumulativeEquity) + weekPnL;

      // ✅ Always keep numeric
      const safeEquity = isNaN(cumulativeEquity)
        ? Number(startingCapital)
        : Number(cumulativeEquity);

      weeklyEquityData.push({
        week: `Week ${week}`,
        label: `Week ${week}`,
        equity: Number(safeEquity.toFixed(2)),
      });
    });

  return weeklyEquityData;
};

// ------------------- Main App -------------------
export default function App() {
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState("dark");
  const [capital, setCapital] = useState(0);
  const [user, setUser] = useState(null);
  const [userSettings, setUserSettings] = useState(null);
  const [accounts, setAccounts] = useState([]); // all accounts for the user
  const [currentAccountId, setCurrentAccountId] = useState(null); // active account
  const [accountType, setAccountType] = useState("Standard");
  const [profit, setProfit] = useState(0);
  const [currency, setCurrency] = useState("USD");
  const [equity, setEquity] = useState(0);

  // Deposit/Withdrawal fields
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [deposits, setDeposits] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [dailyDetailsOpen, setDailyDetailsOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState(null); // 'YYYY-MM-DD' string
  const [selectedDayTrades, setSelectedDayTrades] = useState([]);
  const [showAccountCreation, setShowAccountCreation] = useState(false);


  // Form state
  const [formData, setFormData] = useState({
    pair: "",
    type: "long",
    entryDate: "",
    tradeTime: "",
    price: "",
    sl: "",
    tp: "",
    risk: "2.0",
    session: "",
    strategy: "",
    beforeImage: "",
  });

  // Trade management state
  const [tradesOpen, setTradesOpen] = useState([]);
  const [tradesHistory, setTradesHistory] = useState([]);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [selectedWeek, setSelectedWeek] = useState(getWeekNumber(new Date()));
  const [dashboardView, setDashboardView] = useState("overview");

  // --- Utility Functions ---
  const parseNumber = (val) =>
    val === "" || isNaN(Number(val)) ? 0 : Number(val);
  const isValidUrl = (s) => {
    try {
      const url = new URL(s);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  };
  const fmt2 = (n) => {
    if (n === null || n === undefined || isNaN(Number(n))) return "0.00";
    return Number(n).toFixed(2);
  };

  const vpValues = {
    "EUR/USD": 10.0,
    "GBP/USD": 10.0,
    "USD/JPY": 6.8,
    "XAU/USD": 10.0,
    "USD/CAD": 7.3,
    "AUD/USD": 10.0,
    "USD/CHF": 12.4,
  };
  const getAdjustedVP = (pair, accountType) => {
    const base = vpValues[pair] || 0;
    if (!base) return 0;
    if (!accountType) accountType = "Standard";
    if (accountType.toLowerCase() === "mini") return base / 10;
    if (accountType.toLowerCase() === "micro") return base / 100;
    return base;
  };
  const getMultiplier = (pair) => {
    if (pair === "XAU/USD") return 100;
    if (pair === "USD/JPY") return 1000;
    return 100000;
  };

  // --- Equity Calculation ---
  const equity1 = useMemo(() => {
    const realizedPnL = tradesHistory?.reduce(
      (sum, t) => sum + (t.pnlCurrency || 0),
      0
    );
    return (capital ?? 0) + (realizedPnL ?? 0);
  }, [capital, tradesHistory]);

  // Deposit handler (settings)
  const handleFundsDeposit = () => {
    const amount = Number(depositAmount);
    if (!amount || amount <= 0) return alert("Enter a valid deposit amount.");

    const newCapitalValue = (capital || 0) + amount;
    setCapital(newCapitalValue);
    setDepositAmount("");
    persistAccountState(); // ✅ save

    // ✅ Record deposit transaction
    setDeposits((prev) => [
      ...prev,
      { date: new Date().toISOString(), amount },
    ]);

    alert(`Successfully deposited $${amount}. New capital: $${newCapitalValue}`);
  };

  // Withdrawal handler (settings)
  const handleFundsWithdrawal = () => {
    const amount = Number(withdrawAmount);
    if (!amount || amount <= 0) {
      alert("Enter a valid withdrawal amount");
      return;
    }

    if (amount <= equity) {
      setCapital((prev) => prev - amount); // Adjusted to affect capital directly as equity is derived
      // Note: Original logic was more complex, this simplifies to reduce capital
      // assuming a withdrawal reduces capital unless specified otherwise.
      // Keeping original complex equity/capital logic for now as it was present
      // and required `setEquity`. Since `equity` is memoized, we must update
      // capital and let equity recalculate.
      const newCapitalValue = capital - amount;
      setCapital(newCapitalValue);

      // ✅ Record withdrawal transaction
      setWithdrawals((prev) => [
        ...prev,
        { date: new Date().toISOString(), amount },
      ]);

      alert(`Withdrew $${amount} from account`);
    } else {
      alert(`Insufficient funds. You only have $${equity} total in equity.`);
    }

    setWithdrawAmount(""); // reset field
  };

  const handleLogout = async () => {
    const { error } = await signOut();
    if (error) console.error("Logout error:", error.message);
    setUser(null);
    setUserId(null);
    setCurrentAccountId(null);
    setAccounts([]);
    setTradesOpen([]);
    setTradesHistory([]);
    setCapital(0);
    setUserSettings({});
  };

  // Export
  const handleExportData = () => {
    const data = { tradesOpen, tradesHistory };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "trades-backup.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  // Import
  const handleImportData = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target.result);
        setTradesOpen(imported.trades_open || []);
        setTradesHistory(imported.trades_history || []);
        persistJournal(imported.trades_open, imported.trades_history);
        alert("Import successful!");
      } catch (err) {
        console.error("Failed to import file:", err);
        alert("Import failed. Please check the file format.");
      }
    };
    reader.readAsText(file);
  };

  // Reset
  const handleResetAccount = () => {
    if (
      window.confirm(
        "⚠️ Are you sure you want to reset your account? This will delete all your trades and reset balances."
      )
    ) {
      setTradesOpen([]);
      setTradesHistory([]);
      setCapital(0);
      persistJournal([], []); // clear Supabase storage
      alert("Your account has been reset.");
    }
  };

  // --- Auth session bootstrap ---
  useEffect(() => {
    const initAuth = async () => {
      // ✅ Load current session on refresh
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        console.error("Error getting session:", error.message);
      }
      if (data?.session?.user) {
        setUser(data.session.user);
        setUserId(data.session.user.id);
      }
      setLoading(false);
    };

    initAuth();

    // ✅ Subscribe to auth changes
    const { data: subscription } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (session?.user) {
          setUser(session.user);
          setUserId(session.user.id);
        } else {
          setUser(null);
          setUserId(null);
        }
        setLoading(false);
      }
    );

    return () => {
      subscription?.subscription.unsubscribe();
    };
  }, []);

  // ✅ Fixed: Use UPSERT instead of delete+insert
  const persistJournal = async (openTrades, historyTrades) => {
    console.log("🟢 persistJournal called", {
      userId,
      currentAccountId,
      openTradesCount: openTrades?.length ?? 0,
      historyCount: historyTrades?.length ?? 0,
    });

    if (!userId || !currentAccountId) {
      console.warn(
        "⚠️ persistJournal skipped — missing userId or currentAccountId"
      );
      return;
    }

    const allTrades = [
      ...(openTrades || []).map((t) => ({ ...t, status: "open" })),
      ...(historyTrades || []).map((t) => ({ ...t, status: "closed" })),
    ];

    const rows = allTrades
      .filter((t) => !!t.id)
      .map((t) => normalizeTradeForDB(t, userId, currentAccountId));

    if (rows.length === 0) {
      console.log("⚠️ No trades to persist, skipping Supabase upsert.");
      return;
    }

    console.log("💾 Attempting to save to Supabase:", rows);

    const { data, error } = await supabase
      .from("trades")
      .upsert(rows, { onConflict: ["id"] });

    if (error) {
      console.error("❌ Supabase trade save error:", {
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
    } else {
      console.log(
        `✅ Successfully saved ${data?.length ?? 0} trades to Supabase.`
      );
    }
  };

  // Load journal from Supabase (returns row or null)
  const loadJournalFromSupabase = async (uid, accountId) => {
    try {
      const { data, error } = await supabase
        .from("trades")
        .select("*")
        .eq("user_id", uid)
        .eq("account_id", accountId)
        .order("entry_date", { ascending: true });

      if (error) {
        console.error("❌ Supabase load error:", error.message);
        return null; // Return null on error
      }

      if (!data || data.length === 0) {
        console.log("ℹ️ No data from Supabase");
        return null;
      }

      const openTrades = data.filter((t) => t.status === "open");
      const closedTrades = data.filter((t) => t.status === "closed");

      return { trades_open: openTrades, trades_history: closedTrades };
    } catch (err) {
      console.error("❌ Supabase request failed:", err);
      return null;
    }
  };

// ✅ Persist account state to `account` table (Supabase only)
const persistAccountState = async () => {
  if (!userId || !currentAccountId) return;

  const accountData = {
    capital: parseFloat(capital) || 0,
    equity: parseFloat(equity) || 0,
    profit: parseFloat(profit) || 0,
    state: "Active",
    updated_at: new Date().toISOString(),
    updated_by: userId,
  };

  const { error } = await supabase
    .from("account")
    .update(accountData)
    .eq("id", currentAccountId);

  if (error) {
    console.error("❌ Supabase account save error:", error);
  } else {
    console.log("✅ Account state persisted:", accountData);
  }
};

// --- Load all accounts when user logs in ---
useEffect(() => {
  if (!userId) return;

  const loadAccounts = async () => {
    try {
      const { data: accountsRows, error } = await supabase
        .from("account") // ✅ actual table name
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Load accounts error:", error);
        return;
      }

      setAccounts(accountsRows ?? []);

      if (accountsRows && accountsRows.length > 0) {
        const current =
          accountsRows.find((a) => a.id === currentAccountId) ||
          accountsRows[0];

        setCurrentAccountId(current.id);
        setCapital(current.capital ?? 0);
        setAccountType(current.account_type || "Standard"); // ✅ important for calculations
        setEquity(current.equity ?? 0);
        setProfit(current.profit ?? 0);
        setCurrency(current.currency || "USD");
        // 🔹 (Theme/deposit/withdraw/user_settings removed — not in schema)
      } else {
        // ✅ Reset safe defaults if no accounts found
        setCurrentAccountId(null);
        setCapital(0);
        setEquity(0);
        setProfit(0);
        setAccountType("Standard");
        setCurrency("USD");
        console.log("No accounts found — prompt to create a new one.");
      }
    } catch (err) {
      console.error("Unexpected error loading accounts:", err);
    }
  };

  loadAccounts();
}, [userId, currentAccountId]);

  // --- Load journal whenever account changes ---
  useEffect(() => {
    if (!userId || !currentAccountId) return;

    const loadJournal = async () => {
      try {
        let data = await loadJournalFromSupabase(userId, currentAccountId);

        if (
          data &&
          (data.trades_open?.length > 0 || data.trades_history?.length > 0)
        ) {
          setTradesOpen(data.trades_open.map(denormalizeTradeRow));
          setTradesHistory(data.trades_history.map(denormalizeTradeRow));

          console.log(
            `✅ Loaded ${
              data.trades_open.length + data.trades_history.length
            } trades from Supabase.`
          );
        } else {
          setTradesOpen([]);
          setTradesHistory([]);
          console.log("ℹ️ No trades found in Supabase.");
        }
      } catch (err) {
        console.error("❌ Error loading journal:", err);
      }
    };

    loadJournal();
  }, [userId, currentAccountId]);

  // --- Persist account state whenever dependencies change ---
useEffect(() => {
  persistAccountState();
}, [capital, equity, profit, accountType]);


  // --- One-time migration (session + strategy fields) ---
  useEffect(() => {
    try {
      if (!tradesHistory || tradesHistory.length === 0) return;

      const needsPatch = tradesHistory.some(
        (t) => t.session === undefined || t.strategy === undefined
      );
      if (!needsPatch) return;

      const patched = tradesHistory.map((t) => ({
        ...t,
        session: t.session ?? "",
        strategy: t.strategy ?? "",
      }));

      setTradesHistory(patched);
      persistJournal(tradesOpen, patched).catch(console.error);
    } catch (e) {
      console.error("Migration failed:", e);
    }
  }, []); // run once

  // --- Auto-sync account type with calculator and trade form ---
  useEffect(() => {
    // anytime accountType changes, reflect it everywhere
    if (!accountType) return;
    setFormData((prev) => ({ ...prev, accountType }));
  }, [accountType]);

  // --- Helpers for Calculations ---
  const calculateStopLossPoints_live = (fd = formData) => {
    const entry = parseNumber(fd.price);
    const stop = parseNumber(fd.sl);
    if (!entry || !stop || !fd.pair) return 0;
    const raw = fd.type === "long" ? entry - stop : stop - entry;
    const mult = getMultiplier(fd.pair);
    return Math.round(Math.abs(raw) * mult);
  };

  const calculateTakeProfitPoints_live = (fd = formData) => {
    const entry = parseNumber(fd.price);
    const take = parseNumber(fd.tp);
    if (!entry || !take || !fd.pair) return 0;
    const raw = fd.type === "long" ? take - entry : entry - take;
    const mult = getMultiplier(fd.pair);
    return Math.round(Math.abs(raw) * mult);
  };

  const calculateLotSize_live = (fd = formData) => {
    const pair = fd.pair;
    if (!capital || !pair) return 0;
    const stopPointsSigned = calculateStopLossPoints_live(fd);
    const stopPoints = Math.abs(stopPointsSigned);
    if (stopPoints === 0) return 0;
    const riskDecimal = parseNumber(fd.risk) / 100;
    const vp = getAdjustedVP(pair, fd.accountType);
    if (vp === 0) return 0;
    const lot = (riskDecimal * capital) / (vp * stopPoints);
    return Number(lot);
  };

  // --- Form Handlers ---
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSaveTrade = async (e) => {
    e && e.preventDefault && e.preventDefault();

    // Lot size + value per pip
    const lot = calculateLotSize_live(formData);
    const vpAtSave = getAdjustedVP(formData.pair, formData.accountType);

    // Entry, SL, TP
    const entry = parseNumber(formData.price);
    const sl = parseNumber(formData.sl);
    const tp = parseNumber(formData.tp);

    // Calculate risk-reward ratio
    let ratio = null;
    let liveStopLossPoints = calculateStopLossPoints_live(formData);
    let liveTakeProfitPoints = calculateTakeProfitPoints_live(formData);
    if (entry && sl && tp) {
      ratio =
        liveStopLossPoints !== 0
          ? Number(
              (liveTakeProfitPoints / liveStopLossPoints).toFixed(2)
            )
          : null;
    }

    // Build new trade object (fixed)
    const trade = {
      id: uuidv4(), // ✅ Proper UUID
      pair: formData.pair,
      type: formData.type,
      entryDate: formData.entryDate || new Date().toISOString().slice(0, 10),
      entryPrice: parseFloat(formData.price),
      stopLoss: parseFloat(formData.sl),
      takeProfit: parseFloat(formData.tp),
      risk: parseFloat(formData.risk),
      lotSize: lot,
      valuePerPip: Number(vpAtSave) || 0,
      ratio: ratio,
      beforeImage: formData.beforeImage?.trim() || null,
      session: formData.session || "",
      strategy: formData.strategy || "",
      status: "open", // Changed from 'active' to 'open' to match DB
    };

    // Update state
    const updatedTradesOpen = [...tradesOpen, trade];
    setTradesOpen(updatedTradesOpen);

    if (currentAccountId && userId) {
      await persistJournal(updatedTradesOpen, tradesHistory);
    } else {
      console.warn(
        "⚠️ Trade saved locally but not persisted — missing userId or accountId."
      );
    }

    // Reset form
    setFormData({
      pair: "",
      type: "long",
      entryDate: "",
      price: "",
      sl: "",
      tp: "",
      risk: "2.0",
      beforeImage: "",
      session: "",
      strategy: "",
    });
  };

  // --- Daily Summary Calculation ---
  const transactionsData = useMemo(() => {
    const txns = [];

    // ✅ Starting Capital is always first
    if (userSettings?.startingCapital && userSettings.startingCapital > 0) {
      txns.push({
        date: userSettings.startDate || tradesHistory[0]?.exitDate || new Date(),
        type: "Starting Capital",
        amount: userSettings.startingCapital,
      });
    }

    // Deposits
    (deposits || []).forEach((d) => {
      txns.push({
        date: d.date,
        type: "Deposit",
        amount: d.amount,
      });
    });

    // Withdrawals
    (withdrawals || []).forEach((w) => {
      txns.push({
        date: w.date,
        type: "Withdrawal",
        amount: -Math.abs(w.amount),
      });
    });

    // Daily Profit/Loss
    const dailyPnL = {};
    tradesHistory.forEach((t) => {
      const day = new Date(t.exitDate).toLocaleDateString("en-CA");
      if (!dailyPnL[day]) dailyPnL[day] = 0;
      dailyPnL[day] += t.pnlCurrency ?? 0;
    });

    Object.entries(dailyPnL).forEach(([date, pnl]) => {
      txns.push({
        date,
        type: pnl >= 0 ? "Daily Profit" : "Daily Loss",
        amount: pnl,
      });
    });

    // Sort by date
    return txns.sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [tradesHistory, deposits, withdrawals, userSettings]);

  /* --- dailyRiskData (declare FIRST) --- */
  const dailyRiskData = useMemo(() => {
    // combine history + open trades (fixed spread)
    const allTrades = [...tradesHistory, ...tradesOpen];
    const DAILY_RISK_LIMIT_PERCENT = 5; // Re-defined for this memo

    const dailyRiskMap = allTrades.reduce((acc, trade) => {
      const date = trade.entryDate
        ? trade.entryDate.slice(0, 10)
        : new Date().toISOString().slice(0, 10);
      if (!acc[date]) acc[date] = 0;
      // count risk for open/active trades (adjust if you want to include closed trades)
      if (trade.status === "open" || trade.status === "active") {
        acc[date] += Number(trade.risk || 0);
      }
      return acc;
    }, {});

    // Convert map -> sorted array for chart
    const sortedDates = Object.keys(dailyRiskMap).sort(
      (a, b) => new Date(a) - new Date(b)
    );
    return sortedDates.map((date) => ({
      date,
      risk: Number(dailyRiskMap[date].toFixed(2)),
      dailyLimit: DAILY_RISK_LIMIT_PERCENT,
    }));
  }, [tradesHistory, tradesOpen]);

  /* --- weeklyDailyRiskData (depends on dailyRiskData) --- */
  const weeklyDailyRiskData = useMemo(() => {
    if (!dailyRiskData || dailyRiskData.length === 0) return [];
    return dailyRiskData
      .filter(
        (item) => getWeekNumber(new Date(item.date)) === selectedWeek
      )
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [dailyRiskData, selectedWeek]);

  /* --- riskDomain (compute AFTER weeklyDailyRiskData) --- */
  const riskDomain = useMemo(() => {
    const DAILY_RISK_LIMIT_PERCENT = 5; // Re-defined for this memo
    if (!weeklyDailyRiskData || weeklyDailyRiskData.length === 0) {
      return [0, DAILY_RISK_LIMIT_PERCENT];
    }
    const values = weeklyDailyRiskData.map((d) => d.risk);
    const min = Math.min(...values);
    const max = Math.max(...values, DAILY_RISK_LIMIT_PERCENT);
    return [Math.max(0, Math.floor(min - 1)), Math.ceil(max + 1)];
  }, [weeklyDailyRiskData]);

  const coloredBySign = (num, formatFn) => {
    if (num === null || num === undefined || isNaN(Number(num))) {
      return <span>0.00</span>;
    }
    const n = Number(num);
    const formatted =
      typeof formatFn === "function" ? formatFn(n) : fmt2(n);
    if (n < 0) return <span className="text-red-500">{formatted}</span>;
    if (n > 0) return <span className="text-blue-400">{formatted}</span>;
    return <span>{formatted}</span>;
  };
  const coloredLot = (lot) => {
    if (lot === null || lot === undefined || isNaN(Number(lot))) {
      return <span>0.00</span>;
    }
    const n = Number(lot);
    return (
      <span className={n > 0 ? "text-green-400 font-semibold" : ""}>
        {fmt2(n)}
      </span>
    );
  };

  // --- Dashboard Calculations (Memoized for efficiency) ---
  const dashboardStats = useMemo(() => {
    const allTrades = [...tradesHistory, ...tradesOpen];
    const totalPnLCurrency = tradesHistory.reduce((sum, trade) => {
      if (trade.pnlCurrency !== undefined) {
        return sum + trade.pnlCurrency;
      }
      return sum;
    }, 0);
    const totalPnLPercent = capital ? (totalPnLCurrency / capital) * 100 : 0;
    const totalTrades = tradesHistory.length;
    const totalWins = tradesHistory.filter(
      (t) => classifyTrade(t, capital) === "win"
    ).length;
    const totalLosses = tradesHistory.filter(
      (t) => classifyTrade(t, capital) === "loss"
    ).length;
    const totalBreakeven = tradesHistory.filter(
      (t) => classifyTrade(t, capital) === "breakeven"
    ).length;
    const winRate =
      totalWins + totalLosses > 0
        ? (totalWins / (totalWins + totalLosses)) * 100
        : 0;
    const lossRate =
      totalWins + totalLosses > 0
        ? (totalLosses / (totalWins + totalLosses)) * 100
        : 0;
    const breakevenRate =
      totalTrades > 0 ? (totalBreakeven / totalTrades) * 100 : 0;

    const pairData = tradesHistory.reduce((acc, trade) => {
      if (!acc[trade.pair]) {
        acc[trade.pair] = { pnl: 0, trades: 0, breakeven: 0 };
      }
      acc[trade.pair].pnl += trade.pnlCurrency;
      acc[trade.pair].trades += 1;
      if (trade.pnlCurrency === 0) {
        acc[trade.pair].breakeven += 1;
      }
      return acc;
    }, {});

    const pairKeys = Object.keys(pairData);
    let mostProfitablePair = "";
    let mostLosingPair = "";
    let mostTradedPair = "";
    let highestBreakevenPair = "";

    if (pairKeys.length > 0) {
      mostProfitablePair = pairKeys.reduce((a, b) =>
        pairData[a].pnl > pairData[b].pnl ? a : b
      );
      mostLosingPair = pairKeys.reduce((a, b) =>
        pairData[a].pnl < pairData[b].pnl ? a : b
      );
      mostTradedPair = pairKeys.reduce((a, b) =>
        pairData[a].trades > pairData[b].trades ? a : b
      );
      highestBreakevenPair = pairKeys.reduce((a, b) =>
        pairData[a].breakeven > pairData[b].breakeven ? a : b
      );
    }

    return {
      totalPnLCurrency,
      totalPnLPercent,
      currentEquity: capital + totalPnLCurrency,
      totalWins,
      totalLosses,
      totalBreakeven,
      totalTrades,
      winRate,
      lossRate,
      breakevenRate,
      mostProfitablePair,
      mostLosingPair,
      mostTradedPair,
      highestBreakevenPair,
    };
  }, [tradesHistory, tradesOpen, capital]);

  // Memoized data for the weekly equity growth chart
  const equityChartData = useMemo(() => {
    const allTrades = [...tradesHistory, ...tradesOpen];
    return processWeeklyEquityData(allTrades, capital); // <-- pass current capital
  }, [tradesHistory, tradesOpen, capital]);

  // Frequency of trades per pair
  const pairFrequencyData = useMemo(() => {
    const stats = {};
    tradesHistory.forEach((t) => {
      const pair = t.symbol || t.pair || "Unknown";
      if (!stats[pair]) stats[pair] = 0;
      stats[pair]++;
    });
    return Object.entries(stats).map(([pair, count]) => ({ pair, count }));
  }, [tradesHistory]);

  // Profitability per pair (aggregated PnL)
  const pairProfitabilityData = useMemo(() => {
    const stats = {};
    tradesHistory.forEach((t) => {
      const pair = t.symbol || t.pair || "Unknown";
      const pnl = t.pnlCurrency ?? 0;
      if (!stats[pair]) stats[pair] = 0;
      stats[pair] += pnl;
    });
    return Object.entries(stats).map(([pair, pnl]) => ({ pair, pnl }));
  }, [tradesHistory]);

  // Frequency of trades per session
  const sessionFrequencyData = useMemo(() => {
    const stats = {};
    tradesHistory.forEach((t) => {
      const session = t.session || "Unknown"; // make sure you store session in trade object
      if (!stats[session]) stats[session] = 0;
      stats[session]++;
    });
    return Object.entries(stats).map(([session, count]) => ({
      session,
      count,
    }));
  }, [tradesHistory]);

  // Profitability per session
  const sessionProfitabilityData = useMemo(() => {
    const stats = {};
    tradesHistory.forEach((t) => {
      const session = t.session || "Unknown";
      const pnl = t.pnlCurrency ?? 0;
      if (!stats[session]) stats[session] = 0;
      stats[session] += pnl;
    });
    return Object.entries(stats).map(([session, pnl]) => ({ session, pnl }));
  }, [tradesHistory]);

  // Fixed days order
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

  // Frequency of trades per day of the week
  const dayFrequencyData = useMemo(() => {
    const stats = {};
    tradesHistory.forEach((t) => {
      const dayIndex = new Date(t.exitDate).getDay(); // 0=Sunday ... 6=Saturday
      if (dayIndex >= 1 && dayIndex <= 5) {
        const day = days[dayIndex - 1];
        if (!stats[day]) stats[day] = 0;
        stats[day]++;
      }
    });
    return days.map((day) => ({ day, count: stats[day] || 0 }));
  }, [tradesHistory]);

  // Profitability per day of the week
  const dayProfitabilityData = useMemo(() => {
    const stats = {};
    tradesHistory.forEach((t) => {
      const dayIndex = new Date(t.exitDate).getDay();
      if (dayIndex >= 1 && dayIndex <= 5) {
        const day = days[dayIndex - 1];
        const pnl = t.pnlCurrency ?? 0;
        if (!stats[day]) stats[day] = 0;
        stats[day] += pnl;
      }
    });
    return days.map((day) => ({ day, pnl: stats[day] || 0 }));
  }, [tradesHistory]);

  // --- Weekly Review Calculations ---
  const weeklyReviewData = useMemo(() => {
    const weeks = {};
    let runningEquity = capital;

    // Sort trades by exit date
    const sortedHistory = [...tradesHistory].sort(
      (a, b) => new Date(a.exitDate) - new Date(b.exitDate)
    );

    // Attach week + equity info
    const tradesWithEquity = sortedHistory.map((trade) => {
      runningEquity += trade.pnlCurrency;
      return {
        ...trade,
        week: getWeekNumber(new Date(trade.exitDate)),
        dayOfWeek: new Date(trade.exitDate).getDay(),
        equityAfter: runningEquity,
      };
    });

    // Group by week
    tradesWithEquity.forEach((trade) => {
      const week = trade.week;
      if (!weeks[week]) {
        weeks[week] = {
          trades: [],
          totalPnL: 0,
          weeklyPnLPercent: 0,
          wins: 0,
          losses: 0,
          breakeven: 0,
          startEquity: 0,
          endEquity: 0,
          mostTradedPair: "---",
          mostProfitablePair: "---",
          mostLosingPair: "---",
          highestBreakevenPair: "---",
        };
      }
      weeks[week].trades.push(trade);
    });

    // Weekly calculations
    let lastWeekEquity = capital;
    for (let i = 1; i <= 52; i++) {
      if (weeks[i]) {
        const weekTrades = weeks[i].trades;

        weeks[i].startEquity = lastWeekEquity;
        weeks[i].totalPnL = weekTrades.reduce(
          (sum, t) => sum + t.pnlCurrency,
          0
        );
        weeks[i].weeklyPnLPercent = (weeks[i].totalPnL / capital) * 100;
        weeks[i].wins = weekTrades.filter(
          (t) => classifyTrade(t, capital) === "win"
        ).length;
        weeks[i].losses = weekTrades.filter(
          (t) => classifyTrade(t, capital) === "loss"
        ).length;
        weeks[i].breakeven = weekTrades.filter(
          (t) => classifyTrade(t, capital) === "breakeven"
        ).length;
        weeks[i].endEquity = weeks[i].startEquity + weeks[i].totalPnL;
        lastWeekEquity = weeks[i].endEquity;

        // --- 📊 Pair-based calculations ---
        const pairStats = {}; // { pair: { count, netPercent, profitPercent, lossPercent, breakevenPercent } }

        weekTrades.forEach((t) => {
          const pair = t.symbol || t.pair || "Unknown";
          const ret = t.pnlPercent ?? 0;
          const risk = t.risk ?? 0;

          if (!pairStats[pair]) {
            pairStats[pair] = {
              count: 0,
              netPercent: 0,
              profitPercent: 0,
              lossPercent: 0,
              breakevenPercent: 0,
            };
          }

          pairStats[pair].count++;
          pairStats[pair].netPercent += ret;

          if (ret > risk) {
            pairStats[pair].profitPercent += ret;
          } else if (ret >= 0 && ret <= risk) {
            pairStats[pair].breakevenPercent += ret;
          } else if (ret < 0) {
            pairStats[pair].lossPercent += ret;
          }
        });

        // --- Most Traded ---
        const mostTraded = Object.entries(pairStats).sort(
          (a, b) => b[1].count - a[1].count
        )[0];
        weeks[i].mostTradedPair = mostTraded ? mostTraded[0] : "---";

        // --- Most Profitable ---
        const profitable = Object.entries(pairStats)
          .filter(([_, s]) => s.profitPercent > 0)
          .sort((a, b) => b[1].profitPercent - a[1].profitPercent)[0];
        weeks[i].mostProfitablePair = profitable ? profitable[0] : "---";

        // --- Most Losing ---
        const losing = Object.entries(pairStats)
          .filter(([_, s]) => s.lossPercent < 0)
          .sort((a, b) => a[1].lossPercent - b[1].lossPercent)[0];
        weeks[i].mostLosingPair = losing ? losing[0] : "---";

        // --- Highest Breakeven ---
        const breakeven = Object.entries(pairStats)
          .filter(([_, s]) => s.breakevenPercent > 0)
          .sort((a, b) => b[1].breakevenPercent - a[1].breakevenPercent)[0];
        weeks[i].highestBreakevenPair = breakeven ? breakeven[0] : "---";
      } else {
        // Empty week
        weeks[i] = {
          trades: [],
          totalPnL: 0,
          weeklyPnLPercent: 0,
          wins: 0,
          losses: 0,
          breakeven: 0,
          startEquity: lastWeekEquity,
          endEquity: lastWeekEquity,
          mostTradedPair: "---",
          mostProfitablePair: "---",
          mostLosingPair: "---",
          highestBreakevenPair: "---",
        };
      }
    }

    return weeks;
  }, [tradesHistory, capital]);

  const weekData = weeklyReviewData[selectedWeek] || {
    trades: [],
    totalPnL: 0,
    weeklyPnLPercent: 0,
    wins: 0,
    losses: 0,
    breakeven: 0,
    startEquity: 0,
    endEquity: 0,
    mostTradedPair: "---",
    mostProfitablePair: "---",
    mostLosingPair: "---",
    highestBreakevenPair: "---",
  };

  // --- Daily breakdown: one row per trade ---
  const dailyBreakdown = useMemo(() => {
    const daysOfWeek = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];

    return [...weekData.trades]
      .sort((a, b) => new Date(a.entryDate) - new Date(b.entryDate))
      .map((trade) => {
        const parsedDate = new Date(trade.entryDate);
        const dateKey = parsedDate.toISOString().slice(0, 10);
        const dayName = daysOfWeek[parsedDate.getDay()];
        const pnl = trade.pnlCurrency || 0;
        const pct = capital
          ? Number(((pnl / capital) * 100).toFixed(2))
          : 0;
        const outcome = classifyTrade(trade, capital);

        const riskReward =
          trade.sl && trade.tp && trade.entryPrice
            ? Math.abs(
                (trade.tp - trade.entryPrice) / (trade.entryPrice - trade.sl)
              ).toFixed(2)
            : "---";

        return {
          id: trade.id,
          dateKey,
          day: dayName,
          pair: trade.pair || "---",
          type: trade.type || "---",
          entryPrice: trade.entryPrice || "---",
          exitPrice: trade.exitPrice || "---",
          lotSize: trade.lotSize ?? "---",
          sl: trade.sl ?? "---",
          tp: trade.tp ?? "---",
          ratio: riskReward,
          session: trade.session || "---",
          strategy: trade.strategy || "---",
          totalPnL: pnl,
          pct,
          outcome,
        };
      });
  }, [weekData, capital]);

  const getWeekRange = (week, year) => {
    const d = new Date(year, 0, 1 + (week - 1) * 7);
    d.setDate(d.getDate() + 1 - (d.getDay() || 7)); // Move to Monday
    const start = new Date(d);
    const end = new Date(d);
    end.setDate(end.getDate() + 4); // End on Friday
    return {
      start: start.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      end: end.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    };
  };

  // --- New Handlers for Settings Tab ---
  const handleThemeToggle = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  // ✅ Find the active account
  const currentAccount = accounts?.find((a) => a.id === currentAccountId);

  const styles = {
    navContainer: "w-full flex justify-center mt-4",
    navTabs: "bg-gray-800 p-1 rounded-full flex space-x-1 shadow-inner",
    activeTab:
      "bg-purple-600 text-white font-semibold py-2 px-6 rounded-full shadow-md transition-colors duration-200",
    inactiveTab:
      "text-gray-300 font-semibold py-2 px-6 rounded-full hover:bg-gray-700 hover:text-white transition-colors duration-200",
  };

  // --- Conditional Rendering Function ---
const renderContent = () => {
    if (loading) {
      return (
        <div className="flex justify-center items-center h-full">
          <div className="text-xl text-gray-500">Loading your journal...</div>
        </div>
      );
    }

    switch (activeTab) {
      case "dashboard":
        return (
          <Dashboard
                      // Note: Dashboard also needs userId. We'll assume user?.id is defined in scope.
                      userId={user?.id}
                      accountId={currentAccountId}
                      capital={currentAccount?.capital}
                  />
        );

      case "tradeLog":
        return (
          <TradeLog
            tradesOpen={tradesOpen}
            tradesHistory={tradesHistory}
            setTradesOpen={setTradesOpen}
            setTradesHistory={setTradesHistory}
            capital={currentAccount?.capital}
            accountType={currentAccount?.account_type}
            userId={user?.id} // ✅ Correct user ID source
            accountId={currentAccountId} // ✅ Correct account ID source
            currentAccount={currentAccount}
            persistJournal={persistJournal}
            denormalizeTradeRow={denormalizeTradeRow}
            normalizeTradeForDB={normalizeTradeForDB}
            calculateLotSize_live={calculateLotSize_live}
            getAdjustedVP={getAdjustedVP}
            getMultiplier={getMultiplier}
            parseNumber={parseNumber}
            fmt2={fmt2}
            coloredLot={coloredLot}
            coloredBySign={coloredBySign}
          />
        );

      case "weeklyReview":
        return (
          <WeeklyReview
            // 🚨 FIX 1: Use user?.id, consistent with TradeLog
            userId={user?.id}
            // 🚨 FIX 2: Change prop name from currentAccountId to accountId
            accountId={currentAccountId}
            // 🚨 FIX 3: Use currentAccount?.capital for consistency
            capital={currentAccount?.capital}
           />
        );

      case "settings":
        return (
          <Settings
            userId={user?.id} // Updated for consistency
            userSettings={userSettings}
            theme={theme}
            styles={styles}
            accounts={accounts}
            setAccounts={setAccounts}
            currentAccountId={currentAccountId}
            setCurrentAccountId={setCurrentAccountId}
            setCapital={setCapital}
            setTheme={setTheme}
            setUserSettings={setUserSettings}
            handleThemeToggle={handleThemeToggle}
            handleFundsDeposit={handleFundsDeposit}
            handleFundsWithdrawal={handleFundsWithdrawal}
            handleExportData={handleExportData}
            handleImportData={handleImportData}
            handleResetAccount={handleResetAccount}
            handleLogout={handleLogout}
            depositAmount={depositAmount}
            setDepositAmount={setDepositAmount}
            withdrawAmount={withdrawAmount}
            setWithdrawAmount={setWithdrawAmount}
            currentAccount={currentAccount}
            persistAccountState={persistAccountState}
          />
        );

      default:
        return null;
    }
  };
  // ✅ App return
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen text-white">
        Loading...
      </div>
    );
  }

  if (!userId) {
    // If no user → show AuthPage
    return <AuthPage onLogin={(uid) => setUserId(uid)} />;
  }

  // ✅ Main app after login
// ✅ Main app after login
return (
  <>
    {/* ✅ Global Toaster */}
    <Toaster
      position="bottom-right"
      toastOptions={{
        style: {
          background: "#1f2937", // gray-800
          color: "#fff",
          border: "1px solid #4b5563", // gray-700
          borderRadius: "0.5rem",
          fontSize: "14px",
        },
        success: {
          iconTheme: {
            primary: "#8b5cf6", // purple-500
            secondary: "#1f2937",
          },
        },
      }}
    />

    {/* ✅ Main App Container */}
    <div
      className={`min-h-screen font-sans ${
        theme === "dark"
          ? "bg-gray-900 text-white"
          : "bg-gray-100 text-gray-900"
      }`}
    >
      {/* ✅ Top Account Selector Bar */}
      <div className="w-full bg-gray-800 border-b border-gray-700 px-4 py-3 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3 w-full max-w-md">
          {/* Account Selector */}
          {accounts.length > 0 ? (
            <select
              value={currentAccountId || ""}
              onChange={(e) => {
                const accountId = e.target.value;
                if (!accountId) {
                  setCurrentAccountId(null);
                  setCapital(0);
                  return;
                }
                const selectedAcc = accounts.find((a) => a.id === accountId);
                if (selectedAcc) {
                  setCurrentAccountId(selectedAcc.id);
                  setCapital(selectedAcc.capital ?? 0);
                }
              }}
              className="flex-1 bg-gray-900 text-white px-3 py-2 rounded-lg border border-gray-700 focus:ring-purple-500 focus:border-purple-500 outline-none"
            >
              {accounts.map((acc, index) => (
                <option key={acc.id || `account-${index}`} value={acc.id || ""}>
                  {acc.account_name || "Unnamed Account"} (
                  {acc.account_type || "Standard"})
                </option>
              ))}
            </select>
          ) : (
            <span className="text-gray-400 text-sm">No accounts found</span>
          )}

          {/* ✅ Create New Account Button */}
          <button
            onClick={() => setShowAccountCreation(true)}
            className="px-3 py-2 bg-green-600 hover:bg-green-700 rounded-lg font-medium text-sm transition-colors"
          >
            + New
          </button>
        </div>
      </div>

      {/* ✅ Account Creation Modal */}
      {showAccountCreation && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-gray-900 p-6 rounded-xl w-full max-w-lg relative">
            <button
              onClick={() => setShowAccountCreation(false)}
              className="absolute top-2 right-2 text-gray-400 hover:text-white text-xl"
            >
              ✕
            </button>
            <AccountCreation
              userId={userId}
              onAccountCreated={async (accData) => {
                await fetchAccounts();            // refresh account list
                setCurrentAccountId(accData.id);  // set as active account
                setShowAccountCreation(false);    // close modal
                toast.success("Account created successfully");
              }}
              onClose={() => setShowAccountCreation(false)}
            />
          </div>
        </div>
      )}

      {/* --- Dashboard Main --- */}
      {currentAccountId ? (
        <>
          <header className="p-4 shadow-lg sticky top-0 z-10 backdrop-blur-md bg-opacity-70">
            <nav className={styles.navContainer}>
              <div className={styles.navTabs}>
                <button
                  onClick={() => setActiveTab("dashboard")}
                  className={
                    activeTab === "dashboard"
                      ? styles.activeTab
                      : styles.inactiveTab
                  }
                >
                  Dashboard
                </button>
                <button
                  onClick={() => setActiveTab("tradeLog")}
                  className={
                    activeTab === "tradeLog"
                      ? styles.activeTab
                      : styles.inactiveTab
                  }
                >
                  Trade Log
                </button>
                <button
                  onClick={() => setActiveTab("weeklyReview")}
                  className={
                    activeTab === "weeklyReview"
                      ? styles.activeTab
                      : styles.inactiveTab
                  }
                >
                  Weekly Review
                </button>
                <button
                  onClick={() => setActiveTab("settings")}
                  className={
                    activeTab === "settings"
                      ? styles.activeTab
                      : styles.inactiveTab
                  }
                >
                  Settings
                </button>
              </div>
            </nav>
          </header>

          <main className="p-4">
            {renderContent()}

            {userId && (
              <div className="mt-4 flex items-center justify-between text-sm text-gray-400">
                <span>
                  Logged in as:{" "}
                  <span className="font-semibold">{user?.email}</span>
                </span>
                <button
                  onClick={handleLogout}
                  className="px-3 py-1 bg-gray-700 rounded hover:bg-gray-800 text-white"
                >
                  Logout
                </button>
              </div>
            )}
          </main>
        </>
      ) : (
        <div className="p-8 text-center text-gray-400">
          No account selected. Use the dropdown above to create or select an
          account.
        </div>
      )}
    </div>
  </>
);

}