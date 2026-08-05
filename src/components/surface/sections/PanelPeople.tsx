import type { Contact, ContactCategory } from '@/types/contact'
import { ConceptIcon } from '@/lib/conceptIcons'
import { AssignPicker } from '@/components/triage/AssignPicker'
import { PanelSection } from './PanelSection'

/**
 * Who the task is ABOUT — its related contact.
 *
 * Deliberately NOT who it's assigned to. This section used to also list the
 * assignee, labelled "— for whom", which was wrong twice over: the assignee is
 * who DOES it (`contactId` is the "about" link), and the panel already shows
 * assignees as chips at the top, from the current multi-assignee field. So the
 * row duplicated those chips while contradicting the data model, and sat under
 * a "No related contact" line saying the section was empty.
 */
interface PanelPeopleProps {
  contact?: Contact
  onOpenContact: (id: string) => void
  // When provided, the section shows a picker to link/change/clear the related contact.
  contacts?: Contact[]
  onContactChange?: (contactId: string | undefined) => void
  onSearchContacts?: (query: string) => Contact[]
  onAddContact?: (name: string, details?: { phone?: string; category?: ContactCategory; placeId?: string }) => Promise<Contact | null>
}

export function PanelPeople({
  contact,
  onOpenContact,
  contacts,
  onContactChange,
  onSearchContacts,
  onAddContact,
}: PanelPeopleProps) {
  const canEditContact = !!onContactChange
  // Nothing to show and no way to add: render nothing. When the panel reveals
  // this section from the Add row there IS a picker, so it stays — minus the
  // old "No related contact" line, which announced its own emptiness.
  if (!contact && !canEditContact) return null

  return (
    <PanelSection
      id="people"
      label="People"
      preview={contact?.name}
      actions={<>
        {canEditContact && (
          <AssignPicker
            value={contact?.id}
            contacts={contacts ?? []}
            onSearchContacts={onSearchContacts}
            onChange={onContactChange}
            onAddContact={onAddContact}
          />
        )}
      </>}
    >
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
    </PanelSection>
  )
}
