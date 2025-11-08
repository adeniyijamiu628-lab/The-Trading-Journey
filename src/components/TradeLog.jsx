// components/TradeLog.jsx
import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { v4 as uuidv4 } from "uuid";
import { Toaster, toast } from "react-hot-toast";
import { supabase } from "./supabaseClient"; // adjust path if needed
import { getSessionForTime, getSessionColors } from "../utils/sessionUtils";
// If you prefer the component to be completely independent, remove the above line and rely on internal session mapping
import TradeEditModalClosed from "./TradeEditModalClosed";
import TradeEditModalActive from "./TradeEditModalActive"
import LotSizeCalculator from "./LotSizeCalculator";

// ------------------------------
// Helper Utilities (trade-specific)
// ------------------------------
function fmt2(n) {
  if (n === null || n === undefined || isNaN(Number(n))) return "0.00";
  return Number(n).toFixed(2);
}

const formatDate = (isoString) => {
  if (!isoString) return "";
  // Extracts YYYY-MM-DD from an ISO 8601 string like "YYYY-MM-DDTHH:MM:SSZ"
  return isoString.split("T")[0];
};



const normalizeTradeForDB = (t, userId, accountId) => {
  // Normalize trade status to consistent lifecycle values
  const rawState = (t.state || "").toString().toLowerCase();

  let state;
  if (rawState === "active") {
    state = "Active";
  } else if (rawState === "closed") {
    state = "Closed";
  } else {
    state = "Active"; // Default for new trades
  }

  // Helper to safely convert a date string to full ISO format
  const toISOTimestamp = (dateVal) => {
    if (!dateVal) return null;
    try {
      return new Date(dateVal).toISOString();
    } catch {
      return null;
    }
  };

  // Return normalized object ready for Supabase
  return {
    id: t.id,
    user_id: userId,
    account_id: accountId,
    pair: t.pair ?? null,
    type: t.type ?? null,
    trade_time: t.tradeTime ?? t.trade_time ?? null,
    entry_date: toISOTimestamp(t.entryDate ?? t.entry_date),
    entry_price: t.entryPrice ?? t.entry_price ?? null,
    sl: t.stopLoss ?? t.sl ?? null,
    tp: t.takeProfit ?? t.tp ?? null,
    risk: t.risk ?? 0,
    lot_size: t.lotSize ?? t.lotsize ?? null,
    value_per_pip: t.valuePerPip ?? t.value_per_pip ?? null,
    state, // ✅ use normalized "Active" or "Closed"
    status: t.status || "Valid", // ✅ fixed
    ratio: t.ratio ?? null,
    beforeimage: t.beforeImage ?? t.before_image ?? null,
    afterimage: t.afterImage ?? t.after_image ?? null,
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
  status: r.status ?? "Active",
  ratio: r.ratio ?? null,
  beforeImage: r.before_image ?? r.beforeImage ?? null,
  afterImage: r.after_image ?? r.afterImage ?? null,
  exitDate: r.exit_date ?? r.exitDate ?? null,
  exitPrice: r.exit_price ?? r.exitPrice ?? null,
  points: r.points ?? null,

  // ✅ Fix: unify naming for UI
  pnlCurrency: parseFloat(r.pnl_currency ?? r.pnlCurrency ?? 0),
  actualPnL: parseFloat(r.pnl_currency ?? r.pnlCurrency ?? 0),

  pnlPercent: parseFloat(r.pnl_percent ?? r.pnlPercent ?? 0),
  percentagePnL: parseFloat(r.pnl_percent ?? r.pnlPercent ?? 0),

  session: r.session ?? "",
  strategy: r.strategy ?? "",
  note: r.note ?? null,
  state: r.state ?? "Closed",
  created_at: r.created_at,
  updated_at: r.updated_at,
});



const isValidUrl = (s) => {
  try {
    const url = new URL(s);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

// ------------------------------
// Value per pip (vpBase) and multipliers
// ------------------------------
const vpBase = {
  // Optional: you can still list specific pairs here if you ever want to override rules
};

// Rule-based value per pip logic
const getBaseVP = (pair) => {
  if (pair.endsWith("/USD")) return 10.0;  // includes XAU/USD, EUR/USD, GBP/USD, etc.
  if (pair.endsWith("/JPY")) return 6.8;
  if (pair.endsWith("/CAD")) return 7.3;
  if (pair.endsWith("/CHF")) return 12.4;
  // Future expansion: add other endings (e.g. /NZD, /AUD) if needed
  return 0; // default if no rule matches
};

// ------------------------------
// List of supported pairs for dropdown
// ------------------------------
const availablePairs = [
  "EUR/USD",
  "GBP/USD",
  "USD/JPY",
  "USD/CAD",
  "AUD/USD",
  "NZD/USD",
  "EUR/GBP",
  "EUR/JPY",
  "GBP/JPY",
  "USD/CHF",
  "XAU/USD",
  "XAG/USD",
  "US30",
  "NAS100",
];


const getMultiplier = (pair = "") => {
  const p = pair.toUpperCase().trim();

  if (p.endsWith("/JPY")) return 1000; // precise for JPY
  if (p.startsWith("XAU/") || p.startsWith("XAG/") || p.startsWith("XPT/")) return 100; // metals
  return 100000; // default for standard forex pairs
};


// Adjusted VP according to account type
const getAdjustedVP = (pair, accountType) => {
  const base = getBaseVP(pair);
  if (!base) return 0;

  if (!accountType) accountType = "Standard";
  const acct = accountType.toLowerCase();

  if (acct === "mini") return base / 10;
  if (acct === "micro") return base / 100;
  return base; // Standard
};

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
  userId: propUserId,
  accountId: propAccountId,
  initialCapital = 1000,
  initialAccountType = "Standard",
}) {
  // 🔹 Directly use props — don’t reset them with empty state
  const [userId, setUserId] = useState(propUserId);
  const [currentAccountId, setCurrentAccountId] = useState(propAccountId);
  const [capital, setCapital] = useState(initialCapital);
  const [accountType, setAccountType] = useState(initialAccountType);

  // ✅ Derived ID fallback (just in case)
  const effectiveUserId = userId || propUserId;
  const effectiveAccountId = currentAccountId || propAccountId;


  // ------------------------------
  // Auto-fetch account details from Supabase
  // ------------------------------
  useEffect(() => {
    const fetchAccountDetails = async () => {
      if (!userId) return;

      try {
        // Fetch the currently active account if ID is known
        let query = supabase
          .from("account")
          .select("id, account_type, capital")
          .eq("user_id", userId)
          .order("created_at", { ascending: true });

        // If currentAccountId is already known, target that specific account
        if (currentAccountId) {
          query = query.eq("id", currentAccountId);
        } else {
          query = query.limit(1);
        }

        const { data: accountData, error } = await query.single();

        if (error) {
          console.error("Error fetching account details:", error.message);
          return;
        }

        if (accountData) {
          setCurrentAccountId(accountData.id);
          setAccountType(accountData.account_type || "Standard");
          setCapital(accountData.capital || 0);
        }
      } catch (err) {
        console.error("Unexpected error loading account:", err);
      }
    };

    fetchAccountDetails();
  }, [userId, currentAccountId]);

// ------------------------------
// ✅ Verify Supabase "trades" table schema
// ------------------------------
useEffect(() => {
 const verifyTradesSchema = async () => {
  try {
    console.log("⚙️ Verifying trades schema (simple check)...");
    const { data, error } = await supabase
      .from("trades")
      .select("id")
      .limit(1);

    if (error) throw error;
    console.log("✅ Trades table verified via direct query.");
  } catch (err) {
    console.warn("⚠️ Could not verify schema, fallback active:", err.message);
  }
};


  verifyTradesSchema();
}, []);



  // Trade states
  const [activeTrades, setActiveTrades] = useState([]);
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
  const [tradeStatus, setTradeStatus] = useState("Valid ");
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
  if (!effectiveUserId || !effectiveAccountId) return;

  const { data, error } = await supabase
    .from("trades")
    .select("*")
    .eq("user_id", effectiveUserId)
    .eq("account_id", effectiveAccountId)
    .eq("state", "Closed")
    .order("exit_date", { ascending: false });


  if (error) {
    console.error("[fetchClosedTrades] ❌ Error fetching closed trades:", error);
    return;
  }

  if (data) {
    // Clean up date fields for the UI
    const normalized = data.map((t) => ({
      ...t,
      entryDateFormatted: toDateOnly(t.entryDate ?? t.openDate),
      exitDateFormatted: toDateOnly(t.exitDate ?? t.closeDate),
    }));

    setTradesHistory(normalized);
    console.debug("[fetchClosedTrades] ✅ Loaded closed trades:", normalized.length);
  }
};



