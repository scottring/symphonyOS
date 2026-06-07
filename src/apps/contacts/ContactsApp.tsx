import { Suspense, useState, useEffect, useCallback } from 'react'
import { Routes, Route, useNavigate, useParams, Navigate } from 'react-router-dom'
import { useContacts } from '@/hooks/useContacts'
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks'
import { usePinnedItems } from '@/hooks/usePinnedItems'
import { NotesProvider, useNotesContext } from '@/contexts/NotesContext'
import { ContactsList, ContactView } from '@/components/lazy'
import { LoadingFallback } from '@/components/layout/LoadingFallback'
import type { Note, NoteEntityType } from '@/types/note'

/**
 * Contacts surface, mounted by the Shell at /contacts/*. The inner <Routes>
 * match segments relative to /contacts (the parent route ends in /*):
 *   index        -> ContactsList
 *   :contactId   -> ContactView
 *
 * Mirrors the legacy ViewRouter `contacts` / `contact-detail` branches. Data
 * comes from the same context/standalone hooks the legacy app used. The notes
 * feature lives behind NotesProvider, which App.tsx mounted globally — the
 * Shell tree doesn't, so we mount a NotesProvider here (it's self-contained).
 *
 * Selecting a task from a contact navigates to the tasks app's /task/:id route
 * — we do NOT use the Shell's setSelection (the tasks app owns 'task'; see
 * HistoryApp for the rationale).
 */
function ContactsIndex() {
  const navigate = useNavigate()
  const { contacts, addContact, deleteContact } = useContacts()

  return (
    <Suspense fallback={<LoadingFallback />}>
      <ContactsList
        contacts={contacts}
        onSelectContact={(contactId) => navigate(`/contacts/${contactId}`)}
        onBack={() => navigate('/')}
        onAddContact={addContact}
        onDeleteContact={deleteContact}
      />
    </Suspense>
  )
}

function ContactDetail() {
  const navigate = useNavigate()
  const { contactId } = useParams<{ contactId: string }>()
  const { contacts, updateContact, deleteContact } = useContacts()
  const { tasks } = useSupabaseTasks()
  const pinnedItems = usePinnedItems()
  const { addNote, addEntityLink, getNotesForEntity } = useNotesContext()

  const contact = contacts.find((c) => c.id === contactId) ?? null

  const [entityNotes, setEntityNotes] = useState<Note[]>([])
  const [entityNotesLoading, setEntityNotesLoading] = useState(false)

  useEffect(() => {
    if (!contact) return
    setEntityNotesLoading(true)
    getNotesForEntity('contact', contact.id)
      .then(setEntityNotes)
      .finally(() => setEntityNotesLoading(false))
  }, [contact?.id, getNotesForEntity])

  const handleAddEntityNote = useCallback(
    async (content: string, entityType: NoteEntityType, entityId: string) => {
      const note = await addNote({ content })
      if (note) {
        await addEntityLink(note.id, { entityType, entityId })
        const updated = await getNotesForEntity('contact', entityId)
        setEntityNotes(updated)
      }
    },
    [addNote, addEntityLink, getNotesForEntity],
  )

  // Contacts not yet loaded — wait. If loaded and missing, bounce to the list.
  if (!contact) {
    return contacts.length > 0 ? <Navigate to="/contacts" replace /> : <LoadingFallback />
  }

  return (
    <Suspense fallback={<LoadingFallback />}>
      <ContactView
        contact={contact}
        onBack={() => navigate('/contacts')}
        onUpdate={updateContact}
        onDelete={async (id) => {
          await deleteContact(id)
          navigate('/contacts')
        }}
        tasks={tasks}
        onSelectTask={(taskId) => navigate(`/task/${taskId}`)}
        isPinned={pinnedItems.isPinned('contact', contact.id)}
        canPin={pinnedItems.canPin()}
        onPin={() => pinnedItems.pin('contact', contact.id)}
        onUnpin={() => pinnedItems.unpin('contact', contact.id)}
        entityNotes={entityNotes}
        entityNotesLoading={entityNotesLoading}
        onAddEntityNote={handleAddEntityNote}
      />
    </Suspense>
  )
}

export function ContactsApp() {
  return (
    <NotesProvider>
      <Routes>
        <Route index element={<ContactsIndex />} />
        <Route path=":contactId" element={<ContactDetail />} />
        <Route path="*" element={<Navigate to="/contacts" replace />} />
      </Routes>
    </NotesProvider>
  )
}
