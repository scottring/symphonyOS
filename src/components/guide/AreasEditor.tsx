// The life areas (Health, Money, Fun…), each in a space. A name and three
// space chips per row; a partner's Family areas are listed read-only. The
// count is a note ("3 to 8 is typical"), never a limit.

import { useId, useState } from 'react'
import { Trash2 } from 'lucide-react'
import type { LifeArea } from '@/hooks/useLifeAreas'
import type { TaskContext } from '@/types/task'
import './guide.css'

const SPACES: { value: TaskContext; label: string }[] = [
  { value: 'work', label: 'Work' },
  { value: 'family', label: 'Family' },
  { value: 'personal', label: 'Personal' },
]
const spaceLabel = (c: TaskContext | null) => SPACES.find(s => s.value === (c ?? 'personal'))?.label ?? 'Personal'

function SpaceChips({ label, value, onPick }: { label: string; value: TaskContext | null; onPick: (c: TaskContext) => void }) {
  const name = useId()
  // A legacy area with no space reads as Personal until the owner picks one.
  const current = value ?? 'personal'
  return (
    <div role="radiogroup" aria-label={label} className="guide-areas-chips">
      {SPACES.map(s => (
        <label key={s.value} className="guide-areas-chip" data-checked={current === s.value || undefined}>
          <input type="radio" name={name} checked={current === s.value} onChange={() => onPick(s.value)} />
          {s.label}
        </label>
      ))}
    </div>
  )
}

function AreaRow({ area, onRename, onSetContext, onRemove }: {
  area: LifeArea
  onRename: AreasEditorProps['onRename']
  onSetContext: AreasEditorProps['onSetContext']
  onRemove: AreasEditorProps['onRemove']
}) {
  const [name, setName] = useState(area.name)
  const [seen, setSeen] = useState(area.name)
  const [confirming, setConfirming] = useState(false)
  if (area.name !== seen) { setSeen(area.name); setName(area.name) }
  const commit = () => {
    const t = name.trim()
    if (!t) { setName(area.name); return }
    if (t !== area.name) onRename(area.id, t)
  }
  return (
    <li className="guide-areas-row">
      <input
        type="text"
        className="guide-areas-name"
        aria-label={`Name of ${area.name}`}
        value={name}
        onChange={e => setName(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
      />
      <SpaceChips label={`Space for ${area.name}`} value={area.context} onPick={c => onSetContext(area.id, c)} />
      {confirming ? (
        <span className="guide-areas-confirm">
          {/* Its goals and tasks are kept, filed under no area (the area link is ON DELETE SET NULL). */}
          <span className="guide-areas-ask">Remove {area.name}? Its goals stay, with no area.</span>
          <button type="button" className="guide-areas-link" onClick={() => { setConfirming(false); onRemove(area.id) }}>Remove</button>
          <button type="button" className="guide-areas-link" onClick={() => setConfirming(false)}>Keep</button>
        </span>
      ) : (
        <button type="button" className="guide-areas-icon" aria-label={`Remove ${area.name}`} onClick={() => setConfirming(true)}>
          <Trash2 size={15} aria-hidden="true" />
        </button>
      )}
    </li>
  )
}

export interface AreasEditorProps {
  areas: LifeArea[]
  onAdd: (name: string, context: TaskContext) => void | Promise<unknown>
  onRename: (id: string, name: string) => void | Promise<unknown>
  onSetContext: (id: string, context: TaskContext) => void | Promise<unknown>
  onRemove: (id: string) => void | Promise<unknown>
}

export function AreasEditor({ areas, onAdd, onRename, onSetContext, onRemove }: AreasEditorProps) {
  const [draft, setDraft] = useState('')
  const [draftSpace, setDraftSpace] = useState<TaskContext>('personal')
  const mine = areas.filter(a => a.mine)
  const theirs = areas.filter(a => !a.mine)
  const add = () => {
    const t = draft.trim()
    if (!t) return
    onAdd(t, draftSpace)
    setDraft('')
  }
  return (
    <div className="guide-areas">
      <p className="guide-areas-count">
        {areas.length} {areas.length === 1 ? 'area' : 'areas'} <span>· 3 to 8 is typical</span>
      </p>
      {mine.length > 0 && (
        <ul className="guide-areas-list" aria-label="Your areas">
          {mine.map(a => (
            <AreaRow key={a.id} area={a} onRename={onRename} onSetContext={onSetContext} onRemove={onRemove} />
          ))}
        </ul>
      )}
      {theirs.length > 0 && (
        <>
          <p className="guide-areas-sub">Shared with you</p>
          <ul className="guide-areas-list" aria-label="Shared areas">
            {theirs.map(a => (
              <li key={a.id} className="guide-areas-row guide-areas-row-readonly">
                <span className="guide-areas-readname">{a.name}</span>
                <span className="guide-areas-space">{spaceLabel(a.context)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <form className="guide-areas-add" onSubmit={e => { e.preventDefault(); add() }}>
        <input
          type="text"
          className="guide-areas-name"
          aria-label="New area"
          placeholder="Add an area"
          value={draft}
          onChange={e => setDraft(e.target.value)}
        />
        <SpaceChips label="Space for the new area" value={draftSpace} onPick={setDraftSpace} />
        <button type="submit" className="guide-areas-addbtn" disabled={!draft.trim()}>Add</button>
      </form>
    </div>
  )
}
