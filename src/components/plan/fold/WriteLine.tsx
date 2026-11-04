// The next ruled line on this period's sheet (paper-style horizons, Scott
// 2026-11-04; the prototype's `.add`): a pencil and "Write a November goal"
// in the accent colour, always there at the end of the list. It reads what
// is typed the way the old add box did (TypedAdd's reading): a date in the
// words puts it on that day, and before Return it says where it will land.
// Return writes it, in ink, with the pencil's sound. A save that fails keeps
// the words. `extra` sits quietly at the end of the line (the page's space).

import { useState, type FormEvent, type ReactNode } from 'react'
import { paperSound } from '@/lib/fold/paperSound'
import { useHorizonRead } from '@/components/canvas/strip/useHorizonRead'
import { HorizonReadout } from '@/components/canvas/strip/HorizonReadout'
import type { HorizonLanding, HorizonParse } from '@/lib/planning/horizonInput'
import './sheet.css'

export function WriteLine({ placeholder, period, periodWord, onWrite, extra }: {
  /** "Write a November goal": also the field's name. */
  placeholder: string
  /** The page's period: a date inside it lands on that day of it. */
  period: { start: Date; end: Date }
  /** "November", "Fall", "2026": where an undated line lands. */
  periodWord: string
  /** Writes the line where it lands; false keeps the words for another try. */
  onWrite: (parse: HorizonParse, landing: HorizonLanding) => Promise<boolean>
  /** At the end of the line: the page's own choice (the space it is written in). */
  extra?: ReactNode
}) {
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const read = useHorizonRead(draft, period)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!read || busy) return
    setBusy(true)
    setFailed(false)
    const ok = await onWrite(read.parse, read.landing).catch(() => false)
    setBusy(false)
    if (ok) {
      setDraft('')
      paperSound.pencil()
    } else setFailed(true)
  }

  return (
    <form className={`sheet-write${failed ? ' is-failed' : ''}`} onSubmit={submit} autoComplete="off" data-guide-anchor="write">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z" />
        <path d="m14.5 5.5 3 3" />
      </svg>
      <input aria-label={placeholder} placeholder={placeholder} value={draft} readOnly={busy}
        onChange={(e) => setDraft(e.target.value)} />
      <span className="sheet-write-enter" aria-hidden="true">Return to add</span>
      {extra && <span className="sheet-write-extra">{extra}</span>}
      {read && <div className="sheet-write-read"><HorizonReadout read={read} periodWord={periodWord} /></div>}
      {failed && <p className="sheet-write-error" role="alert">Didn’t save. Your wording is still here; try again.</p>}
    </form>
  )
}
