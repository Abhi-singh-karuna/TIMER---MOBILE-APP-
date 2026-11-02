# Chronoscape

A productivity app for iOS and Android with countdown timers, tasks with subtasks, recurring habits, goals, and a landscape "Live Focus" timeline. Built with React Native, Expo SDK 58 and TypeScript. Data is stored on the device, with optional Google Drive backup.

Branch history: [BRANCH_v6.0.0_CHANGELOG.md](BRANCH_v6.0.0_CHANGELOG.md)

## Branches

`main` is the latest branch. Start new work from `main`.

| Date | Branch | Previous name | Status | Notes |
|---|---|---|---|---|
| 2026-11-02 | `main` | | **Latest** | Contains everything from `v6.0.0_ios_stable_old` (merged in PR #12). Use this for new work and builds. |
| 2026-11-02 | `v6.0.0_ios_stable_old` | `v.6.0.0` | Merged into `main`, kept as a reference | Expo SDK 58 upgrade, reorderable stage list, new completion screen, infinite duration wheels. The stable iOS baseline before the Live Focus redesign. |

## Features

- **Timers:** multiple timers with categories, background countdown with notifications, extend by +1, +5 or +10 minutes, completion screen and sounds.
- **Tasks:** priority, status, comments, backlog, subtasks (stages) with drag-to-reorder, recurring tasks (daily, weekly, monthly).
- **Goals:** hierarchical goals with progress that rolls up to the parent.
- **Live Focus:** landscape day timeline with a live "now" line and draggable task blocks.
- **Personalisation:** colour themes, sounds, categories, quick messages, custom day start time.
- **Backup:** Google Drive backup.

## Run the app

```bash
npm install
npx expo start --clear
```

Press `i` for the iOS simulator or `a` for Android. Expo Go is fine for quick UI checks. Notifications and Google Sign-In need a development build (see below).

Check types (there are no automated tests):

```bash
npx tsc --noEmit
```

## Build for iOS

You need a Mac with Xcode and CocoaPods, and your Apple ID added in **Xcode > Settings > Accounts**. The workspace is `ios/CHRONOSCAPE.xcworkspace`.

### 1. Prepare (first time, and after changing `app.json`, native packages or icons)

```bash
npm install
npx expo prebuild --platform ios --clean
open ios/CHRONOSCAPE.xcworkspace
```

In Xcode: click the **CHRONOSCAPE** project, open **Signing & Capabilities**, tick **Automatically manage signing**, and choose your **Personal Team**. Remove **Push Notifications** if it is listed (free accounts don't support it).

### 2. Run on your iPhone

Plug in the phone, unlock it, tap **Trust**, and turn on **Settings > Privacy & Security > Developer Mode**.

Xcode must have the iOS platform that matches your phone's iOS version. If the device shows "iOS 26.5 is not installed", open **Xcode > Settings > Components**, find that iOS version, and click **Get** (several GB, one time). Then:

```bash
npx expo run:ios --device
```

The first build takes 10 to 20 minutes. If the phone says "Untrusted Developer", go to **Settings > General > VPN & Device Management** and trust your Apple ID. For later sessions, start only the dev server:

```bash
npx expo start --dev-client --clear
```

### 3. Run on the simulator

Create a device once in **Xcode > Window > Devices and Simulators > Simulators > +**, then:

```bash
npx expo run:ios
```

### 4. Make an .ipa (Release build)

1. `npm run version:build` (see "Update the version" below).
2. `open ios/CHRONOSCAPE.xcworkspace`
3. Choose **Any iOS Device (arm64)** at the top, then **Product > Archive**.
4. In the Organizer click **Distribute App**, choose **Development** (AltStore) or **TestFlight & App Store**, and export.

To install a Release build straight onto your phone instead: `npx expo run:ios --device --configuration Release`.

For AltStore: keep AltServer running on your Mac, open AltStore on the phone, tap **+**, and pick the `.ipa`. Free certificates last 7 days and AltStore refreshes them.

### Update the version

```bash
npm run version:build    # build number +1 (same version, new upload)
npm run version:patch    # 1.0.0 -> 1.0.1
npm run version:minor    # 1.0.0 -> 1.1.0
npm run version:major    # 1.0.0 -> 2.0.0
```

This updates `app.json`, `Info.plist` and the Xcode project together. Add `-- --dry-run` to preview. The build number must increase on every TestFlight or App Store upload.

### Clean caches (after a build, success or failure)

Close Xcode and stop Metro first.

```bash
npm run ios:clean          # light: this app's DerivedData, ios/build, Metro cache
npm run ios:clean:deep     # deep: all DerivedData, ios/Pods, CocoaPods cache
cd ios && pod install      # only needed after a deep clean
```

Add `-- --dry-run` to preview. Neither command touches your code, `node_modules`, certificates or Xcode Archives.

## Project structure

```
App.tsx                  Entry component and the single owner of all state
scripts/                 bump-version.js, clean-ios-cache.sh
plan/                    Planning pages (settings-plan.html, goals-plan.html)
src/
  components/            Shared UI: modals, pickers, CompletionSummary
  constants/data.ts      Data types and defaults (Timer, Task, TaskStage, Goal, Category)
  services/              Google Drive backup
  utils/                 Storage, background timers, day start time, recurrence
  screens/Timer/         TimerList, Task, GoalManagement, ActivityTimer,
                         TaskComplete, Settings
```

## How it works

- **Screens:** there is no navigation library. `App.tsx` keeps `currentScreen` (`list`, `active`, `complete`, `settings`) and `activeView` (`timer`, `task`, `goal`) and renders the matching screen.
- **State:** all data lives in `App.tsx` and is passed to screens as props. New state goes there.
- **Storage:** AsyncStorage. Timers use `@timers`, goals `@goals`, tasks `@timer_app_tasks`. Types are in `src/constants/data.ts`.
- **Logical day:** the day starts at a set time (default 06:00). Compare dates with `getLogicalDate()` from `src/utils/dailyStartTime.ts`.
- **Recurring tasks:** stored once, expanded per date at render time by `src/utils/recurrenceUtils.ts`.
- **Background timers:** a notification is scheduled when a timer starts, and remaining time is recalculated from timestamps when the app returns.

## Plans

- [Settings simplification plan](plan/settings-plan.html): to-do list and per-page impact for simplifying the Settings screens. Open the file in a browser. Online copy: https://claude.ai/artifact/6e334ctR3Phh4QSsoyfppY (private to the owner).
- [Goals improvement plan](plan/goals-plan.html): findings, design mockups and a phased to-do list for improving goals. Open the file in a browser. Online copy: https://claude.ai/artifact/RRyd4BPca1BkhqUhnWDfv7 (private to the owner).

Instructions for Claude Code are in [CLAUDE.md](CLAUDE.md) and `.claude/skills/`.