const fetchActiveTrades = async () => {
  if (!effectiveUserId || !effectiveAccountId) return;

  const { data, error } = await supabase
    .from("trades")
    .select("*")
    .eq("user_id", effectiveUserId)
    .eq("account_id", effectiveAccountId)
    .eq("state", "Active")
    .order("entry_date", { ascending: false });


  if (error) {
    console.error("[fetchActiveTrades] ❌ Error fetching active trades:", error);
    return;
  }

  if (data) {
    setActiveTrades(data);
    console.debug("[fetchActiveTrades] ✅ Loaded active trades:", data.length);
  }
};

// ============================
// ✅ LiveCalculationBox inline component
// ============================
const LiveCalculationBox = ({
  formData,
  capital,
  accountType,
  summaryForSelectedDate,
  DAILY_RISK_LIMIT_PERCENT,
  getMultiplier,
  getAdjustedVP,
  fmt2,
}) => {
  const parseNumber = (val) => {
    const n = Number(val);
    return Number.isFinite(n) ? n : 0;
  };

  const stopLossPoints = useMemo(() => {
    const entry = parseNumber(formData.price);
    const stop = parseNumber(formData.sl);
    if (!entry || !stop || !formData.pair) return 0;
    const raw =
      formData.type?.toLowerCase() === "long" ? entry - stop : stop - entry;
    return Math.round(Math.abs(raw) * getMultiplier(formData.pair));
  }, [formData, getMultiplier]);

  const takeProfitPoints = useMemo(() => {
    const entry = parseNumber(formData.price);
    const tp = parseNumber(formData.tp);
    if (!entry || !tp || !formData.pair) return 0;
    const raw =
      formData.type?.toLowerCase() === "long" ? tp - entry : entry - tp;
    return Math.round(Math.abs(raw) * getMultiplier(formData.pair));
  }, [formData, getMultiplier]);

  const valuePerPip = useMemo(
    () => getAdjustedVP(formData.pair, formData.accountType || accountType),
    [formData.pair, formData.accountType, accountType, getAdjustedVP]
  );

  const lotSize = useMemo(() => {
    if (!capital || !formData.pair) return 0;
    if (stopLossPoints === 0) return 0;
    const riskDecimal = parseNumber(formData.risk) / 100;
    const lot =
      (riskDecimal * capital) / (valuePerPip * Math.abs(stopLossPoints));
    return Number(lot.toFixed(2));
  }, [capital, formData, valuePerPip, stopLossPoints]);

  const estRisk = Number((lotSize * valuePerPip * stopLossPoints).toFixed(2));
  const estProfit = Number(
    (lotSize * valuePerPip * takeProfitPoints).toFixed(2)
  );
  const ratio =
    stopLossPoints > 0 ? (takeProfitPoints / stopLossPoints).toFixed(2) : "N/A";

  return (
    <div className="mt-4 p-4 rounded-xl bg-gray-800 border border-gray-700 space-y-2 text-sm text-gray-200">
      <p>
        <span className="font-semibold">SL Points:</span>{" "}
        <span className="text-red-500">{stopLossPoints || 0}</span>
      </p>
      <p>
        <span className="font-semibold">TP Points:</span>{" "}
        <span className="text-blue-400">{takeProfitPoints || 0}</span>
      </p>
      <p>
        <span className="font-semibold">R Ratio:</span>{" "}
        <span className="text-white">{ratio}</span>
      </p>
      <p>
        <span className="font-semibold">Lot Size:</span>{" "}
        <span className="text-amber-300">{fmt2(lotSize)}</span>
      </p>
      <p>
        <span className="font-semibold">Est. Risk:</span>{" "}
        <span className="text-red-500">${fmt2(estRisk)}</span>
      </p>
      <p>
        <span className="font-semibold">Est. Profit:</span>{" "}
        <span className="text-green-500">${fmt2(estProfit)}</span>
      </p>
      <p>
        <span className="font-semibold">Daily Risk Used:</span>{" "}
        <span className="text-gray-300">
          {fmt2(summaryForSelectedDate?.riskUsed)}% of{" "}
          {fmt2(DAILY_RISK_LIMIT_PERCENT)}%
        </span>
      </p>
    </div>
  );
};




// summaryForSelectedDate: conservative safe implementation
const summaryForSelectedDate = useMemo(() => {
  const entryDate = formData.entryDate;
  const tradesForDate = tradesHistory.filter(
    (t) => (t.entryDate || "").slice(0, 10) === (entryDate || "").slice(0, 10)
  );
  const activeTradesForDate = activeTrades.filter(
    (t) => (t.entryDate || "").slice(0, 10) === (entryDate || "").slice(0, 10)
  );
  const totalRisk = activeTradesForDate.reduce(
    (s, t) => s + Number(t.risk || 0),
    0
  );
  return {
    totalTrades: tradesForDate.length + activeTradesForDate.length,
    riskUsed: totalRisk,
  };
}, [formData.entryDate, tradesHistory, activeTrades]);


  const PER_TRADE_LIMIT_PERCENT = 3;
  const DAILY_RISK_LIMIT_PERCENT = 5;
  const MAX_TRADES_PER_DAY = 3;
  const MAX_ACTIVE_TRADES_PER_DAY = 2;
  const MAX_CANCEL_TRADES_PER_DAY = 1;

