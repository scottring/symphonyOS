// Stickies on the kitchen wall's Home (Scott, 2026-10-18: "add stickies
// straight to the home page of kiosk"). The house's notes — the scratchpad's
// notes, the same ones More → Notes and "leave a note that …" write — pinned
// in the top band between the date and the weather on every Home moment, as
// many as fit on one line; a tap opens Notes. The dock's Sticky button opens
// a sticky to write on: the words, who it's from, Stick it up.
//
// Presentation only: the Shell saves (scratchpad.add) and refetches.

import { useEffect, useRef, useState } from 'react'
import type { FamilyMember } from '@/types/family'
import { Face } from './KioskHomeV1'

export interface StickyNote { id: string; text: string; by: string | null }

/** The band's stickies; the ones that don't fit on its line stay hidden. */
export function StickyStrip({ notes, onOpen }: { notes: StickyNote[]; onOpen: () => void }) {
  if (!notes.length) return null
  return (
    <ul className="kw-stickies" aria-label="Notes for the house">
      {notes.slice(0, 4).map((n, i) => (
        <li key={n.id} style={{ ['--tilt' as string]: `${[-1.5, 1.2, -0.8, 1.6][i]}deg` }}>
          <button type="button" className="kw-sticky" onClick={onOpen} aria-label={`Note: ${n.text}${n.by ? `, from ${n.by}` : ''}`}>
            <span>{n.text}{n.by && <small> · {n.by}</small>}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

/** A sticky to write on. Save resolves false when the note didn't save. */
export function StickySheet({ members, onSave, onClose }: {
  members: FamilyMember[]
  onSave: (text: string, by: string | null) => Promise<boolean>
  onClose: () => void
}) {
  const [text, setText] = useState('')
  const [by, setBy] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const input = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { input.current?.focus() }, [])

  const save = async () => {
    if (!text.trim() || saving) return
    setSaving(true)
    setFailed(false)
    const ok = await onSave(text.trim(), by)
    setSaving(false)
    if (ok) onClose()
    else setFailed(true)
  }

  return (
    <div className="kw-sticky-over" role="dialog" aria-modal="true" aria-label="New sticky" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <form className="kw-sticky-new" onSubmit={(e) => { e.preventDefault(); void save() }}>
        <textarea ref={input} value={text} maxLength={200} rows={3} aria-label="What the sticky says"
          placeholder="Write a sticky…" onChange={(e) => setText(e.target.value)} />
        <div className="kw-sticky-from" role="group" aria-label="From">
          <span className="kw-eyebrow">From</span>
          {members.map((m) => (
            <button key={m.id} type="button" aria-pressed={by === m.id} onClick={() => setBy(by === m.id ? null : m.id)}>
              <Face member={m} size="sm" />{m.name}
            </button>
          ))}
        </div>
        {failed && <p className="kw-sticky-err" role="alert">That didn’t save. Try again.</p>}
        <div className="kw-acts">
          <button type="button" className="kw-btn is-quiet" onClick={onClose}>Cancel</button>
          <button type="submit" className="kw-btn is-primary" disabled={!text.trim() || saving}>{saving ? 'Sticking…' : 'Stick it up'}</button>
        </div>
      </form>
    </div>
  )
}
