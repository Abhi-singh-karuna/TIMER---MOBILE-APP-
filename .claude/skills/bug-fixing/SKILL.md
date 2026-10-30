---
name: bug-fixing
description: Diagnostic process for finding and fixing bugs in Chronoscape with minimal scope
---

## Fixing a Bug

### 1. Read the data flow before editing

Trace the issue from `App.tsx` down to the component before changing anything. Every bug in this app is one of:
- A state value set incorrectly in an `App.tsx` handler.
- A prop not passed or passed with the wrong value.
- A persistence/restore mismatch (AsyncStorage load or `normalizeStages` migration).

Reference skills for the data models:
- [`timer-model`](../timer-model.md) — Timer lifecycle, `startedTimestamp`, `remainingSecondsAtStart`
- [`task-model`](../task-model.md) — Task stages, recurring instance vs shared data rules

### 2. Check the three most common root causes

**Logical-date bug.** Any filter or comparison involving dates must use `getLogicalDate(date, dailyStartMinutes)` from `src/utils/dailyStartTime.ts`. Raw `new Date()` comparisons fail around midnight because 00:00–06:00 belongs to the previous logical day.

**Recurring task direct read.** Never read `task.stages` directly for a recurring task. Call `expandTasksForDate(tasks, dateStr)` (from `src/utils/recurrenceUtils.ts`) to get the correct per-date virtual instance. Writing stages back must go through `handleUpdateStages` in `App.tsx` — it writes to `recurrenceInstances[YYYY-MM-DD]` and handles `SyncMode` propagation.

**Background timer stale state.** When the app returns from background, `AppState` fires `'active'` and `App.tsx` calls `syncTimersWithElapsedTime`. This recalculates remaining time using `startedTimestamp` and `remainingSecondsAtStart`. Any timer that jumps, freezes, or shows wrong time after backgrounding starts here.

### 3. Fix scope

Apply the minimal change that corrects the behavior. Do not:
- Refactor surrounding code.
- Rename variables or clean up unrelated issues in the same change.
- Add error handling for cases that cannot actually occur.

### 4. Validate

```bash
npx tsc --noEmit
```

See the [`typecheck`](../typecheck.md) skill. Fix all TypeScript errors before considering the bug closed.
