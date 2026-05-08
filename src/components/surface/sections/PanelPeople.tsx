import type { Contact } from '@/types/contact'
import type { FamilyMember } from '@/types/family'

interface PanelPeopleProps {
  contact?: Contact
  assignee?: FamilyMember
  onOpenContact: (id: string) => void
  onOpenMember: (id: string) => void
}

export function PanelPeople({ contact, assignee, onOpenContact, onOpenMember }: PanelPeopleProps) {
  if (!contact && !assignee) return null

  return (
    <section className="mb-4">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400 mb-2">People</div>
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
            {contact.phone && <div className="text-xs text-neutral-500">📞 {contact.phone}</div>}
          </span>
        </button>
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
