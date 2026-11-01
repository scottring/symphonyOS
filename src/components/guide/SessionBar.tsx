// The one line that says a session is under way: "Planning the week · step 5 of 7 · Leave".
// On a phone the conversation is not over the page until asked for: "Talk to
// the guide" opens it (the shell's overlay, the step's header on top).

import { useMobile } from '@/hooks/useMobile'
import { useAssistantLauncher } from '@/contexts/AssistantLaunchContext'
import './guide.css'

export function SessionBar({ label, index, total, onLeave }: {
  label: string
  /** Zero-based position of the current step. */
  index: number
  total: number
  onLeave: () => void
}) {
  const phone = useMobile()
  const { openAssistant } = useAssistantLauncher()
  return (
    <span className="guide-session-bar">
      {label} · step {index + 1} of {total} · <button type="button" className="guide-session-leave" onClick={onLeave}>Leave</button>
      {phone && <> · <button type="button" className="guide-session-leave" onClick={() => openAssistant()}>Talk to the guide</button></>}
    </span>
  )
}
