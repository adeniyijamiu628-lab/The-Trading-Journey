// src/components/UserSettingsForm.jsx
import { useState, useEffect } from "react";

function UserSettingsForm({ onSave, userId }) {
  // State
  const [accountPlan, setAccountPlan] = useState("Normal");   // Normal | Target
  const [accountType, setAccountType] = useState("Standard"); // Standard | Mini | Micro
  const [accountName, setAccountName] = useState("");
  const [startingCapital, setStartingCapital] = useState("");
  const [target, setTarget] = useState("");
  const [drawdown, setDrawdown] = useState("");
  const [duration, setDuration] = useState("1");
  const [weeklyTarget, setWeeklyTarget] = useState(false);
  const [depositEnabled, setDepositEnabled] = useState(false);
  const [withdrawalEnabled, setWithdrawalEnabled] = useState(false);

  // Helper: per-user storage key
  const userSettingsKey = (uid = userId || "local-guest") =>
    `userSettings:${uid}`;

  // ✅ Preload saved settings when component mounts / userId changes
  useEffect(() => {
    try {
      const raw = localStorage.getItem(userSettingsKey());
      if (!raw) return;
      const saved = JSON.parse(raw);

      if (saved.accountPlan) setAccountPlan(saved.accountPlan);
      if (saved.accountType) setAccountType(saved.accountType);
      if (saved.accountName) setAccountName(saved.accountName);
      if (saved.startingCapital !== undefined)
        setStartingCapital(saved.startingCapital);
      if (saved.drawdown !== undefined) setDrawdown(saved.drawdown);
      if (saved.target !== undefined) setTarget(saved.target);
      if (saved.duration !== undefined) setDuration(saved.duration);
      if (saved.weeklyTarget !== undefined) setWeeklyTarget(saved.weeklyTarget);
      if (saved.depositEnabled !== undefined)
        setDepositEnabled(saved.depositEnabled);
      if (saved.withdrawalEnabled !== undefined)
        setWithdrawalEnabled(saved.withdrawalEnabled);
    } catch (err) {
      console.error("Failed to preload user settings:", err);
    }
  }, [userId]);

  // Save handler
  const handleSubmit = (e) => {
    e.preventDefault();

    const settings = {
      accountPlan,
      accountType,
      accountName,
      startingCapital: startingCapital ? Number(startingCapital) : null,
      drawdown: drawdown ? Number(drawdown) : null,
      depositEnabled,
      withdrawalEnabled,
    };

    if (accountPlan === "Target") {
      settings.target = target ? Number(target) : null;
      settings.duration = duration ? Number(duration) : null;
      settings.weeklyTarget = weeklyTarget;
    }

    // ✅ Persist per-user
    try {
      localStorage.setItem(userSettingsKey(), JSON.stringify(settings));
    } catch (err) {
      console.error("Failed to save user settings:", err);
    }

    // Pass up to parent (App)
    onSave(settings);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white">
      <div className="bg-gray-800 p-6 rounded-2xl shadow-lg w-full max-w-lg">
        <h2 className="text-2xl font-bold mb-6 text-center">User Settings</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Account Plan */}
          <div>
            <label className="block text-sm mb-1">Account Plan</label>
            <select
              value={accountPlan}
              onChange={(e) => setAccountPlan(e.target.value)}
              className="w-full p-2 rounded bg-gray-700 text-white"
            >
              <option value="Normal">Normal</option>
              <option value="Target">Target</option>
            </select>
          </div>

          {/* Account Type */}
          <div>
            <label className="block text-sm mb-1">Account Type</label>
            <select
              value={accountType}
              onChange={(e) => setAccountType(e.target.value)}
              className="w-full p-2 rounded bg-gray-700 text-white"
            >
              <option value="Standard">Standard</option>
              <option value="Mini">Mini</option>
              <option value="Micro">Micro</option>
            </select>
          </div>

          {/* Account Name */}
          <div>
            <label className="block text-sm mb-1">Account Name</label>
            <input
              type="text"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              className="w-full p-2 rounded bg-gray-700 text-white"
              required
            />
          </div>

          {/* Starting Capital */}
          <div>
            <label className="block text-sm mb-1">Starting Capital</label>
            <input
              type="number"
              value={startingCapital}
              onChange={(e) => setStartingCapital(e.target.value)}
              className="w-full p-2 rounded bg-gray-700 text-white"
              required
            />
          </div>

          {/* Target-only fields */}
          {accountPlan === "Target" && (
            <>
              <div>
                <label className="block text-sm mb-1">Target</label>
                <input
                  type="number"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  className="w-full p-2 rounded bg-gray-700 text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-sm mb-1">Duration (weeks)</label>
                <select
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  className="w-full p-2 rounded bg-gray-700 text-white"
                >
                  {Array.from({ length: 52 }, (_, i) => i + 1).map((w) => (
                    <option key={w} value={w}>
                      {w} week{w > 1 ? "s" : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={weeklyTarget}
                  onChange={(e) => setWeeklyTarget(e.target.checked)}
                  className="h-4 w-4"
                />
                <label>System Weekly Target</label>
              </div>
            </>
          )}

          {/* Drawdown */}
          <div>
            <label className="block text-sm mb-1">Account Drawdown</label>
            <input
              type="number"
              value={drawdown}
              onChange={(e) => setDrawdown(e.target.value)}
              className="w-full p-2 rounded bg-gray-700 text-white"
              required
            />
          </div>

          {/* Deposit toggle */}
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={depositEnabled}
              onChange={(e) => setDepositEnabled(e.target.checked)}
              className="h-4 w-4"
            />
            <label>Enable Deposits</label>
          </div>

          {/* Withdrawal toggle */}
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={withdrawalEnabled}
              onChange={(e) => setWithdrawalEnabled(e.target.checked)}
              className="h-4 w-4"
            />
            <label>Enable Withdrawals</label>
          </div>

          {/* Submit */}
          <button
            type="submit"
            className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 rounded"
          >
            Save Settings
          </button>
        </form>
      </div>
    </div>
  );
}

export default UserSettingsForm;
