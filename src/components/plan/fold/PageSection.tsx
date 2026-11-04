// A planning step's permanent home on the everyday page (planning as
// tooltips, Task 2, 2026-11-04): a quiet section of the paper sheet, not a
// card. A small-caps heading, what was written in plain lines (or one faint
// line while there is nothing), and Edit, which opens the step's own editor
// in place. While the step that asks for it is on (`open`), the editor is
// open by itself; the step's tooltip points here (`anchor`).

import { useState, type ReactNode } from 'react'
import './sheet.css'

export function PageSection({ title, anchor, empty, open = false, editor, children }: {
  /** "Ideal week", "Vision": the heading, and the section's name. */
  title: string
  /** Its step's anchor (steps.ts `at`). */
  anchor: string
  /** Said faintly in place of the body while nothing is written. */
  empty?: string | null
  /** Its step is on: the editor opens (and closes when the step moves on). */
  open?: boolean
  /** The step's editor, drawn in place while editing. None: read only. */
  editor?: ReactNode
  children?: ReactNode
}) {
  const [editing, setEditing] = useState(open)
  const [seenOpen, setSeenOpen] = useState(open)
  if (open !== seenOpen) { setSeenOpen(open); setEditing(open) }
  const showEditor = editing && !!editor
  return (
    <section className="page-section" aria-label={title} data-guide-anchor={anchor}>
      <div className="page-section-head">
        <h3 className="page-section-title">{title}</h3>
        {editor && <button type="button" className="canvas-link page-section-edit" aria-expanded={showEditor}
          onClick={() => setEditing((e) => !e)}>{showEditor ? 'Done' : 'Edit'}</button>}
      </div>
      {showEditor ? editor : empty ? <p className="page-section-empty">{empty}</p> : children}
    </section>
  )
}
