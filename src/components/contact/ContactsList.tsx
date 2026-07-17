import { useState, useMemo } from 'react'
import { PAGE_COLUMN } from '@/components/layout/pageLayout'
import type { Contact, ContactCategory } from '@/types/contact'

interface ContactsListProps {
  contacts: Contact[]
  onSelectContact: (contactId: string) => void
  onBack: () => void
  onAddContact: (data: { name: string; category?: ContactCategory }) => Promise<Contact | null>
  onDeleteContact: (id: string) => Promise<void>
}

const CATEGORY_LABELS: Record<string, string> = {
  family: 'Family',
  friend: 'Friends',
  service_provider: 'Service Providers',
  professional: 'Professional',
  school: 'School',
  medical: 'Medical',
  other: 'Other',
}

const CATEGORY_ORDER = ['family', 'friend', 'professional', 'school', 'medical', 'service_provider', 'other']

export function ContactsList({ contacts, onSelectContact, onBack, onAddContact }: ContactsListProps) {
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')

  const filtered = useMemo(() => {
    if (!search.trim()) return contacts
    const q = search.toLowerCase()
    return contacts.filter(c => c.name.toLowerCase().includes(q))
  }, [contacts, search])

  const grouped = useMemo(() => {
    const groups: Record<string, Contact[]> = {}
    for (const c of filtered) {
      const cat = c.category || 'other'
      if (!groups[cat]) groups[cat] = []
      groups[cat].push(c)
    }
    // Sort contacts within each group
    for (const cat of Object.keys(groups)) {
      groups[cat].sort((a, b) => a.name.localeCompare(b.name))
    }
    return groups
  }, [filtered])

  const handleAdd = async () => {
    if (!newName.trim()) return
    const result = await onAddContact({ name: newName.trim() })
    if (result) {
      setNewName('')
      setAdding(false)
    }
  }

  return (
    <div className={PAGE_COLUMN}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-500 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>
          </button>
          <h1 className="text-2xl font-display font-bold text-neutral-900">Contacts</h1>
          <span className="text-sm text-neutral-400 font-medium">{contacts.length}</span>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="btn-primary px-3 py-1.5 text-sm rounded-lg"
        >
          + Add
        </button>
      </div>

      {/* Add form */}
      {adding && (
        <div className="card p-3 mb-4 flex items-center gap-2">
          <input
            autoFocus
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setAdding(false) }}
            placeholder="Contact name..."
            className="input-base flex-1 text-sm"
          />
          <button onClick={handleAdd} className="btn-primary px-3 py-1.5 text-sm rounded-lg">Save</button>
          <button onClick={() => { setAdding(false); setNewName('') }} className="text-sm text-neutral-400 hover:text-neutral-600">Cancel</button>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-5">
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
        </svg>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search contacts..."
          className="input-base pl-9 w-full text-sm"
        />
      </div>

      {/* Contact groups */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-neutral-400">
          {search ? 'No contacts match your search' : 'No contacts yet'}
        </div>
      ) : (
        <div className="space-y-6">
          {CATEGORY_ORDER.filter(cat => grouped[cat]?.length).map(cat => (
            <div key={cat}>
              <h2 className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-2 px-1">
                {CATEGORY_LABELS[cat] || cat}
              </h2>
              <div className="space-y-1">
                {grouped[cat].map(contact => (
                  <button
                    key={contact.id}
                    onClick={() => onSelectContact(contact.id)}
                    className="w-full card px-4 py-3 flex items-center justify-between hover:bg-neutral-50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-sm font-medium">
                        {contact.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-neutral-800">{contact.name}</div>
                        {contact.phone && (
                          <div className="text-xs text-neutral-400">{contact.phone}</div>
                        )}
                      </div>
                    </div>
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-neutral-300" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                    </svg>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
