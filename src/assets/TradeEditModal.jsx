// src/components/TradeEditModal.jsx
import React, { useState, useEffect } from "react";
import { getSessionForTime, getSessionColors } from "../utils/sessionUtils";

const TradeEditModal = ({ trade, onClose, onSave, isOpen = true }) => {
  console.log("🟢 TradeEditModal mounted/rendered", { trade, isOpen });

  // Initialize defaults to avoid uncontrolled → controlled warnings
  const [formData, setFormData] = useState({
    id: "",
    pair: "",
    type: "long",
    entryDate: "",
    tradeTime: "",
    entryPrice: "",
    sl: "",
    tp: "",
    risk: "2.0",
    strategy: "",
    beforeimage: "",
    exitDate: "",
    exitPrice: "",
    pnlCurrency: "",
    afterimage: "",
    note: "",
    status: "active",
    session: "",
  });

// Inside src/components/TradeEditModal.jsx

useEffect(() => {
  if (isOpen && trade) {
    console.log("🟡 Prefilling form with trade:", trade);

    // Helper to safely format data for input fields: converts null/undefined/0 to ""
    const formatValue = (value) => {
      // Use standard check for null/undefined/0.
      if (value === null || value === undefined || value === 0) {
        return "";
      }
      return String(value);
    };

    // Helper to extract YYYY-MM-DD from an ISO string (handles null/undefined)
    const formatDateForInput = (isoString) =>
      isoString ? isoString.split("T")[0] : "";

    // 1. Format Dates
    const formattedEntryDate = formatDateForInput(trade.entryDate);
    const formattedExitDate = formatDateForInput(trade.exitDate);

    // 2. Format Time (Crucial Fix for tradeTime)
    const formattedTime = trade.tradeTime
      ? trade.tradeTime.substring(0, 5) // Use only HH:MM for time input
      : "";

    // 3. Update all fields in the form data
    setFormData({
      id: trade.id ?? "",
      pair: trade.pair ?? "",
      
      // ✅ FIX 1: Use direct mapping for 'type' (Block 1)
      type: trade.type ?? "long", 
      
      // Date and Time Fields
      entryDate: formattedEntryDate,
      tradeTime: formattedTime,

      // Price and Risk Fields
      entryPrice: formatValue(trade.entryPrice),
      
      // ✅ FIX 2: Use fallback logic for SL/TP (Block 2) AND safe formatting (Block 1)
      sl: formatValue(trade.sl ?? trade.stopLoss), 
      tp: formatValue(trade.tp ?? trade.takeProfit), 
      
      risk: formatValue(trade.risk) || "2.0", 

      // Other Fields
      strategy: trade.strategy ?? "",
      session: trade.session ?? "",
      beforeimage: trade.beforeimage ?? "",
      exitDate: formattedExitDate,
      exitPrice: formatValue(trade.exitPrice),
      pnlCurrency: formatValue(trade.pnlCurrency),
      afterimage: trade.afterimage ?? "",
      note: trade.note ?? "",
      status: trade.status ?? "active",
    });
  }
}, [isOpen, trade]);

  if (!isOpen || !trade) {
    console.log("🔴 Modal not open or trade missing → returning null");
    return null;
  }

  // ✅ Handle form change
  const handleChange = (e) => {
    const { name, value } = e.target;
    console.log("✏️ handleChange:", name, value);

    setFormData((prev) => {
      const updated = { ...prev, [name]: value };
      if (name === "tradeTime") {
        updated.session = getSessionForTime(value);
        console.log("🕒 Updated session based on tradeTime:", updated.session);
      }
      return updated;
    });
  };

  // ✅ Save handler
const handleSubmit = async (e) => {
  e.preventDefault();
  console.log("💾 handleSubmit triggered — formData:", formData);

  try {
    if (!onSave) {
      console.warn("⚠️ onSave prop is missing!");
      return;
    }

    // Normalize data before saving
    const updatedTrade = {
      ...formData,
      updated_at: new Date().toISOString(),
    };

    console.log("✅ Calling onSave with:", updatedTrade);
    await onSave(updatedTrade); // wait for parent update (to Supabase)

    if (onClose) {
      console.log("✅ Closing modal after successful save...");
      onClose();
    }
  } catch (error) {
    console.error("❌ Error in handleSubmit:", error);
  }
};


  // ✅ Cancel handler
  const handleCancel = (e) => {
    e?.preventDefault?.();
    console.log("🚫 handleCancel clicked");
    if (onClose) {
      console.log("✅ onClose triggered from cancel button");
      onClose();
    } else {
      console.warn("⚠️ onClose prop is missing!");
    }
  };

  // Dropdown options
  const pairs = ["EUR/USD", "GBP/USD", "USD/JPY", "XAU/USD", "USD/CAD", "AUD/USD", "USD/CHF"];
  const riskOptions = Array.from({ length: 11 }, (_, i) => (2 + i * 0.1).toFixed(1));
  const strategyOptions = [
    "1/5min BOT, 5MCC",
    "1/5min BOT, 15MCC",
    "5/15min BOT, 15MCC",
    "5/15min BOT, H1MCC",
    "1/5min BOS, 5MCC",
  ];

  // ✅ Render overlapping session tags
  const renderSessionTags = () => {
    if (!formData.session) {
      return <span className="text-xs text-gray-400">Session: Unknown</span>;
    }

    const sessions = formData.session.split("&").map((s) => s.trim());
    return (
      <div className="flex flex-wrap gap-2 mt-2">
        {sessions.map((s) => (
          <span
            key={s}
            className={`inline-block px-2 py-1 text-xs font-semibold rounded-full ${getSessionColors(
              s
            )}`}
          >
            {s} Session
          </span>
        ))}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-gray-900 p-6 rounded-2xl shadow-2xl w-full max-w-3xl relative border border-gray-700">
        {/* Close “×” */}
        <button
          onClick={handleCancel}
          className="absolute top-4 right-4 text-gray-400 hover:text-white text-2xl leading-none"
        >
          ×
        </button>

        <h2 className="text-xl font-semibold text-white mb-4">
          Edit Trade — {formData.pair || "Untitled"}
        </h2>

        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4 text-sm text-white">
          {/* Pair */}
          <div>
            <label className="block mb-1">Pair</label>
            <select
              name="pair"
              value={formData.pair}
              onChange={handleChange}
              className="w-full p-2 rounded bg-gray-800 border border-gray-700"
            >
              {pairs.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </div>

          {/* Type */}
          <div>
            <label className="block mb-1">Type</label>
            <select
              name="type"
              value={formData.type}
              onChange={handleChange}
              className="w-full p-2 rounded bg-gray-800 border border-gray-700"
            >
              <option value="long">Long (Buy)</option>
              <option value="short">Short (Sell)</option>
            </select>
          </div>

          {/* Entry Date */}
          <div>
            <label className="block mb-1">Entry Date</label>
            <input
              type="date"
              name="entryDate"
              value={formData.entryDate}
              onChange={handleChange}
              className="w-full p-2 rounded bg-gray-800 border border-gray-700"
            />
          </div>

          {/* Trade Time */}
          <div>
            <label className="block mb-1">Trade Time</label>
            <input
              type="time"
              name="tradeTime"
              value={formData.tradeTime}
              onChange={handleChange}
              className="w-full p-2 rounded bg-gray-800 border border-gray-700"
            />
            {renderSessionTags()}
          </div>

          {/* Entry Price */}
          <div>
            <label className="block mb-1">Entry Price</label>
            <input
              type="number"
              name="entryPrice"
              value={formData.entryPrice}
              onChange={handleChange}
              className="w-full p-2 rounded bg-gray-800 border border-gray-700"
            />
          </div>

          {/* Stop Loss */}
          <div>
            <label className="block mb-1">Stop Loss</label>
            <input
              type="number"
              name="sl"
              value={formData.sl}
              onChange={handleChange}
              className="w-full p-2 rounded bg-gray-800 border border-gray-700"
            />
          </div>

          {/* Take Profit */}
          <div>
            <label className="block mb-1">Take Profit</label>
            <input
              type="number"
              name="tp"
              value={formData.tp}
              onChange={handleChange}
              className="w-full p-2 rounded bg-gray-800 border border-gray-700"
            />
          </div>

          {/* Risk */}
          <div>
            <label className="block mb-1">Risk</label>
            <select
              name="risk"
              value={formData.risk}
              onChange={handleChange}
              className="w-full p-2 rounded bg-gray-800 border border-gray-700"
            >
              {riskOptions.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </div>

          {/* Strategy */}
          <div>
            <label className="block mb-1">Strategy</label>
            <select
              name="strategy"
              value={formData.strategy}
              onChange={handleChange}
              className="w-full p-2 rounded bg-gray-800 border border-gray-700"
            >
              <option value="">Select Strategy</option>
              {strategyOptions.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Before Image */}
          <div>
            <label className="block mb-1">Before Image URL</label>
            <input
              type="text"
              name="beforeimage"
              value={formData.beforeimage}
              onChange={handleChange}
              className="w-full p-2 rounded bg-gray-800 border border-gray-700"
            />
          </div>

          {/* Exit Date */}
          <div>
            <label className="block mb-1">Exit Date</label>
            <input
              type="date"
              name="exitDate"
              value={formData.exitDate}
              onChange={handleChange}
              className="w-full p-2 rounded bg-gray-800 border border-gray-700"
            />
          </div>

          {/* Exit Price */}
          <div>
            <label className="block mb-1">Exit Price</label>
            <input
              type="number"
              name="exitPrice"
              value={formData.exitPrice}
              onChange={handleChange}
              className="w-full p-2 rounded bg-gray-800 border border-gray-700"
            />
          </div>

          {/* Actual PnL */}
          <div>
            <label className="block mb-1">Actual PnL</label>
            <input
              type="number"
              name="pnlCurrency"
              value={formData.pnlCurrency}
              onChange={handleChange}
              className="w-full p-2 rounded bg-gray-800 border border-gray-700"
            />
          </div>

          {/* After Image */}
          <div>
            <label className="block mb-1">After Image URL</label>
            <input
              type="text"
              name="afterimage"
              value={formData.afterimage}
              onChange={handleChange}
              className="w-full p-2 rounded bg-gray-800 border border-gray-700"
            />
          </div>

          {/* Note */}
          <div className="col-span-2">
            <label className="block mb-1">Note</label>
            <textarea
              name="note"
              value={formData.note}
              onChange={handleChange}
              className="w-full p-2 rounded bg-gray-800 border border-gray-700"
            />
          </div>

          {/* Status */}
          <div>
            <label className="block mb-1">Status</label>
            <select
              name="status"
              value={formData.status}
              onChange={handleChange}
              className="w-full p-2 rounded bg-gray-800 border border-gray-700"
            >
              <option value="active">Active</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          {/* Buttons */}
          <div className="col-span-2 flex justify-end mt-4 gap-3">
            <button
              type="button"
              onClick={handleCancel}
              className="bg-gray-700 px-4 py-2 rounded hover:bg-gray-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-purple-600 px-4 py-2 rounded hover:bg-purple-500"
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TradeEditModal;
