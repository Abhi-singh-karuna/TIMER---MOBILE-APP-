import React, { useState, useEffect, useRef } from 'react';
import { LogBox, AppState, AppStateStatus, LayoutAnimation, UIManager, Platform, Keyboard, TouchableWithoutFeedback, View, Pressable } from 'react-native';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
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

import EmptyState from './src/screens/Timer/EmptyState';
import TimerList from './src/screens/Timer/TimerList';
import TaskList from './src/screens/Timer/Task';
import ActiveTimer from './src/screens/Timer/ActivityTimer';
import TaskComplete from './src/screens/Timer/TaskComplete';
import SettingsScreen from './src/screens/Timer/Settings';
import AddTimerModal from './src/components/AddTimerModal';
import AddTaskModal from './src/components/AddTaskModal';
import DeleteModal from './src/components/DeleteModal';
import { Timer, Task, TaskStage, Category, QuickMessage, DEFAULT_CATEGORIES, DEFAULT_QUICK_MESSAGES, CATEGORIES_KEY, QUICK_MESSAGES_KEY, LANDSCAPE_PRESETS, Recurrence, SyncMode, StageStatus } from './src/constants/data';
import { Alert } from 'react-native';
import { loadTimers, saveTimers } from './src/utils/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  requestNotificationPermissions,
  scheduleTimerNotification,
  cancelTimerNotification,
  calculateRemainingTime,
} from './src/utils/backgroundTimer';
import {
  DEFAULT_TIME_OF_DAY_BACKGROUND_CONFIG,
  loadOrSeedTimeOfDayBackgroundConfig,
  saveTimeOfDayBackgroundConfig,
  slotsForDate,
  TimeOfDayBackgroundConfig,
} from './src/utils/timeOfDaySlots';
import {
  loadDailyStartMinutes,
  saveDailyStartMinutes,
  getLogicalDate,
  getStartOfLogicalDay,
  getStartOfLogicalDayFromString,
  DEFAULT_DAILY_START_MINUTES,
} from './src/utils/dailyStartTime';
import { findOriginalRecurringTask, calculateStreak, getAllRecurringDates } from './src/utils/recurrenceUtils';

