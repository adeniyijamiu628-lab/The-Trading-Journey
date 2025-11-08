import { useState, useMemo, useEffect } from "react";
import AccountManager from "./components/AccountManager";
import AuthPage from "./components/AuthPage";
import { supabase } from "./components/supabaseClient";
import { signIn, signUp, signOut, signInWithGoogle, onAuthStateChange, getCurrentSession } from "./components/authService";
import { Toaster, toast } from "react-hot-toast";
import { v4 as uuidv4 } from "uuid";
import { getSessionForTime } from "./utils/sessionUtils";
import TradeLog from "./components/TradeLog";
import Dashboard from "./components/Dashboard";
import WeeklyReview from "./components/WeeklyReview";
import Settings from "./components/Settings";


// --- Local Storage Read-Only Helpers ---
const LOCAL_JOURNAL_KEY = "trading_journal_v1";

// Save journal to localStorage (for offline viewing only)
const saveToLocalStorage = (openTrades, closedTrades) => {
  try {
    const payload = {
      open: openTrades || [],
      closed: closedTrades || [],
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(LOCAL_JOURNAL_KEY, JSON.stringify(payload));
    console.log("✅ Journal snapshot saved for offline viewing");
  } catch (err) {
    console.error("❌ Failed to save journal locally:", err);
  }
};

// Load journal snapshot for offline viewing (read-only)
const loadFromLocalStorage = () => {
  try {
    const raw = localStorage.getItem(LOCAL_JOURNAL_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    console.log("📦 Loaded read-only journal from localStorage");
    return {
      trades_open: data.open || [],
      trades_history: data.closed || [],
    };
  } catch (err) {
    console.error("❌ Failed to load local snapshot:", err);
    return null;
  }
};



// ------------------- Icons -------------------
const UpArrowIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 inline ml-1" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 4l-8 8h6v8h4v-8h6z" />
  </svg>
);

const DownArrowIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 inline ml-1" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 20l8-8h-6V4h-4v8H4z" />
  </svg>
);

// ------------------- Reusable UI -------------------
const DashboardCard = ({ title, value, color }) => (
  <div className="p-6 rounded-2xl shadow-lg transition-all duration-300 transform hover:scale-105 backdrop-blur-md bg-white/10 border border-white/20 text-white">
    <h3 className="text-sm font-semibold opacity-75">{title}</h3>
    <p className="text-3xl font-bold mt-2 truncate">{value}</p>
  </div>
);

const Modal = ({ isOpen, title, onClose, children }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="bg-gray-800 rounded-3xl shadow-2xl w-full max-w-lg p-8 relative transform scale-95 animate-zoom-in border border-gray-700">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors duration-200"
        >
          &times;
        </button>
        <h2 className="text-3xl font-bold text-white mb-6">{title}</h2>
        <div className="text-gray-200">{children}</div>
      </div>
    </div>
  );
};

// ------------------- Helpers -------------------
// --- Helpers for DB normalization ---
/**
 * Normalizes a trade object for Supabase upsert operation.
 * Ensures all keys match the database schema exactly (e.g., uses 'afterimage' not 'after_image').
 */
