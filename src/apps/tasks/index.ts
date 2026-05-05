// src/apps/tasks/index.ts
import type { AppDef } from '@/shell/types';
import { TasksApp } from './TasksApp';
import { TaskDetailPanel } from './TaskDetailPanel';

export const tasksAppDef: AppDef = {
  id: 'tasks',
  // Tasks is the index app (the default app at /). With `index: true`,
  // ShellRoutes falls through to TasksApp for any path not claimed by
  // another app — so /today, /inbox, /task/:id all flow into TasksApp's
  // internal Routes. The /tasks-new/* parallel path remains during P4
  // for rollback safety; cutover is gated by a localStorage feature flag
  // in main.tsx (`symphony.useNewTasks=1`).
  route: '/',
  index: true,
  Component: TasksApp,
  DetailPanelComponent: TaskDetailPanel,
  ownsSelectionKinds: ['task'],
};
