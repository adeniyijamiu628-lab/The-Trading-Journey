// src/components/UserSettingsForm.jsx
import { useState } from "react";
import { supabase } from "./supabaseClient"; // adjust path to your client

function UserSettingsForm({ userId, onAccountCreated }) {
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

  const handleSubmit = async (e) => {
    e.preventDefault();

    const newAccount = {
      user_id: userId,
      account_name: accountName,
      account_type: accountType,
      account_plan: accountPlan,
      capital: startingCapital ? Number(startingCapital) : 0,
      drawdown: drawdown ? Number(drawdown) : null,
      deposit_enabled: depositEnabled,
      withdrawal_enabled: withdrawalEnabled,
    };

    if (accountPlan === "Target") {
      newAccount.target = target ? Number(target) : null;
      newAccount.duration = duration ? Number(duration) : null;
      newAccount.weekly_target = weeklyTarget;
    }

    const { data, error } = await supabase
      .from("accounts")
      .insert([newAccount])
      .select()
      .single();

    if (error) {
      console.error("Failed to create account:", error);
    } else {
      console.log("Account created:", data);
      onAccountCreated?.(data); // notify parent App that a new account is ready
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white">
      <div className="bg-gray-800 p-6 rounded-2xl shadow-lg w-full max-w-lg">
        <h2 className="text-2xl font-bold mb-6 text-center">Create New Account</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
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
            Create Account
          </button>
        </form>
      </div>
    </div>
  );
}

export default UserSettingsForm;
