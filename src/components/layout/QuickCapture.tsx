import { useState, useRef, useEffect, useMemo } from 'react'
import '@/types/speech.d.ts'
import type { Contact } from '@/types/contact'

interface QuickCaptureProps {
  onAdd: (title: string, contactId?: string) => void
  isOpen?: boolean
  onOpen?: () => void
  onClose?: () => void
  showFab?: boolean
  // Contact support
  contacts?: Contact[]
  onAddContact?: (contact: { name: string; phone?: string; email?: string }) => Promise<Contact | null>
}

// Get the SpeechRecognition constructor
const SpeechRecognitionAPI = typeof window !== 'undefined'
  ? (window.SpeechRecognition || window.webkitSpeechRecognition)
  : undefined

export function QuickCapture({
  onAdd,
  isOpen: controlledIsOpen,
  onOpen,
  onClose,
  showFab = true,
  contacts = [],
  onAddContact,
}: QuickCaptureProps) {
  // Support both controlled and uncontrolled modes
  const [internalIsOpen, setInternalIsOpen] = useState(false)
  const isOpen = controlledIsOpen ?? internalIsOpen

  const [title, setTitle] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const [showContactDropdown, setShowContactDropdown] = useState(false)
  const [contactQuery, setContactQuery] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  // Contact creation form state
  const [showContactForm, setShowContactForm] = useState(false)
  const [newContactName, setNewContactName] = useState('')
  const [newContactPhone, setNewContactPhone] = useState('')
  const [newContactEmail, setNewContactEmail] = useState('')
  const [isCreatingContact, setIsCreatingContact] = useState(false)
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

  // Check if we should show "Create contact" option
  const showCreateOption = contactQuery.trim().length > 0 &&
    !filteredContacts.some(c => c.name.toLowerCase() === contactQuery.toLowerCase())

  const handleOpen = () => {
    if (onOpen) {
      onOpen()
    } else {
      setInternalIsOpen(true)
    }
  }

  const handleClose = () => {
    setTitle('')
    setSelectedContact(null)
    setShowContactDropdown(false)
    setContactQuery('')
    setShowContactForm(false)
    setNewContactName('')
    setNewContactPhone('')
    setNewContactEmail('')
    if (onClose) {
      onClose()
    } else {
      setInternalIsOpen(false)
    }
  }

  useEffect(() => {
    if (isOpen && inputRef.current) {
      // Small delay to ensure modal is rendered
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  // Reset highlighted index when filtered results change
  useEffect(() => {
    setHighlightedIndex(0)
  }, [filteredContacts.length, showCreateOption])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    onAdd(trimmed, selectedContact?.id)
    setTitle('')
    setSelectedContact(null)
    handleClose()
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setTitle(value)

    // Check for @ trigger
    const lastAtIndex = value.lastIndexOf('@')
    if (lastAtIndex !== -1) {
      // Check if @ is at start or preceded by space
      const charBefore = lastAtIndex > 0 ? value[lastAtIndex - 1] : ' '
      if (charBefore === ' ' || lastAtIndex === 0) {
        const query = value.slice(lastAtIndex + 1)
        // Allow spaces in contact names - dropdown stays open until contact is selected
        setContactQuery(query)
        setShowContactDropdown(true)
        return
      }
    }
    setShowContactDropdown(false)
    setContactQuery('')
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

  const handleCreateContact = () => {
    if (!contactQuery.trim()) return
    // Show the contact creation form
    setNewContactName(contactQuery.trim())
    setShowContactForm(true)
    setShowContactDropdown(false)
    // Focus phone input after render
    setTimeout(() => phoneInputRef.current?.focus(), 50)
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showContactDropdown) return

    const totalItems = filteredContacts.length + (showCreateOption ? 1 : 0)
    if (totalItems === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex(prev => (prev + 1) % totalItems)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex(prev => (prev - 1 + totalItems) % totalItems)
    } else if (e.key === 'Enter' && showContactDropdown) {
      e.preventDefault()
      if (highlightedIndex < filteredContacts.length) {
        handleSelectContact(filteredContacts[highlightedIndex])
      } else if (showCreateOption) {
        handleCreateContact()
      }
    } else if (e.key === 'Escape') {
      setShowContactDropdown(false)
      setContactQuery('')
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

  return (
    <>
      {/* Floating Action Button - only on mobile */}
      {showFab && (
        <button
          onClick={handleOpen}
          className="fixed bottom-6 right-6 safe-bottom w-14 h-14 bg-primary-500 text-white rounded-full shadow-lg
                     flex items-center justify-center
                     hover:bg-primary-600 active:bg-primary-700 active:scale-95
                     transition-all z-40"
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
            {/* Desktop header with keyboard hint */}
            {!showFab && (
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-neutral-800">Quick Add Task</h2>
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
              {/* Selected contact chip */}
              {selectedContact && (
                <div className="flex items-center gap-2">
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
                    placeholder={selectedContact ? "What needs to be done?" : "What needs to be done? Type @ to add contact"}
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
                      // Empty state when just @ is typed with no contacts
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
                        {showCreateOption && onAddContact && (
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
              </div>

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
                  disabled={!title.trim()}
                  className="flex-1 touch-target py-3 rounded-xl bg-primary-500 text-white font-medium
                             hover:bg-primary-600 active:bg-primary-700
                             disabled:opacity-50 disabled:cursor-not-allowed
                             transition-colors"
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
