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
import type { Note, NoteEntityType } from '@/types/note';
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks';
import { useContacts } from '@/hooks/useContacts';
import { useProjects } from '@/hooks/useProjects';
import { useNotesContext } from '@/contexts/NotesContext';
import { LoadingFallback } from '@/components/layout/LoadingFallback';
import { TaskView } from '@/components/lazy';

interface Props {
  taskId: string;
  /** What to do when the user clicks back / close. */
  onBack: () => void;
}

export function TaskViewContainer({ taskId, onBack }: Props) {
  const { tasks, addSubtask, deleteTask, toggleTask, updateTask, pushTask } = useSupabaseTasks();
  const { contacts, contactsMap, addContact, searchContacts } = useContacts();
  const { projects, projectsMap, addProject, searchProjects } = useProjects();
  const { addNote, addEntityLink, getNotesForEntity } = useNotesContext();
  const navigate = useNavigate();

  const task = useMemo(() => tasks.find(t => t.id === taskId) ?? null, [tasks, taskId]);
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
        onAddSubtask={addSubtask}
        entityNotes={entityNotes}
        entityNotesLoading={entityNotesLoading}
        onAddEntityNote={handleAddEntityNote}
      />
    </Suspense>
  );
}