const normalizeTradeForDB = (trade, userId, currentAccountId) => {
  if (!trade) return null;
  
  if (!userId || !currentAccountId) {
    console.warn("normalizeTradeForDB skipped: Missing userId or currentAccountId for trade:", trade.id);
    return null; 
  }

  const normalizedTrade = {
    // Required foreign keys
    user_id: userId,
    account_id: currentAccountId,

    pair: trade.pair || trade.symbol || null,
    type: trade.type || null,
    
    entry_date: trade.entryDate ? new Date(trade.entryDate).toISOString() : null,
    entry_price: trade.entryPrice ?? null,
    
    sl: trade.sl ?? null,
    tp: trade.tp ?? null,
    risk: trade.risk ?? 0,
    ratio: trade.ratio ?? null,

    lot_size: trade.lotSize ?? null,
    value_per_pip: trade.valuePerPip ?? null,
    
    status: trade.status || 'open',
    
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
    Object.keys(normalizedTrade).filter(k => k.includes('image'))
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

const formatDate = (dateStr) => new Date(dateStr).toLocaleDateString("en-GB");

const generateTradeId = () => `${Date.now()}-${Math.floor(Math.random() * 100000)}`;

const getMinMaxEquity = (data) => {
  if (!data || data.length === 0) return { min: 0, max: 0 };
  const equities = data.map((d) => d.equity);
  const min = Math.min(...equities);
  const max = Math.max(...equities);
  return {
    min: Math.floor(min / 50) * 50 - 50,
    max: Math.ceil(max / 50) * 50 + 50,
  };
};

const classifyTrade = (trade, capital) => {
  const pnl = trade.pnlCurrency || 0;
  const riskAmount = (trade.risk / 100) * capital;
  if (pnl < 0) return "loss";
  if (pnl >= 0 && pnl <= riskAmount) return "breakeven";
  return "win";
};

const isValidUrl = (s) => {
  try {
    const url = new URL(s);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
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
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [userId, setUserId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [session, setSession] = useState("");
    const [strategy, setstrategy] = useState()
    const [theme, setTheme] = useState('dark');
    const [capital, setCapital] = useState(0);
    const [newCapital, setNewCapital] = useState(1000);
    const [dailyDetailsOpen, setDailyDetailsOpen] = useState(false);
    const [imagePreview, setImagePreview] = useState(null);
    const [closeNote, setCloseNote] = useState("");
    const [selectedDay, setSelectedDay] = useState(null); // 'YYYY-MM-DD' string
    const [selectedDayTrades, setSelectedDayTrades] = useState([]);
    const [depositAmount, setDepositAmount] = useState("");
    const [withdrawAmount, setWithdrawAmount] = useState("");
    const [user, setUser] = useState(null);
    const [showEditModal, setShowEditModal] = useState(false);
    const [selectedTrade, setSelectedTrade] = useState(null);


// --- Lot Size Calculator states ---
const [calcPair, setCalcPair] = useState("");
const [calcPoints, setCalcPoints] = useState(0);
const [calcRiskPercent, setCalcRiskPercent] = useState(2.0);
const [calcAccountType, setCalcAccountType] = useState("Standard");
const [email, setEmail] = useState("");
const [password, setPassword] = useState("");
const [settingsView, setSettingsView] = useState("accountManager");
// Used for editing existing account in Settings
const [editingAccountData, setEditingAccountData] = useState(null);
const [userSettings, setUserSettings] = useState(null);
const [accounts, setAccounts] = useState([]); // all accounts for the user
const [currentAccountId, setCurrentAccountId] = useState(null); // active account
const [accountType, setAccountType] = useState("Standard");
const [openDropdownKey, setOpenDropdownKey] = useState(null);



const [deposits, setDeposits] = useState([]);
const [withdrawals, setWithdrawals] = useState([]);
const [tradeTime, setTradeTime] = useState(() => {
  // Default to current Nigeria time in HH:MM format
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
});




const handleDeposit = (amount) => {
  setDeposits((prev) => [...prev, { date: new Date(), amount }]);
  setEquity((prev) => prev + amount);
};


const handleWithdrawal = (amount) => {
  setWithdrawals((prev) => [...prev, { date: new Date(), amount }]);
  setEquity((prev) => prev - amount);
};


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
    setEquity((prev) => prev - amount);

    // ✅ Record withdrawal transaction
    setWithdrawals((prev) => [
      ...prev,
      { date: new Date().toISOString(), amount },
    ]);

    alert(`Withdrew $${amount} from equity`);
  } else {
    const shortfall = amount - equity;
    const confirmWithdraw = window.confirm(
      `You only have $${equity} available in equity. Do you want to withdraw the extra $${shortfall} from your capital?`
    );

    if (confirmWithdraw) {
      const total = equity + capital;
      if (amount > total) {
        alert(`Insufficient funds. You only have $${total} total.`);
        return;
      }

      setEquity(0);
      setCapital((prev) => prev - shortfall);
      persistAccountState(); // ✅ save

      // ✅ Record withdrawal transaction
      setWithdrawals((prev) => [
        ...prev,
        { date: new Date().toISOString(), amount },
      ]);

      alert(
        `Withdrew $${amount} ($${equity} from equity, $${shortfall} from capital)`
      );
    }
  }

  setWithdrawAmount(""); // reset field
};




// --- Supabase Authentication ---
// --- Handlers ---
const handleEmailSignup = async () => {
  const { data, error } = await signUp(email, password);
  if (error) return console.error("Signup error:", error.message);
  if (data?.user) {
    setUser(data.user);
    setUserId(data.user.id);
  }
};

const handleEmailLogin = async () => {
  const { data, error } = await signIn(email, password);
  if (error) return console.error("Login error:", error.message);
  if (data?.user) {
    setUser(data.user);
    setUserId(data.user.id);
  }
};

const handleGoogleLogin = async () => {
  const { error } = await signInWithGoogle();
  if (error) console.error("Google login error:", error.message);
};

const handleLogout = async () => {
  const { error } = await signOut();
  if (error) console.error("Logout error:", error.message);
  setUser(null);
  setUserId(null);
};




// Export
const handleExportData = () => {
  const data = { tradesOpen, tradesHistory };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
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
      setTradesOpen(imported.tradesOpen || []);
      setTradesHistory(imported.tradesHistory || []);
      persistJournal(imported.tradesOpen, imported.tradesHistory);
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
  if (window.confirm("⚠️ Are you sure you want to reset your account? This will delete all your trades and reset balances.")) {
    setTradesOpen([]);
    setTradesHistory([]);
    setEquity(0);
    setCapital(0);
    persistJournal([], []); // clear Supabase storage
    alert("Your account has been reset.");
  }
};


const confirmDeleteTrade = (id) => {
  setTradeToDeleteId(id);
  setShowDeleteConfirm(true);
};
const cancelDelete = () => {
  setTradeToDeleteId(null);
  setShowDeleteConfirm(false);
};
  
    // Open the daily details modal for a given date (ISO 'YYYY-MM-DD')
const openDailyDetails = (dateKey, tradeId = null) => {
  setSelectedDay(dateKey);

  const safeISO = (d) => {
    if (!d && d !== 0) return "";
    const parsed = new Date(d);
    if (isNaN(parsed)) return String(d);
    return parsed.toISOString().slice(0, 10);
  };

  // ✅ Now tradeId is defined
  const trades = tradesHistory.filter(
    (t) => safeISO(t.entryDate) === dateKey && (!tradeId || t.id === tradeId)
  );

  setSelectedDayTrades(trades);
  setDailyDetailsOpen(true);
};


const closeDailyDetails = () => {
  setDailyDetailsOpen(false);
  setSelectedDay(null);
  setSelectedDayTrades([]);
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
  const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
    if (session?.user) {
      setUser(session.user);
      setUserId(session.user.id);
    } else {
      setUser(null);
      setUserId(null);
    }
    setLoading(false);
  });

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
    console.warn("⚠️ persistJournal skipped — missing userId or currentAccountId");
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
    console.log(`✅ Successfully saved ${data?.length ?? 0} trades to Supabase.`);
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
      console.warn("⚠️ Using offline data snapshot instead");
      return loadFromLocalStorage();
    }

    if (!data || data.length === 0) {
      console.log("ℹ️ No data from Supabase, checking local storage");
      return loadFromLocalStorage();
    }

    // ✅ Save online snapshot locally for read-only access
    const openTrades = data.filter((t) => t.status === "open");
    const closedTrades = data.filter((t) => t.status === "closed");
    saveToLocalStorage(openTrades, closedTrades);

    return { trades_open: openTrades, trades_history: closedTrades };
  } catch (err) {
    console.error("❌ Supabase request failed:", err);
    return loadFromLocalStorage();
  }
};



