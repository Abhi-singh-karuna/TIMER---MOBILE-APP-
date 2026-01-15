import React, { useState, useEffect, useRef } from 'react';
import { LogBox } from 'react-native';
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

import EmptyState from './src/screens/EmptyState';
import TimerList from './src/screens/TimerList';
import ActiveTimer from './src/screens/ActiveTimer';
import TaskComplete from './src/screens/TaskComplete';
import SettingsScreen from './src/screens/SettingsScreen';
import AddTimerModal from './src/components/AddTimerModal';
import DeleteModal from './src/components/DeleteModal';
import { Timer } from './src/constants/data';
import { loadTimers, saveTimers } from './src/utils/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LANDSCAPE_COLOR_KEY = '@timer_app_landscape_color';
const FILLER_COLOR_KEY = '@timer_filler_color';
const SLIDER_BUTTON_COLOR_KEY = '@timer_slider_button_color';
const TEXT_COLOR_KEY = '@timer_text_color';
const PRESET_INDEX_KEY = '@timer_active_preset_index';
const COMPLETION_SOUND_KEY = '@timer_completion_sound';
const SOUND_REPETITION_KEY = '@timer_sound_repetition';

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

  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    initializeTimers();
    loadAllColors();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

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
                return { ...timer, status: 'Completed' as const, time: '00:00:00', completedPercentage: 100 };
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

  const initializeTimers = async () => {
    const stored = await loadTimers();
    setTimers(stored);
  };

  const handleAddTimer = async (name: string, hours: number, minutes: number, seconds: number) => {
    const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    const newTimer: Timer = {
      id: Date.now(),
      title: name,
      time: timeStr,
      total: timeStr,
      status: 'Upcoming',
      tier: 2,
    };
    const newTimers = [...timers, newTimer];
    setTimers(newTimers);
    await saveTimers(newTimers);
    setAddModalVisible(false);
  };

  const handleDeleteTimer = (timer: Timer) => {
    setSelectedTimer(timer);
    setDeleteModalVisible(true);
  };

  const confirmDelete = async () => {
    if (selectedTimer) {
      const newTimers = timers.filter(t => t.id !== selectedTimer.id);
      setTimers(newTimers);
      await saveTimers(newTimers);
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
            completedPercentage: undefined,
            savedTime: undefined
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

    const updatedTimers = timers.map(t => {
      if (t.id === timerToToggle.id) {
        // Toggle: Running → Paused, anything else → Running
        const isRestarting = t.status !== 'Running' && t.status !== 'Paused';
        const newStatus = isCurrentlyRunning ? 'Paused' : 'Running';

        let startInfo = {};
        if (isRestarting && !t.startTime) {
          const now = new Date();
          startInfo = { startTime: `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}` };
        }

        return { ...t, status: newStatus, ...startInfo } as Timer;
      } else if (t.status === 'Running') {
        // Pause any other running timer
        return { ...t, status: 'Paused' } as Timer;
      }
      return t;
    });

    setTimers(updatedTimers);
    await saveTimers(updatedTimers);
  };

  // Open timer screen when clicking on a card
  const handleStartTimer = (timer: Timer) => {
    setActiveTimer(timer);

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
      const updatedTimers = timers.map(t => {
        if (t.id === timer.id) {
          const now = new Date();
          const startTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
          return { ...t, status: 'Running', startTime } as Timer;
        } else if (t.status === 'Running') {
          return { ...t, status: 'Paused' } as Timer;
        }
        return t;
      });
      setTimers(updatedTimers);
      setCurrentScreen('active');
    }
  };

  // Handle pause from active timer screen
  const handlePause = () => {
    const updatedTimers = timers.map(t => {
      if (t.status === 'Running') {
        return { ...t, status: 'Paused' } as Timer;
      }
      return t;
    });
    setTimers(updatedTimers);
  };

  // Handle cancel from active timer screen
  const handleCancel = () => {
    handlePause();
    setActiveTimer(null);
    setCurrentScreen('list');
  };

  // Handle complete from active timer screen
  const handleComplete = () => {
    const now = new Date();
    const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    setCompletedAt(time);

    // Calculate completion percentage at the time of force-complete
    const currentTimer = activeTimer ? timers.find(t => t.id === activeTimer.id) : null;
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
            savedTime: savedSecs
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
  const handleRestart = () => {
    if (activeTimer) {
      const updatedTimers = timers.map(t => {
        if (t.id === activeTimer.id) {
          return {
            ...t,
            time: t.total,
            status: 'Running',
            borrowedTime: 0,
            completedPercentage: undefined,
            savedTime: undefined
          } as Timer;
        }
        return { ...t, status: t.status === 'Running' ? 'Paused' : t.status } as Timer;
      });
      setTimers(updatedTimers);
      saveTimers(updatedTimers);
    }
    setCurrentScreen('active');
  };

  // Handle done from complete screen
  const handleDone = async () => {
    setActiveTimer(null);
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
      const updatedTimers = timers.map(t => {
        if (t.id === activeTimer.id) {
          const currentSeconds = timeToSeconds(t.time);
          const newSeconds = currentSeconds + seconds;
          const totalBorrowed = (t.borrowedTime || 0) + seconds;
          return {
            ...t,
            time: secondsToTime(newSeconds),
            borrowedTime: totalBorrowed
          } as Timer;
        }
        return t;
      });
      setTimers(updatedTimers);
      await saveTimers(updatedTimers);
    }
  };

  const handleBorrowFromComplete = async (seconds: number) => {
    if (activeTimer) {
      const updatedTimers = timers.map(t => {
        if (t.id === activeTimer.id) {
          const totalBorrowed = (t.borrowedTime || 0) + seconds;
          return {
            ...t,
            time: secondsToTime(seconds),
            status: 'Running',
            borrowedTime: totalBorrowed,
            completedPercentage: undefined,
            savedTime: undefined
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
    const updatedTimers = timers.map(t => {
      if (t.id === timer.id) {
        const totalBorrowed = (t.borrowedTime || 0) + seconds;
        return {
          ...t,
          time: secondsToTime(seconds),
          status: 'Running',
          borrowedTime: totalBorrowed,
          completedPercentage: undefined,
          savedTime: undefined
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
            onBorrowTime={handleBorrowTime}
            fillerColor={fillerColor}
            sliderButtonColor={sliderButtonColor}
            timerTextColor={timerTextColor}
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
            onBorrowTime={handleBorrowFromComplete}
            selectedSound={selectedSound}
            soundRepetition={soundRepetition}
            shouldPlaySound={shouldPlayCompletionSound}
          />
        );

      default:
        if (timers.length === 0) {
          return <EmptyState onAddTimer={() => setAddModalVisible(true)} />;
        }
        return (
          <TimerList
            timers={timers}
            onAddTimer={() => setAddModalVisible(true)}
            onDeleteTimer={handleDeleteTimer}
            onStartTimer={handleStartTimer}
            onPlayPause={handlePlayPause}
            onSettings={() => setCurrentScreen('settings')}
            onBorrowTime={handleBorrowTimeFromList}
            selectedSound={selectedSound}
            soundRepetition={soundRepetition}
          />
        );
    }
  };

  return (
    <SafeAreaProvider>
      {renderScreen()}

      <AddTimerModal
        visible={addModalVisible}
        onCancel={() => setAddModalVisible(false)}
        onAdd={handleAddTimer}
      />

      <DeleteModal
        visible={deleteModalVisible}
        timer={selectedTimer}
        onCancel={() => {
          setDeleteModalVisible(false);
          setSelectedTimer(null);
        }}
        onReset={handleResetTimer}
        onDelete={confirmDelete}
      />

      <StatusBar style="light" />
    </SafeAreaProvider>
  );
}
