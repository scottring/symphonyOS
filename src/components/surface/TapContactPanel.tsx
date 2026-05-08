import type { Contact } from '@/types/contact'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { Project } from '@/types/project'
import { PanelHeader } from './sections/PanelHeader'
import { PanelMetaRow } from './sections/PanelMetaRow'
import { PanelWhy } from './sections/PanelWhy'
import { PanelLinks } from './sections/PanelLinks'
import { PanelMightBeRelevant } from './sections/PanelMightBeRelevant'
import { PanelFooter } from './sections/PanelFooter'
import { useEntityRelations } from './hooks/useEntityRelations'
import { getCategoryLabel } from '@/types/contact'
import type { MightBeRelevantItem } from './types'

interface TapContactPanelProps {
  contact: Contact
  allTasks: Task[]
  allEvents: CalendarEvent[]
  allProjects: Project[]

  onClose: () => void
  onNotesChange: (next: string) => void
  onMore: () => void
  onAddLink: (url: string) => void
  onOpenTask: (id: string) => void
  onOpenEvent: (id: string) => void
  onOpenProject: (id: string) => void
  onOpenRelated: (kind: MightBeRelevantItem['kind'], id: string) => void
}

export function TapContactPanel(props: TapContactPanelProps) {
  const { contact, allTasks, allEvents, allProjects } = props

  const relations = useEntityRelations({
    kind: 'contact',
    entity: contact,
    allTasks,
    allEvents,
    allProjects,
  })

  const hasOpenItems = relations.tasks.length > 0 || relations.events.length > 0

  const categoryLabel = getCategoryLabel(contact.category) || 'Contact'

  return (
    <article className="bg-bg-elevated rounded-2xl p-5 max-w-md w-full">
      <PanelHeader
        title={contact.name}
        onTitleChange={() => { /* contact rename — out of scope for Plan 2 */ }}
        onClose={props.onClose}
      />
      <PanelMetaRow
        bucket={categoryLabel}
      />
      <div className="flex flex-wrap gap-2 pb-4 mb-4 border-b border-neutral-200">
        {contact.phone && (
          <a
            href={`tel:${contact.phone}`}
            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-primary-600 text-white hover:bg-primary-700 transition-colors"
          >
            📞 {contact.phone}
          </a>
        )}
        {contact.email && (
          <a
            href={`mailto:${contact.email}`}
            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-colors"
          >
            ✉️ {contact.email}
          </a>
        )}
        <button
          onClick={props.onMore}
          aria-label="More actions"
          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-colors"
        >
          ···
        </button>
      </div>

      <PanelWhy
        key={contact.id}
        notes={contact.notes}
        onChange={props.onNotesChange}
        label="About"
      />

      {hasOpenItems && (
        <section className="mb-4">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400 mb-2">Open with them</div>
          {relations.tasks.map(t => (
            <button
              key={t.id}
              onClick={() => props.onOpenTask(t.id)}
              className="flex items-center gap-2 w-full text-left mb-1 py-1.5 px-2 rounded-md bg-white shadow-[inset_0_0_0_1px_#e5e7eb] hover:bg-neutral-50"
            >
              <span className="w-6 h-6 flex items-center justify-center rounded-md bg-neutral-100">📋</span>
              <span className="text-sm text-neutral-800 flex-1">{t.title}</span>
            </button>
          ))}
        </section>
      )}

      <PanelLinks links={undefined} onAddLink={props.onAddLink} />

      <PanelMightBeRelevant items={[]} onOpen={props.onOpenRelated} />

      <PanelFooter
        createdAt={contact.createdAt ?? new Date()}
        updatedAt={contact.updatedAt ?? new Date()}
      />
    </article>
  )
}
