import React, { useState, useMemo, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea } from "recharts";
import { getFirestore, doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";
import { registerUser, loginUser, logoutUser } from "./authService"; // ✅ using helper functions only
import LoginPage from "./LoginPage";
import {collection, addDoc, updateDoc, deleteDoc, query, orderBy } from "firebase/firestore";
import { auth, db } from "./firebase"; // ✅ no getAuth(app) inside App.jsx anymore
import { onAuthStateChanged, signInWithCustomToken, signInAnonymously } from "firebase/auth";


// Inline SVG for icons to avoid external dependencies
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

const DashboardCard = ({ title, value, color }) => (
  <div className="p-6 rounded-2xl shadow-lg transition-all duration-300 transform hover:scale-105 backdrop-blur-md bg-white/10 border border-white/20 text-white">
    <h3 className="text-sm font-semibold opacity-75">{title}</h3>
    <p className="text-3xl font-bold mt-2 truncate">{value}</p>
  </div>
);

// Custom Modal component
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

// Helper function to get the week number of a date
const getWeekNumber = (d) => {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  // Thursday in current week decides the year.
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  // January 4 is always in week 1.
  const week1 = new Date(date.getFullYear(), 0, 4);
  // Adjust to Thursday in week 1 and count number of weeks from date to week1.
  return (
    1 +
    Math.round(
      ((date.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7
    )
  );
};
const formatDate = (dateStr) => {
  return new Date(dateStr).toLocaleDateString("en-GB");
};
// Helper to generate unique trade ID
const generateTradeId = () =>
  `${Date.now()}-${Math.floor(Math.random() * 100000)}`;

const getMinMaxEquity = (data) => {
  if (!data || data.length === 0) {
    return { min: 0, max: 0 };
  }
  const equities = data.map((d) => d.equity);
  const min = Math.min(...equities);
  const max = Math.max(...equities);
  // Add some padding to the domain
  const paddedMin = Math.floor(min / 50) * 50 - 50;
  const paddedMax = Math.ceil(max / 50) * 50 + 50;
  return { min: paddedMin, max: paddedMax };
};

// Classify trade outcome relative to risk
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

// New function to process trade data for the weekly equity chart
const processWeeklyEquityData = (trades) => {
  if (!trades || trades.length === 0) {
    return [];
  }

  // Sort trades by date to ensure correct chronological processing
  const sortedTrades = [...trades].sort(
    (a, b) => new Date(a.exitDate) - new Date(b.exitDate)
  );

  const getWeekNumber = (d) => {
    const date = new Date(d);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + 4 - (date.getDay() || 7));
    const yearStart = new Date(date.getFullYear(), 0, 1);
    const weekNo = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
    return weekNo;
  };

  const weeklyDataMap = new Map();
  let cumulativeEquity = 1000; // Starting capital

  // First pass: aggregate PnL per week
  sortedTrades.forEach((trade) => {
    const weekNum = getWeekNumber(new Date(trade.exitDate));
    if (!weeklyDataMap.has(weekNum)) {
      weeklyDataMap.set(weekNum, 0);
    }
    weeklyDataMap.set(
      weekNum,
      weeklyDataMap.get(weekNum) + trade.pnlCurrency
    );
  });

  // Second pass: calculate cumulative equity for each week
  const weeklyEquityData = [];
  const sortedWeeks = Array.from(weeklyDataMap.keys()).sort((a, b) => a - b);

  sortedWeeks.forEach((week) => {
    const weeklyPnl = weeklyDataMap.get(week);
    cumulativeEquity += weeklyPnl;
    weeklyEquityData.push({
      week: `Week ${week}`,
      equity: Number(cumulativeEquity.toFixed(2)),
    });
  });

  return weeklyEquityData;
};

// Fixed journal document ID
const JOURNAL_ID = "main";

// ------------------- AUTH PAGE (inline) -------------------
const AuthPage = ({ onLogin }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleLoginClick = async () => {
    try {
      // using the authService helper
      const user = await loginUser(email.trim(), password);
      if (user) onLogin(user.uid);
    } catch (err) {
      console.error("Login failed:", err);
      setError(err.message || "Login error");
    }
  };

  const handleSignupClick = async () => {
    try {
      const user = await registerUser(email.trim(), password);
      if (user) onLogin(user.uid);
    } catch (err) {
      console.error("Signup failed:", err);
      setError(err.message || "Signup error");
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white">
      <div className="bg-gray-800 p-8 rounded-xl shadow-lg w-full max-w-md">
        <h2 className="text-2xl font-bold mb-6 text-center">Sign In / Sign Up</h2>

        {error && <div className="mb-4 text-red-400 text-sm">{error}</div>}

        <input
          type="email"
          placeholder="Email"
          className="w-full mb-4 px-3 py-2 rounded bg-gray-700 focus:outline-none"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          type="password"
          placeholder="Password"
          className="w-full mb-4 px-3 py-2 rounded bg-gray-700 focus:outline-none"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button
          onClick={handleLoginClick}
          className="w-full py-2 mb-3 bg-blue-600 hover:bg-blue-700 rounded"
        >
          Log In
        </button>

        <button
          onClick={handleSignupClick}
          className="w-full py-2 bg-green-600 hover:bg-green-700 rounded"
        >
          Sign Up
        </button>
      </div>
    </div>
  );
};
// ----------------- end AuthPage block ---------------------


export default function App() {
    // --- Firestore Setup & State ---
    const [userId, setUserId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [theme, setTheme] = useState('dark');
    const [capital, setCapital] = useState(1000);
    const [newCapital, setNewCapital] = useState(1000);
    const [dailyDetailsOpen, setDailyDetailsOpen] = useState(false);
    // For image preview
    const [imagePreview, setImagePreview] = useState(null);
    const [session, setSession] = useState("");
    const [selectedDay, setSelectedDay] = useState(null); // 'YYYY-MM-DD' string
    const [selectedDayTrades, setSelectedDayTrades] = useState([]);

    const handleSignup = async () => {
    try {
      const user = await registerUser("test@example.com", "password123");
      setUserId(user.uid);
      console.log("Signed up:", user.uid);
    } catch (err) {
      console.error("Signup error:", err.message);
    }
  };

  const handleLogin = async () => {
    try {
      const user = await loginUser("test@example.com", "password123");
      setUserId(user.uid);
      console.log("Logged in:", user.uid);
    } catch (err) {
      console.error("Login error:", err.message);
    }
  };

 const handleLogout = async () => {
    await logoutUser();
    setUserId(null);
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


    const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
    const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
    const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// --- Firebase Auth State Listener ---
useEffect(() => {
  try {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUserId(user.uid);
      } else {
        if (initialAuthToken) {
          await signInWithCustomToken(auth, initialAuthToken).catch(console.error);
        } else {
          await signInAnonymously(auth).catch(console.error);
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  } catch (e) {
    console.error("Firebase initialization failed:", e);
    setLoading(false);
  }
}, [initialAuthToken]);



const tradesCollectionRef = userId
  ? collection(db, "users", userId, "tradingJournal", JOURNAL_ID, "trades")
  : null;


// --- Real-time Data Listener with onSnapshot ---
useEffect(() => {
  if (!tradesCollectionRef) return;

  const q = query(tradesCollectionRef, orderBy("createdAt", "desc"));

  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const allTrades = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setTradesOpen(allTrades.filter((t) => t.status === "open"));
      setTradesHistory(allTrades.filter((t) => t.status !== "open"));
    },
    (error) => {
      console.error("Error listening to trades:", error);
    }
  );

  return () => unsubscribe();
}, [tradesCollectionRef]);


    // --- State Management ---
    const [formData, setFormData] = useState({
        accountType: "Mini",
        pair: "",
        type: "long",
        entryDate: new Date().toISOString().slice(0, 10),
        price: "",
        sl: "",
        tp: "",
        risk: "2.0",
        beforeImage: null,   // 👈 new
    });
    const [modalAfterImage, setModalAfterImage] = useState(null); // 👈 new for close order
    const [tradesOpen, setTradesOpen] = useState([]);
    const [tradesHistory, setTradesHistory] = useState([]);
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

    const calculateStopLossPoints_live = (fd = formData) => {
        const entry = parseNumber(fd.price);
        const stop = parseNumber(fd.sl);
        if (!entry || !stop || !fd.pair) return 0;
        const raw = fd.type === "long" ? entry - stop : stop - entry;
        const mult = getMultiplier(fd.pair);
        return Math.round(raw * mult);
    };

    const calculateTakeProfitPoints_live = (fd = formData) => {
        const entry = parseNumber(fd.price);
        const take = parseNumber(fd.tp);
        if (!entry || !take || !fd.pair) return 0;
        const raw = fd.type === "long" ? take - entry : entry - take;
        const mult = getMultiplier(fd.pair);
        return Math.round(raw * mult);
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
   const trade = {
    accountType: formData.accountType,
    pair: formData.pair,
    type: formData.type,
    entryDate: formData.entryDate,
    entryPrice: parseNumber(formData.price),
    sl: parseNumber(formData.sl),
    tp: parseNumber(formData.tp),
    risk: newTradeRisk,
    lotSize: Number(calculateLotSize_live(formData).toFixed(4)),
    valuePerPip: getAdjustedVP(formData.pair, formData.accountType),
    status: "open",
    ratio: null, // optional: add calc if needed
    beforeImage: formData.beforeImage || null,
    createdAt: new Date().toISOString(), // ✅ timestamp for ordering
    session,
  };

  // Update state
  const updatedTradesOpen = [...tradesOpen, trade];
  setTradesOpen(updatedTradesOpen);

  try {
    if (tradesCollectionRef) {
      await addDoc(tradesCollectionRef, trade);
      console.log("Trade saved:", trade);

      // Update local state (optimistic update)
      setTradesOpen((prev) => [...prev, trade]);
    }
  } catch (err) {
    console.error("Error saving trade:", err);
  }

  // Reset form
  setFormData((prev) => ({
    ...prev,
    pair: "",
    type: "long",
    price: "",
    sl: "",
    tp: "",
    risk: "2.0",
    beforeImage: "", // ✅ reset image URL input
  }));
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
  // support backwards compatibility: use entryPrice, fall back to price
  const entry = parseNumber(trade.entryPrice ?? trade.price ?? 0);
  const mult = getMultiplier(trade.pair);
  const pointsSigned = trade.type === "long" ? (exit - entry) * mult : (entry - exit) * mult;
  const lot = Number(trade.lotSize) || 0;
  const vpp = Number(trade.valuePerPip) || 0;
  const expectedCurrency = lot * vpp * pointsSigned;
  return Number(expectedCurrency);
        const sl = parseNumber(formData.sl);
        const tp = parseNumber(formData.tp);
        let ratio = null;
        if (entry && sl && tp) {
            if (formData.type === "long") {
                ratio = (tp - entry) / (entry - sl);
            } else {
                ratio = (entry - tp) / (sl - entry);
            }
            ratio = Number(ratio.toFixed(2));
        }
    };

const handleSaveClose = async () => {
  const trade = tradesOpen.find((t) => t.id === selectedTradeId);
  if (!trade) return;

  const exitPriceNum = parseNumber(modalExitPrice);
  const actualPnLNum = parseNumber(modalActualPnL);
  const exitDate = modalExitDate || new Date().toISOString().slice(0, 10);

  const mult = getMultiplier(trade.pair);
  const pointsSigned =
    trade.type === "long"
      ? Math.round((exitPriceNum - trade.entryPrice) * mult)
      : Math.round((trade.entryPrice - exitPriceNum) * mult);

  const pnlPercent = capital ? (actualPnLNum / capital) * 100 : 0;

  const before = trade.beforeImage && isValidUrl(trade.beforeImage)
    ? String(trade.beforeImage).trim()
    : null;

  const after = modalAfterImage && isValidUrl(modalAfterImage)
    ? String(modalAfterImage).trim()
    : null;

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
    pnlCurrency: actualPnLNum,
    status: modalStatus,
    risk: trade.risk,
    stopLoss: trade.sl,
    takeProfit: trade.tp,
    ratio: trade.ratio ?? null,
    beforeImage: before,
    afterImage: after,
    session: trade.session || null, // ✅ preserve session
  };

  try {
    const updatedTradesOpen = tradesOpen.filter((t) => t.id !== trade.id);
    const updatedTradesHistory = [...tradesHistory, closed];

    setTradesOpen(updatedTradesOpen);
    setTradesHistory(updatedTradesHistory);

const tradeRef = doc(
  db,
  "users",
  userId,
  "tradingJournal",
  JOURNAL_ID,
  "trades",
  trade.id
);
await updateDoc(tradeRef, closedTrade);


  } catch (e) {
    console.error("Error updating trade:", e);
  }

  setModalOpen(false);
  setSelectedTradeId(null);
  setModalExitDate("");
  setModalExitPrice("");
  setModalActualPnL("");
  setModalStatus("active");
};




// Save edited trade from modal (recalculates points & pnlCurrency)
const handleSaveEditedTrade = async () => {
  if (!editingTrade) return;
  console.log("Editing Trade before save:", editingTrade);

  try {
    const exitPriceNum = parseNumber(editingTrade.exitPrice);
    const entryPriceNum = parseNumber(
      editingTrade.entryPrice ?? editingTrade.price ?? 0
    );
    const mult = getMultiplier(editingTrade.pair);

    // ✅ Same points logic as handleSaveClose
    const points =
      editingTrade.type === "long"
        ? Math.round((exitPriceNum - entryPriceNum) * mult)
        : Math.round((entryPriceNum - exitPriceNum) * mult);

    // ✅ Same PnL logic as handleSaveClose
    const pnlCurrency = Number(
      (editingTrade.lotSize * editingTrade.valuePerPip * points).toFixed(2)
    );
    const pnlPercent = capital
      ? Number(((pnlCurrency / capital) * 100).toFixed(2))
      : 0;

    const updatedTrade = {
      ...editingTrade,
      exitPrice: exitPriceNum,
      exitDate: editingTrade.exitDate,
      points,
      pnlCurrency,
      pnlPercent,
       session: editingTrade.session || null, // ✅ preserve session
    };

    // ✅ Update local state
    setTradesHistory((prev) =>
      prev.map((t) => (t.id === updatedTrade.id ? updatedTrade : t))
    );
    setTradesOpen((prev) =>
      prev.map((t) => (t.id === updatedTrade.id ? updatedTrade : t))
    );

    // ✅ Update in Firestore (subcollection doc, not whole journal)
const tradeRef = doc(
  db,
  "users",
  userId,
  "tradingJournal",
  JOURNAL_ID,
  "trades",
  updatedTrade.id
);
await updateDoc(tradeRef, updatedTrade);


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
  console.log("Deleting trade:", tradeId); // debug
  try {
    // ✅ Update local state first (optimistic update)
    setTradesHistory((prev) => prev.filter((t) => t.id !== tradeId));
    setTradesOpen((prev) => prev.filter((t) => t.id !== tradeId));

    // ✅ Delete specific trade document in Firestore
const tradeRef = doc(
  db,
  "users",
  userId,
  "tradingJournal",
  JOURNAL_ID,
  "trades",
  tradeId
);
await deleteDoc(tradeRef);


    // ✅ Close edit modal if open
    setIsEditModalOpen(false);
    setEditingTrade(null);

    console.log("Trade successfully deleted:", tradeId);
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
        return processWeeklyEquityData(allTrades);
    }, [tradesHistory, tradesOpen]);

    // Memoized data for the daily risk chart
    const dailyRiskData = useMemo(() => {
        const allTrades = [...tradesHistory, ...tradesOpen];
        const dailyRiskMap = allTrades.reduce((acc, trade) => {
            const date = trade.entryDate;
            if (!acc[date]) {
                acc[date] = 0;
            }
            if (trade.status === 'open' || trade.status === 'active') {
                acc[date] += trade.risk;
            }
            return acc;
        }, {});
        // Convert the map to an array of objects for the chart
        const sortedDates = Object.keys(dailyRiskMap).sort((a, b) => new Date(a) - new Date(b));
        return sortedDates.map(date => ({
            date,
            risk: Number(dailyRiskMap[date].toFixed(2)),
            dailyLimit: DAILY_RISK_LIMIT_PERCENT
        }));
    }, [tradesHistory, tradesOpen]);
            // --- Weekly view: filter dailyRiskData to only dates inside the selected week
const weeklyDailyRiskData = useMemo(() => {
  if (!dailyRiskData || dailyRiskData.length === 0) return [];

  // Keep only entries whose week number matches the selectedWeek
  return dailyRiskData
    .filter(item => {
      const d = new Date(item.date);
      return getWeekNumber(d) === selectedWeek;
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}, [dailyRiskData, selectedWeek]);

console.log("weeklyDailyRiskData (for selectedWeek):", selectedWeek, weeklyDailyRiskData);

// --- Weekly Review Calculations ---
const weeklyReviewData = useMemo(() => {
    const weeks = {};
    let runningEquity = capital;

    // Sort trades by exit date to calculate cumulative equity correctly
    const sortedHistory = [...tradesHistory].sort((a, b) => new Date(a.exitDate) - new Date(b.exitDate));

    // First pass: calculate all weekly stats and a running equity for each trade
    const tradesWithEquity = sortedHistory.map(trade => {
        runningEquity += trade.pnlCurrency;
        return {
            ...trade,
            week: getWeekNumber(new Date(trade.exitDate)),
            dayOfWeek: new Date(trade.exitDate).getDay(),
            equityAfter: runningEquity
        };
    });

    // Second pass: group by week and calculate weekly stats
    tradesWithEquity.forEach(trade => {
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
                endEquity: 0
            };
        }
        weeks[week].trades.push(trade);
    });

    // Final calculations for each week
    let lastWeekEquity = capital;
    for (let i = 1; i <= 52; i++) {
        if (weeks[i]) {
            weeks[i].startEquity = lastWeekEquity;
            weeks[i].totalPnL = weeks[i].trades.reduce((sum, t) => sum + t.pnlCurrency, 0);
            weeks[i].weeklyPnLPercent = (weeks[i].totalPnL / capital) * 100;
            weeks[i].wins = weeks[i].trades.filter(t => classifyTrade(t, capital) === "win").length;
            weeks[i].losses = weeks[i].trades.filter(t => classifyTrade(t, capital) === "loss").length;
            weeks[i].breakeven = weeks[i].trades.filter(t => classifyTrade(t, capital) === "breakeven").length;
            weeks[i].endEquity = weeks[i].startEquity + weeks[i].totalPnL;
            lastWeekEquity = weeks[i].endEquity;
        } else {
            weeks[i] = {
                trades: [],
                totalPnL: 0,
                weeklyPnLPercent: 0,
                wins: 0,
                losses: 0,
                breakeven: 0,
                startEquity: lastWeekEquity,
                endEquity: lastWeekEquity
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
    endEquity: 0
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
                    <div className="space-y-8 max-w-7xl mx-auto py-8 text-gray-200">
                        <div className="text-sm text-gray-400">
                            User ID: <span className="font-mono break-all">{userId}</span>
                        </div>
                        {/* New Block */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            <DashboardCard
                                title="Total Trades"
                                value={dashboardStats.totalTrades}
                            />
                            <DashboardCard
                                title="Total PnL"
                                value={`$${fmt2(dashboardStats.totalPnLCurrency)}`}
                            />
                            <DashboardCard
                                title="Current Equity"
                                value={`$${fmt2(dashboardStats.currentEquity)}`}
                            />
                            <DashboardCard
                                title="Capital"
                                value={`$${fmt2(capital)}`}
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* New Progress List */}
                            <div className="bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-700">
                                <h3 className="text-lg font-semibold text-white mb-4">Progress</h3>
                                <ul className="space-y-2">
                                    <li><span className="font-semibold">Win Rate%:</span> {fmt2(dashboardStats.winRate)}%</li>
                                    <li><span className="font-semibold">Loss Rate%:</span> {fmt2(dashboardStats.lossRate)}%</li>
                                    <li><span className="font-semibold">Breakeven Rate%:</span> {fmt2(dashboardStats.breakevenRate)}%</li>
                                </ul>
                            </div>

                            {/* New Pair Stat List */}
                            <div className="bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-700">
                                <h3 className="text-lg font-semibold text-white mb-4">Pair stat</h3>
                                <ul className="space-y-2">
                                    <li><span className="font-semibold">Most Profitable Pair:</span> {dashboardStats.mostProfitablePair || "N/A"}</li>
                                    <li><span className="font-semibold">Most Losing:</span> {dashboardStats.mostLosingPair || "N/A"}</li>
                                    <li><span className="font-semibold">Most Traded:</span> {dashboardStats.mostTradedPair || "N/A"}</li>
                                    <li><span className="font-semibold">Highest Breakeven:</span> {dashboardStats.highestBreakevenPair || "N/A"}</li>
                                </ul>
                            </div>
                        </div>
<div className="bg-gray-800 p-6 rounded-2xl shadow-lg transition-all duration-300 transform hover:scale-105 backdrop-blur-md bg-white/10 border border-white/20">
    <h2 className="text-xl font-semibold mb-4 text-white">Weekly Equity Growth</h2>
    <ResponsiveContainer width="100%" height={400}>
        <LineChart data={equityChartData}>
            <defs>
                <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#82ca9d" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#82ca9d" stopOpacity={0} />
                </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.5} />
            <XAxis dataKey="week" stroke="#ccc" />
            <YAxis stroke="#ccc" />
            <Tooltip
                contentStyle={{
                    backgroundColor: "rgba(255, 255, 255, 0.15)",
                    backdropFilter: "blur(10px)",
                    border: "1px solid rgba(255, 255, 255, 0.2)",
                    borderRadius: "10px",
                    color: "#fff"
                }}
            />
            <ReferenceLine y={1000} stroke="#ff7300" strokeDasharray="3 3" label={{ position: 'top', value: 'Starting Capital', fill: '#ff7300' }} />
            <Line
                type="monotone"
                dataKey="equity"
                stroke="#82ca9d"
                strokeWidth={2}
                dot={{ stroke: '#82ca9d', strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6 }}
            />
        </LineChart>
    </ResponsiveContainer>
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
                                <div className="bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-700">
                                    <h2 className="text-2xl font-bold mb-6 text-white">Add New Trade</h2>
                                    <form onSubmit={handleSaveTrade} className="space-y-4">
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
                                        <div className="mb-4">
  <label className="block text-sm font-medium text-gray-200">Session</label>
  <select
    value={session}
    onChange={(e) => setSession(e.target.value)}
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

                                        <div className="flex flex-col">
  <label className="text-sm font-medium text-gray-400 mb-1" htmlFor="beforeImage">Before Image URL</label>
  <input
    type="url"
    id="beforeImage"
    name="beforeImage"
    value={formData.beforeImage || ''}
    onChange={(e) => setFormData(prev => ({ ...prev, beforeImage: e.target.value }))}
    placeholder="https://example.com/before.jpg"
    className={styles.input}
  />
  <p className="text-xs text-gray-500 mt-1">Paste a publicly accessible image URL (starts with https://)</p>
</div>


                                        <div className="mt-4 p-4 rounded-xl bg-gray-700 border border-gray-600 space-y-2 text-sm text-gray-300">
                                            <p><span className="font-semibold">SL Points:</span>{' '}{/* Always show SL in red (use rounded integer points) */}<span className="text-red-500">{liveStopLossPoints ? Math.abs(Math.round(liveStopLossPoints)) : 0}</span></p>
                                            <p><span className="font-semibold">TP Points:</span>{' '}{/* Always show TP in blue */}<span className="text-blue-400">{liveTakeProfitPoints ? Math.abs(Math.round(liveTakeProfitPoints)) : 0}</span></p>
                                            <p><span className="font-semibold">R Ratio:</span>{' '}{liveStopLossPoints !== 0 ? fmt2(liveTakeProfitPoints / liveStopLossPoints) : "N/A"}</p>
                                            <p><span className="font-semibold">Lot Size:</span>{' '}{/* Display rounded to 2 decimals and green if > 0 */}{coloredLot(liveLotSize)}</p>
                                            <p><span className="font-semibold">Est. Risk:</span>{' '}{/* Use coloredBySign so negative shows red, positive blue */}{coloredBySign(liveStopLossCurrency, v => `$${fmt2(v)}`)}</p>
                                            <p><span className="font-semibold">Est. Profit:</span>{' '}{coloredBySign(liveTakeProfitCurrency, v => `$${fmt2(v)}`)}</p>
                                            <p><span className="font-semibold">Daily Risk Used:</span>{' '}{fmt2(summaryForSelectedDate.riskUsed)}% of {DAILY_RISK_LIMIT_PERCENT}%</p>
                                        </div>
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
  <div className="overflow-x-auto">
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
                  <button
                    onClick={() => handleDeleteTrade(trade.id)}
                    className="text-red-400 hover:underline"
                  >
                    Delete
                  </button>
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
                            title="Close Trade"
                        >
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
let runningEquity = weekData.startEquity || 0;
const weeklyEquityData = [...weekData.trades]
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

      // 👇 safe to add now because values exist
      target: targetLine,
      drawdown: drawdownLine,
    };
  });

  
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
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-2xl font-bold text-white">Weekly Review</h3>
                                <div className="flex space-x-2">
                                    <button
                                        onClick={() => setSelectedWeek(w => w > 1 ? w - 1 : w)}
                                        className={`${styles.smallButton}`}
                                    >
                                        &lt; Prev
                                    </button>
                                    <span className="text-lg font-semibold text-white px-4 py-2 rounded-full bg-gray-700">
                                        Week {selectedWeek} ({getWeekRange(selectedWeek, new Date().getFullYear()).start} - {getWeekRange(selectedWeek, new Date().getFullYear()).end})
                                    </span>
                                    <button
                                        onClick={() => setSelectedWeek(w => w < 52 ? w + 1 : w)}
                                        className={`${styles.smallButton}`}
                                    >
                                        Next &gt;
                                    </button>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
                                <div className="bg-gray-700 p-4 rounded-xl shadow">
                                    <h4 className="text-sm font-semibold opacity-75">Starting Equity</h4>
                                    <p className="text-xl font-bold mt-1">${fmt2(weekData.startEquity)}</p>
                                </div>
                                <div className="bg-gray-700 p-4 rounded-xl shadow">
                                    <h4 className="text-sm font-semibold opacity-75">Total P&L</h4>
                                    <p className={`text-xl font-bold mt-1 ${weekData.totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>${fmt2(weekData.totalPnL)}</p>
                                </div>
                                <div className="bg-gray-700 p-4 rounded-xl shadow">
                                    <h4 className="text-sm font-semibold opacity-75">Total Trades</h4>
                                    <p className="text-xl font-bold mt-1">{weekData.trades.length}</p>
                                </div>
                                <div className="bg-gray-700 p-4 rounded-xl shadow">
                                    <h4 className="text-sm font-semibold opacity-75">Ending Equity</h4>
                                    <p className="text-xl font-bold mt-1">${fmt2(weekData.endEquity)}</p>
                                </div>
                                <div className="bg-gray-700 p-4 rounded-xl shadow">
                                   <h4 className="text-sm font-semibold opacity-75">Weekly %</h4>
                                   <p className={`text-lg font-bold flex items-center space-x-1 ${weeklyPercent >= 0 ? 'text-green-400' : 'text-red-500'}`}>
                                   {weeklyPercent >= 0 ?(<>
                                   <span>▲</span> <span>{fmt2(weeklyPercent)}%</span></>) : (<><span>▼</span>
                                   <span>{fmt2(Math.abs(weeklyPercent))}%</span></>)} </p>
                                </div>
                            </div>
                            <div className="mt-8">
                                <h4 className="text-xl font-bold mb-4 text-white">Daily Breakdown</h4>
                                {/* --- Daily Breakdown Table --- */}
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
      const pct = typeof data.totalPnL === "number" && capital
        ? Number(((data.totalPnL / capital) * 100).toFixed(2))
        : 0;

      return (
        <tr key={data.id} className="border-t border-gray-700 text-gray-300">
          <td className="px-4 py-3">
            {dateKey ? new Date(dateKey).toLocaleDateString("en-GB") : dateKey}
          </td>
          <td className="px-4 py-3">{data.day}</td>
          <td className="px-4 py-3">{data.wins}</td>
          <td className="px-4 py-3">{data.losses}</td>
          <td className="px-4 py-3">{data.breakeven}</td>
          <td className={`px-4 py-3 font-semibold ${data.totalPnL >= 0 ? "text-green-500" : "text-red-500"}`}>
            ${fmt2(data.totalPnL)}
          </td>
          <td className={`px-4 py-3 font-semibold flex items-center space-x-1 ${pct >= 0 ? "text-green-500" : "text-red-500"
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
                  )} </td>
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
      <td colSpan="9" className="text-center py-4 text-gray-500">No daily data.</td>
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
        <XAxis dataKey="date" stroke="#cbd5e0"tickFormatter={(d) => {
    const dt = new Date(d);
    return dt.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });}}/>
    <YAxis stroke="#cbd5e0" />
        <Tooltip contentStyle={{ backgroundColor: '#2d3748', border: 'none', borderRadius: '8px' }} labelStyle={{ color: '#fff' }} />
        <Line type="monotone" dataKey="risk" stroke="#82ca9d" strokeWidth={2} dot={{ stroke: '#82ca9d', strokeWidth: 2, r: 4 }} />
        <Line type="monotone" dataKey="dailyLimit" stroke="#ff7300" dot={false} strokeDasharray="5 5" strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  </div>
  </div>

                            </div>
                        </div>
                        {/* DAILY DETAILS (More) Modal */}
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
          <div className="mt-3">
            <label className="text-xs text-gray-400">Note</label>
            <textarea
              value={t.note || ""}
              onChange={(e) => {
                setSelectedDayTrades((prev) =>
                  prev.map((x) =>
                    x.id === t.id ? { ...x, note: e.target.value } : x
                  )
                );
              }}
              className="w-full mt-1 p-2 bg-gray-800 text-white rounded"
              rows={2}
            />
            <div className="grid grid-cols-2 gap-3 mt-2">
              <div>
                <label className="text-xs text-gray-400">Strategy</label>
                <input
                  value={t.strategy || ""}
                  onChange={(e) =>
                    setSelectedDayTrades((prev) =>
                      prev.map((x) =>
                        x.id === t.id ? { ...x, strategy: e.target.value } : x
                      )
                    )
                  }
                  className="w-full mt-1 p-2 bg-gray-800 text-white rounded"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400">Session</label>
                <p className="mt-1 p-2 bg-gray-800 text-white rounded">
                  {t.session || "—"}
                </p>
              </div>
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

{/* 🔍 Fullscreen Image Preview */}
<Modal
  isOpen={!!imagePreview}
  onClose={() => setImagePreview(null)}
  title="Image Preview"
>
  {imagePreview && (
    <div className="flex items-center justify-center">
      <img
        src={imagePreview}
        alt="Trade Preview"
        className="max-h-[80vh] max-w-full rounded-lg shadow-lg"
      />
    </div>
  )}
</Modal>

                    </div>
                  
                );
            
            }
            case "settings":
                return (
                    <div className="space-y-8 max-w-7xl mx-auto py-8 text-gray-200">
                        <h2 className="text-3xl font-bold mb-6 text-white">Settings</h2>

                        {/* Capital Section */}
                        <div className="bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-700 space-y-4">
                            <h3 className="text-xl font-bold text-white">Capital</h3>
                            <div className="flex flex-col md:flex-row items-start md:items-center space-y-4 md:space-y-0 md:space-x-4">
                                <label className="text-gray-400" htmlFor="capital-input">Current Capital: ${fmt2(capital)}</label>
                                <input
                                    type="number"
                                    id="capital-input"
                                    value={newCapital}
                                    onChange={handleCapitalChange}
                                    className={styles.input}
                                    placeholder="Enter new capital"
                                />
                                <button onClick={handleSaveCapital} className={styles.smallButton}>
                                    Save Capital
                                </button>
                            </div>
                        </div>

                        {/* Theme Section */}
                        <div className="bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-700 space-y-4">
                            <h3 className="text-xl font-bold text-white">Theme</h3>
                            <button onClick={handleThemeToggle} className={styles.smallButton}>
                                Switch to {theme === 'dark' ? 'Light' : 'Dark'} Theme
                            </button>
                        </div>
                        
                        {/* Account Type Section */}
                        <div className="bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-700 space-y-4">
                            <h3 className="text-xl font-bold text-white">Account Type</h3>
                            <div className="flex flex-col md:flex-row items-start md:items-center space-y-4 md:space-y-0 md:space-x-4">
                                <label className="text-gray-400" htmlFor="account-type-select">Select your account type</label>
                                <select
                                    id="account-type-select"
                                    name="accountType"
                                    value={formData.accountType}
                                    onChange={handleChange}
                                    className={styles.input}
                                >
                                    <option value="Standard">Standard</option>
                                    <option value="Micro">Micro</option>
                                    <option value="Mini">Mini</option>
                                </select>
                            </div>
                        </div>

                        {/* Logout Section */}
                        <div className="bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-700 space-y-4">
                            <h3 className="text-xl font-bold text-white">Logout</h3>
                            <button onClick={handleLogout} className="bg-red-600 text-white font-medium py-2 px-6 rounded-full shadow-lg hover:bg-red-700 transition-colors duration-200">
                                Logout
                            </button>
                        </div>
                    </div>
                );
            default:
                return null;
        }
    };
// ✅ App return
if (!userId) {
  // 🔑 If no user → show login/signup screen
  return <LoginPage onLogin={setUserId} />;
}

 return (
    <div
      className={`min-h-screen font-sans ${
        theme === "dark"
          ? "bg-gray-900 text-white"
          : "bg-gray-100 text-gray-900"
      }`}
    >
      {!userId ? (
        // 🔑 Show login/signup page if no user
        <AuthPage onLogin={setUserId} />
      ) : (
        // ✅ Main app UI after login
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

              <div>
                <button
                  onClick={handleLogout}
                  className="px-3 py-1 bg-red-600 text-white rounded text-sm"
                >
                  Log Out
                </button>
              </div>
            </nav>
          </header>

          <main className="p-4">
            {renderContent()}
            {userId && (
              <p className="mt-4 text-sm text-gray-400">
                Logged in as:{" "}
                <span className="font-semibold">{userId}</span>
              </p>
            )}
          </main>
        </>
      )}
    </div>
  );
}
