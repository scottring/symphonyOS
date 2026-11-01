// The one line that says a session is under way: "Planning the week · step 5 of 7 · Leave".

import './guide.css'

export function SessionBar({ label, index, total, onLeave }: {
  label: string
  /** Zero-based position of the current step. */
  index: number
  total: number
  onLeave: () => void
}) {
  return (
    <span className="guide-session-bar">
      {label} · step {index + 1} of {total} · <button type="button" className="guide-session-leave" onClick={onLeave}>Leave</button>
    </span>
  )
}
