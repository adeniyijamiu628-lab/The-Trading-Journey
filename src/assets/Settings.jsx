import { useState } from "react";
import AccountManager from "./AccountManager";

export default function Settings({
  userId,
  userSettings,
  theme,
  styles,
  accounts,
  setAccounts,
  currentAccountId,
  setCurrentAccountId,
  setCapital,
  setTheme,
  setUserSettings,
  handleThemeToggle,
  handleFundsDeposit,
  handleFundsWithdrawal,
  handleExportData,
  handleImportData,
  handleResetAccount,
  handleLogout,
  depositAmount,
  setDepositAmount,
  withdrawAmount,
  setWithdrawAmount,
}) {
  const [settingsView, setSettingsView] = useState("accountManager");

  return (
    <div className="flex max-w-7xl mx-auto py-8 text-gray-200">
      {/* === Sidebar === */}
      <aside className="w-64 mr-8 bg-gray-900 rounded-2xl shadow-lg border border-gray-700 p-6">
        <h2 className="text-xl font-bold mb-6 text-white">Settings</h2>
        <nav className="space-y-3">
          <SidebarButton
            label="Account Manager"
            active={settingsView === "accountManager"}
            onClick={() => setSettingsView("accountManager")}
          />
          <SidebarButton
            label="Theme"
            active={settingsView === "theme"}
            onClick={() => setSettingsView("theme")}
          />
          {userSettings?.depositEnabled && (
            <SidebarButton
              label="Deposit & Withdrawal"
              active={settingsView === "funds"}
              onClick={() => setSettingsView("funds")}
            />
          )}
          <SidebarButton
            label="Data Management"
            active={settingsView === "data"}
            onClick={() => setSettingsView("data")}
          />
          <SidebarButton
            label="Logout"
            active={settingsView === "logout"}
            color="red"
            onClick={() => setSettingsView("logout")}
          />
        </nav>
      </aside>

      {/* === Main Content === */}
      <main className="flex-1 bg-gray-800 rounded-2xl shadow-lg border border-gray-700 p-8">
        {/* --- Account Manager --- */}
        {settingsView === "accountManager" && (
          <div>
            <h2 className="text-2xl font-bold mb-6 text-white">Account Manager</h2>
            <div className="bg-gray-900 rounded-xl shadow-lg p-6 border border-gray-700">
              <AccountManager
                userId={userId}
                accounts={accounts}
                onAccountsLoaded={(accs) => setAccounts(accs)}
                currentAccountId={currentAccountId}
                onSelectAccount={(accId) => {
                  const acc = accounts.find((a) => a.id === accId);
                  setCurrentAccountId(accId);
                  setCapital(acc?.capital ?? 0);
                  setTheme(acc?.theme ?? "dark");
                  setUserSettings(acc?.user_settings ?? {});
                }}
                onCreateAccount={(newAcc) => {
                  setAccounts((prev) => [...prev, newAcc]);
                  setCurrentAccountId(newAcc.id);
                }}
                onAccountsChange={(updatedAccounts) =>
                  setAccounts(updatedAccounts)
                }
              />
            </div>
          </div>
        )}

        {/* --- Theme --- */}
        {settingsView === "theme" && (
          <div>
            <h2 className="text-2xl font-bold mb-6 text-white">Theme</h2>
            <button onClick={handleThemeToggle} className={styles.smallButton}>
              Switch to {theme === "dark" ? "Light" : "Dark"} Theme
            </button>
          </div>
        )}

        {/* --- Deposit & Withdrawal --- */}
        {settingsView === "funds" && userSettings?.depositEnabled && (
          <div>
            <h2 className="text-2xl font-bold mb-6 text-white">
              Deposit & Withdrawal
            </h2>

            {/* Deposit */}
            <div className="mb-8 p-4 bg-gray-900 rounded-lg shadow">
              <h3 className="text-lg font-semibold text-green-400 mb-3">
                Deposit
              </h3>
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

            {/* Withdrawal */}
            <div className="p-4 bg-gray-900 rounded-lg shadow">
              <h3 className="text-lg font-semibold text-red-400 mb-3">
                Withdrawal
              </h3>
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
          </div>
        )}

        {/* --- Data Management --- */}
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

        {/* --- Logout --- */}
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

/* === Sidebar Button Component === */
const SidebarButton = ({ label, active, color = "purple", onClick }) => {
  const activeColor =
    color === "red" ? "bg-red-600" : "bg-purple-600";
  return (
    <button
      onClick={onClick}
      className={`block w-full text-left px-4 py-2 rounded-lg transition ${
        active
          ? `${activeColor} text-white font-semibold`
          : "bg-gray-800 hover:bg-gray-700 text-gray-300"
      }`}
    >
      {label}
    </button>
  );
};
