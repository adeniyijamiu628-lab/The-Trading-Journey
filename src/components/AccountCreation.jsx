// src/components/AccountCreation.jsx
import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import toast from "react-hot-toast";
import {
  Zap,
  DollarSign,
  ArrowDownCircle,
  ArrowUpCircle,
  Calendar,
  Target,
} from "lucide-react";

function AccountCreation({
  account = null, // pass existing account for edit mode
  userId: userIdProp = null,
  onAccountCreated,
  onAccountUpdated,
  onClose = () => {},
}) {
  const isEditing = !!account?.id;

  // Form state
  const [userId, setUserId] = useState(userIdProp);
  const [accountName, setAccountName] = useState("");
  const [accountPlan, setAccountPlan] = useState("Normal"); // Normal | Challenge
  const [accountType, setAccountType] = useState("Standard"); // Standard | Mini | Micro
  const [currency, setCurrency] = useState("USD"); // USD | USC | GBP | EUR | Other
  const [customCurrency, setCustomCurrency] = useState("");
  const [depositEnabled, setDepositEnabled] = useState(true);
  const [withdrawEnabled, setWithdrawEnabled] = useState(true);
  const [targetPercent, setTargetPercent] = useState(""); // only for Challenge
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Show existing capital on edit (read-only)
  const [existingCapital, setExistingCapital] = useState(0);

  // Resolve session user id if not provided
  useEffect(() => {
    const resolveUser = async () => {
      if (userIdProp) {
        setUserId(userIdProp);
        return;
      }
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const uid = sessionData?.session?.user?.id;
        if (uid) setUserId(uid);
      } catch (err) {
        console.warn("Could not fetch session:", err?.message || err);
      }
    };
    resolveUser();
  }, [userIdProp]);

  // Prefill on edit, or reset for create
  useEffect(() => {
    if (isEditing && account) {
      setAccountName(account.account_name || "");
      setAccountPlan(account.account_plan || "Normal");
      setAccountType(account.account_type || "Standard");
      setCurrency(account.currency || "USD");
      setCustomCurrency(account.currency && !["USD", "USC", "GBP", "EUR"].includes(account.currency) ? account.currency : "");
      setDepositEnabled(account.deposit_enabled ?? true);
      setWithdrawEnabled(account.withdrawal_enabled ?? true);
      setTargetPercent(account.target != null ? String(account.target) : "");
      setExistingCapital(account.capital ?? 0);
    } else {
      // Defaults for new account
      setAccountName("");
      setAccountPlan("Normal");
      setAccountType("Standard");
      setCurrency("USD");
      setCustomCurrency("");
      setDepositEnabled(true);
      setWithdrawEnabled(true);
      setTargetPercent("");
      setExistingCapital(0);
    }
  }, [isEditing, account]);

  // Keep deposit/withdraw toggles in sync with plan selection
  useEffect(() => {
    if (accountPlan === "Normal") {
      setDepositEnabled(true);
      setWithdrawEnabled(true);
    } else if (accountPlan === "Challenge" || accountPlan === "Target") {
      // Challenge/Target: only deposit enabled
      setDepositEnabled(true);
      setWithdrawEnabled(false);
    }
  }, [accountPlan]);

  // Validate & collect payload for DB
  const buildAccountPayload = () => {
    const finalCurrency = currency === "Other" ? customCurrency?.trim() || null : currency;
    const payload = {
      account_name: accountName.trim(),
      account_plan: accountPlan === "Target" ? "Target" : (accountPlan === "Challenge" ? "Target" : accountPlan), // Accept "Target" if using that term
      account_type: accountType,
      currency: finalCurrency,
      deposit_enabled: !!depositEnabled,
      withdrawal_enabled: !!withdrawEnabled,
      updated_at: new Date().toISOString(),
    };

    // starting capital on creation must be 0 (handled below)
    if (!isEditing) {
      payload.capital = 0;
      payload.profit = 0;
      payload.equity = 0;
      payload.user_id = userId;
      payload.created_at = new Date().toISOString();
    }

    // challenge/target fields
    if (accountPlan === "Challenge" || accountPlan === "Target") {
      payload.target = targetPercent ? Number(targetPercent) : null;
    } else {
      payload.target = null;
    }

    return payload;
  };

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    setErrorMsg("");
    setLoading(true);

    try {
      // --- ensure user id ---
      let finalUserId = userId;
      if (!finalUserId) {
        const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
        if (sessionErr) throw new Error("Failed to fetch session. Please login again.");
        finalUserId = sessionData?.session?.user?.id;
      }
      if (!finalUserId) throw new Error("User ID missing. Please login again.");

      // --- basic validation ---
      if (!accountName || accountName.trim().length < 3) {
        throw new Error("Account name must be at least 3 characters long.");
      }

      // Starting capital must be zero at creation (no capital input)
      if (!isEditing) {
        // explicit requirement: starting capital = 0
        // we set capital = 0 in payload, but also validate that
      }

      // For Challenge plan, require target percentage
      if ((accountPlan === "Challenge" || accountPlan === "Target") && (!targetPercent && targetPercent !== 0)) {
        throw new Error("Please enter a target percentage for Challenge accounts.");
      }
      if ((accountPlan === "Challenge" || accountPlan === "Target") && isNaN(Number(targetPercent))) {
        throw new Error("Target must be a valid number (percentage).");
      }
      if ((accountPlan === "Challenge" || accountPlan === "Target") && Number(targetPercent) <= 0) {
        throw new Error("Target percentage must be greater than zero.");
      }

      // --- Prepare payload ---
      const payload = buildAccountPayload();

      // --- Upsert to Supabase (real calls) ---
      let result;
      if (isEditing) {
        // Update existing account
        const { data, error } = await supabase
          .from("account")
          .update(payload)
          .eq("id", account.id)
          .select()
          .single();

        if (error) throw new Error(error.message || "Failed to update account.");
        result = data;

        // Notify parent
        onAccountUpdated?.(result);
        toast.success("Account updated");
      } else {
        // Create new account
        // ensure user_id included
        payload.user_id = finalUserId;
        payload.capital = 0;
        payload.profit = 0;
        payload.equity = 0;

        const { data, error } = await supabase
          .from("account")
          .insert([payload])
          .select()
          .single();

        if (error) throw new Error(error.message || "Failed to create account.");
        result = data;

        // Notify parent
        onAccountCreated?.(result);
        toast.success("Account created");
      }

      // ensure parent UI that relies on account_type can be updated immediately
      if (result?.account_type && typeof window?.setAccountType === "function") {
        window.setAccountType(result.account_type);
      }

      onClose?.();
    } catch (err) {
      console.error("AccountCreation error:", err);
      setErrorMsg(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="text-white max-w-xl w-full">
      <h2 className="text-2xl font-bold text-center text-purple-400 mb-6">
        {isEditing ? "Edit Account" : "Create New Account"}
      </h2>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Account Name */}
        <div>
          <label className="block text-sm text-gray-300 mb-1">Account Name</label>
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
            <option value="Challenge">Challenge / Prop Firm</option>
          </select>
        </div>

        {/* Account Type */}
        <div>
          <label className="block text-sm text-gray-300 mb-1">Account Type</label>
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

        {/* Currency (Normal plan only) */}
        {accountPlan === "Normal" && (
          <div>
            <label className="block text-sm text-gray-300 mb-1">Account Currency</label>
            <div className="flex gap-2">
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 focus:ring-purple-500 focus:border-purple-500 outline-none"
              >
                <option value="USD">USD</option>
                <option value="USC">USC (Cent)</option>
                <option value="GBP">GBP</option>
                <option value="EUR">EUR</option>
                <option value="Other">Other</option>
              </select>
            </div>

            {currency === "Other" && (
              <div className="mt-2">
                <input
                  type="text"
                  value={customCurrency}
                  onChange={(e) => setCustomCurrency(e.target.value)}
                  placeholder="Type currency code (e.g. NGN)"
                  className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 focus:ring-purple-500 focus:border-purple-500 outline-none"
                />
              </div>
            )}
          </div>
        )}

        {/* Challenge Plan Fields */}
        {(accountPlan === "Challenge" || accountPlan === "Target") && (
          <div className="p-4 bg-gray-900 border border-purple-700/40 rounded-xl space-y-4">
            <h4 className="text-md font-semibold text-purple-400 flex items-center gap-2">
              <Target size={16} /> Challenge Plan
            </h4>

            <div>
              <label className="block text-sm text-gray-300 mb-1">Account Target (%)</label>
              <input
                type="number"
                step="0.01"
                value={targetPercent}
                onChange={(e) => setTargetPercent(e.target.value)}
                placeholder="e.g. 10 (means 10%)"
                className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 focus:ring-purple-500 focus:border-purple-500 outline-none"
              />
            </div>
          </div>
        )}

        {/* Show existing capital on edit (read-only) */}
        {isEditing && (
          <div>
            <label className="block text-sm text-gray-300 mb-1">Current Capital</label>
            <div className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200">
              <DollarSign size={14} className="inline mr-2" />
              ${Number(existingCapital || 0).toFixed(2)}
            </div>
          </div>
        )}

        {/* Deposits/Withdraw toggles are implicit per spec (auto-set) */}
        <div className="text-sm text-gray-400">
          <p>
            <strong>Deposit:</strong> {depositEnabled ? "Enabled" : "Disabled"}{" "}
            | <strong>Withdrawal:</strong> {withdrawEnabled ? "Enabled" : "Disabled"}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Note: Starting capital is <strong>$0</strong> for new accounts. Use the Account Manager's
            Deposit button to add funds.
          </p>
        </div>

        {/* Error */}
        {errorMsg && <p className="text-center text-red-400 text-sm">{errorMsg}</p>}

        {/* Submit */}
        <button
          type="submit"
          onClick={handleSubmit}
          disabled={loading}
          className="w-full py-3 rounded-lg bg-purple-600 hover:bg-purple-700 font-semibold text-white disabled:opacity-50"
        >
          {loading ? (isEditing ? "Saving..." : "Creating...") : isEditing ? "Save Changes" : "Create Account"}
        </button>
      </form>
    </div>
  );
}

export default AccountCreation;
