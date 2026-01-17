import React, { useState, useEffect, useRef } from 'react';
import { LogBox, AppState, AppStateStatus } from 'react-native';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import {
  PlusJakartaSans_300Light,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  PlusJakartaSans_200ExtraLight,
} from '@expo-google-fonts/plus-jakarta-sans';
import { Inter_900Black } from '@expo-google-fonts/inter';

import EmptyState from './src/screens/EmptyState';
import TimerList from './src/screens/TimerList';
import ActiveTimer from './src/screens/ActiveTimer';
import TaskComplete from './src/screens/TaskComplete';
import SettingsScreen from './src/screens/SettingsScreen';
import AddTimerModal from './src/components/AddTimerModal';
import DeleteModal from './src/components/DeleteModal';
import { Timer, Category, DEFAULT_CATEGORIES, CATEGORIES_KEY } from './src/constants/data';
import { Alert } from 'react-native';
import { loadTimers, saveTimers } from './src/utils/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  requestNotificationPermissions,
  scheduleTimerNotification,
  cancelTimerNotification,
  calculateRemainingTime,
} from './src/utils/backgroundTimer';

const LANDSCAPE_COLOR_KEY = '@timer_app_landscape_color';
const FILLER_COLOR_KEY = '@timer_filler_color';
const SLIDER_BUTTON_COLOR_KEY = '@timer_slider_button_color';
const TEXT_COLOR_KEY = '@timer_text_color';
const PRESET_INDEX_KEY = '@timer_active_preset_index';
const COMPLETION_SOUND_KEY = '@timer_completion_sound';
const SOUND_REPETITION_KEY = '@timer_sound_repetition';
const ACTIVE_TIMER_ID_KEY = '@timer_active_id';
const ENABLE_FUTURE_TIMERS_KEY = '@timer_enable_future';
const ENABLE_PAST_TIMERS_KEY = '@timer_enable_past';

export const LANDSCAPE_PRESETS = [
  {
    name: 'Deep Sea',
    filler: '#00E5FF',
    slider: '#00E5FF',
    text: '#FFFFFF'
  },
  {
    name: 'Lava Glow',
    filler: '#FF9500',
    slider: '#FF9500',
    text: '#FFFFFF'
  },
  {
    name: 'Neon Forest',
    filler: '#34C759',
    slider: '#34C759',
    text: '#FFFFFF'
  },
];

LogBox.ignoreLogs(['SafeAreaView has been deprecated']);

type Screen = 'list' | 'active' | 'complete' | 'settings';

