// src/components/routine/board/NeedsALook.tsx
//
// "Needs a look" — the Tend findings inline beside the board, each with its
// small actions, instead of behind a drawer: look-alikes (Merge into X /
// They're different), a routine with no area, a name that trails off, and
// resting routines (no wake date: wake or open; a wake date: when).
// The drawer stays only for "See all" when the list is long.
//
// On a phone it folds to one line at the top and opens in place.

import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { Routine } from '@/types/actionable'
import { tendFindingKey, type TendFinding } from '../rhythm/tendHeuristics'
import { formatWake, wakeDate } from '@/lib/routines/explain'

const AREAS = [
  { id: 'family', label: 'Family' },
  { id: 'personal', label: 'Personal' },
  { id: 'work', label: 'Work' },
] as const

const SHOWN = 6

export interface NeedsALookProps {
  findings: TendFinding[]
  routines: Routine[]
  /** Resting routines (wake date or not). */
  resting: Routine[]
  onMerge: (survivorId: string, loserIds: string[]) => void
  onDismiss: (key: string) => void
  onStampDomain: (id: string, context: 'work' | 'family' | 'personal') => void
  onRename: (id: string, name: string) => void
  onLetGo: (id: string) => void
  onWake: (r: Routine) => void
  onOpenRoutine: (r: Routine) => void
  onSeeAll: () => void
}

function Unfinished({ id, name, onRename, onLetGo }: { id: string; name: string; onRename: NeedsALookProps['onRename']; onLetGo: NeedsALookProps['onLetGo'] }) {
  const [draft, setDraft] = useState(name)
  const [confirming, setConfirming] = useState(false)
  return (
    <>
      <p className="routine-look-text">“{name}” looks unfinished.</p>
      <div className="routine-look-actions">
        <input
          aria-label={`Rename ${name}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && draft.trim()) onRename(id, draft.trim()) }}
          className="routine-look-input"
        />
        <button type="button" className="canvas-chip" disabled={!draft.trim() || draft.trim() === name} onClick={() => onRename(id, draft.trim())}>Save</button>
        <button type="button" className="canvas-chip" onClick={() => (confirming ? onLetGo(id) : setConfirming(true))}>
          {confirming ? 'Sure? Remove' : 'Let go'}
        </button>
      </div>
    </>
  )
}

export function NeedsALook(props: NeedsALookProps) {
  const { findings, routines, resting } = props
  const [open, setOpen] = useState(false)
  const byId = new Map(routines.map((r) => [r.id, r]))

  type Row = { key: string; body: ReactNode }
  const rows: Row[] = []
  for (const f of findings) {
    const key = tendFindingKey(f)
    if (f.kind === 'lookalike') {
      const quoted = f.names.map((n) => `“${n}”`)
      const list = quoted.length === 2 ? quoted.join(' and ') : `${quoted.slice(0, -1).join(', ')} and ${quoted[quoted.length - 1]}`
      rows.push({
        key,
        body: (
          <>
            <p className="routine-look-text">{list} look like the same job.</p>
            <div className="routine-look-actions">
              <button type="button" className="canvas-chip" onClick={() => props.onMerge(f.ids[0], f.ids.slice(1))}>Merge into {f.names[0]}</button>
              <button type="button" className="canvas-chip" onClick={() => props.onDismiss(key)}>They’re different</button>
            </div>
          </>
        ),
      })
    } else if (f.kind === 'missing-domain') {
      const current = f.ids.map((id) => byId.get(id)).find((r): r is Routine => !!r && r.context == null)
      if (!current) continue
      const more = f.ids.length - 1
      rows.push({
        key,
        body: (
          <>
            <p className="routine-look-text">
              “{current.name}” has no area{more > 0 ? ` (and ${more} more)` : ''}.
            </p>
            <div className="routine-look-actions" role="group" aria-label={`Area for ${current.name}`}>
              {AREAS.map((a) => (
                <button key={a.id} type="button" className="canvas-chip" onClick={() => props.onStampDomain(current.id, a.id)}>{a.label}</button>
              ))}
            </div>
          </>
        ),
      })
    } else {
      rows.push({ key, body: <Unfinished id={f.id} name={f.name} onRename={props.onRename} onLetGo={props.onLetGo} /> })
    }
  }
  for (const r of resting) {
    const wake = wakeDate(r.paused_until)
    rows.push({
      key: `rest:${r.id}`,
      body: (
        <>
          <p className="routine-look-text">
            {wake ? <>“{r.name}” wakes {formatWake(wake)}.</> : <>“{r.name}” is resting with no wake date.</>}
          </p>
          <div className="routine-look-actions">
            <button type="button" className="canvas-chip" onClick={() => props.onWake(r)}>Wake now</button>
            <button type="button" className="canvas-chip" onClick={() => props.onOpenRoutine(r)}>{wake ? 'Open' : 'Set a wake date'}</button>
          </div>
        </>
      ),
    })
  }

  const count = rows.length
  return (
    <aside aria-label="Needs a look" className={`routine-look${open ? ' is-open' : ''}`}>
      {/* Phone: one line at the top that opens in place. Hidden on desktop. */}
      <button type="button" className="routine-look-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {open ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}
        Needs a look <span className="tabular-nums">· {count}</span>
      </button>
      <div className="routine-look-body">
        <h2 className="routine-band-label">Needs a look{count > 0 ? ` · ${count}` : ''}</h2>
        {count === 0 && <p className="routine-look-empty">Nothing needs a look.</p>}
        {count > 0 && (
          <ul className="routine-look-list">
            {rows.slice(0, SHOWN).map((row) => (
              <li key={row.key} className="routine-look-row">{row.body}</li>
            ))}
          </ul>
        )}
        {count > SHOWN && (
          <button type="button" className="canvas-link" onClick={props.onSeeAll}>See all {count}</button>
        )}
      </div>
    </aside>
  )
}
