/**
 * Central configuration for the app's daily start time.
 * The day "rolls over" at this time (e.g. 06:00): before that, we are still in the previous logical day.
 * Used for: calendar views, Live Focus date rollover, filtering tasks/timers by date.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export const DAILY_START_STORAGE_KEY = '@timer_app_daily_start_minutes';

/** Default: 06:00 AM (360 minutes from midnight). */
export const DEFAULT_DAILY_START_MINUTES = 6 * 60;

export async function loadDailyStartMinutes(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(DAILY_START_STORAGE_KEY);
    if (raw != null) {
      const n = parseInt(raw, 10);
      if (!Number.isNaN(n) && n >= 0 && n < 24 * 60) return n;
    }
  } catch (e) {
    // ignore
  }
  return DEFAULT_DAILY_START_MINUTES;
}

export async function saveDailyStartMinutes(minutes: number): Promise<void> {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, minutes));
  await AsyncStorage.setItem(DAILY_START_STORAGE_KEY, String(clamped));
}

/**
 * Returns the logical date (YYYY-MM-DD) for a given instant, using the configured daily start.
 * Before startMin (e.g. 06:00), we are still in the previous calendar day.
 */
export function getLogicalDate(d: Date, startMin: number): string {
  const m = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
  const cal = new Date(d);
  if (m < startMin) {
    cal.setDate(cal.getDate() - 1);
  }
  const y = cal.getFullYear();
  const mo = cal.getMonth() + 1;
  const day = cal.getDate();
  return `${y}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Returns the Date for the start of the logical day that contains `d`.
 * E.g. if start is 06:00 and d is 3pm on Mar 15, returns 06:00 on Mar 15.
 */
export function getStartOfLogicalDay(d: Date, startMin: number): Date {
  const logical = getLogicalDate(d, startMin);
  const [y, mo, day] = logical.split('-').map(Number);
  const h = Math.floor(startMin / 60);
  const min = startMin % 60;
  return new Date(y, mo - 1, day, h, min, 0, 0);
}

/**
 * Returns the Date for the start of the logical day given as YYYY-MM-DD.
 * E.g. getStartOfLogicalDayFromString("2025-01-15", 360) => 06:00 on 15 Jan 2025.
 * Use when converting timer.forDate / task.forDate to a Date for selectedDate so that
 * getLogicalDate(selectedDate, dailyStartMinutes) === logicalDateStr.
 */
export function getStartOfLogicalDayFromString(logicalDate: string, startMin: number): Date {
  const [y, mo, day] = logicalDate.split('-').map(Number);
  const h = Math.floor(startMin / 60);
  const min = startMin % 60;
  return new Date(y, mo - 1, day, h, min, 0, 0);
}

export function isSameLogicalDay(a: Date, b: Date, startMin: number): boolean {
  return getLogicalDate(a, startMin) === getLogicalDate(b, startMin);
}

/**
 * Map minutes-from-midnight to a linear 6-to-6 day position [0, 1440).
 * 0 = daily start (e.g. 6am); overnight (00:00–6am) is ordered after 23:59.
 * Use for "is now past this time?" in one 6-to-6 day. For endTime >= 1440 (crosses midnight),
 * pass endTime - 1440 so the end moment in the next calendar day is compared correctly.
 */
export function toDisplayMinutes(m: number, dailyStart: number): number {
  const effective = m >= 1440 ? m - 1440 : m;
  return (effective - dailyStart + 1440) % 1440;
}

/** Format minutes-from-midnight for display, e.g. "6:00 AM", "12:30 PM". */
export function formatDailyStartForDisplay(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0 && m === 0) return '12:00 AM';
  if (h === 12 && m === 0) return '12:00 PM';
  if (h < 12) return `${h}:${String(m).padStart(2, '0')} AM`;
  return `${h - 12}:${String(m).padStart(2, '0')} PM`;
}

/**
 * Compact range for TODAY button, e.g. "6–6am" (6am today → 6am tomorrow).
 * Uses 12h format: 0→"12–12am", 6→"6–6am", 12→"12–12pm", 18→"6–6pm".
 */
export function formatDailyStartRangeCompact(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const suffix = h < 12 ? 'am' : 'pm';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  if (m === 0) return `${h12}–${h12}${suffix}`;
  const mm = String(m).padStart(2, '0');
  return `${h12}:${mm}–${h12}:${mm}${suffix}`;
}
