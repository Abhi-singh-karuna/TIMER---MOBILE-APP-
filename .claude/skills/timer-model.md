---
name: timer-model
description: Quick reference for the Timer data model and background tracking in Chronoscape
---

## Timer Data Model

```ts
{
  id: number,                      // Date.now() at creation
  title: string,
  time: string,                    // current remaining time "HH:MM:SS"
  total: string,                   // original total time "HH:MM:SS"
  status: 'Upcoming' | 'Running' | 'Paused' | 'Completed',
  forDate: string,                 // YYYY-MM-DD
  categoryId?: string,
  startedTimestamp?: number,       // Date.now() when last started/resumed
  remainingSecondsAtStart?: number,// seconds remaining when started/resumed
  notificationId?: string,         // scheduled notification ID
  borrowedTime?: number,           // total extra seconds added
  borrowedTimeList: number[],      // list of each borrow amount
  savedTime?: number,              // seconds remaining at force-complete
  completedPercentage?: number,    // % elapsed at force-complete
  isAcknowledged?: boolean,        // user has seen the completion screen
  isPinned?: boolean,
}
```

## Background time tracking

When the app goes to background, iOS/Android may suspend it. The pattern to track elapsed time accurately:

1. **On start/resume**: store `startedTimestamp = Date.now()` and `remainingSecondsAtStart = currentSeconds`
2. **On resume from background**: `elapsed = Date.now() - startedTimestamp; remaining = remainingSecondsAtStart - elapsed`
3. **On pause**: clear both fields
4. **On save**: `saveTimers()` persists to `@timers` AsyncStorage key

`syncTimersWithElapsedTime()` in `App.tsx` handles this recalculation and is called on every `AppState` change to 'active'.

## Time string helpers (App.tsx)

- `timeToSeconds("HH:MM:SS")` → number
- `secondsToTime(n)` → `"HH:MM:SS"`

## Only one timer can run at a time

`handlePlayPause` pauses any currently running timer before starting a new one. The active timer ID is persisted to `@timer_active_id` for cold-start restoration.
