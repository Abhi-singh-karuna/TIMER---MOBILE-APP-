# Branch `v6.0.0_ios_stable_old` (formerly `v.6.0.0`) — change log

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
| 4 | `06e8afb` | docs | Add this change log |
| 5 | `9ce1b99` | fix(deps) | Pin gesture-handler to 2.33.1 to fix stage drag stalling |
| 6 | `15a893d` | docs | Log gesture-handler pin |
| 7 | `b990392` | fix(audio) | Use exported `setAudioModeAsync` |
| 8 | `90295d5` | docs | Log audio fix |
| 9 | `4d3cbb2` | revert | Revert gesture-handler 2.33.1 pin (Expo Go crashed on native mismatch) |
| 10 | `8488bd5` | fix(task) | Remove LayoutAnimation from stage drag |
| 11 | `319a576` | docs | Log revert and drag fix |
| 12 | `207d123` | fix(task) | Replace draggable-flatlist with reorderable-list for stage drag |
| 13 | `37713f5` | docs | Log reorderable-list swap |
| 14 | `a9a3981` | fix(task) | White dragged stage card restored |
| 15 | `5d9123c` | docs | Log white drag card fix |
| 16 | `a942538` | fix(task) | Held stage card shrinks (0.96) instead of growing |
| 17 | `371c0b5` | docs | Log held card size fix |
| 18 | `eb0c33a` | feat(complete) | Unified completion design (popup + page) |
| 19 | `15f50ae` | docs | Log completion redesign |
| 20 | `44f8e35` | feat(complete) | Completion design changed to the session ring (design B) |
| 21 | `ee03428` | docs | Log completion design B |
| — | `e98a3f2` | feat | Skills and guides under `.claude/skills` (committed outside this chat) |
| 22 | `502c87e` | docs | Single README; 11 old Markdown docs removed |
| 23 | `b317e65` | docs | Fix hash in branch log |
| 24 | `769ab31` | docs(readme) | iOS build section rewritten as step-by-step parts |
| 25 | `261352f` | docs | Log iOS build guide rewrite |
| 26 | `be6809a` | feat(scripts) | Version bump and iOS cache cleanup scripts, README Parts 6 and 7 |
| 27 | `79e7915` | docs | Log scripts in branch log |
| 28 | `d5c017b` | docs(readme) | README simplified, troubleshooting removed |
| 29 | `24c2797` | docs | Log README simplification |
| 30 | `6df906a` | docs(readme) | Note: install the matching iOS platform in Xcode > Settings > Components |
| 31 | `c47b94e` | docs | Log iOS platform note |
| 32 | `3434cc3` | docs | Add plan/settings-plan.html and link it in the README |
| 33 | `59b15d2` | docs | Fix hash in branch log |
| 34 | `83f2438` | docs(plan) | Add plan/goals-plan.html and link it in the README |

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

### 5. `9ce1b99` — stage drag stuck (gesture-handler)
- Symptom: in the expanded task view, holding and dragging a subtask/stage to change priority was stuck/not smooth
- Cause (suspected, not yet confirmed on device): gesture-handler 3.x deprecates the builder API used by `react-native-draggable-flatlist` 4.0.3 (last release May 2025)
- Fix: `react-native-gesture-handler` 3.3.0 → 2.33.1 (`legacy` tag), exact pin
- `package.json` `expo.install.exclude` keeps `expo install --fix` from reverting it
- If drag is still rough, next options: replace the library or remove `LayoutAnimation` from the drag callbacks in `Task/index.tsx`

### 7. `b990392` — audio mode
- `AudioModule.setAudioModeAsync` → exported `setAudioModeAsync` (TaskComplete, TimerList, AudioSection)

### 9. `4d3cbb2` — revert of the gesture-handler pin
- Reverts `9ce1b99`. The 2.33.1 JS did not match the native 3.3 built into Expo Go, causing `TypeError: undefined is not a function` at startup
- gesture-handler is back to 3.3.0 (matches SDK 58 and Expo Go)

### 10. `8488bd5` — smoother stage drag
- Removed `LayoutAnimation.configureNext` from `onDragBegin` / `onDragEnd` of the stage `DraggableFlatList` in `Task/index.tsx`
- If drag is still rough on a dev build, next option is replacing `react-native-draggable-flatlist`

