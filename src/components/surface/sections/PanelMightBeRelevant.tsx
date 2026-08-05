import type { MightBeRelevantItem } from '../types'
import { ConceptIcon } from '@/lib/conceptIcons'
import type { ConceptName } from '@/lib/conceptIcons'
import { PanelSection } from './PanelSection'
import { PanelRow } from './PanelRow'

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
    <PanelSection id="might-be-relevant" label="Might be relevant" preview={`${items.length} suggestion${items.length === 1 ? '' : 's'}`}>
      {items.map((item) => (
        <PanelRow
          key={`${item.kind}-${item.id}`}
          onClick={() => onOpen(item.kind, item.id)}
          icon={
            <span className="w-6 h-6 flex items-center justify-center rounded-md bg-neutral-100 text-sm">
              {item.completed ? <ConceptIcon name="done" decorative /> : <ConceptIcon name={KIND_CONCEPT[item.kind]} decorative />}
            </span>
          }
        >
          <div className={`text-sm leading-tight ${item.completed ? 'text-neutral-400 line-through' : 'text-neutral-800'}`}>{item.title}</div>
          <div className="text-[10px] text-neutral-400 mt-0.5">{item.completed ? `done · ${item.reason}` : item.reason}</div>
        </PanelRow>
      ))}
    </PanelSection>
  )
}
