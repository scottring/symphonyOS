import { Suspense, useState, useEffect } from 'react'
import { Routes, Route, useNavigate, useParams, Navigate } from 'react-router-dom'
import { useProjects } from '@/hooks/useProjects'
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks'
import { useContacts } from '@/hooks/useContacts'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { usePinnedItems } from '@/hooks/usePinnedItems'
import { useEventNotes, type EventNote } from '@/hooks/useEventNotes'
import { useDomain } from '@/hooks/useDomain'
import { matchesLayers } from '@/lib/today/domainFilter'
import { ProjectsList, ProjectView } from '@/components/lazy'
import { LoadingFallback } from '@/components/layout/LoadingFallback'

/**
 * Projects surface, mounted by the Shell at /projects/*. The inner <Routes>
 * match segments relative to /projects (the parent route ends in /*):
 *   index        -> ProjectsList
 *   :projectId   -> ProjectView
 *
 * Mirrors the legacy ViewRouter `projects` branch. Data comes from the same
 * context/standalone hooks. The list is domain filtered/tagged via useDomain.
 *
 * Opening a task from a project navigates to the tasks app's /task/:id route —
 * we do NOT use the Shell's setSelection (the tasks app owns 'task'; see
 * HistoryApp for the rationale).
 */
function ProjectsIndex() {
  const navigate = useNavigate()
  const { currentDomain, layers } = useDomain()
  const { projects, addProject, loading } = useProjects()
  const { tasks } = useSupabaseTasks()

  const filtered = projects.filter((p) => matchesLayers(p.context, layers))

  return (
    <Suspense fallback={<LoadingFallback />}>
      <ProjectsList
        projects={filtered}
        loading={loading}
        tasks={tasks}
        onSelectProject={(id) => navigate(`/projects/${id}`)}
        onAddProject={(project) =>
          addProject({
            ...project,
            context: currentDomain !== 'universal' ? currentDomain : undefined,
          })
        }
      />
    </Suspense>
  )
}

function ProjectDetail() {
  const navigate = useNavigate()
  const { projectId } = useParams<{ projectId: string }>()
  const { projects, updateProject, deleteProject } = useProjects()
  const { tasks, addTask, toggleTask, updateTask, deleteTask } = useSupabaseTasks()
  const { contactsMap } = useContacts()
  const { members: familyMembers, getCurrentUserMember } = useFamilyMembers()
  const { getEventNotesForProject } = useEventNotes()
  const pinnedItems = usePinnedItems()

  const project = projects.find((p) => p.id === projectId) ?? null

  const [linkedEvents, setLinkedEvents] = useState<EventNote[]>([])
  useEffect(() => {
    if (!projectId) return
    getEventNotesForProject(projectId).then(setLinkedEvents)
  }, [projectId, getEventNotesForProject])

  if (!project) {
    return projects.length > 0 ? <Navigate to="/projects" replace /> : <LoadingFallback />
  }

  return (
    <Suspense fallback={<LoadingFallback />}>
      <ProjectView
        project={project}
        tasks={tasks}
        contactsMap={contactsMap}
        onBack={() => navigate('/projects')}
        onUpdateProject={updateProject}
        onDeleteProject={async (id) => {
          await deleteProject(id)
          navigate('/projects')
        }}
        onAddTask={(title, pid) =>
          addTask(title, undefined, pid, undefined, {
            assignedTo: getCurrentUserMember()?.id,
          })
        }
        onDeleteTask={deleteTask}
        onSelectTask={(taskId) => navigate(`/task/${taskId}`)}
        onToggleTask={toggleTask}
        onUpdateTask={updateTask}
        familyMembers={familyMembers}
        linkedEvents={linkedEvents}
        isPinned={pinnedItems.isPinned('project', project.id)}
        canPin={pinnedItems.canPin()}
        onPin={() => pinnedItems.pin('project', project.id)}
        onUnpin={() => pinnedItems.unpin('project', project.id)}
      />
    </Suspense>
  )
}

export function ProjectsApp() {
  return (
    <Routes>
      <Route index element={<ProjectsIndex />} />
      <Route path=":projectId" element={<ProjectDetail />} />
      <Route path="*" element={<Navigate to="/projects" replace />} />
    </Routes>
  )
}
