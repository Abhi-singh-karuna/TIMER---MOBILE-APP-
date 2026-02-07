import { MaterialIcons } from '@expo/vector-icons';

export const CATEGORIES_KEY = '@timer_categories';
export const LEAVE_DAYS_KEY = '@timer_leave_days';

export interface LeaveDay {
  date: string; // YYYY-MM-DD
  reason?: string;
}

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
  updatedAt?: string; // ISO string, set when comment is edited
}

export type StageStatus = 'Upcoming' | 'Process' | 'Done' | 'Undone';

// Recurrence types
export type RecurrenceType = 'daily' | 'weekly' | 'monthly';

export interface RecurrenceBase {
  startDate: string; // ISO date, default = today
  endDate?: string;  // optional
  /** When true, subtask create/update/delete on one instance syncs to all instances. Status (complete/incomplete) is NOT synced. */
  repeatSync?: boolean;
}

export type Recurrence =
  | (RecurrenceBase & {
    type: 'daily';
  })
  | (RecurrenceBase & {
    type: 'weekly';
    days: number[]; // 0–6 (Sun–Sat)
  })
  | (RecurrenceBase & {
    type: 'monthly';
    mode: 'date';
    /** Day-of-month selections (1–31). Multiple allowed. */
    dates: number[];
  })
  | (RecurrenceBase & {
    type: 'monthly';
    mode: 'weekday';
    /**
     * Week-of-month selections:
     * 1 = 1st, 2 = 2nd, 3 = 3rd, 4 = 4th, -1 = last
     */
    weekOfMonth: Array<1 | 2 | 3 | 4 | -1>;
    /** 0–6 (Sun–Sat). Multiple allowed. */
    weekdays: number[];
  });

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

/**
 * Date-specific instance data for recurring tasks
 * Stages are per date instance. Comments are stored on the task itself (task.comments) and shared across all dates.
 */
export interface RecurrenceInstance {
  stages?: TaskStage[];        // Stages for this specific date instance
  status?: 'Pending' | 'In Progress' | 'Completed'; // Optional: per-instance status override
  startedAt?: string;         // Optional: per-instance startedAt
  completedAt?: string;       // Optional: per-instance completedAt
}

export interface Task {
  id: number;
  title: string;
  description?: string;
  status: 'Pending' | 'In Progress' | 'Completed';
  priority: 'Low' | 'Medium' | 'High';
  categoryId?: string;
  forDate: string;             // YYYY-MM-DD format (for recurring tasks, this is the start date)
  isBacklog?: boolean;         // Whether the task is in the backlog
  createdAt: string;           // ISO string of when task was created
  updatedAt: string;           // ISO string of last update
  startedAt?: string;          // ISO string when task was first started (for non-recurring or first instance)
  completedAt?: string;        // ISO string when task was completed (for non-recurring or first instance)
  comments?: Comment[];        // List of user comments (shared across all dates for recurring tasks)
  stages?: TaskStage[];        // List of task stages (for non-recurring tasks only)
  isPinned?: boolean;          // Whether the task is pinned
  pinTimestamp?: number | null; // Unix timestamp when pinned
  recurrence?: Recurrence;      // Optional recurrence configuration
  /**
   * Date-specific instances for recurring tasks
   * Key: date string (YYYY-MM-DD)
   * Value: instance-specific data (stages, comments, status overrides)
   * Only used when recurrence is defined
   */
  recurrenceInstances?: Record<string, RecurrenceInstance>;
  /**
   * Streak count for recurring tasks
   * Represents consecutive completed instances
   * Only used when recurrence is defined
   */
  streak?: number;
}

export const SOUND_OPTIONS = [
  {
    id: 0,
    name: 'Chime',
    icon: 'notifications' as const,
    color: '#FFFFFF',
    source: require('../assets/sounds/chime.mp3'),
  },
  {
    id: 1,
    name: 'Success',
    icon: 'celebration' as const,
    color: '#34C759',
    source: require('../assets/sounds/success.mp3'),
  },
  {
    id: 2,
    name: 'Alert',
    icon: 'campaign' as const,
    color: '#FF9500',
    source: require('../assets/sounds/alert.mp3'),
  },
  {
    id: 3,
    name: 'Mute',
    icon: 'volume-off' as const,
    color: '#8E8E93',
    source: null,
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
  { name: 'Teal', hex: '#00897B' },
  { name: 'Navy Blue', hex: '#1565C0' },
  { name: 'Lavender', hex: '#B39DDB' },
  { name: 'Amber', hex: '#FFC107' },
  { name: 'Rose', hex: '#E91E63' },
  { name: 'Cyan', hex: '#00BCD4' },
  { name: 'Lime', hex: '#CDDC39' },
  { name: 'Indigo', hex: '#3F51B5' },
  { name: 'Deep Orange', hex: '#FF5722' },
  { name: 'Brown', hex: '#795548' },
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