// Helper to normalize date string (imported from recurrenceUtils logic)
function normalizeDateString(dateStr: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    return dateStr;
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const LANDSCAPE_COLOR_KEY = '@timer_app_landscape_color';
const FILLER_COLOR_KEY = '@timer_filler_color';
const SLIDER_BUTTON_COLOR_KEY = '@timer_slider_button_color';
const TEXT_COLOR_KEY = '@timer_text_color';
const PRESET_INDEX_KEY = '@timer_active_preset_index';
const COMPLETION_SOUND_KEY = '@timer_completion_sound';
const SOUND_REPETITION_KEY = '@timer_sound_repetition';
const ACTIVE_TIMER_ID_KEY = '@timer_active_id';
const ENABLE_FUTURE_TIMERS_KEY = '@timer_enable_future';
const IS_PAST_TIMERS_DISABLED_KEY = '@timer_is_past_disabled';
const IS_PAST_TASKS_DISABLED_KEY = '@task_is_past_disabled';
const TASKS_KEY = '@timer_app_tasks';

const DEFAULT_STAGE_START_TIME_MINUTES = 0; // 00:00
const DEFAULT_STAGE_DURATION_MINUTES = 180; // 3 hours

const normalizeStages = (stages: TaskStage[] | undefined, nowIso: string) => {
  let didChange = false;
  const seen = new Set<number>();
  const out: TaskStage[] = [];

  for (const s of stages || []) {
    // Safety check: skip null/undefined stages
    if (!s || !s.id) {
      didChange = true;
      continue;
    }

    // Drop duplicates by id (preserve first occurrence)
    if (seen.has(s.id)) {
      didChange = true;
      continue;
    }
    seen.add(s.id);

    const startTimeMinutes = s.startTimeMinutes ?? DEFAULT_STAGE_START_TIME_MINUTES;
    const durationMinutes = s.durationMinutes ?? DEFAULT_STAGE_DURATION_MINUTES;
    if (s.startTimeMinutes == null || s.durationMinutes == null) didChange = true;

    // Safety check: ensure status exists before accessing it
    const stageStatus = s.status || 'Upcoming';

    out.push({
      ...s,
      createdAt: s.createdAt ?? nowIso,
      status: stageStatus,
      isCompleted: s.isCompleted ?? (stageStatus === 'Done'),
      startTimeMinutes,
      durationMinutes,
    });
  }

  return { stages: out, didChange };
};

const normalizeTasks = (tasks: Task[], dailyStartMinutes: number = DEFAULT_DAILY_START_MINUTES) => {
  const nowIso = new Date().toISOString();
  let didChange = false;

  const out = tasks.map(t => {
    const norm = normalizeStages(t.stages, nowIso);
    if (norm.didChange) didChange = true;
    let updatedTask = norm.didChange ? { ...t, stages: norm.stages } : t;

    // Recalculate streak for recurring tasks
    if (updatedTask.recurrence) {
      const newStreak = calculateStreak(updatedTask, dailyStartMinutes);
      if (updatedTask.streak !== newStreak) {
        didChange = true;
        updatedTask = { ...updatedTask, streak: newStreak };
      } else if (updatedTask.streak === undefined) {
        // Initialize streak if it doesn't exist
        didChange = true;
        updatedTask = { ...updatedTask, streak: newStreak };
      }
    }

    return updatedTask;
  });

  return { tasks: out, didChange };
};



LogBox.ignoreLogs([
  'SafeAreaView has been deprecated',
  'expo-notifications',
  '[expo-av]',
]);

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
  const [selectedDate, setSelectedDate] = useState(() => getStartOfLogicalDay(new Date(), DEFAULT_DAILY_START_MINUTES));
  const [dailyStartMinutes, setDailyStartMinutes] = useState(DEFAULT_DAILY_START_MINUTES);
  const [categories, setCategories] = useState<Category[]>(DEFAULT_CATEGORIES);
  const [timerToEdit, setTimerToEdit] = useState<Timer | null>(null);
  const [isPastTimersDisabled, setIsPastTimersDisabled] = useState(false);
  const [isPastTasksDisabled, setIsPastTasksDisabled] = useState(false);
  const [activeView, setActiveViewState] = useState<'timer' | 'task'>('timer');
  const [shouldShowLiveView, setShouldShowLiveView] = useState(false);
  const [quickMessages, setQuickMessages] = useState<QuickMessage[]>(DEFAULT_QUICK_MESSAGES);
  const [timeOfDayBackgroundConfig, setTimeOfDayBackgroundConfig] = useState<TimeOfDayBackgroundConfig>(DEFAULT_TIME_OF_DAY_BACKGROUND_CONFIG);

  // Enable LayoutAnimation on Android
  if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }

  // Smooth view change with animation
  const setActiveView = (view: 'timer' | 'task') => {
    LayoutAnimation.configureNext({
      duration: 250,
      create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
      update: { type: LayoutAnimation.Types.easeInEaseOut },
      delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
    });
    setActiveViewState(view);
  };

  // Task state
  const [tasks, setTasks] = useState<Task[]>([]);
  const [addTaskModalVisible, setAddTaskModalVisible] = useState(false);
  const [taskToEdit, setTaskToEdit] = useState<Task | null>(null);

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

      const savedPast = await AsyncStorage.getItem(IS_PAST_TIMERS_DISABLED_KEY);
      if (savedPast !== null) setIsPastTimersDisabled(savedPast === 'true');
      else setIsPastTimersDisabled(false); // Default to not disabled

      const savedPastTasks = await AsyncStorage.getItem(IS_PAST_TASKS_DISABLED_KEY);
      if (savedPastTasks !== null) setIsPastTasksDisabled(savedPastTasks === 'true');
      else setIsPastTasksDisabled(false); // Default to not disabled

      const storedCats = await AsyncStorage.getItem(CATEGORIES_KEY);
      if (storedCats) {
        setCategories(JSON.parse(storedCats));
      }

      // Load quick messages
      const storedQuickMessages = await AsyncStorage.getItem(QUICK_MESSAGES_KEY);
      if (storedQuickMessages) {
        setQuickMessages(JSON.parse(storedQuickMessages));
      }

      // Daily start time (when the calendar day rolls over) - load before normalizing tasks
      const loadedStart = await loadDailyStartMinutes();
      setDailyStartMinutes(loadedStart);

      // Load tasks
      const storedTasks = await AsyncStorage.getItem(TASKS_KEY);
      if (storedTasks) {
        const parsed: Task[] = JSON.parse(storedTasks);
        const norm = normalizeTasks(parsed, loadedStart);
        setTasks(norm.tasks);
        // Persist normalization once on rehydration (no UI screen side-effects)
        if (norm.didChange) {
          saveTasks(norm.tasks);
        }
      }

      // Load/seed time-of-day background slots (single source of truth)
      const cfg = await loadOrSeedTimeOfDayBackgroundConfig();
      setTimeOfDayBackgroundConfig(cfg);
      setSelectedDate((prev) => {
        const logical = getLogicalDate(prev, DEFAULT_DAILY_START_MINUTES);
        const [y, m1, d] = logical.split('-').map(Number);
        return new Date(y, m1 - 1, d, Math.floor(loadedStart / 60), loadedStart % 60, 0, 0);
      });
    } catch (e) {
      console.error('Failed to load color preferences:', e);
    }
  };

  // Save tasks to AsyncStorage
  const saveTasks = async (tasksToSave: Task[]) => {
    try {
      await AsyncStorage.setItem(TASKS_KEY, JSON.stringify(tasksToSave));
    } catch (e) {
      console.error('Failed to save tasks:', e);
    }
  };

  // Rehydrate tasks from AsyncStorage (single source of truth)
  const rehydrateTasksFromStorage = async () => {
    try {
      const storedTasks = await AsyncStorage.getItem(TASKS_KEY);
      if (storedTasks) {
        const parsed: Task[] = JSON.parse(storedTasks);
        const norm = normalizeTasks(parsed, dailyStartMinutes);
        setTasks(norm.tasks);
        if (norm.didChange) {
          saveTasks(norm.tasks);
        }
      } else {
        setTasks([]);
      }
    } catch (e) {
      console.error('Failed to rehydrate tasks:', e);
    }
  };

  // Handle adding a new task
  const handleAddTask = (taskData: { title: string; description?: string; priority: Task['priority']; categoryId?: string; forDate: string; isBacklog?: boolean; recurrence?: Recurrence }) => {
    const now = new Date().toISOString();
    const newTask: Task = {
      id: Date.now(),
      title: taskData.title,
      description: taskData.description,
      status: 'Pending',
      priority: taskData.priority,
      categoryId: taskData.categoryId,
      forDate: taskData.forDate,
      isBacklog: taskData.isBacklog,
      recurrence: taskData.recurrence,
      createdAt: now,
      updatedAt: now,
      // For recurring tasks, stages are per-date in recurrenceInstances; comments are on the task and shared
      stages: taskData.recurrence ? undefined : [],
      comments: [],
      recurrenceInstances: taskData.recurrence ? {} : undefined,
      // Initialize streak for recurring tasks (will be 0 initially, calculated when instances are completed)
      streak: taskData.recurrence ? 0 : undefined,
    };
    setTasks(prev => {
      const updated = [...prev, newTask];
      saveTasks(updated);
      return updated;
    });
    setAddTaskModalVisible(false);
  };

  // Handle toggling task status
  const handleToggleTask = (task: Task) => {
    const statusFlow: Task['status'][] = ['Pending', 'In Progress', 'Completed'];
    const currentIndex = statusFlow.indexOf(task.status);
    const nextStatus = statusFlow[(currentIndex + 1) % statusFlow.length];

    const now = new Date().toISOString();
    setTasks(prev => {
      const updated = prev.map(t => {
        if (t.id !== task.id) return t;

        // If this is a recurring task, update the date-specific instance status
        if (t.recurrence) {
          const instanceDate = normalizeDateString(task.forDate); // Normalize the date for consistency
          const existingInstances = t.recurrenceInstances || {};
          const existingInstance = existingInstances[instanceDate] || {};

          const updatedTask = {
            ...t,
            recurrenceInstances: {
              ...existingInstances,
              [instanceDate]: {
                ...existingInstance,
                status: nextStatus,
                startedAt: (nextStatus === 'In Progress' && !existingInstance.startedAt) ? now : existingInstance.startedAt,
                completedAt: nextStatus === 'Completed' ? now : undefined,
              },
            },
            updatedAt: now,
          };

          // Calculate and update streak when status changes
          const newStreak = calculateStreak(updatedTask, dailyStartMinutes);

          return {
            ...updatedTask,
            streak: newStreak,
          };
        }

        // Non-recurring task: update status directly
        return {
          ...t,
          status: nextStatus,
          updatedAt: now,
          startedAt: (nextStatus === 'In Progress' && !t.startedAt) ? now : t.startedAt,
          completedAt: nextStatus === 'Completed' ? now : undefined
        };
      });
      saveTasks(updated);
      return updated;
    });
  };

  // Handle deleting a task
  const handleDeleteTask = (task: Task) => {
    Alert.alert(
      'Delete Task',
      `Are you sure you want to delete "${task.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setTasks(prev => {
              const updated = prev.filter(t => t.id !== task.id);
              saveTasks(updated);
              return updated;
            });
          },
        },
      ]
    );
  };

  // Handle editing a task (opening the modal)
  const handleEditTask = (task: Task) => {
    // If this is an expanded recurring task instance, find the original task
    const originalTask = findOriginalRecurringTask(tasks, task) || task;
    setTaskToEdit(originalTask);
    setAddTaskModalVisible(true);
  };

  // Handle updating an existing task
  const handleUpdateTask = (taskId: number, taskData: { title: string; description?: string; priority: Task['priority']; categoryId?: string; forDate: string; isBacklog?: boolean; recurrence?: Recurrence }) => {
    const now = new Date().toISOString();
    setTasks(prev => {
      const updated = prev.map(t =>
        t.id === taskId
          ? {
            ...t,
            ...taskData,
            updatedAt: now,
          }
          : t
      );
      saveTasks(updated);
      return updated;
    });
    setAddTaskModalVisible(false);
    setTaskToEdit(null);
  };

  // Handle updating a task comment (adding a new comment)
  const handleUpdateComment = (task: Task, comment: string) => {
    if (!comment.trim()) return;

    const now = new Date().toISOString();
    const newComment = {
      id: Date.now(),
      text: comment.trim(),
      createdAt: now,
    };

    setTasks(prev => {
      const updated = prev.map(t => {
        if (t.id !== task.id) return t;

        // Comments are stored on the task for both recurring and non-recurring (shared across dates for recurring)
        return {
          ...t,
          comments: [newComment, ...(t.comments || [])],
          updatedAt: now,
        };
      });
      saveTasks(updated);
      return updated;
    });
  };

  // Handle editing a comment (same task for recurring = shared comments)
  const handleEditComment = (task: Task, commentId: number, newText: string) => {
    if (!newText.trim()) return;

    const now = new Date().toISOString();
    setTasks(prev => {
      const updated = prev.map(t => {
        if (t.id !== task.id) return t;
        const comments = (t.comments || []).map(c =>
          c.id === commentId ? { ...c, text: newText.trim(), updatedAt: now } : c
        );
        return { ...t, comments, updatedAt: now };
      });
      saveTasks(updated);
      return updated;
    });
  };

  // Handle deleting a comment (same task for recurring = shared comments)
  const handleDeleteComment = (task: Task, commentId: number) => {
    const now = new Date().toISOString();
    setTasks(prev => {
      const updated = prev.map(t => {
        if (t.id !== task.id) return t;
        const comments = (t.comments || []).filter(c => c.id !== commentId);
        return { ...t, comments, updatedAt: now };
      });
      saveTasks(updated);
      return updated;
    });
  };

  // Handle updating stages (add, toggle, delete) with automatic status changes
  const handleUpdateStages = (task: Task, stages: TaskStage[], syncMode: SyncMode = 'none') => {
    const now = new Date().toISOString();

    setTasks(prev => {
      // Find the latest version of the task in the current state
      const latestTask = prev.find(t => t.id === task.id);
      if (!latestTask) return prev;

      // For recurring tasks, get stages from the date-specific instance
      const isRecurring = !!latestTask.recurrence;
      const instanceDate = task.forDate; // The expanded task's forDate (should be YYYY-MM-DD format)

      // Ensure we're using the correct date format
      if (isRecurring && !instanceDate) {
        console.warn('Recurring task missing forDate:', task);
        return prev;
      }

      const instanceData = isRecurring ? latestTask.recurrenceInstances?.[instanceDate] : undefined;
      const previousStages = isRecurring ? (instanceData?.stages || []) : (latestTask.stages || []);

      const normalized = normalizeStages(stages, now);
      let nextStages = normalized.stages;

      // Persist syncMode on new/modified stages if syncMode is active
      if (syncMode !== 'none') {
        nextStages = nextStages.map(s => {
          const prevS = previousStages.find(p => p.id === s.id);
          // If it's a new stage OR it's being updated with a sync mode, store it
          if (!prevS || (s.text !== prevS.text || s.status !== prevS.status || s.isCompleted !== prevS.isCompleted)) {
            return { ...s, syncMode };
          }
          return s;
        });
      }

      // Determine if this is adding a new stage
      const stageCountChanged = nextStages.length !== previousStages.length;
      const isAddingStage = nextStages.length > previousStages.length;

      // Calculate completion status
      // Safety check: ensure stages have status property
      const completedCount = nextStages.filter(s => s && (s.isCompleted || s.status === 'Done')).length;
      const totalCount = nextStages.length;
      const allCompleted = totalCount > 0 && completedCount === totalCount;
      const someCompleted = completedCount > 0 && completedCount < totalCount;

      // Determine new status
      // Safety check: ensure latestTask has status property (for backward compatibility)
      const latestTaskStatus = latestTask.status || 'Pending';
      let newStatus: Task['status'] = isRecurring
        ? (instanceData?.status ?? latestTaskStatus)
        : latestTaskStatus;

      if (allCompleted && totalCount > 0) {
        // All stages completed → Task is Completed
        newStatus = 'Completed';
      } else if (someCompleted) {
        // Some stages completed → Task is In Progress
        newStatus = 'In Progress';
      } else if (isAddingStage && newStatus === 'Completed') {
        // Adding a stage to a completed task → Back to Pending
        newStatus = 'Pending';
      } else if (totalCount > 0 && completedCount === 0 && newStatus === 'Completed') {
        // If task was completed but now has uncompleted stages → In Progress
        newStatus = 'In Progress';
      }

      const updated = prev.map(t => {
        if (t.id !== task.id) return t;

        // If this is a recurring task, save stages to the date-specific instance
        if (t.recurrence) {
          // Normalize the date to ensure consistent format (YYYY-MM-DD)
          // The instanceDate should already be YYYY-MM-DD from the expanded task,
          // but normalize it to be safe and handle any edge cases
          let normalizedInstanceDate = instanceDate;
          if (!instanceDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
            // Try to parse and normalize
            const date = new Date(instanceDate);
            if (!isNaN(date.getTime())) {
              const year = date.getFullYear();
              const month = String(date.getMonth() + 1).padStart(2, '0');
              const day = String(date.getDate()).padStart(2, '0');
              normalizedInstanceDate = `${year}-${month}-${day}`;
            }
          }

          // Check if instance exists with normalized date, or try to find it with any format
          let existingInstance = t.recurrenceInstances?.[normalizedInstanceDate] || {};
          if (!existingInstance.stages && t.recurrenceInstances) {
            // Try to find existing instance with different date format
            const matchingKey = Object.keys(t.recurrenceInstances).find(key => {
              const normalizedKey = key.match(/^\d{4}-\d{2}-\d{2}$/)
                ? key
                : (() => {
                  const d = new Date(key);
                  if (isNaN(d.getTime())) return null;
                  const y = d.getFullYear();
                  const m = String(d.getMonth() + 1).padStart(2, '0');
                  const day = String(d.getDate()).padStart(2, '0');
                  return `${y}-${m}-${day}`;
                })();
              return normalizedKey === normalizedInstanceDate;
            });
            if (matchingKey) {
              existingInstance = t.recurrenceInstances[matchingKey];
            }
          }
          const instanceStartedAt = newStatus === 'In Progress' && !existingInstance.startedAt
            ? now
            : existingInstance.startedAt;
          const instanceCompletedAt: string | undefined = newStatus === 'Completed'
            ? now
            : undefined;

          // Create a new recurrenceInstances object to ensure React detects the change
          let updatedRecurrenceInstances: Record<string, import('./src/constants/data').RecurrenceInstance> = {
            ...(t.recurrenceInstances || {}),
            [normalizedInstanceDate]: {
              ...existingInstance,
              stages: nextStages, // This is already a new array from normalizeStages
              status: newStatus,
              startedAt: instanceStartedAt,
              completedAt: instanceCompletedAt,
            },
          };

          // Delta analysis for targeted sync (Sync All / Sync Future)
          // We only want to propagate subtasks that were actually touched in this call.
          const removedIds = new Set(previousStages.filter(p => !nextStages.find(s => s.id === p.id)).map(p => p.id));
          const modifiedStages = nextStages.filter(s => {
            const prev = previousStages.find(p => p.id === s.id);
            if (!prev) return true; // Added
            return prev.text !== s.text ||
              prev.startTimeMinutes !== s.startTimeMinutes ||
              prev.durationMinutes !== s.durationMinutes ||
              prev.status !== s.status ||
              prev.isCompleted !== s.isCompleted;
          });

          // Delete propagation: always propagate deletions for recurring tasks to all instances
          // Repeat Sync: replicate structure (create/update) to all other instances; do NOT sync status unless syncMode is 'all' or 'future'
          if (t.recurrence?.repeatSync || syncMode !== 'none' || removedIds.size > 0) {
            const allDates = getAllRecurringDates(t);
            for (const otherDate of allDates) {
              if (otherDate === normalizedInstanceDate) continue;

              // If syncMode is 'future', only propagate to actually future dates.
              // If syncMode is 'all', sync for all dates.
              const isFuture = otherDate > normalizedInstanceDate;
              if (syncMode === 'future' && !isFuture) continue;

              const findInstance = (inst: Record<string, import('./src/constants/data').RecurrenceInstance> | undefined) => {
                if (!inst) return undefined;
                const direct = inst[otherDate];
                if (direct) return direct;
                const match = Object.keys(inst).find(k => normalizeDateString(k) === otherDate);
                return match ? inst[match] : undefined;
              };
              const otherInstance = findInstance(updatedRecurrenceInstances) || findInstance(t.recurrenceInstances) || {};
              const otherStages = otherInstance.stages || [];

              let syncedStages: TaskStage[] = otherStages;

              if (t.recurrence?.repeatSync) {
                // Global Sync: Structure must match perfectly (Full Override)
                const preservedByStageId = new Map<number, {
                  status: import('./src/constants/data').StageStatus;
                  isCompleted: boolean;
                  startTimeMinutes?: number;
                  durationMinutes?: number;
                }>();
                for (const s of otherStages) {
                  if (s?.id) preservedByStageId.set(s.id, {
                    status: (s.status || 'Upcoming') as import('./src/constants/data').StageStatus,
                    isCompleted: s.isCompleted ?? (s.status === 'Done'),
                    startTimeMinutes: s.startTimeMinutes,
                    durationMinutes: s.durationMinutes,
                  });
                }

                syncedStages = nextStages.map(src => {
                  const preserved = preservedByStageId.get(src.id);
                  let useSourceStatus = false;
                  if (syncMode === 'all' || (syncMode === 'future' && isFuture)) {
                    const prevSrc = previousStages.find(p => p.id === src.id);
                    if (!prevSrc || prevSrc.status !== src.status || prevSrc.isCompleted !== src.isCompleted) {
                      useSourceStatus = true;
                    }
                  }
                  return {
                    ...src,
                    status: useSourceStatus ? src.status : (preserved?.status ?? 'Upcoming'),
                    isCompleted: useSourceStatus ? src.isCompleted : (preserved?.isCompleted ?? false),
                    startTimeMinutes: preserved?.startTimeMinutes ?? src.startTimeMinutes ?? 0,
                    durationMinutes: preserved?.durationMinutes ?? src.durationMinutes ?? 180,
                  };
                });
              } else {
                // Delta Sync (None/All/Future): Only touch subtasks that were added/updated/removed.
                // This prevents "Local Only" subtasks from being copied to other dates.
                // UPDATED: Global deletion - ALWAYS remove deleted IDs from all other dates
                let nextOtherStages = otherStages.filter(s => !removedIds.has(s.id));

                if (syncMode !== 'none' || t.recurrence?.repeatSync) {
                  for (const mod of modifiedStages) {
                    let useSourceStatus = false;
                    if (syncMode === 'all' || (syncMode === 'future' && isFuture)) {
                      const prevSrc = previousStages.find(p => p.id === mod.id);
                      if (!prevSrc || prevSrc.status !== mod.status || prevSrc.isCompleted !== mod.isCompleted) {
                        useSourceStatus = true;
                      }
                    }

                    const existingIdx = nextOtherStages.findIndex(s => s.id === mod.id);
                    const preserved = existingIdx >= 0 ? nextOtherStages[existingIdx] : undefined;

                    const stagedMod: TaskStage = {
                      ...mod,
                      status: useSourceStatus ? mod.status : (preserved?.status ?? 'Upcoming'),
                      isCompleted: useSourceStatus ? mod.isCompleted : (preserved?.isCompleted ?? false),
                      startTimeMinutes: preserved?.startTimeMinutes ?? mod.startTimeMinutes ?? 0,
                      durationMinutes: preserved?.durationMinutes ?? mod.durationMinutes ?? 180,
                    };

                    if (existingIdx >= 0) {
                      nextOtherStages[existingIdx] = stagedMod;
                    } else {
                      nextOtherStages.push(stagedMod);
                    }
                  }
                }
                syncedStages = nextOtherStages;
              }

              updatedRecurrenceInstances = {
                ...updatedRecurrenceInstances,
                [otherDate]: {
                  ...otherInstance,
                  stages: syncedStages,
                  status: otherInstance.status,
                  startedAt: otherInstance.startedAt,
                  completedAt: otherInstance.completedAt,
                },
              };
            }
          }

          const updatedTask = {
            ...t,
            recurrenceInstances: updatedRecurrenceInstances,
            updatedAt: now,
          };

          const newStreak = calculateStreak(updatedTask, dailyStartMinutes);

          return {
            ...updatedTask,
            streak: newStreak,
          };
        }

        // Non-recurring task: save stages directly
        return {
          ...t,
          stages: nextStages,
          status: newStatus,
          updatedAt: now,
          // Set startedAt if moving to In Progress and not already set
          startedAt: newStatus === 'In Progress' && !t.startedAt ? now : t.startedAt,
          // Set completedAt if becoming Completed, clear it otherwise
          completedAt: newStatus === 'Completed' ? now : undefined,
        };
      });

      // Persist immediately (single source of truth)
      saveTasks(updated);

      // Return updated state immediately - no need to rehydrate as we've already updated the state
      return updated;
    });
  };

  const handlePinTask = async (task: Task) => {
    const isPinned = !task.isPinned;
    const now = new Date().toISOString();
    setTasks(prev => {
      const updated = prev.map(t =>
        t.id === task.id
          ? {
            ...t,
            isPinned,
            pinTimestamp: isPinned ? Date.now() : null,
            updatedAt: now,
          }
          : t
      );
      saveTasks(updated);
      return updated;
    });
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
    setTimers(prev => {
      const updated = prev.map(t =>
        t.id === timerId ? { ...t, isAcknowledged: true, updatedAt: new Date().toISOString() } : t
      );
      saveTimers(updated);
      return updated;
    });
  };

  const updateActiveTimer = async (timer: Timer | null) => {
    setActiveTimer(timer);
    if (timer) {
      await AsyncStorage.setItem(ACTIVE_TIMER_ID_KEY, timer.id.toString());
      // When opening an active timer, ensure we view its date.
      // Use start of logical day so getLogicalDate(selectedDate, dailyStartMinutes) === timer.forDate;
      // new Date(timer.forDate) is midnight and would yield the previous logical day.
      if (timer.forDate) {
        setSelectedDate(getStartOfLogicalDayFromString(timer.forDate, dailyStartMinutes));
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

    setTimers(prev => {
      const updated = prev.map(t => {
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
      saveTimers(updated);
      return updated;
    });
    setAddModalVisible(false);
    setTimerToEdit(null);
  };

  const handleLongPressTimer = (timer: Timer) => {
    setSelectedTimer(timer);
    setDeleteModalVisible(true);
  };

  const confirmDelete = async () => {
    if (selectedTimer) {
      setTimers(prev => {
        const updated = prev.filter(t => t.id !== selectedTimer.id);
        saveTimers(updated);

        // If we deleted the active timer, clear it
        if (activeTimer && activeTimer.id === selectedTimer.id) {
          updateActiveTimer(null);
          setCurrentScreen('list');
        }

        return updated;
      });
    }
    setDeleteModalVisible(false);
    setSelectedTimer(null);
  };

  // Reset timer to initial/upcoming state
  const handleResetTimer = async () => {
    if (selectedTimer) {
      setTimers(prev => {
        const updated = prev.map(t => {
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
        saveTimers(updated);
        return updated;
      });
    }
    setDeleteModalVisible(false);
    setSelectedTimer(null);
  };

  // Play/Pause a timer - only one can run at a time
  const handlePlayPause = async (timerToToggle: Timer) => {
    setTimers(prev => {
      // Find the latest version of this timer from state to ensure status is fresh
      const currentTimer = prev.find(t => t.id === timerToToggle.id);
      if (!currentTimer || currentTimer.status === 'Completed') return prev;

      const isCurrentlyRunning = currentTimer.status === 'Running';
      const currentSeconds = timeToSeconds(currentTimer.time);

      // Side Effect Alert: We ARE doing async inside a setter which is bad practice but
      // we need to schedule/cancel notifications. The actual timer logic is handled by the map.
      (async () => {
        if (isCurrentlyRunning) {
          await cancelTimerNotification(currentTimer.notificationId);
        } else {
          const newNotificationId = await scheduleTimerNotification(
            currentTimer.id,
            currentSeconds,
            currentTimer.title
          );

          // Re-update the specific timer with the notification ID if we just started it
          setTimers(latest => latest.map(t =>
            t.id === currentTimer.id ? { ...t, notificationId: newNotificationId || undefined } : t
          ));

          // Also cancel any other running timer's notification
          setTimers(latest => {
            const otherRunning = latest.find(t => t.status === 'Running' && t.id !== currentTimer.id);
            if (otherRunning?.notificationId) {
              cancelTimerNotification(otherRunning.notificationId);
            }
            return latest;
          });
        }
      })();

      const updated = prev.map(t => {
        if (t.id === timerToToggle.id) {
          const isRestarting = t.status !== 'Running' && t.status !== 'Paused';
          const newStatus = isCurrentlyRunning ? 'Paused' : 'Running';

          let startInfo: Partial<Timer> = {};
          if (isRestarting && !t.startTime) {
            startInfo = { startTime: new Date().toISOString() };
          }

          if (!isCurrentlyRunning) {
            startInfo.startedTimestamp = Date.now();
            startInfo.remainingSecondsAtStart = timeToSeconds(t.time);
          } else {
            startInfo.startedTimestamp = undefined;
            startInfo.remainingSecondsAtStart = undefined;
            startInfo.notificationId = undefined; // Cleared on pause
          }

          return { ...t, status: newStatus, ...startInfo } as Timer;
        } else if (t.status === 'Running') {
          return { ...t, status: 'Paused', startedTimestamp: undefined, remainingSecondsAtStart: undefined, notificationId: undefined } as Timer;
        }
        return t;
      });

      saveTimers(updated);

      // Persist active timer if we just started one
      if (!isCurrentlyRunning) {
        const startedTimer = updated.find(t => t.id === timerToToggle.id);
        if (startedTimer) {
          updateActiveTimer(startedTimer);
        }
      }

      return updated;
    });
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
      setTimers(prev => {
        const runningTimer = prev.find(t => t.status === 'Running');
        if (runningTimer?.notificationId) {
          cancelTimerNotification(runningTimer.notificationId);
        }

        const updated = prev.map(t => {
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

        saveTimers(updated);

        // Update active timer with the latest version
        const startedTimer = updated.find(t => t.id === timer.id);
        if (startedTimer) {
          updateActiveTimer(startedTimer);
        }

        return updated;
      });

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
            isPastTimersDisabled={isPastTimersDisabled}
            onPastTimersDisabledChange={async (val) => {
              setIsPastTimersDisabled(val);
              await AsyncStorage.setItem(IS_PAST_TIMERS_DISABLED_KEY, val.toString());
            }}
            isPastTasksDisabled={isPastTasksDisabled}
            onPastTasksDisabledChange={async (val) => {
              setIsPastTasksDisabled(val);
              await AsyncStorage.setItem(IS_PAST_TASKS_DISABLED_KEY, val.toString());
            }}
            dailyStartMinutes={dailyStartMinutes}
            onDailyStartMinutesChange={async (newVal) => {
              await saveDailyStartMinutes(newVal);
              setDailyStartMinutes(newVal);
              setSelectedDate((prev) =>
                new Date(prev.getFullYear(), prev.getMonth(), prev.getDate(), Math.floor(newVal / 60), newVal % 60, 0, 0)
              );
            }}
            quickMessages={quickMessages}
            onQuickMessagesChange={async (messages) => {
              setQuickMessages(messages);
              await AsyncStorage.setItem(QUICK_MESSAGES_KEY, JSON.stringify(messages));
            }}
            timeOfDayBackgroundConfig={timeOfDayBackgroundConfig}
            onTimeOfDayBackgroundConfigChange={(cfg) => {
              setTimeOfDayBackgroundConfig(cfg);
              saveTimeOfDayBackgroundConfig(cfg);
            }}
            onAfterClearTimers={() => setTimers([])}
            onAfterClearTasks={() => setTasks([])}
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

      case 'list':
        if (activeView === 'task') {
          return (
            <TaskList
              tasks={tasks}
              onAddTask={() => setAddTaskModalVisible(true)}
              onToggleTask={handleToggleTask}
              onDeleteTask={handleDeleteTask}
              onEditTask={handleEditTask}
              onUpdateComment={handleUpdateComment}
              onEditComment={handleEditComment}
              onDeleteComment={handleDeleteComment}
              onUpdateStages={handleUpdateStages}
              onPinTask={handlePinTask}
              categories={categories}
              selectedDate={selectedDate}
              onDateChange={setSelectedDate}
              activeView={activeView}
              onViewChange={setActiveView}
              onSettings={() => setCurrentScreen('settings')}
              isPastTasksDisabled={isPastTasksDisabled}
              dailyStartMinutes={dailyStartMinutes}
              quickMessages={quickMessages}
              timeOfDaySlots={slotsForDate(timeOfDayBackgroundConfig, selectedDate)}
              runningTimer={timers.find(t => t.status === 'Running') ?? null}
              onOpenActiveTimer={(timer) => {
                if (timer) {
                  setActiveTimer(timer);
                  setActiveView('timer');
                  setCurrentScreen('active');
                } else {
                  setActiveView('timer');
                }
              }}
              initialShowLive={shouldShowLiveView}
              onLiveViewShown={() => setShouldShowLiveView(false)}
              timerTextColor={timerTextColor}
              sliderButtonColor={sliderButtonColor}
            />
          );
        }

      default:
        // Show TimerList when activeView is 'timer'
        if (timers.length === 0 && tasks.length === 0) {
          return <EmptyState onAddTimer={() => activeView === 'timer' ? setAddModalVisible(true) : setAddTaskModalVisible(true)} />;
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
            isPastTimersDisabled={isPastTimersDisabled}
            dailyStartMinutes={dailyStartMinutes}
            activeView={activeView}
            onViewChange={setActiveView}
            onRequestLiveView={() => {
              setShouldShowLiveView(true);
              setActiveView('task');
            }}
          />
        );
    }
  };

  // Handle pinning/unpinning a timer
  const handlePinTimer = async (timer: Timer) => {
    const isPinned = !timer.isPinned;
    const now = new Date().toISOString();
    const updatedTimers = timers.map(t =>
      t.id === timer.id
        ? {
          ...t,
          isPinned,
          pinTimestamp: isPinned ? Date.now() : null,
          updatedAt: now,
        }
        : t
    );
    setTimers(updatedTimers);
    await saveTimers(updatedTimers);
    setDeleteModalVisible(false);
    setSelectedTimer(null);
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Pressable
        style={{ flex: 1 }}
        onPress={() => Keyboard.dismiss()}
        accessible={false}
      >
        <View style={{ flex: 1 }} pointerEvents="box-none">
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
              initialDate={getLogicalDate(selectedDate, dailyStartMinutes)}
              dailyStartMinutes={dailyStartMinutes}
              categories={categories}
              timerToEdit={timerToEdit}
              isPastTimersDisabled={isPastTimersDisabled}
            />

            <DeleteModal
              visible={deleteModalVisible}
              timer={selectedTimer}
              onCancel={() => {
                setDeleteModalVisible(false);
                setSelectedTimer(null);
              }}
              onUpdate={() => {
                setTimerToEdit(selectedTimer);
                setDeleteModalVisible(false);
                setAddModalVisible(true);
              }}
              onReset={handleResetTimer}
              onDelete={confirmDelete}
              onPin={handlePinTimer}
            />

            <AddTaskModal
              visible={addTaskModalVisible}
              onCancel={() => {
                setAddTaskModalVisible(false);
                setTaskToEdit(null);
              }}
              onAdd={handleAddTask}
              onUpdate={handleUpdateTask}
              taskToEdit={taskToEdit}
              categories={categories}
              initialDate={getLogicalDate(selectedDate, dailyStartMinutes)}
              dailyStartMinutes={dailyStartMinutes}
              isPastTasksDisabled={isPastTasksDisabled}
            />

            <StatusBar style="light" />
          </SafeAreaProvider>
        </View>
      </Pressable>
    </GestureHandlerRootView>
  );
}
