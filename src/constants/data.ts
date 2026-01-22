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

export interface QuickMessage {
  id: string;
  text: string;
  color: string;
}

export const QUICK_MESSAGES_KEY = '@timer_quick_messages';

export const DEFAULT_QUICK_MESSAGES: QuickMessage[] = [
  { id: '1', text: 'STARTED !!', color: '#00E5FF' },
  { id: '2', text: 'TAKE BREAK', color: '#FF9100' },
  { id: '3', text: 'RESUME', color: '#00E676' },
  { id: '4', text: 'DONE !', color: '#4CAF50' },
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
  isPinned?: boolean;          // Whether the timer is pinned
  pinTimestamp?: number | null; // Unix timestamp when pinned
}

export interface Comment {
  id: number;
  text: string;
  createdAt: string; // ISO string
}

export type StageStatus = 'Upcoming' | 'Process' | 'Done' | 'Undone';

export interface TaskStage {
  id: number;
  text: string;
  isCompleted: boolean; // Kept for backward compatibility (true = Done, false = others)
  status: StageStatus;  // New field for 4-state tracking
  createdAt: string;
  startTimeMinutes?: number; // Start time in minutes from 00:00
  durationMinutes?: number;  // Duration in minutes
  startTime?: string;        // ISO string when subtask was started
  endTime?: string;          // ISO string when subtask was ended
  endTimeMinutes?: number;    // End time in minutes from 00:00 (calculated from startTimeMinutes + durationMinutes)
}

export interface Task {
  id: number;
  title: string;
  description?: string;
  status: 'Pending' | 'In Progress' | 'Completed';
  priority: 'Low' | 'Medium' | 'High';
  categoryId?: string;
  forDate: string;             // YYYY-MM-DD format
  isBacklog?: boolean;         // Whether the task is in the backlog
  createdAt: string;           // ISO string of when task was created
  updatedAt: string;           // ISO string of last update
  startedAt?: string;          // ISO string when task was first started
  completedAt?: string;        // ISO string when task was completed
  comments?: Comment[];        // List of user comments
  stages?: TaskStage[];        // List of task stages
  isPinned?: boolean;          // Whether the task is pinned
  pinTimestamp?: number | null; // Unix timestamp when pinned
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
  { name: 'White', hex: '#FFFFFF' },
  { name: 'Light Gray', hex: '#CCCCCC' },
  { name: 'Dark Gray', hex: '#444444' },
  { name: 'Gold', hex: '#FFD700' },
  { name: 'Coral', hex: '#FF6B6B' },
  { name: 'Mint', hex: '#4ECDC4' },
  { name: 'Sky Blue', hex: '#00E5FF' },
  { name: 'Electric Pink', hex: '#FF80AB' },
  { name: 'Vibrant Orange', hex: '#FF9100' },
  { name: 'Spring Green', hex: '#00E676' },
  { name: 'Royal Purple', hex: '#D1C4E9' },
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
