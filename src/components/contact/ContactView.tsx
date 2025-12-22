import { useState, useRef, useEffect, useMemo } from 'react'
import type { Contact, ContactCategory } from '@/types/contact'
import { getCategoryLabel, getCategoryIcon } from '@/types/contact'
import type { Task } from '@/types/task'
import { PinButton } from '@/components/pins'
import { CategoryPicker } from './CategoryPicker'
import { DATE_INPUT_CLASS } from '@/lib/inputStyles'

interface ContactViewProps {
  contact: Contact
  onBack: () => void
  onUpdate: (id: string, updates: Partial<Contact>) => Promise<void>
  onDelete: (id: string) => Promise<void>
  // Linked tasks
  tasks: Task[]
  onSelectTask: (taskId: string) => void
  // Pin props
  isPinned?: boolean
  canPin?: boolean
  onPin?: () => Promise<boolean>
  onUnpin?: () => Promise<boolean>
}

// Format date for display (e.g., "March 15" or "March 15, 1990")
function formatBirthday(dateStr: string | undefined): string {
  if (!dateStr) return ''
  const date = new Date(dateStr + 'T00:00:00') // Ensure local timezone
  const month = date.toLocaleDateString('en-US', { month: 'long' })
  const day = date.getDate()
  const year = date.getFullYear()
  // If year is 1900 or earlier, assume no year was intended
  if (year <= 1900) {
    return `${month} ${day}`
  }
  return `${month} ${day}, ${year}`
}

