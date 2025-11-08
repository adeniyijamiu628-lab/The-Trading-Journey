import React, { useState, useMemo } from "react";

export default function LotSizeCalculator({ capital, accountType, getAdjustedVP }) {
  // ----------------------------
  // Available forex pairs list
  // ----------------------------
  const availablePairs = [
    "EUR/USD", "GBP/USD", "USD/JPY", "USD/CAD",
    "AUD/USD", "NZD/USD", "EUR/GBP", "EUR/JPY",
    "GBP/JPY", "USD/CHF", "XAU/USD", "XAG/USD",
    "US30", "NAS100"
  ];

  const [calcMode, setCalcMode] = useState("ForAccount");
  const [calcPair, setCalcPair] = useState("");
  const [calcPoints, setCalcPoints] = useState("");
  const [calcRiskPercent, setCalcRiskPercent] = useState(2);
  const [showExternalModal, setShowExternalModal] = useState(false);
  const [externalCapital, setExternalCapital] = useState("");
  const [externalAccountType, setExternalAccountType] = useState("Standard");

  // Determine which values to use based on mode
  const effectiveCapital =
    calcMode === "ForAccount" ? capital : Number(externalCapital) || 0;
  const effectiveAccountType =
    calcMode === "ForAccount" ? accountType : externalAccountType;

  // 💰 Risk amount
  const calcRiskAmount = useMemo(() => {
    return ((calcRiskPercent / 100) * effectiveCapital).toFixed(2);
  }, [calcRiskPercent, effectiveCapital]);

  // ⚙️ Pip value (live)
  const pipValue = useMemo(() => {
    if (!calcPair) return 0;
    return getAdjustedVP(calcPair, effectiveAccountType) || 0;
  }, [calcPair, effectiveAccountType, getAdjustedVP]);

  // 🧮 Lot size calculation
  const calcLotSize = useMemo(() => {
    if (!calcPair || calcPoints <= 0 || !effectiveCapital) return 0;
    const vp = pipValue;
    if (!vp) return 0;
    const lot =
      ((calcRiskPercent / 100) * effectiveCapital) / (vp * calcPoints);
    return Number(lot.toFixed(2)); // ✅ Format like 0.11, 0.03, 1.25
  }, [calcPair, calcPoints, calcRiskPercent, effectiveCapital, pipValue]);

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-2xl p-4 space-y-4 mt-6">
      <h3 className="text-lg font-semibold text-white mb-2">
        Lot Size Calculator
      </h3>

      {/* 🔘 Mode Switch */}
      <div className="flex gap-2 mb-2">
        <button
          className={`px-3 py-2 rounded-md ${
            calcMode === "ForAccount"
              ? "bg-blue-600 text-white"
              : "bg-gray-700 text-gray-300"
          }`}
          onClick={() => setCalcMode("ForAccount")}
        >
          For Account
        </button>
        <button
          className={`px-3 py-2 rounded-md ${
            calcMode === "ForExternal"
              ? "bg-blue-600 text-white"
              : "bg-gray-700 text-gray-300"
          }`}
          onClick={() => {
            setCalcMode("ForExternal");
            setShowExternalModal(true);
          }}
        >
          For External
        </button>
      </div>

      {/* 🧮 Inputs */}
      <div className="space-y-3">
        {/* Pair Dropdown */}
        <div>
          <label className="block text-sm text-gray-400">Pair</label>
          <select
            value={calcPair}
            onChange={(e) => setCalcPair(e.target.value)}
            className="w-full px-3 py-2 rounded-md bg-gray-700 text-white outline-none"
          >
            <option value="">Select Pair</option>
            {availablePairs.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          {/* ⚡ Live Pip Value */}
          {calcPair && (
            <p className="text-xs text-gray-400 mt-1">
              Pip Value:{" "}
              <span className="text-green-400 font-semibold">
                ${pipValue.toFixed(2)}
              </span>{" "}
              per pip
            </p>
          )}
        </div>

        {/* Points */}
        <div>
          <label className="block text-sm text-gray-400">
            Points (SL Distance)
          </label>
          <input
            type="number"
            value={calcPoints}
            onChange={(e) => setCalcPoints(Number(e.target.value))}
            placeholder="Enter stop-loss distance in pips"
            className="w-full px-3 py-2 rounded-md bg-gray-700 text-white outline-none"
          />
        </div>

        {/* Risk % */}
        <div>
          <label className="block text-sm text-gray-400">Risk (%)</label>
          <input
            type="number"
            value={calcRiskPercent}
            onChange={(e) => setCalcRiskPercent(Number(e.target.value))}
            placeholder="e.g. 2"
            className="w-full px-3 py-2 rounded-md bg-gray-700 text-white outline-none"
          />
        </div>
      </div>

      {/* 📊 Output */}
      <div className="mt-4 space-y-2 text-gray-200">
        <p>
          <strong>Capital Used:</strong> ${effectiveCapital.toLocaleString()}
        </p>
        <p>
          <strong>Account Type:</strong> {effectiveAccountType}
        </p>
        <p>
          <strong>Risk Amount:</strong> ${calcRiskAmount}
        </p>
        <p>
          <strong>Lot Size:</strong>{" "}
          <span className="text-green-400 font-semibold">
            {calcLotSize || 0}
          </span>
        </p>
      </div>

      {/* ⚙️ External Settings Modal */}
      {showExternalModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-semibold text-white mb-4">
              External Calculation Settings
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400">Capital</label>
                <input
                  type="number"
                  value={externalCapital}
                  onChange={(e) => setExternalCapital(e.target.value)}
                  placeholder="Enter capital..."
                  className="w-full px-3 py-2 rounded-md bg-gray-700 text-white outline-none"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400">
                  Account Type
                </label>
                <select
                  value={externalAccountType}
                  onChange={(e) => setExternalAccountType(e.target.value)}
                  className="w-full px-3 py-2 rounded-md bg-gray-700 text-white outline-none"
                >
                  <option value="Standard">Standard</option>
                  <option value="Mini">Mini</option>
                  <option value="Micro">Micro</option>
                </select>
              </div>

              <button
                onClick={() => setShowExternalModal(false)}
                className="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700"
              >
                Save & Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
