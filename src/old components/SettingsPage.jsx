// src/components/SettingsPage.jsx
import React, { useState } from "react";
import PropTypes from "prop-types";
import UserSettingsForm from "./UserSettingsForm"; // ✅ FIXED import path

// ✅ SETTINGS PAGE COMPONENT
export default function SettingsPage({
  userId,
  userSettings,
  theme,
  handleThemeToggle,
  handleExportData,
  handleImportData,
  handleResetAccount,
  handleLogout,
  handleFundsDeposit,
  handleFundsWithdrawal,
  depositAmount,
  setDepositAmount,
  withdrawAmount,
  setWithdrawAmount,
  setAccounts,
  setCurrentAccountId,
  setCapital,
  setFormData,
}) {
  const [settingsView, setSettingsView] = useState("user");

  return (
    <div className="flex max-w-7xl mx-auto py-8 text-gray-200">
      {/* Sidebar */}
      <aside className="w-64 mr-8 bg-gray-900 rounded-2xl shadow-lg border border-gray-700 p-6">
        <h2 className="text-xl font-bold mb-6 text-white">Settings</h2>
        <nav className="space-y-3">
          {/* User Settings */}
          <button
            onClick={() => setSettingsView("user")}
            className={`block w-full text-left px-4 py-2 rounded-lg transition ${
              settingsView === "user"
                ? "bg-purple-600 text-white font-semibold"
                : "bg-gray-800 hover:bg-gray-700 text-gray-300"
            }`}
          >
            User Settings
          </button>

          {/* Theme */}
          <button
            onClick={() => setSettingsView("theme")}
            className={`block w-full text-left px-4 py-2 rounded-lg transition ${
              settingsView === "theme"
                ? "bg-purple-600 text-white font-semibold"
                : "bg-gray-800 hover:bg-gray-700 text-gray-300"
            }`}
          >
            Theme
          </button>

          {/* Deposit & Withdrawal */}
          {userSettings?.depositEnabled && (
            <button
              onClick={() => setSettingsView("funds")}
              className={`block w-full text-left px-4 py-2 rounded-lg transition ${
                settingsView === "funds"
                  ? "bg-purple-600 text-white font-semibold"
                  : "bg-gray-800 hover:bg-gray-700 text-gray-300"
              }`}
            >
              Deposit & Withdrawal
            </button>
          )}

          {/* Data Management */}
          <button
            onClick={() => setSettingsView("data")}
            className={`block w-full text-left px-4 py-2 rounded-lg transition ${
              settingsView === "data"
                ? "bg-purple-600 text-white font-semibold"
                : "bg-gray-800 hover:bg-gray-700 text-gray-300"
            }`}
          >
            Data Management
          </button>

          {/* Logout */}
          <button
            onClick={() => setSettingsView("logout")}
            className={`block w-full text-left px-4 py-2 rounded-lg transition ${
              settingsView === "logout"
                ? "bg-red-600 text-white font-semibold"
                : "bg-gray-800 hover:bg-gray-700 text-gray-300"
            }`}
          >
            Logout
          </button>
        </nav>
      </aside>

      {/* Content Area */}
      <main className="flex-1 bg-gray-800 rounded-2xl shadow-lg border border-gray-700 p-8">
        {/* USER SETTINGS */}
        {settingsView === "user" && (
          <div>
            <h2 className="text-2xl font-bold mb-6 text-white">Account Settings</h2>
            <UserSettingsForm
              userId={userId}
              onAccountCreated={(newAccount) => {
                if (!newAccount) return;

                setAccounts((prev) => [...prev, newAccount]);
                setCurrentAccountId(newAccount.id);
                setCapital(newAccount.capital ?? 0);

                setFormData((prev) => ({
                  ...prev,
                  accountName: newAccount.account_name || "",
                  accountPlan: newAccount.account_plan || "Normal",
                  accountType: newAccount.account_type || "Standard",
                }));
              }}
            />
          </div>
        )}

        {/* THEME */}
        {settingsView === "theme" && (
          <div>
            <h2 className="text-2xl font-bold mb-6 text-white">Theme</h2>
            <button
              onClick={handleThemeToggle}
              className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg shadow transition"
            >
              Switch to {theme === "dark" ? "Light" : "Dark"} Theme
            </button>
          </div>
        )}

        {/* FUNDS */}
        {settingsView === "funds" && userSettings?.depositEnabled && (
          <div>
            <h2 className="text-2xl font-bold mb-6 text-white">Deposit & Withdrawal</h2>

            {/* Deposit */}
            <div className="mb-8 p-4 bg-gray-900 rounded-lg shadow">
              <h3 className="text-lg font-semibold text-green-400 mb-3">Deposit</h3>
              <input
                type="number"
                placeholder="Enter amount ($)"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                className="w-full p-2 rounded bg-gray-800 border border-gray-700 text-white mb-3"
              />
              <button
                onClick={handleFundsDeposit}
                className="bg-green-600 hover:bg-green-700 text-white font-medium px-6 py-2 rounded-lg"
              >
                Deposit
              </button>
            </div>

            {/* Withdraw */}
            {userSettings?.withdrawalEnabled && (
              <div className="p-4 bg-gray-900 rounded-lg shadow">
                <h3 className="text-lg font-semibold text-red-400 mb-3">Withdrawal</h3>
                <input
                  type="number"
                  placeholder="Enter amount ($)"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  className="w-full p-2 rounded bg-gray-800 border border-gray-700 text-white mb-3"
                />
                <button
                  onClick={handleFundsWithdrawal}
                  className="bg-red-600 hover:bg-red-700 text-white font-medium px-6 py-2 rounded-lg"
                >
                  Withdraw
                </button>
              </div>
            )}
          </div>
        )}

        {/* DATA MANAGEMENT */}
        {settingsView === "data" && (
          <div className="space-y-4 mt-4">
            <button
              onClick={handleExportData}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-medium transition"
            >
              Export Data
            </button>

            <div>
              <input
                type="file"
                accept="application/json"
                onChange={handleImportData}
                id="import-file"
                className="hidden"
              />
              <label
                htmlFor="import-file"
                className="w-full block text-center bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg font-medium cursor-pointer transition"
              >
                Import Data
              </label>
            </div>

            <button
              onClick={handleResetAccount}
              className="w-full bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg font-medium transition"
            >
              Reset Account
            </button>
          </div>
        )}

        {/* LOGOUT */}
        {settingsView === "logout" && (
          <div>
            <h2 className="text-2xl font-bold mb-6 text-white">Logout</h2>
            <button
              onClick={handleLogout}
              className="bg-red-600 text-white font-medium py-2 px-6 rounded-full shadow-lg hover:bg-red-700 transition-colors duration-200"
            >
              Logout
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

// ✅ Props validation
SettingsPage.propTypes = {
  userId: PropTypes.string,
  userSettings: PropTypes.object,
  theme: PropTypes.string,
  handleThemeToggle: PropTypes.func,
  handleExportData: PropTypes.func,
  handleImportData: PropTypes.func,
  handleResetAccount: PropTypes.func,
  handleLogout: PropTypes.func,
  handleFundsDeposit: PropTypes.func,
  handleFundsWithdrawal: PropTypes.func,
  depositAmount: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  setDepositAmount: PropTypes.func,
  withdrawAmount: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  setWithdrawAmount: PropTypes.func,
  setAccounts: PropTypes.func,
  setCurrentAccountId: PropTypes.func,
  setCapital: PropTypes.func,
  setFormData: PropTypes.func,
};
