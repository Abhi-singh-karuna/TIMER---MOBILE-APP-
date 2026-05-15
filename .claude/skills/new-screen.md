---
name: new-screen
description: Guide for adding a new screen to the Chronoscape timer app
---

## Adding a New Screen

All screens live under `src/screens/Timer/<ScreenName>/index.tsx`.

### 1. Create the screen file

```
src/screens/Timer/<ScreenName>/index.tsx
```

Export a default React component. Receive all data and callbacks via props — this app has no Context or global state.

### 2. Add to navigation in App.tsx

The app uses manual screen switching via `currentScreen` state (`'list' | 'active' | 'complete' | 'settings'`) and `activeView` state (`'timer' | 'task' | 'goal'`).

- If it's a top-level screen: add a new value to the `Screen` type and add a `case` to `renderScreen()`.
- If it's a sub-view within the list screen: add a new value to `activeView` and add a branch in the `case 'list':` block.

### 3. Import and render in App.tsx

```tsx
import NewScreen from './src/screens/Timer/NewScreen';
```

Then wire it into `renderScreen()`:

```tsx
case 'newscreen':
  return <NewScreen onBack={() => setCurrentScreen('list')} />;
```

### 4. Key conventions

- Fonts: `PlusJakartaSans_*` for text, `Inter_900Black` for large numerals
- Landscape detection: `const { width, height } = useWindowDimensions(); const isLandscape = width > height;`
- All dates as `YYYY-MM-DD` strings; use `getLogicalDate(date, dailyStartMinutes)` for display/filtering
- Time values as `"HH:MM:SS"` strings — never raw `Date` objects in state
- Persist via `AsyncStorage` directly or via helpers in `src/utils/storage.ts`
