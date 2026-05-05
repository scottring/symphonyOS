// src/apps/tasks/TaskDetailPanel.tsx
//
// Renders the existing TaskViewRedesign editor inside a fixed side panel,
// driven by the URL ?detail=task:<id> selection. The full-page route at
// /tasks-new/task/:taskId uses the SAME container so behavior matches.
//
// TaskViewRedesign already renders its own internal "back" button via the
// `onBack` prop; here we map that to clearing the URL selection.

import { useSelection } from '@/shell/providers/SelectionProvider';
import type { SelectionRef } from '@/shell/types';
import { TaskViewContainer } from './TaskViewContainer';

export function TaskDetailPanel({ selection }: { selection: SelectionRef }) {
  const { clearSelection } = useSelection();
  return (
    <aside
      data-testid="task-detail-panel"
      className="fixed right-0 top-0 z-30 h-screen w-full md:w-[480px] border-l border-neutral-200 bg-bg-elevated overflow-y-auto shadow-xl"
    >
      <TaskViewContainer taskId={selection.id} onBack={clearSelection} />
    </aside>
  );
}
