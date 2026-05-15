# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Start development server (Expo)
npx expo start --clear

# Run on iOS simulator
npx expo run:ios

# Run on Android emulator
npx expo run:android

# Run in Expo Go (scan QR code)
npx expo start
```

There are no test commands — the project has no test suite. TypeScript type checking is the main static validation tool:

```bash
npx tsc --noEmit
```

## Architecture

**Chronoscape** is an Expo/React Native productivity app (SDK 54, React 19, TypeScript). The app is a single-screen navigator managed entirely in `App.tsx` — there is no React Navigation stack; instead `currentScreen` state (`'list' | 'active' | 'complete' | 'settings'`) and `activeView` state (`'timer' | 'task' | 'goal'`) control what renders.

### State ownership

`App.tsx` is the sole state owner. All data (timers, tasks, goals, categories, colors, settings) lives here as `useState` hooks. Screens receive data and callbacks via props — there is no Context, Redux, or other global state. When adding state, it goes in `App.tsx`.

### Key data models (`src/constants/data.ts`)

- **`Timer`** — countdown timer with `status: 'Upcoming' | 'Running' | 'Paused' | 'Completed'`. Time stored as `"HH:MM:SS"` strings. Background tracking uses `startedTimestamp` + `remainingSecondsAtStart` so elapsed time can be recalculated when the app resumes.
- **`Task`** — todo item with `stages: TaskStage[]` (subtasks), `recurrence?: Recurrence`, and `recurrenceInstances?: Record<string, RecurrenceInstance>`. For recurring tasks, **stages and status are per date** (stored in `recurrenceInstances`), while **comments are shared across all dates** (stored on the task).
- **`Goal`** — hierarchical goal with `parentId` and `progress`. Child deletions cascade; progress aggregates upward to parents.
- **`TaskStage`** — subtask with 4-state `status: 'Upcoming' | 'Process' | 'Done' | 'Undone'` plus legacy `isCompleted: boolean` (kept for backward compatibility).

### Persistence

All data is stored in `AsyncStorage`. Key storage keys:
- `@timers` — timers array (via `src/utils/storage.ts`)
- `@goals` — goals array (via `src/utils/storage.ts`)
- `@timer_app_tasks` — tasks array (persisted directly in `App.tsx`)
- `@timer_categories`, `@timer_quick_messages` — user-configured lists
- `@timer_app_daily_start_minutes` — configurable day rollover time (default 06:00)
- `@timer_app_time_of_day_slots_v1` — timeline background color slots

### Logical date system (`src/utils/dailyStartTime.ts`)

The "day" starts at a user-configured time (default 06:00 AM, `DEFAULT_DAILY_START_MINUTES = 360`). All date comparisons for filtering timers/tasks by `selectedDate` must go through `getLogicalDate(date, dailyStartMinutes)`. Midnight is treated as still belonging to the previous logical day.

### Recurring tasks (`src/utils/recurrenceUtils.ts`)

Recurring tasks are stored **once** in the tasks array. `expandTasksForDate()` / `expandRecurringTaskForDate()` generate virtual per-date instances at render time. When saving stages or status changes, `handleUpdateStages` in `App.tsx` writes back to `recurrenceInstances[YYYY-MM-DD]` on the original task. Stage sync across dates is controlled by `SyncMode: 'none' | 'all' | 'future'` and the `repeatSync` flag on the recurrence config.

### Screen structure (`src/screens/Timer/`)

| Screen | Route trigger |
|--------|--------------|
| `TimerList/` | `currentScreen === 'list'` + `activeView === 'timer'` |
| `Task/` | `currentScreen === 'list'` + `activeView === 'task'` |
| `GoalManagement/` | Injected via `renderCustomContent` prop into `Task/` when `activeView === 'goal'` |
| `ActivityTimer/` | `currentScreen === 'active'` |
| `TaskComplete/` | `currentScreen === 'complete'` |
| `Settings/` | `currentScreen === 'settings'` |

Settings is split into section components (`ThemeSection`, `AudioSection`, `CategorySection`, `DailyStartTimeSection`, etc.) composed by `Settings/index.tsx`.

### Background timer notifications (`src/utils/backgroundTimer.ts`)

When a timer starts, a local notification is scheduled for when it will complete. `startedTimestamp` + `remainingSecondsAtStart` enable accurate elapsed-time recalculation on foreground resume. The `AppState` change handler in `App.tsx` calls `syncTimersWithElapsedTime` on every resume.

### Google Drive backup (`src/services/GoogleDriveService.ts`)

Uses `@react-native-google-signin/google-signin` with Drive `appdata` scope. The module guards against Expo Go (which doesn't support native Google Sign-In) with a mock. Auto-sync runs on app start and resume.

### UI patterns

- Primary font: **Plus Jakarta Sans** (weights 200–800) + **Inter Black** for numeric displays.
- Landscape mode is detected via `useWindowDimensions()` (`width > height`) and passed as `isLandscape` prop.
- `LayoutAnimation` is used for view transitions (enabled for Android via `UIManager.setLayoutAnimationEnabledExperimental`).
- `GestureHandlerRootView` wraps the entire app for `react-native-gesture-handler` support.
- Task/stage time slots use `startTimeMinutes` / `durationMinutes` (minutes from midnight), not ISO timestamps.