// ------------------------------
// Robust persistJournal (REPLACE existing persistJournal)
// ------------------------------
const persistJournal = async (
  activeTradesList = activeTrades,
  historyTrades = tradesHistory
) => {
  if (!effectiveUserId || !effectiveAccountId) {
    console.warn("[persistJournal] Skipping save — missing effective IDs");
    return;
  }

  // Fix: correct spreading of arrays (no weird tokens)
  const allTrades = [...(activeTradesList || []), ...(historyTrades || [])];
  if (allTrades.length === 0) return;

  // helper convert to ISO (reuse if you have the same above)
  const toISOTimestamp = (dateVal) => {
    if (!dateVal) return null;
    try {
      return new Date(dateVal).toISOString();
    } catch {
      return null;
    }
  };

  const sanitizedTrades = allTrades.map((t) => {
    return {
      id: t.id,
      user_id: effectiveUserId,
      account_id: effectiveAccountId,
      pair: (t.pair || "").toString().trim(),
      type: t.type || "",
      entry_date: t.entry_date || toISOTimestamp(t.entryDate) || null,
      entry_price: t.entry_price ?? t.entryPrice ?? null,
      sl: t.sl ?? t.stopLoss ?? null,
      tp: t.tp ?? t.takeProfit ?? null,
      risk: Number(t.risk) || 0,
      lot_size: t.lot_size ?? t.lotSize ?? null,
      value_per_pip: t.value_per_pip ?? t.valuePerPip ?? null,
      state:
        t.state && (t.state || "").toString().toLowerCase() === "closed"
          ? "Closed"
          : (t.state || "Active"),
      status: t.status ?? "Valid",
      ratio: t.ratio ?? null,
      beforeimage: t.beforeimage ?? t.beforeImage ?? null,
      afterimage: t.afterimage ?? t.afterImage ?? null,
      exit_date: t.exit_date ?? toISOTimestamp(t.exitDate) ?? null,
      exit_price: t.exit_price ?? t.exitPrice ?? null,
      points: typeof t.points !== "undefined" ? Number(t.points) : null,
      pnl_currency: t.pnl_currency ?? t.pnlCurrency ?? null,
      pnl_percent: t.pnl_percent ?? t.pnlPercent ?? null,
      session: t.session || "",
      strategy: t.strategy || "",
      note: t.note || "",
      created_at: t.created_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  });

  // dedupe by id (last one wins)
  const uniqueTrades = Object.values(
    sanitizedTrades.reduce((acc, trade) => {
      acc[trade.id] = trade;
      return acc;
    }, {})
  );

  try {
    const { data, error } = await supabase
      .from("trades")
      .upsert(uniqueTrades, { onConflict: ["id"] });

    if (error) {
      console.error("[persistJournal] ❌ Supabase upsert error:", error.message || error);
      // throw so calling code / console sees it; prevents silent failure
      throw new Error(error.message || "persistJournal upsert failed");
    }

    console.debug(`[persistJournal] ✅ ${uniqueTrades.length} trades persisted.`, data);
    return data;
  } catch (err) {
    console.error("[persistJournal] 💥 Unexpected error:", err);
    // rethrow to make problems visible upstream
    throw err;
  }
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
      setActiveTrades([]);
      setTradesHistory([]);
      return;
    }

    console.log(`📦 Supabase returned ${data.length} trades`);

    // ✅ Normalize and clean data
    const formatted = data.map((t) => {
      const rawState = t.state?.toLowerCase?.() || "";
      const rawStatus = t.status?.toLowerCase?.() || "";

      return {
        ...t,
        entryPrice: t.entry_price ?? t.entryPrice ?? null,
        stopLoss: t.sl ?? t.stopLoss ?? null,
        takeProfit: t.tp ?? t.takeProfit ?? null,
        lotSize: t.lot_size ?? t.lotSize ?? null,
        valuePerPip: t.value_per_pip ?? t.valuePerPip ?? null,
        entryDate: t.entry_date ?? t.entryDate ?? null,
        exitDate: t.exit_date ?? t.exitDate ?? null,
        exitPrice: t.exit_price ?? t.exitPrice ?? null,

        // 🧮 PnL normalization (🔥 Fix)
        pnlCurrency: parseFloat(t.pnl_currency ?? t.pnlCurrency ?? 0),
        pnlPercent: parseFloat(t.pnl_percent ?? t.pnlPercent ?? 0),
        actualPnL: parseFloat(t.pnl_currency ?? t.pnlCurrency ?? 0),
        percentagePnL: parseFloat(t.pnl_percent ?? t.pnlPercent ?? 0),

        // 🧭 Normalize state & status
        state:
          rawState === "closed"
            ? "Closed"
            : rawState === "active"
            ? "Active"
            : "Active",

        status:
          rawStatus === "invalid"
            ? "Invalid"
            : rawStatus === "valid"
            ? "Valid"
            : "Valid",

        created_at: t.created_at ?? new Date().toISOString(),
        updated_at: t.updated_at ?? new Date().toISOString(),
      };
    });

    // ✅ Split Active vs Closed based on state
    const activeTradesList = formatted.filter((t) => t.state === "Active");
    const closedTradesList = formatted.filter((t) => t.state === "Closed");

    console.log(
      `✅ Supabase parsed: ${activeTradesList.length} active, ${closedTradesList.length} closed`
    );

    setActiveTrades(activeTradesList);
    setTradesHistory(closedTradesList);
  } catch (err) {
    console.error("💥 Unexpected error loading from Supabase:", err);
  }
};





// ------------------------------
// updateTradeInDB: returns {data} or throws on error (REPLACE existing)
// ------------------------------
const updateTradeInDB = async (trade) => {
  if (!trade || !trade.id || !effectiveUserId || !effectiveAccountId) {
    console.warn("[updateTradeInDB] Missing trade, userId, or currentAccountId");
    throw new Error("Missing trade/user/account context for update");
  }

  try {
    const row = normalizeTradeForDB(trade, effectiveUserId, effectiveAccountId);

    // ensure canonical naming
    row.state = trade.state || row.state || "Active";
    row.status = trade.status || row.status || "Valid";

    const { data, error } = await supabase
      .from("trades")
      .upsert([row], { onConflict: ["id"] });

    if (error) {
      console.error("[updateTradeInDB] ❌ Supabase error:", error.message || error);
      // throw so caller knows DB didn't persist
      throw new Error(error.message || "Supabase updateTradeInDB upsert failed");
    }

    console.log("[updateTradeInDB] ✅ Trade updated:", row.id, data);
    return data;
  } catch (err) {
    console.error("[updateTradeInDB] 💥 Unexpected error:", err);
    throw err;
  }
};



// ------------------------------
// ✅ Initialize and sync trades (localStorage → Supabase fallback)
// ------------------------------
useEffect(() => {
  const initJournal = async () => {
    try {
      if (!effectiveUserId || !effectiveAccountId) {
        console.warn("⚠️ initJournal skipped — waiting for valid user/account IDs...");
        return;
      }

      await loadJournalFromSupabase(effectiveUserId, effectiveAccountId);
    } catch (err) {
      console.error("💥 Error restoring journal:", err);
      await loadJournalFromSupabase(effectiveUserId || userId, effectiveAccountId || currentAccountId);
    }
  };

  initJournal();
}, [effectiveUserId, effectiveAccountId]);

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
  if (!userId || !currentAccountId) return;
  if (!activeTrades && !tradesHistory) return;

  persistJournal(activeTrades, tradesHistory);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [activeTrades, tradesHistory, userId, currentAccountId]);


// ------------------------------
// ✅ Calculation Helpers (Fixed Scope)
// ------------------------------
const calculateLotSize_live = (formData) => {
  try {
    const vp = getAdjustedVP(formData.pair, formData.accountType);
    const entry = parseFloat(formData.price);
    const sl = parseFloat(formData.sl);
    const riskPercent = parseFloat(formData.risk);
    const cap = parseFloat(formData.capital || capital || 0); // ✅ safely fallback

    if (!vp || !cap || !riskPercent || !entry || !sl || entry === sl) return 0;

    const slDistance = Math.abs(entry - sl);
    if (!slDistance) return 0;

    const riskAmount = (riskPercent / 100) * cap;
    const lot = riskAmount / (vp * slDistance);

    return Number(lot.toFixed(2)); // ✅ e.g. 0.11, 1.25, etc.
  } catch (err) {
    console.error("calculateLotSize_live error:", err);
    return 0;
  }
};

const calculateStopLossPoints_live = (formData) => {
  const entry = parseFloat(formData.price);
  const sl = parseFloat(formData.sl);
  if (!entry || !sl) return 0;
  return Math.abs(entry - sl);
};

const calculateTakeProfitPoints_live = (formData) => {
  const entry = parseFloat(formData.price);
  const tp = parseFloat(formData.tp);
  if (!entry || !tp) return 0;
  return Math.abs(entry - tp);
};


// TradeLog.jsx: Corrected handleAddTrade function

