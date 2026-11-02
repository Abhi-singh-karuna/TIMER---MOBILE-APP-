---
name: ui-ux-improvement
description: UI pattern reference for interface changes consistent with Chronoscape's design system
---

## Making UI/UX Changes

### Font system

Two font families are loaded at app start via `useFonts` in `App.tsx`:

| Use case | Font |
|----------|------|
| Body text, labels, buttons | `PlusJakartaSans_*` (weights 200–800) |
| Timer numerals, large counts | `Inter_900Black` |

Available Plus Jakarta Sans weights: `PlusJakartaSans_200ExtraLight`, `_300Light`, `_400Regular`, `_500Medium`, `_600SemiBold`, `_700Bold`, `_800ExtraBold`.

Always set `fontFamily` in `StyleSheet`. Do not use system fonts for new UI elements.

See [`new-screen`](../new-screen.md) for the complete screen conventions list.

### Landscape detection

Use `useWindowDimensions()` — not `Dimensions.get()` or the screen orientation API — for layout adaptation:

```ts
const { width, height } = useWindowDimensions();
const isLandscape = width > height;
```

Pass `isLandscape` as a prop to components that adapt. Components do not detect orientation themselves.

### Color system

Reuse existing constants from `src/constants/data.ts`:
- `COLOR_PRESETS` — 21 named hex swatches for user-selectable tints.
- `LANDSCAPE_PRESETS` — 5 named preset combinations (`filler`, `slider`, `text`) for the active timer screen.

The app uses a **dark background** throughout (black or near-black with white/light text). New UI should match this theme by default.

User-selected dynamic colors (`fillerColor`, `sliderButtonColor`, `textColor`) originate in `App.tsx` state and are passed down as props — do not read them from AsyncStorage directly in components.

### Animations

Use `LayoutAnimation` for layout transitions (already enabled globally in `App.tsx`). `react-native-reanimated` is installed but used selectively — only reach for it when a transition needs gesture-driven or physics-based values.

### Touch targets

Follow iOS Human Interface Guidelines minimum of 44×44 pt for tap targets. Use `TouchableOpacity` or `Pressable` consistently — do not mix them arbitrarily in the same screen.

### Pre-ship checklist

Before completing a UI change:

- [ ] Test in both portrait and landscape orientations.
- [ ] Verify form fields scroll into view when the keyboard opens (not obscured).
- [ ] Confirm all props the modified component expects are still provided from `App.tsx` (no prop regressions).
- [ ] Run `npx tsc --noEmit` — see [`typecheck`](../typecheck.md).
