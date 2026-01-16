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
}
