// src/apps/tasks/index.ts
import type { AppDef } from '@/shell/types';
import { TasksApp } from './TasksApp';
import { TaskDetailPanel } from './TaskDetailPanel';

export const tasksAppDef: AppDef = {
  id: 'tasks',
  route: '/tasks-new', // temporary path; will move to '/' in 4.7 cutover
  Component: TasksApp,
  DetailPanelComponent: TaskDetailPanel,
  ownsSelectionKinds: ['task'],
};
