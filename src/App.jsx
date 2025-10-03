import { useState, useMemo, useEffect } from "react";
import { LineChart,Line,XAxis,YAxis,Tooltip,CartesianGrid,ResponsiveContainer,ReferenceLine,BarChart,Bar,Cell} from "recharts";
import { signIn, signUp, signOut, signInWithGoogle, onAuthStateChange, getCurrentSession } from "./authService";
import UserSettingsForm from "./UserSettingsForm";
import AuthPage from "./AuthPage";
import { supabase } from "./supabaseClient";


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

const persistAccountState = async () => {
  if (!userId) return;

  const data = {
    capital,
    theme,
    deposit_amount: depositAmount,
    withdraw_amount: withdrawAmount,
    user_settings: userSettings,
    updated_at: new Date().toISOString(),
  };

  localStorage.setItem(accountKey(userId), JSON.stringify(data));

  const { error } = await supabase.from('account_states').upsert({
    user_id: userId,
    ...data
  });

  if (error) console.error("Supabase account save error:", error);
};

const loadAccountState = () => {
  try {
    const raw = localStorage.getItem("accountState");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.error("Failed to load account state:", err);
    return null;
  }
};

const handleCapitalUpdate = (newCapital) => {
  setCapital(newCapital);
  persistAccountState(); // this pushes to Supabase + localStorage
};

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

  const sortedTrades = [...trades].sort((a, b) => new Date(a.exitDate) - new Date(b.exitDate));

  const weeklyDataMap = new Map();
  sortedTrades.forEach((trade) => {
    const weekNum = getWeekNumber(trade.exitDate); // ✅ use global version
    weeklyDataMap.set(weekNum, (weeklyDataMap.get(weekNum) || 0) + (trade.pnlCurrency || 0));
  });

  let cumulativeEquity = Number(startingCapital);
  const weeklyEquityData = [
    { week: "Start", label: "Start", equity: Number(cumulativeEquity.toFixed(2)) },
  ];

  Array.from(weeklyDataMap.keys())
    .sort((a, b) => a - b)
    .forEach((week) => {
      cumulativeEquity += weeklyDataMap.get(week) || 0;
      weeklyEquityData.push({
        week: `Week ${week}`,
        label: `Week ${week}`,
        equity: Number(cumulativeEquity.toFixed(2)),
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

// --- Lot Size Calculator states ---
const [calcPair, setCalcPair] = useState("");
const [calcPoints, setCalcPoints] = useState(0);
const [calcRiskPercent, setCalcRiskPercent] = useState(2.0);
const [calcAccountType, setCalcAccountType] = useState("Standard");
const [email, setEmail] = useState("");
const [password, setPassword] = useState("");
const [settingsView, setSettingsView] = useState("menu"); 
const [userSettings, setUserSettings] = useState(() => {
  const saved = localStorage.getItem("userSettings");
  return saved ? JSON.parse(saved) : null;
});

const [deposits, setDeposits] = useState([]);
const [withdrawals, setWithdrawals] = useState([]);



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
    persistJournal([], []); // clear storage
    localStorage.removeItem("userSettings"); // optional: wipe saved settings
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

useEffect(() => {
  // ✅ Load current session on refresh
  getCurrentSession().then(({ data }) => {
    if (data?.session?.user) {
      setUser(data.session.user);
      setUserId(data.session.user.id);
    }
    setLoading(false);
  });

  // ✅ Subscribe to auth changes
  const subscription = onAuthStateChange((authUser) => {
    if (authUser) {
      setUser(authUser);
      setUserId(authUser.id);
    } else {
      setUser(null);
      setUserId(null);
    }
    setLoading(false);
  });

  return () => subscription.unsubscribe();
}, []);



// Restore account state from localStorage
useEffect(() => {
  const saved = loadAccountState();
  if (saved) {
    if (saved.capital !== undefined) setCapital(saved.capital);
    if (saved.theme) setTheme(saved.theme);
    if (saved.depositAmount !== undefined) setDepositAmount(saved.depositAmount);
    if (saved.withdrawAmount !== undefined) setWithdrawAmount(saved.withdrawAmount);
    if (saved.userSettings) setUserSettings(saved.userSettings);
  }
}, []);

useEffect(() => {
  persistAccountState();
}, [capital, theme, depositAmount, withdrawAmount, userSettings]);



  
    const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
    const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
    const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

    const journalPath = `artifacts/${appId}/users/${userId}/tradingJournal`;
    const journalDocRef = db ? doc(db, journalPath, "data") : null;

// ------------------ Local persistence helpers ------------------

// ------------------ Local persistence helpers ------------------

// Keys (scoped per user)
const tradingKey = (uid) => `tradingJournal:${uid}`;
const accountKey = (uid) => `accountState:${uid}`;
const userSettingsKey = (uid) => `userSettings:${uid}`;

// Persist trades/journal
// Save trades
const persistJournal = async (openTrades, historyTrades, accountType) => {
  if (!userId) return;

  // ✅ local fallback
  localStorage.setItem(
    tradingKey(userId),
    JSON.stringify({
      tradesOpen: openTrades || [],
      tradesHistory: historyTrades || [],
      accountType: accountType ?? userSettings?.accountType ?? null,
      savedAt: new Date().toISOString(),
    })
  );

  // ✅ supabase
  const { error } = await supabase
    .from("trading_journals")
    .upsert({
      user_id: userId,
      trades_open: openTrades || [],
      trades_history: historyTrades || [],
      account_type: accountType ?? userSettings?.accountType ?? null,
      updated_at: new Date().toISOString(),
    });

  if (error) console.error("Supabase journal save error:", error);
};

// Load trades
const loadJournalFromSupabase = async (uid) => {
  const { data, error } = await supabase
    .from("trading_journals")
    .select("*")
    .eq("user_id", uid)
    .single();

  if (error) {
    console.error("Supabase journal load error:", error);
    return null;
  }
  return data;
};

// Load trades/journal
const loadLocalJournal = (uid) => {
  try {
    const raw = localStorage.getItem(tradingKey(uid));
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.error("Failed to load local journal:", err);
    return null;
  }
};

// Save account
const persistAccountState = async () => {
  if (!userId) return;

  const data = {
    capital,
    theme,
    deposit_amount: depositAmount,
    withdraw_amount: withdrawAmount,
    user_settings: userSettings,
    updated_at: new Date().toISOString(),
  };

  localStorage.setItem(accountKey(userId), JSON.stringify(data));

  const { error } = await supabase.from("account_states").upsert({
    user_id: userId,
    ...data,
  });

  if (error) console.error("Supabase account save error:", error);
};

// Load account
const loadAccountFromSupabase = async (uid) => {
  const { data, error } = await supabase
    .from("account_states")
    .select("*")
    .eq("user_id", uid)
    .single();

  if (error) {
    console.error("Supabase account load error:", error);
    return null;
  }
  return data;
};

// ------------------ end local helpers ------------------


// --- Hydrate state from localStorage when userId changes ---
useEffect(() => {
  if (!userId) return;

  // Load account state
  const loadAccount = async () => {
    const { data, error } = await supabase
      .from("account_states")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (error) {
      console.error("Load account error:", error);
      return;
    }

    if (data) {
      setCapital(data.capital ?? 0);
      setTheme(data.theme ?? "dark");
      setDepositAmount(data.deposit_amount ?? 0);
      setWithdrawAmount(data.withdraw_amount ?? 0);
      setUserSettings(data.user_settings ?? {});
    }
  };

  // Load trading journal
  const loadJournal = async () => {
    const { data, error } = await supabase
      .from("trading_journals")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (error) {
      console.error("Load journal error:", error);
      return;
    }

    if (data) {
      setTradesOpen(data.trades_open ?? []);
      setTradesHistory(data.trades_history ?? []);
    }
  };

  loadAccount();
  loadJournal();
}, [userId]);



// --- Real-time Data Listener with onSnapshot ---
useEffect(() => {
  if (!journalDocRef || !userId) return;

  const unsubscribe = onSnapshot(
    journalDocRef,
    (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setTradesOpen(data.tradesOpen || []);
        setTradesHistory(data.tradesHistory || []);
      } else {
        // Remote empty → fallback to local if available
        const local = loadLocalJournal(userId);
        if (local) {
          setTradesOpen(local.tradesOpen || []);
          setTradesHistory(local.tradesHistory || []);
        } else {
          setTradesOpen([]);
          setTradesHistory([]);
        }
      }
    },
    (error) => console.error("Error listening to document:", error)
  );

  return () => unsubscribe();
}, [journalDocRef, userId]);


// --- One-time migration: ensure session/strategy fields ---
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
    if (journalDocRef) {
      setDoc(journalDocRef, { tradesOpen, tradesHistory: patched }).catch(console.error);
    }

    localStorage.setItem("tradingJournal:migrated_session_strategy_v1", "1");
  } catch (e) {
    console.error("Migration failed:", e);
  }
}, []); // run once


    // --- State Management ---
