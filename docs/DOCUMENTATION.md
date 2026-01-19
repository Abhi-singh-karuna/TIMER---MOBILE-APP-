# TIMER_APP Documentation

The **TIMER_APP** is a robust productivity tool built with **React Native** and **Expo**. It combines high-precision timer management with an integrated task system, allowing users to plan, track, and analyze their time spent on various activities.

---

## 1. App Overview

### Core Purpose
To help users manage their time effectively through customizable timers and tasks, organized by categories and dates, with a strong emphasis on visual clarity and user experience (UX).

### Tech Stack
- **Framework**: React Native (Expo SDK 54)
- **Language**: TypeScript
- **State Management**: React Hooks (`useState`, `useEffect`, `useRef`)
- **Persistence**: `AsyncStorage`
- **Audio/Notifications**: `expo-av`, `expo-notifications`
- **UI/UX**: `expo-linear-gradient`, `expo-blur`, `expo-haptics`

### Main Navigation Flow
1.  **Timer/Task Toggle**: Switch between Timer-centric and Task-centric views.
2.  **Dashboard**: Analytics view providing a snapshot of daily progress.
3.  **Calendar**: Date-based navigation to view and manage data for specific days.
4.  **Settings**: Centralized configuration for themes, audio, and organizational data.

---

## 2. Timer Feature

The **Timer** feature is designed for precise activity tracking with modular configuration and background support.

### Features
- **Dynamic Creation**: Define timers with specific Hours, Minutes, and Seconds.
- **Tier System**: Timers are categorized (Tiers) to help organize and prioritize activities.
- **Date Association**: Each timer is bound to a specific date (`forDate`).
- **Time Borrowing**: Extend the duration of a running or completed timer.
- **Background Sync**: Uses timestamps to recalculate remaining time when the app is minimized.
- **Notifications**: Alerts the user upon completion even when the app is in the background.
- **Early Completion**: "Slide to Complete" gesture to finish early and track "Saved Time".

### Local Storage - Timers
Timers are persisted using `AsyncStorage` with the key `@timer_app_timers`.

**Timer Data Model:**
```typescript
interface Timer {
  id: number;           // Unique timestamp-based ID
  title: string;        // Name of the timer
  time: string;         // Current remaining time (HH:MM:SS)
  total: string;        // Original total time (HH:MM:SS)
  status: 'Upcoming' | 'Running' | 'Paused' | 'Completed';
  tier: number;         // UI tiering
  forDate: string;      // YYYY-MM-DD
  categoryId?: string;
  createdAt: string;   // ISO string
  updatedAt: string;   // ISO string
  
  // Background tracking
  startedTimestamp?: number;       // Last start unix timestamp
  remainingSecondsAtStart?: number; // Seconds left when last started
  notificationId?: string;          // Scheduled notification ID
  
  // Session tracking
  borrowedTime?: number;            // Total seconds borrowed
  borrowedTimeList: number[];       // History of borrows (seconds)
  savedTime?: number;               // Seconds remaining if finished early
  completedPercentage?: number;     // Completion percentage for stats
  isAcknowledged?: boolean;         // Completion acknowledged in UI
}
```

---

## 3. Task Feature

The **Task** feature provides a classic todo-style management system integrated within the high-performance UI of the app.

### Features
- **Status Flow**: `Pending` → `In Progress` → `Completed`.
- **Priority System**: `Low`, `Medium`, or `High` priority levels.
- **Sub-Timers**: Associate multiple timers with a single task.
    - Tasks with sub-timers automatically transition to `In Progress` when the first timer starts.
    - Tasks automatically mark as `Completed` once ALL associated sub-timers are finished.
- **Date Separation**: Organized by date for daily planning.
- **Backlog Support**: Unscheduled tasks for later assignment.
- **Commenting System**: Add multiple detailed comments to each task.
- **Category Tagging**: Associate tasks with categories for visual grouping.

### Local Storage - Tasks
Tasks are persisted using `AsyncStorage` with the key `@timer_app_tasks`.

**Task Data Model:**
```typescript
interface Task {
  id: number;
  title: string;
  description?: string;
  status: 'Pending' | 'In Progress' | 'Completed';
  priority: 'Low' | 'Medium' | 'High';
  categoryId?: string;
  forDate: string;      // YYYY-MM-DD
  isBacklog?: boolean;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;   // ISO string of first start
  completedAt?: string; // ISO string of completion
  comments?: Comment[]; // Nested comments
  timerIds?: number[];  // Associated timer IDs
}

interface Comment {
  id: number;
  text: string;
  createdAt: string;
}
```

---

## 4. Settings Feature

The **Settings** feature allows users to customize the app's aesthetics and behavior.

### Customization Modules
- **Themes**: Switch between color presets (Monochrome, Dark Knight, Neon Cyan) or define custom colors for filler, slider, and text.
- **Audio**: Select completion sounds (Chime, Success, Alert) and configure repetition count.
- **Organizational**: CRUD management for Categories and Quick Messages.
- **General**: Option to lock/disable interaction with past timers and tasks.

### Local Storage - Settings
Global configurations are stored individually or in clusters.

| Key | Description | Format |
|:---|:---|:---|
| `@timer_filler_color` | Primary theme color | Hex String |
| `@timer_slider_button_color`| Secondary theme color | Hex String |
| `@timer_text_color` | Main text color | Hex String |
| `@timer_active_preset_index`| Index of active theme preset | Number String |
| `@timer_completion_sound` | Selected sound ID (0-3) | Number String |
| `@timer_sound_repetition` | Number of times sound repeats | Number String |
| `@timer_categories` | Array of `Category` objects | JSON String |
| `@timer_quick_messages` | Array of `QuickMessage` objects | JSON String |
| `@task_is_past_disabled` | Toggle for locking past tasks | Boolean String |
| `@timer_is_past_disabled` | Toggle for locking past timers | Boolean String |
