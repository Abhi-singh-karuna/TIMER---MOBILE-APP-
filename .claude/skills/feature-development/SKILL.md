---
name: feature-development
description: Workflow for implementing new features following the Chronoscape architecture
---

## Implementing a New Feature

### 1. Read before writing

Trace the data flow end-to-end before touching any file. Every feature follows one path:

```
App.tsx (state + handlers) → props → screen component → UI
```

Reference skills:
- [`timer-model`](../timer-model.md) — Timer data model and background tracking
- [`task-model`](../task-model.md) — Task, recurring task, and stage model

### 2. Add state to App.tsx

All new shared state goes in `App.tsx`. There is no Context, Redux, or cross-component shared state.

```ts
const [myValue, setMyValue] = useState<MyType>(defaultValue);
```

If the value is only used inside a single screen and never needs to persist, local `useState` inside that screen is acceptable.

### 3. Add persistence

Every piece of state that must survive an app restart needs an AsyncStorage key.

Follow the [`add-storage-key`](../add-storage-key.md) skill for the full checklist:
- Define the key constant at the top of `App.tsx` (or in `src/constants/data.ts` if shared across files).
- Load it in the `useEffect` startup block alongside existing `AsyncStorage.getItem` calls.
- Save whenever the value changes.
- Add the key to `STORAGE_KEYS` in `src/services/GoogleDriveService.ts` so it is included in backups.

### 4. Add a screen (if needed)

Follow the [`new-screen`](../new-screen.md) skill:
- Create `src/screens/Timer/<ScreenName>/index.tsx`.
- Wire navigation via `currentScreen` / `activeView` state in `App.tsx`.
- Use `PlusJakartaSans_*` for text, `Inter_900Black` for large numerals.
- Detect landscape with `const { width, height } = useWindowDimensions(); const isLandscape = width > height;` and pass it as a prop.

### 5. Pass data via props only

Never reach for a global or imperative pattern. Pass state and callbacks as props:

```tsx
<MyScreen
  value={myValue}
  onUpdate={(val) => {
    setMyValue(val);
    AsyncStorage.setItem(MY_KEY, JSON.stringify(val));
  }}
/>
```

### 6. Validate

```bash
npx tsc --noEmit
```

See the [`typecheck`](../typecheck.md) skill. There is no test suite — TypeScript checking is the only static gate. Fix all errors before the feature is complete.