const handleAddTrade = async (e) => {
  e && e.preventDefault && e.preventDefault();

  if (!formData.pair || !formData.price || !formData.entryDate) {
    setShowEditModal(false);
    toast.error("Please provide pair, price and entry date.");
    return;
  }

  // 🔹 FIX: include the selected tradeTime or current time
  const currentTime = new Date().toTimeString().slice(0, 5); // e.g. "14:30"
  formData.tradeTime = tradeTime || formData.tradeTime || currentTime;

  // --- Calculations ---
  const vpAtSave = getAdjustedVP(formData.pair, formData.accountType);
  const lot = calculateLotSize_live(formData);
  const slPoints = calculateStopLossPoints_live(formData);
  const tpPoints = calculateTakeProfitPoints_live(formData);
  const ratio = slPoints ? tpPoints / slPoints : null;

  // --- Trade Object for Local State ---
  const stateTrade = {
    id: uuidv4(),
    userId: userId,
    accountId: currentAccountId,
    pair: formData.pair?.trim() || "",
    type: formData.type || "",
    entryDate: formData.entryDate || new Date().toISOString().slice(0, 10),
    tradeTime: formData.tradeTime || currentTime, // ✅ ensures current time fallback
    entryPrice: parseFloat(formData.price) || null,
    sl: parseFloat(formData.sl) || null,
    tp: parseFloat(formData.tp) || null,
    risk: parseFloat(formData.risk) || 0,
    lotSize: Number(lot) || 0,
    valuePerPip: Number(vpAtSave) || 0,
    ratio,
    beforeImage: formData.beforeImage?.trim() || null,
    state: "Active",
    status: "Valid",
    session: formData.session || "",
    strategy: formData.strategy || "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // --- Trade Object for Supabase DB ---
  const dbTrade = {
    id: stateTrade.id,
    user_id: userId,
    account_id: currentAccountId,
    pair: stateTrade.pair,
    type: stateTrade.type,
    entry_date: stateTrade.entryDate,
    trade_time: stateTrade.tradeTime, // ✅ will store correct or current time
    entry_price: stateTrade.entryPrice,
    sl: stateTrade.sl,
    tp: stateTrade.tp,
    risk: stateTrade.risk,
    lot_size: stateTrade.lotSize,
    value_per_pip: stateTrade.valuePerPip,
    ratio: stateTrade.ratio,
    beforeimage: stateTrade.beforeImage,
    state: stateTrade.state,
    status: stateTrade.status,
    session: stateTrade.session,
    strategy: stateTrade.strategy,
    created_at: stateTrade.createdAt,
    updated_at: stateTrade.updatedAt,
  };

  try {
    // ✅ Use upsert to prevent duplicate conflicts
    const { error } = await supabase.from("trades").upsert([dbTrade]);

    if (error) {
      console.error("[handleAddTrade] ❌ Supabase upsert error:", error.message);
      throw new Error(error.message);
    } else {
      console.debug("[handleAddTrade] ✅ Trade inserted/upserted:", dbTrade.id);
    }

    // ✅ Update local state after successful save
    const updatedActive = [stateTrade, ...activeTrades];
    setActiveTrades(updatedActive);
    localStorage.setItem("activeTrades", JSON.stringify(updatedActive));

    console.debug("[handleAddTrade] Local state and storage updated.");

    // ✅ Reset form but keep time as current system time
    const newCurrentTime = new Date().toTimeString().slice(0, 5);
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
      tradeTime: newCurrentTime, // ✅ maintain current time after each new trade
    });

    // also update the standalone time state if used in input binding
    setTradeTime(newCurrentTime);

    toast.success("Trade added");
    setActiveTab("open");
  } catch (err) {
    console.error("[handleAddTrade] 💥 Error adding trade:", err);
    toast.error("Failed to add trade");
  }
};

// ------------------------------
// ✅ Handle Form Input Change
// ------------------------------
const handleAddTradeChange = (e) => {
  const { name, value } = e.target;
  setFormData((prev) => ({
    ...prev,
    [name]: value,
  }));
};


// alias so new form works without refactor 
const handleSaveTrade = handleAddTrade; 
const handleChange = handleAddTradeChange; 

// ------------------------------
// ✅ Safe Numeric Parser
// ------------------------------
const parseNumber = (value, fallback = 0) => {
  if (value === null || value === undefined || value === "" || isNaN(value))
    return fallback;
  return parseFloat(value);
};

// ------------------------------
// ✅ Close trade modal & handler (final optimized version)
// ------------------------------
const openCloseModal = (tradeId) => {
  const t = activeTrades.find((x) => x.id === tradeId);
  if (!t) return;

  const today = new Date().toISOString().slice(0, 10);
  setCloseModalTradeId(tradeId);
  setModalExitDate(today);
  setModalExitPrice("");
  setModalActualPnL("");
  setModalAfterImage("");
  setTradeStatus("Valid");
  setCloseNote("");

  // Optional: Prefill exit price if TP exists
  if (t.tp ?? t.takeProfit) {
    setModalExitPrice(t.tp ?? t.takeProfit);
  }

  // Optional: Compute preview immediately if TP exists
  const exitPrice = t.tp ?? t.takeProfit;
  if (exitPrice) {
    try {
      const previewPnL = computeExpectedCurrencyForClose(t, exitPrice);
      setModalActualPnL(previewPnL.toFixed(2));
    } catch (err) {
      console.warn("[openCloseModal] previewPnL error:", err);
    }
  }

  setShowCloseModal(true);
};

// ------------------------------
// ✅ Compute Expected PnL + Percent Preview
// ------------------------------
const computeExpectedCurrencyForClose = (trade, exitPrice) => {
  if (!trade || !exitPrice) return 0;

  const exit = parseNumber(exitPrice);
  const entry = parseNumber(trade.entryPrice ?? trade.price);
  const vp = parseNumber(trade.valuePerPip);
  const lot = parseNumber(trade.lotSize);
  const diff = trade.type === "long" ? exit - entry : entry - exit;
  const pnl = diff * vp * lot;

  return isFinite(pnl) ? pnl : 0;
};

