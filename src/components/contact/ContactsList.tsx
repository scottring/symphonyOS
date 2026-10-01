import { useState, useMemo } from 'react'
import { PAGE_COLUMN } from '@/components/layout/pageLayout'
import { GroupLabel } from '@/components/layout/SectionHeading'
import { EmptyState } from '@/components/layout/EmptyState'
import { PageSearch } from '@/components/layout/PageSearch'
import { LIST_ROW, LIST_ROW_LANE, LIST_ROW_BODY, LIST_ROW_TITLE, LIST_ROW_META, LIST_ROW_TRAIL } from '@/components/layout/listRow'
import { QuietAction } from '@/components/layout/PageMasthead'
import { MastheadCard } from '@/components/layout/MastheadCard'
import { Plus, ChevronRight } from 'lucide-react'
import type { Contact, ContactCategory } from '@/types/contact'

interface ContactsListProps {
  contacts: Contact[]
  onSelectContact: (contactId: string) => void
  /** Kept for call-site compatibility; the masthead no longer renders a back arrow. */
  onBack?: () => void
  onAddContact: (data: { name: string; category?: ContactCategory }) => Promise<Contact | null>
  onDeleteContact: (id: string) => Promise<void | boolean>
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
    <div className={PAGE_COLUMN}>
      {/* Header — shared Library masthead (design-unification 2026-09-01).
          The back arrow died with it: Contacts is a page, not a drill-in. */}
      <MastheadCard
        variant="page"
        title="Contacts"
        motif="contacts"
        subline={`${contacts.length} people and places the household calls on`}
        footer={
          <>
            <QuietAction icon={Plus} label="Add" ariaLabel="Add a contact" onClick={() => setAdding(true)} />
            {/* The page's search sits with its action in the masthead's tools
                row — the same compact field Notes and the recipe shelf use. */}
            <PageSearch value={search} onChange={setSearch} placeholder="Search contacts…" ariaLabel="Search contacts" />
          </>
        }
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

      {/* Contact groups — groups within one list; the avatar stands in the
          margin lane (layout system). */}
      {filtered.length === 0 ? (
        search ? (
          <EmptyState title="No contacts match your search">
            Try part of a name, or clear the search to see everyone.
          </EmptyState>
        ) : (
          <EmptyState title="No contacts yet">
            The people and places the household calls on — a dentist, a coach, the plumber.
          </EmptyState>
        )
      ) : (
        <div>
          {CATEGORY_ORDER.filter(cat => grouped[cat]?.length).map(cat => (
            <section key={cat} className="mb-6">
              <GroupLabel>{CATEGORY_LABELS[cat] || cat}</GroupLabel>
              {grouped[cat].map(contact => (
                <button
                  key={contact.id}
                  type="button"
                  onClick={() => onSelectContact(contact.id)}
                  className={`${LIST_ROW}`}
                >
                  <span className={LIST_ROW_LANE}>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-100 text-[15px] font-medium text-primary-700">
                      {contact.name.charAt(0).toUpperCase()}
                    </span>
                  </span>
                  <span className={LIST_ROW_BODY}>
                    <span className={LIST_ROW_TITLE}>{contact.name}</span>
                    {contact.phone && <span className={LIST_ROW_META}>{contact.phone}</span>}
                  </span>
                  <span className={LIST_ROW_TRAIL}>
                    <ChevronRight className="h-4 w-4 text-neutral-300" aria-hidden="true" />
                  </span>
                </button>
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
