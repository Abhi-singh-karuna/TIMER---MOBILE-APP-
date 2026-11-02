import { Recurrence } from '../constants/data';
import { getLogicalDate, getStartOfLogicalDay } from './dailyStartTime';

/**
 * Normalizes a date string to YYYY-MM-DD format
 * Handles various input formats and ensures consistency
 */
function normalizeDateString(dateStr: string): string {
  // If already in YYYY-MM-DD format, return as-is
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }

  // Try to parse and reformat
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    return dateStr; // Return original if invalid
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Checks if a recurring task should appear on a given date
 */
export function shouldRecurOnDate(recurrence: Recurrence, targetDate: string): boolean {
  const target = new Date(targetDate);
  const start = new Date(recurrence.startDate);
  const end = recurrence.endDate ? new Date(recurrence.endDate) : null;

  // Check if target date is before start date
  if (targetDate < recurrence.startDate) {
    return false;
  }

  // Check if target date is after end date
  if (recurrence.endDate && targetDate > recurrence.endDate) {
    return false;
  }

  switch (recurrence.type) {
    case 'daily':
      // Daily recurrence: every day from start to end
      return true;

    case 'weekly': {
      // Weekly recurrence: check if target date's weekday is in the days array
      const targetWeekday = target.getDay();
      return recurrence.days.includes(targetWeekday);
    }

    case 'monthly': {
      if (recurrence.mode === 'date') {
        // Monthly date mode: check if target date's day-of-month is in the dates array
        const targetDay = target.getDate();
        return recurrence.dates.includes(targetDay);
      } else {
        // Monthly weekday mode: check if target date matches the week-of-month and weekday
        const targetWeekday = target.getDay();
        if (!recurrence.weekdays.includes(targetWeekday)) {
          return false;
        }

        // Calculate which occurrence of this weekday this is in the month
        const year = target.getFullYear();
        const month = target.getMonth();
        const day = target.getDate();

        // Count occurrences of this weekday before/on this day
        let occurrence = 0;
        for (let d = 1; d <= day; d++) {
          const testDate = new Date(year, month, d);
          if (testDate.getDay() === targetWeekday) {
            occurrence++;
          }
        }

        // Check if this is the last occurrence
        const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
        let isLast = true;
        for (let d = day + 7; d <= lastDayOfMonth; d += 7) {
          const testDate = new Date(year, month, d);
          if (testDate.getDay() === targetWeekday) {
            isLast = false;
            break;
          }
        }

        const weekOfMonth: 1 | 2 | 3 | 4 | -1 = isLast ? -1 : (Math.min(occurrence, 4) as 1 | 2 | 3 | 4);
        return recurrence.weekOfMonth.includes(weekOfMonth);
      }
    }
  }
}

/**
 * Returns all YYYY-MM-DD dates where a recurring task should appear.
 * Capped at MAX_RECURRING_DAYS from start (or until endDate if set).
 */
const MAX_RECURRING_DAYS = 730; // ~2 years

