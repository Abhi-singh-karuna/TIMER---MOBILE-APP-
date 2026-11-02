---
name: add-storage-key
description: Checklist for adding a new AsyncStorage key to the app
---

## Adding a New AsyncStorage Key

### 1. Define the key constant in `App.tsx` (or `src/constants/data.ts` if shared)

```ts
const MY_NEW_KEY = '@timer_my_new_key';
```

Keys follow the `@timer_*` or `@task_*` namespace convention.

### 2. Load in `loadAllColors()` inside `App.tsx`

Add a `Promise.all` entry alongside the other `AsyncStorage.getItem` calls:

```ts
const [/* existing */, myNewValue] = await Promise.all([
  // existing items...
  AsyncStorage.getItem(MY_NEW_KEY),
]);
if (myNewValue !== null) setMyNewState(myNewValue);
```

### 3. Save whenever the value changes

```ts
await AsyncStorage.setItem(MY_NEW_KEY, JSON.stringify(value));
```

### 4. Add to Google Drive backup list in `src/services/GoogleDriveService.ts`

```ts
const STORAGE_KEYS = [
  // existing keys...
  '@timer_my_new_key',
];
```

This ensures the key is included in backup/restore operations.
