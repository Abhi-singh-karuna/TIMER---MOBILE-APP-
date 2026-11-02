---
name: task-model
description: Quick reference for the Task and recurring task data model in Chronoscape
---

## Task Data Model

### Non-recurring tasks

```ts
{
  id: number,            // Date.now() at creation
  title: string,
  status: 'Pending' | 'In Progress' | 'Completed',
  priority: 'Low' | 'Medium' | 'High',
  forDate: string,       // YYYY-MM-DD
  stages: TaskStage[],   // subtasks
  comments: Comment[],
}
```

### Recurring tasks

```ts
{
  id: number,
  title: string,
  forDate: string,          // start date of the recurrence
  recurrence: Recurrence,   // daily / weekly / monthly config
  recurrenceInstances: {    // per-date data
    'YYYY-MM-DD': {
      stages: TaskStage[],  // subtasks for THIS date only
      status?: 'Pending' | 'In Progress' | 'Completed',
      startedAt?: string,
      completedAt?: string,
    }
  },
  comments: Comment[],      // SHARED across all dates
  streak: number,           // consecutive completed instances
}
```

### Key rules

- **Never read `task.stages` directly for recurring tasks** — call `expandTasksForDate(tasks, dateStr)` which returns virtual per-date instances with the correct stages from `recurrenceInstances`.
- **Writing stages for recurring tasks**: call `handleUpdateStages(task, stages, syncMode)` in `App.tsx`. It writes to `recurrenceInstances[forDate]` and propagates according to `syncMode` ('none' | 'all' | 'future') and `task.recurrence.repeatSync`.
- **Date format**: always `YYYY-MM-DD`. Use `getLogicalDate(date, dailyStartMinutes)` — never `new Date().toDateString()` or locale-specific formats.
- **Streak**: calculated by `calculateStreak()` in `src/utils/recurrenceUtils.ts`. Today's logical date is excluded from the streak count.

### Stage status

`TaskStage.status` has 4 states: `'Upcoming' | 'Process' | 'Done' | 'Undone'`

`TaskStage.isCompleted` is kept for backward compatibility: `true` = Done, `false` = others.