// ✅ Persist account state to accounts table (Supabase only)
const persistAccountState = async () => {
  if (!userId || !currentAccountId) return;

  const accountData = {
    capital: capital ?? 0,
    theme: theme ?? "dark",
    deposit_amount: depositAmount ?? 0,
    withdraw_amount: withdrawAmount ?? 0,
    user_settings: userSettings ?? {},
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("account")            // <-- use 'account' (singular) per your DB
    .update(accountData)
    .eq("id", currentAccountId);

  if (error) {
    console.error("Supabase account save error:", error);
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
        .from("account") // ✅ Confirm this matches your actual table name
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Load accounts error:", error);
        toast.error("Failed to load accounts.");
        return;
      }

      // ✅ Always update state even if empty
      setAccounts(accountsRows ?? []);

      if (accountsRows && accountsRows.length > 0) {
        const current =
          accountsRows.find((a) => a.id === currentAccountId) || accountsRows[0];

        setCurrentAccountId(current.id);
        setCapital(current.capital ?? 0);
        setTheme(current.theme ?? "dark");
        setDepositAmount(current.deposit_amount ?? 0);
        setWithdrawAmount(current.withdraw_amount ?? 0);
        setUserSettings(current.user_settings ?? {});
        setAccountType(current.account_type || "Standard"); // ✅ sync for lot size
      } else {
        // ✅ No accounts found — reset state safely
        setCurrentAccountId(null);
        setCapital(0);
        setDepositAmount(0);
        setWithdrawAmount(0);
        setUserSettings({});
        setAccountType("Standard"); // ✅ default fallback
        console.log("No accounts found — prompt to create a new one.");
      }
    } catch (err) {
      console.error("Unexpected error loading accounts:", err);
      toast.error("Something went wrong while loading accounts.");
    }
  };

  loadAccounts();
}, [userId, currentAccountId]); // keep these dependencies




