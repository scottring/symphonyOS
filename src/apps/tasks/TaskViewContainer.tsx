// src/apps/tasks/TaskViewContainer.tsx
//
// Wires data hooks to the existing TaskViewRedesign component. Used by both:
//  - /tasks-new/task/:taskId      (full-page editor; from `useParams`)
//  - <TaskDetailPanel>            (side-panel content; from selection.id)
//
// Reusing the same content keeps task editing identical between the desktop
// full-page route and the side-panel slot. Differences in chrome (back button
// vs close button, layout) are owned by the caller.

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoalPeriodShelves } from '@/components/plan/GoalPeriodShelves';
import { useHouseholdSeasons } from '@/hooks/useHouseholdSeasons';
import { useGoalsContext } from '@/contexts/GoalsContext';
import { supportedGoal, goalsSupporting, type SupportLink } from '@/lib/planning/goalSupport';
import type { Note, NoteEntityType } from '@/types/note';
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks';
import { useContacts } from '@/hooks/useContacts';
import { useProjects } from '@/hooks/useProjects';
import { useNotesContext } from '@/contexts/NotesContext';
import { useVaultWrite } from '@/hooks/useVaultWrite';
import { LoadingFallback } from '@/components/layout/LoadingFallback';
import { TaskView } from '@/components/lazy';

interface Props {
  taskId: string;
  /** What to do when the user clicks back / close. */
  onBack: () => void;
}

