// src/pages/Dashboardpage.jsx (MERGED)
import React, { useState, useMemo, useEffect } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import { supabase } from "./supabaseClient";
import {
  DollarSign,
  Zap,
  ArrowDownCircle,
  ArrowUpCircle,
  Calendar,
  Target,
} from "lucide-react";
// Assuming UserSettingsForm exists at this path (it will be defined below)
[cite_start]// import UserSettingsForm from "../components/UserSettingsForm"; [cite: 164]

// ====================================================================
// --- UserSettingsForm (from src/components/UserSettingsForm.jsx) ---
// ====================================================================

function UserSettingsForm({
  account,
  userId,
  onAccountCreated,
  onAccountUpdated,
  onClose = () => {},
}) {
  const isEditing = !!account;
  [cite_start]// --- States --- [cite: 269]
  const [accountName, setAccountName] = useState("");
  const [accountPlan, setAccountPlan] = useState("Normal");
  const [accountType, setAccountType] = useState("Standard");
  const [startingCapital, setStartingCapital] = useState("");
  const [drawdown, setDrawdown] = useState("");
  const [depositEnabled, setDepositEnabled] = useState(true);
  const [withdrawEnabled, setWithdrawEnabled] = useState(false);
  [cite_start]// Target Plan fields [cite: 271]
  const [targetEquity, setTargetEquity] = useState("");
  const [durationWeeks, setDurationWeeks] = useState("");
  const [weeklyTargetEnabled, setWeeklyTargetEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  [cite_start]// --- Initialize when editing --- [cite: 273]
  useEffect(() => {
    if (account) {
      setAccountName(account.account_name || "");
      setAccountPlan(account.account_plan || "Normal");
      setAccountType(account.account_type || "Standard");
      setStartingCapital(account.capital?.toString() || "");
      setDrawdown(account.drawdown?.toString() || "");
      setDepositEnabled(account.deposit_enabled ?? true);
      setWithdrawEnabled(account.withdrawal_enabled ?? false);
      setTargetEquity(account.target?.toString() || "");
      setDurationWeeks(account.duration?.toString() || "");
      setWeeklyTargetEnabled(account.weekly_target || false);
    } 
    else {
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
  }, [account]);
  [cite_start]// --- Submit Handler --- [cite: 275]
  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    setLoading(true);
    try {
      // ✅ Ensure we have user session
      let finalUserId = userId;
      if (!finalUserId) {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();
        if (sessionError) throw new Error("Failed to fetch session");
        finalUserId = session?.user?.id;
      }

      if (!finalUserId) throw new Error("User ID missing. Please re-login.");
      if (accountName.trim().length < 3)
        throw new Error("Account name must be at least 3 characters long.");
      const capitalValue = Number(startingCapital);
      if (isNaN(capitalValue) || capitalValue <= 0)
        throw new Error("Starting capital must be a valid positive number.");
      [cite_start]// --- Build Data Object --- [cite: 282]
      const accountData = {
        user_id: finalUserId,
        account_name: accountName.trim(),
        account_plan: accountPlan,
        account_type: accountType,
        capital: capitalValue,
        drawdown: drawdown ?
          Number(drawdown) : null,
        deposit_enabled: !!depositEnabled,
        withdrawal_enabled: !!withdrawEnabled,
        target:
          accountPlan === "Target" && targetEquity
            ?
          Number(targetEquity)
            : null,
        duration:
          accountPlan === "Target" && durationWeeks
            ?
          Number(durationWeeks)
            : null,
        weekly_target: accountPlan === "Target" ?
          weeklyTargetEnabled : false,
        created_at: isEditing ?
          account.created_at : new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      console.log("🟣 Account Data Sent:", accountData);

      // --- Save to Supabase ---
      let response;
      if (isEditing) {
        response = await supabase
          .from("accounts")
          .update(accountData)
          .eq("id", account.id)
          .select()
          .single();
      } else {
        response = await supabase
          .from("accounts")
          .insert([accountData])
          .select()
          .single();
      }

      const { data, error } = response;
      if (error) {
        console.error("Supabase error:", error);
        throw new Error(error.message);
      }

      if (!data) throw new Error("No data returned from Supabase.");
      [cite_start]// --- Add to Equity History for new accounts --- [cite: 294]
      if (!isEditing) {
        const { error: eqError } = await supabase
          .from("equity_history")
          .insert([
            {
              account_id: data.id,
              timestamp: new Date().toISOString(),
              equity: data.capital,
              description: "Initial Capital",
            },
          ]);
        if (eqError) console.warn("Equity history insert failed:", eqError);
        onAccountCreated?.(data);
      } else {
        onAccountUpdated?.(data);
      }

      onClose?.();
    } catch (err) {
      console.error("❌ Account creation error:", err.message);
      setErrorMsg(err.message);
    }

    setLoading(false);
  };

  return (
    <div className="text-white">
      <h2 className="text-2xl font-bold text-center text-purple-400 mb-6">
        {isEditing ? "Edit Account" : "Create New Account"}
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
            className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 focus:ring-purple-500 focus:border-purple-500 
outline-none"
          >
            <option value="Standard">Standard</option>
            <option value="Mini">Mini</option>
            <option value="Micro">Micro</option>
          </select>
        </div>

        {/* Starting Capital */}
        <div>
          <label className="block text-sm text-gray-300 
mb-1 flex items-center gap-1">
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
            placeholder="e.g.
 5% or 500"
            className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 focus:ring-purple-500 focus:border-purple-500 outline-none"
          />
        </div>

        {/* Deposit/Withdraw Toggles */}
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
                className="w-full px-3 
py-2 rounded-lg bg-gray-800 border border-gray-700 focus:ring-purple-500 focus:border-purple-500 outline-none"
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
                className="w-full px-3 py-2 rounded-lg 
bg-gray-800 border border-gray-700 focus:ring-purple-500 focus:border-purple-500 outline-none"
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
        {errorMsg && (
          <p className="text-center text-red-400 text-sm">{errorMsg}</p>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 rounded-lg bg-purple-600 hover:bg-purple-700 font-semibold text-white disabled:opacity-50"
        >
          {loading
            ?
            isEditing
              ?
              "Saving..."
              : "Creating..."
            : isEditing
            ?
            "Save Changes"
            : "Create Account"}
        </button>
      </form>
    </div>
  );
}

// ====================================================================
// --- AccountManager (from src/components/AccountManager.jsx) ---
// ====================================================================

function AccountManager({ 
  accounts: accountsProp,
  currentAccountId: activeAccountIdProp,
  onSelectAccount,
  onCreateAccount,
}) {
  const [modalAccount, setModalAccount] = useState(undefined);
  const [userId, setUserId] = useState(null);

  // ✅ Fetch authenticated user ID once on mount
useEffect(() => {
  const loadUserSession = async () => {
    // Restore session first
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      console.error("Session error:", sessionError.message);
      return;
    }

    if (sessionData?.session?.user) {
      setUserId(sessionData.session.user.id);
      return;
    }

    // Fallback: getUser() directly
    
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) {
      console.error("User error:", userError.message);
    } else if (userData?.user?.id) {
      setUserId(userData.user.id);
    }
  };

  loadUserSession();
}, []);
  const activeAccount = accountsProp.find((a) => a.id === activeAccountIdProp);

  const handleAccountCreated = (newAccount) => {
    setModalAccount(undefined);
    onCreateAccount?.(newAccount);
  };
  const handleAccountUpdated = (updatedAccount) => {
    setModalAccount(undefined);
    if (activeAccountIdProp === updatedAccount.id) {
      onSelectAccount?.(updatedAccount.id);
    }
  };
  if (accountsProp.length === 0 && !activeAccountIdProp) {
    return (
      <div className="text-white text-center p-4 space-y-4 bg-gray-700 rounded-xl">
        <h2 className="text-lg font-semibold">No Accounts Found</h2>
        <p className="text-sm text-gray-400">
          Create your first trading account to begin journaling.
        </p>
        <button
          onClick={() => setModalAccount(null)}
          
          className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-white font-medium transition-colors"
        >
          + Create New Account
        </button>

        {modalAccount !== undefined && (
          <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
            <div className="bg-gray-900 p-6 rounded-xl w-full max-w-lg relative">
              <button
 
                onClick={() => setModalAccount(undefined)}
                className="absolute top-2 right-2 text-gray-400 hover:text-white text-xl"
              >
                ✕
              </button>
              <UserSettingsForm
    
                account={modalAccount}
                userId={userId} // ✅ Use authenticated user ID here
                isEditingAccount={modalAccount !== null}
                onAccountCreated={handleAccountCreated}
                onAccountUpdated={handleAccountUpdated}
               
                onClose={() => setModalAccount(undefined)}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 text-white space-y-3">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Trading Accounts</h2>
      </div>

      <div className="flex items-center space-x-2">
        {accountsProp.length > 0 && (
          <select
            value={activeAccountIdProp || ""}
            onChange={(e) => onSelectAccount?.(e.target.value)}
    
            className="flex-1 bg-gray-700 p-2.5 rounded-lg border border-gray-600 focus:ring-purple-500 focus:border-purple-500 transition-colors cursor-pointer"
          >
            {accountsProp.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.account_name} ({acc.account_type})
              </option>
            
))}
          </select>
        )}

        <button
          onClick={() => setModalAccount(null)}
          className="shrink-0 px-3 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-sm font-medium transition-colors"
          title="Create New Account"
        >
          +
        </button>
      
</div>

      {activeAccount && (
        <div className="mt-4 p-3 bg-gray-800 rounded-lg border border-gray-700 text-sm">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-base text-purple-400">
              {activeAccount.account_name}
            </h3>
            <button
           
                onClick={() => setModalAccount(activeAccount)}
              className="text-gray-400 hover:text-purple-400 transition-colors"
              title="Edit Account Details"
            >
              ✎ Edit
            </button>
          </div>
          <p className="text-gray-300 mt-1">
  
            Capital:{" "}
            <span className="font-semibold">
              ${(activeAccount.capital ||
0).toFixed(2)}
            </span>
          </p>
          <p className="text-gray-400 text-xs">
            Plan: {activeAccount.account_plan} |
Type: {activeAccount.account_type}
          </p>
        </div>
      )}

      {modalAccount !== undefined && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-gray-900 p-6 rounded-xl w-full max-w-lg relative">
            <button
              onClick={() => setModalAccount(undefined)}
     
              className="absolute top-2 right-2 text-gray-400 hover:text-white text-xl"
            >
              ✕
            </button>

            <UserSettingsForm
              account={modalAccount}
              userId={userId} // ✅ Always pass valid user ID
 
              onAccountCreated={handleAccountCreated}
              onAccountUpdated={handleAccountUpdated}
              onClose={() => setModalAccount(undefined)}
            />
          </div>
        </div>
      )}
    </div>
 
  );
}

// ====================================================================
// --- DashboardPage (Original src/pages/Dashboardpage.jsx) ---
// ====================================================================

[cite_start]// --- Reusable KPI Card --- [cite: 165]
const Card = ({ title, value, valueClass = "" }) => (
  <div className="p-6 bg-gray-800 rounded-2xl shadow-xl transition-all duration-300 hover:shadow-purple-500/30 text-white border border-gray-700">
    <div className="text-sm font-medium text-gray-400">{title}</div>
    <div className={`text-3xl font-extrabold mt-2 ${valueClass}`}>{value}</div>
  </div>
);
[cite_start]// --- Chart Card --- [cite: 166]
const ChartCard = ({ title, children }) => (
  <div className="bg-gray-800 p-6 rounded-2xl shadow-xl border border-gray-700">
    <h3 className="text-lg text-white font-semibold mb-3">{title}</h3>
    {children}
  </div>
);
export default function Dashboard({
  dashboardStats = {},
  capital = 0,
  equityChartData = [],
  pairFrequencyData = [],
  pairProfitabilityData = [],
  sessionFrequencyData = [],
  sessionProfitabilityData = [],
  dayFrequencyData = [],
  dayProfitabilityData = [],
  transactions = [],
  initialAccounts = [], // Renamed to initialAccounts to avoid state/prop name conflict
}) {
  const [activeTab, setActiveTab] = useState("overview");
  const [isModalOpen, setIsModalOpen] = useState(false);
  [cite_start]// Use a state for accounts so new ones can be added [cite: 168]
  const [accounts, setAccounts] = useState(initialAccounts);
[cite_start]// --- Account Creation Logic (from Dashboard.jsx) --- [cite: 169]
  const handleCreateAccount = () => {
    setIsModalOpen(true);
  };
  const handleCloseModal = () => {
    setIsModalOpen(false);
  };
  const handleFormSubmit = (data) => {
    console.log("New Account Created:", data);
[cite_start]// Assuming the form data has the required fields (name, type, capital, etc.) [cite: 172]
    const newAccount = {
      name: data.accountName,
      type: data.accountType,
      capital: parseFloat(data.initialCapital) ||
[cite_start]0, // Assuming UserSettingsForm collects this [cite: 173]
      equity: parseFloat(data.initialCapital) ||
[cite_start]0, // Initial equity is capital [cite: 174]
      trades: [],
    };
    setAccounts((prev) => [...prev, newAccount]);
    setIsModalOpen(false);
  };
  // ----------------------------------------------------

  // Tabs on the sidebar inside Dashboard
  const tabs = [
    { id: "accounts", label: "Accounts" },
    { id: "overview", label: "Account Overview" },
    { id: "pairStats", label: "Pair Statistics" },
    { id: "sessionStats", label: "Session Statistics" },
    { id: "transactions", label: "Transaction" },
  ];
[cite_start]// Derived metrics [cite: 176]
  const totalTrades = dashboardStats.totalTrades ?? 0;
  const totalPnLCurrency = dashboardStats.totalPnLCurrency ?? 0;
  const totalPnLPercent = dashboardStats.totalPnLPercent ?? 0;
  const currentEquity = capital + totalPnLCurrency;
[cite_start]// Approx weekly data (1 point per 5 entries if daily) [cite: 178]
  const weeklyEquityData = useMemo(() => {
    if (!equityChartData || equityChartData.length === 0) return [];
    return equityChartData
      .filter((_, i) => (i + 1) % 5 === 0)
      .map((p) => ({ date: p.date, equity: p.equity }));
  }, [equityChartData]);
  return (
    <div className="space-y-8">
      {/* ==== Inner Tab Navigation ==== */}
      <div className="border-b border-gray-700 mb-4 flex flex-wrap gap-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`pb-2 text-sm font-medium transition-colors duration-200 ${
       
               activeTab === tab.id
                ? "text-purple-400 border-b-2 border-purple-500"
                : "text-gray-400 hover:text-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
  
      </div>

      {/* ==== ACCOUNT OVERVIEW TAB ==== */}
      {activeTab === "overview" && (
        <div className="space-y-8">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card title="Total Trades" value={totalTrades} />
            <Card
         
              title="Total PnL ($)"
              value={`$${totalPnLCurrency.toFixed(2)}`}
              valueClass={
                totalPnLCurrency >= 0 ?
"text-green-400" : "text-red-400"
              }
            />
            <Card
              title="Total PnL (%)"
              value={`${totalPnLPercent.toFixed(2)}%`}
              valueClass={
                
                totalPnLPercent >= 0 ? "text-green-400" : "text-red-400"
              }
            />
            <Card
              title="Current Equity"
              value={`$${currentEquity.toFixed(2)}`}
              valueClass="text-purple-400"
            />
 
            <Card
              title="Capital"
              value={`$${capital.toFixed(2)}`}
              valueClass="text-yellow-400"
            />
          </div>

          {/* Weekly Equity Growth */}
          <ChartCard 
            title="Weekly Equity Growth">
            {weeklyEquityData.length > 0 ?
(
              <div className="w-full h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={weeklyEquityData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#4b5563" />
                    <XAxis
   
                      dataKey="date"
                      stroke="#9ca3af"
                      tickFormatter={(val) =>
                        new Date(val).toLocaleDateString("en-US", {
          
                          month: "short",
                          day: "numeric",
                        })
                      }
          
                    />
                    <YAxis
                      stroke="#9ca3af"
                      tickFormatter={(v) => `$${v.toFixed(0)}`}
                    />
    
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#1f2937",
                        border: "none",
            
                      }}
                      formatter={(value) => [`$${value.toFixed(2)}`, "Equity"]}
                      labelFormatter={(val) =>
                        new Date(val).toLocaleDateString("en-US", {
                
                          month: "short",
                          day: "numeric",
                        })
                      }
                
                    />
                    <Line
                      type="monotone"
                      dataKey="equity"
                      stroke="#8b5cf6"
          
                      strokeWidth={3}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
            
              </div>
            ) : (
              <p className="text-gray-400">No weekly equity data yet.</p>
            )}
          </ChartCard>
        </div>
      )}

      {/* ==== PAIR STATISTICS TAB ==== */}
      {activeTab === "pairStats" && (
       
        <div className="space-y-8">
          <ChartCard title="Traded Pairs Frequency">
            <div className="w-full h-96">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={pairFrequencyData} layout="vertical" margin={{ left: 40, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#4b5563" />
         
                  <XAxis type="number" stroke="#9ca3af" />
                  <YAxis dataKey="pair" type="category" stroke="#9ca3af" width={80} />
                  <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "none" }} formatter={(v) => [v, "Trades"]} />
                  <Bar dataKey="count" fill="#60a5fa" />
               
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard title="Profitability by Pair">
            <div className="w-full h-96">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={pairProfitabilityData}>
   
                  <CartesianGrid strokeDasharray="3 3" stroke="#4b5563" />
                  <XAxis dataKey="pair" stroke="#9ca3af" angle={-45} textAnchor="end" height={60} />
                  <YAxis stroke="#9ca3af" tickFormatter={(v) => `$${v.toFixed(0)}`} />
                  <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "none" }} formatter={(v) => [`$${v.toFixed(2)}`, "PnL"]} />
     
                  <Bar dataKey="pnl">
                    {pairProfitabilityData.map((entry, i) => (
                      <Cell key={i} fill={entry.pnl >= 0 ?
"#4ade80" : "#ef4444"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
       
        </div>
      )}

      {/* ==== SESSION STATISTICS TAB ==== */}
      {activeTab === "sessionStats" && (
        <div className="space-y-8">
          <div className="grid lg:grid-cols-2 gap-6">
            <ChartCard title="Session Frequency">
              {sessionFrequencyData.length > 0 ? (
                <div 
                  className="w-full h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={sessionFrequencyData} layout="vertical" margin={{ left: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#4b5563" />
                      <XAxis type="number" stroke="#9ca3af" />
  
                      <YAxis dataKey="session" type="category" stroke="#9ca3af" width={90} />
                      <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "none" }} formatter={(v) => [v, "Trades"]} />
                      <Bar dataKey="count" fill="#3b82f6" />
                 
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-gray-400">No session frequency data yet.</p>
              )}
            
            </ChartCard>

            <ChartCard title="Session Profitability">
              {sessionProfitabilityData.length > 0 ?
(
                <div className="w-full h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={sessionProfitabilityData} margin={{ bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#4b5563" />
           
                      <XAxis dataKey="session" stroke="#9ca3af" tick={{ fontSize: 12 }} />
                      <YAxis stroke="#9ca3af" tickFormatter={(v) => `$${v.toFixed(0)}`} />
                      <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "none" }} formatter={(v) => [`$${v.toFixed(2)}`, "PnL"]} />
                      
                      <Bar dataKey="pnl">
                        {sessionProfitabilityData.map((entry, i) => (
                          <Cell key={i} fill={entry.pnl >= 0 ? "#4ade80" : "#ef4444"} />
                        ))}
             
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-gray-400">No session profitability data 
yet.</p>
              )}
            </ChartCard>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <ChartCard title="Day-of-week Frequency (Mon-Fri)">
              {dayFrequencyData.length > 0 ?
(
                <div className="w-full h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dayFrequencyData} margin={{ bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#4b5563" />
           
                      <XAxis dataKey="day" stroke="#9ca3af" />
                      <YAxis stroke="#9ca3af" />
                      <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "none" }} formatter={(v) => [v, "Trades"]} />
                      <Bar dataKey="count" fill="#f59e0b" />
    
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-gray-400">No day-of-week frequency data yet.</p>
             
              )}
            </ChartCard>

            <ChartCard title="Day-of-week Profitability (Mon-Fri)">
              {dayProfitabilityData.length > 0 ?
(
                <div className="w-full h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dayProfitabilityData} margin={{ bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#4b5563" />
           
                      <XAxis dataKey="day" stroke="#9ca3af" />
                      <YAxis stroke="#9ca3af" tickFormatter={(v) => `$${v.toFixed(0)}`} />
                      <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "none" }} formatter={(v) => [`$${v.toFixed(2)}`, "PnL"]} />
                      <Bar dataKey="pnl">
   
                        {dayProfitabilityData.map((entry, i) => (
                          <Cell key={i} fill={entry.pnl >= 0 ? "#4ade80" : "#ef4444"} />
                        ))}
                 
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-gray-400">No day-of-week profitability data yet.</p>
    
              )}
            </ChartCard>
          </div>
        </div>
      )}

      {/* ==== ACCOUNTS TAB (UPDATED) ==== */}
      {activeTab === "accounts" && (
        <div className="space-y-6">
          <h2 className="text-xl font-bold text-white mb-4">My Trading Accounts</h2>

       
          {/* Accounts List */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {accounts && accounts.length > 0 ?
(
              accounts.map((acc, index) => (
                <div
                  key={index}
                  className="bg-gray-800 p-5 rounded-xl border border-gray-700 shadow-lg hover:shadow-purple-500/20 transition-all"
                >
        
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="text-lg font-semibold text-purple-400">
                      {acc.name || `Account ${index + 1}`}
                    </h3>
                
                    {/* Note: The old component used acc.accountType, here we use acc.type */}
                    <span className="text-sm text-gray-400">{acc.type}</span>
                  </div>
                  <div className="text-gray-300 text-sm space-y-1">
                    <p>Capital: <span className="text-yellow-400">${acc.capital?.toFixed(2)}</span></p>
  
                    <p>Current Equity: <span className="text-green-400">${acc.equity?.toFixed(2)}</span></p>
                    <p>Total Trades: <span className="text-gray-200">{acc.trades?.length ||
0}</span></p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-400">No accounts yet. Add one below 👇</p>
            )}
     
          </div>

          {/* Add Account Button (UPDATED to open modal) */}
          <div className="flex justify-center">
            <button
              onClick={handleCreateAccount}
              className="bg-purple-600 hover:bg-purple-700 px-6 py-3 rounded-xl font-semibold text-white transition-all shadow-md shadow-purple-500/20"
            >
    
              + Add New Account
            </button>
          </div>
        </div>
      )}
        
      {/* ==== TRANSACTIONS TAB ==== */}
      {activeTab === "transactions" && (
        <div className="space-y-6">
          <h3 className="text-xl font-semibold 
text-white">Transaction History</h3>

          <div className="overflow-x-auto">
            <table className="min-w-full border border-gray-700 rounded-lg">
              <thead>
                <tr className="bg-gray-700 text-gray-300">
                  <th className="px-4 py-2 text-left">Date</th>
                  <th 
                    className="px-4 py-2 text-left">Type</th>
                  <th className="px-4 py-2 text-left">Description</th>
                  <th className="px-4 py-2 text-right">Amount ($)</th>
                </tr>
              </thead>
              <tbody>
           
                {transactions && transactions.length > 0 ?
(
                  transactions.map((tx) => (
                    <tr key={tx.id} className="border-t border-gray-700 text-gray-300 hover:bg-gray-800">
                      <td className="px-4 py-2">
                        {new Date(tx.date).toLocaleDateString("en-US", {
     
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        
})}
                      </td>
                      <td className="px-4 py-2">{tx.type}</td>
                      <td className="px-4 py-2">{tx.description}</td>
                      <td
        
                        className={`px-4 py-2 text-right font-semibold ${
                          tx.amount >= 0 ? "text-green-400" : "text-red-400"
                        }`}
                      >
  
                        {tx.amount.toFixed(2)}
                      </td>
                    </tr>
                  ))
                ) : 
                (
                  <tr>
                    <td colSpan={4} className="text-center text-gray-500 py-4">
                      No transactions yet.
</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==== Custom Modal (from Dashboard.jsx, styled with minimal inline 
CSS for effect) ==== */}
      {isModalOpen && (
        <div 
          className="fixed inset-0 z-[999] flex items-center justify-center bg-black bg-opacity-70 backdrop-blur-sm"
          onClick={handleCloseModal} // Close modal on overlay click
        >
          <div 
            className="bg-gray-900 p-6 rounded-xl w-[90%] max-w-xl border border-purple-500/50 shadow-2xl"
       
            onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside the modal content
          >
            <div className="flex justify-between items-center mb-4 border-b border-gray-700 pb-2">
              <h3 className="text-xl font-bold text-white">Create New Account</h3>
              <button 
                className="text-gray-400 hover:text-white transition-colors text-2xl"
  
                onClick={handleCloseModal}
              >
                &times;
</button>
            </div>

            {/* UserSettingsForm is the component that handles the actual input */}
            <UserSettingsForm onSubmit={handleFormSubmit} onCancel={handleCloseModal} />
          </div>
        </div>
      )}
    </div>
  );
}

// export default Dashboard; // The original export is kept in the merged file