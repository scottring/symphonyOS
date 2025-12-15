import { useState, useRef, useEffect, useMemo } from 'react'
import type { Contact, ContactCategory } from '@/types/contact'
import { getCategoryIcon, getCategoryLabel } from '@/types/contact'

interface ContactsListProps {
  contacts: Contact[]
  onSelectContact: (contactId: string) => void
  onAddContact?: (contact: { name: string; phone?: string; email?: string }) => Promise<Contact | null>
}

type GroupBy = 'none' | 'category'

export function ContactsList({ contacts, onSelectContact, onAddContact }: ContactsListProps) {
  const [isCreating, setIsCreating] = useState(false)
  const [newContactName, setNewContactName] = useState('')
  const [newContactPhone, setNewContactPhone] = useState('')
  const [newContactEmail, setNewContactEmail] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [groupBy, setGroupBy] = useState<GroupBy>(() => {
    return (localStorage.getItem('contacts-group-by') as GroupBy) || 'category'
  })
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isCreating) {
      inputRef.current?.focus()
    }
  }, [isCreating])

  useEffect(() => {
    localStorage.setItem('contacts-group-by', groupBy)
  }, [groupBy])

  const handleCreateContact = async () => {
    if (!onAddContact || !newContactName.trim()) return

    setIsSaving(true)
    const result = await onAddContact({
      name: newContactName.trim(),
      phone: newContactPhone.trim() || undefined,
      email: newContactEmail.trim() || undefined,
    })
    setIsSaving(false)

    if (result) {
      setIsCreating(false)
      setNewContactName('')
      setNewContactPhone('')
      setNewContactEmail('')
    }
  }

  const handleCancel = () => {
    setIsCreating(false)
    setNewContactName('')
    setNewContactPhone('')
    setNewContactEmail('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleCreateContact()
    } else if (e.key === 'Escape') {
      handleCancel()
    }
  }

  // Filter contacts by search query
  const filteredContacts = useMemo(() => {
    if (!searchQuery.trim()) return contacts
    const query = searchQuery.toLowerCase()
    return contacts.filter((c) =>
      c.name.toLowerCase().includes(query) ||
      c.phone?.toLowerCase().includes(query) ||
      c.email?.toLowerCase().includes(query)
    )
  }, [contacts, searchQuery])

  // Sort contacts alphabetically
  const sortedContacts = useMemo(() => {
    return [...filteredContacts].sort((a, b) => a.name.localeCompare(b.name))
  }, [filteredContacts])

  // Group contacts by category
  const groupedContacts = useMemo(() => {
    if (groupBy === 'none') return null

    const groups: Record<string, Contact[]> = {}
    const categoryOrder: ContactCategory[] = ['family', 'friend', 'professional', 'service_provider', 'school', 'medical', 'other']

    for (const contact of sortedContacts) {
      const key = contact.category || 'other'
      if (!groups[key]) groups[key] = []
      groups[key].push(contact)
    }

    // Return sorted by category order
    return categoryOrder
      .filter((cat) => groups[cat]?.length > 0)
      .map((cat) => ({ category: cat, contacts: groups[cat] }))
  }, [sortedContacts, groupBy])

  const renderContactCard = (contact: Contact) => (
    <button
      key={contact.id}
      onClick={() => onSelectContact(contact.id)}
      className="group w-full flex items-center gap-4 p-4 rounded-2xl bg-white/60 backdrop-blur-sm
                 hover:bg-white hover:shadow-md transition-all duration-200 ease-out text-left"
    >
      {/* Category Icon */}
      <div className="w-11 h-11 rounded-xl bg-neutral-100 flex items-center justify-center text-lg flex-shrink-0
                      group-hover:bg-neutral-200 transition-colors duration-200">
        {getCategoryIcon(contact.category)}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="font-medium text-neutral-800 truncate group-hover:text-neutral-900 transition-colors duration-200">
          {contact.name}
        </div>
        <div className="flex items-center gap-3 mt-1 text-sm text-neutral-500">
          {contact.phone && (
            <span className="flex items-center gap-1 truncate">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
              </svg>
              {contact.phone}
            </span>
          )}
          {contact.email && (
            <span className="flex items-center gap-1 truncate">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
              </svg>
              {contact.email}
            </span>
          )}
          {!contact.phone && !contact.email && (
            <span className="text-neutral-400 italic">No contact info</span>
          )}
        </div>
      </div>

      {/* Arrow */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="w-5 h-5 text-neutral-300 shrink-0 transition-all duration-200 group-hover:text-neutral-500 group-hover:translate-x-0.5"
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
      </svg>
    </button>
  )

  return (
    <div className="h-full overflow-auto bg-bg-base">
      <div className="px-6 py-8 md:px-10 md:py-10 max-w-3xl mx-auto">
        {/* Header */}
        <header className="mb-8 animate-fade-in-up">
          <div className="flex items-end justify-between mb-2">
            <h1 className="font-display text-4xl md:text-5xl text-neutral-900 tracking-tight leading-none">
              Contacts
            </h1>
            {onAddContact && !isCreating && (
              <button
                onClick={() => setIsCreating(true)}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-primary-500
                           hover:bg-primary-600 rounded-xl transition-all duration-200 shadow-sm hover:shadow-md"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
                New Contact
              </button>
            )}
          </div>
          <p className="text-neutral-500 mt-2">
            <span className="font-semibold text-neutral-700">{contacts.length}</span> contact{contacts.length !== 1 ? 's' : ''}
          </p>
        </header>

        {/* Search and controls */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          {/* Search */}
          <div className="relative flex-1">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search contacts..."
              className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-neutral-200 bg-white
                         text-neutral-800 placeholder:text-neutral-400
                         focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 transition-all"
            />
          </div>

          {/* Group by toggle */}
          <div className="flex items-center gap-2 bg-white rounded-xl border border-neutral-200 p-1">
            <button
              onClick={() => setGroupBy('none')}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                groupBy === 'none'
                  ? 'bg-neutral-100 text-neutral-800'
                  : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setGroupBy('category')}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                groupBy === 'category'
                  ? 'bg-neutral-100 text-neutral-800'
                  : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              By Category
            </button>
          </div>
        </div>

        {/* Inline creation form */}
        {isCreating && (
          <div className="mb-8 p-6 rounded-2xl bg-white/90 backdrop-blur-sm border border-primary-200/40 shadow-lg animate-fade-in-scale">
            <div className="space-y-4">
              <input
                ref={inputRef}
                type="text"
                value={newContactName}
                onChange={(e) => setNewContactName(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Contact name *"
                className="w-full px-4 py-3 rounded-xl border border-neutral-200 bg-white
                           text-neutral-800 placeholder:text-neutral-400 text-xl font-display
                           focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 transition-all duration-200"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <input
                  type="tel"
                  value={newContactPhone}
                  onChange={(e) => setNewContactPhone(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Phone (optional)"
                  className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 bg-white
                             text-neutral-800 placeholder:text-neutral-400
                             focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 transition-all duration-200"
                />
                <input
                  type="email"
                  value={newContactEmail}
                  onChange={(e) => setNewContactEmail(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Email (optional)"
                  className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 bg-white
                             text-neutral-800 placeholder:text-neutral-400
                             focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 transition-all duration-200"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <button
                type="button"
                onClick={handleCancel}
                className="px-5 py-2.5 text-sm font-semibold text-neutral-600 bg-neutral-100
                           hover:bg-neutral-200 rounded-xl transition-all duration-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateContact}
                disabled={!newContactName.trim() || isSaving}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-primary-500
                           hover:bg-primary-600 rounded-xl transition-all duration-200
                           disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow-md"
              >
                {isSaving ? 'Creating...' : 'Create Contact'}
              </button>
            </div>
          </div>
        )}

        {/* Contacts list */}
        {sortedContacts.length === 0 ? (
          <div className="text-center py-16 animate-fade-in-up">
            <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-primary-50 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-primary-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            {searchQuery ? (
              <>
                <p className="font-display text-xl text-neutral-700 mb-2">No contacts found</p>
                <p className="text-neutral-500">Try a different search term</p>
              </>
            ) : (
              <>
                <p className="font-display text-xl text-neutral-700 mb-2">No contacts yet</p>
                <p className="text-neutral-500">Add contacts to send messages and assign tasks</p>
              </>
            )}
          </div>
        ) : groupBy === 'none' || !groupedContacts ? (
          <div className="space-y-2 stagger-in">
            {sortedContacts.map(renderContactCard)}
          </div>
        ) : (
          <div className="space-y-8">
            {groupedContacts.map(({ category, contacts: categoryContacts }) => (
              <div key={category}>
                <div className="flex items-center gap-2 mb-3 px-1">
                  <span className="text-lg">{getCategoryIcon(category)}</span>
                  <h2 className="font-semibold text-neutral-700">{getCategoryLabel(category)}</h2>
                  <span className="text-sm text-neutral-400">({categoryContacts.length})</span>
                </div>
                <div className="space-y-2 stagger-in">
                  {categoryContacts.map(renderContactCard)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
