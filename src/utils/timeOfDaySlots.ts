import AsyncStorage from '@react-native-async-storage/async-storage';

// NOTE: This module owns the *timeline background* slot system only.
// No task/stage data should store time-slot or color metadata.

export type TimeOfDaySlotKey = 'morning' | 'noon' | 'evening' | 'night';

export interface TimeOfDaySlotConfig {
  key: TimeOfDaySlotKey;
  label: string;
  /**
   * Minutes since midnight, inclusive. Range: 0..1439
   */
  startMinute: number;
  /**
   * Minutes since midnight, exclusive. Range: 0..1440
   * If endMinute < startMinute, the slot crosses midnight.
   */
  endMinute: number;
  /**
   * Hex color used for the timeline background segments.
   * Example: "#102A43"
   */
  colorHex: string;
}

export type TimeOfDaySlotConfigList = TimeOfDaySlotConfig[];

export const TIME_OF_DAY_SLOTS_KEY = '@timer_app_time_of_day_slots_v1';

export type WeekdayKey =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

export const WEEKDAY_ORDER: WeekdayKey[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

export const WEEKDAY_LABEL: Record<WeekdayKey, string> = {
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun',
};

export const DEFAULT_TIME_OF_DAY_SLOTS: TimeOfDaySlotConfigList = [
  { key: 'morning', label: 'Morning', startMinute: 6 * 60, endMinute: 12 * 60, colorHex: '#102A43' },
  { key: 'noon', label: 'Noon', startMinute: 12 * 60, endMinute: 17 * 60, colorHex: '#243B53' },
  { key: 'evening', label: 'Evening', startMinute: 17 * 60, endMinute: 20 * 60, colorHex: '#334E68' },
  // Crosses midnight: 20:00 -> 06:00
  { key: 'night', label: 'Night', startMinute: 20 * 60, endMinute: 6 * 60, colorHex: '#0B1520' },
];

export interface TimeOfDayBackgroundConfig {
  byDay: Record<WeekdayKey, TimeOfDaySlotConfigList>;
}

export const DEFAULT_TIME_OF_DAY_BACKGROUND_CONFIG: TimeOfDayBackgroundConfig = {
  byDay: {
    monday: DEFAULT_TIME_OF_DAY_SLOTS,
    tuesday: DEFAULT_TIME_OF_DAY_SLOTS,
    wednesday: DEFAULT_TIME_OF_DAY_SLOTS,
    thursday: DEFAULT_TIME_OF_DAY_SLOTS,
    friday: DEFAULT_TIME_OF_DAY_SLOTS,
    saturday: DEFAULT_TIME_OF_DAY_SLOTS,
    sunday: DEFAULT_TIME_OF_DAY_SLOTS,
  },
};

const clampMinute = (m: number) => {
  if (!Number.isFinite(m)) return 0;
  // allow 1440 only for endMinute
  return Math.max(0, Math.min(1440, Math.floor(m)));
};

const isHexColor = (s: string) => /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test(s);

export const normalizeTimeOfDaySlotConfig = (input: TimeOfDaySlotConfigList): TimeOfDaySlotConfigList => {
  const out: TimeOfDaySlotConfigList = [];
  const seen = new Set<TimeOfDaySlotKey>();

  for (const slot of input || []) {
    if (!slot || !slot.key || seen.has(slot.key)) continue;
    if (!['morning', 'noon', 'evening', 'night'].includes(slot.key)) continue;
    if (!slot.label || typeof slot.label !== 'string') continue;
    if (!slot.colorHex || typeof slot.colorHex !== 'string' || !isHexColor(slot.colorHex)) continue;

    const startMinute = clampMinute(slot.startMinute);
    let endMinute = clampMinute(slot.endMinute);
    // endMinute can be 1440, but startMinute should not.
    if (endMinute === 0 && slot.endMinute === 1440) endMinute = 1440;

    // Keep config even if start===end (renders nothing, but avoids crashing).
    out.push({
      key: slot.key,
      label: slot.label,
      startMinute: Math.min(startMinute, 1439),
      endMinute,
      colorHex: slot.colorHex,
    });
    seen.add(slot.key);
  }

  // Ensure stable order
  const order: TimeOfDaySlotKey[] = ['morning', 'noon', 'evening', 'night'];
  out.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));

  // If invalid/missing, fall back to defaults (but never hardcode in UI components)
  if (out.length !== 4) return DEFAULT_TIME_OF_DAY_SLOTS;
  return out;
};

