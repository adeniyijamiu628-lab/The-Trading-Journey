// components/TradeLog.jsx
import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { v4 as uuidv4 } from "uuid";
import { Toaster, toast } from "react-hot-toast";
import { supabase } from "./supabaseClient"; // adjust path if needed
import { getSessionForTime } from "../utils/sessionUtils"; // optional: if you keep it shared; but trade-specific session logic is available locally too
// If you prefer the component to be completely independent, remove the above line and rely on internal session mapping
import TradeEditModal from "./TradeEditModal";


// ------------------------------
// Helper Utilities (trade-specific)
// ------------------------------
const fmt2 = (n) => {
  if (n === null || n === undefined || isNaN(Number(n))) return "0.00";
  return Number(n).toFixed(2);
};
const parseNumber = (val) => (val === "" || isNaN(Number(val)) ? 0 : Number(val));
const formatDate = (isoString) => {
  if (!isoString) return "";
  // Extracts YYYY-MM-DD from an ISO 8601 string like "YYYY-MM-DDTHH:MM:SSZ"
  return isoString.split("T")[0];
};

// Normalize trade object before sending to DB.
// preserves our chosen canonical status values: "open", "Active", "Cancelled"
// Normalize trade object before sending to DB.
// Preserves our chosen canonical status values: "open", "Active", "Cancelled"
// Normalize trade object before sending to DB.
// preserves our chosen canonical status values: "open", "Active", "Cancelled"
const normalizeTradeForDB = (t, userId, accountId) => {
  // normalize incoming status variants to canonical values
  const rawStatus = (t.status || "").toString();
  const lower = rawStatus.toLowerCase();

  let status;
  if (lower === "open") status = "open";
  else if (lower === "active" || rawStatus === "Active") status = "Active";
  else if (lower === "closed" || rawStatus === "Closed") status = "closed"; // <-- ADD THIS LINE
  else if (lower === "cancel" || lower === "cancelled" || rawStatus === "Cancelled") status = "Cancelled";
  else status = rawStatus === "" ? "open" : rawStatus;
  // Helper to safely convert a date string (YYYY-MM-DD or existing ISO) to a full ISO timestamp
  const toISOTimestamp = (dateVal) => {
    if (!dateVal) return null;
    try {
      // If it's just YYYY-MM-DD, new Date() will assume midnight UTC/local, then toISOString() is fine.
      return new Date(dateVal).toISOString();
    } catch {
      return null;
    }
  };

  return {
    id: t.id,
    user_id: userId,
    account_id: accountId,
    pair: t.pair ?? null,
    type: t.type ?? null,
    // ✅ FIX: Ensure date fields are full ISO timestamps for the DB (timestamp with time zone)
    entry_date: toISOTimestamp(t.entryDate ?? t.entry_date), 
    entry_price: t.entryPrice ?? t.entry_price ?? null,
    sl: t.stopLoss ?? t.sl ?? null,
    tp: t.takeProfit ?? t.tp ?? null,
    risk: t.risk ?? 0,
    lot_size: t.lotSize ?? t.lotsize ?? null,
    value_per_pip: t.valuePerPip ?? t.value_per_pip ?? null,
    status: status,
    close_reason: t.close_reason ?? t.closeReason ?? null,
    ratio: t.ratio ?? null,
    // ✅ CRITICAL FIX: Supabase schema uses ALL LOWERCASE, NO UNDERSCORE (beforeimage, afterimage)
    beforeimage: t.beforeImage ?? t.before_image ?? null,
    afterimage: t.afterImage ?? t.after_image ?? null,
    // ✅ FIX: Ensure exit_date is a full ISO timestamp
    exit_date: toISOTimestamp(t.exitDate ?? t.exit_date),
    exit_price: t.exitPrice ?? t.exit_price ?? null,
    points: t.points ?? null,
    pnl_currency: t.pnlCurrency ?? t.pnlcurrency ?? null,
    pnl_percent: t.pnlPercent ?? t.pnlpercent ?? null,
    session: t.session ?? "",
    strategy: t.strategy ?? "",
    note: t.note ?? null,
    created_at: t.created_at ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
};

const denormalizeTradeRow = (r) => ({
  id: r.id,
  pair: r.pair,
  type: r.type,
  entryDate: r.entry_date ?? r.entryDate ?? "",
  entryPrice: r.entry_price ?? r.entryPrice ?? null,
  stopLoss: r.sl ?? r.stopLoss ?? null,
  takeProfit: r.tp ?? r.takeProfit ?? null,
  risk: r.risk ?? 0,
  lotSize: r.lot_size ?? r.lotSize ?? 0,
  valuePerPip: r.value_per_pip ?? r.valuePerPip ?? 0,
  status: r.status ?? "active",
  ratio: r.ratio ?? null,
  beforeImage: r.before_image ?? r.beforeImage ?? null,
  afterImage: r.after_image ?? r.afterImage ?? null,
  exitDate: r.exit_date ?? r.exitDate ?? null,
  exitPrice: r.exit_price ?? r.exitPrice ?? null,
  points: r.points ?? null,
  pnlCurrency: r.pnl_currency ?? r.pnlCurrency ?? 0,
  pnlPercent: r.pnl_percent ?? r.pnlPercent ?? 0,
  session: r.session ?? "",
  strategy: r.strategy ?? "",
  note: r.note ?? null,
  created_at: r.created_at,
  updated_at: r.updated_at,
});

// ISO week number helper
const getWeekNumber = (d) => {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 4 - (date.getDay() || 7));
  const yearStart = new Date(date.getFullYear(), 0, 1);
  return Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
};

const isValidUrl = (s) => {
  try {
    const url = new URL(s);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

// Multipliers and vp values (same as App.jsx)
const vpValues = {
  "EUR/USD": 10.0,
  "GBP/USD": 10.0,
  "USD/JPY": 6.8,
  "XAU/USD": 10.0,
  "USD/CAD": 7.3,
  "AUD/USD": 10.0,
  "USD/CHF": 12.4,
};
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

// backward-compatible alias (some places reference getAdjustedVP2)
const getAdjustedVP2 = getAdjustedVP;

// -------------------------------------
// ✅ Local Modal Definition for Close Trade
// -------------------------------------
const Modal = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-70 z-50">
      <div className="bg-gray-800 p-6 rounded-2xl shadow-xl border border-gray-700 max-w-lg w-full relative">
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-200 text-xl leading-none"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[70vh] overflow-y-auto pr-2">{children}</div>
      </div>
    </div>
  );
};


