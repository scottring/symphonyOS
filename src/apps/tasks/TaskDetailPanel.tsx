// src/apps/tasks/TaskDetailPanel.tsx
import type { SelectionRef } from '@/shell/types';

export function TaskDetailPanel({ selection }: { selection: SelectionRef }) {
  return (
    <aside data-testid="task-detail-panel-placeholder">
      Task panel placeholder for {selection.id}
    </aside>
  );
}
