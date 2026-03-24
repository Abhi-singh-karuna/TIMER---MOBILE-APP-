import AsyncStorage from '@react-native-async-storage/async-storage';
import { Timer, Goal } from '../constants/data';

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

const GOALS_STORAGE_KEY = '@goals';

export const loadGoals = async (): Promise<Goal[]> => {
  try {
    const stored = await AsyncStorage.getItem(GOALS_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
    return [];
  } catch (e) {
    console.error('Error loading goals:', e);
    return [];
  }
};

export const saveGoals = async (goals: Goal[]): Promise<void> => {
  try {
    await AsyncStorage.setItem(GOALS_STORAGE_KEY, JSON.stringify(goals));
  } catch (e) {
    console.error('Error saving goals:', e);
  }
};

export const addGoal = async (goal: Goal): Promise<Goal[]> => {
  const goals = await loadGoals();
  const newGoals = [...goals, goal];
  await saveGoals(newGoals);
  return newGoals;
};

export const deleteGoal = async (id: string): Promise<Goal[]> => {
  const goals = await loadGoals();
  const newGoals = goals.filter(g => g.id !== id);
  await saveGoals(newGoals);
  return newGoals;
};
