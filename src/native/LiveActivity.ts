/**
 * LiveActivity.ts — thin JS facade around the native LiveActivityManager
 * module on iOS. Calls are safe no-ops on Android / iOS <16.2 / when the
 * native module is missing (e.g. running in Expo Go without a custom
 * dev client).
 *
 * Typical flow:
 *   await LiveActivity.start({ ...identity, ...state })
 *   await LiveActivity.update({ ...state })   // on pause / resume / borrow
 *   await LiveActivity.end()                  // when timer completes / cancels
 *
 * The countdown itself does NOT need per-second updates — the Widget
 * uses Text(timerInterval:) which the system ticks on its own. We only
 * push updates when remainingSeconds changes due to pause/borrow.
 */

import { NativeModules, Platform } from 'react-native';

interface StartParams {
  title: string;
  categoryName: string;
  categoryColorHex: string;
  categoryIconName: string;
  totalSeconds: number;
  remainingSeconds: number;
  borrowedSeconds: number;
  isPaused: boolean;
}

interface UpdateParams {
  remainingSeconds: number;
  borrowedSeconds: number;
  isPaused: boolean;
}

type NativeShape = {
  startTimerActivity: (p: StartParams) => Promise<string | null>;
  updateTimerActivity: (p: UpdateParams) => Promise<void>;
  endTimerActivity: () => Promise<void>;
  areActivitiesEnabled: () => Promise<boolean>;
};

const native = (NativeModules as { LiveActivityManager?: NativeShape })
  .LiveActivityManager;

const isAvailable = Platform.OS === 'ios' && !!native;

// One-time diagnostic so the user sees immediately whether the native
// LiveActivityManager has been compiled into the app.
if (__DEV__) {
  if (Platform.OS !== 'ios') {
    console.log('[LiveActivity] Skipping — not iOS.');
  } else if (!native) {
    console.warn(
      '[LiveActivity] ❌ Native module NOT linked. ' +
      'The Swift LiveActivityManager.swift / .m files are not part of the CHRONOSCAPE target in Xcode. ' +
      'Open ios/CHRONOSCAPE.xcworkspace and add them, then rebuild.'
    );
  } else {
    console.log('[LiveActivity] ✅ Native module linked.');
  }
}

const warn = (op: string, err: unknown) => {
  if (__DEV__) {
    console.warn(`[LiveActivity] ${op} failed:`, err);
  }
};

const info = (op: string, detail?: unknown) => {
  if (__DEV__) {
    console.log(`[LiveActivity] ${op}`, detail ?? '');
  }
};

export const LiveActivity = {
  /** True iff the native module is linked and we're on iOS. */
  isAvailable,

  /** Did the user toggle Live Activities on for this app in Settings? */
  async areEnabled(): Promise<boolean> {
    if (!isAvailable) return false;
    try { return await native!.areActivitiesEnabled(); }
    catch (e) { warn('areEnabled', e); return false; }
  },

  /**
   * Start a Live Activity for a running timer. Returns the native
   * activity id on success, null otherwise (does not throw).
   */
  async start(params: StartParams): Promise<string | null> {
    if (!isAvailable) {
      warn('start', 'native module not linked — call ignored');
      return null;
    }
    info('start →', params);
    try {
      const id = await native!.startTimerActivity(params);
      info('start ✅ activity id', id);
      return id;
    } catch (e) { warn('start', e); return null; }
  },

  /**
   * Push a state change. Call this on pause, resume, borrow, and on
   * any event that changes remainingSeconds outside of the natural
   * countdown (cancel, complete, etc.).
   */
  async update(params: UpdateParams): Promise<void> {
    if (!isAvailable) return;
    try { await native!.updateTimerActivity(params); }
    catch (e) { warn('update', e); }
  },

  /** End the activity. Safe to call when nothing is active. */
  async end(): Promise<void> {
    if (!isAvailable) return;
    try { await native!.endTimerActivity(); }
    catch (e) { warn('end', e); }
  },
};