// ------------------------------
// Main TradeLog component
// ------------------------------
export default function TradeLog({
  // optionally accept from App.jsx. If not provided, component will attempt to read session.
  userId: propUserId = null,
  currentAccountId: propAccountId = null,
  initialCapital = 1000,
  initialAccountType = "Standard",
}) {
  
  // ----- Auth & Account context -----
  const [userId, setUserId] = useState(propUserId);
  const [currentAccountId, setCurrentAccountId] = useState(propAccountId);
  const [capital, setCapital] = useState(initialCapital);
  const [accountType, setAccountType] = useState(initialAccountType);
  // Track the current account ID fetched from Supabase
const [accountId, setAccountId] = useState(null);
  // -------------------------
// Auto-fetch account_type and capital for current user/account
// This ensures TradeLog calculates lot sizes from the actual account stored in Supabase.
// Fetch user's account details
useEffect(() => {
  const fetchAccountDetails = async () => {
    if (!propUserId) return;

    const { data: accountData, error } = await supabase
      .from("account")
      .select("id, account_type, capital")
      .eq("user_id", propUserId)
      .order("created_at", { ascending: true })
      .limit(1)
      .single();

    if (error) {
      console.error("Error fetching account:", error.message);
      return;
    }

    if (accountData) {
      setAccountType(accountData.account_type);
      setCapital(accountData.capital);
      setAccountId(accountData.id);
    }
  };

  fetchAccountDetails();
}, [propUserId]);



  // Trade states
  const [tradesOpen, setTradesOpen] = useState([]);
  const [tradesHistory, setTradesHistory] = useState([]);

  // UI states
  const [activeTab, setActiveTab] = useState("add"); // add | open | closed | daily
  const [loading, setLoading] = useState(true);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [closeModalTradeId, setCloseModalTradeId] = useState(null);
  const [modalExitDate, setModalExitDate] = useState("");
  const [modalExitPrice, setModalExitPrice] = useState("");
  const [modalActualPnL, setModalActualPnL] = useState("");
  const [modalAfterImage, setModalAfterImage] = useState("");
  const [modalStatus, setModalStatus] = useState("")
  const [modalCloseReason, setModalCloseReason] = useState("Completed");

  const [closeNote, setCloseNote] = useState("");
  // ✅ Edit Trade Modal States
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [tradeToEdit, setTradeToEdit] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingTrade, setEditingTrade] = useState(null);
  const [notification, setNotification] = useState({ isVisible: false, message: "", type: "" });

  // Toast / confirm state
const [confirmToast, setConfirmToast] = useState({
  isVisible: false,
  tradeId: null,
  message: "",
});


  const [filters, setFilters] = useState({
    profitType: "both",
    pair: "all",
    action: "both",
    status: "both", // active | cancelled | both
  });
  const [sortConfig, setSortConfig] = useState({ key: "entryDate", direction: "desc" });

  // Form for Add New Trade
  const [formData, setFormData] = useState({
    pair: "",
    type: "long",
    entryDate: "",
    price: "",
    sl: "",
    tp: "",
    risk: "2.0",
    accountType: initialAccountType,
    beforeImage: "",
    session: "",
    strategy: "",
  });
  // Reusable style classes for form inputs and buttons
const styles = {
  input: "w-full px-4 py-3 bg-gray-700 text-gray-200 border border-gray-600 rounded-xl",
  submitButton: "w-full bg-purple-600 text-white py-3 px-6 rounded-xl",
};


  // ensure these small helpers exist (no-op safe versions if already present)
const [tradeTime, setTradeTime] = useState(() => new Date().toTimeString().slice(0,5));

 const toDateOnly = (val) => {
  if (!val) return "";
  try {
    if (typeof val === "string" && val.includes("T")) return val.split("T")[0];
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      const yyyy = d.getUTCFullYear();
      const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(d.getUTCDate()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    }
  } catch (err) {
    console.warn("toDateOnly parse error:", err);
  }
  return val ?? "";
};

// Corrected Code for TradeLog.jsx

const fetchClosedTrades = async () => {
  const { data, error } = await supabase
    .from("trades")
    .select("*")
    .eq("status", "closed")
    .order("exitDate", { ascending: false });

  if (error) {
    console.error("fetchClosedTrades error:", error);
    return;
  }

  if (data) {
    // Normalize date fields so the UI never sees full ISO strings
    const normalized = data.map((t) => ({
      ...t,
      entryDateFormatted: toDateOnly(t.entryDate ?? t.openDate),
      exitDateFormatted: toDateOnly(t.exitDate ?? t.closeDate),
    }));
    setTradesHistory(normalized); // ✅ CORRECTED: Using the defined setter
  }
};


const fetchOpenTrades = async () => {
  const { data, error } = await supabase
    .from("trades")
    .select("*")
    .neq("status", "closed")
    .order("entryDate", { ascending: false });

  if (!error && data) setTradesOpen(data); // ✅ CORRECTED: Using the defined setter
};
  
const getSessionForTime = (time) => {
  if (!time) return "";
  const [h] = time.split(":").map(Number);
  if (h >= 7 && h < 12) return "London";
  if (h >= 12 && h < 17) return "New York";
  if (h >= 22 || h < 7) return "Asian";
  return "Other";
};

const showConfirmDelete = (tradeId, message = "Are you sure you want to delete this trade?") => {
  setConfirmToast({ isVisible: true, tradeId, message });
};

const hideConfirmDelete = () => {
  setConfirmToast({ isVisible: false, tradeId: null, message: "" });
};

const confirmDeleteNow = async () => {
    const id = confirmToast.tradeId;
    hideConfirmDelete();
    if (!id) return;

    try {
        // 1. Delete from Supabase
        const { error } = await supabase.from("trades").delete().eq("id", id);
        if (error) throw error;

        // 2. Update local state
        // You need to determine if the trade was open or in history before filtering.
        // Assuming the trade being deleted via the toast is in tradesHistory (closed view):
        setTradesHistory((prev) => prev.filter((t) => t.id !== id)); // ✅ FIX: Changed setClosedTrades to setTradesHistory

        // Additionally, if a trade can be deleted from the "Open Trades" view,
        // you should include a check and update that state as well:
        setTradesOpen((prev) => prev.filter((t) => t.id !== id)); 
        
        // optional: show a success toast (reuse confirmToast UI or add a separate notification)
        setTimeout(() => {
            setNotification({ isVisible: true, message: "Trade deleted", type: "success" });
            setTimeout(() => setNotification({ isVisible: false, message: "", type: "" }), 2000);
        }, 100);

    } catch (err) {
        console.error("delete trade error:", err);
        setNotification({ isVisible: true, message: "Delete failed", type: "error" });
        setTimeout(() => setNotification({ isVisible: false, message: "", type: "" }), 2500);
    }
};


const coloredLot = (lot) => <span className="text-purple-400 font-semibold">{Number(lot || 0).toFixed(2)}</span>;

// summaryForSelectedDate: conservative safe implementation
const summaryForSelectedDate = useMemo(() => {
  const entryDate = formData.entryDate;
  const tradesForDate = tradesHistory.filter(t => (t.entryDate || "").slice(0,10) === (entryDate || "").slice(0,10));
  const openTradesForDate = tradesOpen.filter(t => (t.entryDate || "").slice(0,10) === (entryDate || "").slice(0,10));
  const totalRisk = openTradesForDate.reduce((s, t) => s + Number(t.risk || 0), 0);
  return { totalTrades: tradesForDate.length + openTradesForDate.length, riskUsed: totalRisk };
}, [formData.entryDate, tradesHistory, tradesOpen]);


  // Lot calculator specific states
  const [calcPair, setCalcPair] = useState("");
  const [calcPoints, setCalcPoints] = useState(0);
  const [calcRiskPercent, setCalcRiskPercent] = useState(2.0);
  const [calcAccountType, setCalcAccountType] = useState(initialAccountType);

  const PER_TRADE_LIMIT_PERCENT = 3;
  const DAILY_RISK_LIMIT_PERCENT = 5;
  const MAX_TRADES_PER_DAY = 3;
  const MAX_ACTIVE_TRADES_PER_DAY = 2;
  const MAX_CANCEL_TRADES_PER_DAY = 1;