// Helper to convert HH:MM:SS or MM:SS to total seconds
const timeToSeconds = (time: string): number => {
  const parts = time.split(':').map(Number);
  if (parts.length === 3) {
    // HH:MM:SS format
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  // MM:SS format (backwards compatibility)
  return parts[0] * 60 + parts[1];
};

// Helper to convert seconds to HH:MM:SS format
const secondsToTime = (totalSeconds: number): string => {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

export default function App() {
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_200ExtraLight,
    PlusJakartaSans_300Light,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
    Inter_900Black,
  });

  const [timers, setTimers] = useState<Timer[]>([]);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [selectedTimer, setSelectedTimer] = useState<Timer | null>(null);
  const [activeTimer, setActiveTimer] = useState<Timer | null>(null);
  const [currentScreen, setCurrentScreen] = useState<Screen>('list');
  const [completedAt, setCompletedAt] = useState('');
  const [completedStartTime, setCompletedStartTime] = useState('');
  const [completedBorrowedTime, setCompletedBorrowedTime] = useState(0);
  const [shouldPlayCompletionSound, setShouldPlayCompletionSound] = useState(true);
  const [fillerColor, setFillerColor] = useState(LANDSCAPE_PRESETS[0].filler);
  const [sliderButtonColor, setSliderButtonColor] = useState(LANDSCAPE_PRESETS[0].slider);
  const [timerTextColor, setTimerTextColor] = useState(LANDSCAPE_PRESETS[0].text);
  const [activePresetIndex, setActivePresetIndex] = useState(0);
  const [selectedSound, setSelectedSound] = useState(0);
  const [soundRepetition, setSoundRepetition] = useState(1);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [categories, setCategories] = useState<Category[]>(DEFAULT_CATEGORIES);
  const [timerToEdit, setTimerToEdit] = useState<Timer | null>(null);
  const [enablePastTimers, setEnablePastTimers] = useState(true);

  const formatDate = (date: Date) => {
    return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
  };

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    initializeTimers();
    loadAllColors();
    requestNotificationPermissions();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // AppState listener - recalculate timer when returning from background
  const activeTimerRef = useRef<Timer | null>(activeTimer);
  useEffect(() => {
    activeTimerRef.current = activeTimer;
  }, [activeTimer]);

  const syncTimersWithElapsedTime = (prevTimers: Timer[]) => {
    let activeTimerFinished = false;

    const updated = prevTimers.map(timer => {
      if (timer.status === 'Running' && timer.startedTimestamp && timer.remainingSecondsAtStart !== undefined) {
        const elapsedMs = Date.now() - timer.startedTimestamp;
        const elapsedSeconds = Math.floor(elapsedMs / 1000);
        const remainingSeconds = timer.remainingSecondsAtStart - elapsedSeconds;

        if (remainingSeconds <= 0) {
          const now = new Date();
          const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
          setCompletedAt(timeStr);
          setCompletedBorrowedTime(timer.borrowedTime || 0);
          setCompletedStartTime(timer.startTime || '--:--');

          if (activeTimerRef.current && activeTimerRef.current.id === timer.id) {
            activeTimerFinished = true;
          }

          return {
            ...timer,
            status: 'Completed' as const,
            time: '00:00:00',
            completedPercentage: 100,
            startedTimestamp: undefined,
            remainingSecondsAtStart: undefined,
            notificationId: undefined,
            isAcknowledged: false,
            updatedAt: new Date().toISOString(),
          };
        }

        return {
          ...timer,
          time: secondsToTime(remainingSeconds),
          startedTimestamp: Date.now(),
          remainingSecondsAtStart: remainingSeconds,
        };
      }
      return timer;
    });

    if (activeTimerFinished) {
      setShouldPlayCompletionSound(true);
      setCurrentScreen('complete');
    }

    return updated;
  };

  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        // App has come to the foreground - recalculate running timers
        setTimers(prevTimers => {
          const updated = syncTimersWithElapsedTime(prevTimers);
          saveTimers(updated);
          return updated;
        });
      }

      appState.current = nextAppState;
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, []);

  // Handle notification tap
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      if (data && data.timerId) {
        const timer = timers.find(t => t.id === data.timerId);
        if (timer) {
          setActiveTimer(timer);
          if (timer.status === 'Completed') {
            setShouldPlayCompletionSound(false); // User tapped notification, manual navigation
            setCurrentScreen('complete');
          } else {
            setCurrentScreen('active');
          }
        }
      }
    });

    return () => subscription.remove();
  }, [timers]);

  const loadAllColors = async () => {
    try {
      const [filler, sliderBtn, text, presetIndex, sound, repetition] = await Promise.all([
        AsyncStorage.getItem(FILLER_COLOR_KEY),
        AsyncStorage.getItem(SLIDER_BUTTON_COLOR_KEY),
        AsyncStorage.getItem(TEXT_COLOR_KEY),
        AsyncStorage.getItem(PRESET_INDEX_KEY),
        AsyncStorage.getItem(COMPLETION_SOUND_KEY),
        AsyncStorage.getItem(SOUND_REPETITION_KEY),
      ]);
      if (filler) setFillerColor(filler);
      if (sliderBtn) setSliderButtonColor(sliderBtn);
      if (text) setTimerTextColor(text);
      if (presetIndex) setActivePresetIndex(parseInt(presetIndex, 10));
      if (sound) setSelectedSound(parseInt(sound, 10));
      if (repetition) setSoundRepetition(parseInt(repetition, 10));

      const savedPast = await AsyncStorage.getItem(ENABLE_PAST_TIMERS_KEY);
      if (savedPast !== null) setEnablePastTimers(savedPast === 'true');

      const storedCats = await AsyncStorage.getItem(CATEGORIES_KEY);
      if (storedCats) {
        setCategories(JSON.parse(storedCats));
      }
    } catch (e) {
      console.error('Failed to load color preferences:', e);
    }
  };

  // Timer countdown effect
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    const runningTimer = timers.find(t => t.status === 'Running');

    if (runningTimer) {
      intervalRef.current = setInterval(() => {
        setTimers(prevTimers => {
          return prevTimers.map(timer => {
            if (timer.status === 'Running') {
              const currentSeconds = timeToSeconds(timer.time);

              if (currentSeconds <= 1) {
                // Timer completed naturally!
                const now = new Date();
                const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
                setCompletedAt(timeStr);
                setCompletedBorrowedTime(timer.borrowedTime || 0);
                setCompletedStartTime(timer.startTime || '--:--');
                return { ...timer, status: 'Completed' as const, time: '00:00:00', completedPercentage: 100, isAcknowledged: false };
              }

              const newTime = secondsToTime(currentSeconds - 1);
              return { ...timer, time: newTime };
            }
            return timer;
          });
        });
      }, 1000);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [timers.find(t => t.status === 'Running')?.id]);

  // Auto-navigate to TaskComplete when active timer finishes
  useEffect(() => {
    if (currentScreen === 'active' && activeTimer) {
      const currentTimer = timers.find(t => t.id === activeTimer.id);
      if (currentTimer?.status === 'Completed') {
        // Timer just completed naturally, navigate to complete screen with sound
        setShouldPlayCompletionSound(true);
        setCurrentScreen('complete');
      }
    }
  }, [timers, activeTimer, currentScreen]);

  const handleAcknowledgeCompletion = async (timerId: number) => {
    setTimers(prevTimers => {
      const updatedTimers = prevTimers.map(t =>
        t.id === timerId ? { ...t, isAcknowledged: true, updatedAt: new Date().toISOString() } : t
      );
      saveTimers(updatedTimers);
      return updatedTimers;
    });
  };

  const updateActiveTimer = async (timer: Timer | null) => {
    setActiveTimer(timer);
    if (timer) {
      await AsyncStorage.setItem(ACTIVE_TIMER_ID_KEY, timer.id.toString());
      // When opening an active timer, ensure we view its date
      if (timer.forDate) {
        setSelectedDate(new Date(timer.forDate));
      }
    } else {
      await AsyncStorage.removeItem(ACTIVE_TIMER_ID_KEY);
    }
  };

  const initializeTimers = async () => {
    const stored = await loadTimers();
    // Cold start - check if any timer should have completed while app was closed
    const synced = syncTimersWithElapsedTime(stored);

    // Restore active timer if it was saved
    const activeIdStr = await AsyncStorage.getItem(ACTIVE_TIMER_ID_KEY);
    if (activeIdStr) {
      const activeId = parseInt(activeIdStr, 10);
      const restoredActive = synced.find(t => t.id === activeId);
      if (restoredActive) {
        setActiveTimer(restoredActive);
        if (restoredActive.status === 'Completed' && restoredActive.isAcknowledged === false) {
          // If the previously active timer is now finished but not acknowledged, show completion screen
          setShouldPlayCompletionSound(true);
          setCurrentScreen('complete');
        }
      }
    }

    setTimers(synced);
    if (synced !== stored) {
      await saveTimers(synced);
    }
  };

  const handleAddTimer = async (name: string, hours: number, minutes: number, seconds: number, date: string, categoryId?: string) => {
    const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    const now = new Date().toISOString();
    const newTimer: Timer = {
      id: Date.now(),
      title: name,
      time: timeStr,
      total: timeStr,
      status: 'Upcoming',
      tier: 2,
      createdAt: now,
      updatedAt: now,
      borrowedTimeList: [],
      forDate: date,
      categoryId,
    };
    const newTimers = [...timers, newTimer];
    setTimers(newTimers);
    await saveTimers(newTimers);
    setAddModalVisible(false);
  };

  const handleUpdateTimer = async (timerId: number, name: string, hours: number, minutes: number, seconds: number, date: string, categoryId?: string) => {
    const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    const now = new Date().toISOString();

    const updatedTimers = timers.map(t => {
      if (t.id === timerId) {
        // If duration changed, we should probably reset state to Upcoming
        const durationChanged = t.total !== timeStr;
        return {
          ...t,
          title: name,
          time: durationChanged ? timeStr : t.time,
          total: timeStr,
          status: durationChanged ? 'Upcoming' : t.status,
          forDate: date,
          categoryId: categoryId,
          updatedAt: now,
          // Reset session info if duration changed
          ...(durationChanged && {
            borrowedTime: 0,
            borrowedTimeList: [],
            completedPercentage: undefined,
            savedTime: undefined,
            startTime: undefined,
            startedTimestamp: undefined,
            remainingSecondsAtStart: undefined,
            notificationId: undefined,
          })
        } as Timer;
      }
      return t;
    });

    setTimers(updatedTimers);
    await saveTimers(updatedTimers);
    setAddModalVisible(false);
    setTimerToEdit(null);
  };

  const handleLongPressTimer = (timer: Timer) => {
    setSelectedTimer(timer);
    setDeleteModalVisible(true);
  };

  const confirmDelete = async () => {
    if (selectedTimer) {
      const newTimers = timers.filter(t => t.id !== selectedTimer.id);
      setTimers(newTimers);
      await saveTimers(newTimers);

      // If we deleted the active timer, clear it
      if (activeTimer && activeTimer.id === selectedTimer.id) {
        await updateActiveTimer(null);
        setCurrentScreen('list');
      }
    }
    setDeleteModalVisible(false);
    setSelectedTimer(null);
  };

  // Reset timer to initial/upcoming state
  const handleResetTimer = async () => {
    if (selectedTimer) {
      const updatedTimers = timers.map(t => {
        if (t.id === selectedTimer.id) {
          return {
            ...t,
            time: t.total,
            status: 'Upcoming',
            borrowedTime: 0,
            borrowedTimeList: [],
            completedPercentage: undefined,
            savedTime: undefined,
            startTime: undefined,
            updatedAt: new Date().toISOString(),
          } as Timer;
        }
        return t;
      });
      setTimers(updatedTimers);
      await saveTimers(updatedTimers);
    }
    setDeleteModalVisible(false);
    setSelectedTimer(null);
  };

  // Play/Pause a timer - only one can run at a time
  const handlePlayPause = async (timerToToggle: Timer) => {
    // Find the latest version of this timer from state to ensure status is fresh
    const currentTimer = timers.find(t => t.id === timerToToggle.id);
    if (!currentTimer || currentTimer.status === 'Completed') return;

    const isCurrentlyRunning = currentTimer.status === 'Running';
    const currentSeconds = timeToSeconds(currentTimer.time);

    let newNotificationId: string | null = null;

    // Schedule or cancel notification based on new state
    if (isCurrentlyRunning) {
      // Pausing - cancel notification
      await cancelTimerNotification(currentTimer.notificationId);
    } else {
      // Starting - schedule notification for timer completion
      newNotificationId = await scheduleTimerNotification(
        currentTimer.id,
        currentSeconds,
        currentTimer.title
      );

      // Also cancel any running timer's notification
      const runningTimer = timers.find(t => t.status === 'Running' && t.id !== currentTimer.id);
      if (runningTimer?.notificationId) {
        await cancelTimerNotification(runningTimer.notificationId);
      }
    }

    const updatedTimers = timers.map(t => {
      if (t.id === timerToToggle.id) {
        // Toggle: Running → Paused, anything else → Running
        const isRestarting = t.status !== 'Running' && t.status !== 'Paused';
        const newStatus = isCurrentlyRunning ? 'Paused' : 'Running';

        let startInfo: Partial<Timer> = {};
        if (isRestarting && !t.startTime) {
          startInfo = { startTime: new Date().toISOString() };
        }

        // Track timestamp for background time calculation
        if (!isCurrentlyRunning) {
          startInfo.startedTimestamp = Date.now();
          startInfo.remainingSecondsAtStart = timeToSeconds(t.time);
          startInfo.notificationId = newNotificationId || undefined;
        } else {
          startInfo.startedTimestamp = undefined;
          startInfo.remainingSecondsAtStart = undefined;
          startInfo.notificationId = undefined;
        }

        return { ...t, status: newStatus, ...startInfo } as Timer;
      } else if (t.status === 'Running') {
        // Pause any other running timer
        return { ...t, status: 'Paused', startedTimestamp: undefined, remainingSecondsAtStart: undefined, notificationId: undefined } as Timer;
      }
      return t;
    });

    setTimers(updatedTimers);
    await saveTimers(updatedTimers);

    // Persist active timer if we just started one
    if (!isCurrentlyRunning) {
      const startedTimer = updatedTimers.find(t => t.id === timerToToggle.id);
      if (startedTimer) {
        await updateActiveTimer(startedTimer);
      }
    }
  };

  // Open timer screen when clicking on a card
  const handleStartTimer = async (timer: Timer) => {
    await updateActiveTimer(timer);

    if (timer.status === 'Completed') {
      // If completed, go directly to TaskComplete screen WITHOUT sound
      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      setCompletedAt(timeStr);
      setCompletedStartTime(timer.startTime || '--:--');
      setCompletedBorrowedTime(timer.borrowedTime || 0);
      setShouldPlayCompletionSound(false); // Don't play sound for already-completed timers
      setCurrentScreen('complete');
    } else if (timer.status === 'Paused') {
      // If paused, go to ActiveTimer but DON'T auto-start
      setCurrentScreen('active');
    } else {
      // For Upcoming timers, start them and go to ActiveTimer
      const currentSeconds = timeToSeconds(timer.time);

      // Schedule notification for timer completion
      const notificationId = await scheduleTimerNotification(
        timer.id,
        currentSeconds,
        timer.title
      );

      // Cancel any other running timer's notification
      const runningTimer = timers.find(t => t.status === 'Running');
      if (runningTimer?.notificationId) {
        await cancelTimerNotification(runningTimer.notificationId);
      }

      const updatedTimers = timers.map(t => {
        if (t.id === timer.id) {
          const startTime = new Date().toISOString();
          return {
            ...t,
            status: 'Running',
            startTime,
            startedTimestamp: Date.now(),
            remainingSecondsAtStart: currentSeconds,
            notificationId: notificationId || undefined,
          } as Timer;
        } else if (t.status === 'Running') {
          return { ...t, status: 'Paused', startedTimestamp: undefined, remainingSecondsAtStart: undefined, notificationId: undefined } as Timer;
        }
        return t;
      });
      setTimers(updatedTimers);
      await saveTimers(updatedTimers);
      setCurrentScreen('active');
    }
  };

  // Handle pause from active timer screen
  const handlePause = async () => {
    const runningTimer = timers.find(t => t.status === 'Running');
    if (runningTimer?.notificationId) {
      await cancelTimerNotification(runningTimer.notificationId);
    }

    const updatedTimers = timers.map(t => {
      if (t.status === 'Running') {
        return { ...t, status: 'Paused', startedTimestamp: undefined, remainingSecondsAtStart: undefined, notificationId: undefined } as Timer;
      }
      return t;
    });
    setTimers(updatedTimers);
    await saveTimers(updatedTimers);
  };

  // Handle cancel from active timer screen
  const handleCancel = async () => {
    setActiveTimer(null);
    setCurrentScreen('list');
  };

  // Handle complete from active timer screen
  const handleComplete = async () => {
    // Cancel the scheduled notification since we're completing early
    const currentTimer = activeTimer ? timers.find(t => t.id === activeTimer.id) : null;
    if (currentTimer?.notificationId) {
      await cancelTimerNotification(currentTimer.notificationId);
    }

    const now = new Date();
    const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    setCompletedAt(time);

    // Calculate completion percentage at the time of force-complete
    let completedPct = 100; // Default to 100% if naturally completed

    if (currentTimer && activeTimer) {
      const currentRemainingSeconds = timeToSeconds(currentTimer.time);
      const originalTotalSeconds = timeToSeconds(activeTimer.total);
      const borrowedSeconds = currentTimer.borrowedTime || 0;
      const totalAllocatedSeconds = originalTotalSeconds + borrowedSeconds;

      if (totalAllocatedSeconds > 0) {
        // Calculate how much was completed (elapsed / totalAllocated)
        const elapsed = totalAllocatedSeconds - currentRemainingSeconds;
        completedPct = Math.round((elapsed / totalAllocatedSeconds) * 100);
      }

      // Store the remaining time as "saved"
      const savedSecs = currentRemainingSeconds;

      // Update global state for success screen
      setCompletedBorrowedTime(borrowedSeconds);
      setCompletedStartTime(currentTimer.startTime || '--:--');

      // Mark timer as completed
      const updatedTimers = timers.map(t => {
        if (activeTimer && t.id === activeTimer.id) {
          return {
            ...t,
            status: 'Completed',
            time: '00:00:00',
            completedPercentage: completedPct,
            savedTime: savedSecs,
            startedTimestamp: undefined,
            notificationId: undefined,
            isAcknowledged: true, // Already on complete screen, so acknowledged
          } as Timer;
        }
        return t;
      });
      setTimers(updatedTimers);
      saveTimers(updatedTimers);
    }

    setCurrentScreen('complete');
  };

  // Handle restart from complete screen
  const handleRestart = async () => {
    if (activeTimer) {
      const totalSeconds = timeToSeconds(activeTimer.total);

      // Schedule notification for when timer completes
      const notificationId = await scheduleTimerNotification(
        activeTimer.id,
        totalSeconds,
        activeTimer.title
      );

      const updatedTimers = timers.map(t => {
        if (t.id === activeTimer.id) {
          return {
            ...t,
            time: t.total,
            status: 'Running',
            borrowedTime: 0,
            completedPercentage: undefined,
            savedTime: undefined,
            notificationId: notificationId || undefined,
            startedTimestamp: Date.now(),
            remainingSecondsAtStart: totalSeconds,
            startTime: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          } as Timer;
        }
        return {
          ...t,
          status: t.status === 'Running' ? 'Paused' : t.status,
          startedTimestamp: t.status === 'Running' ? undefined : t.startedTimestamp,
          remainingSecondsAtStart: t.status === 'Running' ? undefined : t.remainingSecondsAtStart,
          notificationId: t.status === 'Running' ? undefined : t.notificationId,
        } as Timer;
      });
      setTimers(updatedTimers);
      saveTimers(updatedTimers);
    }
    setCurrentScreen('active');
  };

  // Handle done from complete screen
  const handleDone = async () => {
    await updateActiveTimer(null);
    setCurrentScreen('list');
  };

  const handlePresetChange = async (index: number) => {
    const preset = LANDSCAPE_PRESETS[index];
    if (preset) {
      setActivePresetIndex(index);
      setFillerColor(preset.filler);
      setSliderButtonColor(preset.slider);
      setTimerTextColor(preset.text);

      try {
        await Promise.all([
          AsyncStorage.setItem(PRESET_INDEX_KEY, index.toString()),
          AsyncStorage.setItem(FILLER_COLOR_KEY, preset.filler),
          AsyncStorage.setItem(SLIDER_BUTTON_COLOR_KEY, preset.slider),
          AsyncStorage.setItem(TEXT_COLOR_KEY, preset.text),
        ]);
      } catch (e) {
        console.error('Failed to save preset colors:', e);
      }
    }
  };

  const handleBorrowTime = async (seconds: number) => {
    if (activeTimer) {
      let newNotificationId: string | undefined;

      const updatedTimers = await Promise.all(timers.map(async (t) => {
        if (t.id === activeTimer.id) {
          const currentSeconds = timeToSeconds(t.time);
          const newSeconds = currentSeconds + seconds;
          const totalBorrowed = (t.borrowedTime || 0) + seconds;

          // If timer is running, reschedule notification
          if (t.status === 'Running') {
            if (t.notificationId) {
              await cancelTimerNotification(t.notificationId);
            }
            const scheduledId = await scheduleTimerNotification(
              t.id,
              newSeconds,
              t.title
            );
            newNotificationId = scheduledId || undefined;
          }

          return {
            ...t,
            time: secondsToTime(newSeconds),
            borrowedTime: totalBorrowed,
            borrowedTimeList: [...(t.borrowedTimeList || []), seconds],
            updatedAt: new Date().toISOString(),
            notificationId: newNotificationId || t.notificationId,
            remainingSecondsAtStart: t.status === 'Running' ? newSeconds : t.remainingSecondsAtStart,
            startedTimestamp: t.status === 'Running' ? Date.now() : t.startedTimestamp,
          } as Timer;
        }
        return t;
      }));
      setTimers(updatedTimers);
      await saveTimers(updatedTimers);
    }
  };

  const handleBorrowFromComplete = async (seconds: number) => {
    if (activeTimer) {
      const scheduledId = await scheduleTimerNotification(
        activeTimer.id,
        seconds,
        activeTimer.title
      );

      const updatedTimers = timers.map(t => {
        if (t.id === activeTimer.id) {
          const totalBorrowed = (t.borrowedTime || 0) + seconds;
          return {
            ...t,
            time: secondsToTime(seconds),
            status: 'Running',
            borrowedTime: totalBorrowed,
            borrowedTimeList: [...(t.borrowedTimeList || []), seconds],
            updatedAt: new Date().toISOString(),
            completedPercentage: undefined,
            savedTime: undefined,
            startTime: new Date().toISOString(),
            notificationId: scheduledId || undefined,
            remainingSecondsAtStart: seconds,
            startedTimestamp: Date.now(),
          } as Timer;
        }
        return t;
      });
      setTimers(updatedTimers);
      await saveTimers(updatedTimers);
      setCurrentScreen('active');
    }
  };


  const togglePastTimers = async (val: boolean) => {
    setEnablePastTimers(val);
    try {
      await AsyncStorage.setItem(ENABLE_PAST_TIMERS_KEY, String(val));
    } catch (e) { console.error(e); }
  };

  // Handle borrow time from TimerList popup (when timer completes in-list)
  const handleBorrowTimeFromList = async (timer: Timer, seconds: number) => {
    const scheduledId = await scheduleTimerNotification(
      timer.id,
      seconds,
      timer.title
    );

    const updatedTimers = timers.map(t => {
      if (t.id === timer.id) {
        const totalBorrowed = (t.borrowedTime || 0) + seconds;
        return {
          ...t,
          time: secondsToTime(seconds),
          status: 'Running',
          borrowedTime: totalBorrowed,
          borrowedTimeList: [...(t.borrowedTimeList || []), seconds],
          updatedAt: new Date().toISOString(),
          completedPercentage: undefined,
          savedTime: undefined,
          startTime: new Date().toISOString(),
          notificationId: scheduledId || undefined,
          remainingSecondsAtStart: seconds,
          startedTimestamp: Date.now(),
        } as Timer;
      }
      return t;
    });
    setTimers(updatedTimers);
    await saveTimers(updatedTimers);
  };

  if (!fontsLoaded) {
    return null;
  }

  // Get current active timer data
  const currentActiveTimer = activeTimer ? timers.find(t => t.id === activeTimer.id) : null;

  // Calculate progress relative to total (original + borrowed)
  const originalTotalSecs = currentActiveTimer ? timeToSeconds(currentActiveTimer.total) : 0;
  const borrowedSecs = currentActiveTimer?.borrowedTime || 0;
  const totalAllocatedSecs = originalTotalSecs + borrowedSecs;
  const currentRemainingSecs = currentActiveTimer ? timeToSeconds(currentActiveTimer.time) : 0;

  const progress = totalAllocatedSecs > 0
    ? Math.round((1 - currentRemainingSecs / totalAllocatedSecs) * 100)
    : 0;


  const renderScreen = () => {
    switch (currentScreen) {
      case 'active':
        return (
          <ActiveTimer
            timerName={activeTimer?.title || 'Timer'}
            currentTime={currentActiveTimer?.time || activeTimer?.time || '00:00'}
            progress={Math.min(100, Math.max(0, progress))}
            endTime={completedAt || '21:09'}
            isRunning={currentActiveTimer?.status === 'Running'}
            onBack={() => setCurrentScreen('list')}
            onPlayPause={() => activeTimer && handlePlayPause(activeTimer)}
            onCancel={handleCancel}
            onComplete={handleComplete}
            onBorrowTime={(secs) => activeTimer && handleBorrowTime(secs)}
            fillerColor={fillerColor}
            sliderButtonColor={sliderButtonColor}
            timerTextColor={timerTextColor}
            categoryId={activeTimer?.categoryId}
            categories={categories}
          />
        );

      case 'settings':
        return (
          <SettingsScreen
            onBack={() => setCurrentScreen('list')}
            fillerColor={fillerColor}
            sliderButtonColor={sliderButtonColor}
            timerTextColor={timerTextColor}
            onFillerColorChange={setFillerColor}
            onSliderButtonColorChange={setSliderButtonColor}
            onTimerTextColorChange={setTimerTextColor}
            activePresetIndex={activePresetIndex}
            onPresetChange={handlePresetChange}
            selectedSound={selectedSound}
            soundRepetition={soundRepetition}
            onSoundChange={setSelectedSound}
            onRepetitionChange={setSoundRepetition}
            categories={categories}
            onCategoriesChange={setCategories}
            enablePastTimers={enablePastTimers}
            onPastTimersChange={togglePastTimers}
          />
        );

      case 'complete':
        return (
          <TaskComplete
            completedAt={completedAt}
            startTime={completedStartTime}
            borrowedTime={completedBorrowedTime}
            onRestart={handleRestart}
            onDone={handleDone}
            onBorrowTime={(secs) => handleBorrowFromComplete(secs)}
            selectedSound={selectedSound}
            soundRepetition={soundRepetition}
            shouldPlaySound={shouldPlayCompletionSound}
            onAcknowledgeCompletion={() => activeTimer && handleAcknowledgeCompletion(activeTimer.id)}
            category={activeTimer ? categories.find(c => c.id === activeTimer.categoryId) : undefined}
          />
        );

      default:
        if (timers.length === 0) {
          return <EmptyState onAddTimer={() => setAddModalVisible(true)} />;
        }
        return (
          <TimerList
            timers={timers}
            onAddTimer={() => {
              setTimerToEdit(null);
              setAddModalVisible(true);
            }}
            onLongPressTimer={handleLongPressTimer}
            onStartTimer={handleStartTimer}
            onPlayPause={handlePlayPause}
            onSettings={() => setCurrentScreen('settings')}
            onBorrowTime={handleBorrowTimeFromList}
            onAcknowledgeCompletion={handleAcknowledgeCompletion}
            selectedSound={selectedSound}
            soundRepetition={soundRepetition}
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
            categories={categories}
            enablePastTimers={enablePastTimers}
          />
        );
    }
  };

  return (
    <SafeAreaProvider>
      {renderScreen()}

      <AddTimerModal
        visible={addModalVisible}
        onCancel={() => {
          setAddModalVisible(false);
          setTimerToEdit(null);
        }}
        onAdd={handleAddTimer}
        onUpdate={handleUpdateTimer}
        initialDate={formatDate(selectedDate)}
        categories={categories}
        timerToEdit={timerToEdit}
        enablePastTimers={enablePastTimers}
      />

      <DeleteModal
        visible={deleteModalVisible}
        timer={selectedTimer}
        onCancel={() => {
          setDeleteModalVisible(false);
          setSelectedTimer(null);
        }}
        onUpdate={() => {
          if (selectedTimer) {
            setTimerToEdit(selectedTimer);
            setDeleteModalVisible(false);
            setAddModalVisible(true);
          }
        }}
        onReset={handleResetTimer}
        onDelete={confirmDelete}
      />

      <StatusBar style="light" />
    </SafeAreaProvider>
  );
}
