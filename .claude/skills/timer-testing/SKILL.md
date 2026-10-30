---
name: timer-testing
description: Manual testing protocol for timer accuracy, background sync, notifications, persistence, and recurring tasks
---

## Timer Testing Protocol

There is no automated test suite. Run these scenarios manually after any change to timer logic, `App.tsx` state handlers, `src/utils/backgroundTimer.ts`, or recurring task utilities.

Reference skills: [`timer-model`](../timer-model.md), [`task-model`](../task-model.md), [`start-dev`](../start-dev.md).

Start the dev server:
```bash
npx expo start --clear
```

---

### Scenario 1 — Full timer lifecycle

1. Create a new timer (2 minutes).
2. Verify status is `Upcoming`.
3. Press play → status becomes `Running`, countdown starts.
4. Press pause → countdown freezes, status is `Paused`.
5. Press play → countdown resumes from the exact paused position.
6. Let it reach zero → completion screen appears, status is `Completed`.

**Pass:** all status transitions correct; no time drift between pause and resume.

---

### Scenario 2 — Background sync accuracy

1. Create a 3-minute timer and start it.
2. Note the displayed remaining time (e.g. 2:45).
3. Background the app for 10 seconds.
4. Foreground the app.

**Expected:** timer shows ~10 seconds less than when backgrounded (±1 s).

This relies on `startedTimestamp` + `remainingSecondsAtStart` fields on the timer and `syncTimersWithElapsedTime` being called from the `AppState` listener in `App.tsx`. See [`timer-model`](../timer-model.md).

---

### Scenario 3 — Notification delivery

1. Create a 30-second timer.
2. Start it and immediately lock the device or background the app.

**Expected:** a notification titled "Timer Complete!" fires ~30 seconds later.

If the notification does not fire: verify `scheduleTimerNotification` in `src/utils/backgroundTimer.ts` returned a non-null notification ID, and that `requestNotificationPermissions()` was called on startup.

---

### Scenario 4 — Cold-start persistence

1. Start a 5-minute timer.
2. Force-quit the app entirely (swipe it away from the app switcher).
3. Reopen the app.

**Expected:** the timer is still `Running` and the displayed time accounts for the elapsed time while the app was closed (within ±2 s).

This relies on `@timer_active_id` in AsyncStorage and `syncTimersWithElapsedTime` running on cold start. See [`timer-model`](../timer-model.md).

---

### Scenario 5 — Recurring task date isolation

1. Create a recurring daily task with 2 subtasks.
2. Mark both subtasks `Done` for today.
3. Navigate to tomorrow's date using the date selector.

**Expected:** tomorrow's instance shows both subtasks as `Upcoming`. Today's completions are not carried over.

Stages for each date are stored in `task.recurrenceInstances[YYYY-MM-DD].stages`. Tomorrow's key should be absent (not yet written) until stages are modified for that date. See [`task-model`](../task-model.md).

---

### Edge cases

| Case | What to verify |
|------|----------------|
| Borrow time mid-run | `borrowedTime` total increments; `borrowedTimeList` gains a new entry each borrow |
| Force-complete a running timer | `savedTime` = seconds remaining at completion; `completedPercentage` = % elapsed; status = `Completed` |
| Pin a timer | `isPinned = true`; `pinTimestamp` set; timer moves to top of list |
| Start a second timer | First running timer is paused automatically — only one timer runs at a time (`handlePlayPause` in `App.tsx`) |
| Reopen app with no active timer | `@timer_active_id` absent; no timer auto-starts |