export const normalizeTimeOfDayBackgroundConfig = (input: any): TimeOfDayBackgroundConfig => {
  // Backward compatibility: if stored value is an array, apply to all days
  if (Array.isArray(input)) {
    const normalizedSlots = normalizeTimeOfDaySlotConfig(input as TimeOfDaySlotConfigList);
    const byDay = WEEKDAY_ORDER.reduce((acc, day) => {
      acc[day] = normalizedSlots;
      return acc;
    }, {} as Record<WeekdayKey, TimeOfDaySlotConfigList>);
    return { byDay };
  }

  const byDay: Record<WeekdayKey, TimeOfDaySlotConfigList> = { ...DEFAULT_TIME_OF_DAY_BACKGROUND_CONFIG.byDay };
  const rawByDay = input?.byDay;
  if (rawByDay && typeof rawByDay === 'object') {
    for (const day of WEEKDAY_ORDER) {
      byDay[day] = normalizeTimeOfDaySlotConfig(rawByDay[day]);
    }
  }
  return { byDay };
};

export const weekdayKeyFromDate = (date: Date): WeekdayKey => {
  // JS: 0=Sun ... 6=Sat
  const d = date.getDay();
  switch (d) {
    case 1: return 'monday';
    case 2: return 'tuesday';
    case 3: return 'wednesday';
    case 4: return 'thursday';
    case 5: return 'friday';
    case 6: return 'saturday';
    default: return 'sunday';
  }
};

export const slotsForDate = (config: TimeOfDayBackgroundConfig, date: Date): TimeOfDaySlotConfigList => {
  const day = weekdayKeyFromDate(date);
  return normalizeTimeOfDaySlotConfig(config?.byDay?.[day] ?? DEFAULT_TIME_OF_DAY_SLOTS);
};

/**
 * PURE resolver logic (no storage, no UI state).
 * Accepts minutes since midnight and returns matching slot.
 */
export const resolveTimeOfDaySlot = (
  minutesSinceMidnight: number,
  config: TimeOfDaySlotConfigList
): TimeOfDaySlotConfig => {
  const m = ((Math.floor(minutesSinceMidnight) % 1440) + 1440) % 1440;
  const normalized = normalizeTimeOfDaySlotConfig(config);

  for (const slot of normalized) {
    const start = slot.startMinute;
    const end = slot.endMinute;

    // Normal slot (no midnight crossing)
    if (start < end) {
      if (m >= start && m < end) return slot;
      continue;
    }

    // Cross-midnight slot (e.g. 20:00 -> 06:00)
    // Covers [start..1440) U [0..end)
    if (start > end) {
      if (m >= start || m < end) return slot;
      continue;
    }
  }

  // Fallback: if config is weird, default to 'night'
  return normalized.find(s => s.key === 'night') || DEFAULT_TIME_OF_DAY_SLOTS[3];
};

export const loadOrSeedTimeOfDayBackgroundConfig = async (): Promise<TimeOfDayBackgroundConfig> => {
  try {
    const stored = await AsyncStorage.getItem(TIME_OF_DAY_SLOTS_KEY);
    if (!stored) {
      await AsyncStorage.setItem(TIME_OF_DAY_SLOTS_KEY, JSON.stringify(DEFAULT_TIME_OF_DAY_BACKGROUND_CONFIG));
      return DEFAULT_TIME_OF_DAY_BACKGROUND_CONFIG;
    }
    const parsed = JSON.parse(stored);
    const normalized = normalizeTimeOfDayBackgroundConfig(parsed);
    // If normalization changed shape, persist once
    if (JSON.stringify(normalized) !== JSON.stringify(parsed)) {
      await AsyncStorage.setItem(TIME_OF_DAY_SLOTS_KEY, JSON.stringify(normalized));
    }
    return normalized;
  } catch (e) {
    console.error('Failed to load time-of-day slot config:', e);
    return DEFAULT_TIME_OF_DAY_BACKGROUND_CONFIG;
  }
};

