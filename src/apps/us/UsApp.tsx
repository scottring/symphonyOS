// src/apps/us/UsApp.tsx
//
// Phase 4 — data container for the "Us" couple surface. Fetches shared tasks,
// this week's calendar, and household members; selecting a task opens the global
// detail panel (the tasks app owns the 'task' selection kind).

import { useMemo } from 'react';
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks';
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar';
import { useFamilyMembers } from '@/hooks/useFamilyMembers';
import { useSelection } from '@/shell/providers/SelectionProvider';
import { UsView } from './UsView';

export function UsApp() {
  const { tasks } = useSupabaseTasks();
  const { events } = useGoogleCalendar();
  const { members } = useFamilyMembers();
  const { setSelection } = useSelection();
  const now = useMemo(() => new Date(), []);

  return (
    <UsView
      tasks={tasks}
      events={events}
      members={members}
      now={now}
      onSelectTask={(id) => setSelection({ kind: 'task', id })}
    />
  );
}
