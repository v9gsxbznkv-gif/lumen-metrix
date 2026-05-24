/**
 * Week Display Utility
 * 
 * The database stores week_start as Monday, but the church operates on a
 * Sunday-centric calendar. This utility shifts the displayed date +6 days
 * so users see the Sunday of each week instead of the Monday.
 * 
 * IMPORTANT: This is display-only. No backend or data logic changes.
 */

/**
 * Given a Monday-based weekStartDate string (YYYY-MM-DD), returns the
 * Sunday of that same week (Monday + 6 days) as a formatted string.
 * e.g., "2026-05-19" (Monday) → "May 25" (Sunday)
 */
export function formatWeekDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + 6); // Monday → Sunday
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Given a Monday-based weekStartDate string, returns the Sunday date
 * as a short label (MM/DD format) for chart axes.
 * e.g., "2026-05-19" → "05/25"
 */
export function formatWeekDateShort(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + 6); // Monday → Sunday
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${m}/${day}`;
}

/**
 * Given a Monday-based weekStartDate string, returns the Sunday YYYY-MM-DD string.
 */
export function toSundayDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + 6);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
