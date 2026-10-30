# Chronoscape

A productivity app for iOS and Android that combines countdown timers, tasks with subtasks, recurring habits and goals, with a full landscape "Live Focus" timeline. Built with React Native, Expo SDK 58 and TypeScript. All data is stored on the device, with optional Google Drive backup.

> Branch history and what changed in each commit: [BRANCH_v6.0.0_CHANGELOG.md](BRANCH_v6.0.0_CHANGELOG.md)

## Contents

1. [Features](#features)
2. [Quick start](#quick-start)
3. [Tech stack](#tech-stack)
4. [Project structure](#project-structure)
5. [How the app works](#how-the-app-works)
6. [Data models](#data-models)
7. [Local storage keys](#local-storage-keys)
8. [Building for iOS](#building-for-ios)
9. [Troubleshooting](#troubleshooting)
10. [Project conventions](#project-conventions)

---

## Features

**Timers**
- Multiple timers with a title, duration, category and priority tier.
- States: `Upcoming`, `Running`, `Paused`, `Completed`.
- Keeps counting in the background. A local notification is scheduled for completion, and remaining time is recalculated from timestamps when the app returns to the foreground.
- Extend a running or finished timer by +1, +5 or +10 minutes ("borrowed" time).
- Completion screen and popup show focused time as a ring: planned time in the category colour, extended time in yellow.
- Slide-to-complete, completion sounds with repeat count, haptics.

**Tasks**
- Tasks with status (`Pending`, `In Progress`, `Completed`), priority (`Low`, `Medium`, `High`), category, comments and a backlog.
- Subtasks ("stages") with four states (`Upcoming`, `Process`, `Done`, `Undone`), optional start time and duration, and drag-to-reorder priority.
- Recurring tasks: daily, weekly (chosen weekdays), monthly (dates or "2nd Tuesday"). Stages and status are stored per date; comments are shared across all dates.
- Quick-reply chips for comments, notes with lock, diary tab.

**Goals**
- Hierarchical goals with progress that rolls up to parents. Deleting a parent deletes its children.

**Live Focus (landscape)**
- A horizontal day timeline with a live "NOW" line, swimlanes, draggable and resizable task blocks, and zoom.

**Personalisation**
- Colour presets for the filler, slider and text, sound choice, categories, quick messages, time-of-day background colours, configurable "logical day" start (default 06:00), leave days.

**Backup**
- Google Drive backup (`appdata` scope) with auto-sync on app start and resume.

---

## Quick start

### Requirements

- Node.js (LTS) and npm
- For iOS builds: a Mac with Xcode and CocoaPods
- For Android builds: Android Studio and an emulator or device

### Install and run

```bash
git clone https://github.com/Abhi-singh-karuna/TIMER---MOBILE-APP-.git
cd TIMER---MOBILE-APP-
npm install
npx expo start --clear
```

| Shortcut | Action |
|---|---|
| `i` / `a` | Open the iOS simulator / Android emulator |
| `s` | Switch between Expo Go and development build |
| `r` | Reload |

Type check (there is no test suite):

```bash
npx tsc --noEmit
```

### Expo Go or development build?

| | Expo Go | Development build |
|---|---|---|
| UI and navigation | Works | Works |
| Local notifications | Limited | Works |
| Google Sign-In / Drive backup | Disabled (mocked) | Works |
| Native modules exactly as in `package.json` | No, Expo Go ships its own versions | Yes |

Use Expo Go for quick UI checks. Use a development build for anything involving notifications, background timers or Google Sign-In:

```bash
npx expo prebuild --platform ios --clean   # regenerate ios/ after SDK or plugin changes
npx expo run:ios --device                  # or run on the simulator: npx expo run:ios
npx expo start --dev-client --clear
```

Expo Go must match the SDK. This project uses **SDK 58**; if Expo Go says the project is incompatible, update Expo Go (iOS only offers the latest) or use a development build.

---

## Tech stack

| Area | Library |
|---|---|
| Framework | Expo SDK 58, React Native 0.88, React 19 |
| Language | TypeScript |
| Storage | `@react-native-async-storage/async-storage` |
| Gestures and animation | `react-native-gesture-handler`, `react-native-reanimated`, `react-native-worklets` |
| Drag to reorder | `react-native-reorderable-list` (task stages), `react-native-draggable-flatlist` (Settings lists) |
| Graphics | `expo-linear-gradient`, `expo-blur`, `react-native-svg`, `@expo/vector-icons` |
| Audio and feedback | `expo-audio`, `expo-haptics`, `expo-speech` |
| Background | `expo-notifications`, `expo-keep-awake` |
| Other | `expo-screen-orientation`, `expo-font` (Plus Jakarta Sans, Inter), `expo-sharing`, `expo-video`, `@react-native-google-signin/google-signin` |

Fonts: **Plus Jakarta Sans** (200 to 800) for text and **Inter Black** for large numbers.

---

## Project structure

```
.
├── App.tsx                    # Entry component and the single owner of all state
├── index.js                   # Registers the app (package.json "main")
├── app.json                   # Expo config (bundle id com.abhisheksingh.timerapp)
├── assets/                    # Icons, splash
└── src/
    ├── components/            # Shared UI: modals, WheelPicker, SlideToComplete, CompletionSummary
    │   └── GoalManagement/    # AddGoalModal
    ├── constants/data.ts      # Types (Timer, Task, TaskStage, Goal...), defaults, sound options
    ├── services/              # GoogleDriveService.ts
    ├── utils/                 # storage, backgroundTimer, dailyStartTime, recurrenceUtils, timeOfDaySlots
    ├── assets/sounds/         # chime, alert, success
    └── screens/Timer/
        ├── TimerList/         # Timer dashboard (also hosts the completion popup)
        ├── Task/              # Task list, task detail, LiveFocusView (landscape timeline)
        ├── GoalManagement/    # Goals (rendered inside Task via renderCustomContent)
        ├── ActivityTimer/     # Running timer
        ├── TaskComplete/      # Completion page
        ├── Settings/          # Section components composed by index.tsx
        ├── EmptyState/
        └── LandingPage/
```

---

## How the app works

### Navigation and state

There is no navigation library stack. `App.tsx` holds two pieces of state:

- `currentScreen`: `'list' | 'active' | 'complete' | 'settings'`
- `activeView`: `'timer' | 'task' | 'goal'`

| Screen | Shown when |
|---|---|
| `TimerList` | `currentScreen === 'list'` and `activeView === 'timer'` |
| `Task` | `currentScreen === 'list'` and `activeView === 'task'` |
| `GoalManagement` | `activeView === 'goal'` (injected into `Task`) |
| `ActivityTimer` | `currentScreen === 'active'` |
| `TaskComplete` | `currentScreen === 'complete'` |
| `Settings` | `currentScreen === 'settings'` |

`App.tsx` is the only state owner. Timers, tasks, goals, categories, colours and settings are `useState` hooks there, and screens get data and callbacks as props. New state goes in `App.tsx`. There is no Context or Redux.

### Logical day

The day starts at a user-set time (default 06:00, `DEFAULT_DAILY_START_MINUTES = 360`). Midnight still belongs to the previous day. Every comparison of a timer or task against `selectedDate` must go through `getLogicalDate(date, dailyStartMinutes)` in `src/utils/dailyStartTime.ts`.

### Recurring tasks

A recurring task is stored once. `expandTasksForDate()` and `expandRecurringTaskForDate()` in `src/utils/recurrenceUtils.ts` create per-date instances at render time. Saving stages or status writes to `recurrenceInstances[YYYY-MM-DD]` on the original task (`handleUpdateStages` in `App.tsx`). Syncing stages across dates is controlled by `SyncMode` (`'none' | 'all' | 'future'`) and the `repeatSync` flag.

### Background timers

When a timer starts, a notification is scheduled for its end (`src/utils/backgroundTimer.ts`). The timer stores `startedTimestamp` and `remainingSecondsAtStart`. On every resume, the `AppState` handler in `App.tsx` calls `syncTimersWithElapsedTime`, which recomputes remaining time from the clock.

### Google Drive backup

`src/services/GoogleDriveService.ts` uses Google Sign-In with the Drive `appdata` scope. In Expo Go, where native Google Sign-In does not exist, the module is replaced by a mock. Auto-sync runs on start and on resume.

### UI conventions

- Landscape is detected with `useWindowDimensions()` (`width > height`) and passed down as `isLandscape`.
- `LayoutAnimation` is used for view transitions (enabled on Android via `UIManager`).
- `GestureHandlerRootView` wraps the whole app.
- Task and stage time slots use `startTimeMinutes` and `durationMinutes` (minutes from midnight), not timestamps.

---

## Data models

Defined in `src/constants/data.ts`.

```ts
interface Timer {
  id: number;
  title: string;
  time: string;                       // remaining, "HH:MM:SS" or "MM:SS"
  total: string;                      // original length
  status: 'Upcoming' | 'Running' | 'Paused' | 'Completed';
  tier: number;
  forDate: string;                    // YYYY-MM-DD
  categoryId?: string;
  borrowedTime?: number;              // extended seconds
  borrowedTimeList: number[];
  savedTime?: number;                 // seconds left when finished early
  completedPercentage?: number;
  startTime?: string;                 // ISO, first start
  startedTimestamp?: number;          // epoch ms, last start (background sync)
  remainingSecondsAtStart?: number;
  pausedAt?: number;
  notificationId?: string;
  isAcknowledged?: boolean;
  isPinned?: boolean;
  pinTimestamp?: number | null;
  createdAt: string;
  updatedAt: string;
}

interface Task {
  id: number;
  title: string;
  description?: string;
  status: 'Pending' | 'In Progress' | 'Completed';
  priority: 'Low' | 'Medium' | 'High';
  categoryId?: string;
  forDate: string;
  isBacklog?: boolean;
  isPinned?: boolean;
  comments?: Comment[];               // shared across all dates of a recurring task
  stages?: TaskStage[];
  recurrence?: Recurrence;
  recurrenceInstances?: Record<string, RecurrenceInstance>; // per-date stages and status
  createdAt: string;
  updatedAt: string;
}

interface TaskStage {
  id: number;
  text: string;
  status: 'Upcoming' | 'Process' | 'Done' | 'Undone';
  isCompleted: boolean;               // legacy, kept for backward compatibility
  startTimeMinutes?: number;          // minutes from 00:00
  durationMinutes?: number;
  endTimeMinutes?: number;
  startTime?: string;                 // ISO, when it went to Process
  endTime?: string;                   // ISO, when it went to Done
  createdAt: string;
}

interface Category { id: string; name: string; icon: MaterialIconName; color: string; isEnabled?: boolean }
interface Comment  { id: number; text: string; createdAt: string }
```

`Goal` has a `parentId` and `progress`. Deleting a goal deletes its children, and progress aggregates upward.

---

## Local storage keys

Everything is stored as strings in AsyncStorage; objects are JSON.

**Data**

| Key | Content |
|---|---|
| `@timers` | `Timer[]` (via `src/utils/storage.ts`) |
| `@goals` | `Goal[]` (via `src/utils/storage.ts`) |
| `@timer_app_tasks` | `Task[]` (read and written in `App.tsx`) |
| `@timer_categories` | `Category[]` (defaults: Work, Exercise, Study) |
| `@timer_quick_messages` | Quick-reply chips for comments |
| `@timer_active_id` | Active timer id, used on cold start |
| `@timer_leave_days` | Leave and holiday dates |

**Appearance and behaviour**

| Key | Content |
|---|---|
| `@timer_active_preset_index`, `@timer_filler_color`, `@timer_slider_button_color`, `@timer_text_color`, `@timer_app_landscape_color` | Colour theme |
| `@timer_app_time_of_day_slots_v1` | Timeline background colour slots |
| `@timer_completion_sound`, `@timer_sound_repetition` | Completion sound and repeat count |
| `@timer_app_daily_start_minutes` | Logical-day start (default 360) |
| `@timer_is_past_disabled`, `@task_is_past_disabled`, `@timer_enable_future` | Edit restrictions for past and future dates |
| `@timer_app_live_focus_zoom`, `..._view_mode`, `..._scroll_x` | Live Focus view state |

**Notes and diary**

`@timer_app_general_notes`, `@timer_app_day_notes_v1`, `@timer_app_day_notes_v2`, `@timer_app_diary_folders`, `@timer_app_diary_templates`, `@timer_app_notes_font_size_v1`, `@timer_app_notes_locks_enabled_v1`, `@timer_app_notes_locks_max_attempts_v1`, `@timer_app_notes_locks_require_every_time_v1`

**Backup**

`@timer_last_sync_timestamp`, `@timer_auto_sync_time`, `@timer_auto_sync_frequency`

Inspect everything from a debug console:

```ts
AsyncStorage.getAllKeys().then(keys => AsyncStorage.multiGet(keys).then(console.log));
```

---

## Building for iOS

Follow the parts in order the first time. After that, Part 2 or Part 3 is all you repeat day to day.

The native project is `ios/` (git-ignored, generated by Expo). Its workspace is `ios/CHRONOSCAPE.xcworkspace`. Always open the `.xcworkspace`, never the `.xcodeproj`.

### Part 0: What you need (check once)

| Need | Check with | Expected |
|---|---|---|
| Xcode | `xcodebuild -version` | Xcode 16 or newer |
| CocoaPods | `pod --version` | 1.15 or newer. Install: `sudo gem install cocoapods` |
| Node and npm | `node -v` | A current LTS version is safest |
| Apple ID in Xcode | Xcode > Settings > Accounts | Your Apple ID is listed |
| iPhone | Cable plugged in, phone unlocked, "Trust This Computer" accepted | Shows up in Xcode > Window > Devices and Simulators |

A free Apple ID works for your own iPhone. The app expires after 7 days and must be reinstalled or refreshed (see Part 5).

### Part 1: Prepare the project (first time, and after every SDK or plugin change)

Do this now, because the current `ios/` folder was generated for SDK 54 and will not build the SDK 58 code.

1. Open Terminal in the project folder.
2. Install JavaScript packages:
   ```bash
   npm install
   ```
3. Check that package versions match SDK 58:
   ```bash
   npx expo install --check
   ```
   It should say the dependencies are up to date. The one exception is a warning about a package you intentionally pinned; there is none right now.
4. Delete and regenerate the native project:
   ```bash
   npx expo prebuild --platform ios --clean
   ```
   This also runs `pod install`. It takes a few minutes. It should end with "Finished prebuild".
5. Open the workspace:
   ```bash
   open ios/CHRONOSCAPE.xcworkspace
   ```
6. Set up signing (needed once after every `--clean` prebuild, because the folder is recreated):
   1. In the left sidebar click the blue **CHRONOSCAPE** project, then the **CHRONOSCAPE** target.
   2. Open the **Signing & Capabilities** tab.
   3. Tick **Automatically manage signing**.
   4. Under **Team** choose your **Personal Team** (your Apple ID).
   5. Leave the Bundle Identifier as `com.abhisheksingh.timerapp`. If Xcode says it is taken, change it to something unique such as `com.abhisheksingh.timerapp1`.
   6. If **Push Notifications** is listed, click the **x** to remove it. Free accounts do not support it. Local timer notifications still work.
   7. Under **Background Modes** untick **Remote notifications** if it is ticked.

   To avoid repeating step 6 after each clean prebuild, add your Team ID to `app.json` under `expo.ios`: `"appleTeamId": "YOURTEAMID"`. Find the ID at developer.apple.com > Membership, or in Xcode under Signing next to the team name.

### Part 2: Run on your iPhone (debug build)

Use this for daily work. The phone loads JavaScript live from your Mac, so you need to be on the same Wi-Fi.

1. Plug in the iPhone, unlock it, and tap **Trust**.
2. Enable Developer Mode on the phone: **Settings > Privacy & Security > Developer Mode > On**, then restart the phone when asked.
3. In Terminal:
   ```bash
   npx expo run:ios --device
   ```
   Pick your iPhone from the list. The first build takes 10 to 20 minutes.
4. The first time, the phone may say "Untrusted Developer". Go to **Settings > General > VPN & Device Management**, tap your Apple ID, and tap **Trust**.
5. Open the **Chronoscape** app on the phone (not Expo Go).
6. For later sessions you only need the dev server, and the app connects to it:
   ```bash
   npx expo start --dev-client --clear
   ```

You only rebuild (`run:ios`) again when you change native things: `app.json`, a native package, icons or the splash screen. JavaScript changes reload on their own.

### Part 3: Run on the simulator (no iPhone needed)

Your Mac has iOS runtimes but no simulator device yet.

1. In Xcode: **Window > Devices and Simulators > Simulators** tab, click **+**.
2. Choose a device (for example iPhone 16) and an OS version, then **Create**.
3. In Terminal:
   ```bash
   npx expo run:ios
   ```
4. For later sessions:
   ```bash
   npx expo start --dev-client --clear
   ```
   then press `i`.

The simulator cannot test background notifications or Google Sign-In the way a real phone does.

### Part 4: Release build and .ipa (for AltStore or TestFlight)

A Release build has the JavaScript built into the app, so it runs without your Mac. Xcode does the bundling automatically, so you do not run any bundle command by hand.

**Option A: install a Release build straight onto your iPhone**
```bash
npx expo run:ios --device --configuration Release
```

**Option B: make an .ipa file in Xcode**

1. Finish Part 1 (including signing).
2. Open `ios/CHRONOSCAPE.xcworkspace`.
3. In the device menu at the top choose **Any iOS Device (arm64)**.
4. Choose **Product > Archive**. Wait for it to finish; the Organizer window opens.
5. Select the archive and click **Distribute App**.
6. Choose **Development** (for AltStore or your own devices) or **TestFlight & App Store** (needs a paid Apple Developer account), then follow the prompts.
7. Click **Export** and pick a folder. The `.ipa` file is inside it.

Before you archive, bump `version` and the iOS `buildNumber` in `app.json`, run `npx tsc --noEmit`, and replace `assets/icon.png` and `assets/adaptive-icon.png` with real PNG files (they are currently JPGs with a `.png` name, which `expo-doctor` warns about). If you change `app.json` or the icons, run `npx expo prebuild --platform ios --clean` again.

### Part 5: Install with AltStore

1. Install AltServer on your Mac and keep it running.
2. Put the iPhone and Mac on the same Wi-Fi.
3. Open AltStore on the iPhone, tap **+**, and choose the `.ipa`.
4. A free Apple ID certificate lasts 7 days. AltStore refreshes it automatically while AltServer is running and the phone is on the same network.

### Quick reference

| I want to... | Run |
|---|---|
| Start coding again | `npx expo start --dev-client --clear` |
| Rebuild after a native change | `npx expo prebuild --platform ios --clean`, then `npx expo run:ios --device` |
| Test the final app on my phone | `npx expo run:ios --device --configuration Release` |
| Make an .ipa | Part 4, Option B |
| Fix weird build errors | `rm -rf node_modules ios/build ~/Library/Developer/Xcode/DerivedData`, `npm install`, then Part 1 |

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "Project is incompatible with this version of Expo Go" | Expo Go and the project SDK differ. Update Expo Go, or use a development build. |
| `TypeError: undefined is not a function` at startup in Expo Go | Native and JavaScript versions of a module differ. Keep packages at the versions `npx expo install --check` expects, then restart with `npx expo start --clear`. |
| "Unable to resolve module" right after installing a package | Stale Metro cache. Stop Metro and run `npx expo start --clear`. |
| "Google Sign-In: .configure() ignored in Expo Go" | Expected in Expo Go. Use a development build for Drive backup. |
| `Build input file cannot be found: main.jsbundle` | You are following an old guide. Do not bundle by hand. Run `npx expo prebuild --platform ios --clean` and build again; Xcode bundles the JavaScript itself. |
| Xcode reports missing files in `node_modules/.../expo-keep-awake` or other nested packages | Deep clean: `rm -rf node_modules ios/build ~/Library/Developer/Xcode/DerivedData`, then `npm install`, `npx expo prebuild --platform ios --clean`. If pods still fail, run `cd ios && pod install --repo-update`. |
| "Provisioning Profile Expired" | Free certificates last 7 days. In Xcode open **Signing & Capabilities**, click **Try Again**, or untick and re-tick **Automatically manage signing** and reselect your Personal Team. |
| "Personal development teams do not support Push Notifications" | Remove the **Push Notifications** capability and untick **Remote notifications** under Background Modes. Local timer notifications still work. |
| Icons or splash not updating | `npx expo prebuild --platform ios`, then rebuild. |
| Stage drag feels stuck | Use `react-native-reorderable-list`. `react-native-draggable-flatlist` is not maintained for Reanimated 4 and is still used only in the Settings lists. |

---

## Project conventions

- Instructions for Claude Code are in [CLAUDE.md](CLAUDE.md), and task guides are in `.claude/skills/`. These are tool configuration, not documentation, so they stay as they are.
- Commit messages follow `type(scope): summary` (`feat`, `fix`, `chore`, `docs`). The branch log in [BRANCH_v6.0.0_CHANGELOG.md](BRANCH_v6.0.0_CHANGELOG.md) lists each commit on `v.6.0.0`; add a row for every new one.
- Static validation is `npx tsc --noEmit`. Manual test scenarios for timers and recurring tasks are in `.claude/skills/timer-testing/SKILL.md`.
