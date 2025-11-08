// src/utils/dateUtils.js
/**
 * Format date as YYYY-MM-DD
 */
export function formatDate(date = new Date()) {
  return date.toISOString().split('T')[0];
}

/**
 * Returns the day name (e.g. "Monday")
 */
export function getDayName(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { weekday: 'long' });
}

/**
 * Returns a label like "Week 39 (Sep 23–29)"
 */
export function weekLabel(weekNum, year = new Date().getFullYear()) {
  return `Week ${weekNum} (${year})`;
}
