import { useNavigate } from 'react-router-dom'
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks'
import { useContacts } from '@/hooks/useContacts'
import { useProjects } from '@/hooks/useProjects'
import { CompletedTasksView } from '@/components/history/CompletedTasksView'

/**
 * History (completed-tasks archive) surface, mounted by the Shell at /history.
 *
 * Data comes from the same context-based hooks the tasks app uses
 * (useSupabaseTasks / useContacts / useProjects), so it stays in sync.
 *
 * Selecting an archived task opens it in the tasks app's full-page task route
 * (`/task/:id`). We deliberately do NOT use the Shell's `setSelection` here:
 * the SelectionProvider strips `?detail` whenever the active app does not own
 * the selection kind, and the tasks app — not History — owns 'task'. Setting a
 * task selection from /history would therefore be cleared immediately, so we
 * navigate to the task's own route instead (which is the tasks app).
 */
export function HistoryApp() {
  const navigate = useNavigate()
  const { tasks } = useSupabaseTasks()
  const { contactsMap } = useContacts()
  const { projectsMap } = useProjects()

  return (
    <CompletedTasksView
      tasks={tasks}
      contactsMap={contactsMap}
      projectsMap={projectsMap}
      onSelectTask={(taskId) => navigate(`/task/${taskId}`)}
      onBack={() => navigate('/today')}
    />
  )
}
