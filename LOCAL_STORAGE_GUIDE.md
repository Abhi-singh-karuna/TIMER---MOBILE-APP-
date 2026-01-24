# 📱 Local Storage Guide - Timer & Task App

This document provides a comprehensive overview of how data is stored locally in this application. The project uses `@react-native-async-storage/async-storage` for persistent data storage.

---

## 🏗️ Storage Mechanism
- **Engine**: `AsyncStorage` (Persistent key-value storage)
- **Serialization**: All data is stored as **strings**. Complex objects and arrays are serialized using `JSON.stringify()` before storage and deserialized using `JSON.parse()` after retrieval.
- **Location**: On iOS, data is stored in a small SQLite database or flat files in the app's documents directory. On Android, it uses either RocksDB or SQLite depending on the version.

---

## 🔑 Primary Data Keys

### 1. Timers (`@timers`)
Stores the list of user-created timers.
- **Format**: `Timer[]` (JSON Array)
- **Structure**:
  ```typescript
  interface Timer {
    id: number;           // Unix timestamp of creation
    title: string;        // User-defined name
    time: string;         // Current remaining time (HH:MM:SS)
    total: string;        // Original duration (HH:MM:SS)
    status: 'Upcoming' | 'Running' | 'Paused' | 'Completed';
    tier: number;         // Priority tier
    forDate: string;      // YYYY-MM-DD
    categoryId?: string;  // Linked category ID
    // ... metadata for background sync & session tracking
    startedTimestamp?: number;
    remainingSecondsAtStart?: number;
    notificationId?: string;
  }
  ```

### 2. Tasks (`@timer_app_tasks`)
Stores all tasks, subtasks (stages), and comments.
- **Format**: `Task[]` (JSON Array)
- **Key Sub-structures**:
  - `stages`: Array of `TaskStage` (Subtasks with layout & 4-state status)
  - `comments`: Array of `Comment` objects
- **Structure**:
  ```typescript
  interface Task {
    id: number;
    title: string;
    description?: string;
    status: 'Pending' | 'In Progress' | 'Completed';
    priority: 'Low' | 'Medium' | 'High';
    forDate: string;      // YYYY-MM-DD
    stages?: TaskStage[]; // Subtasks (Detailed below)
    comments?: Comment[];
  }
  ```

### 4. Subtasks (`TaskStage`)
Subtasks (referred to as "stages" in the code) are stored within the `stages` array of a `Task` object.

- **Structure**:
  ```typescript
  interface TaskStage {
    id: number;                // Unique identifier (Date.now())
    text: string;              // Subtask description
    isCompleted: boolean;      // Legacy completion flag
    status: 'Upcoming' | 'Process' | 'Done' | 'Undone'; // Current state
    createdAt: string;         // ISO string
    startTimeMinutes?: number; // Start from 00:00 (for timeline layout)
    durationMinutes?: number;  // Length in minutes (for timeline layout)
    endTimeMinutes?: number;   // Calculated end time
    startTime?: string;        // ISO string (when started)
    endTime?: string;          // ISO string (when finished)
  }
  ```

### 5. Categories (`@timer_categories`)
User-defined task/timer categories.
- **Format**: `Category[]` (JSON Array)
- **Default Value**: Work, Exercise, Study.

### 4. Quick Messages (`@timer_quick_messages`)
Customizable quick-reply chips for task comments.
- **Format**: `QuickMessage[]` (JSON Array)

---

## 🎨 Theme & Setting Keys

| Key | Purpose | Format | Default |
| :--- | :--- | :--- | :--- |
| `@timer_active_id` | Last active timer ID | Number (as string) | `null` |
| `@timer_active_preset_index` | Selected color palette index | Number (as string) | `0` |
| `@timer_filler_color` | Timer progress fill color | Hex String | `#FFFFFF` |
| `@timer_slider_button_color`| UI control accent color | Hex String | `#FFFFFF` |
| `@timer_text_color` | Main display text color | Hex String | `#FFFFFF` |
| `@timer_completion_sound` | Sound ID for completion | Number (as string) | `0` (Chime) |
| `@timer_sound_repetition` | How many times to repeat alert | Number (as string) | `1` |
| `@timer_is_past_disabled` | Disable editing past timers | Boolean (as string) | `false` |
| `@task_is_past_disabled` | Disable editing past tasks | Boolean (as string) | `false` |

---

## 🛠️ Data Management Utility
The app provides a central utility for timer operations:
- **Location**: `src/utils/storage.ts`
- **Functions**: `loadTimers()`, `saveTimers()`, `addTimer()`, `deleteTimer()`

> [!TIP]
> **Debugging Tool**: You can view the raw local storage data in a debug environment (React Native Debugger) by running:
> ```javascript
> import AsyncStorage from '@react-native-async-storage/async-storage';
> AsyncStorage.getAllKeys().then(keys => {
>   AsyncStorage.multiGet(keys).then(data => console.log(data));
> });
> ```