export function getAllRecurringDates(task: import('../constants/data').Task): string[] {
  if (!task.recurrence) return [];
  const recurrence = task.recurrence;
  const startDate = new Date(recurrence.startDate);
  const endDate = recurrence.endDate ? new Date(recurrence.endDate) : null;
  const maxDate = endDate
    ? endDate
    : new Date(startDate.getTime() + MAX_RECURRING_DAYS * 24 * 60 * 60 * 1000);

  const dates: string[] = [];
  const currentDate = new Date(startDate);

  while (currentDate <= maxDate) {
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const day = String(currentDate.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    if (shouldRecurOnDate(recurrence, dateStr)) {
      dates.push(dateStr);
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return dates;
}

/**
 * Expands recurring tasks into instances for a given date
 * Returns the original task with the forDate set to the target date if it should recur
 * For recurring tasks, includes date-specific stages from recurrenceInstances; comments are on the task and shared across dates
 */
export function expandRecurringTaskForDate(task: import('../constants/data').Task, targetDate: string): import('../constants/data').Task | null {
  // Safety check: ensure task exists
  if (!task || !task.id) {
    return null;
  }

  if (!task.recurrence) {
    // Non-recurring task: only show if forDate matches
    return task.forDate === targetDate ? task : null;
  }

  // Recurring task: check if it should appear on this date
  if (shouldRecurOnDate(task.recurrence, targetDate)) {
    // Get date-specific instance data if it exists
    // Normalize the date to ensure consistent format matching
    const normalizedTargetDate = normalizeDateString(targetDate);

    // Try to find instance data by checking all possible date formats
    // This handles cases where dates might be stored in slightly different formats
    let instanceData = task.recurrenceInstances?.[normalizedTargetDate] ||
      task.recurrenceInstances?.[targetDate];

    // If still not found, try checking all keys with normalized comparison
    if (!instanceData && task.recurrenceInstances) {
      const matchingKey = Object.keys(task.recurrenceInstances).find(key =>
        normalizeDateString(key) === normalizedTargetDate
      );
      if (matchingKey) {
        instanceData = task.recurrenceInstances[matchingKey];
      }
    }

    // Safety check: ensure task has status property (for backward compatibility with old data)
    const taskStatus = (task.status || 'Pending') as import('../constants/data').Task['status'];

    // Return a copy with the forDate set to the target date
    // Include date-specific stages and status overrides; comments are on the task and shared across dates
    // Keep the original task ID so we can edit the original
    return {
      ...task,
      forDate: normalizedTargetDate, // Use normalized date for consistency
      // Override with date-specific stages if available; comments come from task (shared for recurring)
      stages: instanceData?.stages ? [...instanceData.stages] : [],
      comments: task.comments ? [...task.comments] : [],
      // Use instance-specific status if provided, otherwise use task status (with fallback)
      status: instanceData?.status ?? taskStatus,
      // Use instance-specific timestamps if provided
      startedAt: instanceData?.startedAt ?? task.startedAt,
      completedAt: instanceData?.completedAt ?? task.completedAt,
      // Pass through streak from the original recurring task
      streak: task.streak,
    };
  }

  return null;
}

/**
 * Expands all tasks for a given date, including recurring tasks
 */
export function expandTasksForDate(
  tasks: import('../constants/data').Task[],
  targetDate: string
): import('../constants/data').Task[] {
  const expanded: import('../constants/data').Task[] = [];

  for (const task of tasks) {
    // Safety check: skip null/undefined tasks
    if (!task || !task.id) continue;

    const expandedTask = expandRecurringTaskForDate(task, targetDate);
    if (expandedTask) {
      expanded.push(expandedTask);
    }
  }

  return expanded;
}

/**
 * Finds the original recurring task from an expanded instance
 * When editing an expanded recurring task, we need to find the original task
 */
export function findOriginalRecurringTask(
  tasks: import('../constants/data').Task[],
  expandedTask: import('../constants/data').Task
): import('../constants/data').Task | null {
  // If the task has recurrence, it's already the original
  if (expandedTask.recurrence) {
    return expandedTask;
  }

  // Otherwise, find the original task by ID
  // Expanded tasks keep the same ID as the original
  return tasks.find(t => t.id === expandedTask.id && t.recurrence) || null;
}

/**
 * Calculates the streak count for a recurring task
 * Streak is the number of consecutive completed instances, counting backwards from today
 * Only counts instances that are completed (status === 'Completed')
 */
export function calculateStreak(
  task: import('../constants/data').Task,
  dailyStartMinutes: number = 360,
  leaveDays: string[] = []
): number {
  if (!task.recurrence) {
    return 0;
  }

  // If recurrenceInstances doesn't exist, initialize as empty object
  const recurrenceInstances = task.recurrenceInstances || {};

  // Get all dates that should recur, sorted in descending order (newest first)
  const today = new Date();
  const startDate = new Date(task.recurrence.startDate);
  const endDate = task.recurrence.endDate ? new Date(task.recurrence.endDate) : null;

  // Generate all recurring dates up to today
  const recurringDates: string[] = [];
  const currentDate = new Date(startDate);

  // Helper to get logical date string
  const getLogicalDateStr = (date: Date): string => {
    return getLogicalDate(date, dailyStartMinutes);
  };

  const todayLogical = getLogicalDateStr(today);

  while (currentDate <= today) {
    const dateStr = getLogicalDateStr(currentDate);

    // Check if this date should recur
    if (shouldRecurOnDate(task.recurrence, dateStr)) {
      // Check if this date should recur
      // Exclude today's logical date per user request ("no need streak for a current day")
      if (dateStr === todayLogical) {
        // Skip
      } else if (endDate && task.recurrence.endDate && dateStr > task.recurrence.endDate) {
        break;
      } else {
        recurringDates.push(dateStr);
      }
    }

    // Move to next day
    currentDate.setDate(currentDate.getDate() + 1);
  }

  // Sort dates in descending order (newest first)
  recurringDates.sort((a, b) => b.localeCompare(a));

  // Count consecutive completed instances from the most recent
  let streak = 0;
  for (const dateStr of recurringDates) {
    const normalizedDate = normalizeDateString(dateStr);

    // Check if this date is a leave day
    if (leaveDays.includes(normalizedDate)) {
      continue; // Skip leave days (don't break streak, don't increment)
    }

    const instance = recurrenceInstances[normalizedDate] ||
      recurrenceInstances[dateStr];

    // Check if this instance is completed
    if (instance?.status === 'Completed' ||
      (instance?.completedAt && !instance.status)) {
      streak++;
    } else {
      // Break streak if we find a non-completed instance
      break;
    }
  }

  return streak;
}

/**
 * Gets the status for recent recurring dates
 * Returns an array of objects with date and task status
 * Shows minimum 7 dates for display purposes
 */
export function getRecentRecurringDatesStatus(
  task: import('../constants/data').Task,
  dailyStartMinutes: number = 360,
  minDates: number = 7,
  leaveDays: string[] = []
): Array<{ date: string; status: 'Completed' | 'In Progress' | 'Pending' | 'Leave' }> {
  if (!task.recurrence || !task.recurrenceInstances) {
    return [];
  }

  const today = new Date();
  const startDate = new Date(task.recurrence.startDate);
  const endDate = task.recurrence.endDate ? new Date(task.recurrence.endDate) : null;

  const recurringDates: string[] = [];
  const currentDate = new Date(startDate);

  const getLogicalDateStr = (date: Date): string => {
    return getLogicalDate(date, dailyStartMinutes);
  };

  while (currentDate <= today) {
    const dateStr = getLogicalDateStr(currentDate);

    if (shouldRecurOnDate(task.recurrence, dateStr)) {
      if (endDate && task.recurrence.endDate && dateStr > task.recurrence.endDate) {
        break;
      }
      recurringDates.push(dateStr);
    }

    currentDate.setDate(currentDate.getDate() + 1);
  }

  // Filter out today's logical date per user request ("no need streak for a current day")
  const todayLogical = getLogicalDateStr(today);
  const filteredRecurringDates = recurringDates.filter(d => d !== todayLogical);

  // Sort dates in descending order (newest first) and take at least minDates
  filteredRecurringDates.sort((a, b) => b.localeCompare(a));
  const recentDates = filteredRecurringDates.slice(0, Math.max(minDates, filteredRecurringDates.length));

  const instances = task.recurrenceInstances;
  // Get status for each date
  return recentDates.map(dateStr => {
    const normalizedDate = normalizeDateString(dateStr);
    const instance = instances?.[normalizedDate] || instances?.[dateStr];

    // Determine status: Completed, In Progress, Pending, or Leave
    let status: 'Completed' | 'In Progress' | 'Pending' | 'Leave' = 'Pending';

    if (leaveDays.includes(normalizedDate)) {
      status = 'Leave';
    } else if (instance?.status === 'Completed' ||
      (instance?.completedAt && !instance.status) ||
      (instances?.[normalizedDate]?.completedAt)) {
      status = 'Completed';
    } else if (instance?.status === 'In Progress') {
      // Only use explicit status; do not treat startedAt alone as In Progress so Pending shows red
      status = 'In Progress';
    } else {
      status = 'Pending';
    }

    return {
      date: dateStr,
      status,
    };
  });
}
