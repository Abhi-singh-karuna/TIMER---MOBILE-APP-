import { useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  FREE_LIMITS,
  GatedFeature,
  STORAGE_KEYS,
} from '../constants/subscriptionConfig';
import { useSubscription } from './useSubscription';

interface GateChecks {
  isPro:                     boolean;
  canAddTimer:               (currentCount: number) => boolean;
  canAddTask:                (todayCount: number)   => boolean;
  canAddGoal:                (rootCount: number)    => boolean;
  canUseRecurring:           () => boolean;
  canUseBackup:              () => boolean;
  canAddCategory:            (count: number) => boolean;
  canAddMessage:             (count: number) => boolean;
  canUseTheme:               () => boolean;
  canUseDailyStart:          () => boolean;
  canUseLeave:               () => boolean;
  canUseTimeSlots:           () => boolean;
  canAddFolder:              (count: number) => boolean;
  canAddNote:                (countInFolder: number) => boolean;
  canUseFolderLock:          () => boolean;
  canAddSubtask:             (countInTask: number) => boolean;
  canAddTaskToGoal:          (countInGoal: number) => boolean;
  canUseLiveView:            () => boolean;
  canExpandLiveDetails:      () => boolean;
  canUseLiveSubtaskActions:  () => boolean;
  canExtendTimeInProgress:   () => boolean;
  canExtendSubtaskDuration:  () => boolean;
  shouldShowGate:            (feature: GatedFeature) => Promise<boolean>;
  recordGateShown:           (feature: GatedFeature) => Promise<void>;
}

export function useFeatureGate(): GateChecks {
  const { isPro } = useSubscription();

  // Every gate is triggered by an explicit user action (tap +, tap locked
  // toggle, etc.), so we always show the modal — throttling here silently
  // ignores user intent and confuses people. Timestamps are still recorded
  // via recordGateShown for analytics, but no longer block re-display.
  const shouldShowGate = useCallback(async (_feature: GatedFeature) => true, []);

  const recordGateShown = useCallback(async (feature: GatedFeature) => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEYS.gateTimestamps);
      const map: Record<string, string> = raw ? JSON.parse(raw) : {};
      map[feature] = new Date().toISOString();
      await AsyncStorage.setItem(STORAGE_KEYS.gateTimestamps, JSON.stringify(map));
    } catch {
      // ignore — non-critical
    }
  }, []);

  return {
    isPro,
    canAddTimer:      (currentCount) => isPro || currentCount < FREE_LIMITS.timers,
    canAddTask:       (todayCount)   => isPro || todayCount   < FREE_LIMITS.tasksPerDay,
    canAddGoal:       (rootCount)    => isPro || rootCount    < FREE_LIMITS.rootGoals,
    canUseRecurring:  () => isPro,
    canUseBackup:     () => isPro,
    canAddCategory:   (count) => isPro || count < FREE_LIMITS.categories,
    canAddMessage:    (count) => isPro || count < FREE_LIMITS.quickMessages,
    canUseTheme:      () => isPro,
    canUseDailyStart: () => isPro,
    canUseLeave:      () => isPro,
    canUseTimeSlots:  () => isPro,
    canAddFolder:     (count)         => isPro || count         < FREE_LIMITS.diaryFolders,
    canAddNote:       (countInFolder) => isPro || countInFolder < FREE_LIMITS.notesPerFolder,
    canUseFolderLock: () => isPro || FREE_LIMITS.folderLockEnabled,
    canAddSubtask:            (countInTask) => isPro || countInTask < FREE_LIMITS.subtasksPerTask,
    canAddTaskToGoal:         (countInGoal) => isPro || countInGoal < FREE_LIMITS.tasksPerGoal,
    canUseLiveView:           () => isPro || FREE_LIMITS.liveViewEnabled,
    canExpandLiveDetails:     () => isPro || FREE_LIMITS.liveDetailsExpandEnabled,
    canUseLiveSubtaskActions: () => isPro || FREE_LIMITS.liveSubtaskActionsEnabled,
    canExtendTimeInProgress:  () => isPro || FREE_LIMITS.extendTimeInProgressEnabled,
    canExtendSubtaskDuration: () => isPro || FREE_LIMITS.extendSubtaskDurationEnabled,
    shouldShowGate,
    recordGateShown,
  };
}
