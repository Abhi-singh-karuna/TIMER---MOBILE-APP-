# Local Storage Data Model

The **TIMER_APP** uses `AsyncStorage` to persist timer data and user settings. All data is stored as stringified JSON or plain strings.

## 1. Timer Data
**Key:** `@timers`
**Format:** Array of `Timer` objects (JSON stringified).

### Timer Interface
```typescript
interface Timer {
  id: number;           // Unique identifier
  title: string;        // Name of the timer
  time: string;         // Current remaining time (HH:MM:SS)
  total: string;        // Original total time (HH:MM:SS)
  status: 'Upcoming' | 'Running' | 'Paused' | 'Completed';
  tier: number;         // UI tier/category
  completedPercentage?: number; // % completed (for force-complete)
  borrowedTime?: number;        // Total seconds added/borrowed
  savedTime?: number;          // Seconds remaining when stopped early
  startTime?: string;          // ISO string of first start
  startedTimestamp?: number;   // Epoch MS of last start (for background sync)
  remainingSecondsAtStart?: number; // Seconds left when last start occurred
  notificationId?: string;     // ID of the scheduled iOS/Android notification
  isAcknowledged?: boolean;    // Whether the completion alert has been shown
  createdAt: string;           // ISO string of creation
  updatedAt: string;           // ISO string of last update
  borrowedTimeList: number[];  // Array of seconds borrowed
}
```

## 2. Global Settings
These values store the persistent UI state and user preferences.

| Key | Description | Format | Example |
| :--- | :--- | :--- | :--- |
| `@timer_active_id` | ID of the currently active timer | String (Number) | `"17370362145"` |
| `@timer_active_preset_index` | Index of the selected color palette | String (Number) | `"0"` |
| `@timer_filler_color` | Main UI filler color (Hex) | String | `"#00E5FF"` |
| `@timer_slider_button_color` | Slider button color (Hex) | String | `"#00E5FF"` |
| `@timer_text_color` | Main UI text color (Hex) | String | `"#FFFFFF"` |
| `@timer_completion_sound` | Index of the selected completion sound | String (Number) | `"1"` |
| `@timer_sound_repetition` | Number of times to repeat the sound | String (Number) | `"3"` |

### TypeScript Definition
You can use this object structure for typed access to global settings:

```typescript
interface GlobalVariables {
  activeTimerId: string | null;
  activePresetIndex: number;
  fillerColor: string;
  sliderButtonColor: string;
  textColor: string;
  selectedSound: number;
  soundRepetition: number;
}

const globalVariables: GlobalVariables = {
  activeTimerId: "@timer_active_id",
  activePresetIndex: "@timer_active_preset_index",
  fillerColor: "@timer_filler_color",
  sliderButtonColor: "@timer_slider_button_color",
  textColor: "@timer_text_color",
  selectedSound: "@timer_completion_sound",
  soundRepetition: "@timer_sound_repetition",
};
```

## 3. Usage Example
To retrieve and log the timers manually in a debug console:

```javascript
import AsyncStorage from '@react-native-async-storage/async-storage';

const checkData = async () => {
  const timers = await AsyncStorage.getItem('@timers');
  console.log(JSON.parse(timers));
};
```