// Format completion date
function formatCompletionDate(date: Date): string {
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function ContactView({
  contact,
  onBack,
  onUpdate,
  onDelete,
  tasks,
  onSelectTask,
  isPinned,
  canPin,
  onPin,
  onUnpin,
}: ContactViewProps) {
  // Name editing
  const [isEditingName, setIsEditingName] = useState(false)
  const [editedName, setEditedName] = useState(contact.name)
  const nameInputRef = useRef<HTMLInputElement>(null)

  // Field editing states
  const [localPhone, setLocalPhone] = useState(contact.phone || '')
  const [localEmail, setLocalEmail] = useState(contact.email || '')
  const [localNotes, setLocalNotes] = useState(contact.notes || '')
  const [localRelationship, setLocalRelationship] = useState(contact.relationship || '')
  const [localBirthday, setLocalBirthday] = useState(contact.birthday || '')
  const [localPreferences, setLocalPreferences] = useState(contact.preferences || '')

  // Debounce refs
  const phoneDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const emailDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const notesDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const relationshipDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const birthdayDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const preferencesDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Filter and sort tasks linked to this contact
  const linkedTasks = useMemo(() => {
    const filtered = tasks.filter((t) => t.contactId === contact.id)
    // Sort: incomplete first, then by completion date (most recent first)
    return filtered.sort((a, b) => {
      if (a.completed && !b.completed) return 1
      if (!a.completed && b.completed) return -1
      // Both completed or both incomplete - sort by updated date
      return b.updatedAt.getTime() - a.updatedAt.getTime()
    })
  }, [tasks, contact.id])

  // Separate active and completed tasks
  const activeTasks = useMemo(() => linkedTasks.filter(t => !t.completed), [linkedTasks])
  const completedTasks = useMemo(() => linkedTasks.filter(t => t.completed), [linkedTasks])

  const isFamily = contact.category === 'family'

  // Sync state when contact changes
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setEditedName(contact.name)
    setLocalPhone(contact.phone || '')
    setLocalEmail(contact.email || '')
    setLocalNotes(contact.notes || '')
    setLocalRelationship(contact.relationship || '')
    setLocalBirthday(contact.birthday || '')
    setLocalPreferences(contact.preferences || '')
    setIsEditingName(false)
    setShowDeleteConfirm(false)
  }, [contact.id, contact.name, contact.phone, contact.email, contact.notes, contact.relationship, contact.birthday, contact.preferences])
  /* eslint-enable react-hooks/set-state-in-effect */

  // Focus name input when editing starts
  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus()
      nameInputRef.current.select()
    }
  }, [isEditingName])

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (phoneDebounceRef.current) clearTimeout(phoneDebounceRef.current)
      if (emailDebounceRef.current) clearTimeout(emailDebounceRef.current)
      if (notesDebounceRef.current) clearTimeout(notesDebounceRef.current)
      if (relationshipDebounceRef.current) clearTimeout(relationshipDebounceRef.current)
      if (birthdayDebounceRef.current) clearTimeout(birthdayDebounceRef.current)
      if (preferencesDebounceRef.current) clearTimeout(preferencesDebounceRef.current)
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
    if (e.key === 'Enter') {
      handleNameSave()
    } else if (e.key === 'Escape') {
      setEditedName(contact.name)
      setIsEditingName(false)
    }
  }

  const handleCategoryChange = (category: ContactCategory | undefined) => {
    onUpdate(contact.id, { category })
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

  const handleNotesChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setLocalNotes(value)

    if (notesDebounceRef.current) clearTimeout(notesDebounceRef.current)
    notesDebounceRef.current = setTimeout(() => {
      onUpdate(contact.id, { notes: value || undefined })
    }, 500)
  }

  const handleRelationshipChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setLocalRelationship(value)

    if (relationshipDebounceRef.current) clearTimeout(relationshipDebounceRef.current)
    relationshipDebounceRef.current = setTimeout(() => {
      onUpdate(contact.id, { relationship: value || undefined })
    }, 500)
  }

  const handleBirthdayChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setLocalBirthday(value)

    if (birthdayDebounceRef.current) clearTimeout(birthdayDebounceRef.current)
    birthdayDebounceRef.current = setTimeout(() => {
      onUpdate(contact.id, { birthday: value || undefined })
    }, 500)
  }

  const handlePreferencesChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setLocalPreferences(value)

    if (preferencesDebounceRef.current) clearTimeout(preferencesDebounceRef.current)
    preferencesDebounceRef.current = setTimeout(() => {
      onUpdate(contact.id, { preferences: value || undefined })
    }, 500)
  }

  const handleDelete = async () => {
    await onDelete(contact.id)
    onBack()
  }

  return (
    <div className="h-full overflow-auto">
      <div className="p-6 max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={onBack}
              className="flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              Back
            </button>
            <span className="text-neutral-300">/</span>
            <span className="text-sm font-medium text-neutral-600">Contact</span>
          </div>

          <div className="flex items-start gap-4">
            {/* Contact avatar with category icon */}
            <div className="w-14 h-14 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0 text-2xl">
              {contact.category ? getCategoryIcon(contact.category) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 text-primary-600" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                </svg>
              )}
            </div>

            {/* Name and category badge */}
            <div className="flex-1 min-w-0">
              {isEditingName ? (
                <input
                  ref={nameInputRef}
                  type="text"
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  onBlur={handleNameSave}
                  onKeyDown={handleNameKeyDown}
                  className="w-full font-display text-2xl font-semibold text-neutral-800 leading-tight
                             bg-transparent border-b-2 border-primary-500
                             focus:outline-none py-0.5 -my-0.5"
                />
              ) : (
                <h1
                  className="font-display text-2xl font-semibold leading-tight text-neutral-900
                             cursor-pointer hover:text-primary-600 transition-colors"
                  onClick={() => setIsEditingName(true)}
                >
                  {contact.name}
                </h1>
              )}
              {/* Category and relationship badge */}
              {(contact.category || contact.relationship) && (
                <p className="text-sm text-neutral-500 mt-1">
                  {getCategoryLabel(contact.category)}
                  {contact.category && contact.relationship && ' · '}
                  {contact.relationship}
                </p>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-1">
              {onPin && onUnpin && (
                <PinButton
                  entityType="contact"
                  entityId={contact.id}
                  isPinned={isPinned ?? false}
                  canPin={canPin ?? true}
                  onPin={onPin}
                  onUnpin={onUnpin}
                  size="md"
                />
              )}
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="p-2 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              aria-label="Delete contact"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </button>
            </div>
          </div>

          {/* Delete confirmation */}
          {showDeleteConfirm && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-sm text-red-800 mb-3">
                Are you sure you want to delete this contact?
                {linkedTasks.length > 0 && (
                  <span className="block mt-1 text-red-600">
                    This will unlink {linkedTasks.length} task{linkedTasks.length > 1 ? 's' : ''}.
                  </span>
                )}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 py-2 px-3 text-sm font-medium text-neutral-600 bg-white rounded-lg hover:bg-neutral-50 transition-colors border border-neutral-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  className="flex-1 py-2 px-3 text-sm font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors"
                >
                  Delete Contact
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Main content */}
        <div className="space-y-6">
          {/* Quick Actions */}
          {(contact.phone || contact.email) && (
            <div className="flex gap-2">
              {contact.phone && (
                <>
                  <a
                    href={`tel:${contact.phone}`}
                    className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-primary-50 text-primary-600 font-medium hover:bg-primary-100 transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                    </svg>
                    Call
                  </a>
                  <a
                    href={`sms:${contact.phone}`}
                    className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-primary-50 text-primary-600 font-medium hover:bg-primary-100 transition-colors"
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
                  className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-primary-50 text-primary-600 font-medium hover:bg-primary-100 transition-colors"
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

          {/* Category Picker */}
          <div className="bg-white rounded-xl border border-neutral-100 p-4">
            <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wide mb-3">Category</h2>
            <CategoryPicker value={contact.category} onChange={handleCategoryChange} />
          </div>

          {/* Family-specific fields */}
          {isFamily && (
            <div className="bg-white rounded-xl border border-neutral-100 p-4">
              <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wide mb-3">Details</h2>
              <div className="space-y-4">
                {/* Birthday */}
                <div>
                  <label className="flex items-center gap-2 text-sm text-neutral-600 mb-1.5">
                    <span>Birthday</span>
                    {localBirthday && (
                      <span className="text-neutral-400">({formatBirthday(localBirthday)})</span>
                    )}
                  </label>
                  <input
                    type="date"
                    value={localBirthday}
                    onChange={handleBirthdayChange}
                    className={`w-full ${DATE_INPUT_CLASS}`}
                  />
                </div>
                {/* Relationship */}
                <div>
                  <label className="block text-sm text-neutral-600 mb-1.5">Relationship</label>
                  <input
                    type="text"
                    value={localRelationship}
                    onChange={handleRelationshipChange}
                    placeholder="e.g., Son, Spouse, Mother"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200
                               focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Preferences & Facts (show for family, or if preferences exist for other types) */}
          {(isFamily || contact.preferences) && (
            <div className="bg-white rounded-xl border border-neutral-100 p-4">
              <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wide mb-3">
                {isFamily ? 'Preferences & Facts' : 'Preferences'}
              </h2>
              <textarea
                value={localPreferences}
                onChange={handlePreferencesChange}
                placeholder={isFamily
                  ? "Shoe size, favorite foods, allergies, interests..."
                  : "Add preferences or facts about this contact..."
                }
                rows={4}
                className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200
                           focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent
                           resize-none"
              />
            </div>
          )}

          {/* Contact Info */}
          <div className="bg-white rounded-xl border border-neutral-100 p-4">
            <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wide mb-3">Contact Info</h2>
            <div className="space-y-4">
              {/* Phone */}
              <div>
                <label className="block text-sm text-neutral-600 mb-1.5">Phone</label>
                <input
                  type="tel"
                  value={localPhone}
                  onChange={handlePhoneChange}
                  placeholder="Add phone number"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200
                             focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              {/* Email */}
              <div>
                <label className="block text-sm text-neutral-600 mb-1.5">Email</label>
                <input
                  type="email"
                  value={localEmail}
                  onChange={handleEmailChange}
                  placeholder="Add email address"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200
                             focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* Notes Field (for non-family or general notes) */}
          {!isFamily && (
            <div className="bg-white rounded-xl border border-neutral-100 p-4">
              <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wide mb-3">Notes</h2>
              <textarea
                value={localNotes}
                onChange={handleNotesChange}
                placeholder="Add notes about this contact..."
                rows={4}
                className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200
                           focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent
                           resize-none"
              />
            </div>
          )}

          {/* Task History - Enhanced with notes snippets */}
          <div className="bg-white rounded-xl border border-neutral-100 p-4">
            <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wide mb-3">
              History {linkedTasks.length > 0 && `(${linkedTasks.length})`}
            </h2>

            {linkedTasks.length > 0 ? (
              <div className="space-y-4">
                {/* Active Tasks */}
                {activeTasks.length > 0 && (
                  <div>
                    <h3 className="text-xs font-medium text-neutral-400 uppercase tracking-wide mb-2">Active</h3>
                    <ul className="space-y-2">
                      {activeTasks.map((task) => (
                        <TaskHistoryItem key={task.id} task={task} onSelect={onSelectTask} />
                      ))}
                    </ul>
                  </div>
                )}

                {/* Completed Tasks */}
                {completedTasks.length > 0 && (
                  <div>
                    <h3 className="text-xs font-medium text-neutral-400 uppercase tracking-wide mb-2">Completed</h3>
                    <ul className="space-y-2">
                      {completedTasks.map((task) => (
                        <TaskHistoryItem key={task.id} task={task} onSelect={onSelectTask} />
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-neutral-400 text-center py-4">
                No tasks linked to this contact
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// Task history item component with notes snippet
function TaskHistoryItem({ task, onSelect }: { task: Task; onSelect: (id: string) => void }) {
  // Truncate notes to ~50 chars
  const notesSnippet = task.notes
    ? (task.notes.length > 50 ? task.notes.slice(0, 50) + '...' : task.notes)
    : null

  return (
    <li>
      <button
        onClick={() => onSelect(task.id)}
        className="w-full flex flex-col gap-1 p-3 rounded-lg bg-neutral-50 hover:bg-neutral-100 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <span
            className={`w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center ${
              task.completed
                ? 'bg-primary-500 border-primary-500 text-white'
                : 'border-neutral-300'
            }`}
          >
            {task.completed && (
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            )}
          </span>
          <span className={`flex-1 text-sm ${task.completed ? 'text-neutral-400 line-through' : 'text-neutral-800'}`}>
            {task.title}
          </span>
          {task.completed && (
            <span className="text-xs text-neutral-400">
              {formatCompletionDate(task.updatedAt)}
            </span>
          )}
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-neutral-400 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
          </svg>
        </div>
        {/* Notes snippet */}
        {notesSnippet && (
          <p className="text-xs text-neutral-500 ml-8 italic">
            "{notesSnippet}"
          </p>
        )}
      </button>
    </li>
  )
}
