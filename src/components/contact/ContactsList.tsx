import { useState, useMemo } from 'react'
import { PAGE_COLUMN_WIDE } from '@/components/layout/pageLayout'
import { QuietAction } from '@/components/layout/PageMasthead'
import { MastheadCard } from '@/components/layout/MastheadCard'
import { Plus } from 'lucide-react'
import type { Contact, ContactCategory } from '@/types/contact'

interface ContactsListProps {
  contacts: Contact[]
  onSelectContact: (contactId: string) => void
  /** Kept for call-site compatibility; the masthead no longer renders a back arrow. */
  onBack?: () => void
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

export function ContactsList({ contacts, onSelectContact, onAddContact }: ContactsListProps) {
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
    <div className={PAGE_COLUMN_WIDE}>
      {/* Header — shared Library masthead (design-unification 2026-09-01).
          The back arrow died with it: Contacts is a page, not a drill-in. */}
      <MastheadCard
        variant="page"
        title="Contacts"
        motif="contacts"
        subline={`${contacts.length} people and places the household calls on`}
        footer={<QuietAction icon={Plus} label="Add" ariaLabel="Add a contact" onClick={() => setAdding(true)} />}
      />

      {/* Add form */}
      {adding && (
        <div className="mb-4 flex items-center gap-2 border-b border-neutral-200 pb-3">
          <input
            autoFocus
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setAdding(false) }}
            placeholder="Contact name..."
            className="flex-1 px-3 w-full rounded-md border border-neutral-300 bg-bg-elevated py-2.5 text-[15px] text-neutral-800 placeholder:text-neutral-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
          <button onClick={handleAdd} className="btn-primary rounded-md px-3 py-1.5 text-[14px]">Save</button>
          <button onClick={() => { setAdding(false); setNewName('') }} className="text-[14px] text-neutral-500 hover:text-neutral-700">Cancel</button>
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
          className="pl-9 pr-3 w-full rounded-md border border-neutral-300 bg-bg-elevated py-2.5 text-[15px] text-neutral-800 placeholder:text-neutral-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
      </div>

      {/* Contact groups */}
      {filtered.length === 0 ? (
        <div className="py-12 text-center text-[15px] text-neutral-400">
          {search ? 'No contacts match your search' : 'No contacts yet'}
        </div>
      ) : (
        <div className="space-y-6">
          {CATEGORY_ORDER.filter(cat => grouped[cat]?.length).map(cat => (
            <div key={cat}>
              <h2 className="mb-2 px-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-neutral-400">
                {CATEGORY_LABELS[cat] || cat}
              </h2>
              <div className="border-t border-neutral-300">
                {grouped[cat].map(contact => (
                  <button
                    key={contact.id}
                    onClick={() => onSelectContact(contact.id)}
                    className="flex w-full items-center justify-between border-b border-neutral-200 px-4 py-3.5 text-left transition-colors hover:bg-neutral-50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-100 text-[15px] font-medium text-primary-700">
                        {contact.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-[16px] leading-snug text-neutral-800">{contact.name}</div>
                        {contact.phone && (
                          <div className="text-[12px] text-neutral-400">{contact.phone}</div>
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
