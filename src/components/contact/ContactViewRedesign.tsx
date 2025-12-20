import { useState, useRef, useEffect, useCallback } from 'react'
import type { Contact } from '@/types/contact'
import type { Task } from '@/types/task'
import type { Note, NoteEntityType } from '@/types/note'
import { EntityNotesSection } from '@/components/notes/EntityNotesSection'
import { UnifiedNotesEditor } from '@/components/notes/UnifiedNotesEditor'

interface ContactViewProps {
  contact: Contact
  onBack: () => void
  onUpdate: (id: string, updates: Partial<Contact>) => Promise<void>
  onDelete: (id: string) => Promise<void>
  tasks: Task[]
  onSelectTask: (taskId: string) => void
  // Pin props (available but not used in redesign yet)
  isPinned?: boolean
  canPin?: boolean
  onPin?: () => Promise<boolean>
  onUnpin?: () => Promise<boolean>
  // Notes support (linked entity notes)
  entityNotes?: Note[]
  entityNotesLoading?: boolean
  onAddEntityNote?: (content: string, entityType: NoteEntityType, entityId: string) => Promise<void>
  onNavigateToNote?: (noteId: string) => void
}

export function ContactViewRedesign({
  contact,
  onBack,
  onUpdate,
  onDelete,
  tasks,
  onSelectTask,
  // Pin props reserved for future use
  // isPinned,
  // canPin,
  // onPin,
  // onUnpin,
  entityNotes = [],
  entityNotesLoading = false,
  onAddEntityNote,
  onNavigateToNote,
}: ContactViewProps) {
  // Name editing
  const [isEditingName, setIsEditingName] = useState(false)
  const [editedName, setEditedName] = useState(contact.name)
  const nameInputRef = useRef<HTMLInputElement>(null)

  // Field editing states
  const [localPhone, setLocalPhone] = useState(contact.phone || '')
  const [localEmail, setLocalEmail] = useState(contact.email || '')

  // Debounce refs
  const phoneDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const emailDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Filter tasks linked to this contact
  const linkedTasks = tasks.filter((t) => t.contactId === contact.id)
  const incompleteTasks = linkedTasks.filter(t => !t.completed)
  const completedTasks = linkedTasks.filter(t => t.completed)

  // Sync state when contact changes
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setEditedName(contact.name)
    setLocalPhone(contact.phone || '')
    setLocalEmail(contact.email || '')
    setIsEditingName(false)
    setShowDeleteConfirm(false)
  }, [contact.id, contact.name, contact.phone, contact.email])
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus()
      nameInputRef.current.select()
    }
  }, [isEditingName])

  useEffect(() => {
    return () => {
      if (phoneDebounceRef.current) clearTimeout(phoneDebounceRef.current)
      if (emailDebounceRef.current) clearTimeout(emailDebounceRef.current)
    }
  }, [])

  const handleNameSave = () => {
    const trimmed = editedName.trim()
    if (trimmed && trimmed !== contact.name) {
      onUpdate(contact.id, { name: trimmed })
    }
    setIsEditingName(false)
  }

  const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleNameSave()
    else if (e.key === 'Escape') {
      setEditedName(contact.name)
      setIsEditingName(false)
    }
  }

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setLocalPhone(value)
    if (phoneDebounceRef.current) clearTimeout(phoneDebounceRef.current)
    phoneDebounceRef.current = setTimeout(() => {
      onUpdate(contact.id, { phone: value || undefined })
    }, 500)
  }

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setLocalEmail(value)
    if (emailDebounceRef.current) clearTimeout(emailDebounceRef.current)
    emailDebounceRef.current = setTimeout(() => {
      onUpdate(contact.id, { email: value || undefined })
    }, 500)
  }

  const handleNotesChange = useCallback((value: string | null) => {
    onUpdate(contact.id, { notes: value || undefined })
  }, [contact.id, onUpdate])

  const handleDelete = async () => {
    await onDelete(contact.id)
    onBack()
  }

  // Get initials for avatar
  const initials = contact.name
    .split(' ')
    .map(n => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <div className="h-full overflow-auto bg-[var(--color-bg-base)]">
      {/* Top accent */}
      <div className="absolute top-0 left-0 right-0 h-48 bg-gradient-to-b from-primary-50/50 to-transparent pointer-events-none" />

      <div className="relative max-w-6xl mx-auto px-6 py-8">
        {/* Back button */}
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-neutral-600
                     transition-colors mb-8 group"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-4 h-4 transition-transform group-hover:-translate-x-1"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
          Back to contacts
        </button>

        {/* Two-column layout */}
        <div className="flex gap-12 lg:gap-16">
          {/* ========== MAIN COLUMN - Tasks ========== */}
          <div className="flex-1 min-w-0">
            {/* Contact Header */}
            <div className="mb-10">
              <div className="flex items-start gap-5">
                {/* Avatar */}
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white text-xl font-semibold flex-shrink-0 shadow-lg">
                  {initials}
                </div>

                {/* Name */}
                <div className="flex-1 min-w-0">
                  {isEditingName ? (
                    <input
                      ref={nameInputRef}
                      type="text"
                      value={editedName}
                      onChange={(e) => setEditedName(e.target.value)}
                      onBlur={handleNameSave}
                      onKeyDown={handleNameKeyDown}
                      className="w-full font-display text-3xl lg:text-4xl font-semibold text-neutral-900
                                 leading-tight bg-transparent border-b-2 border-primary-500
                                 focus:outline-none py-1 -my-1 tracking-tight"
                    />
                  ) : (
                    <h1
                      className="font-display text-3xl lg:text-4xl font-semibold text-neutral-900 leading-tight
                                 cursor-pointer hover:text-neutral-700 transition-colors tracking-tight"
                      onClick={() => setIsEditingName(true)}
                    >
                      {contact.name}
                    </h1>
                  )}

                  {/* Quick contact info */}
                  <div className="flex items-center gap-4 mt-2 text-sm text-neutral-500">
                    {contact.phone && <span>{contact.phone}</span>}
                    {contact.phone && contact.email && <span className="text-neutral-300">•</span>}
                    {contact.email && <span>{contact.email}</span>}
                  </div>
                </div>
              </div>

              {/* Quick Actions - Prominent */}
              {(contact.phone || contact.email) && (
                <div className="flex gap-3 mt-6 ml-21">
                  {contact.phone && (
                    <>
                      <a
                        href={`tel:${contact.phone}`}
                        className="flex items-center gap-2 px-5 py-3 rounded-xl bg-primary-500 text-white font-medium
                                   hover:bg-primary-600 transition-colors shadow-sm"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                        </svg>
                        Call
                      </a>
                      <a
                        href={`sms:${contact.phone}`}
                        className="flex items-center gap-2 px-5 py-3 rounded-xl bg-primary-100 text-primary-700 font-medium
                                   hover:bg-primary-200 transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
                        </svg>
                        Text
                      </a>
                    </>
                  )}
                  {contact.email && (
                    <a
                      href={`mailto:${contact.email}`}
                      className="flex items-center gap-2 px-5 py-3 rounded-xl bg-neutral-100 text-neutral-700 font-medium
                                 hover:bg-neutral-200 transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                        <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                      </svg>
                      Email
                    </a>
                  )}
                </div>
              )}

              {/* Delete button - subtle */}
              <div className="flex items-center gap-2 mt-4 ml-21">
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="p-2 text-neutral-300 hover:text-red-500 rounded-lg transition-colors"
                  aria-label="Delete contact"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>

              {/* Delete confirmation */}
              {showDeleteConfirm && (
                <div className="mt-6 p-5 bg-red-50/80 border border-red-200/60 rounded-2xl backdrop-blur-sm">
                  <p className="text-sm text-red-800 mb-4 font-medium">
                    Delete this contact?
                    {linkedTasks.length > 0 && (
                      <span className="block mt-1 text-red-600 font-normal">
                        {linkedTasks.length} task{linkedTasks.length > 1 ? 's' : ''} will be unlinked.
                      </span>
                    )}
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      className="flex-1 py-2.5 px-4 text-sm font-medium text-neutral-600 bg-white
                                 rounded-xl hover:bg-neutral-50 transition-colors border border-neutral-200"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDelete}
                      className="flex-1 py-2.5 px-4 text-sm font-medium text-white bg-red-500
                                 rounded-xl hover:bg-red-600 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* ========== LINKED TASKS - The Centerpiece ========== */}
            <div className="mb-10">
              <h2 className="font-display text-lg font-medium text-neutral-800 mb-5 flex items-center gap-3">
                Linked Tasks
                {linkedTasks.length > 0 && (
                  <span className="text-sm font-normal text-neutral-400">
                    {linkedTasks.length} task{linkedTasks.length !== 1 ? 's' : ''}
                  </span>
                )}
              </h2>

              {linkedTasks.length === 0 ? (
                <div className="py-12 text-center">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-neutral-100 mb-4">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </div>
                  <p className="text-neutral-500 mb-1">No linked tasks</p>
                  <p className="text-sm text-neutral-400">Link tasks to this contact from the task detail view</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {/* Incomplete tasks first */}
                  {incompleteTasks.map((task) => (
                    <button
                      key={task.id}
                      onClick={() => onSelectTask(task.id)}
                      className="w-full flex items-center gap-4 py-3.5 px-4 -mx-4 rounded-xl
                                 hover:bg-white/60 transition-colors text-left group"
                    >
                      <span className="w-6 h-6 rounded-lg border-2 border-neutral-300 flex items-center justify-center flex-shrink-0
                                       group-hover:border-primary-400 transition-colors" />
                      <span className="flex-1 text-base text-neutral-800 truncate">{task.title}</span>
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-neutral-300" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                      </svg>
                    </button>
                  ))}

                  {/* Completed tasks */}
                  {completedTasks.length > 0 && (
                    <>
                      {incompleteTasks.length > 0 && (
                        <div className="py-3">
                          <div className="border-t border-neutral-200/60" />
                        </div>
                      )}
                      {completedTasks.map((task) => (
                        <button
                          key={task.id}
                          onClick={() => onSelectTask(task.id)}
                          className="w-full flex items-center gap-4 py-3.5 px-4 -mx-4 rounded-xl
                                     hover:bg-white/60 transition-colors text-left opacity-60"
                        >
                          <span className="w-6 h-6 rounded-lg bg-primary-500 border-2 border-primary-500 flex items-center justify-center flex-shrink-0 text-white">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          </span>
                          <span className="flex-1 text-base text-neutral-400 line-through truncate">{task.title}</span>
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-neutral-300" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                          </svg>
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Notes - Inline */}
            <div className="pt-8 border-t border-neutral-200/60">
              <h2 className="font-display text-lg font-medium text-neutral-800 mb-4">Notes</h2>
              <UnifiedNotesEditor
                value={contact.notes}
                onChange={handleNotesChange}
                placeholder="Add notes about this contact..."
                minHeight={150}
              />
            </div>

            {/* ========== RELATED NOTES - Linked notes from Second Brain ========== */}
            {onAddEntityNote && (
              <div className="pt-8 border-t border-neutral-200/60">
                <EntityNotesSection
                  entityType="contact"
                  entityId={contact.id}
                  notes={entityNotes}
                  loading={entityNotesLoading}
                  onAddNote={onAddEntityNote}
                  onNavigateToNote={onNavigateToNote}
                />
              </div>
            )}
          </div>

          {/* ========== SIDEBAR - Contact Details ========== */}
          <aside className="w-72 lg:w-80 flex-shrink-0 hidden md:block">
            <div className="sticky top-8 space-y-6">
              {/* Phone */}
              <div className="pb-6 border-b border-neutral-200/60">
                <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">Phone</h3>
                <div className="flex items-center gap-3">
                  <span className="w-9 h-9 rounded-xl bg-primary-50 flex items-center justify-center text-primary-600">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4.5 h-4.5" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                    </svg>
                  </span>
                  <input
                    type="tel"
                    value={localPhone}
                    onChange={handlePhoneChange}
                    placeholder="Add phone"
                    className="flex-1 text-neutral-800 placeholder:text-neutral-400 bg-transparent
                               focus:outline-none border-b border-transparent focus:border-primary-400 transition-colors"
                  />
                </div>
              </div>

              {/* Email */}
              <div className="pb-6 border-b border-neutral-200/60">
                <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">Email</h3>
                <div className="flex items-center gap-3">
                  <span className="w-9 h-9 rounded-xl bg-neutral-100 flex items-center justify-center text-neutral-600">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4.5 h-4.5" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                      <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                    </svg>
                  </span>
                  <input
                    type="email"
                    value={localEmail}
                    onChange={handleEmailChange}
                    placeholder="Add email"
                    className="flex-1 text-neutral-800 placeholder:text-neutral-400 bg-transparent
                               focus:outline-none border-b border-transparent focus:border-primary-400 transition-colors"
                  />
                </div>
              </div>

              {/* Stats */}
              <div>
                <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">Activity</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-neutral-500">Linked tasks</span>
                    <span className="font-medium text-neutral-800">{linkedTasks.length}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-neutral-500">Completed</span>
                    <span className="font-medium text-neutral-800">{completedTasks.length}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-neutral-500">Pending</span>
                    <span className="font-medium text-neutral-800">{incompleteTasks.length}</span>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
