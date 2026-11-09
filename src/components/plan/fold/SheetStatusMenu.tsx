// The top of a week sheet row's one menu (Scott, 2026-11-09): where the task
// stands, above who is on it. The row itself gains no control for this.
import { useState } from 'react'
import type { SheetStatus, SheetStatusChange } from '@/lib/planning/sheetStatus'

export function SheetStatusMenu({ status, waitingFor, people, onChange }: {
  status?: SheetStatus
  waitingFor?: string
  /** The household's first names, offered first for a wait. */
  people: readonly string[]
  onChange: (change: SheetStatusChange) => void
}) {
  const [asking, setAsking] = useState(false)
  const [text, setText] = useState('')
  const waiting = status === 'waiting'
  const toggleWaiting = () => {
    if (waiting) { setAsking(false); onChange({ to: 'none' }) } else setAsking(!asking)
  }
  return (
    <div className="sheet-status">
      <div className="sheet-status-toggles">
        <button type="button" role="menuitemcheckbox" aria-checked={status === 'started'} className="sheet-status-toggle"
          onClick={() => { setAsking(false); onChange({ to: status === 'started' ? 'none' : 'started' }) }}>In progress</button>
        <button type="button" role="menuitemcheckbox" aria-checked={waiting} className="sheet-status-toggle" onClick={toggleWaiting}>Waiting on…</button>
      </div>
      {(asking || waiting) && (
        <div className="sheet-status-who">
          {people.map((name) => (
            <button key={name} type="button" className="sheet-status-person" aria-pressed={waitingFor === name}
              onClick={() => { setAsking(false); onChange({ to: 'waiting', on: name }) }}>{name}</button>
          ))}
          <input className="sheet-status-input" aria-label="Waiting on someone else" placeholder="Someone else…" value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || !text.trim()) return
              e.preventDefault(); setAsking(false); onChange({ to: 'waiting', on: text }); setText('')
            }} />
        </div>
      )}
    </div>
  )
}