// --- Load journal whenever account changes ---
// ✅ Enhanced: Load from Supabase (online) and fallback to localStorage (offline view only)
useEffect(() => {
  if (!userId || !currentAccountId) return;

  const loadJournal = async () => {
    try {
      let data = null;

      // --- Try fetching from Supabase first ---
      try {
        data = await loadJournalFromSupabase(userId, currentAccountId);
        if (data && (data.trades_open?.length > 0 || data.trades_history?.length > 0)) {
          setTradesOpen(data.trades_open);
          setTradesHistory(data.trades_history);

          // ✅ Save a copy locally (view-only backup)
          localStorage.setItem(
            `journal_${userId}_${currentAccountId}`,
            JSON.stringify({
              trades_open: data.trades_open,
              trades_history: data.trades_history,
              lastSync: new Date().toISOString(),
            })
          );

          console.log(`✅ Loaded ${data.trades_open.length + data.trades_history.length} trades from Supabase.`);
        } else {
          console.log("ℹ️ No trades found in Supabase — keeping local state unchanged.");
        }
      } catch (error) {
        console.warn("⚠️ Supabase fetch failed, trying local cache:", error);
      }

      // --- If offline or Supabase failed, load from localStorage ---
      if (!data) {
        const cached = localStorage.getItem(`journal_${userId}_${currentAccountId}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          setTradesOpen(parsed.trades_open || []);
          setTradesHistory(parsed.trades_history || []);
          console.log("📦 Loaded journal from localStorage (offline view).");
        } else {
          console.log("ℹ️ No local data found.");
        }
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
}, [capital, theme, depositAmount, withdrawAmount, userSettings]);



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


// --- State Management ---
const [formData, setFormData] = useState({
  pair: "",
  type: "long",
  entryDate: "",
  tradeTime: "",   // ✅ Add this line
  price: "",
  sl: "",
  tp: "",
  risk: "2.0",
  session: "",
  strategy: "",
  beforeImage: "",
});

// --- Auto-sync account type with calculator and trade form ---
useEffect(() => {
  // anytime accountType changes, reflect it everywhere
  if (!accountType) return;
  setCalcAccountType(accountType);
  setFormData((prev) => ({ ...prev, accountType }));
}, [accountType]);

    const [modalAfterImage, setModalAfterImage] = useState(null); // 👈 new for close order
    const [tradesOpen, setTradesOpen] = useState([]);
    const [tradesHistory, setTradesHistory] = useState([]);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [tradeToDeleteId, setTradeToDeleteId] = useState(null);

    const [activeTab, setActiveTab] = useState("dashboard");
    const equity = useMemo(() => {
  const realizedPnL = tradesHistory?.reduce((sum, t) => sum + (t.actualPnL || 0), 0);
  return (capital ?? 0) + (realizedPnL ?? 0);
}, [capital, tradesHistory]);


    const [modalOpen, setModalOpen] = useState(false);
    const [selectedTradeId, setSelectedTradeId] = useState(null);
    const [modalExitDate, setModalExitDate] = useState("");
    const [modalExitPrice, setModalExitPrice] = useState("");
    const [modalActualPnL, setModalActualPnL] = useState("");
    const [modalStatus, setModalStatus] = useState("active");
    const [editingTrade, setEditingTrade] = useState(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);

    const [showErrorModal, setShowErrorModal] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");

    const [selectedWeek, setSelectedWeek] = useState(getWeekNumber(new Date()));
    // Dashboard sidebar view state
const [dashboardView, setDashboardView] = useState("overview");



    const PER_TRADE_LIMIT_PERCENT = 3;
    const DAILY_RISK_LIMIT_PERCENT = 5;
    const MAX_ACTIVE_TRADES_PER_DAY = 2;
    const MAX_CANCEL_TRADES_PER_DAY = 1;

    const vpValues = {
        "EUR/USD": 10.0,
        "GBP/USD": 10.0,
        "USD/JPY": 6.8,
        "XAU/USD": 10.0,
        "USD/CAD": 7.3,
        "AUD/USD": 10.0,
        "USD/CHF": 12.4,
    };

    const parseNumber = (val) => (val === "" || isNaN(Number(val)) ? 0 : Number(val));

    const styles = {
        input: "w-full px-4 py-3 bg-gray-700 text-gray-200 border border-gray-600 rounded-xl shadow-inner focus:ring-purple-500 focus:border-purple-500 transition-colors duration-200",
        submitButton: "bg-purple-600 text-white font-medium py-3 px-8 rounded-full shadow-lg hover:bg-purple-700 transition-all duration-200 transform hover:scale-105",
        smallButton: "bg-purple-600 text-white font-medium py-2 px-3 rounded-full shadow-lg hover:bg-purple-700 transition-all duration-200 transform hover:scale-105 text-sm",
        navContainer: "w-full flex justify-center mt-4",
        navTabs: "bg-gray-800 p-1 rounded-full flex space-x-1 shadow-inner",
        activeTab: "bg-purple-600 text-white font-semibold py-2 px-6 rounded-full shadow-md transition-colors duration-200",
        inactiveTab: "text-gray-300 font-semibold py-2 px-6 rounded-full hover:bg-gray-700 hover:text-white transition-colors duration-200",
    };
     // 🔄 Auto-calc Actual PnL when exit price changes
useEffect(() => {
  if (!selectedTradeId) return;
  const trade = tradesOpen.find((t) => t.id === selectedTradeId);
  if (!trade) return;

  if (modalExitPrice) {
    const expectedPnL = computeExpectedCurrencyForClose(trade, modalExitPrice);
    setModalActualPnL(expectedPnL.toFixed(2));
  }
}, [modalExitPrice, selectedTradeId, tradesOpen]);

    // --- Daily Summary Calculation ---
    const summaryForSelectedDate = useMemo(() => {
        const entryDate = formData.entryDate;
        const tradesForDate = tradesHistory.filter(t => t.entryDate === entryDate);
        const openTradesForDate = tradesOpen.filter(t => t.entryDate === entryDate);
        const totalTradesForDate = tradesForDate.length + openTradesForDate.length;
        const totalRiskForDate = openTradesForDate.reduce((sum, trade) => sum + trade.risk, 0);

        const activeTrades = tradesForDate.filter(t => t.status === 'active').length;
        const cancelTrades = tradesForDate.filter(t => t.status === 'cancel').length;

        // Also count open trades as active trades for the daily limit
        const totalActive = activeTrades + openTradesForDate.length;
        const totalCancel = cancelTrades;

        return {
            totalTrades: totalTradesForDate,
            riskUsed: totalRiskForDate,
            activeTrades: totalActive,
            cancelTrades: totalCancel,
        };
    }, [tradesHistory, tradesOpen, formData.entryDate]);
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

    // --- Helpers for Calculations ---
    const getMultiplier = (pair) => {
        if (pair === "XAU/USD") return 100;
        if (pair === "USD/JPY") return 1000;
        return 100000;
    };

    const getBaseVP = (pair) => vpValues[pair] || 0;

    const getAdjustedVP = (pair, accountType) => {
        const base = getBaseVP(pair);
        if (!base) return 0;
        if (!accountType) accountType = "Standard";
        if (accountType.toLowerCase() === "mini") return base / 10;
        if (accountType.toLowerCase() === "micro") return base / 100;
        return base;
    };
// ✅ Lot Size Calculator Logic
const calcLotSize = useMemo(() => {
  if (!calcPair || calcPoints <= 0 || !capital) return 0;
  const vp = getAdjustedVP(calcPair, calcAccountType); // 👈 now respects account type
  if (!vp) return 0;
  return ((calcRiskPercent / 100) * capital) / (vp * calcPoints);
}, [calcPair, calcPoints, calcRiskPercent, calcAccountType, capital]);

const calcRiskAmount = useMemo(() => {
  return (calcRiskPercent / 100) * capital;
}, [calcRiskPercent, capital]);

// --- REPLACE these two functions with the versions below ---

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

    const liveLotSize = useMemo(() => calculateLotSize_live(formData), [formData]);
    const liveStopLossPoints = useMemo(() => (calculateStopLossPoints_live(formData)), [formData]);
    const liveTakeProfitPoints = useMemo(() => (calculateTakeProfitPoints_live(formData)), [formData]);
    const liveValuePerPip = useMemo(() => getAdjustedVP(formData.pair, formData.accountType), [formData.pair, formData.accountType]);

    const liveStopLossCurrency = (Number(liveLotSize) * liveValuePerPip * Math.abs(liveStopLossPoints)) || 0;
    const liveTakeProfitCurrency = (Number(liveLotSize) * liveValuePerPip * Math.abs(liveTakeProfitPoints)) || 0;
    const liveStopLossPercent = capital ? ((liveStopLossCurrency / capital) * 100) : 0;
    const liveTakeProfitPercent = capital ? ((liveTakeProfitCurrency / capital) * 100) : 0;

    // --- Form Handlers ---
    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    

const handleSaveTrade = async (e) => {
  e && e.preventDefault && e.preventDefault();

  const currentDateSummary = summaryForSelectedDate;
  const newTradeRisk = parseNumber(formData.risk);

  // ✅ Daily trade limits check (date-based)
  const safeISO = (d) => {
    if (!d && d !== 0) return "";
    const parsed = new Date(d);
    if (isNaN(parsed)) return String(d);
    return parsed.toISOString().slice(0, 10);
  };

  const tradesForDate = [
    ...tradesOpen.filter(t => t.entryDate === formData.entryDate),
    ...tradesHistory.filter(t => t.entryDate === formData.entryDate)
  ];

  const activeCount = tradesForDate.filter(t => t.status === "open" || t.status === "active").length;
  const cancelCount = tradesForDate.filter(t => t.status === "cancel").length;
  const totalCount = tradesForDate.length;

  if (totalCount >= 3) {
    setErrorMessage(`Error: Maximum of 3 trades already taken on ${formData.entryDate}.`);
    setShowErrorModal(true);
    return;
  }
  if (activeCount >= 2 && formData.type !== "cancel") {
    setErrorMessage(`Error: Maximum of 2 active trades already taken on ${formData.entryDate}.`);
    setShowErrorModal(true);
    return;
  }
  if (cancelCount >= 1 && formData.type === "cancel") {
    setErrorMessage(`Error: Maximum of 1 cancelled trade already taken on ${formData.entryDate}.`);
    setShowErrorModal(true);
    return;
  }

  // Risk per trade check
  if (newTradeRisk > PER_TRADE_LIMIT_PERCENT) {
    setErrorMessage(
      `Error: Per-trade risk limit of ${PER_TRADE_LIMIT_PERCENT}% exceeded.`
    );
    setShowErrorModal(true);
    return;
  }

  // Daily risk check
  const newDailyRisk = currentDateSummary.riskUsed + newTradeRisk;
  if (newDailyRisk > DAILY_RISK_LIMIT_PERCENT) {
    setErrorMessage(
      `Error: Daily risk limit of ${DAILY_RISK_LIMIT_PERCENT}% for ${formData.entryDate} exceeded.`
    );
    setShowErrorModal(true);
    return;
  }

  // Lot size + value per pip
  const lot = calculateLotSize_live(formData);
  const vpAtSave = getAdjustedVP(formData.pair, formData.accountType);

  // Entry, SL, TP
  const entry = parseNumber(formData.price);
  const sl = parseNumber(formData.sl);
  const tp = parseNumber(formData.tp);

  // ✅ Calculate risk-reward ratio
  let ratio = null;
  if (entry && sl && tp) {
    if (formData.type === "long") {
      ratio = (tp - entry) / (entry - sl);
    } else {
      ratio = (entry - tp) / (sl - entry);
    }
    ratio = Number(ratio.toFixed(2));
  }

  // ✅ Validate before image URL
  const before = formData.beforeImage && isValidUrl(formData.beforeImage)
    ? String(formData.beforeImage).trim()
    : null;

  // ✅ Build new trade object
// ✅ Build new trade object (fixed)
const trade = {
  id: uuidv4(), // ✅ Proper UUID
  pair: formData.pair,
  type: formData.type,
  entryDate: formData.entryDate || new Date().toISOString().slice(0, 10),
  entryPrice: parseFloat(formData.price),
  stopLoss: parseFloat(formData.sl),
  takeProfit: parseFloat(formData.tp),
  risk: parseFloat(formData.risk),
  lotSize: liveLotSize,
  valuePerPip: Number(vpAtSave) || 0,
  ratio: liveStopLossPoints !== 0 ? fmt2(liveTakeProfitPoints / liveStopLossPoints) : null,
  beforeImage: formData.beforeImage?.trim() || null,
  session: formData.session || "",
  strategy: formData.strategy || "",
  status: "active",
};


  // Update state
const updatedTradesOpen = [...tradesOpen, trade];
setTradesOpen(updatedTradesOpen);

// Log IDs before saving
console.log("💾 Saving trade with userId:", userId, "accountId:", currentAccountId);

if (currentAccountId && userId) {
  await persistJournal(updatedTradesOpen, tradesHistory);
} else {
  console.warn("⚠️ Trade saved locally but not persisted — missing userId or accountId.");
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
    session: "",   // reset
    strategy: "",  // reset
  });
};


    const openCloseModal = (tradeId) => {
        const t = tradesOpen.find((x) => x.id === tradeId);
        if (!t) return;
        setSelectedTradeId(tradeId);
        setModalExitDate(new Date().toISOString().slice(0, 10));
        setModalExitPrice("");
        setModalActualPnL("");
        setModalStatus("active");
        setModalOpen(true);
    };

 const computeExpectedCurrencyForClose = (trade, exitPrice) => {
  if (!trade || exitPrice === "" || exitPrice === null || exitPrice === undefined) return 0;
  const exit = parseNumber(exitPrice);
  const entry = parseNumber(trade.entryPrice ?? trade.price ?? 0);
  const mult = getMultiplier(trade.pair);
  const pointsSigned = trade.type === "long" ? (exit - entry) * mult : (entry - exit) * mult;
  const lot = Number(trade.lotSize) || 0;
  const vpp = Number(trade.valuePerPip) || 0;
  const expectedCurrency = lot * vpp * pointsSigned;
  return Number(expectedCurrency);
};

// ====== Paste this block directly ABOVE the `const weeklyDailyRiskData = useMemo(...)` you searched for ======

/* --- dailyRiskData (declare FIRST) --- */
const dailyRiskData = useMemo(() => {
  // combine history + open trades (fixed spread)
  const allTrades = [...tradesHistory, ...tradesOpen];

  const dailyRiskMap = allTrades.reduce((acc, trade) => {
    const date = trade.entryDate ? trade.entryDate.slice(0,10) : (new Date()).toISOString().slice(0,10);
    if (!acc[date]) acc[date] = 0;
    // count risk for open/active trades (adjust if you want to include closed trades)
    if (trade.status === "open" || trade.status === "active") {
      acc[date] += Number(trade.risk || 0);
    }
    return acc;
  }, {});

  // Convert map -> sorted array for chart
  const sortedDates = Object.keys(dailyRiskMap).sort((a, b) => new Date(a) - new Date(b));
  return sortedDates.map(date => ({
    date,
    risk: Number(dailyRiskMap[date].toFixed(2)),
    dailyLimit: DAILY_RISK_LIMIT_PERCENT
  }));
}, [tradesHistory, tradesOpen]);

/* --- weeklyDailyRiskData (depends on dailyRiskData) --- */
const weeklyDailyRiskData = useMemo(() => {
  if (!dailyRiskData || dailyRiskData.length === 0) return [];
  return dailyRiskData
    .filter(item => getWeekNumber(new Date(item.date)) === selectedWeek)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}, [dailyRiskData, selectedWeek]);
console.log("weeklyDailyRiskData (for selectedWeek):", selectedWeek, weeklyDailyRiskData);

/* --- riskDomain (compute AFTER weeklyDailyRiskData) --- */
const riskDomain = useMemo(() => {
  if (!weeklyDailyRiskData || weeklyDailyRiskData.length === 0) {
    return [0, DAILY_RISK_LIMIT_PERCENT];
  }
  const values = weeklyDailyRiskData.map(d => d.risk);
  const min = Math.min(...values);
  const max = Math.max(...values, DAILY_RISK_LIMIT_PERCENT);
  return [Math.max(0, Math.floor(min - 1)), Math.ceil(max + 1)];
}, [weeklyDailyRiskData, DAILY_RISK_LIMIT_PERCENT]);

// ====== End paste block ======


const handleSaveClose = async () => {
  const trade = tradesOpen.find((t) => t.id === selectedTradeId);
  if (!trade) return;

  const exitPriceNum = parseNumber(modalExitPrice);
  const manualPnLNum = parseNumber(modalActualPnL); // optional manual override
  const exitDate = modalExitDate || new Date().toISOString().slice(0, 10);

  const mult = getMultiplier(trade.pair);

  // always compute raw distance
  const rawPoints = (exitPriceNum - trade.entryPrice) * mult;

  // signed points based on trade type
  const pointsSigned =
    trade.type === "long" ? Math.round(rawPoints) : Math.round(-rawPoints);

  // compute PnL in currency
  const computedPnL = pointsSigned * trade.lotSize * trade.valuePerPip;

  // if user entered an override PnL, respect it, otherwise use computed
  const pnlCurrency = isNaN(manualPnLNum) ? computedPnL : manualPnLNum;

  // % PnL
  const pnlPercent = capital ? (pnlCurrency / capital) * 100 : 0;

  // ✅ Validate URLs
  const before =
    trade.beforeImage && isValidUrl(trade.beforeImage)
      ? String(trade.beforeImage).trim()
      : null;

  const after =
    modalAfterImage && isValidUrl(modalAfterImage)
      ? String(modalAfterImage).trim()
      : null;

  // ✅ Build closed trade
  const closed = {
    id: trade.id,
    pair: trade.pair,
    type: trade.type,
    entryDate: trade.entryDate,
    entryPrice: trade.entryPrice,
    exitDate,
    exitPrice: exitPriceNum,
    lotSize: trade.lotSize,
    valuePerPip: trade.valuePerPip,
    points: pointsSigned,
    pnlPercent,
    pnlCurrency,
    status: modalStatus,
    risk: trade.risk,
    stopLoss: trade.stopLoss ?? trade.sl ?? null,
    takeProfit: trade.takeProfit ?? trade.tp ?? null,
    ratio: trade.ratio ?? null,
    beforeImage: before,
    afterImage: after,
    note: closeNote,
    session: trade.session ?? "",
    strategy: trade.strategy ?? "",
  };

  // ✅ Update states
  const updatedTradesOpen = tradesOpen.filter((t) => t.id !== trade.id);
  const updatedTradesHistory = [...tradesHistory, closed];
  setTradesOpen(updatedTradesOpen);
  setTradesHistory(updatedTradesHistory);

  // ✅ Persist journal to Supabase
  await persistJournal(updatedTradesOpen, updatedTradesHistory);

  // ✅ Close modal + reset
  setModalOpen(false);
  setSelectedTradeId(null);
  setModalExitDate("");
  setModalExitPrice("");
  setModalActualPnL("");
  setModalStatus("active");
  setCloseNote(""); // clear note after saving
};



// Save edited trade from modal (recalculates points & pnlCurrency)
// App.jsx
// Save edited trade from modal (recalculates points & pnlCurrency)
// Accept the updated trade object from the modal
const handleSaveEditedTrade = async (updatedFromModal) => {
  const tradeToSave = updatedFromModal ?? editingTrade;
  if (!tradeToSave) return;

  console.log("handleSaveEditedTrade - received:", tradeToSave);

  try {
    const exitPriceNum = parseNumber(tradeToSave.exitPrice);
    const entryPriceNum = parseNumber(tradeToSave.entryPrice ?? tradeToSave.price ?? 0);
    const mult = getMultiplier(tradeToSave.pair);

    const rawPoints = (exitPriceNum - entryPriceNum) * mult;
    const pointsSigned =
      tradeToSave.type === "long" ? Math.round(rawPoints) : Math.round(-rawPoints);

    const manualPnL = Number(tradeToSave.pnlCurrency);
    const computedPnL = Number(
      (pointsSigned * (tradeToSave.lotSize || 1) * (tradeToSave.valuePerPip || 1)).toFixed(2)
    );
    const pnlCurrency = isNaN(manualPnL) ? computedPnL : manualPnL;

    const pnlPercent =
      capital && !isNaN(pnlCurrency)
        ? Number(((pnlCurrency / capital) * 100).toFixed(2))
        : 0;

    const updatedTrade = {
      ...tradeToSave,
      exitPrice: exitPriceNum,
      entryPrice: entryPriceNum,
      exitDate: tradeToSave.exitDate,
      points: pointsSigned,
      pnlCurrency,
      pnlPercent,
      session: tradeToSave.session ?? "",
      strategy: tradeToSave.strategy ?? "",
      updated_at: new Date().toISOString(),
    };

    console.log("handleSaveEditedTrade - updatedTrade computed:", updatedTrade);

    // Replace the edited trade in history
    const updatedTradesHistory = tradesHistory.map((t) =>
      t.id === updatedTrade.id ? updatedTrade : t
    );

    setTradesHistory(updatedTradesHistory);

    // ✅ Persist full state
    await persistJournal(tradesOpen, updatedTradesHistory, formData.accountType);

    console.log("✅ Trade successfully saved & persisted.");
    setIsEditModalOpen(false);
    setEditingTrade(null);
  } catch (err) {
    console.error("❌ Error saving edited trade:", err);
    setErrorMessage("Failed to update trade.");
    setShowErrorModal(true);
  }
};


// ✅ Open the edit modal for a trade
// App.jsx
// ✅ Open the edit modal for a trade — ensure tradeTime exists on the object
const handleEditTrade = (trade) => {
  console.log("handleEditTrade - incoming trade:", trade);

  // Normalize the object so tradeTime always exists
  const normalizedTrade = {
    ...trade,
    tradeTime: trade.tradeTime ?? trade.time ?? "",
  };

  setEditingTrade(normalizedTrade);
  setIsEditModalOpen(true);
};



// ✅ Delete a trade from history
const handleDeleteTrade = async (tradeId) => {
  try {
    // Remove from history
    const updatedTradesHistory = tradesHistory.filter(t => t.id !== tradeId);

    // Keep open trades unchanged
    const updatedTradesOpen = [...tradesOpen];

    // Update UI
    setTradesHistory(updatedTradesHistory);

    // Persist remotely
    await persistJournal(updatedTradesOpen, updatedTradesHistory);

    // Clean up editing state if needed
    setIsEditModalOpen(false);
    setEditingTrade(null);
  } catch (err) {
    console.error("Error deleting trade:", err);
    setErrorMessage("Failed to delete trade.");
    setShowErrorModal(true);
  }
};


    const fmt2 = (n) => {
        if (n === null || n === undefined || isNaN(Number(n))) return "0.00";
        return Number(n).toFixed(2);
    };
    const coloredBySign = (num, formatFn) => {
        if (num === null || num === undefined || isNaN(Number(num))) {
          return <span>0.00</span>;
        }
        const n = Number(num);
         const formatted = typeof formatFn === 'function' ? formatFn(n) : fmt2(n);
           if (n < 0) return <span className="text-red-500">{formatted}</span>;
           if (n > 0) return <span className="text-blue-400">{formatted}</span>;
              return <span>{formatted}</span>;
    };
     const coloredLot = (lot) => {
        if (lot === null || lot === undefined || isNaN(Number(lot))) {
          return <span>0.00</span>;
        }
        const n = Number(lot);
        return (<span className={n > 0 ? 'text-green-400 font-semibold' : ''}>{fmt2(n)}</span>);
    };


    // --- Dashboard Calculations (Memoized for efficiency) ---
    const dashboardStats = useMemo(() => {
        const allTrades = [...tradesHistory, ...tradesOpen];
        const totalPnLCurrency = allTrades.reduce((sum, trade) => {
            if (trade.pnlCurrency !== undefined) {
                return sum + trade.pnlCurrency;
            }
            return sum;
        }, 0);
        const totalPnLPercent = (totalPnLCurrency / capital) * 100;
        const totalTrades = allTrades.length;
        const totalWins = tradesHistory.filter(t => classifyTrade(t, capital) === "win").length;
        const totalLosses = tradesHistory.filter(t => classifyTrade(t, capital) === "loss").length;
        const totalBreakeven = tradesHistory.filter(t => classifyTrade(t, capital) === "breakeven").length;
        const winRate = totalWins + totalLosses > 0 ? (totalWins / (totalWins + totalLosses)) * 100 : 0;
        const lossRate = totalWins + totalLosses > 0 ? (totalLosses / (totalWins + totalLosses)) * 100 : 0;
        const breakevenRate = totalTrades > 0 ? (totalBreakeven / totalTrades) * 100 : 0;

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
            mostProfitablePair = pairKeys.reduce((a, b) => pairData[a].pnl > pairData[b].pnl ? a : b);
            mostLosingPair = pairKeys.reduce((a, b) => pairData[a].pnl < pairData[b].pnl ? a : b);
            mostTradedPair = pairKeys.reduce((a, b) => pairData[a].trades > pairData[b].trades ? a : b);
            highestBreakevenPair = pairKeys.reduce((a, b) => pairData[a].breakeven > pairData[b].breakeven ? a : b);
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
            highestBreakevenPair
        };
    }, [tradesHistory, tradesOpen, capital]);

    // Memoized data for the weekly equity growth chart
 const equityChartData = useMemo(() => {
  const allTrades = [...tradesHistory, ...tradesOpen];
  return processWeeklyEquityData(allTrades, capital); // <-- pass current capital
}, [tradesHistory, tradesOpen, capital]);


 
// --- Weekly Review Calculations ---
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
      weeks[i].totalPnL = weekTrades.reduce((sum, t) => sum + t.pnlCurrency, 0);
      weeks[i].weeklyPnLPercent = (weeks[i].totalPnL / capital) * 100;
      weeks[i].wins = weekTrades.filter((t) => classifyTrade(t, capital) === "win").length;
      weeks[i].losses = weekTrades.filter((t) => classifyTrade(t, capital) === "loss").length;
      weeks[i].breakeven = weekTrades.filter((t) => classifyTrade(t, capital) === "breakeven").length;
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
      const mostTraded = Object.entries(pairStats)
        .sort((a, b) => b[1].count - a[1].count)[0];
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
  return Object.entries(stats).map(([session, count]) => ({ session, count }));
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
  const daysOfWeek = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

  return [...weekData.trades]
    .sort((a, b) => new Date(a.entryDate) - new Date(b.entryDate))
    .map(trade => {
      const parsedDate = new Date(trade.entryDate);
      const dateKey = parsedDate.toISOString().slice(0, 10);
      const dayName = daysOfWeek[parsedDate.getDay()];
      const pnl = trade.pnlCurrency || 0;
      const pct = capital ? Number(((pnl / capital) * 100).toFixed(2)) : 0;
      const outcome = classifyTrade(trade, capital);

      const riskReward =
        trade.sl && trade.tp && trade.entryPrice
          ? Math.abs((trade.tp - trade.entryPrice) / (trade.entryPrice - trade.sl)).toFixed(2)
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

// --- Closed Trades Filtering & Sorting ---
const [sortConfig, setSortConfig] = useState({ key: "entryDate", direction: "desc" });
const [filters, setFilters] = useState({
  profitType: "both", // profit | loss | both
  pair: "all",
  action: "both", // L | S | both
  status: "both", // active | cancelled | both
});

const sortedFilteredHistory = useMemo(() => {
  let filtered = [...tradesHistory];

  // --- Filter ---
  if (filters.profitType !== "both") {
    filtered = filtered.filter(t =>
      filters.profitType === "profit" ? t.pnlCurrency > 0 : t.pnlCurrency < 0
    );
  }
  if (filters.pair !== "all") {
    filtered = filtered.filter(t => t.pair === filters.pair);
  }
  if (filters.action !== "both") {
    filtered = filtered.filter(t =>
      filters.action === "L" ? t.type === "long" : t.type === "short"
    );
  }
  if (filters.status !== "both") {
    filtered = filtered.filter(t => t.status === filters.status);
  }

  // --- Sort ---
  filtered.sort((a, b) => {
    const { key, direction } = sortConfig;
    const order = direction === "asc" ? 1 : -1;

    if (key === "pnlCurrency" || key === "pnlPercent") {
      return order * ((a[key] || 0) - (b[key] || 0));
    }
    if (key === "entryDate" || key === "exitDate") {
      return order * (new Date(a[key]) - new Date(b[key]));
    }
    return 0;
  });

  // --- Default: show most recent entry at top ---
  return filtered.sort((a, b) => new Date(b.entryDate) - new Date(a.entryDate));
}, [tradesHistory, filters, sortConfig]);

// --- Handlers ---
const handleSort = (key) => {
  setSortConfig((prev) => ({
    key,
    direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
  }));
};

const handleFilterChange = (type, value) => {
  setFilters((prev) => ({ ...prev, [type]: value }));
};

const resetFilters = () => {
  setFilters({
    profitType: "both",
    pair: "all",
    action: "both",
    status: "both",
  });
  setSortConfig({ key: "entryDate", direction: "desc" });
};




    const getWeekRange = (week, year) => {
        const d = new Date(year, 0, 1 + (week - 1) * 7);
        d.setDate(d.getDate() + 1 - (d.getDay() || 7)); // Move to Monday
        const start = new Date(d);
        const end = new Date(d);
        end.setDate(end.getDate() + 4); // End on Friday
        return {
            start: start.toLocaleDateString("en-US", { month: 'short', day: 'numeric' }),
            end: end.toLocaleDateString("en-US", { month: 'short', day: 'numeric' })
        };
    };

    // --- New Handlers for Settings Tab ---
    const handleCapitalChange = (e) => {
        setNewCapital(e.target.value);
    };

    const handleSaveCapital = () => {
        setCapital(Number(newCapital));
    };

    const handleThemeToggle = () => {
        setTheme(prev => prev === 'dark' ? 'light' : 'dark');
    };

    // ✅ Find the active account
const currentAccount = accounts?.find((a) => a.id === currentAccountId);

    

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
      userId={userId}
      userSettings={userSettings}
      capital={capital}
      fmt2={fmt2}
      dashboardStats={dashboardStats}
      equityChartData={equityChartData}
      pairFrequencyData={pairFrequencyData}
      pairProfitabilityData={pairProfitabilityData}
      sessionFrequencyData={sessionFrequencyData}
      sessionProfitabilityData={sessionProfitabilityData}
      dayFrequencyData={dayFrequencyData}
      dayProfitabilityData={dayProfitabilityData}
      transactionsData={transactionsData}
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
  accountType={currentAccount?.type}
  currentAccountId={currentAccountId}
  userId={userId}
  persistJournal={persistJournal}
  getSessionForTime={getSessionForTime}
/>
  );

    
case "weeklyReview":
  return (
    <WeeklyReview
      userId={userId}                      // ✅ add this
      currentAccountId={currentAccountId}  // ✅ add this
      weekData={weekData}
      selectedWeek={selectedWeek}
      setSelectedWeek={setSelectedWeek}
      getWeekRange={getWeekRange}
      capital={capital}
      fmt2={fmt2}
      dailyBreakdown={dailyBreakdown}
      openDailyDetails={openDailyDetails}
      closeDailyDetails={closeDailyDetails}
      dailyDetailsOpen={dailyDetailsOpen}
      selectedDay={selectedDay}
      selectedDayTrades={selectedDayTrades}
      weeklyDailyRiskData={weeklyDailyRiskData}
      riskDomain={riskDomain}
      styles={styles}
      setImagePreview={setImagePreview}
    />
  );

case "settings":
  return (
    <Settings
      userId={userId}
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
    {/* ✅ Global Toaster - Add this right before your main app container */}
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
    {acc.account_name || "Unnamed Account"} ({acc.account_type || "Standard"})
  </option>
))}

            </select>
          ) : (
            <span className="text-gray-400 text-sm">No accounts found</span>
          )}

          {/* ✅ Create New Account Button (Fixed) */}
          <button
            onClick={() => {
              setActiveTab("settings");
              if (typeof setSettingsView === "function") {
                setSettingsView("accountManager");
              }
            }}
            className="px-3 py-2 bg-green-600 hover:bg-green-700 rounded-lg font-medium text-sm transition-colors"
          >
            + New
          </button>
        </div>
      </div>

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