// src/utils/sessionUtils.js

/**
 * Forex trading session time ranges (in minutes from 00:00)
 * All times assumed to be in local time — adjust to UTC if you need UTC.
 */
const sessions = [
  { name: "Sydney", start: 22 * 60, end: 7 * 60 },   // 22:00 – 07:00 (overnight)
  { name: "Tokyo", start: 0 * 60, end: 9 * 60 },     // 00:00 – 09:00
  { name: "London", start: 7 * 60, end: 16 * 60 },   // 07:00 – 16:00
  { name: "New York", start: 12 * 60, end: 21 * 60 } // 12:00 – 21:00
];

function isWithin(time, start, end) {
  if (start < end) return time >= start && time < end;
  // overnight wrap (e.g. Sydney)
  return time >= start || time < end;
}

/**
 * getSessionForTime
 * @param {string} time - "HH:mm"
 * @returns {string} - "London" or "London & New York" or "Closed" / "Unknown"
 */
export function getSessionForTime(time) {
  if (!time || typeof time !== "string") return "Unknown";
  const [hStr, mStr] = time.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (isNaN(h) || isNaN(m)) return "Unknown";

  const total = h * 60 + m;
  const active = sessions.filter((s) => isWithin(total, s.start, s.end)).map(s => s.name);

  if (active.length === 0) return "Closed";
  return active.join(" & ");
}

/**
 * getSessionColors
 * returns a Tailwind-like class string to style a badge for a session name.
 * Accepts single session names like "London" or parts of overlaps ("London", "New York").
 */
export function getSessionColors(sessionName) {
  if (!sessionName || typeof sessionName !== "string") {
    return "bg-gray-600/40 text-gray-300";
  }
  const s = sessionName.toLowerCase();
  if (s.includes("london")) return "bg-blue-600/30 text-blue-300";
  if (s.includes("new york") || s.includes("new-york")) return "bg-red-600/30 text-red-300";
  if (s.includes("tokyo")) return "bg-green-600/30 text-green-300";
  if (s.includes("sydney")) return "bg-yellow-600/30 text-yellow-300";
  return "bg-gray-600/40 text-gray-300";
}
