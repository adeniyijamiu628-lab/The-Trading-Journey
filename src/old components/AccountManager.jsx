// src/components/AccountManager.jsx
import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import UserSettingsForm from "./UserSettingsForm";
import toast from "react-hot-toast";

function AccountManager({
  accounts: accountsProp = [],
  currentAccountId: activeAccountIdProp,
  onSelectAccount,
  onCreateAccount,
}) {
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalAccount, setEditModalAccount] = useState(null);
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(null);
  const [confirmationStep, setConfirmationStep] = useState(0);
  const [userId, setUserId] = useState(null);

  // ✅ Load authenticated user once
  useEffect(() => {
    const loadUserSession = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData?.session?.user) {
        setUserId(sessionData.session.user.id);
      } else {
        const { data: userData } = await supabase.auth.getUser();
        if (userData?.user?.id) setUserId(userData.user.id);
      }
    };
    loadUserSession();
  }, []);

  // ✅ Identify currently active account
  const activeAccount = accountsProp.find((a) => a.id === activeAccountIdProp);

  // ✅ Create / Update handlers
  const handleAccountCreated = (newAccount) => {
    setCreateModalOpen(false);
    onCreateAccount?.(newAccount);
  };

  const handleAccountUpdated = (updatedAccount) => {
    setEditModalAccount(null);
    if (activeAccountIdProp === updatedAccount.id) {
      onSelectAccount?.(updatedAccount.id);
    }
  };

  // ✅ Delete account (Supabase + UI persistence)
const deleteAccount = async (accountId) => {
  try {
    // delete from the DB table named `account` (singular)
    const { error } = await supabase.from("account").delete().eq("id", accountId);
    if (error) throw error;

    // Update local list
    const updatedAccounts = accountsProp.filter((acc) => acc.id !== accountId);

    // Inform parent/app to update state
    if (typeof onAccountsChange === "function") {
      onAccountsChange(updatedAccounts);
    } else if (typeof onCreateAccount === "function") {
      // fallback: replace list
      onCreateAccount(updatedAccounts);
    }

    // Reset selected if needed
    if (activeAccountIdProp === accountId) {
      onSelectAccount?.(null);
    }

    toast.success("✅ Account deleted successfully!");
    setConfirmDeleteAccount(null);
    setConfirmationStep(0);
  } catch (err) {
    console.error("Delete error:", err);
    toast.error("❌ Failed to delete account: " + (err.message || err));
  }
};


  // ✅ Export handler
  const exportAccountData = async (account) => {
    try {
      const exportedData = JSON.stringify(account, null, 2);
      const blob = new Blob([exportedData], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${account.account_name}_export.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("✅ Exported successfully!");
    } catch (err) {
      toast.error("❌ Export failed.");
    }
  };

  // ✅ Confirmation Modal Component
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
              await exportAccountData(account);
              setConfirmationStep(2);
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
        break;
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

  // ✅ If no accounts exist yet
  if (accountsProp.length === 0 && !activeAccountIdProp) {
    return (
      <div className="text-white text-center p-4 space-y-4 bg-gray-700 rounded-xl">
        <h2 className="text-lg font-semibold">No Accounts Found</h2>
        <p className="text-sm text-gray-400">
          Create your first trading account to begin journaling.
        </p>
        <button
          onClick={() => setCreateModalOpen(true)}
          className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-white font-medium transition-colors"
        >
          + Create New Account
        </button>

        {createModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
            <div className="bg-gray-900 p-6 rounded-xl w-full max-w-lg relative">
              <button
                onClick={() => setCreateModalOpen(false)}
                className="absolute top-2 right-2 text-gray-400 hover:text-white text-xl"
              >
                ✕
              </button>
              <UserSettingsForm
                account={{}}
                userId={userId}
                onAccountCreated={handleAccountCreated}
                onClose={() => setCreateModalOpen(false)}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  // ✅ Main Render
  return (
    <div className="p-4 text-white space-y-3">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Trading Accounts</h2>
      </div>

      {/* Account Selector */}
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
          onClick={() => setCreateModalOpen(true)}
          className="shrink-0 px-3 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-sm font-medium transition-colors"
        >
          +
        </button>
      </div>

      {/* Active Account Summary */}
      {activeAccount && (
        <div className="mt-4 p-3 bg-gray-800 rounded-lg border border-gray-700 text-sm">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-base text-purple-400">
              {activeAccount.account_name}
            </h3>
            <div className="flex gap-3">
              <button
                onClick={() => setEditModalAccount(activeAccount)}
                className="text-gray-400 hover:text-purple-400 transition-colors"
                title="Edit Account Details"
              >
                ✎ Edit
              </button>

              <button
                onClick={() => setConfirmDeleteAccount(activeAccount)}
                className="text-gray-400 hover:text-red-500 transition-colors"
                title="Delete Account"
              >
                🗑 Delete
              </button>
            </div>
          </div>
          <p className="text-gray-300 mt-1">
            Capital:{" "}
            <span className="font-semibold">
              ${(activeAccount.capital || 0).toFixed(2)}
            </span>
          </p>
          <p className="text-gray-400 text-xs">
            Plan: {activeAccount.account_plan || "—"} | Type:{" "}
            {activeAccount.account_type || "—"}
          </p>
        </div>
      )}

      {/* Modals */}
      {createModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-gray-900 p-6 rounded-xl w-full max-w-lg relative">
            <button
              onClick={() => setCreateModalOpen(false)}
              className="absolute top-2 right-2 text-gray-400 hover:text-white text-xl"
            >
              ✕
            </button>
            <UserSettingsForm
              account={{}}
              userId={userId}
              onAccountCreated={handleAccountCreated}
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
            <UserSettingsForm
              account={editModalAccount}
              userId={userId}
              onAccountUpdated={handleAccountUpdated}
              onClose={() => setEditModalAccount(null)}
            />
          </div>
        </div>
      )}

      {renderDeleteConfirmation()}
    </div>
  );
}

export default AccountManager;