export const saveTimeOfDayBackgroundConfig = async (config: TimeOfDayBackgroundConfig): Promise<void> => {
  try {
    const normalized = normalizeTimeOfDayBackgroundConfig(config);
    await AsyncStorage.setItem(TIME_OF_DAY_SLOTS_KEY, JSON.stringify(normalized));
  } catch (e) {
    console.error('Failed to save time-of-day slot config:', e);
  }
};

// Backward-compatible exports (legacy single-config API)
export const loadOrSeedTimeOfDaySlots = async (): Promise<TimeOfDaySlotConfigList> => {
  const cfg = await loadOrSeedTimeOfDayBackgroundConfig();
  // Default to Monday for legacy callers
  return cfg.byDay.monday;
};

export const saveTimeOfDaySlots = async (slots: TimeOfDaySlotConfigList): Promise<void> => {
  const normalizedSlots = normalizeTimeOfDaySlotConfig(slots);
  const byDay = WEEKDAY_ORDER.reduce((acc, day) => {
    acc[day] = normalizedSlots;
    return acc;
  }, {} as Record<WeekdayKey, TimeOfDaySlotConfigList>);
  await saveTimeOfDayBackgroundConfig({ byDay });
};

/**
 * Helper for UI-only positioning math (still pure).
 * Returns segment(s) in timeline coordinates for a 0..1440 day timeline.
 *
 * - leftPx = (minute / minutesPerCell) * cellWidth
 * - widthPx = (durationMinutes / minutesPerCell) * cellWidth
 *
 * When dailyStartMinutes is provided, the timeline runs from daily start (e.g. 06:00)
 * to the next day's daily start. Slot times (startMinute/endMinute in midnight) are
 * converted to this "display" space: displayM = (midnightM - dailyStartMinutes + 1440) % 1440.
 */
export const buildTimeOfDayBackgroundSegments = (
  config: TimeOfDaySlotConfigList,
  minutesPerCell: number,
  cellWidth: number,
  dayMinutes = 1440,
  dailyStartMinutes?: number
) => {
  const normalized = normalizeTimeOfDaySlotConfig(config);
  const mpc = Math.max(1, minutesPerCell);
  const cw = Math.max(1, cellWidth);

  const toLeft = (minute: number) => (minute / mpc) * cw;
  const toWidth = (duration: number) => (duration / mpc) * cw;

  const toDisplay = (midnightM: number) => ((midnightM - (dailyStartMinutes ?? 0) + 1440) % 1440);

  const segments: Array<{ key: TimeOfDaySlotKey; label: string; colorHex: string; left: number; width: number }> = [];

  for (const slot of normalized) {
    let start: number;
    let end: number;

    if (dailyStartMinutes != null) {
      // Convert from midnight to display (0 = daily start, 1440 = next daily start)
      start = toDisplay(slot.startMinute);
      // endMinute can be 1440; (1440 - d + 1440) % 1440 gives right edge in display
      end = toDisplay(slot.endMinute === 1440 ? 1440 : slot.endMinute);
    } else {
      start = Math.max(0, Math.min(dayMinutes, slot.startMinute));
      end = Math.max(0, Math.min(dayMinutes, slot.endMinute));
    }

    if (start < end) {
      segments.push({
        key: slot.key,
        label: slot.label,
        colorHex: slot.colorHex,
        left: toLeft(start),
        width: toWidth(end - start),
      });
      continue;
    }

    if (start > end) {
      // Cross boundary: [0..end) and [start..1440)
      if (end > 0) {
        segments.push({
          key: slot.key,
          label: slot.label,
          colorHex: slot.colorHex,
          left: toLeft(0),
          width: toWidth(end),
        });
      }
      if (start < 1440) {
        segments.push({
          key: slot.key,
          label: slot.label,
          colorHex: slot.colorHex,
          left: toLeft(start),
          width: toWidth(1440 - start),
        });
      }
      continue;
    }
  }

  return segments;
};

