import React, { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Line,
  ReferenceLine,
} from "recharts";
import { supabase } from "./supabaseClient"; // adjust import path if needed
import Modal from "./Modal"; // adjust if your modal is in another path

export default function WeeklyReview({
  userId,
  currentAccountId,
  selectedWeek,
  setSelectedWeek,
  getWeekRange,
  capital,
  fmt2,
  openDailyDetails,
  closeDailyDetails,
  dailyDetailsOpen,
  selectedDay,
  selectedDayTrades,
  riskDomain,
  styles,
  setImagePreview,
}) {
  const [weekData, setWeekData] = useState(null);
  const [dailyBreakdown, setDailyBreakdown] = useState([]);
  const [weeklyDailyRiskData, setWeeklyDailyRiskData] = useState([]);

  // === Load Weekly Data from Supabase with Offline Fallback ===


  if (!weekData) {
    return (
      <div className="p-6 text-gray-400 text-center">
        Loading weekly data or offline cache...
      </div>
    );
  }

  const weeklyPercent = weekData.startEquity
    ? ((weekData.endEquity - weekData.startEquity) / capital) * 100
    : 0;

  // === Weekly Equity Growth Data ===
  let drawdownLine =
    weekData.startEquity < capital ? weekData.endEquity : weekData.startEquity * 0.9;

  const targetLine =
    weekData.startEquity >= capital ? weekData.startEquity * 1.1 : capital;

  let runningEquity = weekData.startEquity || 0;
  const startPoint = {
    tradeNo: 0,
    date: "",
    label: "Start",
    equity: Number(runningEquity.toFixed(2)),
    pnl: 0,
    target: targetLine,
    drawdown: drawdownLine,
  };

  const weeklyEquityData = [
    startPoint,
    ...[...weekData.trades]
      .sort((a, b) => new Date(a.entryDate) - new Date(b.entryDate))
      .map((trade, index) => {
        runningEquity += trade.pnlCurrency || 0;
        return {
          tradeNo: index + 1,
          date: new Date(trade.entryDate).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
          }),
          label: `${new Date(trade.entryDate).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
          })} #${index + 1}`,
          equity: Number(runningEquity.toFixed(2)),
          pnl: trade.pnlCurrency,
          target: targetLine,
          drawdown: drawdownLine,
        };
      }),
  ];

  return (
    <div className="space-y-8 max-w-7xl mx-auto py-8 text-gray-200">
      {/* === HEADER === */}
      <div className="bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-700">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-2xl font-bold text-white">Weekly Review</h3>
          <div className="flex space-x-2">
            <button
              onClick={() => setSelectedWeek((w) => (w > 1 ? w - 1 : w))}
              className={styles.smallButton}
            >
              &lt; Prev
            </button>
            <span className="text-lg font-semibold text-white px-4 py-2 rounded-full bg-gray-700">
              Week {selectedWeek} (
              {getWeekRange(selectedWeek, new Date().getFullYear()).start} -{" "}
              {getWeekRange(selectedWeek, new Date().getFullYear()).end})
            </span>
            <button
              onClick={() => setSelectedWeek((w) => (w < 52 ? w + 1 : w))}
              className={styles.smallButton}
            >
              Next &gt;
            </button>
          </div>
        </div>

        {/* === STATS GRID === */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-6">
          {/* Left: Equity + Performance */}
          <div className="space-y-4">
            <h4 className="text-lg font-bold text-white mb-2">Equity & Performance</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <StatCard title="Starting Equity" value={`$${fmt2(weekData.startEquity)}`} />
              <StatCard
                title="Total P&L"
                value={`$${fmt2(weekData.totalPnL)}`}
                color={weekData.totalPnL >= 0 ? "text-green-400" : "text-red-400"}
              />
              <StatCard title="Total Trades" value={weekData.trades.length} />
              <StatCard
                title="Weekly %"
                value={`${fmt2(weeklyPercent)}%`}
                color={weeklyPercent >= 0 ? "text-green-400" : "text-red-500"}
              />
              <StatCard title="Ending Equity" value={`$${fmt2(weekData.endEquity)}`} />
            </div>
          </div>

          {/* Right: Pair Analysis */}
          <div className="space-y-4">
            <h4 className="text-lg font-bold text-white mb-2">Pair Analysis</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <StatCard title="Most Traded Pair" value={weekData.mostTradedPair || "—"} />
              <StatCard
                title="Most Profitable Pair"
                value={weekData.mostProfitablePair || "—"}
                color="text-green-400"
              />
              <StatCard
                title="Most Losing Pair"
                value={weekData.mostLosingPair || "—"}
                color="text-red-400"
              />
              <StatCard
                title="Breakeven Pairs"
                value={
                  weekData.breakevenPairs?.length
                    ? weekData.breakevenPairs.join(", ")
                    : "—"
                }
              />
            </div>
          </div>
        </div>

        {/* === DAILY BREAKDOWN === */}
        <DailyBreakdownTable
          dailyBreakdown={dailyBreakdown}
          capital={capital}
          fmt2={fmt2}
          openDailyDetails={openDailyDetails}
          styles={styles}
        />

        {/* === WEEKLY EQUITY CHART === */}
        <EquityChart weeklyEquityData={weeklyEquityData} capital={capital} fmt2={fmt2} />

        {/* === DAILY RISK USED === */}
        <DailyRiskChart
          weeklyDailyRiskData={weeklyDailyRiskData}
          riskDomain={riskDomain}
        />
      </div>

      {/* === MODAL === */}
      <Modal
        isOpen={dailyDetailsOpen}
        onClose={closeDailyDetails}
        title={
          selectedDay
            ? `Trades for ${new Date(selectedDay).toLocaleDateString("en-GB")}`
            : "Day Trades"
        }
      >
        {selectedDayTrades.length === 0 ? (
          <p className="text-gray-400">No trades for this day.</p>
        ) : (
          selectedDayTrades.map((t) => (
            <TradeDetails
              key={t.id}
              trade={t}
              fmt2={fmt2}
              capital={capital}
              styles={styles}
              setImagePreview={setImagePreview}
            />
          ))
        )}
        <div className="flex justify-end mt-4">
          <button className={styles.smallButton} onClick={closeDailyDetails}>
            Close
          </button>
        </div>
      </Modal>
    </div>
  );
}

