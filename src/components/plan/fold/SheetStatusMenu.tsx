// The top of a week sheet row's one menu (Scott, 2026-11-09): where the task
// stands, above who is on it. The row itself gains no control for this.
import { useState } from 'react'
import type { SheetStatus, SheetStatusChange } from '@/lib/planning/sheetStatus'

/** The household's names, then anyone else typed in. */
function WhoPicker({ people, picked, inputLabel, onPick }: {
  people: readonly string[]; picked?: string | null; inputLabel: string; onPick: (name: string) => void
}) {
  const [text, setText] = useState('')
  return (
    <div className="sheet-status-who">
      {people.map((name) => (
        <button key={name} type="button" className="sheet-status-person" aria-pressed={picked === name} onClick={() => onPick(name)}>{name}</button>
      ))}
      <input className="sheet-status-input" aria-label={inputLabel} placeholder="Someone else…" value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' || !text.trim()) return
          e.preventDefault(); onPick(text); setText('')
        }} />
    </div>
  )
}

export function SheetStatusMenu({ status, waitingFor, owedTo, onOwed, people, onChange, steps, onAddStep, onDoneStep }: {
  status?: SheetStatus
  waitingFor?: string
  /** Someone outside waits on us for it (the wall's "Waiting on us"). */
  owedTo?: string | null
  /** Undefined: the menu offers no Owed to. */
  onOwed?: (who: string | null) => void
  /** The household's first names, offered first for a wait. */
  people: readonly string[]
  onChange: (change: SheetStatusChange) => void
  /** A task in progress: its open steps, the next first. Undefined: no steps here. */
  steps?: readonly { id: string; title: string }[]
  onAddStep?: (title: string) => void
  onDoneStep?: (id: string) => void
}) {
  const [asking, setAsking] = useState(false)
  const [askingOwed, setAskingOwed] = useState(false)
  const [stepText, setStepText] = useState('')
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
        {onOwed && (
          <button type="button" role="menuitemcheckbox" aria-checked={!!owedTo} className="sheet-status-toggle"
            onClick={() => { if (owedTo) { setAskingOwed(false); onOwed(null) } else setAskingOwed(!askingOwed) }}>Owed to…</button>
        )}
      </div>
      {(asking || waiting) && (
        <WhoPicker people={people} picked={waitingFor} inputLabel="Waiting on someone else"
          onPick={(name) => { setAsking(false); onChange({ to: 'waiting', on: name }) }} />
      )}
      {onOwed && (askingOwed || !!owedTo) && (
        <WhoPicker people={people} picked={owedTo} inputLabel="Owed to someone else"
          onPick={(name) => { setAskingOwed(false); onOwed(name) }} />
      )}
      {steps && (
        <div className="sheet-steps">
          {steps.length > 0 && (
            <ul className="sheet-steps-list" aria-label="Steps">
              {steps.map((step) => (
                <li key={step.id}>
                  <button type="button" className="sheet-step-check" aria-label={`Mark ${step.title} done`} onClick={() => onDoneStep?.(step.id)} />
                  <span>{step.title}</span>
                </li>
              ))}
            </ul>
          )}
          <input className="sheet-status-input" aria-label="Add a step" placeholder="Add a step…" value={stepText}
            onChange={(e) => setStepText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || !stepText.trim()) return
              e.preventDefault(); onAddStep?.(stepText); setStepText('')
            }} />
        </div>
      )}
    </div>
  )
}
