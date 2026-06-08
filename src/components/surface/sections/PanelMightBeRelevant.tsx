import type { MightBeRelevantItem } from '../types'
import { ConceptIcon } from '@/lib/conceptIcons'
import type { ConceptName } from '@/lib/conceptIcons'

interface PanelMightBeRelevantProps {
  items: MightBeRelevantItem[]
  onOpen: (kind: MightBeRelevantItem['kind'], id: string) => void
}

const KIND_CONCEPT: Record<MightBeRelevantItem['kind'], ConceptName> = {
  task: 'list',
  contact: 'person',
  note: 'note',
  link: 'attachment',
}

export function PanelMightBeRelevant({ items, onOpen }: PanelMightBeRelevantProps) {
  if (items.length === 0) return null

  return (
    <section>
      <div className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400 mb-2">Might be relevant</div>
      {items.map((item) => (
        <button
          key={`${item.kind}-${item.id}`}
          onClick={() => onOpen(item.kind, item.id)}
          className="flex items-start gap-2 w-full text-left mb-1 py-1.5 px-2 rounded-md bg-white shadow-[inset_0_0_0_1px_#e5e7eb] hover:bg-neutral-50"
        >
          <span className="w-6 h-6 flex items-center justify-center rounded-md bg-neutral-100 text-sm">
            {item.completed ? <ConceptIcon name="done" decorative /> : <ConceptIcon name={KIND_CONCEPT[item.kind]} decorative />}
          </span>
          <span className="flex-1">
            <div className={`text-sm leading-tight ${item.completed ? 'text-neutral-400 line-through' : 'text-neutral-800'}`}>{item.title}</div>
            <div className="text-[10px] text-neutral-400 mt-0.5">{item.completed ? `done · ${item.reason}` : item.reason}</div>
          </span>
        </button>
      ))}
    </section>
  )
}
