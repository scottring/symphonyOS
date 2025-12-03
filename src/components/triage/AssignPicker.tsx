import { useState, useRef, useEffect } from 'react'
import type { Contact } from '@/types/contact'

interface AssignPickerProps {
  value?: string // contact id
  contacts: Contact[]
  onSearchContacts?: (query: string) => Contact[]
  onChange: (contactId: string | undefined) => void
}

export function AssignPicker({ value, contacts, onSearchContacts, onChange }: AssignPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setSearchQuery('')
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  const handleSelect = (contactId: string | undefined) => {
    onChange(contactId)
    setIsOpen(false)
    setSearchQuery('')
  }

  const filteredContacts = onSearchContacts && searchQuery
    ? onSearchContacts(searchQuery)
    : contacts.slice(0, 5)

  const assignedContact = contacts.find(c => c.id === value)
  const hasValue = value !== undefined

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
        <div className="absolute right-0 top-full mt-1 z-50 bg-white rounded-xl border border-neutral-200 shadow-lg p-2 min-w-[180px]">
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search contacts..."
            className="w-full px-2 py-1.5 text-sm rounded-lg border border-neutral-200 mb-2
                       focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <div className="max-h-40 overflow-auto space-y-1">
            {filteredContacts.length > 0 ? (
              filteredContacts.map((contact) => (
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
              ))
            ) : (
              <div className="px-3 py-2 text-sm text-neutral-400 text-center">
                No contacts found
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
