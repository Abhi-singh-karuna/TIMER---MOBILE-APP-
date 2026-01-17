import { MaterialIcons } from '@expo/vector-icons';

export const CATEGORIES_KEY = '@timer_categories';

export interface Category {
  id: string;
  name: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  color: string;
}

export const DEFAULT_CATEGORIES: Category[] = [
  { id: '1', name: 'Work', icon: 'business-center', color: '#FFFFFF' },
  { id: '2', name: 'Exercise', icon: 'fitness-center', color: '#FF2D55' },
  { id: '3', name: 'Study', icon: 'menu-book', color: '#FFD700' },
];

export interface Timer {
  id: number;
  title: string;
  time: string;      // Current remaining time MM:SS
  total: string;     // Original total time MM:SS
  status: 'Upcoming' | 'Running' | 'Paused' | 'Completed';
  tier: number;
  completedPercentage?: number; // Percentage at which timer was completed (for force-complete tracking)
  borrowedTime?: number;        // Total seconds borrowed during this session
  savedTime?: number; // Time remaining when completed (in seconds)
  startTime?: string; // ISO string when the timer was first started
  startedTimestamp?: number;  // Unix timestamp when timer started running (for background tracking)
  remainingSecondsAtStart?: number; // Seconds remaining when timer was started/resumed (for accurate background calculation)
  pausedAt?: number;          // Unix timestamp when timer was paused
  notificationId?: string;    // ID of scheduled notification for timer completion
  isAcknowledged?: boolean;    // Whether the completion has been acknowledged by the UI
  createdAt: string;           // ISO string of when timer was created
  updatedAt: string;           // ISO string of last update
  borrowedTimeList: number[];  // List of seconds borrowed
  forDate: string;             // YYYY-MM-DD format
  categoryId?: string;         // Assigned category ID
}

export const SOUND_OPTIONS = [
  {
    id: 0,
    name: 'Chime',
    icon: 'notifications' as const,
    color: '#FFFFFF',
    uri: 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3',
  },
  {
    id: 1,
    name: 'Success',
    icon: 'celebration' as const,
    color: '#34C759',
    uri: 'https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3',
  },
  {
    id: 2,
    name: 'Alert',
    icon: 'campaign' as const,
    color: '#FF9500',
    uri: 'https://assets.mixkit.co/active_storage/sfx/2870/2870-preview.mp3',
  },
  {
    id: 3,
    name: 'Mute',
    icon: 'volume-off' as const,
    color: '#8E8E93',
    uri: null,
  },
];
export const COLOR_PRESETS = [
  { name: 'White', value: '#FFFFFF' },
  { name: 'Light Gray', value: '#CCCCCC' },
  { name: 'Dark Gray', value: '#444444' },
  { name: 'Gold', value: '#FFD700' },
  { name: 'Coral', value: '#FF6B6B' },
  { name: 'Mint', value: '#4ECDC4' },
  { name: 'Sky Blue', value: '#00E5FF' },
  { name: 'Electric Pink', value: '#FF80AB' },
  { name: 'Vibrant Orange', value: '#FF9100' },
  { name: 'Spring Green', value: '#00E676' },
  { name: 'Royal Purple', value: '#D1C4E9' },
];

export const LANDSCAPE_PRESETS = [
  {
    name: 'Monochrome',
    filler: '#FFFFFF',
    slider: '#FFFFFF',
    text: '#FFFFFF'
  },
  {
    name: 'Dark Knight',
    filler: '#888888',
    slider: '#888888',
    text: '#FFFFFF'
  },
  {
    name: 'Neon Cyan',
    filler: '#00E5FF',
    slider: '#00E5FF',
    text: '#FFFFFF'
  },
  {
    name: 'Midnight Gray',
    filler: '#444444',
    slider: '#444444',
    text: '#FFFFFF'
  },
  {
    name: 'Golden',
    filler: '#FFD700',
    slider: '#FFD700',
    text: '#FFFFFF'
  },
];
