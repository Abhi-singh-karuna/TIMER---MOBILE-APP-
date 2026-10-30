# Branch `v.6.0.0` — change log

Tracks every commit on this branch. **Add a new row/section for each new commit.**

- **Base:** `v.5.0.0` @ `24ac4fe` (Expo SDK 54, React Native 0.81.5)
- **Goal:** upgrade to Expo SDK 58 with no visual or behavioural change
- **Rollback:** `git checkout v.5.0.0` then `npm install`

## Commit index

| # | Commit | Type | Summary |
|---|--------|------|---------|
| 1 | `3840ea3` | chore(deps) | Upgrade Expo SDK 54 → 58 (package.json, package-lock.json) |
| 2 | `bfd2ca1` | chore(config) | Migrate app.json and babel.config.js for SDK 58 |
| 3 | `20f8b28` | fix | Adapt code to React Native 0.88 / expo-audio 58 APIs |
| 4 | _this commit_ | docs | Add this change log |

## Details

### 1. `3840ea3` — dependency upgrade
- expo 54 → 58, react-native 0.81.5 → 0.88.1, react 19.1 → 19.3
- reanimated 4.1 → 4.7, worklets 0.5 → 0.13, gesture-handler 2.28 → 3.3
- all `expo-*` packages aligned with `npx expo install --fix`
- removed `overrides` pinning `react-native-worklets` to 0.5.1
- `@types/react` and `typescript` moved out of `dependencies` (now devDependencies, TS 6)
- Note: this commit alone does not type-check; it needs commit 3.

### 2. `bfd2ca1` — config
- `app.json`: removed `newArchEnabled`, `android.edgeToEdgeEnabled`, top-level `splash`
- `app.json`: added `expo-splash-screen` plugin (same image, contain, `#000000`)
- `babel.config.js`: removed `react-native-reanimated/plugin` (added by `babel-preset-expo`)

### 3. `20f8b28` — code compatibility (no visual change)
- `StyleSheet.absoluteFillObject` → `StyleSheet.absoluteFill` (many files)
- `AudioModule.createAudioPlayer` → `createAudioPlayer` (TaskComplete, TimerList, AudioSection)
- `ScrollView`/`View` ref types → `ScrollViewInstance` / `HostInstance` (LiveFocusView, ThemeSection, GoalManagement, TimerList, Task, WheelPicker)
- `NodeJS.Timeout` → `ReturnType<typeof setTimeout>` (App.tsx, LiveFocusView)
- `appState.current?.match(...)` in App.tsx
- removed invalid `scaleX`/`scaleY` style props (CategorySection, QuickMessageSection) — were already ignored

## Verification status
- [x] `npx tsc --noEmit` passes
- [x] `npx expo export --platform ios` bundles
- [ ] Manual run on simulator/device (cards, timers, live focus, settings, landscape)
- [ ] Sounds, background notifications, Google sign-in on a dev build

## Known leftovers
- `assets/icon.png` and `assets/adaptive-icon.png` are JPG files with a `.png` extension (pre-existing; `expo-doctor` warns). Re-export as real PNGs before a store build.
