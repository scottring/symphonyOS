import { useState, useRef, useEffect } from 'react'
import type { Contact, ContactCategory } from '@/types/contact'
import { useGooglePlaces } from '@/hooks/useGooglePlaces'

interface AssignPickerProps {
  value?: string // contact id
  contacts: Contact[]
  onSearchContacts?: (query: string) => Contact[]
  onChange: (contactId: string | undefined) => void
  onAddContact?: (name: string, details?: { phone?: string; category?: ContactCategory; placeId?: string }) => Promise<Contact | null>
}

export function AssignPicker({ value, contacts, onSearchContacts, onChange, onAddContact }: AssignPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const { results: placeResults, loading: placesLoading, searchPlaces, getPlaceDetails, clearResults } = useGooglePlaces()

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setSearchQuery('')
        clearResults()
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen, clearResults])

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  // Search Google Places when query changes
  useEffect(() => {
    if (searchQuery.trim()) {
      searchPlaces(searchQuery.trim())
    } else {
      clearResults()
    }
  }, [searchQuery, searchPlaces, clearResults])

  const handleSelect = (contactId: string | undefined) => {
    onChange(contactId)
    setIsOpen(false)
    setSearchQuery('')
    clearResults()
  }

  const handleAddContact = async () => {
    if (!onAddContact || !searchQuery.trim() || isAdding) return

    setIsAdding(true)
    const newContact = await onAddContact(searchQuery.trim())
    setIsAdding(false)

    if (newContact) {
      onChange(newContact.id)
      setIsOpen(false)
      setSearchQuery('')
      clearResults()
    }
  }

  const handleSelectPlace = async (placeId: string) => {
    if (isAdding) return

    // If we've already saved this exact place as a contact, just reuse it —
    // no second fetch, no duplicate.
    const existing = contacts.find((c) => c.placeId === placeId)
    if (existing) {
      onChange(existing.id)
      setIsOpen(false)
      setSearchQuery('')
      clearResults()
      return
    }

    if (!onAddContact) return

    setIsAdding(true)
    const details = await getPlaceDetails(placeId)

    if (details) {
      const newContact = await onAddContact(details.name, {
        phone: details.phone,
        category: 'service_provider',
        placeId,
      })

      if (newContact) {
        onChange(newContact.id)
        setIsOpen(false)
        setSearchQuery('')
        clearResults()
      }
    }
    setIsAdding(false)
  }

  const filteredContacts = onSearchContacts && searchQuery
    ? onSearchContacts(searchQuery)
    : contacts.slice(0, 5)

  const hasValue = value !== undefined
  const showPlaces = searchQuery.trim().length >= 3

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`p-1.5 rounded-lg transition-colors ${
          hasValue
            ? 'text-primary-600 bg-primary-50 hover:bg-primary-100'
            : 'text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100'
        }`}
        aria-label="Assign to"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-white rounded-xl border border-neutral-200 shadow-lg p-2 w-72 max-w-[calc(100vw-1.5rem)]">
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search contacts or businesses..."
            className="w-full px-2 py-1.5 text-sm rounded-lg border border-neutral-200 mb-2
                       focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <div className="max-h-56 overflow-auto space-y-1">
            {/* Existing contacts */}
            {filteredContacts.length > 0 && (
              <>
                {filteredContacts.map((contact) => (
                  <button
                    key={contact.id}
                    onClick={() => handleSelect(contact.id)}
                    className={`w-full px-3 py-1.5 text-sm text-left rounded-lg flex items-center gap-2 ${
                      value === contact.id
                        ? 'bg-primary-50 text-primary-700'
                        : 'hover:bg-neutral-50 text-neutral-700'
                    }`}
                  >
                    <div className="w-5 h-5 rounded-full bg-neutral-200 flex items-center justify-center text-neutral-500 text-xs">
                      {contact.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="truncate">{contact.name}</span>
                  </button>
                ))}
              </>
            )}

            {/* Google Places results */}
            {showPlaces && (placeResults.length > 0 || placesLoading) && (
              <>
                <div className="border-t border-neutral-100 my-1" />
                <div className="px-3 py-1 text-xs font-medium text-neutral-400 uppercase tracking-wide">
                  Businesses
                </div>
                {placesLoading && placeResults.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-neutral-400 text-center">
                    Searching...
                  </div>
                ) : (
                  placeResults.map((place) => (
                    <button
                      key={place.placeId}
                      onClick={() => handleSelectPlace(place.placeId)}
                      disabled={isAdding}
                      className="w-full px-3 py-1.5 text-sm text-left rounded-lg hover:bg-neutral-50 text-neutral-700 flex items-center gap-2"
                    >
                      <div className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 text-xs shrink-0">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <div className="truncate font-medium">{place.name}</div>
                        {place.address && (
                          <div className="truncate text-xs text-neutral-400">{place.address}</div>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </>
            )}

            {/* Add new contact option */}
            {filteredContacts.length === 0 && placeResults.length === 0 && !placesLoading && searchQuery.trim() && onAddContact && (
              <button
                onClick={handleAddContact}
                disabled={isAdding}
                className="w-full px-3 py-2 text-sm text-left rounded-lg hover:bg-primary-50 text-primary-600 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                {isAdding ? 'Adding...' : `Add "${searchQuery.trim()}"`}
              </button>
            )}

            {/* Also show add option when there are only place results but no contacts */}
            {filteredContacts.length === 0 && placeResults.length > 0 && onAddContact && (
              <>
                <div className="border-t border-neutral-100 my-1" />
                <button
                  onClick={handleAddContact}
                  disabled={isAdding}
                  className="w-full px-3 py-2 text-sm text-left rounded-lg hover:bg-primary-50 text-primary-600 flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  {isAdding ? 'Adding...' : `Add "${searchQuery.trim()}" as contact`}
                </button>
              </>
            )}

            {/* Empty state */}
            {filteredContacts.length === 0 && placeResults.length === 0 && !placesLoading && !searchQuery.trim() && (
              <div className="px-3 py-2 text-sm text-neutral-400 text-center">
                No contacts yet
              </div>
            )}
          </div>
          {hasValue && (
            <>
              <div className="border-t border-neutral-100 my-1" />
              <button
                onClick={() => handleSelect(undefined)}
                className="w-full px-3 py-1.5 text-sm text-left rounded-lg hover:bg-red-50 text-red-600"
              >
                Clear
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