### 12. `207d123` — new drag library for stages
- Symptoms: drag stuck; warnings `[Reanimated] Dependencies should only be used on the web` and `error during concurrent rendering`
- `react-native-draggable-flatlist` 4.0.3 → `react-native-reorderable-list` 0.18.2 (exact) in `Task/index.tsx`
- Row extracted to `StageRow` (uses `useReorderableDrag`, `useIsActive`); markup/styles unchanged
- Still on the old library: Settings `CategorySection` and `QuickMessageSection` lists

### 14. `a9a3981` — white dragged card
- Added `shouldUpdateActiveItem` (required by `useIsActive`) and `cellAnimations={{ opacity: 1 }}` on the stage `ReorderableList`

### 16. `a942538` — held card size
- Library default scales the held card to 1.025x, which got clipped at the list's left/right edges
- `cellAnimations` now uses a `dragScale` shared value (0.96 while dragging, 1 on release) via `onDragStart`/`onDragEnd` worklets in `Task/index.tsx`

### 18. `eb0c33a` — unified completion design ("Hero ring")
- New `src/components/CompletionSummary.tsx`, used by `TaskComplete` (page) and the `TimerList` completion popup
- Shows: category-coloured check ring, COMPLETED, timer title, focused time (original + extended), category chip, Started -> Ended timeline, Extended amount, +1m/+5m/+10m, one white primary button (Back to Home / CLOSE)
- Labels and time format unified (Started / Ended / Extended, 24h HH:MM)
- `App.tsx` passes `title` and `totalTime` to `TaskComplete`
- Old popup/page layouts and their now-unused styles were left in the stylesheets (can be cleaned up later)

### 20. `44f8e35` — completion screen, design B (session ring)
- Replaces the design from #18 after review; same shared `CompletionSummary.tsx`
- Ring (react-native-svg): planned time in category colour, extended time in yellow, focused time in the centre
- 2x2 grid: Started / Ended / Planned / Extended; extend buttons and the primary button share one row in landscape
- Landscape = ring left, details right; portrait stacks them; popup uses smaller sizes

### 22. documentation consolidated into one README
- New `README.md` covers features, setup, architecture, data models, storage keys, iOS build and troubleshooting, checked against the current code (SDK 58, no React Navigation, expo-audio)
- Removed (still in git history): `APP_DOCUMENTATION`, `APP_FEATURES_AND_FLOW`, `ARCHITECTURE`, `STORAGE_DATA_MODEL`, `TASK_STORAGE_GUIDE`, `LOCAL_STORAGE_GUIDE`, `IOS_BUILD_GUIDE`, `LOCAL_IOS_BUILD_GUIDE`, `IOS_RELEASE_BUILD_GUIDE`, `NAMING_OPTIONS`, `WEBSITE_PLAN_AND_REQUIREMENTS`
- Kept: `README.md`, `BRANCH_v6.0.0_CHANGELOG.md`, `CLAUDE.md` and `.claude/skills/*` (Claude Code configuration)

### 24. `769ab31` — iOS build guide
- README "Building for iOS" is now Part 0 to Part 5 plus a quick reference
- Verified against the machine: `ios/` was still SDK 54 (needs `prebuild --clean`), no Apple team set in the project, iPhone listed offline, no simulator device created
- Removed the manual `react-native bundle` / `main.jsbundle` steps: the Xcode project already has the "Bundle React Native code and images" phase, so Release builds bundle JS themselves

### 26. `be6809a` — scripts
- `scripts/bump-version.js`: `npm run version:build|patch|minor|major` updates `app.json` (version, ios.buildNumber, android.versionCode), `Info.plist` and the Xcode project; `--dry-run` supported. Tested on backed-up copies.
- `scripts/clean-ios-cache.sh`: `npm run ios:clean` (light) and `npm run ios:clean:deep`; `--dry-run` supported
- README "Building for iOS": Part 6 (update version) and Part 7 (clear caches after success or failure)

### 28. `d5c017b` — simpler README
- README cut from about 500 lines to about 120: removed the troubleshooting table, data-model and storage-key lists, and the extra iOS parts
- Kept: features, run, iOS build steps, version bump, cache clean, structure, short how-it-works
- The long version is in git history (`git show 79e7915:README.md`)

## Verification status
- [x] `npx tsc --noEmit` passes
- [x] `npx expo export --platform ios` bundles
- [ ] Manual run on simulator/device (cards, timers, live focus, settings, landscape)
- [ ] Sounds, background notifications, Google sign-in on a dev build

## Known leftovers
- `assets/icon.png` and `assets/adaptive-icon.png` are JPG files with a `.png` extension (pre-existing; `expo-doctor` warns). Re-export as real PNGs before a store build.