const [formData, setFormData] = useState({
  pair: "",
  type: "long",
  entryDate: "",
  price: "",
  sl: "",
  tp: "",
  risk: "2.0",
  session: "",
  strategy: "",
  beforeImage: "",
});

    const [modalAfterImage, setModalAfterImage] = useState(null); // 👈 new for close order
    const [tradesOpen, setTradesOpen] = useState([]);
    const [tradesHistory, setTradesHistory] = useState([]);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [tradeToDeleteId, setTradeToDeleteId] = useState(null);

    const [activeTab, setActiveTab] = useState("dashboard");

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
  id: Date.now().toString(), // unique ID
  pair: formData.pair,
  type: formData.type,
  entryDate: formData.entryDate || new Date().toISOString().slice(0, 10),
  entryPrice: parseFloat(formData.price),
  stopLoss: parseFloat(formData.sl),
  takeProfit: parseFloat(formData.tp),
  risk: parseFloat(formData.risk),
  lotSize: liveLotSize,
  // store the adjusted VP (respecting accountType e.g. Mini/Micro)
  valuePerPip: Number(vpAtSave) || 0,
  ratio:
    liveStopLossPoints !== 0
      ? fmt2(liveTakeProfitPoints / liveStopLossPoints)
      : null,
  beforeImage: formData.beforeImage?.trim() || null,
  session: formData.session || "",
  strategy: formData.strategy || "",
  status: "active",
};


  // Update state
const updatedTradesOpen = [...tradesOpen, trade];
  setTradesOpen(updatedTradesOpen);
  await persistJournal(updatedTradesOpen, tradesHistory);
  // Save to Firestore
  if (journalDocRef) {
    try {
      await setDoc(journalDocRef, {
        tradesOpen: updatedTradesOpen,
        tradesHistory,
      });
    } catch (e) {
      console.error("Error writing document:", e);
    }
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
  const pointsSigned = trade.type === "long" ? Math.round(rawPoints) : Math.round(-rawPoints);

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
    // preserve these so the More modal can show them
    session: trade.session ?? "",
    strategy: trade.strategy ?? "",
  };

  // Update states
  const updatedTradesOpen = tradesOpen.filter((t) => t.id !== trade.id);
  const updatedTradesHistory = [...tradesHistory, closed];
  setTradesOpen(updatedTradesOpen);
  setTradesHistory(updatedTradesHistory);
  await persistJournal(updatedTradesOpen, updatedTradesHistory);

  // ✅ Persist to Firestore (optional remote sync)
  if (journalDocRef) {
    try {
      await setDoc(journalDocRef, {
        tradesOpen: updatedTradesOpen,
        tradesHistory: updatedTradesHistory,
      });
    } catch (e) {
      console.error("Error updating document:", e);
    }
  }

  // Close modal + reset
  setModalOpen(false);
  setSelectedTradeId(null);
  setModalExitDate("");
  setModalExitPrice("");
  setModalActualPnL("");
  setModalStatus("active");
  setCloseNote(""); // ✅ clear note after saving
};




// Save edited trade from modal (recalculates points & pnlCurrency)
const handleSaveEditedTrade = async () => {
  if (!editingTrade) return;
  console.log("Editing Trade before save:", editingTrade);

  try {
    const exitPriceNum = parseNumber(editingTrade.exitPrice);
    const entryPriceNum = parseNumber(editingTrade.entryPrice ?? editingTrade.price ?? 0);
    const mult = getMultiplier(editingTrade.pair);

    // ✅ Consistent points logic
    const rawPoints = (exitPriceNum - entryPriceNum) * mult;
    const pointsSigned = editingTrade.type === "long"
      ? Math.round(rawPoints)
      : Math.round(-rawPoints);

    // ✅ Consistent PnL logic
    const pnlCurrency = Number((pointsSigned * editingTrade.lotSize * editingTrade.valuePerPip).toFixed(2));
    const pnlPercent = capital ? Number(((pnlCurrency / capital) * 100).toFixed(2)) : 0;

    const updatedTrade = {
      ...editingTrade,
      exitPrice: exitPriceNum,
      exitDate: editingTrade.exitDate,
      points: pointsSigned,
      pnlCurrency,
      pnlPercent,
      session: editingTrade.session ?? "",
      strategy: editingTrade.strategy ?? "",
    };

    // ✅ Update tradesHistory
    const updatedTradesHistory = tradesHistory.map(t =>
      t.id === updatedTrade.id ? updatedTrade : t
    );
    setTradesHistory(updatedTradesHistory);

    // ✅ Persist journal (use tradesOpen, not undefined updatedTradesOpen)
    await persistJournal(tradesOpen, updatedTradesHistory, formData.accountType);

    // ✅ Persist changes to Firestore
    if (journalDocRef) {
      await setDoc(journalDocRef, {
        tradesOpen,
        tradesHistory: updatedTradesHistory,
      });
    }

    // ✅ Close modal after save
    setIsEditModalOpen(false);
    setEditingTrade(null);

  } catch (err) {
    console.error("Error saving edited trade:", err);
    setErrorMessage("Failed to update trade.");
    setShowErrorModal(true);
  }
};


