import type { Contact, ContactCategory } from '@/types/contact'
import type { FamilyMember } from '@/types/family'
import { ConceptIcon } from '@/lib/conceptIcons'
import { AssignPicker } from '@/components/triage/AssignPicker'

interface PanelPeopleProps {
  contact?: Contact
  assignee?: FamilyMember
  onOpenContact: (id: string) => void
  onOpenMember: (id: string) => void
  // When provided, the section shows a picker to link/change/clear the related contact.
  contacts?: Contact[]
  onContactChange?: (contactId: string | undefined) => void
  onSearchContacts?: (query: string) => Contact[]
  onAddContact?: (name: string, details?: { phone?: string; category?: ContactCategory }) => Promise<Contact | null>
}

export function PanelPeople({
  contact,
  assignee,
  onOpenContact,
  onOpenMember,
  contacts,
  onContactChange,
  onSearchContacts,
  onAddContact,
}: PanelPeopleProps) {
  const canEditContact = !!onContactChange
  if (!contact && !assignee && !canEditContact) return null

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400">People</div>
        {canEditContact && (
          <AssignPicker
            value={contact?.id}
            contacts={contacts ?? []}
            onSearchContacts={onSearchContacts}
            onChange={onContactChange}
            onAddContact={onAddContact}
          />
        )}
      </div>
      {contact && (
        <button
          onClick={() => onOpenContact(contact.id)}
          className="flex items-center gap-2 w-full text-left py-1.5 hover:bg-neutral-100/60 rounded-md px-1"
        >
          <span className="w-7 h-7 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center text-xs font-medium">
            {contact.name.split(' ').map(n => n[0]).slice(0, 2).join('')}
          </span>
          <span className="flex-1 text-sm">
            <div className="text-neutral-800">{contact.name}</div>
            {contact.phone && <div className="text-xs text-neutral-500"><ConceptIcon name="call" decorative /> {contact.phone}</div>}
          </span>
        </button>
      )}
      {!contact && canEditContact && (
        <div className="text-sm text-neutral-400 px-1 py-1.5">No related contact</div>
      )}
      {assignee && (
        <button
          onClick={() => onOpenMember(assignee.id)}
          className="flex items-center gap-2 w-full text-left py-1.5 hover:bg-neutral-100/60 rounded-md px-1"
        >
          <span className="w-7 h-7 rounded-full bg-violet-100 text-violet-800 flex items-center justify-center text-xs font-medium">
            {(assignee.name || '?').slice(0, 1)}
          </span>
          <span className="flex-1 text-sm">
            <span className="text-neutral-800">{assignee.name}</span>
            <span className="text-xs text-neutral-500"> — for whom</span>
          </span>
        </button>
      )}
    </section>
  )
}
