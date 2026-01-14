import AsyncStorage from '@react-native-async-storage/async-storage';
import { Timer } from '../constants/data';

const STORAGE_KEY = '@timers';

export const loadTimers = async (): Promise<Timer[]> => {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
    return [];
  } catch (e) {
    console.error('Error loading timers:', e);
    return [];
  }
};

export const saveTimers = async (timers: Timer[]): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(timers));
  } catch (e) {
    console.error('Error saving timers:', e);
  }
};

export const addTimer = async (timer: Timer): Promise<Timer[]> => {
  const timers = await loadTimers();
  const newTimers = [...timers, timer];
  await saveTimers(newTimers);
  return newTimers;
};

export const deleteTimer = async (id: number): Promise<Timer[]> => {
  const timers = await loadTimers();
  const newTimers = timers.filter(t => t.id !== id);
  await saveTimers(newTimers);
  return newTimers;
};