// ------------------------------
// ✅ Live Update when Exit Price changes
// ------------------------------
useEffect(() => {
  if (!closeModalTradeId) return;
  const t = activeTrades.find((x) => x.id === closeModalTradeId);
  if (!t) return;

  if (modalExitPrice !== "") {
    const expected = computeExpectedCurrencyForClose(t, modalExitPrice);
    setModalActualPnL(Number(expected).toFixed(2));
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [modalExitPrice, closeModalTradeId]);

// ------------------------------
// ✅ Keep accountType synced
// ------------------------------
useEffect(() => {
  if (!accountType) return;
  setAccountType(accountType);
  setFormData((prev) => ({ ...prev, accountType }));
}, [accountType]);

// ------------------------------
// ✅ Handle Save Close (with percent)
// ------------------------------
const handleSaveClose = async () => {
  console.debug("[handleSaveClose] triggered for tradeId:", closeModalTradeId);

  const trade = activeTrades.find((t) => t.id === closeModalTradeId);
  if (!trade) {
    console.warn("[handleSaveClose] Trade not found:", closeModalTradeId);
    return;
  }

  const exitPriceNum = parseNumber(modalExitPrice);
  const manualPnLNum = parseNumber(modalActualPnL);
  const exitTimestamp = modalExitDate
    ? new Date(modalExitDate).toISOString()
    : new Date().toISOString();

  // Compute PnL if manualPnL not provided
  const vp = parseNumber(trade.valuePerPip);
  const lot = parseNumber(trade.lotSize);
  const entry = parseNumber(trade.entryPrice);
  const diff = trade.type === "long" ? exitPriceNum - entry : entry - exitPriceNum;
  const computedPnL = diff * vp * lot;

  const pnlCurrency =
    manualPnLNum !== 0 ? manualPnLNum : Number(computedPnL.toFixed(2));
  const pnlPercent = capital ? (pnlCurrency / capital) * 100 : 0;

  // Calculate signed points
  const mult = getMultiplier(trade.pair);
  const rawPoints = (exitPriceNum - entry) * mult;
  const pointsSigned =
    trade.type === "long" ? Math.round(rawPoints) : Math.round(-rawPoints);

  // Build closed trade record
  const closed = {
    ...trade,
    exitDate: exitTimestamp,
    exitPrice: exitPriceNum,
    points: pointsSigned,
    pnlCurrency: Number(pnlCurrency),
    pnlPercent: Number(pnlPercent),
    state: "Closed",
    status: tradeStatus || "Valid",
    afterImage:
      modalAfterImage && isValidUrl(modalAfterImage)
        ? modalAfterImage.trim()
        : null,
    beforeImage:
      trade.beforeImage && isValidUrl(trade.beforeImage)
        ? trade.beforeImage.trim()
        : trade.beforeimage || null,
    note: closeNote || trade.note || "",
    updated_at: new Date().toISOString(),
  };

  const updatedActive = activeTrades.filter((t) => t.id !== trade.id);
  const updatedHistory = [...tradesHistory, closed];

  setActiveTrades(updatedActive);
  setTradesHistory(updatedHistory);

  try {
    await updateTradeInDB(closed);
    await persistJournal(updatedActive, updatedHistory);
    toast.success("Trade closed and saved");
  } catch (err) {
    console.error("[handleSaveClose] save error:", err);
    try {
      localStorage.setItem("activeTrades", JSON.stringify(updatedActive));
      localStorage.setItem("tradesHistory", JSON.stringify(updatedHistory));
      console.warn("[handleSaveClose] fallback local save successful");
      toast.success("Trade closed (saved locally)");
    } catch (localErr) {
      console.error("[handleSaveClose] fallback local save failed:", localErr);
      toast.error("Failed to save closed trade");
    }
  } finally {
    setShowCloseModal(false);
    setCloseModalTradeId(null);
    setModalExitDate("");
    setModalExitPrice("");
    setModalActualPnL("");
    setModalAfterImage("");
    setTradeStatus("Valid");
    setCloseNote("");
  }
};

// ------------------------------
// ✅ Open Edit Modal (unchanged)
// ------------------------------
const openEditModal = (trade) => {
  if (!trade) return;
  setEditingTrade({ ...trade });
  setShowEditModal(true);
};



  // ------------------------------
  // Daily Limit view (exact behavior kept)
  // ------------------------------
const dailyRiskData = useMemo(() => {
  const allTrades = [...tradesHistory, ...activeTrades];
  const map = {};
  allTrades.forEach((trade) => {
    const date = (trade.entryDate || new Date()).toString().slice(0, 10);
    if (!map[date]) map[date] = 0;
    if (trade.state === "Active") map[date] += Number(trade.risk || 0);
  });
  return Object.keys(map)
    .sort((a, b) => new Date(a) - new Date(b))
    .map((d) => ({ date: d, risk: Number(map[d]) }));
}, [tradesHistory, activeTrades]);




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

// --- handleClosedEditedTrade (new) ---
const handleClosedEditedTrade = async (updatedTrade) => {
  if (!userId || !currentAccountId) return;

  console.debug("✏️ handleClosedEditedTrade called:", updatedTrade);

  // Find the original closed trade (we only touch tradesHistory)
  const originalTrade = tradesHistory.find((t) => t.id === updatedTrade.id);
  if (!originalTrade) {
    toast.error("Trade not found in closed trades");
    return;
  }

  // Merge new changes with old data
  const mergedTrade = {
    ...originalTrade,
    ...updatedTrade,
    state: "Closed", // ✅ ensure it's always closed
    updatedAt: new Date().toISOString(),
  };

  // Normalize for DB (convert camelCase → snake_case)
  const rowForDb = normalizeTradeForDB(mergedTrade, userId, currentAccountId);

  try {
    // Save updated trade to Supabase
    const { error } = await supabase
      .from("trades")
      .upsert([rowForDb], { onConflict: "id" });

    if (error) {
      console.error("[handleClosedEditedTrade] ❌ Supabase error:", error);
      toast.error("Failed to save edited trade");
      return;
    }

    // ✅ Replace in local tradesHistory (closed trades)
    const updatedClosedList = tradesHistory.map((t) =>
      t.id === mergedTrade.id ? mergedTrade : t
    );

    setTradesHistory(updatedClosedList);
    localStorage.setItem("closedTrades", JSON.stringify(updatedClosedList));

    toast.success("Closed trade updated successfully!");
    setShowEditModal(false);
    setEditingTrade(null);

    console.debug("[handleClosedEditedTrade] ✅ Closed trade replaced successfully");
  } catch (err) {
    console.error("[handleClosedEditedTrade] 💥 Error:", err);
    toast.error("Error updating closed trade");
  }
};


// --- handleActiveEditedTrade (new) ---
const handleActiveEditedTrade = async (updatedTrade) => {
  if (!userId || !currentAccountId) return;

  console.debug("✏️ handleActiveEditedTrade called:", updatedTrade);

  // Find the original active trade
  const originalTrade = activeTrades.find((t) => t.id === updatedTrade.id);
  if (!originalTrade) {
    toast.error("Trade not found in active trades");
    return;
  }

  // Merge changes
  const mergedTrade = {
    ...originalTrade,
    ...updatedTrade,
    state: "Active", // ✅ ensure it's still active
    updatedAt: new Date().toISOString(),
  };

  // Prepare for DB
  const rowForDb = normalizeTradeForDB(mergedTrade, userId, currentAccountId);

  try {
    // Save to Supabase
    const { error } = await supabase
      .from("trades")
      .upsert([rowForDb], { onConflict: "id" });

    if (error) {
      console.error("[handleActiveEditedTrade] ❌ Supabase error:", error);
      toast.error("Failed to save edited trade");
      return;
    }

    // ✅ Replace in local active list
    const updatedActiveList = activeTrades.map((t) =>
      t.id === mergedTrade.id ? mergedTrade : t
    );

    setActiveTrades(updatedActiveList);
    localStorage.setItem("activeTrades", JSON.stringify(updatedActiveList));

    toast.success("Active trade updated successfully!");
    setShowEditModal(false);
    setEditingTrade(null);

    console.debug("[handleActiveEditedTrade] ✅ Active trade replaced successfully");
  } catch (err) {
    console.error("[handleActiveEditedTrade] 💥 Error:", err);
    toast.error("Error updating active trade");
  }
};




// ==================================================
// 🔴 DELETE TRADE LOGIC SECTION
// ==================================================

// -----------------------------------------
// ⚡ Show and hide delete confirmation
// -----------------------------------------
const showConfirmDelete = (tradeId, trade = null) => {
  // Dynamic confirmation message
  const message = trade
    ? `Are you sure you want to delete the ${trade.pair || "trade"} opened on ${
        trade.entryDate ? new Date(trade.entryDate).toLocaleDateString() : "?"
      }?`
    : "Are you sure you want to delete this trade?";

  setConfirmToast({ isVisible: true, tradeId, message });
};

const hideConfirmDelete = () => {
  setConfirmToast({ isVisible: false, tradeId: null, message: "" });
};

// -----------------------------------------
// 🗄️ Delete trade directly from Supabase
// -----------------------------------------
const deleteTradeFromDB = async (tradeId) => {
  if (!tradeId || !userId || !currentAccountId) {
    console.warn(
      "[deleteTradeFromDB] Missing tradeId, userId, or currentAccountId — skipping delete"
    );
    return;
  }

  try {
    const { error } = await supabase
      .from("trades")
      .delete()
      .eq("id", tradeId)
      .eq("user_id", userId)
      .eq("account_id", currentAccountId);

    if (error) {
      console.error("[deleteTradeFromDB] ❌ Supabase error:", error.message);
      toast.error("Failed to delete trade from Supabase.");
    } else {
      console.log("[deleteTradeFromDB] ✅ Trade deleted successfully:", tradeId);
    }
  } catch (err) {
    console.error("[deleteTradeFromDB] 💥 Unexpected error:", err);
    toast.error("Unexpected error while deleting trade.");
  }
};

// -----------------------------------------
// 🧹 Handle trade deletion (state + DB)
// -----------------------------------------
const handleDeleteTrade = async (tradeId) => {
  try {
    // Update React state first
    const updatedHistory = tradesHistory.filter((t) => t.id !== tradeId);
    const updatedActive = activeTrades.filter((t) => t.id !== tradeId);

    setTradesHistory(updatedHistory);
    setActiveTrades(updatedActive);

    // Sync DB and journal
    await deleteTradeFromDB(tradeId);
    await persistJournal(updatedActive, updatedHistory);

    toast.success("Trade deleted successfully");
  } catch (err) {
    console.error("handleDeleteTrade error:", err);
    toast.error("Failed to delete trade");
  }
};

// -----------------------------------------
// ⚠️ Confirm delete (UI confirmation handler)
// -----------------------------------------
const confirmDeleteNow = async () => {
  const id = confirmToast?.tradeId;
  hideConfirmDelete();
  if (!id) return;
  await handleDeleteTrade(id);
};

// ==================================================
// 🔍 CLOSED TRADES — FILTER & SORT LOGIC SECTION
// ==================================================

// -----------------------------------------
// ⚙️ Filter & Sort States
// -----------------------------------------
const [filters, setFilters] = useState({
  profitType: "both", // both | profit | loss
  pair: "all",        // all | specific pair (e.g. EURUSD)
  action: "both",     // both | L | S
  status: "both",     // both | Valid | Invalid
});

const [sortConfig, setSortConfig] = useState({
  key: "entryDate",
  direction: "desc",
});

// -----------------------------------------
// 🧩 Handle Filter Changes
// -----------------------------------------
const handleFilterChange = (field, value) => {
  setFilters((prev) => ({ ...prev, [field]: value }));
};

// -----------------------------------------
// ↕️ Handle Sorting
// -----------------------------------------
const handleSort = (key) => {
  setSortConfig((prev) => {
    const newDirection =
      prev.key === key && prev.direction === "asc" ? "desc" : "asc";
    return { key, direction: newDirection };
  });
};

// -----------------------------------------
// 🧮 Compute Sorted + Filtered Closed Trades
// -----------------------------------------
// -----------------------------------------
// 🧮 Compute Sorted + Filtered Closed Trades
// -----------------------------------------
const sortedFilteredHistory = useMemo(() => {
  // ✅ Only include closed trades
  let filtered = tradesHistory.filter(
    (t) => (t.state || "").toLowerCase() === "closed"
  );

  // 🔸 Filter by Profit / Loss
  if (filters.profitType !== "both") {
    filtered = filtered.filter((t) =>
      filters.profitType === "profit"
        ? (t.pnlCurrency || 0) > 0
        : (t.pnlCurrency || 0) < 0
    );
  }

  // 🔸 Filter by Pair
  if (filters.pair !== "all") {
    filtered = filtered.filter((t) => t.pair === filters.pair);
  }

  // 🔸 Filter by Action (L = long, S = short)
  if (filters.action !== "both") {
    filtered = filtered.filter((t) =>
      filters.action === "L" ? t.type === "long" : t.type === "short"
    );
  }

  // 🔸 Filter by Status (Valid / Invalid)
  if (filters.status !== "both") {
    filtered = filtered.filter(
      (t) => (t.status || "").toLowerCase() === filters.status.toLowerCase()
    );
  }

  // ⚙️ Sort according to user-selected column
  if (sortConfig?.key) {
    const { key, direction } = sortConfig;
    const dir = direction === "asc" ? 1 : -1;

    filtered.sort((a, b) => {
      // ⭐️ FIX: Handle two-level sort for 'entryDate' ⭐️
      if (key === "entryDate") {
        // Use string comparison for sortable date/time strings
        const dateA = a.entryDate || "";
        const dateB = b.entryDate || "";
        const timeA = a.tradetime || ""; // Assuming tradetime is available here
        const timeB = b.tradetime || "";

        // 1. Primary Sort: Entry Date
        if (dateA !== dateB) {
          return dir * (dateA < dateB ? -1 : 1);
        }

        // 2. Secondary Sort: Trade Time (if dates are equal)
        return dir * (timeA < timeB ? -1 : 1);
      }
      
      // Keep original logic for other columns
      if (key === "pnlCurrency" || key === "pnlPercent") {
        return dir * ((a[key] || 0) - (b[key] || 0));
      }
      if (key === "exitDate") {
        // Use new Date() for exitDate as it doesn't need tradetime secondary sort
        return dir * (new Date(a[key] || 0) - new Date(b[key] || 0));
      }
      return 0;
    });
  } else {
    // ⭐️ FIX: Default sort (most recent first) - now includes tradetime ⭐️
    filtered.sort((a, b) => {
      // Primary Sort: Entry Date (Descending)
      if (a.entryDate > b.entryDate) return -1;
      if (a.entryDate < b.entryDate) return 1;

      // Secondary Sort: Trade Time (Descending - if dates are equal)
      if (a.tradetime > b.tradetime) return -1;
      if (a.tradetime < b.tradetime) return 1;
      
      return 0; // Dates and times are equal
    });
  }

  return filtered;
}, [tradesHistory, filters, sortConfig]);

if (!effectiveUserId || !effectiveAccountId) {
  return (
    <div className="text-gray-400 text-center p-6">
      ⚠️ Waiting for user/account context...
    </div>
  );
}


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
            onClick={() => setActiveTab("active")}
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

      {/* ✅ New Lot Size Calculator (Left) */}
      <div className="col-span-1">
        <LotSizeCalculator
          capital={capital}
          accountType={accountType}
          getAdjustedVP={getAdjustedVP}
        />
      </div>

      {/* Add Trade Form (Center / Right) */}
      <div className="col-span-2 bg-gray-800 border border-gray-700 rounded-2xl p-6">
        <h4 className="text-lg font-semibold mb-4">Add New Trade</h4>

        <form onSubmit={handleSaveTrade} className="space-y-4">
          {/* Pair / Symbol */}
          <div className="flex flex-col">
            <label
              className="text-sm font-medium text-gray-400 mb-1"
              htmlFor="pair"
            >
              Pair/Symbol
            </label>
            <select
  id="pair"
  name="pair"
  value={formData.pair}
  onChange={handleChange}
  className={styles.input}
  required
>
  <option value="">Select Pair</option>
  {availablePairs.map((p) => (
    <option key={p} value={p}>
      {p}
    </option>
  ))}
</select>

          </div>

          {/* Type + Entry Date */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col">
              <label
                className="text-sm font-medium text-gray-400 mb-1"
                htmlFor="type"
              >
                Type
              </label>
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
              <label
                className="text-sm font-medium text-gray-400 mb-1"
                htmlFor="entryDate"
              >
                Entry Date
              </label>
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
              <label
                className="text-sm font-medium text-gray-400 mb-1"
                htmlFor="price"
              >
                Entry Price
              </label>
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
              <label
                className="text-sm font-medium text-gray-400 mb-1"
                htmlFor="sl"
              >
                Stop Loss
              </label>
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
              <label
                className="text-sm font-medium text-gray-400 mb-1"
                htmlFor="tp"
              >
                Take Profit
              </label>
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
            <label
              className="text-sm font-medium text-gray-400 mb-1"
              htmlFor="risk"
            >
              Risk %
            </label>
            <select
              id="risk"
              name="risk"
              value={formData.risk}
              onChange={handleChange}
              className={styles.input}
            >
              {[...Array(11)].map((_, i) => {
                const val = (2 + i * 0.1).toFixed(1);
                return (
                  <option key={val} value={val}>
                    {val}%
                  </option>
                );
              })}
            </select>
          </div>

          {/* Session (Auto-detect) */}
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

  {/* ✅ Colored Session Display */}
  {getSessionForTime(tradeTime) ? (
    <div className="flex flex-wrap gap-2 mt-2">
      {getSessionForTime(tradeTime)
        .split("&")
        .map((s) => (
          <span
            key={s.trim()}
            className={`inline-block px-2 py-1 text-xs font-semibold rounded-full ${getSessionColors(
              s.trim()
            )}`}
          >
            {s.trim()} Session
          </span>
        ))}
    </div>
  ) : (
    <span className="text-xs text-gray-400 mt-2">Session: Unknown</span>
  )}
</div>


          {/* Strategy */}
          <div className="flex flex-col">
            <label
              className="text-sm font-medium text-gray-200 mb-1"
              htmlFor="strategy"
            >
              Strategy
            </label>
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
            <label
              className="text-sm font-medium text-gray-400 mb-1"
              htmlFor="beforeImage"
            >
              Before Image URL
            </label>
            <input
              type="url"
              id="beforeImage"
              name="beforeImage"
              value={formData.beforeImage || ""}
              onChange={handleChange}
              placeholder="https://example.com/before.jpg"
              className={styles.input}
            />
            <p className="text-xs text-gray-500 mt-1">
              Paste a publicly accessible image URL (starts with https://)
            </p>
          </div>

<LiveCalculationBox
  formData={formData}
  capital={capital}
  accountType={accountType}
  summaryForSelectedDate={summaryForSelectedDate}
  DAILY_RISK_LIMIT_PERCENT={DAILY_RISK_LIMIT_PERCENT}
  getMultiplier={getMultiplier}
  getAdjustedVP={getAdjustedVP}
  fmt2={fmt2}
/>


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
{/* ------------------ */}
{/* Active Trades Tab */}
{/* ------------------ */}
{activeTab === "active" && (
  <div className="space-y-4">
    <div className="bg-gray-800 border border-gray-700 rounded-2xl p-4">
      <h4 className="text-lg font-semibold mb-4">Active Trades</h4>

      {activeTrades.length === 0 ? (
        <div className="text-gray-400 p-6">No active trades</div>
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
              {activeTrades.map((t, i) => (
                <tr key={t.id} className="border-t border-gray-800">
                  <td className="px-4 py-3">{t.pair}</td>
                  <td className="px-4 py-3">{t.type === "long" ? "Buy" : "Sell"}</td>
                  <td className="px-4 py-3">{t.entryDate}</td>
                  <td className="px-4 py-3">{t.entryPrice}</td>
                  <td className="px-4 py-3">{Number(t.lotSize).toFixed(2)}</td> {/* ✅ fixed */}
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
                        onClick={() => handleEditTrade(t, "active")}
                      >
                        Edit
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  </div>
)}


{/* ------------------ */}
{/* Closed Trades Tab */}
{/* ------------------ */}
{activeTab === "closed" && (
    <>
        {console.log("📕 [Render] Closed Trades tab active")}
        {console.log("📕 tradesHistory:", tradesHistory)}
        {console.log("📕 sortedFilteredHistory:", sortedFilteredHistory)}

        <div className="space-y-4">
            <div className="bg-gray-800 border border-gray-700 rounded-2xl p-4">
                {/* 🔍 Filter Controls */}
                <div className="flex flex-wrap items-center justify-between mb-4 gap-3">
                    <h4 className="text-lg font-semibold">Closed Trades</h4>

                    <div className="flex flex-wrap items-center gap-3 text-sm">
                        {/* Pair Filter */}
                        <select
                            value={filters.pair}
                            onChange={(e) => handleFilterChange("pair", e.target.value)}
                            className="bg-gray-900 text-white rounded-lg px-3 py-1 border border-gray-700"
                        >
                            <option value="all">All Pairs</option>
                            {[...new Set(tradesHistory.map((t) => t.pair))].map(
                                (pair) =>
                                    pair && (
                                        <option key={pair} value={pair}>
                                            {pair}
                                        </option>
                                    )
                            )}
                        </select>

                        {/* Action Filter */}
                        <select
                            value={filters.action}
                            onChange={(e) => handleFilterChange("action", e.target.value)}
                            className="bg-gray-900 text-white rounded-lg px-3 py-1 border border-gray-700"
                        >
                            <option value="both">All Actions</option>
                            <option value="L">Long (Buy)</option>
                            <option value="S">Short (Sell)</option>
                        </select>

                        {/* Profit/Loss Filter */}
                        <select
                            value={filters.profitType}
                            onChange={(e) =>
                                handleFilterChange("profitType", e.target.value)
                            }
                            className="bg-gray-900 text-white rounded-lg px-3 py-1 border border-gray-700"
                        >
                            <option value="both">All Results</option>
                            <option value="profit">Profit Only</option>
                            <option value="loss">Loss Only</option>
                        </select>
                        
                        {/* Status Filter */}
                        <div
                            className={`relative inline-block rounded-lg border transition-all duration-200
                                ${
                                    (filters.status || "").toLowerCase() === "valid"
                                        ? "border-green-600 bg-green-950/30 text-green-400"
                                        : (filters.status || "").toLowerCase() === "invalid"
                                            ? "border-red-600 bg-red-950/30 text-red-400"
                                            : "border-gray-700 bg-gray-900 text-white"
                                }`}
                        >
                            <select
                                value={filters.status}
                                onChange={(e) => handleFilterChange("status", e.target.value)}
                                className="appearance-none bg-transparent pl-3 pr-8 py-1 rounded-lg w-full outline-none cursor-pointer"
                            >
                                <option value="both" className="text-white bg-gray-900">
                                    All Status
                                </option>
                                <option value="Valid" className="text-green-400 bg-gray-900">
                                    ✅ Valid
                                </option>
                                <option value="Invalid" className="text-red-400 bg-gray-900">
                                    ❌ Invalid
                                </option>
                            </select>

                            {/* Down arrow indicator */}
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                                ▼
                            </span>
                        </div>

                        {/* 🔄 Reset Filters Button */}
                        <button
                            onClick={() =>
                                setFilters({
                                    profitType: "both",
                                    pair: "all",
                                    action: "both",
                                    status: "both",
                                })
                            }
                            className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded-lg border border-gray-600 transition"
                        >
                            Reset Filters
                        </button>
                    </div>
                </div>

                {/* 📊 Closed Trades Table */}
                <div className="overflow-x-auto">
                    <table className="min-w-full bg-gray-900 rounded-lg overflow-hidden">
                        <thead className="bg-gray-800 text-gray-300">
                            <tr>
                                <th className="px-4 py-2 text-left cursor-pointer" onClick={() => handleSort("pair")}>
                                    Pair
                                </th>
                                <th className="px-4 py-2 text-left cursor-pointer" onClick={() => handleSort("type")}>
                                    Action
                                </th>
                                <th className="px-4 py-2 text-left cursor-pointer" onClick={() => handleSort("entryDate")}>
                                    Entry Date
                                </th>
                                <th className="px-4 py-2 text-left cursor-pointer" onClick={() => handleSort("pnlCurrency")}>
                                    PnL ($)
                                </th>
                                <th className="px-4 py-2 text-left cursor-pointer" onClick={() => handleSort("pnlPercent")}>
                                    PnL (%)
                                </th>
                                <th className="px-4 py-2 text-left">Status</th>
                                <th className="px-4 py-2 text-left cursor-pointer" onClick={() => handleSort("exitDate")}>
                                    Exit Date
                                </th>
                                <th className="px-4 py-2 text-left">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            <AnimatePresence>
                                {sortedFilteredHistory.map((t, i) => (
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
                                        {/* FIX 2: Updated PnL % Arrow Icons */}
                                        <td className="px-4 py-3">
                                            {t.pnlPercent !== undefined && t.pnlPercent !== null ? (
                                                Number(t.pnlPercent) > 0 ? (
                                                    <span className="text-green-400 flex items-center gap-1">
                                                        {Number(t.pnlPercent).toFixed(2)}% <span className="text-lg leading-none font-bold">▲</span>
                                                    </span>
                                                ) : (
                                                    <span className="text-red-400 flex items-center gap-1">
                                                        {Number(t.pnlPercent).toFixed(2)}% <span className="text-lg leading-none font-bold">▼</span>
                                                    </span>
                                                )
                                            ) : (
                                                <span>0.00%</span>
                                            )}
                                        </td>
                                        {/* FIX 1: Corrected Status Color Logic */}
                                        <td className="px-4 py-3">
                                            <span
                                                className={`px-2 py-1 rounded-full text-xs ${
                                                    t.status === "Valid"
                                                        ? "bg-green-700 text-white" // Green for Valid
                                                        : "bg-red-700 text-white"   // Red for Invalid
                                                }`}
                                            >
                                                {t.status || "-"}
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
                                                    className="px-3 py-1 rounded-full bg-red-600 text-white hover:bg-red-700 transition"
                                                    onClick={() => showConfirmDelete(t.id, t)}
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        </td>
                                    </motion.tr>
                                ))}
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



{/* ✅ CLOSE TRADE MODAL — FINAL, FIXED VERSION */}
{showCloseModal && (
  <Modal
    isOpen={showCloseModal}
    onClose={() => setShowCloseModal(false)}
    title="Close Trade"
  >
    <form className="space-y-5">
      {/* Exit Date */}
      <div className="flex flex-col">
        <label
          htmlFor="modalExitDate"
          className="text-sm font-medium text-gray-400 mb-1"
        >
          Exit Date
        </label>
        <input
          type="date"
          id="modalExitDate"
          value={modalExitDate}
          onChange={(e) => setModalExitDate(e.target.value)}
          className={styles.input}
        />
      </div>

      {/* Exit Price + SL/TP Shortcuts */}
      <div className="flex flex-col">
        <label
          htmlFor="modalExitPrice"
          className="text-sm font-medium text-gray-400 mb-1"
        >
          Exit Price
        </label>

        <div className="flex items-center space-x-2">
          <input
            type="number"
            id="modalExitPrice"
            value={modalExitPrice}
            onChange={(e) => {
              const val = e.target.value;
              setModalExitPrice(val);

              const trade = activeTrades.find((t) => t.id === closeModalTradeId);
              if (trade && val) {
                const expectedPnL = computeExpectedCurrencyForClose(trade, val);
                setModalActualPnL(expectedPnL.toFixed(2));
              }
            }}
            className={`${styles.input} flex-1`}
            step="0.00001"
          />

          {/* SL Button */}
          <button
            type="button"
            onClick={() => {
              const trade = activeTrades.find((t) => t.id === closeModalTradeId);
              if (trade) {
                const slValue = trade.sl ?? trade.stopLoss;
                if (slValue) {
                  setModalExitPrice(slValue);
                  const expectedPnL = computeExpectedCurrencyForClose(trade, slValue);
                  setModalActualPnL(expectedPnL.toFixed(2));
                  toast("SL Applied", { type: "info" });
                } else {
                  toast("No Stop Loss value found for this trade", { type: "warning" });
                }
              }
            }}
            className="px-3 py-1 rounded-md bg-red-600 text-white text-sm hover:bg-red-700 transition"
          >
            SL
          </button>

          {/* TP Button */}
          <button
            type="button"
            onClick={() => {
              const trade = activeTrades.find((t) => t.id === closeModalTradeId);
              if (trade) {
                const tpValue = trade.tp ?? trade.takeProfit;
                if (tpValue) {
                  setModalExitPrice(tpValue);
                  const expectedPnL = computeExpectedCurrencyForClose(trade, tpValue);
                  setModalActualPnL(expectedPnL.toFixed(2));
                  toast("TP Applied", { type: "info" });
                } else {
                  toast("No Take Profit value found for this trade", { type: "warning" });
                }
              }
            }}
            className="px-3 py-1 rounded-md bg-green-600 text-white text-sm hover:bg-green-700 transition"
          >
            TP
          </button>
        </div>

        {/* 💰 Live PnL Preview + TP/SL Hit Indicator */}
        {modalActualPnL && (
          <div className="mt-3 text-sm font-semibold">
            <p
              className={`${
                Number(modalActualPnL) > 0
                  ? "text-green-400"
                  : Number(modalActualPnL) < 0
                  ? "text-red-400"
                  : "text-gray-400"
              }`}
            >
              Estimated P&L:{" "}
              {Number(modalActualPnL) > 0 ? "+" : ""}
              {Number(modalActualPnL).toFixed(2)}$
              {capital
                ? ` (${((modalActualPnL / capital) * 100).toFixed(2)}%)`
                : ""}
            </p>

            {/* TP/SL hit label */}
            {(() => {
              const trade = activeTrades.find((t) => t.id === closeModalTradeId);
              if (!trade || !modalExitPrice) return null;

              const exit = Number(modalExitPrice);
              const entry = Number(trade.entryPrice);
              const sl = Number(trade.sl ?? trade.stopLoss);
              const tp = Number(trade.tp ?? trade.takeProfit);
              const type = trade.type?.toLowerCase();

              const hitTP = type === "long" ? exit >= tp : exit <= tp;
              const hitSL = type === "long" ? exit <= sl : exit >= sl;

              if (tp && hitTP)
                return <span className="text-green-400 text-xs">TP Hit 🟢</span>;
              if (sl && hitSL)
                return <span className="text-red-400 text-xs">SL Hit 🔴</span>;
              return null;
            })()}
          </div>
        )}
      </div>

      {/* Actual PnL */}
      <div className="flex flex-col">
        <label
          htmlFor="modalActualPnL"
          className="text-sm font-medium text-gray-400 mb-1"
        >
          Actual P&L ($)
        </label>
        <input
          type="number"
          id="modalActualPnL"
          value={modalActualPnL}
          onChange={(e) => setModalActualPnL(e.target.value)}
          className={styles.input}
          step="0.01"
        />
      </div>

      {/* After Image */}
      <div className="flex flex-col">
        <label
          htmlFor="afterImage"
          className="text-sm font-medium text-gray-400 mb-1"
        >
          After Image URL
        </label>
        <input
          type="url"
          id="afterImage"
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

      {/* Trade Status */}
      <div className="flex flex-col">
        <label
          htmlFor="tradeStatus"
          className="text-sm font-medium text-gray-400 mb-1"
        >
          Status
        </label>
        <select
          id="tradeStatus"
          value={tradeStatus}
          onChange={(e) => setTradeStatus(e.target.value)}
          className={styles.input}
        >
          <option value="Valid">Valid</option>
          <option value="Invalid">Invalid</option>
        </select>
      </div>

      {/* Save Button */}
      <button
        type="button"
        onClick={() =>
          handleSaveClose({
            state: "Closed",
            status: tradeStatus,
            exitDate: modalExitDate,
            exitPrice: modalExitPrice,
            actualPnL: modalActualPnL,
            note: closeNote,
            afterImage: modalAfterImage,
          })
        }
        className={styles.submitButton}
      >
        Save and Close Trade
      </button>
    </form>
  </Modal>
)}


{/* ✅ Edit Trade Modal */}
{isEditModalOpen && tradeToEdit && (
  <>
    {tradeToEdit.section === "active" ? (
      // 🔹 Active trade edit uses AddTrade form (entry correction)
      <TradeEditModalActive
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        trade={tradeToEdit}
        onSave={handleActiveEditedTrade}
      />
    ) : (
      // 🔹 Closed trade edit uses full Close+Entry form
      <TradeEditModalClosed
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        trade={tradeToEdit}
        onSave={handleClosedEditedTrade}
      />
    )}
  </>
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
