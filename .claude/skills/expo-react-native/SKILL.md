---
name: expo-react-native
description: Expo SDK 54 API guardrails and React Native conventions specific to this project
---

## Expo SDK 54 Guidelines

This project uses **Expo SDK 54** (`expo ~54.0.33`, React Native 0.81.5, React 19). Do not upgrade the SDK or swap native libraries without explicit approval.

### Audio — use expo-audio, not expo-av

`expo-audio` (~1.1.1) is installed. `expo-av` is **not installed** and has been superseded.

```ts
import { AudioModule } from 'expo-audio';

await AudioModule.setAudioModeAsync({ playsInSilentMode: true });
const player = AudioModule.createAudioPlayer(soundSource);
player.play();
```

Usage in this codebase: `src/screens/Timer/TaskComplete/index.tsx`, `Settings/AudioSection.tsx`, `TimerList/index.tsx`.

### Notifications — TIME_INTERVAL trigger only

`expo-notifications` (~0.32.16). Use `SchedulableTriggerInputTypes.TIME_INTERVAL` when scheduling:

```ts
import * as Notifications from 'expo-notifications';

await Notifications.scheduleNotificationAsync({
  content: { title: '...', body: '...' },
  trigger: {
    type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
    seconds: secondsRemaining,
  },
});
```

The Android notification channel `'timer-completion'` and iOS permission request are both handled by `src/utils/backgroundTimer.ts`. Use the helpers there (`scheduleTimerNotification`, `cancelTimerNotification`, `requestNotificationPermissions`) rather than calling `expo-notifications` directly.

### Google Sign-In — not supported in Expo Go

`@react-native-google-signin/google-signin` is **mocked** when `Constants.appOwnership === AppOwnership.Expo`. Calling `signIn()` will throw with a clear message. This guard is in `src/services/GoogleDriveService.ts` — do not remove it.

Google Drive backup only works in a development build:
```bash
npx expo run:ios    # or run:android
```

### Background execution — no JS thread, timestamp pattern only

iOS and Android suspend the JS thread when the app is backgrounded. There is no `setInterval` that survives suspension. Elapsed time is tracked via wall-clock timestamps:

- On start/resume: set `startedTimestamp = Date.now()` and `remainingSecondsAtStart = currentSeconds` on the timer object.
- On foreground: `AppState` listener in `App.tsx` detects the `background → active` transition and calls `syncTimersWithElapsedTime`.
- On pause: clear both fields from the timer object.

See [`timer-model`](../timer-model.md) for the complete data model.

### LayoutAnimation + Android

`LayoutAnimation` is used for view transitions. The Android enablement call is already in `App.tsx` — do not add it again:

```ts
UIManager.setLayoutAnimationEnabledExperimental?.(true);
```

### GestureHandlerRootView

`GestureHandlerRootView` wraps the entire app in `App.tsx`. All `react-native-gesture-handler` components (`Swipeable`, `GestureDetector`, `DraggableFlatList`, etc.) work anywhere in the tree. Do not add another wrapper.

### TypeScript

```bash
npx tsc --noEmit
```

No test suite. TypeScript checking is the only static validation. See [`typecheck`](../typecheck.md).