const persistJournal = async (openTrades = tradesOpen, historyTrades = tradesHistory) => {
  if (!userId || !accountId) {
    console.warn("[persistJournal] Skipping save — missing userId/accountId");
    return;
  }

  const allTrades = [...(openTrades || []), ...(historyTrades || [])];
  if (allTrades.length === 0) return;

  const sanitizedTrades = allTrades.map((t) => ({
    id: t.id,
    user_id: userId,
    account_id: accountId,
    pair: t.pair?.trim() || "",
    type: t.type || "",
    entry_date: t.entry_date || t.entryDate || null,
    entry_price: t.entry_price || t.entryPrice || null,
    sl: t.sl ?? t.stopLoss ?? null,
    tp: t.tp ?? t.takeProfit ?? null,
    risk: Number(t.risk) || 0,
    lot_size: t.lot_size ?? t.lotSize ?? null,
    value_per_pip: t.value_per_pip ?? t.valuePerPip ?? null,
    status: t.status || "Active",
    close_reason: t.close_reason ?? t.closeReason ?? null,
    ratio: t.ratio ?? null,
    beforeimage: t.beforeimage ?? t.beforeImage ?? null,
    afterimage: t.afterimage ?? t.afterImage ?? null,
    exit_date: t.exit_date ?? t.exitDate ?? null,
    exit_price: t.exit_price ?? t.exitPrice ?? null,
    points: Number(t.points) || null,
    pnl_currency: t.pnl_currency ?? t.pnlCurrency ?? null,
    pnl_percent: t.pnl_percent ?? t.pnlPercent ?? null,
    session: t.session || "",
    strategy: t.strategy || "",
    note: t.note || "",
    created_at: t.created_at ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("trades")
    .upsert(sanitizedTrades, { onConflict: ["id"] });

  if (error) console.error("[persistJournal] ❌ Supabase upsert error:", error.message);
  else console.debug("[persistJournal] ✅ Trades persisted successfully:", sanitizedTrades.length);
};





// ------------------------------
// ✅ Load all trades directly from Supabase (no localStorage)
// ------------------------------
const loadJournalFromSupabase = async (userId, accountId) => {
  try {
    console.log("🔄 Loading trades from Supabase...");

    if (!userId || !accountId) {
      console.warn("⚠️ Missing userId or accountId — skipping Supabase load");
      return;
    }

    const { data, error } = await supabase
      .from("trades")
      .select("*")
      .eq("user_id", userId)
      .eq("account_id", accountId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("❌ Supabase load error:", error.message);
      return;
    }

    if (!data || data.length === 0) {
      console.warn("⚠️ No trades found in Supabase.");
      setTradesOpen([]);
      setTradesHistory([]);
      return;
    }

    console.log(`📦 Supabase returned ${data.length} trades`);

    // ✅ Normalize and clean data
    const formatted = data.map((t) => {
      const statusRaw = t.status?.toLowerCase?.() || "";
      const closeReasonRaw = t.close_reason?.toLowerCase?.() || null;

      return {
        ...t,
        // Normalize naming
        entryPrice: t.entry_price ?? t.entryPrice ?? null,
        stopLoss: t.stop_loss ?? t.stopLoss ?? null,
        takeProfit: t.take_profit ?? t.takeProfit ?? null,
        lotSize: t.lot_size ?? t.lotSize ?? null,
        valuePerPip: t.value_per_pip ?? t.valuePerPip ?? null,
        entryDate: t.entry_date ?? t.entryDate ?? null,

        // Standardize status
        status:
          statusRaw === "open" || statusRaw === "active"
            ? "Active"
            : statusRaw === "closed"
            ? "Closed"
            : statusRaw === "cancelled"
            ? "Cancelled"
            : "Active",

        // Normalize close reason
        close_reason: closeReasonRaw
          ? closeReasonRaw.charAt(0).toUpperCase() + closeReasonRaw.slice(1)
          : null,

        created_at: t.created_at ?? new Date().toISOString(),
        updated_at: t.updated_at ?? new Date().toISOString(),
      };
    });

    // ✅ Split open vs closed
    const openTrades = formatted.filter((t) => t.status === "Active");
    const closedTrades = formatted.filter((t) => t.status === "Closed");

    console.log(`✅ Supabase parsed: ${openTrades.length} open, ${closedTrades.length} closed`);

    // ✅ Update app state
    setTradesOpen(openTrades);
    setTradesHistory(closedTrades);
  } catch (err) {
    console.error("💥 Unexpected error loading from Supabase:", err);
  }
};



  // Update a single trade (used by edit/save)
  const updateTradeInDB = async (trade) => {
    if (!trade || !trade.id || !userId || !currentAccountId) return;
    try {
      const row = normalizeTradeForDB(trade, userId, currentAccountId);
      const { data, error } = await supabase.from("trades").upsert([row], { onConflict: ["id"] });
      if (error) {
        console.error("updateTradeInDB error:", error);
        toast.error("Failed to update trade.");
      } else {
        console.log("updateTradeInDB ok", data?.length ?? 1);
      }
    } catch (err) {
      console.error("updateTradeInDB unexpected error:", err);
    }
  };

  // Delete a trade from DB
  const deleteTradeFromDB = async (tradeId) => {
    if (!tradeId || !userId || !currentAccountId) return;
    try {
      const { error } = await supabase.from("trades").delete().eq("id", tradeId).eq("user_id", userId);
      if (error) {
        console.error("deleteTradeFromDB error:", error);
        toast.error("Failed to delete trade from DB.");
      } else {
        console.log("deleteTradeFromDB success", tradeId);
      }
    } catch (err) {
      console.error("deleteTradeFromDB unexpected error:", err);
    }
  };

// ------------------------------
// ✅ Initialize and sync trades (localStorage → Supabase fallback)
// ------------------------------
useEffect(() => {
  const initJournal = async () => {
    try {
      if (!userId || !currentAccountId) {
        console.warn("⚠️ initJournal aborted: missing userId or accountId");
        return;
      }
    } catch (err) {
      console.error("💥 Error restoring journal:", err);
      await loadJournalFromSupabase(userId, currentAccountId); // fallback
    }
  };

  initJournal();
}, [userId, currentAccountId]);

// ------------------------------
// ✅ Reload trades when user/account changes
// ------------------------------
useEffect(() => {
  // Make sure props are valid
  if (!propUserId || !propAccountId) return;

  console.log("🔄 propUserId/propAccountId changed, reloading journal...");

  // Update state first, then fetch AFTER React has committed the update
  setUserId(propUserId);
  setCurrentAccountId(propAccountId);

  // Schedule Supabase load after next render tick
  const timeout = setTimeout(async () => {
    setLoading(true);
    await loadJournalFromSupabase(propUserId, propAccountId);
    setLoading(false);
  }, 200); // slight delay (200ms) ensures state is committed

  return () => clearTimeout(timeout);
}, [propUserId, propAccountId]);


// ------------------------------
// ✅ Persist trades to Supabase only when fully ready
// ------------------------------
useEffect(() => {
  if (!userId || !currentAccountId) {
    // no console spam, just skip silently
    return;
  }

  if (!tradesOpen && !tradesHistory) return;

  persistJournal(tradesOpen, tradesHistory);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [tradesOpen, tradesHistory, userId, currentAccountId]);

  // ------------------------------
  // Lot Size Calculator (UI + logic)
  // ------------------------------
  const calcLotSize = useMemo(() => {
    if (!calcPair || calcPoints <= 0 || !capital) return 0;
    const vp = getAdjustedVP(calcPair, calcAccountType);
    if (!vp) return 0;
    const lot = ((calcRiskPercent / 100) * capital) / (vp * calcPoints);
    return Number(lot);
  }, [calcPair, calcPoints, calcRiskPercent, calcAccountType, capital]);

  const calcRiskAmount = useMemo(() => (calcRiskPercent / 100) * capital, [calcRiskPercent, capital]);

// ✅ FINAL LIVE CALCULATION SECTION — single source of truth
// -------------------------------------------------------
// Handles all live calculations for SL/TP points, Lot Size, P&L previews
// Ensures no redeclaration or undefined variables

// Simple parser for numeric input
const parseNumber = (val) => {
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
};

// Get the correct pip multiplier based on pair type
const getMultiplier = (pair = "") => {
  const p = pair.toUpperCase();
  if (p.includes("JPY")) return 1000;
  if (p.includes("XAU") || p.includes("XAG")) return 100;
  return 100000; // Most forex pairs
};

// Calculate stop loss points based on entry & SL
const calculateStopLossPoints_live = (fd = formData) => {
  const entry = parseNumber(fd.price);
  const stop = parseNumber(fd.sl);
  if (!entry || !stop || !fd.pair) return 0;
  const raw = fd.type?.toLowerCase() === "long" ? entry - stop : stop - entry;
  const mult = getMultiplier(fd.pair);
  return Math.round(Math.abs(raw) * mult);
};

// Calculate take profit points based on entry & TP
const calculateTakeProfitPoints_live = (fd = formData) => {
  const entry = parseNumber(fd.price);
  const take = parseNumber(fd.tp);
  if (!entry || !take || !fd.pair) return 0;
  const raw = fd.type?.toLowerCase() === "long" ? take - entry : entry - take;
  const mult = getMultiplier(fd.pair);
  return Math.round(Math.abs(raw) * mult);
};

// Calculate live lot size based on risk % and SL distance
const calculateLotSize_live = (fd = formData) => {
  const pair = fd.pair;
  if (!capital || !pair) return 0;
  const stopPoints = calculateStopLossPoints_live(fd);
  if (stopPoints === 0) return 0;
  const riskDecimal = parseNumber(fd.risk) / 100;
  const vp = getAdjustedVP(pair, fd.accountType || accountType);
  if (!vp) return 0;
  const lot = (riskDecimal * capital) / (vp * stopPoints);
  return Number(lot);
};

// ---- Derived live values ----
const liveLotSize = useMemo(() => calculateLotSize_live(formData), [formData, capital, accountType]);
const liveStopLossPoints = useMemo(() => calculateStopLossPoints_live(formData), [formData]);
const liveTakeProfitPoints = useMemo(() => calculateTakeProfitPoints_live(formData), [formData]);
const liveValuePerPip = useMemo(
  () => getAdjustedVP(formData.pair, formData.accountType || accountType),
  [formData.pair, formData.accountType, accountType]
);

// ---- Currency & ratios ----
const liveStopLossCurrency = (Number(liveLotSize) * liveValuePerPip * Math.abs(liveStopLossPoints)) || 0;
const liveTakeProfitCurrency = (Number(liveLotSize) * liveValuePerPip * Math.abs(liveTakeProfitPoints)) || 0;
const liveStopLossPercent = capital ? (liveStopLossCurrency / capital) * 100 : 0;
const liveTakeProfitPercent = capital ? (liveTakeProfitCurrency / capital) * 100 : 0;
const slPoints = calculateStopLossPoints_live(formData);
const tpPoints = calculateTakeProfitPoints_live(formData);
const ratio = slPoints ? tpPoints / slPoints : null;


  // ------------------------------
  // Add New Trade handler (validations + persist)
  // ------------------------------
  const handleAddTradeChange = (e) => {
    const { name, value } = e.target;
    setFormData((p) => ({ ...p, [name]: value }));
    if (name === "accountType") {
      setCalcAccountType(value);
    }
  };

const handleAddTrade = async (e) => {
  e && e.preventDefault && e.preventDefault();

  if (!formData.pair || !formData.price || !formData.entryDate) {
    setShowEditModal(false);
    toast.error("Please provide pair, price and entry date.");
    return;
  }

  // --- validation logic stays the same (limits, risk checks, ratio calc) ---

  const vpAtSave = getAdjustedVP(formData.pair, formData.accountType);
  const lot = calculateLotSize_live(formData);

  // ratio logic remains unchanged...
  const slPoints = calculateStopLossPoints_live(formData);
const tpPoints = calculateTakeProfitPoints_live(formData);
const ratio = slPoints ? tpPoints / slPoints : null;

  const stateTrade = {
    id: uuidv4(),
    userId: userId,
    accountId: currentAccountId,
    pair: formData.pair?.trim() || "",
    type: formData.type || "",
    entryDate: formData.entryDate || new Date().toISOString().slice(0, 10),
    entryPrice: parseFloat(formData.price) || null,
    sl: parseFloat(formData.sl) || null,
    tp: parseFloat(formData.tp) || null,
    risk: parseFloat(formData.risk) || 0,
    lotSize: Number(lot) || 0,
    valuePerPip: Number(vpAtSave) || 0,
    ratio,
    beforeImage: formData.beforeImage?.trim() || null,
    status: "Active",
    session: formData.session || "",
    strategy: formData.strategy || "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  try {
    console.debug("[handleAddTrade] Adding trade:", stateTrade);

    const updatedOpen = [...tradesOpen, stateTrade];
    setTradesOpen(updatedOpen);

    // Local backup
    localStorage.setItem("tradesOpen", JSON.stringify(updatedOpen));

    // Save to Supabase
    const dbTrade = {
      id: stateTrade.id,
      user_id: userId,
      account_id: currentAccountId,
      pair: stateTrade.pair,
      type: stateTrade.type,
      entry_date: stateTrade.entryDate,
      entry_price: stateTrade.entryPrice,
      sl: stateTrade.sl,
      tp: stateTrade.tp,
      risk: stateTrade.risk,
      lot_size: stateTrade.lotSize,
      value_per_pip: stateTrade.valuePerPip,
      ratio: stateTrade.ratio,
      beforeimage: stateTrade.beforeImage,
      status: stateTrade.status,
      session: stateTrade.session,
      strategy: stateTrade.strategy,
      created_at: stateTrade.createdAt,
      updated_at: stateTrade.updatedAt,
    };

    const { error } = await supabase.from("trades").insert([dbTrade]);
    if (error) {
      console.error("[handleAddTrade] ❌ Supabase insert error:", error.message);
    } else {
      console.debug("[handleAddTrade] ✅ Trade inserted:", dbTrade.id);
    }

    // ✅ Ensure both state and DB are in sync
    await persistJournal(updatedOpen, tradesHistory);
    console.debug("[handleAddTrade] persistJournal done.");

    // Reset form
    setFormData({
      pair: "",
      type: "long",
      entryDate: "",
      price: "",
      sl: "",
      tp: "",
      risk: "2.0",
      accountType: accountType || initialAccountType,
      beforeImage: "",
      session: "",
      strategy: "",
    });

    toast.success("Trade added");
    setActiveTab("open");
  } catch (err) {
    console.error("[handleAddTrade] 💥 Error adding trade:", err);
    toast.error("Failed to add trade");
  }
};




// alias so new form works without refactor 
const handleSaveTrade = handleAddTrade; 
const handleChange = handleAddTradeChange; 

// ------------------------------
// Close trade modal & handler (exact modal fields & behavior as requested)
// ------------------------------
const openCloseModal = (tradeId) => {
  const t = tradesOpen.find((x) => x.id === tradeId);
  if (!t) return;
  setCloseModalTradeId(tradeId);
  setModalExitDate(new Date().toISOString().slice(0, 10));
  setModalExitPrice("");
  setModalActualPnL("");
  setModalAfterImage("");
  setModalStatus("Active");
  setCloseNote("");
  setShowCloseModal(true);
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
useEffect(() => {
  if (!closeModalTradeId) return;
  const t = tradesOpen.find((x) => x.id === closeModalTradeId);
  if (!t) return;
  if (modalExitPrice !== "") {
    const expected = computeExpectedCurrencyForClose(t, modalExitPrice);
    setModalActualPnL(Number(expected).toFixed(2));
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [modalExitPrice, closeModalTradeId]);

// keep formData.accountType and calcAccountType synced to fetched accountType
useEffect(() => {
  if (!accountType) return;
  setCalcAccountType(accountType);
  setFormData(prev => ({ ...prev, accountType }));
}, [accountType]);

const handleSaveClose = async () => {
  console.debug("[handleSaveClose] triggered for tradeId:", closeModalTradeId);

  const trade = tradesOpen.find((t) => t.id === closeModalTradeId);
  if (!trade) {
    console.warn("[handleSaveClose] Trade not found:", closeModalTradeId);
    return;
  }

  const exitPriceNum = parseNumber(modalExitPrice);
  const manualPnLNum = parseNumber(modalActualPnL);
  const exitTimestamp = modalExitDate
    ? new Date(modalExitDate).toISOString()
    : new Date().toISOString();

  const mult = getMultiplier(trade.pair);
  const rawPoints = (exitPriceNum - trade.entryPrice) * mult;
  const pointsSigned =
    trade.type === "long" ? Math.round(rawPoints) : Math.round(-rawPoints);

  const computedPnL = pointsSigned * trade.lotSize * trade.valuePerPip;
  const pnlCurrency = isNaN(manualPnLNum) ? computedPnL : manualPnLNum;
  const pnlPercent = capital ? (pnlCurrency / capital) * 100 : 0;

  const closed = {
    ...trade,
    exitDate: exitTimestamp,
    exitPrice: exitPriceNum,
    points: pointsSigned,
    pnlCurrency,
    pnlPercent,
    status: "Closed",
    close_reason: modalCloseReason || "Completed",
    afterImage:
      modalAfterImage && isValidUrl(modalAfterImage)
        ? modalAfterImage.trim()
        : null,
    beforeImage:
      trade.beforeImage && isValidUrl(trade.beforeImage)
        ? trade.beforeImage.trim()
        : null,
    note: closeNote,
    updated_at: new Date().toISOString(),
  };

  const updatedOpen = tradesOpen.filter((t) => t.id !== trade.id);
  const updatedHistory = [...tradesHistory, closed];

  console.debug("[handleSaveClose] moving trade to history", {
    openBefore: tradesOpen.length,
    openAfter: updatedOpen.length,
    historyAfter: updatedHistory.length,
  });

  setTradesOpen(updatedOpen);
  setTradesHistory(updatedHistory);

  try {
    // ✅ First, update DB for that single trade
    await updateTradeInDB(closed);
    console.debug("[handleSaveClose] Single trade DB update complete");

    // ✅ Then sync arrays in journal
    await persistJournal(updatedOpen, updatedHistory);
    console.debug("[handleSaveClose] persistJournal complete");
  } catch (err) {
    console.error("[handleSaveClose] Error saving close:", err);
  }

  // reset modal
  setShowCloseModal(false);
  setCloseModalTradeId(null);
  setModalExitDate("");
  setModalExitPrice("");
  setModalActualPnL("");
  setModalAfterImage("");
  setModalCloseReason("Completed");
  setCloseNote("");

  toast.success("Trade closed and saved");
};

// ------------------------------
// Edit & Delete from history
// ------------------------------
const openEditModal = (trade) => {
  setEditingTrade({ ...trade });
  setShowEditModal(true);
};
const handleDeleteTrade = async (tradeId) => {
  try {
    const updatedHistory = tradesHistory.filter((t) => t.id !== tradeId);
    setTradesHistory(updatedHistory);
    await persistJournal(tradesOpen, updatedHistory);
    // Optionally delete from DB completely
    await deleteTradeFromDB(tradeId);
    toast.success("Trade deleted");
  } catch (err) {
    console.error("handleDeleteTrade error:", err);
    toast.error("Failed to delete trade");
  }
};
// ------------------------------
// Closed Trades: filters & sorting & animated rows (Framer Motion)
// ------------------------------
const handleFilterChange = (field, value) => {
  setFilters((p) => ({ ...p, [field]: value }));
};
const handleSort = (key) => {
  setSortConfig((prev) => ({ key, direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc", }));
};
const sortedFilteredHistory = useMemo(() => {
  // ✅ FIX: Ensure case-insensitivity for 'closed' status to match both 'closed' (DB) and 'Closed' (Local State).
  let filtered = tradesHistory.filter((t) => {
    const statusLower = (t.status || "").toLowerCase();
    return statusLower === "closed" || statusLower === "cancelled";
  });

  if (filters.profitType !== "both") {
    filtered = filtered.filter((t) => (filters.profitType === "profit" ? (t.pnlCurrency || 0) > 0 : (t.pnlCurrency || 0) < 0));
  }
  if (filters.pair !== "all") {
    filtered = filtered.filter((t) => t.pair === filters.pair);
  }
  if (filters.action !== "both") {
    filtered = filtered.filter((t) => (filters.action === "L" ? t.type === "long" : t.type === "short"));
  }
  if (filters.close_reason !== "both") {
    filtered = filtered.filter(
      (t) => t.close_reason === filters.close_reason
    );
  }
  // sorting based on sortConfig
  filtered.sort((a, b) => {
    const { key, direction } = sortConfig;
    const dir = direction === "asc" ? 1 : -1;
    if (key === "pnlCurrency" || key === "pnlPercent") {
      return dir * ((a[key] || 0) - (b[key] || 0));
    }
    if (key === "entryDate" || key === "exitDate") {
      return dir * (new Date(a[key] || 0) - new Date(b[key] || 0));
    }
    return 0;
  });
  // final default ordering: most recent entry first
  filtered.sort((a, b) => new Date(b.entryDate) - new Date(a.entryDate));
  return filtered;
}, [tradesHistory, filters, sortConfig]);
// unique pairs for filter dropdown
const uniquePairs = useMemo(() => {
    const pairs = new Set(tradesHistory.map((t) => t.pair).filter(Boolean));
    return ["all", ...Array.from(pairs)];
  }, [tradesHistory]);

  // ------------------------------
  // Daily Limit view (exact behavior kept)
  // ------------------------------
  const dailyRiskData = useMemo(() => {
    const allTrades = [...tradesHistory, ...tradesOpen];
    const map = {};
    allTrades.forEach((trade) => {
      const date = (trade.entryDate || new Date()).toString().slice(0, 10);
      if (!map[date]) map[date] = 0;
      if (trade.status === "active") map[date] += Number(trade.risk || 0);
    });
    return Object.keys(map)
      .sort((a, b) => new Date(a) - new Date(b))
      .map((d) => ({ date: d, risk: Number(map[d]) }));
  }, [tradesHistory, tradesOpen]);

  // ------------------------------
  // Small UI helpers
  // ------------------------------
  const coloredBySign = (num) => {
    if (num === null || num === undefined || isNaN(Number(num))) return <span>0.00</span>;
    const n = Number(num);
    const formatted = fmt2(n);
    if (n < 0) return <span className="text-red-500">${formatted}</span>;
    if (n > 0) return <span className="text-green-400">${formatted}</span>;
    return <span>${formatted}</span>;
  };

// --- handleEditTrade (replace existing) ---
const handleEditTrade = (trade, section = "closed") => {
  console.debug("✏️ handleEditTrade called. section:", section, "trade:", trade);

  // helpful debug for tradeTime specifically
  console.debug("tradeTime raw values:", {
    tradeTime: trade?.tradeTime,
    time: trade?.time,
  });

  setTradeToEdit({ ...trade, section });
  setIsEditModalOpen(true);
};




// 💾 Save edited trade to Supabase
const handleSaveEditedTrade = async (updatedTrade) => {
  console.log("💾 handleSaveEditedTrade received:", updatedTrade);

  try {
    if (!userId || !accountId) {
      console.warn("⚠️ Missing userId or accountId, aborting save.");
      return;
    }

    const { id, section, ...dataToSave } = updatedTrade;

    // ✅ Sanitize and normalize fields before saving
    const sanitizedData = {
      pair: dataToSave.pair?.trim() || "",
      type: dataToSave.type || "",
      entry_date: dataToSave.entry_date || dataToSave.entryDate || null,
      entry_price: dataToSave.entry_price || dataToSave.entryPrice || null,
      sl: dataToSave.sl || dataToSave.stopLoss || null,
      tp: dataToSave.tp || dataToSave.takeProfit || null,
      risk: Number(dataToSave.risk) || 0,
      lot_size: dataToSave.lot_size || dataToSave.lotSize || null,
      value_per_pip: dataToSave.value_per_pip || dataToSave.valuePerPip || null,
      status: dataToSave.status || section === "closed" ? "closed" : "open",
      close_reason: dataToSave.close_reason || dataToSave.closeReason || null,
      ratio: dataToSave.ratio ?? null,
      beforeimage: dataToSave.beforeimage || dataToSave.beforeImage || null,
      afterimage: dataToSave.afterimage || dataToSave.afterImage || null,
      exit_date: dataToSave.exit_date || dataToSave.exitDate || null,
      exit_price: dataToSave.exit_price || dataToSave.exitPrice || null,
      points: Number(dataToSave.points) || null,
      pnl_currency: dataToSave.pnl_currency || dataToSave.pnlCurrency || null,
      pnl_percent: dataToSave.pnl_percent || dataToSave.pnlPercent || null,
      session: dataToSave.session || "",
      strategy: dataToSave.strategy || "",
      note: dataToSave.note || "",
      updated_at: new Date().toISOString(),
      user_id: userId,
      account_id: accountId,
    };

    const { error } = await supabase
      .from("trades")
      .update(sanitizedData)
      .eq("id", id)
      .eq("user_id", userId)
      .eq("account_id", accountId);

    if (error) throw error;

    console.log("✅ Trade successfully updated in Supabase");

    // Refresh the correct trade list after update
    if (section === "closed") {
      await fetchClosedTrades();
    } else {
      await fetchOpenTrades();
    }

    // Close modal and reset editing state
    setIsEditModalOpen(false);
    setTradeToEdit(null);
  } catch (err) {
    console.error("❌ Error updating trade:", err.message);
  }
};



  // ------------------------------
  // Render: top-level content switch
  // ------------------------------
  if (loading) {
    return (
      <div className="w-full flex items-center justify-center p-12">
        <div className="text-gray-300">Loading Trade Log...</div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-7xl mx-auto py-6 text-gray-200">
      <Toaster position="top-right" />
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-bold">Trade Log</h3>
        <div className="flex gap-2">
          <button
            className={`px-4 py-2 rounded-full ${activeTab === "add" ? "bg-purple-600" : "bg-gray-800"} text-white`}
            onClick={() => setActiveTab("add")}
          >
            Add New
          </button>
          <button
            className={`px-4 py-2 rounded-full ${activeTab === "open" ? "bg-purple-600" : "bg-gray-800"} text-white`}
            onClick={() => setActiveTab("open")}
          >
            Open
          </button>
          <button
            className={`px-4 py-2 rounded-full ${activeTab === "closed" ? "bg-purple-600" : "bg-gray-800"} text-white`}
            onClick={() => setActiveTab("closed")}
          >
            Closed
          </button>
          <button
            className={`px-4 py-2 rounded-full ${activeTab === "daily" ? "bg-purple-600" : "bg-gray-800"} text-white`}
            onClick={() => setActiveTab("daily")}
          >
            Daily Limit
          </button>
        </div>
      </div>

      {/* ------------------ */}
      {/* Add New Trade Tab */}
      {/* ------------------ */}
      {activeTab === "add" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Lot Size Calculator (Left) */}
            <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6">
              <h4 className="text-lg font-semibold mb-4">Lot Size Calculator</h4>
              <div className="space-y-3">
                <label className="text-sm opacity-75">Pair</label>
                <select
                  value={calcPair}
                  onChange={(e) => setCalcPair(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-700 text-gray-200 rounded-xl"
                >
                  <option value="">Select pair</option>
                  {Object.keys(vpValues).map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>

                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-sm opacity-75">Points</label>
                    <input
                      type="number"
                      value={calcPoints}
                      onChange={(e) => setCalcPoints(Number(e.target.value))}
                      className="w-full px-4 py-3 rounded-xl bg-gray-700 text-gray-200"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-sm opacity-75">Risk %</label>
                    <input
                      type="number"
                      value={calcRiskPercent}
                      onChange={(e) => setCalcRiskPercent(Number(e.target.value))}
                      className="w-full px-4 py-3 rounded-xl bg-gray-700 text-gray-200"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-sm opacity-75">Account Type</label>
                  <select
                    value={calcAccountType}
                    onChange={(e) => setCalcAccountType(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-gray-700 text-gray-200"
                  >
                    <option value="Standard">Standard</option>
                    <option value="Mini">Mini</option>
                    <option value="Micro">Micro</option>
                  </select>
                </div>

                <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 mt-4">
                  <div className="text-sm opacity-70">Estimated Lot Size</div>
                  <div className="text-2xl font-semibold mt-1">{fmt2(calcLotSize)}</div>
                  <div className="mt-2 text-sm opacity-70">Risk Amount: ${fmt2(calcRiskAmount)}</div>
                </div>
              </div>
            </div>

            {/* Add Trade Form (Center) */}
            <div className="col-span-2 bg-gray-800 border border-gray-700 rounded-2xl p-6">
              <h4 className="text-lg font-semibold mb-4">Add New Trade</h4>
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
      {/* Time Input for Session Auto-Detection */}
<div className="flex flex-col">
  <label
    className="text-sm font-medium text-gray-400 mb-1"
    htmlFor="tradeTime"
  >
    Trade Time
  </label>
  <input
    type="time"
    id="tradeTime"
    name="tradeTime"
    value={tradeTime}
    onChange={(e) => setTradeTime(e.target.value)}
    className={styles.input}
  />

  {/* Session Output */}
  <p className="text-sm text-gray-300 mt-2">
    Session: {getSessionForTime(tradeTime)}
  </p>
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
        <p><span className="font-semibold">Est. Risk:</span>  <span className="text-red-500"> {liveStopLossCurrency}</span></p>
        <p><span className="font-semibold">Est. Profit:</span> <span className="text-green-500"> {liveTakeProfitCurrency}</span></p> 
        <p><span className="font-semibold">Daily Risk Used:</span> {fmt2(summaryForSelectedDate.riskUsed)}% of {DAILY_RISK_LIMIT_PERCENT}%</p>
      </div>

      {/* Submit */}
      <button type="submit" className={styles.submitButton}>
        Submit Trade
      </button>
    </form>
            </div>
          </div>
        </div>
      )}

      {/* ------------------ */}
{/* Open Trades Tab */}
{/* ------------------ */}
{activeTab === "open" && (
  <>
    {console.log("📘 [Render] Open Trades tab active")}
    {console.log("📘 tradesOpen array:", tradesOpen)}
    {console.log("📘 tradesOpen count:", tradesOpen?.length || 0)}

    <div className="space-y-4">
      <div className="bg-gray-800 border border-gray-700 rounded-2xl p-4">
        <h4 className="text-lg font-semibold mb-4">Open Trades</h4>

        {tradesOpen.length === 0 ? (
          <div className="text-gray-400 p-6">No open trades</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full bg-gray-900 rounded-lg overflow-hidden">
              <thead className="bg-gray-800 text-gray-300">
                <tr>
                  <th className="px-4 py-2 text-left">Pair</th>
                  <th className="px-4 py-2 text-left">Action</th>
                  <th className="px-4 py-2 text-left">Entry Date</th>
                  <th className="px-4 py-2 text-left">Entry Price</th>
                  <th className="px-4 py-2 text-left">Lot Size</th>
                  <th className="px-4 py-2 text-left">Risk (%)</th>
                  <th className="px-4 py-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tradesOpen.map((t, i) => {
                  console.log(`🔹 Rendering Open Trade [${i}]`, t);
                  return (
                    <tr key={t.id} className="border-t border-gray-800">
                      <td className="px-4 py-3">{t.pair}</td>
                      <td className="px-4 py-3">
                        {t.type === "long" ? "Buy" : "Sell"}
                      </td>
                      <td className="px-4 py-3">{t.entryDate}</td>
                      <td className="px-4 py-3">{t.entryPrice}</td>
                      <td className="px-4 py-3">{fmt2(t.lotSize)}</td>
                      <td className="px-4 py-3">{fmt2(t.risk)}%</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2 items-center">
                          <button
                            className="bg-green-600 px-3 py-2 rounded-full text-white"
                            onClick={() => openCloseModal(t.id)}
                          >
                            Close
                          </button>
                          <button
                            className="bg-gray-700 px-3 py-2 rounded-full text-white"
                            onClick={() => openEditModal(t)}
                          >
                            Edit
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  </>
)}




{/* ------------------ */}
{/* Closed Trades Tab */}
{/* ------------------ */}
{activeTab === "closed" && (
  <>
    {console.log("📕 [Render] Closed Trades tab active")}
    {console.log("📕 tradesHistory array:", tradesHistory)}
    {console.log("📕 tradesHistory count:", tradesHistory?.length || 0)}
    {console.log("📕 sortedFilteredHistory:", sortedFilteredHistory)}

    <div className="space-y-4">
      <div className="bg-gray-800 border border-gray-700 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-lg font-semibold">Closed Trades</h4>
          ...
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full bg-gray-900 rounded-lg overflow-hidden">
            <thead className="bg-gray-800 text-gray-300">
              <tr>
                <th className="px-4 py-2 text-left">Pair</th>
                <th className="px-4 py-2 text-left">Action</th>
                <th className="px-4 py-2 text-left">Entry Date</th>
                <th className="px-4 py-2 text-left">PnL ($)</th>
                <th className="px-4 py-2 text-left">PnL (%)</th>
                <th className="px-4 py-2 text-left">Close Reason</th>
                <th className="px-4 py-2 text-left">Exit Date</th>
                <th className="px-4 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {sortedFilteredHistory.map((t, i) => {
                  console.log(`🔸 Rendering Closed Trade [${i}]`, t);
                  return (
                    <motion.tr
                      key={t.id}
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 6 }}
                      className="border-t border-gray-800"
                    >
                      <td className="px-4 py-3">{t.pair}</td>
                      <td className="px-4 py-3">
                        {t.type === "long" ? "Buy" : "Sell"}
                      </td>
                      <td className="px-4 py-3">{formatDate(t.entryDate)}</td>
                      <td className="px-4 py-3">
                        {t.pnlCurrency !== undefined && t.pnlCurrency !== null
                          ? `$${Number(t.pnlCurrency).toFixed(2)}`
                          : "$0.00"}
                      </td>
                      <td className="px-4 py-3">
                        {t.pnlPercent !== undefined && t.pnlPercent !== null ? (
                          Number(t.pnlPercent) > 0 ? (
                            <span className="text-green-400">
                              {Number(t.pnlPercent).toFixed(2)}% ⬆️
                            </span>
                          ) : (
                            <span className="text-red-400">
                              {Number(t.pnlPercent).toFixed(2)}% ⬇️
                            </span>
                          )
                        ) : (
                          <span>0.00%</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-1 rounded-full text-xs ${
                            t.close_reason === "Cancelled"
                              ? "bg-red-700 text-white"
                              : "bg-green-700 text-white"
                          }`}
                        >
                          {t.close_reason || "-"}
                        </span>
                      </td>
                      <td className="px-4 py-3">{formatDate(t.exitDate)}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleEditTrade(t, "closed")}
                            className="text-blue-400 hover:text-blue-600"
                          >
                            Edit
                          </button>
                          <button
                            className="px-3 py-1 rounded-full bg-red-600 text-white"
                            onClick={() => showConfirmDelete(t.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </>
)}



      {/* ------------------ */}
      {/* Daily Limit Tab */}
      {/* ------------------ */}
      {activeTab === "daily" && (
        <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6">
          <h4 className="text-lg font-semibold mb-4">Daily Limit</h4>
          {dailyRiskData.length === 0 ? (
            <div className="text-gray-400">No daily data yet</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {dailyRiskData.map((d) => (
                <div key={d.date} className="bg-gray-900 border border-gray-700 rounded-xl p-4">
                  <div className="font-semibold">{d.date}</div>
                  <div className="text-sm text-gray-400">Risk used: {fmt2(d.risk)}%</div>
                  <div className="text-sm mt-2">Daily limit: {DAILY_RISK_LIMIT_PERCENT}%</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

{/* ✅ CLOSE TRADE MODAL */}
{showCloseModal && (
  <Modal
    isOpen={showCloseModal}
    onClose={() => setShowCloseModal(false)}
    title="Close Trade"
  >
    <form className="space-y-4">
      {/* Exit Date */}
      <div className="flex flex-col">
        <label
          className="text-sm font-medium text-gray-400 mb-1"
          htmlFor="modalExitDate"
        >
          Exit Date
        </label>
        <input
          type="date"
          id="modalExitDate"
          name="modalExitDate"
          value={modalExitDate}
          onChange={(e) => setModalExitDate(e.target.value)}
          className={styles.input}
        />
      </div>

      {/* Exit Price with SL/TP buttons */}
      <div className="flex flex-col">
        <label
          className="text-sm font-medium text-gray-400 mb-1"
          htmlFor="modalExitPrice"
        >
          Exit Price
        </label>
        <div className="flex items-center space-x-2">
          <input
            type="number"
            id="modalExitPrice"
            name="modalExitPrice"
            value={modalExitPrice}
            onChange={(e) => {
  const val = e.target.value;
  setModalExitPrice(val);
  const trade = tradesOpen.find((t) => t.id === closeModalTradeId);
  if (trade) {
    const expectedPnL = computeExpectedCurrencyForClose(trade, val);
    setModalActualPnL(expectedPnL.toFixed(2));
  }
}}

            className={styles.input + " flex-1"}
            step="0.00001"
          />

          {/* SL Button */}
          <button
            type="button"
            onClick={() => {
  const trade = tradesOpen.find((t) => t.id === closeModalTradeId);
  if (trade?.stopLoss) setModalExitPrice(trade.stopLoss);
}}

            className="px-3 py-1 rounded-md bg-red-600 text-white text-sm hover:bg-red-700 transition"
          >
            SL
          </button>

          {/* TP Button */}
          <button
            type="button"
            onClick={() => {
              const trade = tradesOpen.find((t) => t.id === selectedTradeId);
              if (trade?.takeProfit) setModalExitPrice(trade.takeProfit);
            }}
            className="px-3 py-1 rounded-md bg-green-600 text-white text-sm hover:bg-green-700 transition"
          >
            TP
          </button>
        </div>

        {/* 💰 Live PnL Preview */}
        {modalActualPnL && (
          <p
            className={`mt-2 text-sm font-semibold ${
              Number(modalActualPnL) >= 0 ? "text-green-400" : "text-red-400"
            }`}
          >
            Estimated P&L: {Number(modalActualPnL) >= 0 ? "+" : ""}
            {modalActualPnL}$
          </p>
        )}
      </div>

      {/* Actual PnL (Manual override if needed) */}
      <div className="flex flex-col">
        <label
          className="text-sm font-medium text-gray-400 mb-1"
          htmlFor="modalActualPnL"
        >
          Actual P&L ($)
        </label>
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

      {/* After Image */}
      <div className="flex flex-col">
        <label
          className="text-sm font-medium text-gray-400 mb-1"
          htmlFor="afterImage"
        >
          After Image URL
        </label>
        <input
          type="url"
          id="afterImage"
          name="afterImage"
          value={modalAfterImage || ""}
          onChange={(e) => setModalAfterImage(e.target.value)}
          placeholder="https://example.com/after.jpg"
          className={styles.input}
        />
        <p className="text-xs text-gray-500 mt-1">
          Paste after image URL (optional)
        </p>
      </div>

      {/* Notes */}
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

     {/* Close Reason */}
<div className="flex flex-col">
  <label
    className="text-sm font-medium text-gray-400 mb-1"
    htmlFor="modalCloseReason"
  >
    Close Reason
  </label>
  <select
    id="modalCloseReason"
    name="modalCloseReason"
    value={modalCloseReason}
    onChange={(e) => setModalCloseReason(e.target.value)}
    className={styles.input}
  >
    <option value="Completed">Completed</option>
    <option value="Cancelled">Cancelled</option>
  </select>
</div>


      {/* Save button */}
      <button
        type="button"
        onClick={handleSaveClose}
        className={styles.submitButton}
      >
        Save and Close Trade
      </button>
    </form>
  </Modal>
)}
{/* ✅ Edit Trade Modal */}
{isEditModalOpen && tradeToEdit && (
<TradeEditModal
  isOpen={isEditModalOpen}
  onClose={() => setIsEditModalOpen(false)}
  trade={tradeToEdit}
  onSave={handleSaveEditedTrade}
/>

)}
{/* --- Toast confirm (renders when confirmToast.isVisible) --- */}
{confirmToast.isVisible && (
  <div className="fixed right-4 top-4 z-50">
    <div className="bg-gray-900 text-white p-4 rounded-lg shadow-lg w-80">
      <p className="mb-3">{confirmToast.message}</p>
      <div className="flex justify-end gap-2">
        <button
          onClick={hideConfirmDelete}
          className="px-3 py-1 rounded border border-gray-700"
        >
          Cancel
        </button>
        <button
          onClick={confirmDeleteNow}
          className="px-3 py-1 rounded bg-red-600 text-white"
        >
          Confirm
        </button>
      </div>
    </div>
  </div>
)}

{notification.isVisible && (
  <div className={`fixed left-4 bottom-4 z-50 p-3 rounded shadow-lg ${notification.type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"}`}>
    {notification.message}
  </div>
)}

    </div>
    
  );
}
