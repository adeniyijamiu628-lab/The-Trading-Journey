// src/components/AccountManager.jsx
import { useState, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import toast from "react-hot-toast";
import { supabase } from "./supabaseClient";
import AccountCreation from "./AccountCreation";

function AccountManager({
  accounts: accountsProp = [],
  currentAccountId: activeAccountIdProp,
  onSelectAccount,
  onCreateAccount,
}) {
  // UI / modal state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalAccount, setEditModalAccount] = useState(null);
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(null);
  const [confirmationStep, setConfirmationStep] = useState(0);

  // auth + data
  const [userId, setUserId] = useState(null);
  const [accounts, setAccounts] = useState(accountsProp || []);
  const [loadingAccounts, setLoadingAccounts] = useState(false);

  // transactions for currently active account
  const [transactions, setTransactions] = useState([]);
  const [txLoading, setTxLoading] = useState(false);

  // deposit/withdraw modal
  const [transactionModal, setTransactionModal] = useState(null); // "deposit" | "withdraw" | null
  const [txForm, setTxForm] = useState({ date: "", amount: "", description: "" });
  const [processingTx, setProcessingTx] = useState(false);

  // Keep local accounts in sync with parent-provided accountsProp when that changes
  useEffect(() => {
    if (accountsProp && accountsProp.length) setAccounts(accountsProp);
  }, [accountsProp]);

  // Load current user session
  useEffect(() => {
    const loadUser = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const uid = data?.session?.user?.id;
        if (uid) setUserId(uid);
      } catch (err) {
        console.warn("Could not resolve user session:", err);
      }
    };
    loadUser();
  }, []);

  // Active account reference
  const activeAccount = accounts.find((a) => a.id === activeAccountIdProp) || null;

  // Fetch fresh accounts for the user (used after create/update/delete)
  const fetchAccounts = async () => {
    if (!userId) return;
    setLoadingAccounts(true);
    try {
      const { data, error } = await supabase
        .from("account")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setAccounts(data || []);
      // inform parent if they provided handler
      if (onCreateAccount && typeof onCreateAccount === "function") {
        // option: parent expects the full list or just new account; we call not to conflict
      }
    } catch (err) {
      console.error("fetchAccounts error:", err);
      toast.error("Failed to load accounts");
    } finally {
      setLoadingAccounts(false);
    }
  };

  // Fetch accounts on userId available
  useEffect(() => {
    if (userId) fetchAccounts();
  }, [userId]);

  // Fetch transactions for the active account
  const fetchTransactions = async (accountId) => {
    if (!accountId) {
      setTransactions([]);
      return;
    }
    setTxLoading(true);
    try {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("account_id", accountId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setTransactions(data || []);
    } catch (err) {
      console.error("fetchTransactions error:", err);
      toast.error("Failed to load transactions");
    } finally {
      setTxLoading(false);
    }
  };

  // refetch transactions whenever activeAccountIdProp changes
  useEffect(() => {
    if (activeAccountIdProp) fetchTransactions(activeAccountIdProp);
    else setTransactions([]);
  }, [activeAccountIdProp]);

  // -------------------- Account creation / update handlers --------------------
  const handleAccountCreated = async (newAccount) => {
    // newAccount should be the object returned from AccountCreation (which is already inserted)
    // We refresh accounts from Supabase to ensure canonical state
    setCreateModalOpen(false);
    await fetchAccounts();
    toast.success("Account created");
    onCreateAccount?.(newAccount);
    // select the newly created account (if parent supports onSelectAccount with id)
    if (newAccount?.id) onSelectAccount?.(newAccount.id);
  };

  const handleAccountUpdated = async (updatedAccount) => {
    setEditModalAccount(null);
    await fetchAccounts();
    toast.success("Account updated");
    // re-select if necessary
    if (activeAccountIdProp === updatedAccount.id) {
      onSelectAccount?.(updatedAccount.id);
    }
  };

  // -------------------- Export account data (account + transactions) --------------------
  const exportAccountData = async (account) => {
    try {
      // fetch transactions for the account from DB (fresh)
      const { data: txData, error: txError } = await supabase
        .from("transactions")
        .select("*")
        .eq("account_id", account.id)
        .order("created_at", { ascending: false });

      if (txError) throw txError;

      const payload = {
        account,
        transactions: txData || [],
        exported_at: new Date().toISOString(),
      };

      const exportedData = JSON.stringify(payload, null, 2);
      const blob = new Blob([exportedData], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${account.account_name || "account"}_export.json`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success("Exported account data");
      return true;
    } catch (err) {
      console.error("exportAccountData error:", err);
      toast.error("Failed to export account data");
      return false;
    }
  };

  // -------------------- Delete account (multi-step confirmation) --------------------
  const deleteAccount = async (accountId) => {
    try {
      // delete transactions first for safety
      const { error: delTxErr } = await supabase
        .from("transactions")
        .delete()
        .eq("account_id", accountId);

      if (delTxErr) throw delTxErr;

      // then delete the account
      const { error: delAccErr } = await supabase
        .from("account")
        .delete()
        .eq("id", accountId);

      if (delAccErr) throw delAccErr;

      // refresh accounts
      await fetchAccounts();

      // If deleted account was selected, clear selection
      if (activeAccountIdProp === accountId) {
        onSelectAccount?.(null);
      }

      toast.success("Account deleted");
      setConfirmDeleteAccount(null);
      setConfirmationStep(0);
    } catch (err) {
      console.error("deleteAccount error:", err);
      toast.error("Failed to delete account: " + (err.message || err));
    }
  };

  // Wrapper to start delete flow for an account
  const startDeleteFlow = (account) => {
    setConfirmDeleteAccount(account);
    setConfirmationStep(0);
  };

  // Confirmation modal renderer (multi-step)
  const renderDeleteConfirmation = () => {
    if (!confirmDeleteAccount) return null;
    const account = confirmDeleteAccount;
    const step = confirmationStep;

    let question = "";
    let buttons = [];

    switch (step) {
      case 0:
        question = `Have you exported the data of "${account.account_name}"?`;
        buttons = [
          { label: "Yes", action: () => setConfirmationStep(3) },
          { label: "No", action: () => setConfirmationStep(1) },
        ];
        break;
      case 1:
        question = "Do you want to export the data before deleting this account?";
        buttons = [
          {
            label: "Yes, Export Now",
            action: async () => {
              const ok = await exportAccountData(account);
              if (ok) setConfirmationStep(2);
            },
          },
          { label: "No", action: () => setConfirmationStep(2) },
        ];
        break;
      case 2:
        question =
          "Are you sure you want to delete this account? Once deleted, the data cannot be recovered.";
        buttons = [
          { label: "Cancel", action: () => setConfirmDeleteAccount(null) },
          { label: "Yes, Delete Permanently", action: () => deleteAccount(account.id) },
        ];
        break;
      case 3:
        question =
          "Are you sure you want to delete this account? This action cannot be undone.";
        buttons = [
          { label: "Cancel", action: () => setConfirmDeleteAccount(null) },
          { label: "Yes, Delete Permanently", action: () => deleteAccount(account.id) },
        ];
        break;
      default:
        return null;
    }

    return (
      <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
        <div className="bg-gray-900 p-6 rounded-xl w-full max-w-md relative border border-gray-700 text-center">
          <h3 className="text-lg font-semibold text-white mb-4">Delete Account</h3>
          <p className="text-gray-300 mb-6">{question}</p>
          <div className="flex justify-center gap-3">
            {buttons.map((b, idx) => (
              <button
                key={idx}
                onClick={b.action}
                className={`px-4 py-2 rounded-lg font-medium ${
                  b.label.includes("Delete")
                    ? "bg-red-600 hover:bg-red-700 text-white"
                    : b.label.includes("Export")
                    ? "bg-blue-600 hover:bg-blue-700 text-white"
                    : "bg-gray-700 hover:bg-gray-600 text-gray-200"
                }`}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // -------------------- Transaction flows --------------------
  const openTransactionModal = (type) => {
    setTransactionModal(type);
    setTxForm({ date: "", amount: "", description: "" });
  };

  const handleTxInputChange = (field, value) => {
    setTxForm((prev) => ({ ...prev, [field]: value }));
  };

  const processDeposit = async () => {
    if (!transactionModal || transactionModal !== "deposit") return;
    if (!txForm.amount || !txForm.date) {
      toast.error("Please provide date and amount");
      return;
    }
    setProcessingTx(true);

    const amount = parseFloat(txForm.amount);
    const tx = {
      id: uuidv4(),
      account_id: activeAccount.id,
      user_id: userId,
      type: "Deposit",
      amount,
      date: txForm.date,
      description: txForm.description || "",
      created_at: new Date().toISOString(),
    };

    try {
      // insert transaction
      const { data: txData, error: txError } = await supabase
        .from("transactions")
        .insert([tx])
        .select()
        .single();

      if (txError) throw txError;

      // update account capital & equity
      const newCapital = (activeAccount.capital || 0) + amount;
      const newEquity = newCapital + (activeAccount.profit || 0);

      const { data: accData, error: accError } = await supabase
        .from("account")
        .update({ capital: newCapital, equity: newEquity, updated_at: new Date().toISOString() })
        .eq("id", activeAccount.id)
        .select()
        .single();

      if (accError) throw accError;

      // refresh local state
      await fetchTransactions(activeAccount.id);
      await fetchAccounts();

      toast.success("Deposit successful");
      setTransactionModal(null);
      setTxForm({ date: "", amount: "", description: "" });
    } catch (err) {
      console.error("processDeposit error:", err);
      toast.error("Failed to record deposit");
    } finally {
      setProcessingTx(false);
    }
  };

  const processWithdraw = async () => {
    if (!transactionModal || transactionModal !== "withdraw") return;
    if (!txForm.amount || !txForm.date) {
      toast.error("Please provide date and amount");
      return;
    }
    setProcessingTx(true);

    const amount = parseFloat(txForm.amount);
    try {
      // re-fetch account to get the latest profit/capital
      const { data: refreshedAccount, error: refErr } = await supabase
        .from("account")
        .select("*")
        .eq("id", activeAccount.id)
        .single();
      if (refErr) throw refErr;

      let profit = refreshedAccount.profit || 0;
      let capital = refreshedAccount.capital || 0;

      if (profit >= amount) {
        // fully covered by profit
        profit = profit - amount;
      } else {
        // need to use capital for remainder
        const remainder = amount - profit;
        if (remainder > capital) {
          throw new Error("Not enough funds to withdraw (profit + capital insufficient).");
        }

        // confirm user wants to withdraw from capital
        const confirm = window.confirm(
          "No profit to be withdrawn or profit not enough. Do you want to proceed to withdraw from Capital?"
        );
        if (!confirm) {
          setProcessingTx(false);
          return;
        }

        profit = 0;
        capital = capital - remainder;
      }

      // create transaction record
      const tx = {
        id: uuidv4(),
        account_id: activeAccount.id,
        user_id: userId,
        type: "Withdraw",
        amount,
        date: txForm.date,
        description: txForm.description || "",
        created_at: new Date().toISOString(),
      };

      const { data: txData, error: txError } = await supabase
        .from("transactions")
        .insert([tx])
        .select()
        .single();
      if (txError) throw txError;

      // update account balances
      const newEquity = capital + profit;
      const { data: accData, error: accError } = await supabase
        .from("account")
        .update({ capital, profit, equity: newEquity, updated_at: new Date().toISOString() })
        .eq("id", activeAccount.id)
        .select()
        .single();
      if (accError) throw accError;

      // refresh UI
      await fetchTransactions(activeAccount.id);
      await fetchAccounts();

      toast.success("Withdrawal successful");
      setTransactionModal(null);
      setTxForm({ date: "", amount: "", description: "" });
    } catch (err) {
      console.error("processWithdraw error:", err);
      toast.error(err?.message || "Failed to process withdrawal");
    } finally {
      setProcessingTx(false);
    }
  };

  // -------------------- UI render helpers --------------------
  const renderTransactions = () => {
    if (txLoading) return <p className="text-gray-400">Loading transactions...</p>;
    if (!transactions || transactions.length === 0) return <p className="text-gray-500 italic text-sm">No transactions yet.</p>;

    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="text-gray-400 border-b border-gray-700">
            <tr>
              <th className="py-2 px-3 text-left">Type</th>
              <th className="py-2 px-3 text-left">Amount</th>
              <th className="py-2 px-3 text-left">Date</th>
              <th className="py-2 px-3 text-left">Notes</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((tx) => (
              <tr key={tx.id} className="border-b border-gray-800 text-gray-200 hover:bg-gray-800/50">
                <td className={`py-2 px-3 font-medium ${tx.type === "Deposit" ? "text-green-400" : "text-red-400"}`}>
                  {tx.type}
                </td>
                <td className="py-2 px-3">${Number(tx.amount).toFixed(2)}</td>
                <td className="py-2 px-3">{tx.date}</td>
                <td className="py-2 px-3 text-gray-300">{tx.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  // -------------------- Render --------------------
  return (
    <div className="p-4 text-white space-y-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Trading Accounts</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setCreateModalOpen(true)}
            className="px-3 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-sm font-medium transition-colors"
          >
            + Create Account
          </button>
        </div>
      </div>

      {/* Account Selector */}
      <div className="flex items-center space-x-2">
        {accounts.length > 0 && (
          <select
            value={activeAccountIdProp || ""}
            onChange={(e) => onSelectAccount?.(e.target.value)}
            className="flex-1 bg-gray-700 p-2.5 rounded-lg border border-gray-600 focus:ring-purple-500 focus:border-purple-500 transition-colors cursor-pointer"
          >
            <option value="">Select account...</option>
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.account_name} ({acc.account_type})
              </option>
            ))}
          </select>
        )}

        {accounts.length === 0 && !loadingAccounts && (
          <p className="text-gray-400">No accounts found. Create your first account.</p>
        )}
      </div>

      {/* Active Account Summary */}
      {activeAccount && (
        <div className="mt-4 p-3 bg-gray-800 rounded-lg border border-gray-700 text-sm">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-base text-purple-400">{activeAccount.account_name}</h3>
            <div className="flex gap-3 items-center">
              <button
                onClick={() => setEditModalAccount(activeAccount)}
                className="text-gray-400 hover:text-purple-400 transition-colors"
                title="Edit Account Details"
              >
                ✎ Edit
              </button>

              <button
                onClick={() => startDeleteFlow(activeAccount)}
                className="text-gray-400 hover:text-red-500 transition-colors"
                title="Delete Account"
              >
                🗑 Delete
              </button>

              <button
                onClick={() => exportAccountData(activeAccount)}
                className="text-gray-400 hover:text-blue-400 transition-colors"
                title="Export Account Data"
              >
                ⤓ Export
              </button>
            </div>
          </div>

          <p className="text-gray-300 mt-1">
            Capital:{" "}
            <span className="font-semibold">${Number(activeAccount.capital || 0).toFixed(2)}</span>
          </p>
          <p className="text-gray-300">
            Profit: <span className="font-semibold">${Number(activeAccount.profit || 0).toFixed(2)}</span>
          </p>
          <p className="text-gray-300">
            Equity: <span className="font-semibold">${Number(activeAccount.equity || 0).toFixed(2)}</span>
          </p>
        </div>
      )}

      {/* Transactions Section */}
      {activeAccount && (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-4">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-lg font-semibold text-white">Transactions</h3>
            <div className="flex gap-2">
              <button
                onClick={() => openTransactionModal("deposit")}
                className="px-3 py-1 bg-green-600 hover:bg-green-700 rounded-lg text-sm font-medium"
              >
                Deposit
              </button>
              <button
                onClick={() => openTransactionModal("withdraw")}
                className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded-lg text-sm font-medium"
              >
                Withdraw
              </button>
            </div>
          </div>

          {renderTransactions()}
        </div>
      )}

      {/* Create / Edit Account Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-gray-900 p-6 rounded-xl w-full max-w-lg relative">
            <button
              onClick={() => setCreateModalOpen(false)}
              className="absolute top-2 right-2 text-gray-400 hover:text-white text-xl"
            >
              ✕
            </button>
            <AccountCreation
              userId={userId}
              onAccountCreated={async (accData) => {
                // accData is expected to be the inserted account returned from AccountCreation
                setCreateModalOpen(false);
                await fetchAccounts();
                onSelectAccount?.(accData.id);
                onCreateAccount?.(accData);
              }}
              onClose={() => setCreateModalOpen(false)}
            />
          </div>
        </div>
      )}

      {editModalAccount && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-gray-900 p-6 rounded-xl w-full max-w-lg relative">
            <button
              onClick={() => setEditModalAccount(null)}
              className="absolute top-2 right-2 text-gray-400 hover:text-white text-xl"
            >
              ✕
            </button>
            <AccountCreation
              account={editModalAccount}
              userId={userId}
              onAccountUpdated={async (updated) => {
                setEditModalAccount(null);
                await fetchAccounts();
                onSelectAccount?.(updated.id);
              }}
              onClose={() => setEditModalAccount(null)}
            />
          </div>
        </div>
      )}

      {/* Transaction Modal */}
      {transactionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-gray-900 p-6 rounded-xl w-full max-w-md relative">
            <button
              onClick={() => setTransactionModal(null)}
              className="absolute top-2 right-2 text-gray-400 hover:text-white text-xl"
            >
              ✕
            </button>
            <h3 className="text-lg font-semibold mb-4 text-white">
              {transactionModal === "deposit" ? "Make a Deposit" : "Make a Withdrawal"}
            </h3>

            <div className="space-y-3">
              <input
                type="date"
                value={txForm.date}
                onChange={(e) => handleTxInputChange("date", e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white outline-none"
              />
              <input
                type="number"
                placeholder="Amount"
                value={txForm.amount}
                onChange={(e) => handleTxInputChange("amount", e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white outline-none"
              />
              <textarea
                placeholder="Description (optional)"
                value={txForm.description}
                onChange={(e) => handleTxInputChange("description", e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white outline-none resize-none"
              />
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setTransactionModal(null)}
                className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded-md"
              >
                Cancel
              </button>
              <button
                onClick={transactionModal === "deposit" ? processDeposit : processWithdraw}
                disabled={processingTx}
                className={`px-4 py-1 rounded-md text-white ${
                  transactionModal === "deposit"
                    ? "bg-green-600 hover:bg-green-700"
                    : "bg-red-600 hover:bg-red-700"
                }`}
              >
                {processingTx ? "Processing..." : transactionModal === "deposit" ? "Deposit" : "Withdraw"}
              </button>
            </div>
          </div>
        </div>
      )}

      {renderDeleteConfirmation()}
    </div>
  );
}

export default AccountManager;
