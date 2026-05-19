// Chronoscape — Subscription configuration
// Single source of truth for free-tier limits, product IDs, and RevenueCat
// entitlement identifiers. Values here are intentionally readonly so feature
// gates can compare against a stable contract.

export const FREE_LIMITS = {
  // ===== Timers =====
  timers:        1,   // max timers per day
  extendTimeInProgressEnabled: true, // can extend timer duration while task is running

  // ===== Tasks =====
  tasksPerDay:                  2,    // max tasks per day
  subtasksPerTask:              2,    // max stages (subtasks) per task
  liveSubtaskActionsEnabled:    false, // action buttons on subtasks in live view
  extendSubtaskDurationEnabled: false, // can extend a subtask's duration

  // ===== Goals =====
  rootGoals:    2,   // max root goals
  tasksPerGoal: 2,   // max tasks linkable to a single goal

  // ===== Other =====
  categories:    2,   // max custom categories (defaults excluded from cap)
  quickMessages: 3,   // max custom quick messages

  // ===== Live / Active timer view =====
  liveViewEnabled:             true,  // can open the live/active timer screen
  liveDetailsExpandEnabled:    true,  // can expand the details panel in live view

  // ===== Notes / Diary =====
  // diary is available on the Free plan but limited.
  diaryEnabled:      false,  // free users can open the diary tab
  diaryFolders:      1,      // max custom folders (Trash + default folder excluded from cap)
  notesPerFolder:    2,      // max notes inside a single folder
  folderLockEnabled: false,  // PIN-protected folders are Pro-only
} as const;

export const ENTITLEMENT_ID    = 'pro';
export const PRODUCT_MONTHLY   = 'chronoscape_pro_monthly';
export const PRODUCT_ANNUAL    = 'chronoscape_pro_annual';
export const TRIAL_DAYS        = 7;
export const CACHE_STALE_HOURS = 48;

// AsyncStorage keys
export const STORAGE_KEYS = {
  cache:            '@subscription_cache',
  trialOfferShown:  '@trial_offer_shown',
  paywallDismissed: '@paywall_dismissed_count',
  gateTimestamps:   '@feature_gate_timestamps',
  // Mock-only: simulates RevenueCat CustomerInfo persistence in dev
  mockCustomerInfo: '@subscription_mock_customer_info',
} as const;

// Display pricing — UI fallback only. Real prices should come from the store
// SDK in production (different per region / currency).
export const DISPLAY_PRICING = {
  monthly: {
    price:        '$3.99',
    period:       '/ month',
    productId:    PRODUCT_MONTHLY,
    label:        'Monthly',
  },
  annual: {
    price:        '$29.99',
    period:       '/ year',
    perMonth:     '$2.50/mo',
    productId:    PRODUCT_ANNUAL,
    label:        'Annual',
    badge:        'BEST VALUE',
    savingsLabel: 'Save 37%',
  },
} as const;

export type GatedFeature =
  | 'timer'
  | 'task'
  | 'goal'
  | 'recurring'
  | 'backup'
  | 'category'
  | 'theme'
  | 'dailyStart'
  | 'leave'
  | 'timeSlots'
  | 'quickMessage'
  | 'folder'
  | 'note'
  | 'folderLock'
  | 'diary'
  | 'subtask'
  | 'taskInGoal'
  | 'liveView'
  | 'liveDetails'
  | 'liveSubtaskAction'
  | 'extendTime'
  | 'extendSubtaskDuration';

interface GateCopy { title: string; body: string }

export const FEATURE_GATE_COPY: Record<GatedFeature, GateCopy> = {
  timer:        { title: 'Timer Limit Reached',     body: `You've reached the free limit for Timers (${FREE_LIMITS.timers} max).` },
  task:         { title: 'Task Limit Reached',      body: `You've reached the daily task limit (${FREE_LIMITS.tasksPerDay} per day) on the free plan.` },
  goal:         { title: 'Goal Limit Reached',      body: `Free plan supports ${FREE_LIMITS.rootGoals} root goals. Upgrade for unlimited nested goals.` },
  recurring:    { title: 'Recurring Tasks — Pro',   body: 'Recurring tasks are a Pro feature. Set tasks to repeat daily, weekly or custom.' },
  backup:       { title: 'Cloud Backup — Pro',      body: 'Google Drive backup keeps your data safe across devices. Available on Pro.' },
  category:     { title: 'Category Limit',          body: `You can create up to ${FREE_LIMITS.categories} custom categories on the free plan.` },
  theme:        { title: 'Themes — Pro',            body: 'Unlock all colour themes and visual customisations with Pro.' },
  dailyStart:   { title: 'Custom Day Start — Pro',  body: 'Customise when your logical day begins. Available on Pro.' },
  leave:        { title: 'Leave Tracking — Pro',    body: 'Track planned leaves and pause streak rules. Available on Pro.' },
  timeSlots:    { title: 'Time-of-Day Slots — Pro', body: 'Customise timeline background by time-of-day. Available on Pro.' },
  quickMessage: { title: 'Quick Message Limit',     body: `Free plan supports ${FREE_LIMITS.quickMessages} quick messages. Upgrade for unlimited.` },
  folder:       { title: 'Folder Limit Reached',    body: `Free plan supports ${FREE_LIMITS.diaryFolders} custom folder${FREE_LIMITS.diaryFolders === 1 ? '' : 's'}. Upgrade for unlimited folders.` },
  note:         { title: 'Note Limit Reached',      body: `You can create up to ${FREE_LIMITS.notesPerFolder} notes per folder on the free plan.` },
  folderLock:   { title: 'Folder Locks — Pro',      body: 'Protect notes folders with a 4-digit PIN. Available on Pro.' },
  diary:        { title: 'Diary — Pro',              body: 'The daily Diary, mood tracking and templates are Pro features.' },
  subtask:           { title: 'Subtask Limit Reached',  body: `Free plan supports ${FREE_LIMITS.subtasksPerTask} subtasks per task. Upgrade for unlimited.` },
  taskInGoal:        { title: 'Goal Tasks Limit',       body: `Free plan supports ${FREE_LIMITS.tasksPerGoal} tasks per goal. Upgrade for unlimited.` },
  liveView:          { title: 'Live View — Pro',        body: 'The live timeline focus view is a Pro feature.' },
  liveDetails:       { title: 'Live Details — Pro',     body: 'Expanding the details panel in live view is a Pro feature.' },
  liveSubtaskAction: { title: 'Subtask Actions — Pro',  body: 'Acting on subtasks from live view is a Pro feature.' },
  extendTime:        { title: 'Extend Time — Pro',      body: 'Extending timer duration while a task is running is a Pro feature.' },
  extendSubtaskDuration: { title: 'Extend Subtask — Pro', body: 'Extending a subtask’s duration is a Pro feature.' },
};

// Gate throttle: same feature won't show again for 24h
export const GATE_THROTTLE_HOURS = 24;
