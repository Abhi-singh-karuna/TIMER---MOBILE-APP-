# 📱 Chronoscape - Technical Documentation

## 1. Executive Summary
This application is **Chronoscape**, a professional-grade mobile timer and task management solution built with **React Native** and **Expo**. It combines high-precision timing functionality with robust task tracking, designed for productivity enthusiasts. The app features a stunning, dynamic UI that adapts to device orientation, offering a card-based interface in portrait mode and an immersive, full-screen progress experience in landscape mode.

## 2. core Features & Functional Requirements

### 2.1 Timer Management
- **Creation**: Users can create multiple timers with custom titles, durations, and priority tiers.
- **Micro-states**: Timers support `Upcoming`, `Running`, `Paused`, and `Completed` states.
- **Persistence**: Timers are saved locally and state is preserved across app restarts.
- **Background Support**: Notifications are scheduled for timer completion even if the app is backgrounded.
- **Recalculation**: The app intelligently recalculates remaining time based on timestamps when returning from the background.

### 2.2 Task Management
- **CRUD Operations**: Complete creation, reading, updating, and deletion of tasks.
- **Prioritization**: Tasks can be assigned Low, Medium, or High priority.
- **Status Tracking**: Tasks move through `Pending` -> `In Progress` -> `Completed` states.
- **Subtasks (Stages)**: Complex tasks can be broken down into subtasks (stages) with their own statuses (`Upcoming`, `Process`, `Done`, `Undone`) and timing (start time, duration).
- **Recurrence**: Support for powerful recurrence patterns:
  - **Daily**: Repeat every day.
  - **Weekly**: Select specific days of the week (e.g., Mon, Wed, Fri).
  - **Monthly**: By specific dates (e.g., on the 1st and 15th) or relative days (e.g., 2nd Tuesday).
  - **Logic**: Recurrence instances are generated per date, while comments are shared across all instances of a recurring task.
- **Comments**: Users can add timestamped comments to tasks for context or logs.
- **Quick Messages**: Pre-defined quick reply chips (e.g., "STARTED !!", "DONE !") for rapid commenting.

### 2.3 Organization & Analytics
- **Categories**: Tasks and timers can be organized into color-coded categories (Default: Work, Exercise, Study).
- **Daily Progress**: Visual tracking of daily streaks and completion rates.
- **Backlog**: Tasks can be moved to a backlog to declutter the active view.
- **Logical Day**: The "day" can be configured to start at a custom time (e.g., 4:00 AM) rather than midnight.

### 2.4 User Experience & Customization
- **Orientation Adaptation**:
  - **Portrait**: List and card view for management.
  - **Landscape**: "Focus Mode" with large visuals and gesture controls.
- **Theming**: Deep customization of colors (fillers, sliders, text) and sound themes (Chime, Success, Alert).
- **Haptics & Audio**: Interactive feedback through haptic vibrations and custom sound effects.

## 3. Data Architecture

### 3.1 Storage Strategy
- **Engine**: `@react-native-async-storage/async-storage`
- **Pattern**: Data is serialized to JSON strings.
- **Keys**:
  - `@timers`: Array of Timer objects.
  - `@timer_app_tasks`: Array of Task objects.
  - `@timer_categories`: User-defined categories.
  - `@timer_active_id`: ID of the currently active timer.
  - Preferences keys: `@timer_filler_color`, `@timer_text_color`, etc.

### 3.2 Data Models (TypeScript Interfaces)

#### **Timer**
```typescript
interface Timer {
  id: number;
  title: string;
  time: string; // Remaining time (MM:SS)
  total: string; // Total duration (MM:SS)
  status: 'Upcoming' | 'Running' | 'Paused' | 'Completed';
  tier: number;
  forDate: string; // YYYY-MM-DD
  categoryId?: string;
  // Background tracking
  startedTimestamp?: number;
  remainingSecondsAtStart?: number;
}
```

#### **Task**
```typescript
interface Task {
  id: number;
  title: string;
  status: 'Pending' | 'In Progress' | 'Completed';
  priority: 'Low' | 'Medium' | 'High';
  stages?: TaskStage[]; // Subtasks
  recurrence?: Recurrence; // Recurrence config
  recurrenceInstances?: Record<string, RecurrenceInstance>; // Per-date data
  streak?: number;
}
```

#### **Task Stage (Subtask)**
```typescript
interface TaskStage {
  id: number;
  text: string;
  status: 'Upcoming' | 'Process' | 'Done' | 'Undone';
  startTimeMinutes?: number; // Minutes from daily start
  durationMinutes?: number;
}
```

## 4. Technical Architecture

### 4.1 Technology Stack
- **Core Framework**: React Native (via Expo SDK 50+)
- **Language**: TypeScript
- **Navigation**: React Navigation (Native Stack)
- **State Management**: React `useState` / `useReducer` with context pattern (centralized in `App.tsx` for global state).
- **Styling**: `react-native-linear-gradient` and custom component styling.
- **Fonts**: `expo-google-fonts` (Inter, Plus Jakarta Sans).

### 4.2 Application Flow
1.  **Initialization**: `App.tsx` loads fonts, permissions, and rehydrates state from AsyncStorage.
2.  **Normalization**: Tasks are normalized on load to ensure data consistency (checking broken recurrence links or missing fields).
3.  **Background Handling**: `AppState` listeners detect foreground/background transitions to sync timer states and handle notifications.
4.  **Navigation**: Simple stack navigation between `TimerList`, `ActivityTimer`, and `Settings`.

### 4.3 Key Utilities
- `storage.ts`: Centralized wrapper for AsyncStorage operations.
- `backgroundTimer.ts`: Manages notification scheduling and time calculations.
- `recurrenceUtils.ts`: Handles complex logic for calculating next occurrences and streak tracking.
- `dailyStartTime.ts`: Manages the concept of a "Logical Day" (shifting the day start hour).

## 5. Directory Structure
```
/
├── App.tsx                 # Entry Point & Global State
├── src/
│   ├── components/         # Reusable UI (Modals, Pickers)
│   ├── config/             # App-wide configuration
│   ├── constants/          # Data models, Types, Colors
│   ├── screens/            # Screen Components
│   │   ├── Timer/          # Timer & Task feature screens
│   │   └── Settings/       # Settings screens
│   └── utils/              # Helper logic (Storage, Time, Recurrence)
└── assets/                 # Icons, Sounds, Images
```

## 6. Future Considerations & Scalability
- **State Management**: As the app grows, migrating from `App.tsx` state to a dedicated library like `Zustand` or `Redux` would improve maintainability.
- **Cloud Sync**: The current local-only storage could be extended to a backend (Firebase/Supabase) for cross-device sync.
- **Optimization**: Listing rendering (`StartPage.tsx`, `TimerList.tsx`) could be optimized for large datasets using `FlashList` or improved memoization.
