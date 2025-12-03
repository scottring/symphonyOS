import { useState, useRef, useEffect, useMemo } from 'react'
import '@/types/speech.d.ts'
import type { Contact } from '@/types/contact'
import type { Project } from '@/types/project'
import type { RecurrencePattern } from '@/types/actionable'
import type { CreateRoutineInput } from '@/hooks/useRoutines'
import { parseNaturalDate, formatDatePreview } from '@/utils/parseNaturalDate'

type CaptureMode = 'task' | 'routine'

interface QuickCaptureProps {
  onAdd: (title: string, contactId?: string, projectId?: string, scheduledFor?: Date) => void
  onAddRoutine?: (input: CreateRoutineInput) => Promise<unknown>
  isOpen?: boolean
  onOpen?: () => void
  onClose?: () => void
  showFab?: boolean
  // Contact support
  contacts?: Contact[]
  onAddContact?: (contact: { name: string; phone?: string; email?: string }) => Promise<Contact | null>
  // Project support
  projects?: Project[]
  onAddProject?: (project: { name: string }) => Promise<Project | null>
}

// Get the SpeechRecognition constructor
const SpeechRecognitionAPI = typeof window !== 'undefined'
  ? (window.SpeechRecognition || window.webkitSpeechRecognition)
  : undefined

