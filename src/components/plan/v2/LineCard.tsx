// A line on a season's or a year's list, in large type (Scott, 2026-10-04:
// "larger fonts … for the season and year pages"): a box to tick by hand,
// the words (open the details), the ⋯ menu, and under it what the level
// below wrote for it, by period — "OCT  Make a budget". A line with nothing
// under it hasn't been started, and stands out when the list is reviewed.
import { useState } from 'react'
import { Check } from 'lucide-react'
import type { LineActions, LineVM } from './PlanLine'
import { LineMenu } from './PlanLine'
import type { WrittenGroup } from '@/lib/week/monthLinks'
import type { FamilyMember } from '@/types/family'
import { MultiAssigneeDropdown } from '@/components/family'
import { assigneesOf } from '@/lib/planning/v2/planV2'
import { notesAsText } from '@/lib/htmlUtils'

// Notes the details editor formatted stay its to edit; a plain note is
// written right here (Scott, 2026-10-04: "freeform notes").
const isFormatted = (notes: string | undefined | null) => !!notes && /<[a-z][\s\S]*>/i.test(notes)

export function LineCard({ vm, actions, nextLabel, did = [], variant = 'card', members = [] }: {
  vm: LineVM
  /** The household: who carries the line, and assigning people. */
  members?: FamilyMember[]
  actions: LineActions
  nextLabel: string
  did?: WrittenGroup[]
  /** 'card' — the season's brainstorm board; 'row' — the year's list. */
  variant?: 'card' | 'row'
}) {
  const t = vm.task
  const done = !!t.completed
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const note = notesAsText(t.notes)
  const startNote = () => {
    if (isFormatted(t.notes)) { actions.details(t); return }
    setDraft(t.notes ?? ''); setEditing(true)
  }
  const saveNote = () => {
    setEditing(false)
    if (draft.trim() !== (t.notes ?? '').trim()) actions.setNotes?.(t, draft.trim())
  }
  return (
    <li className={`ps-line is-${variant}${done ? ' is-done' : ''}${vm.fate !== 'open' && vm.fate !== 'done' ? ' is-muted' : ''}`}>
      <div className="ps-line-main">
        <button type="button" className={`ps-tick${done ? ' is-on' : ''}`} aria-label={done ? `Mark ${t.title} not done` : `Complete ${t.title}`} onClick={() => actions.done(t)}>
          {done && <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />}
        </button>
        <button type="button" className="ps-line-title" onClick={() => actions.details(t)}>{t.title}</button>
        <span className="ps-line-tools">
          {members.length > 0 && (
            <MultiAssigneeDropdown members={members} selectedIds={assigneesOf(t)} onSelect={(ids) => actions.assign(t, ids)} size="sm" triggerLabel={`Assign people to ${t.title}`} />
          )}
          <span className="ps-line-menu"><LineMenu vm={vm} actions={actions} nextLabel={nextLabel} /></span>
        </span>
      </div>
      {editing ? (
        <textarea className="ps-note-edit" autoFocus aria-label={`Note for ${t.title}`} value={draft} rows={Math.max(2, draft.split('\n').length)}
          onChange={(e) => setDraft(e.target.value)} onBlur={saveNote}
          onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false) }} placeholder="Anything worth remembering about it…" />
      ) : note ? (
        <button type="button" className="ps-note" onClick={startNote} title={isFormatted(t.notes) ? 'Open to edit' : 'Edit the note'}>{note}</button>
      ) : actions.setNotes && (
        <button type="button" className="ps-note-add" aria-label={`Add a note to ${t.title}`} onClick={startNote}>Add a note</button>
      )}
      {vm.carriedFrom && <p className="ps-line-from">carried from {vm.carriedFrom}</p>}
      {did.length > 0 && (
        <p className="ps-did">{did.map((g) => (
          <span key={g.label} className="ps-did-group"><b>{g.label}</b>{g.items.map((d, i) => (
            <span key={d.id}>{i > 0 && ' · '}<span className={d.done ? 'is-done' : undefined}>{d.title}</span></span>
          ))}</span>
        ))}</p>
      )}
    </li>
  )
}
