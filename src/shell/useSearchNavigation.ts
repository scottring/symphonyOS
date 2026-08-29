// src/shell/useSearchNavigation.ts
//
// Opens a search result on the right surface: tasks jump the main view to
// their day + open the detail panel via URL; routines open the global detail
// panel; projects/contacts/lists navigate. Extracted from ShellSearch so the
// ⌘K omnibox (QuickCapture) can reuse it.

import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SearchResult } from '@/hooks/useSearch';
import type { Task } from '@/types/task';
import { useSelection } from './providers/SelectionProvider';

export function useSearchNavigation(): (result: SearchResult, tasks: Task[]) => void {
  const navigate = useNavigate();
  const { setSelection } = useSelection();

  return useCallback((result: SearchResult, tasks: Task[]) => {
    switch (result.type) {
      case 'task': {
        // Jump the main view to the task's scheduled day (so it's in context),
        // then open its detail panel — both via the URL in one navigation.
        const task = tasks.find((t) => t.id === result.id);
        const d = task?.scheduledFor ? new Date(task.scheduledFor) : null;
        const dateParam = d
          ? `date=${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}&`
          : '';
        navigate(`/today?${dateParam}detail=task:${result.id}`);
        break;
      }
      case 'routine': setSelection({ kind: 'routine', id: result.id }); break;
      case 'project': navigate(`/projects/${result.id}`); break;
      case 'contact': navigate(`/contacts/${result.id}`); break;
      case 'list': navigate('/lists'); break;
      // The stream owns note opening: `?note=` is read by NotesApp, so a
      // result stays linkable and survives a reload.
      case 'note': navigate(`/notes?note=${result.id}`); break;
    }
  }, [navigate, setSelection]);
}