export function QuickCapture({
  onAdd,
  onAddRoutine,
  isOpen: controlledIsOpen,
  onOpen,
  onClose,
  showFab = true,
  contacts = [],
  onAddContact,
  projects = [],
  onAddProject,
}: QuickCaptureProps) {
  // Support both controlled and uncontrolled modes
  const [internalIsOpen, setInternalIsOpen] = useState(false)
  const isOpen = controlledIsOpen ?? internalIsOpen

  // Capture mode: task or routine
  const [mode, setMode] = useState<CaptureMode>('task')

  const [title, setTitle] = useState('')
  const [isListening, setIsListening] = useState(false)

  // Routine-specific state
  const [routineRecurrence, setRoutineRecurrence] = useState<RecurrencePattern['type']>('daily')
  const [routineDays, setRoutineDays] = useState<string[]>([])
  const [routineTime, setRoutineTime] = useState('')

  // Contact state
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const [showContactDropdown, setShowContactDropdown] = useState(false)
  const [contactQuery, setContactQuery] = useState('')

  // Project state
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [showProjectDropdown, setShowProjectDropdown] = useState(false)
  const [projectQuery, setProjectQuery] = useState('')

  // Parsed date from natural language
  const [parsedDate, setParsedDate] = useState<Date | null>(null)

  // Unified dropdown state for keyboard nav
  const [highlightedIndex, setHighlightedIndex] = useState(0)

  // Contact creation form state
  const [showContactForm, setShowContactForm] = useState(false)
  const [newContactName, setNewContactName] = useState('')
  const [newContactPhone, setNewContactPhone] = useState('')
  const [newContactEmail, setNewContactEmail] = useState('')
  const [isCreatingContact, setIsCreatingContact] = useState(false)

  // Project creation state
  const [isCreatingProject, setIsCreatingProject] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const phoneInputRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<InstanceType<NonNullable<typeof SpeechRecognitionAPI>> | null>(null)

  // Check if speech recognition is available
  const speechSupported = !!SpeechRecognitionAPI

  // Filter contacts based on query
  const filteredContacts = useMemo(() => {
    if (!contactQuery.trim()) return contacts.slice(0, 5)
    const query = contactQuery.toLowerCase()
    return contacts.filter(c => c.name.toLowerCase().includes(query)).slice(0, 5)
  }, [contacts, contactQuery])

  // Filter projects based on query
  const filteredProjects = useMemo(() => {
    if (!projectQuery.trim()) return projects.filter(p => p.status !== 'completed').slice(0, 5)
    const query = projectQuery.toLowerCase()
    return projects.filter(p => p.name.toLowerCase().includes(query) && p.status !== 'completed').slice(0, 5)
  }, [projects, projectQuery])

  // Check if we should show "Create contact" option
  const showCreateContactOption = contactQuery.trim().length > 0 &&
    !filteredContacts.some(c => c.name.toLowerCase() === contactQuery.toLowerCase())

  // Check if we should show "Create project" option
  const showCreateProjectOption = projectQuery.trim().length > 0 &&
    !filteredProjects.some(p => p.name.toLowerCase() === projectQuery.toLowerCase())

  const handleOpen = () => {
    if (onOpen) {
      onOpen()
    } else {
      setInternalIsOpen(true)
    }
  }

  const handleClose = () => {
    setTitle('')
    setMode('task')
    setSelectedContact(null)
    setShowContactDropdown(false)
    setContactQuery('')
    setSelectedProject(null)
    setShowProjectDropdown(false)
    setProjectQuery('')
    setParsedDate(null)
    setShowContactForm(false)
    setNewContactName('')
    setNewContactPhone('')
    setNewContactEmail('')
    // Reset routine state
    setRoutineRecurrence('daily')
    setRoutineDays([])
    setRoutineTime('')
    if (onClose) {
      onClose()
    } else {
      setInternalIsOpen(false)
    }
  }

  // Reset all state when modal opens to ensure clean slate
  useEffect(() => {
    if (isOpen) {
      // Reset form state when opening
      setTitle('')
      setMode('task')
      setSelectedContact(null)
      setShowContactDropdown(false)
      setContactQuery('')
      setSelectedProject(null)
      setShowProjectDropdown(false)
      setProjectQuery('')
      setParsedDate(null)
      setShowContactForm(false)
      setNewContactName('')
      setNewContactPhone('')
      setNewContactEmail('')
      setRoutineRecurrence('daily')
      setRoutineDays([])
      setRoutineTime('')
      // Focus input after state reset
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  // Reset highlighted index when filtered results change
  useEffect(() => {
    setHighlightedIndex(0)
  }, [filteredContacts.length, showCreateContactOption, filteredProjects.length, showCreateProjectOption])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return

    if (mode === 'routine' && onAddRoutine) {
      // Build recurrence pattern
      const recurrence_pattern: RecurrencePattern = { type: routineRecurrence }
      if (routineRecurrence === 'weekly' && routineDays.length > 0) {
        recurrence_pattern.days = routineDays
      }

      await onAddRoutine({
        name: trimmed,
        recurrence_pattern,
        time_of_day: routineTime || undefined,
      })
    } else {
      // Use cleaned title if we parsed a date, otherwise use original
      const parseResult = parseNaturalDate(trimmed)
      const finalTitle = parseResult ? parseResult.cleanedTitle : trimmed
      const scheduledFor = parseResult?.scheduledFor || undefined
      onAdd(finalTitle, selectedContact?.id, selectedProject?.id, scheduledFor)
    }

    setTitle('')
    setSelectedContact(null)
    setSelectedProject(null)
    setParsedDate(null)
    handleClose()
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setTitle(value)

    // In routine mode, don't trigger contact/project dropdowns or date parsing
    if (mode === 'routine') return

    // Parse natural language date from input (for preview)
    const parseResult = parseNaturalDate(value)
    setParsedDate(parseResult?.scheduledFor || null)

    // Check for @ trigger (contacts)
    const lastAtIndex = value.lastIndexOf('@')
    if (lastAtIndex !== -1 && !showProjectDropdown) {
      const charBefore = lastAtIndex > 0 ? value[lastAtIndex - 1] : ' '
      if (charBefore === ' ' || lastAtIndex === 0) {
        const query = value.slice(lastAtIndex + 1)
        // Don't include text after a space that contains #
        const spaceAfterAt = query.indexOf(' ')
        const hashInQuery = query.indexOf('#')
        if (hashInQuery === -1 || (spaceAfterAt !== -1 && hashInQuery > spaceAfterAt)) {
          setContactQuery(query.split('#')[0]) // Stop at # if present
          setShowContactDropdown(true)
          setShowProjectDropdown(false)
          return
        }
      }
    }

    // Check for # trigger (projects)
    const lastHashIndex = value.lastIndexOf('#')
    if (lastHashIndex !== -1 && !showContactDropdown) {
      const charBefore = lastHashIndex > 0 ? value[lastHashIndex - 1] : ' '
      if (charBefore === ' ' || lastHashIndex === 0) {
        const query = value.slice(lastHashIndex + 1)
        // Don't include text after a space that contains @
        const spaceAfterHash = query.indexOf(' ')
        const atInQuery = query.indexOf('@')
        if (atInQuery === -1 || (spaceAfterHash !== -1 && atInQuery > spaceAfterHash)) {
          setProjectQuery(query.split('@')[0]) // Stop at @ if present
          setShowProjectDropdown(true)
          setShowContactDropdown(false)
          return
        }
      }
    }

    setShowContactDropdown(false)
    setContactQuery('')
    setShowProjectDropdown(false)
    setProjectQuery('')
  }

  const handleSelectContact = (contact: Contact) => {
    // Replace @query with just the task text (remove the @mention)
    const lastAtIndex = title.lastIndexOf('@')
    const newTitle = lastAtIndex > 0 ? title.slice(0, lastAtIndex).trim() : ''
    setTitle(newTitle)
    setSelectedContact(contact)
    setShowContactDropdown(false)
    setContactQuery('')
    inputRef.current?.focus()
  }

  const handleSelectProject = (project: Project) => {
    // Replace #query with just the task text (remove the #mention)
    const lastHashIndex = title.lastIndexOf('#')
    const newTitle = lastHashIndex > 0 ? title.slice(0, lastHashIndex).trim() : ''
    setTitle(newTitle)
    setSelectedProject(project)
    setShowProjectDropdown(false)
    setProjectQuery('')
    inputRef.current?.focus()
  }

  const handleCreateContact = () => {
    if (!contactQuery.trim()) return
    // Show the contact creation form
    setNewContactName(contactQuery.trim())
    setShowContactForm(true)
    setShowContactDropdown(false)
    // Focus phone input after render
    setTimeout(() => phoneInputRef.current?.focus(), 50)
  }

  const handleCreateProject = async () => {
    if (!onAddProject || !projectQuery.trim()) return

    setIsCreatingProject(true)
    const newProject = await onAddProject({
      name: projectQuery.trim(),
    })
    setIsCreatingProject(false)

    if (newProject) {
      // Remove #query from title and select new project
      const lastHashIndex = title.lastIndexOf('#')
      const newTitle = lastHashIndex > 0 ? title.slice(0, lastHashIndex).trim() : ''
      setTitle(newTitle)
      setSelectedProject(newProject)
      setShowProjectDropdown(false)
      setProjectQuery('')
      inputRef.current?.focus()
    }
  }

  const handleSaveNewContact = async () => {
    if (!onAddContact || !newContactName.trim()) return

    setIsCreatingContact(true)
    const newContact = await onAddContact({
      name: newContactName.trim(),
      phone: newContactPhone.trim() || undefined,
      email: newContactEmail.trim() || undefined,
    })
    setIsCreatingContact(false)

    if (newContact) {
      // Clear form and select the new contact
      setShowContactForm(false)
      setNewContactName('')
      setNewContactPhone('')
      setNewContactEmail('')
      setSelectedContact(newContact)
      setContactQuery('')
      inputRef.current?.focus()
    }
  }

  const handleCancelContactForm = () => {
    setShowContactForm(false)
    setNewContactName('')
    setNewContactPhone('')
    setNewContactEmail('')
    inputRef.current?.focus()
  }

  const handleRemoveContact = () => {
    setSelectedContact(null)
    inputRef.current?.focus()
  }

  const handleRemoveProject = () => {
    setSelectedProject(null)
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Handle contact dropdown
    if (showContactDropdown) {
      const totalItems = filteredContacts.length + (showCreateContactOption ? 1 : 0)
      if (totalItems === 0) return

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlightedIndex(prev => (prev + 1) % totalItems)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightedIndex(prev => (prev - 1 + totalItems) % totalItems)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (highlightedIndex < filteredContacts.length) {
          handleSelectContact(filteredContacts[highlightedIndex])
        } else if (showCreateContactOption) {
          handleCreateContact()
        }
      } else if (e.key === 'Escape') {
        setShowContactDropdown(false)
        setContactQuery('')
      }
      return
    }

    // Handle project dropdown
    if (showProjectDropdown) {
      const totalItems = filteredProjects.length + (showCreateProjectOption ? 1 : 0)
      if (totalItems === 0) return

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlightedIndex(prev => (prev + 1) % totalItems)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightedIndex(prev => (prev - 1 + totalItems) % totalItems)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (highlightedIndex < filteredProjects.length) {
          handleSelectProject(filteredProjects[highlightedIndex])
        } else if (showCreateProjectOption) {
          handleCreateProject()
        }
      } else if (e.key === 'Escape') {
        setShowProjectDropdown(false)
        setProjectQuery('')
      }
      return
    }

    // Close modal on Escape when no dropdown is open
    if (e.key === 'Escape') {
      onClose?.()
    }
  }

  const startListening = () => {
    if (!speechSupported || !SpeechRecognitionAPI) return

    const recognition = new SpeechRecognitionAPI()
    recognitionRef.current = recognition

    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = 'en-US'

    recognition.onstart = () => setIsListening(true)
    recognition.onend = () => setIsListening(false)
    recognition.onerror = () => setIsListening(false)

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript
      setTitle(prev => prev ? `${prev} ${transcript}` : transcript)
    }

    recognition.start()
  }

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
    }
  }

  // Build placeholder text based on what's selected
  const getPlaceholder = () => {
    if (mode === 'routine') return "Name this routine..."
    if (selectedContact && selectedProject) return "What needs to be done?"
    if (selectedContact) return "What needs to be done? Type # to add project"
    if (selectedProject) return "What needs to be done? Type @ to add contact"
    return "What needs to be done? @ contact, # project"
  }

  return (
    <>
      {/* Floating Action Button - only on mobile, positioned above bottom nav */}
      {showFab && (
        <button
          onClick={handleOpen}
          className="fixed bottom-20 right-4 safe-bottom w-14 h-14 bg-primary-500 text-white rounded-full shadow-lg
                     flex items-center justify-center
                     hover:bg-primary-600 active:bg-primary-700 active:scale-95
                     transition-all z-50"
          aria-label="Quick add task"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </button>
      )}

      {/* Modal Overlay */}
      {isOpen && (
        <div
          className={`fixed inset-0 z-50 bg-black/40 flex ${showFab ? 'items-end' : 'items-center justify-center'}`}
          onClick={handleClose}
        >
          {/* Modal Content */}
          <div
            className={`bg-white p-4 ${showFab ? 'w-full rounded-t-2xl safe-bottom animate-slide-up' : 'w-full max-w-lg mx-4 rounded-2xl shadow-xl'}`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Mode toggle - Task vs Routine */}
            {onAddRoutine && !showContactForm && (
              <div className="flex items-center gap-2 mb-4">
                <button
                  type="button"
                  onClick={() => setMode('task')}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                    mode === 'task'
                      ? 'bg-primary-100 text-primary-700'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                  }`}
                >
                  Task
                </button>
                <button
                  type="button"
                  onClick={() => setMode('routine')}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                    mode === 'routine'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                  }`}
                >
                  Routine
                </button>
              </div>
            )}
            {/* Desktop header with keyboard hint */}
            {!showFab && (
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-neutral-800">
                  Quick Add {mode === 'routine' ? 'Routine' : 'Task'}
                </h2>
                <kbd className="px-2 py-1 text-xs font-mono bg-neutral-100 text-neutral-500 rounded">
                  ⌘K
                </kbd>
              </div>
            )}
            {/* Contact creation form */}
            {showContactForm ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <button
                    type="button"
                    onClick={handleCancelContactForm}
                    className="p-1 rounded-md text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100"
                    aria-label="Back"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                  <h3 className="text-lg font-semibold text-neutral-800">New Contact</h3>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Name</label>
                    <input
                      type="text"
                      value={newContactName}
                      onChange={(e) => setNewContactName(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 bg-neutral-50
                                 text-neutral-800 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Phone <span className="text-neutral-400 font-normal">(optional)</span></label>
                    <input
                      ref={phoneInputRef}
                      type="tel"
                      value={newContactPhone}
                      onChange={(e) => setNewContactPhone(e.target.value)}
                      placeholder="555-123-4567"
                      className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 bg-neutral-50
                                 text-neutral-800 placeholder:text-neutral-400
                                 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Email <span className="text-neutral-400 font-normal">(optional)</span></label>
                    <input
                      type="email"
                      value={newContactEmail}
                      onChange={(e) => setNewContactEmail(e.target.value)}
                      placeholder="name@example.com"
                      className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 bg-neutral-50
                                 text-neutral-800 placeholder:text-neutral-400
                                 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleCancelContactForm}
                    className="flex-1 touch-target py-3 rounded-xl border border-neutral-200 text-neutral-600 font-medium
                               hover:bg-neutral-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveNewContact}
                    disabled={!newContactName.trim() || isCreatingContact}
                    className="flex-1 touch-target py-3 rounded-xl bg-primary-500 text-white font-medium
                               hover:bg-primary-600 active:bg-primary-700
                               disabled:opacity-50 disabled:cursor-not-allowed
                               transition-colors"
                  >
                    {isCreatingContact ? 'Creating...' : 'Create Contact'}
                  </button>
                </div>
              </div>
            ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Selected chips (task mode only) */}
              {mode === 'task' && (selectedContact || selectedProject || parsedDate) && (
                <div className="flex items-center gap-2 flex-wrap">
                  {parsedDate && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-700 rounded-full text-sm font-medium">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                      </svg>
                      {formatDatePreview(parsedDate)}
                    </span>
                  )}
                  {selectedContact && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary-50 text-primary-700 rounded-full text-sm font-medium">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                      </svg>
                      @{selectedContact.name}
                      <button
                        type="button"
                        onClick={handleRemoveContact}
                        className="ml-1 hover:text-primary-900"
                        aria-label="Remove contact"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </span>
                  )}
                  {selectedProject && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-full text-sm font-medium">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                      </svg>
                      #{selectedProject.name}
                      <button
                        type="button"
                        onClick={handleRemoveProject}
                        className="ml-1 hover:text-blue-900"
                        aria-label="Remove project"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </span>
                  )}
                </div>
              )}

              <div className="relative">
                <div className="flex items-center gap-3">
                  <input
                    ref={inputRef}
                    type="text"
                    value={title}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    placeholder={getPlaceholder()}
                    className="flex-1 px-4 py-3 rounded-xl border border-neutral-200 bg-neutral-50
                               text-neutral-800 placeholder:text-neutral-400 text-lg
                               focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                  {speechSupported && (
                    <button
                      type="button"
                      onClick={isListening ? stopListening : startListening}
                      className={`touch-target w-12 h-12 rounded-full flex items-center justify-center transition-colors
                                 ${isListening
                                   ? 'bg-red-500 text-white animate-pulse'
                                   : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}
                      aria-label={isListening ? 'Stop listening' : 'Voice input'}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                      </svg>
                    </button>
                  )}
                </div>

                {/* Contact dropdown */}
                {showContactDropdown && (
                  <div
                    ref={dropdownRef}
                    className="absolute left-0 right-0 mt-2 bg-white rounded-xl border border-neutral-200 shadow-lg overflow-hidden z-10"
                  >
                    {filteredContacts.length === 0 && !contactQuery.trim() ? (
                      <div className="px-4 py-3 text-sm text-neutral-500">
                        Type a name to search or create a contact
                      </div>
                    ) : (
                      <>
                        {filteredContacts.map((contact, index) => (
                          <button
                            key={contact.id}
                            type="button"
                            onClick={() => handleSelectContact(contact)}
                            className={`w-full px-4 py-3 text-left flex items-center gap-3 transition-colors
                                       ${index === highlightedIndex ? 'bg-primary-50' : 'hover:bg-neutral-50'}`}
                          >
                            <div className="w-8 h-8 rounded-full bg-neutral-200 flex items-center justify-center text-neutral-600">
                              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                              </svg>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-neutral-800 truncate">{contact.name}</div>
                              {contact.phone && (
                                <div className="text-sm text-neutral-500 truncate">{contact.phone}</div>
                              )}
                            </div>
                          </button>
                        ))}
                        {showCreateContactOption && onAddContact && (
                          <button
                            type="button"
                            onClick={handleCreateContact}
                            className={`w-full px-4 py-3 text-left flex items-center gap-3 ${filteredContacts.length > 0 ? 'border-t border-neutral-100' : ''} transition-colors
                                       ${highlightedIndex === filteredContacts.length ? 'bg-primary-50' : 'hover:bg-neutral-50'}`}
                          >
                            <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-600">
                              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                              </svg>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-primary-700">Create "{contactQuery}"</div>
                              <div className="text-sm text-neutral-500">Add as new contact</div>
                            </div>
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* Project dropdown */}
                {showProjectDropdown && (
                  <div
                    className="absolute left-0 right-0 mt-2 bg-white rounded-xl border border-neutral-200 shadow-lg overflow-hidden z-10"
                  >
                    {filteredProjects.length === 0 && !projectQuery.trim() ? (
                      <div className="px-4 py-3 text-sm text-neutral-500">
                        Type a name to search or create a project
                      </div>
                    ) : (
                      <>
                        {filteredProjects.map((project, index) => (
                          <button
                            key={project.id}
                            type="button"
                            onClick={() => handleSelectProject(project)}
                            className={`w-full px-4 py-3 text-left flex items-center gap-3 transition-colors
                                       ${index === highlightedIndex ? 'bg-blue-50' : 'hover:bg-neutral-50'}`}
                          >
                            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                              </svg>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-neutral-800 truncate">{project.name}</div>
                              <div className="text-sm text-neutral-500 truncate capitalize">{project.status.replace('_', ' ')}</div>
                            </div>
                          </button>
                        ))}
                        {showCreateProjectOption && onAddProject && (
                          <button
                            type="button"
                            onClick={handleCreateProject}
                            disabled={isCreatingProject}
                            className={`w-full px-4 py-3 text-left flex items-center gap-3 ${filteredProjects.length > 0 ? 'border-t border-neutral-100' : ''} transition-colors
                                       ${highlightedIndex === filteredProjects.length ? 'bg-blue-50' : 'hover:bg-neutral-50'}
                                       disabled:opacity-50`}
                          >
                            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                              </svg>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-blue-700">
                                {isCreatingProject ? 'Creating...' : `Create "${projectQuery}"`}
                              </div>
                              <div className="text-sm text-neutral-500">Add as new project</div>
                            </div>
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Routine-specific fields */}
              {mode === 'routine' && (
                <div className="space-y-3 pt-2">
                  {/* Recurrence type */}
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-2">Repeats</label>
                    <div className="flex flex-wrap gap-2">
                      {(['daily', 'weekly'] as const).map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setRoutineRecurrence(type)}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                            routineRecurrence === type
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                          }`}
                        >
                          {type.charAt(0).toUpperCase() + type.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Day selector for weekly */}
                  {routineRecurrence === 'weekly' && (
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-2">On days</label>
                      <div className="flex gap-1">
                        {[
                          { key: 'sun', label: 'S' },
                          { key: 'mon', label: 'M' },
                          { key: 'tue', label: 'T' },
                          { key: 'wed', label: 'W' },
                          { key: 'thu', label: 'T' },
                          { key: 'fri', label: 'F' },
                          { key: 'sat', label: 'S' },
                        ].map(({ key, label }) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => {
                              setRoutineDays(prev =>
                                prev.includes(key) ? prev.filter(d => d !== key) : [...prev, key]
                              )
                            }}
                            className={`w-9 h-9 rounded-full text-sm font-medium transition-colors ${
                              routineDays.includes(key)
                                ? 'bg-amber-500 text-white'
                                : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Time of day (optional) */}
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">
                      Time <span className="text-neutral-400 font-normal">(optional)</span>
                    </label>
                    <input
                      type="time"
                      value={routineTime}
                      onChange={(e) => setRoutineTime(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 bg-neutral-50
                                 text-neutral-800 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleClose}
                  className="flex-1 touch-target py-3 rounded-xl border border-neutral-200 text-neutral-600 font-medium
                             hover:bg-neutral-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!title.trim() || (mode === 'routine' && routineRecurrence === 'weekly' && routineDays.length === 0)}
                  className={`flex-1 touch-target py-3 rounded-xl text-white font-medium
                             disabled:opacity-50 disabled:cursor-not-allowed
                             transition-colors ${
                               mode === 'routine'
                                 ? 'bg-amber-500 hover:bg-amber-600 active:bg-amber-700'
                                 : 'bg-primary-500 hover:bg-primary-600 active:bg-primary-700'
                             }`}
                >
                  Save
                </button>
              </div>
            </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}