// ✅ Open the edit modal for a trade
const handleEditTrade = (trade) => {
  console.log("Editing trade:", trade); // debug
  setEditingTrade({ ...trade });
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

    // Persist locally & remotely
    await persistJournal(updatedTradesOpen, updatedTradesHistory);

    if (journalDocRef) {
      await setDoc(journalDocRef, {
        tradesOpen: updatedTradesOpen,
        tradesHistory: updatedTradesHistory
      });
    }

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
    .sort((a, b) => new Date(a.entryDate) - new Date(b.entryDate))  // ✅ order by entry
    .map(trade => {
      const parsedDate = new Date(trade.entryDate);
      const dateKey = parsedDate.toISOString().slice(0,10);
      const dayName = daysOfWeek[parsedDate.getDay()];
      const pnl = trade.pnlCurrency || 0;
      const pct = capital ? Number(((pnl / capital) * 100).toFixed(2)) : 0;
      const outcome = classifyTrade(trade, capital);
      
      return {
  id: trade.id,
  dateKey,
  day: dayName,
  trades: 1,
  wins: outcome === "win" ? 1 : 0,
  losses: outcome === "loss" ? 1 : 0,
  breakeven: outcome === "breakeven" ? 1 : 0,
  totalPnL: pnl,
  pct,
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
    <div className="flex gap-6 max-w-7xl mx-auto py-8 text-gray-200">
      {/* Sidebar */}
      <div className="w-56 bg-gray-800 p-4 rounded-2xl border border-gray-700 flex flex-col space-y-2">
        <button
          className={`text-left px-4 py-2 rounded-lg transition ${
            dashboardView === "overview"
              ? "bg-blue-600 text-white font-semibold"
              : "hover:bg-gray-700"
          }`}
          onClick={() => setDashboardView("overview")}
        >
          Account Overview
        </button>

        <button
          className={`text-left px-4 py-2 rounded-lg transition ${
            dashboardView === "pairs"
              ? "bg-blue-600 text-white font-semibold"
              : "hover:bg-gray-700"
          }`}
          onClick={() => setDashboardView("pairs")}
        >
          Pair Statistics
        </button>

        <button
          className={`text-left px-4 py-2 rounded-lg transition ${
            dashboardView === "sessions"
              ? "bg-blue-600 text-white font-semibold"
              : "hover:bg-gray-700"
          }`}
          onClick={() => setDashboardView("sessions")}
        >
          Session Statistics
        </button>

        <button
          className={`text-left px-4 py-2 rounded-lg transition ${
            dashboardView === "transactions"
              ? "bg-blue-600 text-white font-semibold"
              : "hover:bg-gray-700"
          }`}
          onClick={() => setDashboardView("transactions")}
        >
          Transactions
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 space-y-8">
        {dashboardView === "overview" && (
          <>
            {/* User Info Row */}
            <div className="flex flex-wrap items-center gap-6 text-sm text-gray-300">
              <span>
                User ID: <span className="font-mono break-all">{userId}</span>
              </span>

              {userSettings?.accountName && (
                <span>
                  Account:{" "}
                  <span className="font-semibold">
                    {userSettings.accountName}
                  </span>
                </span>
              )}

              {userSettings?.startingCapital && (
                <span>
                  Capital:{" "}
                  <span className="font-semibold">${fmt2(capital)}</span>
                </span>
              )}
            </div>

            {/* Dashboard Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <DashboardCard title="Total Trades" value={dashboardStats.totalTrades} />
              <DashboardCard
                title="Total PnL"
                value={`$${fmt2(dashboardStats.totalPnLCurrency)}`}
              />
              <DashboardCard
                title="Current Equity"
                value={`$${fmt2(dashboardStats.currentEquity)}`}
              />
              <DashboardCard title="Capital" value={`$${fmt2(capital)}`} />
            </div>

            {/* Progress + Pair Stat */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Progress */}
              <div className="bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-700">
                <h3 className="text-lg font-semibold text-white mb-4">Progress</h3>
                <ul className="space-y-2">
                  <li>
                    <span className="font-semibold">Win Rate%:</span>{" "}
                    {fmt2(dashboardStats.winRate)}%
                  </li>
                  <li>
                    <span className="font-semibold">Loss Rate%:</span>{" "}
                    {fmt2(dashboardStats.lossRate)}%
                  </li>
                  <li>
                    <span className="font-semibold">Breakeven Rate%:</span>{" "}
                    {fmt2(dashboardStats.breakevenRate)}%
                  </li>
                </ul>
              </div>

              {/* Pair Stat */}
              <div className="bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-700">
                <h3 className="text-lg font-semibold text-white mb-4">Pair stat</h3>
                <ul className="space-y-2">
                  <li>
                    <span className="font-semibold">Most Profitable Pair:</span>{" "}
                    {dashboardStats.mostProfitablePair || "N/A"}
                  </li>
                  <li>
                    <span className="font-semibold">Most Losing:</span>{" "}
                    {dashboardStats.mostLosingPair || "N/A"}
                  </li>
                  <li>
                    <span className="font-semibold">Most Traded:</span>{" "}
                    {dashboardStats.mostTradedPair || "N/A"}
                  </li>
                  <li>
                    <span className="font-semibold">Highest Breakeven:</span>{" "}
                    {dashboardStats.highestBreakevenPair || "N/A"}
                  </li>
                </ul>
              </div>
            </div>

            {/* Weekly Equity Growth */}
            <div className="bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-700">
              <h2 className="text-xl font-semibold mb-4 text-white">
                Weekly Equity Growth
              </h2>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={equityChartData}>
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
                    domain={["dataMin - 50", "dataMax + 50"]}
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
                    dot={{ stroke: "#82ca9d", strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}

       {/* Pair Statistics Tab */}
{dashboardView === "pairs" && (
  <div className="space-y-8">
    {/* Traded Pairs Frequency */}
    <div className="bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-700">
      <h2 className="text-xl font-semibold text-white mb-4">Traded Pairs Frequency</h2>
      <ResponsiveContainer width="100%" height={400}>
        <BarChart
          layout="vertical"
          data={[...pairFrequencyData].sort((a, b) => b.count - a.count)} // most traded at top
          margin={{ top: 20, right: 30, left: 50, bottom: 20 }}
        >
          <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
          <XAxis type="number" stroke="#ccc" />
          <YAxis dataKey="pair" type="category" stroke="#ccc" />
          <Tooltip />
          <Bar dataKey="count" fill="#8884d8" barSize={25} />
        </BarChart>
      </ResponsiveContainer>
    </div>

    {/* Profitability by Pair */}
    <div className="bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-700">
      <h2 className="text-xl font-semibold text-white mb-4">Profitability by Pair</h2>
      <ResponsiveContainer width="100%" height={400}>
        <BarChart
          data={pairProfitabilityData}
          margin={{ top: 20, right: 30, left: 20, bottom: 50 }}
        >
          <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
          <XAxis dataKey="pair" stroke="#ccc" angle={-45} textAnchor="end" interval={0} />
          <YAxis stroke="#ccc" />
          <Tooltip />
          <Bar dataKey="pnl" fill="#82ca9d">
            {pairProfitabilityData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.pnl >= 0 ? "#4ade80" : "#f87171"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  </div>
)}


        {dashboardView === "sessions" && (
  <div className="space-y-12">
    {/* Session Statistics */}
    <div className="bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-700 space-y-8">
      <h2 className="text-xl font-semibold text-white mb-4">Session Statistics</h2>

      {/* Frequency per Session */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-2">Trade Frequency by Session</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart
            layout="vertical"
            data={[...sessionFrequencyData].sort((a, b) => b.count - a.count)}
          >
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
            <XAxis type="number" stroke="#ccc" />
            <YAxis dataKey="session" type="category" stroke="#ccc" />
            <Tooltip />
            <Bar dataKey="count" fill="#8884d8" barSize={25} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Profitability per Session */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-2">Profitability by Session</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={sessionProfitabilityData}>
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
            <XAxis dataKey="session" stroke="#ccc" />
            <YAxis stroke="#ccc" />
            <Tooltip />
            <Bar dataKey="pnl">
              {sessionProfitabilityData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.pnl >= 0 ? "#4ade80" : "#f87171"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>

    {/* Day-of-Week Statistics */}
    <div className="bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-700 space-y-8">
      <h2 className="text-xl font-semibold text-white mb-4">Day of the Week Statistics</h2>

      {/* Frequency per Day */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-2">Trade Frequency by Day</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={dayFrequencyData}>
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
            <XAxis dataKey="day" stroke="#ccc" />
            <YAxis stroke="#ccc" />
            <Tooltip />
            <Bar dataKey="count" fill="#8884d8" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Profitability per Day */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-2">Profitability by Day</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={dayProfitabilityData}>
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
            <XAxis dataKey="day" stroke="#ccc" />
            <YAxis stroke="#ccc" />
            <Tooltip />
            <Bar dataKey="pnl">
              {dayProfitabilityData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.pnl >= 0 ? "#4ade80" : "#f87171"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  </div>
)}


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
        {transactionsData.map((txn, idx) => (
          <tr key={idx}>
            <td className="px-4 py-2">{new Date(txn.date).toLocaleDateString()}</td>
            <td className="px-4 py-2">{txn.type}</td>
            <td
              className={`px-4 py-2 text-right font-semibold ${
                txn.amount >= 0 ? "text-green-400" : "text-red-400"
              }`}
            >
              {txn.amount >= 0 ? "+" : ""}
              ${fmt2(txn.amount)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
</div>

        )}
      </div>
    </div>
  );


            case "tradeLog":
                return (
                    <>
                        {/* MAIN GRID */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-7xl mx-auto py-8 text-gray-200">
                           {/* FORM SECTION */}
<div className="md:col-span-1">
{/* LOT SIZE CALCULATION SECTION */}
<div className="bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-700 mb-6">
  <h2 className="text-xl font-bold mb-4 text-white">Lot Size Calculator</h2>

  {/* Pair Selection */}
  <div className="flex flex-col mb-4">
    <label className="text-sm font-medium text-gray-400 mb-1">Pair</label>
    <select
      value={calcPair}
      onChange={(e) => setCalcPair(e.target.value)}
      className={styles.input}
    >
      <option value="">Select Pair</option>
      {Object.keys(vpValues).map((p) => (
        <option key={p} value={p}>{p}</option>
      ))}
    </select>
  </div>

  {/* Risk in Points */}
  <div className="flex flex-col mb-4">
    <label className="text-sm font-medium text-gray-400 mb-1">Risk in Points (Only the first three digit)</label>
    <input
      type="number"
      value={calcPoints}
      onChange={(e) => setCalcPoints(Number(e.target.value))}
      className={styles.input}
      placeholder="e.g., 150"
    />
  </div>

  {/* Risk Percentage */}
  <div className="flex flex-col mb-4">
    <label className="text-sm font-medium text-gray-400 mb-1">Risk %</label>
    <select
      value={calcRiskPercent}
      onChange={(e) => setCalcRiskPercent(Number(e.target.value))}
      className={styles.input}
    >
      {[2.0, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 3.0].map((r) => (
        <option key={r} value={r}>{r}%</option>
      ))}
    </select>
  </div>

  {/* Account Type */}
  <div className="flex flex-col mb-4">
    <label className="text-sm font-medium text-gray-400 mb-1">Account Type</label>
    <select
      value={calcAccountType}
      onChange={(e) => setCalcAccountType(e.target.value)}
      className={styles.input}
    >
      <option value="Standard">Standard</option>
      <option value="Mini">Mini</option>
      <option value="Micro">Micro</option>
    </select>
  </div>

  {/* Outputs */}
  <div className="mt-4 p-4 rounded-xl bg-gray-700 border border-gray-600 space-y-2 text-sm text-gray-300">
    <p>
      <span className="font-semibold">Lot Size:</span>{" "}
      {calcLotSize ? calcLotSize.toFixed(2) : "0.00"}
    </p>
    <p>
      <span className="font-semibold">Risk Amount ($):</span>{" "}
      {calcRiskAmount ? `$${calcRiskAmount.toFixed(2)}` : "$0.00"}
    </p>
  </div>
</div>

           {/* Add new Trade */}
  <div className="bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-700">
    <h2 className="text-2xl font-bold mb-6 text-white">Add New Trade</h2>
    <form onSubmit={handleSaveTrade} className="space-y-4">
      {/* Pair / Symbol */}
      <div className="flex flex-col">
        <label className="text-sm font-medium text-gray-400 mb-1" htmlFor="pair">Pair/Symbol</label>
        <select
          id="pair"
          name="pair"
          value={formData.pair}
          onChange={handleChange}
          className={styles.input}
          required
        >
          <option value="">Select Pair</option>
          {Object.keys(vpValues).map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>

      {/* Type + Entry Date */}
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col">
          <label className="text-sm font-medium text-gray-400 mb-1" htmlFor="type">Type</label>
          <select
            id="type"
            name="type"
            value={formData.type}
            onChange={handleChange}
            className={styles.input}
          >
            <option value="long">Long</option>
            <option value="short">Short</option>
          </select>
        </div>
        <div className="flex flex-col">
          <label className="text-sm font-medium text-gray-400 mb-1" htmlFor="entryDate">Entry Date</label>
          <input
            type="date"
            id="entryDate"
            name="entryDate"
            value={formData.entryDate}
            onChange={handleChange}
            className={styles.input}
          />
        </div>
      </div>

      {/* Entry, SL, TP */}
      <div className="grid grid-cols-3 gap-4">
        <div className="flex flex-col">
          <label className="text-sm font-medium text-gray-400 mb-1" htmlFor="price">Entry Price</label>
          <input
            type="number"
            id="price"
            name="price"
            value={formData.price}
            onChange={handleChange}
            className={styles.input}
            step="0.00001"
            placeholder="e.g., 1.12345"
            required
          />
        </div>
        <div className="flex flex-col">
          <label className="text-sm font-medium text-gray-400 mb-1" htmlFor="sl">Stop Loss</label>
          <input
            type="number"
            id="sl"
            name="sl"
            value={formData.sl}
            onChange={handleChange}
            className={styles.input}
            step="0.00001"
            placeholder="e.g., 1.12000"
            required
          />
        </div>
        <div className="flex flex-col">
          <label className="text-sm font-medium text-gray-400 mb-1" htmlFor="tp">Take Profit</label>
          <input
            type="number"
            id="tp"
            name="tp"
            value={formData.tp}
            onChange={handleChange}
            className={styles.input}
            step="0.00001"
            placeholder="e.g., 1.13000"
            required
          />
        </div>
      </div>

      {/* Risk */}
      <div className="flex flex-col">
        <label className="text-sm font-medium text-gray-400 mb-1" htmlFor="risk">Risk %</label>
        <select
          id="risk"
          name="risk"
          value={formData.risk}
          onChange={handleChange}
          className={styles.input}
        >
          <option value="2.0">2.0%</option>
          <option value="2.1">2.1%</option>
          <option value="2.2">2.2%</option>
          <option value="2.3">2.3%</option>
          <option value="2.4">2.4%</option>
          <option value="2.5">2.5%</option>
          <option value="2.6">2.6%</option>
          <option value="2.7">2.7%</option>
          <option value="2.8">2.8%</option>
          <option value="2.9">2.9%</option>
          <option value="3.0">3.0%</option>
        </select>
      </div>

      {/* Session */}
      <div className="flex flex-col">
        <label className="text-sm font-medium text-gray-200 mb-1" htmlFor="session">Session</label>
        <select
          id="session"
          name="session"
          value={formData.session || ""}
          onChange={handleChange}
          className="mt-1 block w-full rounded-md bg-gray-800 border border-gray-600 text-gray-200 p-2"
        >
          <option value="">Select Session</option>
          <option value="Sydney">Sydney</option>
          <option value="Tokyo">Tokyo</option>
          <option value="London">London</option>
          <option value="New-York">New-York</option>
          <option value="Sydney & Tokyo">Sydney & Tokyo</option>
          <option value="Tokyo & London">Tokyo & London</option>
          <option value="London & New York">London & New York</option>
        </select>
      </div>

      {/* Strategy */}
      <div className="flex flex-col">
        <label className="text-sm font-medium text-gray-200 mb-1" htmlFor="strategy">Strategy</label>
        <select
          id="strategy"
          name="strategy"
          value={formData.strategy || ""}
          onChange={handleChange}
          className="mt-1 block w-full rounded-md bg-gray-800 border border-gray-600 text-gray-200 p-2"
        >
          <option value="">Select Strategy</option>
          <option value="1/5min BOT, 5MCC">1/5min BOT, 5MCC</option>
          <option value="1/5min BOT, 15MCC">1/5min BOT, 15MCC</option>
          <option value="5/15min BOT, 15MCC">5/15min BOT, 15MCC</option>
          <option value="5/15min BOT, H1MCC">5/15min BOT, H1MCC</option>
          <option value="1/5min BOS, 5MCC">1/5min BOS, 5MCC</option>
          <option value="1/5min BOS, 15MCC">1/5min BOS, 15MCC</option>
          <option value="5/15min BOS, 15MCC">5/15min BOS, 15MCC</option>
          <option value="5/15min BOS, H1MCC">5/15min BOS, H1MCC</option>
        </select>
      </div>

      {/* Before Image */}
      <div className="flex flex-col">
        <label className="text-sm font-medium text-gray-400 mb-1" htmlFor="beforeImage">Before Image URL</label>
        <input
          type="url"
          id="beforeImage"
          name="beforeImage"
          value={formData.beforeImage || ""}
          onChange={handleChange}
          placeholder="https://example.com/before.jpg"
          className={styles.input}
        />
        <p className="text-xs text-gray-500 mt-1">Paste a publicly accessible image URL (starts with https://)</p>
      </div>

      {/* Calculations */}
      <div className="mt-4 p-4 rounded-xl bg-gray-700 border border-gray-600 space-y-2 text-sm text-gray-300">
        <p><span className="font-semibold">SL Points:</span> <span className="text-red-500">{liveStopLossPoints ? Math.abs(Math.round(liveStopLossPoints)) : 0}</span></p>
        <p><span className="font-semibold">TP Points:</span> <span className="text-blue-400">{liveTakeProfitPoints ? Math.abs(Math.round(liveTakeProfitPoints)) : 0}</span></p>
        <p><span className="font-semibold">R Ratio:</span> {liveStopLossPoints !== 0 ? fmt2(liveTakeProfitPoints / liveStopLossPoints) : "N/A"}</p>
        <p><span className="font-semibold">Lot Size:</span> {coloredLot(liveLotSize)}</p>
        <p><span className="font-semibold">Est. Risk:</span> {coloredBySign(liveStopLossCurrency, v => `$${fmt2(v)}`)}</p>
        <p><span className="font-semibold">Est. Profit:</span> {coloredBySign(liveTakeProfitCurrency, v => `$${fmt2(v)}`)}</p>
        <p><span className="font-semibold">Daily Risk Used:</span> {fmt2(summaryForSelectedDate.riskUsed)}% of {DAILY_RISK_LIMIT_PERCENT}%</p>
      </div>

      {/* Submit */}
      <button type="submit" className={styles.submitButton}>
        Save Trade
      </button>
    </form>
  </div>

                                <div className="mt-6 bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-700">
                                    <h3 className="text-xl font-bold mb-4 text-white">Daily Limits</h3>
                                    <ul className="space-y-2 text-gray-300">
                                        <li><span className="font-semibold">Trades Today:</span> {summaryForSelectedDate.totalTrades}</li>
                                        <li><span className="font-semibold">Active Trades:</span> {summaryForSelectedDate.activeTrades} of {MAX_ACTIVE_TRADES_PER_DAY}</li>
                                        <li><span className="font-semibold">Cancelled Trades:</span> {summaryForSelectedDate.cancelTrades} of {MAX_CANCEL_TRADES_PER_DAY}</li>
                                    </ul>
                                </div>
                            </div>

                            {/* OPEN TRADES SECTION */}
                            <div className="md:col-span-2">
                                <div className="bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-700 mb-6">
                                    <h3 className="text-xl font-bold mb-4 text-white">Open Trades ({tradesOpen.length})</h3>
                                    <div className="overflow-x-auto">
                                        <table className="min-w-full table-auto text-sm text-left">
                                            <thead className="text-gray-400">
                                                <tr>
                                                    <th className="px-4 py-2 font-medium">Pair</th>
                                                    <th className="px-4 py-2 font-medium">Type</th>
                                                    <th className="px-4 py-2 font-medium">Entry Date</th>
                                                    <th className="px-4 py-2 font-medium">Entry Price</th>
                                                    <th className="px-4 py-2 font-medium">Lot Size</th>
                                                    <th className="px-4 py-2 font-medium">Risk</th>
                                                    <th className="px-4 py-2 font-medium">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {tradesOpen.length > 0 ? tradesOpen.map((trade) => (
                                                    <tr key={trade.id} className="border-t border-gray-700 text-gray-300">
                                                        <td className="px-4 py-3">{trade.pair}</td>
                                                        <td className="px-4 py-3 capitalize">{trade.type}</td>
                                                        <td className="px-4 py-3">{trade.entryDate}</td>
                                                        <td className="px-4 py-3">{trade.entryPrice}</td>
                                                        <td className="px-4 py-3">{Number(trade.lotSize).toFixed(2)}</td>
                                                        <td className="px-4 py-3">{trade.risk}%</td>
                                                        <td className="px-4 py-3">
                                                            <button
                                                                onClick={() => openCloseModal(trade.id)}
                                                                className={styles.smallButton}
                                                            >
                                                                Close
                                                            </button>
                                                        </td>
                                                    </tr>
                                                )) : (
                                                    <tr>
                                                        <td colSpan="7" className="text-center py-4 text-gray-500">No open trades.</td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* CLOSED TRADES SECTION */}
                                <div className="bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-700">
  <h3 className="text-xl font-bold mb-4 text-white">
    Closed Trades ({tradesHistory.length})
  </h3>
  <div className="overflow-x-auto overflow-y-auto max-h-96">
    <table className="min-w-full table-auto text-sm text-left">
      <thead className="text-gray-400">
        <tr>
          <th className="px-4 py-2 font-medium">Pair</th>
          <th className="px-4 py-2 font-medium">Action</th>
          <th className="px-4 py-2 font-medium">Entry Date</th>
          <th className="px-4 py-2 font-medium">Exit Date</th>
          <th className="px-4 py-2 font-medium">P&L ($)</th>
          <th className="px-4 py-2 font-medium">P&L (%)</th>
          <th className="px-4 py-2 font-medium">Status</th>
          <th className="px-4 py-2 font-medium">Edit</th>
          <th className="px-4 py-2 font-medium">Delete</th>
        </tr>
      </thead>
      <tbody>
        {tradesHistory.length > 0 ? (
          tradesHistory.sort((a, b) => b.id.split("-")[0] - a.id.split("-")[0]).map((trade) => (
              <tr
                key={trade.id}
                className="border-t border-gray-700 text-gray-300"
              >
                <td className="px-4 py-3">{trade.pair}</td>
                <td className="px-4 py-3 uppercase">
                  {trade.type === "long" ? "L" : "S"}
                </td>
                <td className="px-4 py-3">{trade.entryDate}</td>
                <td className="px-4 py-3">{trade.exitDate}</td>
                <td
                  className={`px-4 py-3 font-semibold ${
                    trade.pnlCurrency >= 0 ? "text-green-500" : "text-red-500"
                  }`}
                >
                  ${fmt2(trade.pnlCurrency)}
                </td>
                <td
                  className={`px-4 py-3 font-semibold flex items-center space-x-1 ${
                    trade.pnlPercent >= 0 ? "text-green-500" : "text-red-500"
                  }`}
                >
                  {trade.pnlPercent >= 0 ? (
                    <>
                      <span>▲</span>
                      <span>{fmt2(trade.pnlPercent)}%</span>
                    </>
                  ) : (
                    <>
                      <span>▼</span>
                      <span>{fmt2(Math.abs(trade.pnlPercent))}%</span>
                    </>
                  )}
                </td>
                <td className="px-4 py-3 capitalize">{trade.status}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => handleEditTrade(trade)}
                    className="text-blue-400 hover:underline"
                  >
                    Edit
                  </button>
                </td>
                <td className="px-4 py-3">
                 <button onClick={() => confirmDeleteTrade(trade.id)} className="text-red-400 hover:underline"
                  >Delete</button>
                </td>
              </tr>
            ))
        ) : (
          <tr>
            <td
              colSpan="9"
              className="text-center py-4 text-gray-500"
            >
              No closed trades.
            </td>
          </tr>
        )}
      </tbody>


                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* CLOSE TRADE MODAL */}
                        <Modal
                            isOpen={modalOpen}
                            onClose={() => setModalOpen(false)}
                            title="Close Trade">
                            <form className="space-y-4">
                                <div className="flex flex-col">
                                    <label className="text-sm font-medium text-gray-400 mb-1" htmlFor="modalExitDate">Exit Date</label>
                                    <input
                                        type="date"
                                        id="modalExitDate"
                                        name="modalExitDate"
                                        value={modalExitDate}
                                        onChange={(e) => setModalExitDate(e.target.value)}
                                        className={styles.input}
                                    />
                                </div>
                                <div className="flex flex-col">
                                    <label className="text-sm font-medium text-gray-400 mb-1" htmlFor="modalExitPrice">Exit Price</label>
                                    <input
                                        type="number"
                                        id="modalExitPrice"
                                        name="modalExitPrice"
                                        value={modalExitPrice}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setModalExitPrice(val);
                                            const trade = tradesOpen.find(t => t.id === selectedTradeId);
                                            if (trade) {
                                                const expectedPnL = computeExpectedCurrencyForClose(trade, val);
                                                setModalActualPnL(expectedPnL.toFixed(2));
                                            }
                                        }}
                                        className={styles.input}
                                        step="0.00001"
                                    />
                                </div>
                                <div className="flex flex-col">
                                    <label className="text-sm font-medium text-gray-400 mb-1" htmlFor="modalActualPnL">Actual P&L ($)</label>
                                    <input
                                        type="number"
                                        id="modalActualPnL"
                                        name="modalActualPnL"
                                        value={modalActualPnL}
                                        onChange={(e) => setModalActualPnL(e.target.value)}
                                        className={styles.input}
                                        step="0.01"
                                    />
                                </div>
                               <div className="flex flex-col">
  <label className="text-sm font-medium text-gray-400 mb-1" htmlFor="afterImage">After Image URL</label>
  <input
    type="url"
    id="afterImage"
    name="afterImage"
    value={modalAfterImage || ''}
    onChange={(e) => setModalAfterImage(e.target.value)}
    placeholder="https://example.com/after.jpg"
    className={styles.input}
  />
  <p className="text-xs text-gray-500 mt-1">Paste after image URL (optional)</p>
</div>
<div className="space-y-1">
  <label className="block text-gray-300 text-sm">Note</label>
  <textarea
    value={closeNote}
    onChange={(e) => setCloseNote(e.target.value)}
    className="w-full bg-gray-700 text-white rounded px-3 py-2"
    rows="3"
    placeholder="Write your notes about this trade..."
  />
</div>



                                <div className="flex flex-col">
                                    <label className="text-sm font-medium text-gray-400 mb-1" htmlFor="modalStatus">Trade Status</label>
                                    <select
                                        id="modalStatus"
                                        name="modalStatus"
                                        value={modalStatus}
                                        onChange={(e) => setModalStatus(e.target.value)}
                                        className={styles.input}
                                    >
                                        <option value="active">Active</option>
                                        <option value="cancel">Cancelled</option>
                                    </select>
                                </div>
                                <button type="button" onClick={handleSaveClose} className={styles.submitButton}>
                                    Save and Close Trade
                                </button>
                            </form>
                        </Modal>
                        <Modal
                            isOpen={showErrorModal}
                            onClose={() => setShowErrorModal(false)}
                            title="Error"
                        >
                            <p>{errorMessage}</p>
                            <button
                                onClick={() => setShowErrorModal(false)}
                                className={`${styles.smallButton} mt-4`}
                            >
                                OK
                            </button>
                        </Modal>
                        {/* Edit Closed Trade Modal */}
<Modal
  isOpen={isEditModalOpen}
  onClose={() => setIsEditModalOpen(false)}
  title="Edit Trade"
>
  <form className="space-y-4">
    {/* Exit Date */}
    <div className="flex flex-col">
      <label
        className="text-sm font-medium text-gray-400 mb-1"
        htmlFor="editExitDate"
      >
        Exit Date
      </label>
      <input
        type="date"
        id="editExitDate"
        name="editExitDate"
        value={editingTrade?.exitDate || ""}
        onChange={(e) =>
          setEditingTrade({ ...editingTrade, exitDate: e.target.value })
        }
        className={styles.input}
      />
    </div>

    {/* Exit Price */}
    <div className="flex flex-col">
      <label
        className="text-sm font-medium text-gray-400 mb-1"
        htmlFor="editExitPrice"
      >
        Exit Price
      </label>
      <input
        type="number"
        id="editExitPrice"
        name="editExitPrice"
        value={editingTrade?.exitPrice || ""}
        onChange={(e) =>
          setEditingTrade({ ...editingTrade, exitPrice: e.target.value })
        }
        className={styles.input}
        step="0.00001"
      />
    </div>

    {/* Save button */}
    <button
      type="button"
      onClick={handleSaveEditedTrade}
      className={styles.submitButton}
    >
      Save Changes
    </button>
  </form>
</Modal>
<Modal
  isOpen={showDeleteConfirm}
  onClose={cancelDelete}
  title="Confirm Delete"
>
  <p>Are you sure you want to delete this trade?</p>
  <div className="mt-4 flex justify-end space-x-3">
    <button onClick={cancelDelete} className={styles.smallButton}>No</button>
    <button
      onClick={async () => {
        // ensure we close modal first for snappy UI
        setShowDeleteConfirm(false);
        if (tradeToDeleteId) {
          await handleDeleteTrade(tradeToDeleteId);
          setTradeToDeleteId(null);
        }
      }}
      className={`${styles.smallButton} bg-red-600`}
    >
      Yes
    </button>
  </div>
</Modal>

                    </>
                );
            case "weeklyReview": {
                const weeklyPercent = weekData.startEquity ? ((weekData.endEquity - weekData.startEquity) / capital) * 100 : 0;
                // Build weekly equity growth dataset
// --- Weekly Equity Growth dataset (trade-by-trade, step by step)
// --- Compute reference lines first ---
let drawdownLine;
if (weekData.startEquity < capital) {
  // Equity dropped below baseline → lock to current equity
  drawdownLine = weekData.endEquity;
} else {
  // Otherwise, 10% below starting equity
  drawdownLine = weekData.startEquity * 0.9;
}

const targetLine =
  weekData.startEquity >= capital
    ? weekData.startEquity * 1.1
    : capital;

// --- Weekly Equity Growth dataset (trade-by-trade, step by step) ---
// before building trade-by-trade points
let runningEquity = weekData.startEquity || 0;

const startPoint = {
  tradeNo: 0,
  date: '',
  label: 'Start',
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
        date: new Date(trade.entryDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
        label: `${new Date(trade.entryDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} #${index + 1}`,
        equity: Number(runningEquity.toFixed(2)),
        pnl: trade.pnlCurrency,
        target: targetLine,
        drawdown: drawdownLine,
      };
    })
];


  
const weeklyRiskData = [...weekData.trades]
  .sort((a, b) => new Date(a.entryDate) - new Date(b.entryDate))
  .map((trade, index) => ({
    tradeNo: index + 1,
    date: new Date(trade.entryDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
    label: `${new Date(trade.entryDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} #${index + 1}`,
    riskUsed: trade.riskUsed || 0, // ✅ match dashboard key
  }));
return (
  <div className="space-y-8 max-w-7xl mx-auto py-8 text-gray-200">
    <div className="bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-700">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-2xl font-bold text-white">Weekly Review</h3>
        <div className="flex space-x-2">
          <button
            onClick={() => setSelectedWeek((w) => (w > 1 ? w - 1 : w))}
            className={`${styles.smallButton}`}
          >
            &lt; Prev
          </button>
          <span className="text-lg font-semibold text-white px-4 py-2 rounded-full bg-gray-700">
            Week {selectedWeek} (
            {getWeekRange(selectedWeek, new Date().getFullYear()).start} -{" "}
            {getWeekRange(selectedWeek, new Date().getFullYear()).end})
          </span>
          <button
            onClick={() => setSelectedWeek((w) => (w < 52 ? w + 1 : w))}
            className={`${styles.smallButton}`}
          >
            Next &gt;
          </button>
        </div>
      </div>

      {/* Grouped Weekly Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-6">
        {/* 📊 Equity & Performance */}
        <div className="space-y-4">
          <h4 className="text-lg font-bold text-white mb-2">
            Equity & Performance
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Starting Equity */}
            <div className="bg-gray-700 p-4 rounded-xl shadow">
              <h5 className="text-sm font-semibold opacity-75">
                Starting Equity
              </h5>
              <p className="text-xl font-bold mt-1">
                ${fmt2(weekData.startEquity)}
              </p>
            </div>

            {/* Total P&L */}
            <div className="bg-gray-700 p-4 rounded-xl shadow">
              <h5 className="text-sm font-semibold opacity-75">Total P&L</h5>
              <p
                className={`text-xl font-bold mt-1 ${
                  weekData.totalPnL >= 0 ? "text-green-400" : "text-red-400"
                }`}
              >
                ${fmt2(weekData.totalPnL)}
              </p>
            </div>

            {/* Total Trades */}
            <div className="bg-gray-700 p-4 rounded-xl shadow">
              <h5 className="text-sm font-semibold opacity-75">Total Trades</h5>
              <p className="text-xl font-bold mt-1">
                {weekData.trades.length}
              </p>
            </div>

            {/* Weekly % */}
            <div className="bg-gray-700 p-4 rounded-xl shadow col-span-1 md:col-span-2">
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

            {/* Ending Equity */}
            <div className="bg-gray-700 p-4 rounded-xl shadow">
              <h5 className="text-sm font-semibold opacity-75">Ending Equity</h5>
              <p className="text-xl font-bold mt-1">
                ${fmt2(weekData.endEquity)}
              </p>
            </div>
          </div>
        </div>

        {/* 💱 Pair Analysis */}
        <div className="space-y-4">
          <h4 className="text-lg font-bold text-white mb-2">Pair Analysis</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Most Traded Pair */}
            <div className="bg-gray-700 p-4 rounded-xl shadow">
              <h5 className="text-sm font-semibold opacity-75">
                Most Traded Pair
              </h5>
              <p className="text-xl font-bold mt-1">
                {weekData.mostTradedPair || "—"}
              </p>
            </div>

            {/* Most Profitable Pair */}
            <div className="bg-gray-700 p-4 rounded-xl shadow">
              <h5 className="text-sm font-semibold opacity-75">
                Most Profitable Pair
              </h5>
              <p className="text-xl font-bold mt-1 text-green-400">
                {weekData.mostProfitablePair || "—"}
              </p>
            </div>

            {/* Most Losing Pair */}
            <div className="bg-gray-700 p-4 rounded-xl shadow">
              <h5 className="text-sm font-semibold opacity-75">
                Most Losing Pair
              </h5>
              <p className="text-xl font-bold mt-1 text-red-400">
                {weekData.mostLosingPair || "—"}
              </p>
            </div>

            {/* Breakeven Pairs */}
            <div className="bg-gray-700 p-4 rounded-xl shadow">
              <h5 className="text-sm font-semibold opacity-75">
                Breakeven Pairs
              </h5>
              <p className="text-xl font-bold mt-1">
                {weekData.breakevenPairs && weekData.breakevenPairs.length > 0
                  ? weekData.breakevenPairs.join(", ")
                  : "—"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* --- Daily Breakdown Section --- */}
      <div className="mt-8">
        <h4 className="text-xl font-bold mb-4 text-white">Daily Breakdown</h4>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm border border-gray-700 rounded-lg overflow-hidden">
            <thead className="bg-gray-800 text-gray-300">
              <tr>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Day</th>
                <th className="px-4 py-2">Wins</th>
                <th className="px-4 py-2">Losses</th>
                <th className="px-4 py-2">Breakeven</th>
                <th className="px-4 py-2">P&L ($)</th>
                <th className="px-4 py-2">P&L (%)</th>
                <th className="px-4 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {dailyBreakdown.length > 0 ? (
                dailyBreakdown.map((data) => {
                  const dateKey = data.dateKey;
                  const pct =
                    typeof data.totalPnL === "number" && capital
                      ? Number(((data.totalPnL / capital) * 100).toFixed(2))
                      : 0;

                  return (
                    <tr
                      key={data.id}
                      className="border-t border-gray-700 text-gray-300"
                    >
                      <td className="px-4 py-3">
                        {dateKey
                          ? new Date(dateKey).toLocaleDateString("en-GB")
                          : dateKey}
                      </td>
                      <td className="px-4 py-3">{data.day}</td>
                      <td className="px-4 py-3">{data.wins}</td>
                      <td className="px-4 py-3">{data.losses}</td>
                      <td className="px-4 py-3">{data.breakeven}</td>
                      <td
                        className={`px-4 py-3 font-semibold ${
                          data.totalPnL >= 0
                            ? "text-green-500"
                            : "text-red-500"
                        }`}
                      >
                        ${fmt2(data.totalPnL)}
                      </td>
                      <td
                        className={`px-4 py-3 font-semibold flex items-center space-x-1 ${
                          pct >= 0 ? "text-green-500" : "text-red-500"
                        }`}
                      >
                        {pct >= 0 ? (
                          <>
                            <span>▲</span>
                            <span>{fmt2(pct)}%</span>
                          </>
                        ) : (
                          <>
                            <span>▼</span>
                            <span>{fmt2(Math.abs(pct))}%</span>
                          </>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => openDailyDetails(data.dateKey, data.id)}
                          className="text-sm px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded"
                        >
                          More
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td
                    colSpan="9"
                    className="text-center py-4 text-gray-500"
                  >
                    No daily data.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
{/* ✅ Weekly Equity Growth Chart */}
<div className="mt-10 bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-700">
  <h4 className="text-xl font-bold mb-4 text-white">Weekly Equity Growth</h4>
  {weeklyEquityData.length > 0 ? (
 <ResponsiveContainer width="100%" height={300}>
  <LineChart data={weeklyEquityData}>
    <CartesianGrid strokeDasharray="3 3" stroke="#444" />
    <XAxis dataKey="label" stroke="#ccc" />
    <YAxis
      stroke="#ccc"
      domain={['dataMin - 100', 'dataMax + 100']}
      tickFormatter={(value) => `$${value}`}
    />
    <Tooltip
      contentStyle={{
        backgroundColor: '#2d3748',
        border: 'none',
        borderRadius: '8px',
      }}
        labelStyle={{ color: '#fff' }}
  itemSorter={(a, b) => {
    // Fallback if name is missing
    if (!a?.name || !b?.name) return 0;

    const order = { Target: 1, Equity: 2, Drawdown: 3 };
    return (order[a.name] || 99) - (order[b.name] || 99);
  }}
/>

    {/* Equity Line */}
    <Line
      type="monotone"
      dataKey="equity"
      name="Equity"   // ✅ shows "Equity : 1040"
      stroke="#b7c2ea"
      strokeWidth={2}
      dot={{ r: 4 }}
    />

    {/* Target Line */}
    <Line
      type="monotone"
      dataKey="target"
      name="Target"   // ✅ tooltip will show "Target : 1100"
      stroke="#0ce60f"
      strokeDasharray="5 5"
      strokeWidth={2}
      dot={false}
    />

    {/* Drawdown Line */}
    <Line
      type="monotone"
      dataKey="drawdown"
      name="Drawdown"  // ✅ tooltip will show "Drawdown : 900"
      stroke="red"
      strokeDasharray="5 5"
      strokeWidth={2}
      dot={false}
    />
  </LineChart>
</ResponsiveContainer>


  ) : (
    <p className="text-gray-400">No equity data for this week.</p>
  )}
</div>
{/* Daily Risk Used (replica from Dashboard) */}
<div className="bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-700 mt-6">
  <h3 className="text-lg font-semibold text-white mb-4">Daily Risk Used</h3>
  <div className="h-64 md:h-80">
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={weeklyDailyRiskData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#4a5568" />

        {/* X-Axis with formatted dates */}
        <XAxis
          dataKey="date"
          stroke="#cbd5e0"
          tickFormatter={(d) => {
            const dt = new Date(d);
            return dt.toLocaleDateString("en-GB", {
              weekday: "short",
              day: "numeric",
              month: "short",
            });
          }}
        />

        {/* Y-Axis with percentage format */}
        <YAxis
          stroke="#cbd5e0"
          domain={riskDomain}
          tickFormatter={(v) => `${v}%`}
        />

        {/* Tooltip */}
        <Tooltip
          contentStyle={{
            backgroundColor: "#2d3748",
            border: "none",
            borderRadius: "8px",
          }}
          labelStyle={{ color: "#fff" }}
        />

        {/* Horizontal ReferenceLine for each day's risk */}
        {weeklyDailyRiskData.map((item) => (
          <ReferenceLine
            key={item.date}
            y={item.risk}
            stroke="#7dd3fc"
            strokeDasharray="4 4"
            label={{
              position: "right",
              value: `${new Date(item.date).toLocaleDateString("en-GB", {
                weekday: "short",
              })} ${item.risk}%`,
              fill: "#7dd3fc",
            }}
          />
        ))}

        {/* Risk Line */}
        <Line
          type="monotone"
          dataKey="risk"
          stroke="#82ca9d"
          strokeWidth={2}
          dot={{ stroke: "#82ca9d", strokeWidth: 2, r: 4 }}
        />

        {/* Daily Limit Line */}
        <Line
          type="monotone"
          dataKey="dailyLimit"
          stroke="#ff7300"
          dot={false}
          strokeDasharray="5 5"
          strokeWidth={2}
        />
      </LineChart>
    </ResponsiveContainer>
  </div>
</div>

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
  <div className="space-y-4">
    {selectedDayTrades.length === 0 ? (
      <p className="text-gray-400">No trades for this day.</p>
    ) : (
      selectedDayTrades.map((t) => (
        <div
          key={t.id}
          className="bg-gray-700 p-3 rounded-md border border-gray-600"
        >
          {/* Pair + Action */}
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm text-gray-300">Pair</p>
              <p className="font-semibold text-white">{t.pair}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-300">Action</p>
              <p
                className={`font-semibold ${
                  t.type === "long" ? "text-green-400" : "text-red-400"
                }`}
              >
                {t.type === "long" ? "Long (L)" : "Short (S)"}
              </p>
            </div>
          </div>

          {/* Trade Details */}
          <div className="grid grid-cols-2 gap-3 mt-3 text-sm text-gray-300">
            <div>
              <p className="text-xs text-gray-400">Entry Date</p>
              <p>{t.entryDate || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Exit Date</p>
              <p>{t.exitDate || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Entry Price</p>
              <p>{t.entryPrice ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Exit Price</p>
              <p>{t.exitPrice ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Lot Size</p>
              <p>{t.lotSize != null ? fmt2(t.lotSize) : "—"}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Risk (%) Used</p>
              <p>{t.risk != null ? fmt2(t.risk) + "%" : "—"}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Stop Loss</p>
              <p>{t.stopLoss ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Take Profit</p>
              <p>{t.takeProfit ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Ratio</p>
              <p>{t.ratio ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Status</p>
              <p className="capitalize">{t.status || "—"}</p>
            </div>

            {/* PnL */}
            <div className="col-span-2">
              <p className="text-xs text-gray-400">P&L ($) / P&L (%)</p>
              <p
                className={`${
                  t.pnlCurrency >= 0 ? "text-green-400" : "text-red-400"
                } font-semibold`}
              >
                ${fmt2(t.pnlCurrency)} —{" "}
                {fmt2(
                  t.pnlPercent ??
                    (t.pnlPercent === 0
                      ? 0
                      : t.pnlCurrency && capital
                      ? (t.pnlCurrency / capital) * 100
                      : 0)
                )}
                %
              </p>
            </div>
          </div>

          {/* Before / After Images */}
          <div className="flex gap-3 mt-3">
            {/* Before Image */}
            <div className="w-36 h-24 bg-gray-600 rounded flex flex-col overflow-hidden">
              {t.beforeImage ? (
                <>
                  <button
                    onClick={() => setImagePreview(t.beforeImage)}
                    className="w-full h-20 overflow-hidden"
                    aria-label="Preview before image"
                  >
                    <img
                      src={t.beforeImage}
                      alt="Before trade"
                      className="w-full h-full object-cover"
                    />
                  </button>
                  <a
                    href={t.beforeImage}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-400 underline mt-1 px-1"
                  >
                    View Before Image
                  </a>
                </>
              ) : (
                <span className="text-gray-400 p-2">No before image</span>
              )}
            </div>

            {/* After Image */}
            <div className="w-36 h-24 bg-gray-600 rounded flex flex-col overflow-hidden">
              {t.afterImage ? (
                <>
                  <button
                    onClick={() => setImagePreview(t.afterImage)}
                    className="w-full h-20 overflow-hidden"
                    aria-label="Preview after image"
                  >
                    <img
                      src={t.afterImage}
                      alt="After trade"
                      className="w-full h-full object-cover"
                    />
                  </button>
                  <a
                    href={t.afterImage}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-400 underline mt-1 px-1"
                  >
                    View After Image
                  </a>
                </>
              ) : (
                <span className="text-gray-400 p-2">No after image</span>
              )}
            </div>
          </div>

          {/* Notes / Strategy / Session */}
          <div className="mt-3 grid grid-cols-1 gap-3 text-sm">
            {/* Note */}
            <div>
              <label className="text-xs text-gray-400">Note</label>
              <p className="mt-1 p-2 bg-gray-800 text-white rounded">
                {t.note || "—"}
              </p>
            </div>

            {/* Strategy */}
            <div>
              <label className="text-xs text-gray-400">Strategy</label>
              <p className="mt-1 p-2 bg-gray-800 text-white rounded">
                {t.strategy || "—"}
              </p>
            </div>

            {/* Session */}
            <div>
              <label className="text-xs text-gray-400">Session</label>
              <p className="mt-1 p-2 bg-gray-800 text-white rounded">
                {t.session || "—"}
              </p>
            </div>
          </div>
        </div>
      ))
    )}

    <div className="flex justify-end mt-4">
      <button className={`${styles.smallButton}`} onClick={closeDailyDetails}>
        Close
      </button>
    </div>
  </div>
</Modal>
 </div>
);
}
case "settings":
  return (
    <div className="flex max-w-7xl mx-auto py-8 text-gray-200">
      {/* Sidebar */}
      <aside className="w-64 mr-8 bg-gray-900 rounded-2xl shadow-lg border border-gray-700 p-6">
        <h2 className="text-xl font-bold mb-6 text-white">Settings</h2>
        <nav className="space-y-3">
          {/* User Settings */}
          <button
            onClick={() => setSettingsView("user")}
            className={`block w-full text-left px-4 py-2 rounded-lg transition ${
              settingsView === "user"
                ? "bg-purple-600 text-white font-semibold"
                : "bg-gray-800 hover:bg-gray-700 text-gray-300"
            }`}
          >
            User Settings
          </button>

          {/* Theme */}
          <button
            onClick={() => setSettingsView("theme")}
            className={`block w-full text-left px-4 py-2 rounded-lg transition ${
              settingsView === "theme"
                ? "bg-purple-600 text-white font-semibold"
                : "bg-gray-800 hover:bg-gray-700 text-gray-300"
            }`}
          >
            Theme
          </button>

          {/* Deposit & Withdrawal (only if enabled in user settings) */}
          {userSettings?.depositEnabled && (
            <button
              onClick={() => setSettingsView("funds")}
              className={`block w-full text-left px-4 py-2 rounded-lg transition ${
                settingsView === "funds"
                  ? "bg-purple-600 text-white font-semibold"
                  : "bg-gray-800 hover:bg-gray-700 text-gray-300"
              }`}
            >
              Deposit & Withdrawal
            </button>
          )}

          {/* Data Management */}
          <button
            onClick={() => setSettingsView("data")}
            className={`block w-full text-left px-4 py-2 rounded-lg transition ${
              settingsView === "data"
                ? "bg-purple-600 text-white font-semibold"
                : "bg-gray-800 hover:bg-gray-700 text-gray-300"
            }`}
          >
            Data Management
          </button>

          {/* Logout */}
          <button
            onClick={() => setSettingsView("logout")}
            className={`block w-full text-left px-4 py-2 rounded-lg transition ${
              settingsView === "logout"
                ? "bg-red-600 text-white font-semibold"
                : "bg-gray-800 hover:bg-gray-700 text-gray-300"
            }`}
          >
            Logout
          </button>
        </nav>
      </aside>

      {/* Content area */}
      <main className="flex-1 bg-gray-800 rounded-2xl shadow-lg border border-gray-700 p-8">
        {/* User Settings */}
        {settingsView === "user" && (
          <div>
            <h2 className="text-2xl font-bold mb-6 text-white">User Settings</h2>
            <UserSettingsForm
              onSave={(settings) => {
                setUserSettings(settings);

                if (settings.startingCapital) setCapital(settings.startingCapital);
                if (settings.accountName) {
                  setFormData((prev) => ({
                    ...prev,
                    accountName: settings.accountName,
                  }));
                }
                if (settings.accountPlan) {
                  setFormData((prev) => ({
                    ...prev,
                    accountPlan: settings.accountPlan,
                  }));
                }
                if (settings.accountType) {
                  setFormData((prev) => ({
                    ...prev,
                    accountType: settings.accountType,
                  }));
                }

                localStorage.setItem("userSettings", JSON.stringify(settings));

                if (journalDocRef) {
                  setDoc(journalDocRef, { userSettings: settings }, { merge: true });
                }
              }}
            />
          </div>
        )}

        {/* Theme */}
        {settingsView === "theme" && (
          <div>
            <h2 className="text-2xl font-bold mb-6 text-white">Theme</h2>
            <button onClick={handleThemeToggle} className={styles.smallButton}>
              Switch to {theme === "dark" ? "Light" : "Dark"} Theme
            </button>
          </div>
        )}

        {/* Deposit & Withdrawal */}
        {settingsView === "funds" && userSettings?.depositEnabled && (
          <div>
            <h2 className="text-2xl font-bold mb-6 text-white">Deposit & Withdrawal</h2>

            {/* Deposit Section */}
            {userSettings?.depositEnabled && (
              <div className="mb-8 p-4 bg-gray-900 rounded-lg shadow">
                <h3 className="text-lg font-semibold text-green-400 mb-3">Deposit</h3>
                <input
                  type="number"
                  placeholder="Enter amount ($)"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  className="w-full p-2 rounded bg-gray-800 border border-gray-700 text-white mb-3"
                />
                <button
                  onClick={handleFundsDeposit}
                  className="bg-green-600 hover:bg-green-700 text-white font-medium px-6 py-2 rounded-lg"
                >
                  Deposit
                </button>
              </div>
            )}

            {/* Withdrawal Section */}
            {userSettings?.withdrawalEnabled && (
              <div className="p-4 bg-gray-900 rounded-lg shadow">
                <h3 className="text-lg font-semibold text-red-400 mb-3">Withdrawal</h3>
                <input
                  type="number"
                  placeholder="Enter amount ($)"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  className="w-full p-2 rounded bg-gray-800 border border-gray-700 text-white mb-3"
                />
                <button
                  onClick={handleFundsWithdrawal}
                  className="bg-red-600 hover:bg-red-700 text-white font-medium px-6 py-2 rounded-lg"
                >
                  Withdraw
                </button>
              </div>
            )}
          </div>
        )}

       {/* Data Management Section */}
{settingsView === "data" && (
  <div className="space-y-4 mt-4">
    {/* Export */}
    <button
      onClick={handleExportData}
      className="w-full bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-medium transition"
    >
      Export Data
    </button>

    {/* Import */}
    <div>
      <input
        type="file"
        accept="application/json"
        onChange={handleImportData}
        id="import-file"
        className="hidden"
      />
      <label
        htmlFor="import-file"
        className="w-full block text-center bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg font-medium cursor-pointer transition"
      >
        Import Data
      </label>
    </div>

    {/* Reset */}
    <button
      onClick={handleResetAccount}
      className="w-full bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg font-medium transition"
    >
      Reset Account
    </button>
  </div>
)}


        {/* Logout */}
        {settingsView === "logout" && (
          <div>
            <h2 className="text-2xl font-bold mb-6 text-white">Logout</h2>
            <button
              onClick={handleLogout}
              className="bg-red-600 text-white font-medium py-2 px-6 rounded-full shadow-lg hover:bg-red-700 transition-colors duration-200"
            >
              Logout
            </button>
          </div>
        )}
      </main>
    </div>
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
  // 🔑 If no user → show AuthPage (email/password + Google login)
  return <AuthPage onLogin={setUserId} />;
}

// ✅ Main app after login
return (
  <div
    className={`min-h-screen font-sans ${
      theme === "dark"
        ? "bg-gray-900 text-white"
        : "bg-gray-100 text-gray-900"
    }`}
  >
    {!userSettings ? (
      <UserSettingsForm onSave={setUserSettings} />
    ) : (
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
    )}
  </div>
);
}