export function TaskViewContainer({ taskId, onBack }: Props) {
  const { tasks, addTask, addSubtask, deleteTask, toggleTask, updateTask, pushTask } = useSupabaseTasks();
  const { contacts, contactsMap, addContact, searchContacts } = useContacts();
  const { projects, projectsMap, addProject, searchProjects } = useProjects();
  const { addNote, addEntityLink, getNotesForEntity } = useNotesContext();
  const { seasons } = useHouseholdSeasons();
  const { goals } = useGoalsContext();
  const { createVaultNote } = useVaultWrite();
  const navigate = useNavigate();

  const task = useMemo(() => tasks.find(t => t.id === taskId) ?? null, [tasks, taskId]);

  // A goal's children are its STEPS, joined by goal_task_id and carrying the
  // goal's own period — not subtasks. Adding a subtask under a goal wrote
  // parent_task_id with bucket 'inbox', which no horizon page renders, so the
  // work vanished (walk finding S2-06).
  const isGoal = task?.isGoal === true;
  const steps = useMemo(
    () => (isGoal && task ? tasks.filter(t => t.goalTaskId === task.id) : []),
    [isGoal, task, tasks],
  );
  const addStep = useCallback(async (goalId: string, title: string) => {
    if (!task) return undefined;
    return addTask(title, undefined, undefined, undefined, {
      bucket: task.bucket === 'quarter' ? 'quarter' : 'month',
      monthStart: task.monthStart,
      seasonStart: task.seasonStart,
      goalTaskId: goalId,
      context: task.context ?? undefined,
    });
  }, [addTask, task]);
  // Both ends of the goal-supports-goal link, read through the one module the
  // plan pages and the year goal's page also read, so the four surfaces cannot
  // disagree. A goal opened from a plan row used to be a dead end: the row
  // said what it served, the detail page said nothing (Codex, live,
  // 2026-09-24). Ordinary tasks ask and get nothing.
  const supports = useMemo(
    () => (isGoal && task ? supportedGoal(task, tasks, goals, seasons) : null),
    [isGoal, task, tasks, goals, seasons],
  );
  const supportedBy = useMemo(
    () => (isGoal && task ? goalsSupporting(task, tasks) : []),
    [isGoal, task, tasks],
  );
  // A year goal is a goals-table row and opens on its own page; a month or
  // season goal is a task and opens here — the same split PeriodPlanPage makes.
  const openGoalLink = useCallback(
    (link: SupportLink) => navigate(link.rung === 'year' ? `/goals/${link.id}` : `/task/${link.id}`),
    [navigate],
  );

  const contact = task?.contactId ? contactsMap.get(task.contactId) ?? null : null;
  const project = task?.projectId ? projectsMap.get(task.projectId) ?? null : null;

  const [entityNotes, setEntityNotes] = useState<Note[]>([]);
  const [entityNotesLoading, setEntityNotesLoading] = useState(false);

  useEffect(() => {
    if (!task) {
      setEntityNotes([]);
      return;
    }
    setEntityNotesLoading(true);
    getNotesForEntity('task', task.id)
      .then(setEntityNotes)
      .finally(() => setEntityNotesLoading(false));
  }, [task?.id, getNotesForEntity]);

  const handleAddEntityNote = useCallback(
    async (content: string, entityType: NoteEntityType, entityId: string) => {
      const note = await addNote({ content });
      if (note) {
        await addEntityLink(note.id, { entityType, entityId });
        const updated = await getNotesForEntity('task', entityId);
        setEntityNotes(updated);
      }
    },
    [addNote, addEntityLink, getNotesForEntity],
  );

  // "Save to vault": write the task's notes as a persisting markdown note in the
  // vault (durable, via GitHub — no Mac Mini dependency), then link it to the task
  // so it surfaces here and survives the task being completed/deleted.
  const handleSaveNoteToVault = useCallback(
    async (content: string): Promise<{ ok: boolean; url?: string }> => {
      if (!task) return { ok: false };
      const title = task.title?.trim() || 'Task note';
      const slug =
        title
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, '')
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '') || 'task-note';
      const path = `notes/${slug}-${task.id.slice(0, 8)}.md`;
      const result = await createVaultNote(
        { title, content, path },
        `Save task note to vault: ${title}`,
      );
      if (!result?.success || !result.noteId) return { ok: false };
      await addEntityLink(result.noteId, { entityType: 'task', entityId: task.id, linkType: 'primary' });
      setEntityNotes(await getNotesForEntity('task', task.id));
      return { ok: true, url: result.githubUrl };
    },
    [task, createVaultNote, addEntityLink, getNotesForEntity],
  );

  const handleDelete = useCallback(
    (id: string) => {
      deleteTask(id);
      onBack();
    },
    [deleteTask, onBack],
  );

  if (!task) {
    return (
      <div className="p-8 text-center text-neutral-500">
        Task not found.
        <button onClick={onBack} className="ml-2 underline">
          Go back
        </button>
      </div>
    );
  }

  return (
    <Suspense fallback={<LoadingFallback />}>
      {/* A goal shows its own period's Shelves — the same component the Month
          page renders — rather than today's task chooser (S2-18). Goals only:
          an ordinary task's detail page is unchanged. */}
      {isGoal && task && <GoalPeriodShelves goal={task} onNavigate={navigate} />}
      <TaskView
        task={task}
        onBack={onBack}
        onUpdate={updateTask}
        onDelete={handleDelete}
        onToggleComplete={toggleTask}
        onPush={pushTask}
        contact={contact}
        contacts={contacts}
        onSearchContacts={searchContacts}
        onAddContact={addContact}
        onOpenContact={(contactId) => navigate(`/contacts/${contactId}`)}
        project={project}
        projects={projects}
        onSearchProjects={searchProjects}
        onOpenProject={(projectId) => navigate(`/projects/${projectId}`)}
        onAddProject={addProject}
        onAddSubtask={isGoal ? addStep : addSubtask}
        steps={steps}
        supports={supports}
        supportedBy={supportedBy}
        onOpenGoalLink={openGoalLink}
        entityNotes={entityNotes}
        entityNotesLoading={entityNotesLoading}
        onAddEntityNote={handleAddEntityNote}
        onSaveNoteToVault={handleSaveNoteToVault}
      />
    </Suspense>
  );
}
