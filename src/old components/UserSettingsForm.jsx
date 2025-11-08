// src/components/UserSettingsForm.jsx
import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import {
  DollarSign,
  Zap,
  ArrowDownCircle,
  ArrowUpCircle,
  Calendar,
  Target,
} from "lucide-react";

function UserSettingsForm({
  account,
  userId,
  onAccountCreated,
  onAccountUpdated,
  onClose = () => {},
}) {
  // ✅ Determine editing mode only if account has an ID
  const isEditing = !!account?.id;

  // --- States ---
  const [accountName, setAccountName] = useState("");
  const [accountPlan, setAccountPlan] = useState("Normal");
  const [accountType, setAccountType] = useState("Standard");
  const [startingCapital, setStartingCapital] = useState("");
  const [drawdown, setDrawdown] = useState("");
  const [depositEnabled, setDepositEnabled] = useState(true);
  const [withdrawEnabled, setWithdrawEnabled] = useState(false);
  const [targetEquity, setTargetEquity] = useState("");
  const [durationWeeks, setDurationWeeks] = useState("");
  const [weeklyTargetEnabled, setWeeklyTargetEnabled] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // --- Prefill or reset form based on mode ---
  useEffect(() => {
    if (isEditing && account) {
      // ✅ Prefill existing values
      setAccountName(account.account_name || "");
      setAccountPlan(account.account_plan || "Normal");
      setAccountType(account.account_type || "Standard");
      setStartingCapital(account.capital?.toString() || "");
      setDrawdown(account.drawdown?.toString() || "");
      setDepositEnabled(account.deposit_enabled ?? true);
      setWithdrawEnabled(account.withdrawal_enabled ?? false);
      setTargetEquity(account.target?.toString() || "");
      setDurationWeeks(account.duration?.toString() || "");
      setWeeklyTargetEnabled(account.weekly_target ?? false);
    } else {
      // ✅ Reset defaults for new account
      setAccountName("");
      setAccountPlan("Normal");
      setAccountType("Standard");
      setStartingCapital("");
      setDrawdown("");
      setDepositEnabled(true);
      setWithdrawEnabled(false);
      setTargetEquity("");
      setDurationWeeks("");
      setWeeklyTargetEnabled(false);
    }
  }, [account, isEditing]);

  // --- Handle Form Submit ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    setLoading(true);

    try {
      // ✅ Resolve User ID
      let finalUserId = userId;
      if (!finalUserId) {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw new Error("Failed to fetch session");
        finalUserId = sessionData?.session?.user?.id;
      }

      if (!finalUserId) throw new Error("User ID missing. Please re-login.");
      if (accountName.trim().length < 3)
        throw new Error("Account name must be at least 3 characters long.");

      const capitalValue = Number(startingCapital);
      if (isNaN(capitalValue) || capitalValue <= 0)
        throw new Error("Starting capital must be a valid positive number.");

      // --- Prepare Account Data ---
      const accountData = {
        user_id: finalUserId,
        account_name: accountName.trim(),
        account_plan: accountPlan,
        account_type: accountType,
        capital: capitalValue,
        drawdown: drawdown ? Number(drawdown) : null,
        deposit_enabled: !!depositEnabled,
        withdrawal_enabled: !!withdrawEnabled,
        target:
          accountPlan === "Target" && targetEquity
            ? Number(targetEquity)
            : null,
        duration:
          accountPlan === "Target" && durationWeeks
            ? Number(durationWeeks)
            : null,
        weekly_target: accountPlan === "Target" ? weeklyTargetEnabled : false,
        updated_at: new Date().toISOString(),
      };

      if (!isEditing) {
        accountData.created_at = new Date().toISOString();
      }

      // --- Supabase Save ---
      let data, error;
      if (isEditing) {
        ({ data, error } = await supabase
          .from("account")
          .update(accountData)
          .eq("id", account.id)
          .select()
          .single());
      } else {
        ({ data, error } = await supabase
          .from("account")
          .insert([accountData])
          .select()
          .single());
      }

      if (error) throw new Error(error.message);
      if (!data) throw new Error("No data returned from Supabase.");

// ✅ Notify Parent + Sync Account Type Upstream
if (isEditing) {
  onAccountUpdated?.(data);
} else {
  onAccountCreated?.(data);
}

// 🔥 Ensure parent receives account type immediately
if (data?.account_type && typeof window?.setAccountType === "function") {
  window.setAccountType(data.account_type);
}

onClose?.();

    } catch (err) {
      console.error("❌ Account save error:", err.message);
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  // --- Render ---
  return (
    <div className="text-white">
      <h2 className="text-2xl font-bold text-center text-purple-400 mb-6">
        {isEditing ? "Edit Account Settings" : "Create New Account"}
      </h2>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Account Name */}
        <div>
          <label className="block text-sm text-gray-300 mb-1">
            Account Name
          </label>
          <input
            type="text"
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
            placeholder="My Trading Account"
            className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 focus:ring-purple-500 focus:border-purple-500 outline-none"
          />
        </div>

        {/* Account Plan */}
        <div>
          <label className="block text-sm text-gray-300 mb-1 flex items-center gap-1">
            <Zap size={14} /> Account Plan
          </label>
          <select
            value={accountPlan}
            onChange={(e) => setAccountPlan(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 focus:ring-purple-500 focus:border-purple-500 outline-none"
          >
            <option value="Normal">Normal</option>
            <option value="Target">Target / Prop Firm Challenge</option>
          </select>
        </div>

        {/* Account Type */}
        <div>
          <label className="block text-sm text-gray-300 mb-1">
            Account Type
          </label>
          <select
            value={accountType}
            onChange={(e) => setAccountType(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 focus:ring-purple-500 focus:border-purple-500 outline-none"
          >
            <option value="Standard">Standard</option>
            <option value="Mini">Mini</option>
            <option value="Micro">Micro</option>
          </select>
        </div>

        {/* Starting Capital */}
        <div>
          <label className="block text-sm text-gray-300 mb-1 flex items-center gap-1">
            <DollarSign size={14} /> Starting Capital
          </label>
          <input
            type="number"
            step="0.01"
            value={startingCapital}
            onChange={(e) => setStartingCapital(e.target.value)}
            placeholder="1000"
            className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 focus:ring-purple-500 focus:border-purple-500 outline-none"
          />
        </div>

        {/* Drawdown */}
        <div>
          <label className="block text-sm text-gray-300 mb-1 flex items-center gap-1">
            <ArrowDownCircle size={14} /> Account Drawdown
          </label>
          <input
            type="text"
            value={drawdown}
            onChange={(e) => setDrawdown(e.target.value)}
            placeholder="e.g. 5% or 500"
            className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 focus:ring-purple-500 focus:border-purple-500 outline-none"
          />
        </div>

        {/* Deposit / Withdraw Toggles */}
        <div className="flex gap-6 border-t border-gray-700 pt-3">
          <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={depositEnabled}
              onChange={(e) => setDepositEnabled(e.target.checked)}
              className="h-4 w-4 text-green-600 border-gray-700 bg-gray-800 rounded focus:ring-green-500"
            />
            <ArrowUpCircle size={14} className="text-green-500" /> Enable Deposit
          </label>

          <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={withdrawEnabled}
              onChange={(e) => setWithdrawEnabled(e.target.checked)}
              className="h-4 w-4 text-red-600 border-gray-700 bg-gray-800 rounded focus:ring-red-500"
            />
            <ArrowDownCircle size={14} className="text-red-500" /> Enable Withdraw
          </label>
        </div>

        {/* Target Plan Options */}
        {accountPlan === "Target" && (
          <div className="p-4 bg-gray-900 border border-purple-500/50 rounded-xl space-y-4">
            <h4 className="text-md font-semibold text-purple-400 flex items-center gap-2">
              <Target size={16} /> Target Plan Details
            </h4>

            <div>
              <label className="block text-sm text-gray-300 mb-1">
                Targeting Equity ($)
              </label>
              <input
                type="number"
                step="0.01"
                value={targetEquity}
                onChange={(e) => setTargetEquity(e.target.value)}
                placeholder="5000"
                className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 focus:ring-purple-500 focus:border-purple-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-300 mb-1 flex items-center gap-1">
                <Calendar size={14} /> Duration (weeks)
              </label>
              <input
                type="number"
                value={durationWeeks}
                onChange={(e) => setDurationWeeks(e.target.value)}
                placeholder="4"
                className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 focus:ring-purple-500 focus:border-purple-500 outline-none"
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={weeklyTargetEnabled}
                onChange={(e) => setWeeklyTargetEnabled(e.target.checked)}
                className="h-4 w-4 text-purple-600 border-gray-700 bg-gray-800 rounded focus:ring-purple-500"
              />
              Enable System Weekly Target
            </label>
          </div>
        )}

        {/* Error Message */}
        {errorMsg && <p className="text-center text-red-400 text-sm">{errorMsg}</p>}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 rounded-lg bg-purple-600 hover:bg-purple-700 font-semibold text-white disabled:opacity-50"
        >
          {loading
            ? isEditing
              ? "Saving..."
              : "Creating..."
            : isEditing
            ? "Save Account Settings"
            : "Create Account"}
        </button>
      </form>
    </div>
  );
}

export default UserSettingsForm;