/* === Helper Functions === */
function calculateWeeklyData(trades, selectedWeek, capital) {
  // You can plug in your own weekly grouping logic here.
  // For now, this gives placeholder mock calculations.
  const filtered = trades; // replace with actual week filter if needed
  const startEquity = capital;
  const totalPnL = filtered.reduce((sum, t) => sum + (t.pnlCurrency || 0), 0);
  const endEquity = startEquity + totalPnL;

  return {
    weekData: {
      startEquity,
      endEquity,
      totalPnL,
      trades: filtered,
      mostTradedPair: "-",
      mostProfitablePair: "-",
      mostLosingPair: "-",
      breakevenPairs: [],
    },
    dailyBreakdown: [],
    weeklyDailyRiskData: [],
  };
}

/* === Subcomponents (StatCard, Tables, Charts, etc.) === */
const StatCard = ({ title, value, color }) => (
  <div className="bg-gray-700 p-4 rounded-xl shadow">
    <h5 className="text-sm font-semibold opacity-75">{title}</h5>
    <p className={`text-xl font-bold mt-1 ${color || ""}`}>{value}</p>
  </div>
);

const DailyBreakdownTable = ({ dailyBreakdown, capital, fmt2, openDailyDetails, styles }) => (
  <div className="mt-8">
    <h4 className="text-xl font-bold mb-4 text-white">Daily Breakdown</h4>
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm border border-gray-700 rounded-lg overflow-hidden">
        <thead className="bg-gray-800 text-gray-300">
          <tr>
            <th className="px-4 py-2">Date</th>
            <th className="px-4 py-2">Day</th>
            <th className="px-4 py-2">Wins</th>
            <th className="px-4 py-2">Losses</th>
            <th className="px-4 py-2">Breakeven</th>
            <th className="px-4 py-2">P&L ($)</th>
            <th className="px-4 py-2">P&L (%)</th>
            <th className="px-4 py-2">Action</th>
          </tr>
        </thead>
        <tbody>
          {dailyBreakdown.length > 0 ? (
            dailyBreakdown.map((d) => {
              const pct =
                typeof d.totalPnL === "number" && capital
                  ? Number(((d.totalPnL / capital) * 100).toFixed(2))
                  : 0;
              return (
                <tr key={d.id} className="border-t border-gray-700 text-gray-300">
                  <td className="px-4 py-3">
                    {d.dateKey
                      ? new Date(d.dateKey).toLocaleDateString("en-GB")
                      : d.dateKey}
                  </td>
                  <td className="px-4 py-3">{d.day}</td>
                  <td className="px-4 py-3">{d.wins}</td>
                  <td className="px-4 py-3">{d.losses}</td>
                  <td className="px-4 py-3">{d.breakeven}</td>
                  <td
                    className={`px-4 py-3 font-semibold ${
                      d.totalPnL >= 0 ? "text-green-500" : "text-red-500"
                    }`}
                  >
                    ${fmt2(d.totalPnL)}
                  </td>
                  <td
                    className={`px-4 py-3 font-semibold ${
                      pct >= 0 ? "text-green-500" : "text-red-500"
                    }`}
                  >
                    {fmt2(pct)}%
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => openDailyDetails(d.dateKey, d.id)}
                      className="text-sm px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded"
                    >
                      More
                    </button>
                  </td>
                </tr>
              );
            })
          ) : (
            <tr>
              <td colSpan="9" className="text-center py-4 text-gray-500">
                No daily data.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  </div>
);

const EquityChart = ({ weeklyEquityData }) => (
  <div className="mt-10 bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-700">
    <h4 className="text-xl font-bold mb-4 text-white">Weekly Equity Growth</h4>
    {weeklyEquityData.length > 0 ? (
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={weeklyEquityData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#444" />
          <XAxis dataKey="label" stroke="#ccc" />
          <YAxis stroke="#ccc" domain={["dataMin - 100", "dataMax + 100"]} />
          <Tooltip
            contentStyle={{
              backgroundColor: "#2d3748",
              border: "none",
              borderRadius: "8px",
            }}
            labelStyle={{ color: "#fff" }}
          />
          <Line type="monotone" dataKey="equity" stroke="#b7c2ea" strokeWidth={2} />
          <Line type="monotone" dataKey="target" stroke="#0ce60f" strokeDasharray="5 5" />
          <Line type="monotone" dataKey="drawdown" stroke="red" strokeDasharray="5 5" />
        </LineChart>
      </ResponsiveContainer>
    ) : (
      <p className="text-gray-400">No equity data for this week.</p>
    )}
  </div>
);

const DailyRiskChart = ({ weeklyDailyRiskData, riskDomain }) => (
  <div className="bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-700 mt-6">
    <h3 className="text-lg font-semibold text-white mb-4">Daily Risk Used</h3>
    <div className="h-64 md:h-80">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={weeklyDailyRiskData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#4a5568" />
          <XAxis dataKey="date" stroke="#cbd5e0" />
          <YAxis stroke="#cbd5e0" domain={riskDomain} tickFormatter={(v) => `${v}%`} />
          <Tooltip
            contentStyle={{
              backgroundColor: "#2d3748",
              border: "none",
              borderRadius: "8px",
            }}
            labelStyle={{ color: "#fff" }}
          />
          {weeklyDailyRiskData.map((item) => (
            <ReferenceLine
              key={item.date}
              y={item.risk}
              stroke="#7dd3fc"
              strokeDasharray="4 4"
              label={{
                position: "right",
                value: `${new Date(item.date).toLocaleDateString("en-GB", {
                  weekday: "short",
                })} ${item.risk}%`,
                fill: "#7dd3fc",
              }}
            />
          ))}
          <Line type="monotone" dataKey="risk" stroke="#82ca9d" strokeWidth={2} />
          <Line
            type="monotone"
            dataKey="dailyLimit"
            stroke="#ff7300"
            strokeDasharray="5 5"
            strokeWidth={2}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  </div>
);

const TradeDetails = ({ trade: t, fmt2, capital, styles, setImagePreview }) => (
  <div className="bg-gray-700 p-3 rounded-md border border-gray-600 mb-4">
    <div className="flex justify-between items-start">
      <div>
        <p className="text-sm text-gray-300">Pair</p>
        <p className="font-semibold text-white">{t.pair}</p>
      </div>
      <div className="text-right">
        <p className="text-sm text-gray-300">Type</p>
        <p
          className={`font-semibold ${
            t.type === "buy" ? "text-green-400" : "text-red-400"
          }`}
        >
          {t.type ? t.type.toUpperCase() : "—"}
        </p>
      </div>
    </div>

    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-sm text-gray-300">
      <div>
        <p>Entry:</p>
        <p className="font-semibold text-white">{t.entry_price ?? "—"}</p>
      </div>
      <div>
        <p>Exit:</p>
        <p className="font-semibold text-white">{t.exit_price ?? "—"}</p>
      </div>
      <div>
        <p>Points:</p>
        <p
          className={`font-semibold ${
            t.points >= 0 ? "text-green-400" : "text-red-400"
          }`}
        >
          {t.points ?? "—"}
        </p>
      </div>
      <div>
        <p>P&L ($)</p>
        <p
          className={`font-semibold ${
            t.pnl_currency >= 0 ? "text-green-400" : "text-red-400"
          }`}
        >
          ${fmt2(t.pnl_currency ?? 0)}
        </p>
      </div>
    </div>

    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-sm text-gray-300">
      <div>
        <p>SL:</p>
        <p className="font-semibold text-white">{t.sl ?? "—"}</p>
      </div>
      <div>
        <p>TP:</p>
        <p className="font-semibold text-white">{t.tp ?? "—"}</p>
      </div>
      <div>
        <p>Lot Size:</p>
        <p className="font-semibold text-white">{t.lot_size ?? "—"}</p>
      </div>
      <div>
        <p>Risk %:</p>
        <p className="font-semibold text-white">
          {t.risk ? `${fmt2(t.risk)}%` : "—"}
        </p>
      </div>
    </div>

    {t.strategy && (
      <div className="mt-3">
        <p className="text-sm text-gray-300">Strategy:</p>
        <p className="font-semibold text-white">{t.strategy}</p>
      </div>
    )}

    {t.note && (
      <div className="mt-3">
        <p className="text-sm text-gray-300">Note:</p>
        <p className="text-gray-200 italic">{t.note}</p>
      </div>
    )}

    <div className="flex flex-wrap gap-4 mt-4">
      {t.beforeimage && (
        <div className="flex flex-col items-center">
          <p className="text-xs text-gray-400 mb-1">Before</p>
          <img
            src={t.beforeimage}
            alt="Before"
            onClick={() => setImagePreview(t.beforeimage)}
            className="w-24 h-24 object-cover rounded-md cursor-pointer hover:opacity-80 transition"
          />
        </div>
      )}
      {t.afterimage && (
        <div className="flex flex-col items-center">
          <p className="text-xs text-gray-400 mb-1">After</p>
          <img
            src={t.afterimage}
            alt="After"
            onClick={() => setImagePreview(t.afterimage)}
            className="w-24 h-24 object-cover rounded-md cursor-pointer hover:opacity-80 transition"
          />
        </div>
      )}
    </div>
  </div>
);
