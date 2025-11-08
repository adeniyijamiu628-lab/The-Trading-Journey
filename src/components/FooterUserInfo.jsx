// src/components/FooterUserInfo.jsx
import React from "react";

export default function FooterUserInfo({
  userId,
  accountName,
  capital = 0,
  totalPnL = 0,
  totalPnLPercent = 0,
}) {
  // If no user or account, show minimal info
  if (!userId || !accountName) {
    return (
      <footer className="bg-gray-950 p-3 text-center text-sm text-gray-500 border-t border-gray-800">
        Trading Journal App | Please log in or select an account.
      </footer>
    );
  }

  // Dynamic PnL color
  const pnlClass = totalPnL >= 0 ? "text-green-400" : "text-red-400";
  const pnlPercentClass = totalPnLPercent >= 0 ? "text-green-400" : "text-red-400";

  return (
    <footer className="bg-gray-950 text-white border-t border-gray-800 shadow-lg sticky bottom-0 z-10">
      <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col md:flex-row justify-between items-center text-sm font-medium space-y-2 md:space-y-0">

        {/* 👤 User & Account Info */}
        <div className="flex flex-col md:flex-row items-center md:space-x-6 text-gray-300">
          <span className="text-purple-400 font-semibold">
            User ID: {userId}
          </span>
          <span className="text-gray-200">
            Account: <span className="font-semibold">{accountName}</span>
          </span>
          <span className="text-gray-300">
            Capital: <span className="font-semibold text-blue-400">${capital?.toFixed(2)}</span>
          </span>
        </div>

        {/* 📊 Performance Stats */}
        <div className="flex items-center space-x-6 text-gray-300">
          <div>
            Total PnL: <span className={`${pnlClass} font-semibold`}>${totalPnL.toFixed(2)}</span>
          </div>
          <div>
            Total PnL %:{" "}
            <span className={`${pnlPercentClass} font-semibold`}>
              {totalPnLPercent >= 0 ? "+" : ""}
              {totalPnLPercent.toFixed(2)}%
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
