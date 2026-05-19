# Chronoscape — Subscription & Trial Implementation Plan

**Version:** 1.0  
**Date:** May 2026  
**App:** Chronoscape (Expo / React Native, SDK 54, TypeScript)  
**Author:** Engineering Team

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Subscription Tiers](#2-subscription-tiers)
3. [Trial Feature](#3-trial-feature)
4. [Technical Architecture](#4-technical-architecture)
5. [Data Model](#5-data-model)
6. [Subscription Context](#6-subscription-context)
7. [Feature Gating Strategy](#7-feature-gating-strategy)
8. [UI / UX Design](#8-ui--ux-design)
9. [Implementation Steps](#9-implementation-steps)
10. [App Store & Google Play Configuration](#10-app-store--google-play-configuration)
11. [RevenueCat Webhooks](#11-revenuecat-webhooks)
12. [Metrics & Analytics](#12-metrics--analytics)
13. [File Change Summary](#13-file-change-summary)
14. [Rollout Sequence](#14-rollout-sequence)
15. [Edge Cases & Risk Handling](#15-edge-cases--risk-handling)

---

## 1. Executive Summary

Chronoscape currently has **zero monetisation infrastructure** — no limits, no paywalls, no billing code anywhere in the codebase. This plan introduces a **freemium model** with a **7-day full-access free trial** and two paid tiers (monthly + annual), implemented via **RevenueCat** which manages billing for both the App Store and Google Play through a single SDK.

**Core principles:**
- Free tier must be genuinely useful so users stay engaged and return
- Trial requires no credit card from the user (Apple / Google handle it natively)
- Existing user data is **never deleted** on downgrade — users can always view what they created
- Feature gates are non-destructive and non-aggressive — one modal per feature per 24 hours maximum
- Offline-first: app works without internet using cached subscription state

---

## 2. Subscription Tiers

### 2.1 Free Tier (Always Available)

| Feature | Free Limit |
|---|---|
| Active timers | 3 |
| Tasks per day | 10 |
| Root goals | 2 |
| Custom categories | 2 |
| Quick messages | 3 |
| Recurring tasks | Not available |
| Google Drive backup | Not available |
| Themes | Default only |
| Time-of-day background slots | Not available |
| Daily start time customisation | Not available |
| Leave tracking | Not available |
| Analytics | Basic (today's count only) |

---

### 2.2 Pro Tier (Monthly & Annual)

| Feature | Pro |
|---|---|
| Active timers | Unlimited |
| Tasks per day | Unlimited |
| Root goals | Unlimited + nested |
| Custom categories | Unlimited |
| Quick messages | Unlimited |
| Recurring tasks | Full (all modes + sync) |
| Google Drive backup | Auto + manual |
| All themes | Included |
| Time-of-day background slots | Included |
| Daily start time customisation | Included |
| Leave tracking | Included |
| Analytics | Extended (historical) |

**Pricing:**

| Plan | Price | Notes |
|---|---|---|
| Pro Monthly | $3.99 / month | Billed monthly |
| Pro Annual | $29.99 / year | ~37% saving vs monthly — show "Best Value" badge |

> **Note:** Always display prices fetched live from RevenueCat / App Store / Play Store. Never hardcode currency values in UI — prices differ by region.

---

## 3. Trial Feature

### 3.1 Trial Specification

| Property | Value |
|---|---|
| Duration | 7 days |
| Access level | Full Pro (no restrictions during trial) |
| Credit card required | No (managed by Apple / Google) |
| Auto-converts to | Pro Annual (if user started trial from annual offer) |
| Trigger | First app launch after fresh install |
| Countdown warning | Shown from Day 5 onward |

### 3.2 Trial Flow

```
App installed
     │
     ▼
First launch → Show Trial Onboarding Screen
     │
     ├─► "Start Free Trial" ──► RevenueCat purchase flow (with 7-day trial)
     │        │
     │        ├─ Success ──► isPro = true, isTrial = true → Enter app
     │        └─ Cancelled ──► Stay on onboarding
     │
     └─► "Continue with Free" ──► isPro = false → Enter app with Free tier
     
During Trial (Day 1–7):
     └─► Full Pro access, no restrictions
     
Day 5, 6, 7:
     └─► Trial countdown banner appears on all main screens
     
Day 8 (trial ends):
     └─► isPro = false (if not converted)
     └─► FeatureLockedModal on next restricted action
     └─► Downgrade banner shown in Settings
```

### 3.3 Trial Rules

- The trial offer screen is shown **once only** (flag stored in AsyncStorage)
- A user who previously had a trial cannot start a new one (Apple / Google enforce this)
- If the trial was started on a previous install, RevenueCat restores the trial state on reinstall
- Trial expiry is calculated from `CustomerInfo.entitlements.active['pro'].expiresDate`

---

## 4. Technical Architecture

### 4.1 Technology Choices

| Layer | Technology | Reason |
|---|---|---|
| Billing SDK | `react-native-purchases` v8+ (RevenueCat) | Single API for App Store + Play Store |
| Receipt validation | RevenueCat servers | No backend needed, handles renewals automatically |
| Local cache | AsyncStorage | Offline-first, mirrors last-known subscription state |
| Feature gate | React Context (`SubscriptionContext`) | Available to all screens without prop drilling |
| Paywall UI | Custom screens | Matches app design language |
| Analytics | RevenueCat Dashboard | Trial conversion, MRR, churn — built in |

### 4.2 Why RevenueCat

- Single SDK replaces separate StoreKit (iOS) + Billing Library (Android) integrations
- Handles trial detection, renewal, grace period, cancellation, and refunds automatically
- `CustomerInfo` object updated in real time via webhooks and polling
- Free up to $2.5k MRR, then 1% of revenue
- Expo-compatible native module with no Expo Go support needed (already running on bare workflow)
- Dashboard provides revenue analytics with no additional setup

### 4.3 RevenueCat Concepts

| RevenueCat Concept | How It Maps to Chronoscape |
|---|---|
| **Product** | `chronoscape_pro_monthly`, `chronoscape_pro_annual` |
| **Entitlement** | `pro` — granted by either product, including trial period |
| **Offering** | `default` — contains both products, trial configured at store level |
| **CustomerInfo** | Object polled on every app resume, checked for `pro` entitlement |
| **Package** | Monthly package + Annual package within the default offering |

### 4.4 New Files and Folder Structure

```
src/
├── services/
│   └── SubscriptionService.ts          ← RevenueCat wrapper (init, purchase, restore)
├── context/
│   └── SubscriptionContext.tsx         ← React Context + Provider
├── hooks/
│   ├── useSubscription.ts              ← Context consumer hook
│   └── useFeatureGate.ts               ← Per-feature gate helpers
├── constants/
│   └── subscriptionConfig.ts           ← Limits, product IDs, entitlement IDs
└── screens/
    └── Paywall/
        ├── index.tsx                   ← Main paywall / upgrade screen
        ├── TrialOnboarding.tsx         ← First-launch trial offer screen
        ├── TrialBanner.tsx             ← Day 5+ countdown banner (slim, inline)
        └── FeatureLockedModal.tsx      ← Gate modal shown when limit is hit
```

Settings screen addition:
```
src/screens/Timer/Settings/
└── SubscriptionSection.tsx             ← New section at top of Settings
```

---

## 5. Data Model

### 5.1 New AsyncStorage Keys

| Key | Type | Description |
|---|---|---|
| `@subscription_cache` | JSON (SubscriptionCache) | Mirrors last-known RevenueCat state for offline use |
| `@trial_offer_shown` | `'true'` | Set after trial onboarding is shown — prevents re-showing |
| `@paywall_dismissed_count` | number string | Counts how many times user dismissed paywall |
| `@feature_gate_timestamps` | JSON Record | Timestamps of last gate shown per feature (throttle repeat modals) |

### 5.2 SubscriptionCache Shape

```typescript
interface SubscriptionCache {
  isActive: boolean;           // Pro entitlement currently active
  isTrial: boolean;            // Currently in the free trial period
  trialEndsAt: string | null;  // ISO 8601 date string when trial expires
  expiresAt: string | null;    // ISO 8601 date string when paid sub expires
  productId: string | null;    // Which product is active ('monthly' or 'annual')
  lastValidated: string;       // ISO 8601 date of last successful RevenueCat fetch
}
```

**Cache staleness rule:** If `lastValidated` is more than 48 hours ago and RevenueCat is unreachable, treat user as free tier (conservative — avoids giving free Pro access if something is wrong).

### 5.3 SubscriptionService API

```typescript
// src/services/SubscriptionService.ts

class SubscriptionService {
  static initialize(userId?: string): Promise<void>
  // Call once at app root before rendering. Configures RevenueCat with API key.
  // Pass anonymous user ID or Apple/Google ID if available.

  static getCustomerInfo(): Promise<CustomerInfo>
  // Fetches fresh CustomerInfo from RevenueCat servers.
  // Falls back to cached value on network error.

  static isPro(info: CustomerInfo): boolean
  // Returns true if 'pro' entitlement is active (trial OR paid).

  static isTrial(info: CustomerInfo): boolean
  // Returns true if currently in trial period (not yet converted to paid).

  static trialDaysLeft(info: CustomerInfo): number | null
  // Returns days remaining in trial, or null if not in trial.

  static purchase(packageToPurchase: PurchasesPackage): Promise<CustomerInfo>
  // Triggers native purchase sheet. Throws PurchasesError on failure/cancel.

  static restore(): Promise<CustomerInfo>
  // Restores previous purchases. Used in Settings.

  static updateCache(info: CustomerInfo): Promise<void>
  // Serialises CustomerInfo into SubscriptionCache and writes to AsyncStorage.

  static loadCache(): Promise<SubscriptionCache | null>
  // Reads SubscriptionCache from AsyncStorage for offline use.
}
```

---

## 6. Subscription Context

### 6.1 Context Shape

```typescript
// src/context/SubscriptionContext.tsx

interface SubscriptionState {
  isPro: boolean;                // true = pro entitlement active (trial or paid)
  isTrial: boolean;              // true = currently in trial (not yet paid)
  trialDaysLeft: number | null;  // days until trial expiry, null if not in trial
  expiresAt: Date | null;        // when the current subscription period ends
  productId: string | null;      // 'monthly' | 'annual' | null
  isLoading: boolean;            // true while fetching from RevenueCat
  purchase: (pkg: PurchasesPackage) => Promise<void>;
  restore: () => Promise<void>;
  refresh: () => Promise<void>;  // force-fetch fresh CustomerInfo
}
```

`isPro` is `true` when either condition holds:
- An active paid subscription exists, **OR**
- A valid trial period is active

### 6.2 Provider Lifecycle

```
App starts
    │
    ▼
SubscriptionProvider mounts
    │
    ├─ 1. Load SubscriptionCache from AsyncStorage (sync, instant)
    ├─ 2. Set isPro / isTrial from cache (optimistic — no flicker)
    ├─ 3. Call SubscriptionService.initialize()
    └─ 4. Fetch fresh CustomerInfo from RevenueCat
               │
               ├─ Success → Update context + write new cache
               └─ Failure → Keep cache-based values, set isLoading = false

AppState changes to 'active' (foreground)
    └─ Call refresh() → fetch fresh CustomerInfo
```

### 6.3 Wrapping the App

```typescript
// index.tsx (root)
export default function Root() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SubscriptionProvider>
        <App />
      </SubscriptionProvider>
    </GestureHandlerRootView>
  );
}
```

---

## 7. Feature Gating Strategy

### 7.1 Gate Types

| Gate Type | When Used | UX |
|---|---|---|
| **Hard gate (before action)** | User taps "+" when already at free limit | Show `FeatureLockedModal` before creating anything |
| **Soft gate (on save)** | User enables a Pro toggle (e.g., recurring) | Allow toggle, block save, show modal |
| **Inline lock indicator** | Always visible on restricted UI | Lock badge / icon on the restricted control |
| **Downgrade banner** | After subscription expires | Persistent banner in Settings, non-intrusive |

### 7.2 Gate Throttle Rules

- The same feature gate modal will **not** show again for **24 hours** (stored per-feature in `@feature_gate_timestamps`)
- After the 3rd dismissal on the same feature, change modal copy to show the yearly price and saving
- Never show more than 1 gate modal per app session for the same feature

### 7.3 Free Limits Configuration

```typescript
// src/constants/subscriptionConfig.ts

export const FREE_LIMITS = {
  timers:         3,
  tasksPerDay:    10,
  rootGoals:      2,
  categories:     2,
  quickMessages:  3,
} as const;

export const ENTITLEMENT_ID   = 'pro';
export const PRODUCT_MONTHLY  = 'chronoscape_pro_monthly';
export const PRODUCT_ANNUAL   = 'chronoscape_pro_annual';
export const TRIAL_DAYS       = 7;
export const CACHE_STALE_HOURS = 48;
```

### 7.4 useFeatureGate Hook

```typescript
// src/hooks/useFeatureGate.ts

export function useFeatureGate() {
  const { isPro } = useSubscription();

  return {
    canAddTimer:     (currentCount: number) => isPro || currentCount < FREE_LIMITS.timers,
    canAddTask:      (todayCount: number)   => isPro || todayCount < FREE_LIMITS.tasksPerDay,
    canAddGoal:      (rootCount: number)    => isPro || rootCount < FREE_LIMITS.rootGoals,
    canUseRecurring: ()                     => isPro,
    canUseBackup:    ()                     => isPro,
    canAddCategory:  (count: number)        => isPro || count < FREE_LIMITS.categories,
    canAddMessage:   (count: number)        => isPro || count < FREE_LIMITS.quickMessages,
    canUseTheme:     ()                     => isPro,
    canUseDailyStart:()                     => isPro,
    canUseLeave:     ()                     => isPro,
    canUseTimeSlots: ()                     => isPro,
  };
}
```

### 7.5 Downgrade Behaviour

When a subscription expires:
- User **can still view** all timers, tasks, goals they created (no data deletion)
- User **cannot create new** items beyond the free limit
- A non-intrusive banner appears in Settings: *"Your Pro subscription has expired. Your data is safe."*
- The `FeatureLockedModal` appears on the next restricted creation attempt

---

## 8. UI / UX Design

### 8.1 Trial Onboarding Screen (First Launch)

Shown once on first install. Full-screen modal over the main app.

```
┌─────────────────────────────────────────┐
│                                         │
│                                         │
│           ◆  CHRONOSCAPE                │
│                                         │
│   ┌─────────────────────────────────┐   │
│   │                                 │   │
│   │        7 DAYS FREE              │   │
│   │   Full Pro access. No charge    │   │
│   │   until your trial ends.        │   │
│   │                                 │   │
│   └─────────────────────────────────┘   │
│                                         │
│   ✓  Unlimited timers                   │
│   ✓  Unlimited tasks & goals            │
│   ✓  Recurring task engine              │
│   ✓  Google Drive auto-backup           │
│   ✓  All themes & customisation         │
│   ✓  Leave tracking & analytics         │
│                                         │
│   ┌─────────────────────────────────┐   │
│   │      START FREE TRIAL  →        │   │  ← Primary CTA (white/accent, 56px tall)
│   └─────────────────────────────────┘   │
│                                         │
│   After 7 days: $3.99/mo               │
│   or $29.99/yr  ·  Cancel anytime      │
│                                         │
│           Continue with Free            │  ← Dimmed text, no border
│                                         │
└─────────────────────────────────────────┘
```

**Design notes:**
- Background: `rgba(0,0,0,0.95)` with subtle gradient matching app theme
- "7 DAYS FREE" box: cyan border glow (`rgba(0,229,255,0.3)`)
- Feature list bullets: cyan accent dots
- "START FREE TRIAL": white background, black text, full width, `borderRadius: 16`
- "Continue with Free": `rgba(255,255,255,0.3)` text, no background — visually de-emphasised
- Price text: small, `rgba(255,255,255,0.4)`, reassuring not alarming

---

### 8.2 Paywall / Upgrade Screen

Accessed from Settings or via a feature gate modal.

```
┌─────────────────────────────────────────┐
│  ✕                                      │  ← Top-right close button (44×44 tap target)
│                                         │
│          UPGRADE TO PRO                 │
│   Remove all limits. Keep everything.   │
│                                         │
│  ┌────────────────┐  ┌────────────────┐ │
│  │   MONTHLY      │  │   ANNUAL       │ │  ← Toggle cards
│  │                │  │  ★ BEST VALUE  │ │
│  │   $3.99        │  │   $29.99       │ │
│  │   /month       │  │   /year        │ │
│  │                │  │   ($2.50/mo)   │ │
│  └────────────────┘  └────────────────┘ │
│            (selected card has border)   │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │       SUBSCRIBE NOW  →          │    │  ← Updates based on selected plan
│  └─────────────────────────────────┘    │
│                                         │
│  ─────────  WHAT YOU GET  ─────────     │
│                                         │
│  ∞  Unlimited timers, tasks & goals     │
│  🔄  Recurring tasks (all modes)        │
│  ☁  Google Drive auto-backup           │
│  🎨  All themes & customisation         │
│  ⏰  Custom daily start time            │
│  📊  Extended analytics & reports       │
│                                         │
│  ─────────────────────────────────      │
│                                         │
│   Restore Purchases   ·   Terms of Use  │
└─────────────────────────────────────────┘
```

**Design notes:**
- Monthly card: default state (subtle border)
- Annual card: highlighted state (cyan border glow, "BEST VALUE" badge top-right)
- Tapping a card selects it and updates the CTA button text + price shown
- Feature list icons use MaterialIcons matching existing app icons
- "Restore Purchases" and "Terms" are small text links at the very bottom
- Loading state: CTA button shows spinner, disabled during purchase processing

---

### 8.3 Feature Locked Modal (Inline Gate)

Bottom-sheet style modal. Appears when user hits a free-tier limit.

```
┌─────────────────────────────────────────┐
│                  ────                   │  ← Drag handle (dismiss gesture)
│                                         │
│             🔒  PRO FEATURE             │
│                                         │
│    You've reached the free limit        │
│    for Timers (3 of 3 used).            │
│                                         │
│    Upgrade to Pro for unlimited         │
│    timers, tasks and goals.             │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │        VIEW PLANS  →            │    │  ← Opens Paywall screen
│  └─────────────────────────────────┘    │
│                                         │
│              Not now                    │  ← Dismisses modal
│                                         │
└─────────────────────────────────────────┘
```

**Feature-specific copy table:**

| Feature | Title | Body |
|---|---|---|
| Timer | "Timer Limit Reached" | "You've reached the free limit for Timers (3 max)." |
| Task | "Task Limit Reached" | "You've reached the daily task limit (10 per day) on the free plan." |
| Goal | "Goal Limit Reached" | "Free plan supports 2 root goals. Upgrade for unlimited nested goals." |
| Recurring | "Recurring Tasks — Pro" | "Recurring tasks are a Pro feature. Set tasks to repeat daily, weekly or custom." |
| Backup | "Cloud Backup — Pro" | "Google Drive backup keeps your data safe across devices. Available on Pro." |
| Category | "Category Limit" | "You can create up to 2 custom categories on the free plan." |
| Theme | "Themes — Pro" | "Unlock all colour themes and visual customisations with Pro." |

---

### 8.4 Trial Countdown Banner

Slim persistent banner shown at the top of TimerList, Task and GoalManagement screens from Day 5 of the trial onward.

```
┌─────────────────────────────────────────┐
│  ⏱  2 days left in your free trial   [ UPGRADE ]  │
└─────────────────────────────────────────┘
```

**Colour states:**

| Days Left | Background | Text |
|---|---|---|
| 3 days | `rgba(255,183,77,0.15)` | Amber (`#FFB74D`) |
| 2 days | `rgba(255,152,0,0.2)` | Orange (`#FF9800`) |
| 1 day | `rgba(255,82,82,0.2)` | Red (`#FF5252`) |

**Behaviour:**
- Height: 36px
- "UPGRADE" text button on right — opens Paywall screen
- Dismissible with ✕ icon on far right but reappears on next app open
- Not shown if user has already upgraded or on free plan (trial not started)

---

### 8.5 Settings — Subscription Section

New section at the **top** of the Settings screen, above all other sections.

**Pro / Trial state:**
```
┌─────────────────────────────────────────┐
│  SUBSCRIPTION                           │
│                                         │
│  Status    PRO  ·  Trial                │
│  Expires   14 May 2026                  │
│                                         │
│  [ Manage Subscription ]                │
│  [ Restore Purchases   ]                │
└─────────────────────────────────────────┘
```

**Free state:**
```
┌─────────────────────────────────────────┐
│  SUBSCRIPTION                           │
│                                         │
│  Status    FREE PLAN                    │
│            3 timers · 10 tasks/day      │
│                                         │
│  [ Upgrade to Pro  →  ]                 │
│  [ Restore Purchases  ]                 │
└─────────────────────────────────────────┘
```

**Paid (not trial) state:**
```
┌─────────────────────────────────────────┐
│  SUBSCRIPTION                           │
│                                         │
│  Status    PRO — Annual                 │
│  Renews    14 May 2027                  │
│                                         │
│  [ Manage Subscription ]                │
│  [ Restore Purchases   ]                │
└─────────────────────────────────────────┘
```

---

### 8.6 Lock Indicators on Free-Tier UI

Inline lock badges shown to free users so they understand limits before hitting them:

| UI Element | Lock Indicator |
|---|---|
| 4th+ timer "Add" slot | Greyed placeholder card with `🔒` centre icon |
| Recurring task toggle | Small `🔒` icon to the right of the toggle label |
| Category "Add" button (at limit) | Button becomes dimmed + `🔒` icon |
| Non-default themes | Semi-transparent overlay + `🔒` badge on theme tile |
| Backup toggle | `🔒` icon to left of toggle, tap opens Paywall |
| Daily start time row | `🔒` badge on right of row |
| Leave tracking row | `🔒` badge on right of row |

---

## 9. Implementation Steps

### Phase 1 — Infrastructure (Week 1)

#### Step 1: Install RevenueCat SDK

```bash
npm install react-native-purchases
npx expo run:ios    # triggers native rebuild
npx expo run:android
```

Add to `app.json` under `plugins`:
```json
[
  "react-native-purchases",
  {
    "apiKey": "appl_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
  }
]
```

#### Step 2: Configure RevenueCat Dashboard

1. Create a RevenueCat project at app.revenuecat.com
2. Add iOS app (App Store Connect API key) + Android app (Google Service Account)
3. Create entitlement: `pro`
4. Create products in each store (see Section 10)
5. Create offering `default` containing both products
6. Map products to the `pro` entitlement
7. Note the public SDK keys (iOS + Android) for `app.json`

#### Step 3: Create `src/constants/subscriptionConfig.ts`

Single source of truth for all limits and IDs.

```typescript
export const FREE_LIMITS = {
  timers:         3,
  tasksPerDay:    10,
  rootGoals:      2,
  categories:     2,
  quickMessages:  3,
} as const;

export const ENTITLEMENT_ID    = 'pro';
export const PRODUCT_MONTHLY   = 'chronoscape_pro_monthly';
export const PRODUCT_ANNUAL    = 'chronoscape_pro_annual';
export const TRIAL_DAYS        = 7;
export const CACHE_STALE_HOURS = 48;
```

#### Step 4: Create `src/services/SubscriptionService.ts`

Wraps all RevenueCat calls. No RevenueCat imports should appear outside this file.

Key methods: `initialize`, `getCustomerInfo`, `isPro`, `isTrial`, `trialDaysLeft`, `purchase`, `restore`, `updateCache`, `loadCache`.

#### Step 5: Create `src/context/SubscriptionContext.tsx`

React Context that holds the resolved subscription state. Refreshes on foreground. Provides `useSubscription()` hook.

#### Step 6: Create `src/hooks/useFeatureGate.ts`

Reads from `SubscriptionContext`. Returns boolean helpers for every gated feature.

#### Step 7: Wrap app root

In `index.tsx`: wrap `<App />` with `<SubscriptionProvider>`.

---

### Phase 2 — Feature Gates (Week 2)

#### Step 8: Gate Timer creation — `App.tsx`

In the `onAddTimer` handler, before opening the add modal:
```typescript
const { canAddTimer } = useFeatureGate();
if (!canAddTimer(timers.length)) {
  showFeatureLockedModal('timer');
  return;
}
```

#### Step 9: Gate Task creation — `App.tsx`

In the `onAddTask` handler, check task count for today's logical date.

#### Step 10: Gate Goal creation — `App.tsx`

In the `handleAddGoal` handler, check root goal count (goals where `parentId === null`).

#### Step 11: Gate Recurring Tasks

In the Add/Edit Task modal, wrap the recurring toggle — if `!canUseRecurring()`, show `FeatureLockedModal('recurring')` instead of enabling the control.

#### Step 12: Gate Google Drive Backup — `AccountSection.tsx`

Wrap the backup toggle. If `!canUseBackup()`, tap shows `FeatureLockedModal('backup')`.

#### Step 13: Gate Categories — `CategorySection.tsx`

If `!canAddCategory(categories.length)`, dim the "Add" button and show gate on tap.

#### Step 14: Gate Themes — `ThemeSection.tsx`

Render lock overlay on non-default theme tiles for free users.

#### Step 15: Gate Daily Start Time, Leave, Time Slots — respective Settings sections

Wrap the controls with a lock indicator and gate on interaction.

---

### Phase 3 — Paywall Screens (Week 3)

#### Step 16: Build `Paywall/index.tsx`

- On mount: call `Purchases.getOfferings()` to get live product list + prices
- Render monthly / annual toggle cards (annual pre-selected as default)
- "SUBSCRIBE NOW" calls `SubscriptionService.purchase()` with selected package
- Handle `PurchasesError`: `PURCHASE_CANCELLED` is silent; all others show an Alert
- On success: call `refresh()` on context, show success state, dismiss screen

#### Step 17: Build `Paywall/TrialOnboarding.tsx`

- Shown once on first launch (check `@trial_offer_shown` in AsyncStorage)
- "Start Free Trial" → `purchase(annualPackageWithTrial)` → enter app
- "Continue with Free" → write `@trial_offer_shown`, enter app with free tier

#### Step 18: Build `Paywall/FeatureLockedModal.tsx`

- React Native `Modal` with bottom-sheet style
- Receives `feature` prop, generates appropriate copy
- "VIEW PLANS" → navigate to Paywall screen
- Writes timestamp to `@feature_gate_timestamps` on show
- Reads timestamps to enforce 24-hour throttle before showing again

#### Step 19: Build `Paywall/TrialBanner.tsx`

- Reads `isTrial` and `trialDaysLeft` from `useSubscription()`
- Returns `null` if not in trial or more than 3 days left
- Renders slim banner above existing screen header
- Colour changes based on days remaining (amber → orange → red)

---

### Phase 4 — Settings Integration (Week 4)

#### Step 20: Build `Settings/SubscriptionSection.tsx`

- Shows current plan status, expiry date
- "Manage Subscription" → `Linking.openURL` to platform-specific subscription settings:
  - iOS: `itms-apps://apps.apple.com/account/subscriptions`
  - Android: `market://details?id=com.chronoscape&hl=en`
- "Restore Purchases" → calls `SubscriptionService.restore()` with loading state + success/error feedback
- "Upgrade to Pro" (free state) → navigate to Paywall screen

#### Step 21: Add SubscriptionSection to `Settings/index.tsx`

Insert `<SubscriptionSection />` as the first section, above all other settings.

#### Step 22: Add TrialBanner to main screens

In `TimerList/index.tsx`, `Task/index.tsx`, `GoalManagement/index.tsx`: render `<TrialBanner />` immediately inside the `SafeAreaView`, before the existing header.

---

### Phase 5 — Testing & QA (Week 5)

#### Step 23: Sandbox testing setup

- iOS: Create sandbox tester accounts in App Store Connect (separate Apple ID, not your main account)
- Android: Add test accounts to Google Play internal testing track
- RevenueCat Dashboard: enable sandbox mode — all events visible in real time under "Sandbox" tab

#### Step 24: Test matrix

| Test Case | Steps | Expected Result |
|---|---|---|
| Trial start | Fresh install → tap "Start Free Trial" | isPro = true, isTrial = true |
| Trial gate | Create 4th timer during trial | Succeeds (no gate during trial) |
| Trial expiry | Advance sandbox clock 7 days | isPro = false, gates active |
| Purchase monthly | Paywall → select monthly → subscribe | isPro = true, isTrial = false |
| Purchase annual | Paywall → select annual → subscribe | isPro = true, isTrial = false |
| Cancel subscription | Cancel via store | isPro remains true until period ends |
| Subscription expires | Advance clock past expiry | isPro = false, banner in Settings |
| Restore purchases | Reinstall → Settings → Restore | isPro restored correctly |
| Offline with Pro cache | Disable network, open app | Uses cache, isPro = true |
| Offline with stale cache | Cache > 48 hours, no network | Treated as free tier |
| Free limit — Timer | Create 3 timers → tap + | FeatureLockedModal appears |
| Free limit — Task | Create 10 tasks → tap + | FeatureLockedModal appears |
| Free limit — Goal | Create 2 goals → tap + | FeatureLockedModal appears |
| Recurring gate | Enable recurring on task (free) | FeatureLockedModal appears |
| Downgrade data preservation | Cancel sub, wait for expiry | All existing data visible, creation blocked |

---

## 10. App Store & Google Play Configuration

### 10.1 App Store Connect

1. Go to **My Apps → Chronoscape → Subscriptions**
2. Create a **Subscription Group**: "Chronoscape Pro"
3. Create two products inside the group:

| Field | Monthly | Annual |
|---|---|---|
| Product ID | `chronoscape_pro_monthly` | `chronoscape_pro_annual` |
| Reference Name | Chronoscape Pro Monthly | Chronoscape Pro Annual |
| Duration | 1 Month | 1 Year |
| Price | $3.99 / month | $29.99 / year |
| Introductory Offer | 7 days free | 7 days free |
| Intro Offer Type | Free Trial | Free Trial |

4. Add localised descriptions for all supported locales (at minimum: EN-US)
5. Submit for App Review (subscriptions require review before going live)

### 10.2 Google Play Console

1. Go to **Monetise → Products → Subscriptions**
2. Create subscription: **Chronoscape Pro**
3. Create two base plans:

| Field | Monthly | Annual |
|---|---|---|
| Base Plan ID | `monthly` | `annual` |
| Billing Period | Monthly | Annually |
| Price | $3.99 | $29.99 |
| Grace Period | 3 days | 3 days |

4. For each base plan, add an **Introductory Offer**:
   - Offer type: Free Trial
   - Duration: 7 days
   - Eligibility: New subscribers only

5. Activate both base plans and offers

---

## 11. RevenueCat Webhooks

For Phase 1, polling `CustomerInfo` on foreground is sufficient — no backend required.

If a backend is added in a future phase, RevenueCat can POST events to it. Recommended events to handle:

| Event | Suggested Action |
|---|---|
| `INITIAL_PURCHASE` | Log acquisition source, send welcome email |
| `TRIAL_STARTED` | Record trial start date for analytics |
| `TRIAL_CONVERTED` | Mark as paying customer, update CRM |
| `TRIAL_CANCELLED` | Trigger win-back email sequence |
| `RENEWAL` | Update subscription expiry in user record |
| `CANCELLATION` | Schedule downgrade handling, trigger retention email |
| `UNCANCELLATION` | Cancel scheduled downgrade |
| `BILLING_ISSUE` | Send payment failure notification to user |
| `REFUND` | Immediately revoke Pro access |

RevenueCat webhook documentation: https://www.revenuecat.com/docs/webhooks

---

## 12. Metrics & Analytics

RevenueCat Dashboard provides all of the following with zero additional instrumentation:

| Metric | Target (6 months post-launch) |
|---|---|
| Trial start rate (installs → trial started) | > 40% |
| Trial-to-paid conversion rate | > 25% |
| Monthly → Annual upgrade rate | > 30% |
| 30-day paid subscriber churn | < 5% |
| Monthly Recurring Revenue (MRR) | Track weekly |
| Average Revenue Per User (ARPU) | Track monthly |

**Custom events to add (via analytics SDK such as Mixpanel or PostHog if desired):**

| Event | Properties |
|---|---|
| `paywall_viewed` | `source: 'onboarding' | 'gate' | 'settings'` |
| `trial_started` | `plan: 'monthly' | 'annual'` |
| `trial_skipped` | — |
| `purchase_attempted` | `plan`, `source` |
| `purchase_succeeded` | `plan`, `price` |
| `purchase_failed` | `error_code` |
| `feature_gate_shown` | `feature`, `dismissal_count` |
| `paywall_dismissed` | `source` |

---

## 13. File Change Summary

| File | Type | Change |
|---|---|---|
| `index.tsx` | Modify | Wrap app with `SubscriptionProvider`, add `TrialOnboarding` check |
| `App.tsx` | Modify | Import `useFeatureGate`, add gate checks in all create handlers |
| `app.json` | Modify | Add `react-native-purchases` plugin with API keys |
| `package.json` | Modify | Add `react-native-purchases` dependency |
| `src/constants/subscriptionConfig.ts` | **New** | Free limits, product IDs, entitlement ID, trial duration |
| `src/services/SubscriptionService.ts` | **New** | RevenueCat wrapper (init, purchase, restore, cache) |
| `src/context/SubscriptionContext.tsx` | **New** | React Context + Provider for subscription state |
| `src/hooks/useSubscription.ts` | **New** | Context consumer convenience hook |
| `src/hooks/useFeatureGate.ts` | **New** | Per-feature gate boolean helpers |
| `src/screens/Paywall/index.tsx` | **New** | Main paywall / upgrade screen |
| `src/screens/Paywall/TrialOnboarding.tsx` | **New** | First-launch trial offer screen |
| `src/screens/Paywall/TrialBanner.tsx` | **New** | Day 5+ countdown banner |
| `src/screens/Paywall/FeatureLockedModal.tsx` | **New** | Inline gate modal |
| `src/screens/Timer/Settings/SubscriptionSection.tsx` | **New** | Subscription status + manage in Settings |
| `src/screens/Timer/Settings/index.tsx` | Modify | Add `SubscriptionSection` at top |
| `src/screens/Timer/TimerList/index.tsx` | Modify | Add `TrialBanner` + timer creation gate |
| `src/screens/Timer/Task/index.tsx` | Modify | Add `TrialBanner` + task / recurring gate |
| `src/screens/Timer/GoalManagement/index.tsx` | Modify | Add `TrialBanner` + goal creation gate |
| `src/screens/Timer/Settings/AccountSection.tsx` | Modify | Add backup gate (lock badge + modal) |
| `src/screens/Timer/Settings/CategorySection.tsx` | Modify | Add category creation gate |
| `src/screens/Timer/Settings/ThemeSection.tsx` | Modify | Add theme lock badges for free users |
| `src/screens/Timer/Settings/GeneralSection.tsx` | Modify | Gate daily start time + time slots |
| `src/screens/Timer/Settings/LeaveSection.tsx` | Modify | Gate leave tracking feature |
| `src/screens/Timer/Settings/QuickMessageSection.tsx` | Modify | Gate quick message creation at limit |

**New files: 10 | Modified files: 12 | Total: 22**

---

## 14. Rollout Sequence

```
Week 1  ──  RevenueCat SDK installed, SubscriptionService, Context, hooks
            No UI changes. No gates active yet. Validate RevenueCat dashboard.

Week 2  ──  Feature gates added to all create handlers in App.tsx
            Gates log to console only (isPro = true hardcoded for dev)
            Validate gate logic without paywall UI

Week 3  ──  Paywall screen, TrialOnboarding, FeatureLockedModal built
            Remove dev override. Gates now functional.

Week 4  ──  SubscriptionSection in Settings
            TrialBanner on all three main screens
            Lock badges on restricted UI elements

Week 5  ──  Sandbox end-to-end testing (full test matrix from Section 9)
            Fix any RevenueCat integration issues
            Edge case verification (offline, reinstall, restore)

Week 6  ──  Internal TestFlight (iOS) + Internal Testing Track (Android)
            Team testing with real sandbox accounts
            Performance profiling (ensure no added startup delay)

Week 7  ──  App Store submission + Google Play submission
            RevenueCat webhooks verified against staging (if backend exists)
            Go-live
```

---

## 15. Edge Cases & Risk Handling

| Scenario | Expected Behaviour |
|---|---|
| Trial started, app reinstalled | RevenueCat tracks by Apple/Google account ID — trial state restored on `restore()` call |
| Paid subscription, app reinstalled | `restore()` call reactivates Pro immediately |
| User has 5 timers, subscription expires | All 5 timers remain visible and functional; creation of new ones is blocked until Pro is re-activated |
| User has > free limit items, never had Pro | Cannot happen (gates prevent creation beyond limits on free plan) |
| Refund issued by Apple/Google | RevenueCat marks entitlement inactive on next poll — `isPro` becomes false at next foreground |
| RevenueCat servers unreachable on launch | Cache from AsyncStorage used; if cache fresh (< 48h) trust it; if stale, default to free |
| First launch with no internet | `SubscriptionService.initialize()` fails gracefully; default to free tier; cache stays empty |
| Family Sharing (iOS) | Auto-renewable subscriptions do not share via Family Sharing by default — no action needed |
| Transfer Apple ID to new device | `restore()` recovers the subscription — document this in the Settings UI tip |
| User cancels trial before it ends | Trial remains active until the 7-day period ends naturally; `isPro` stays true until expiry |
| Duplicate purchase attempt | RevenueCat SDK handles idempotency — no double charge |
| Purchase sheet dismissed mid-flow | `PurchasesError.PURCHASE_CANCELLED` caught silently; no modal shown |
| Annual plan purchased, monthly was active | RevenueCat upgrades seamlessly; `productId` updates to annual |

---

*End of Document*

**Next steps:** Review this plan, confirm feature limits and pricing, then begin Phase 1 (RevenueCat setup) per the rollout sequence in Section 14.
