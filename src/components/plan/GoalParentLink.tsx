// src/components/plan/GoalParentLink.tsx
//
// The optional link from a goal to the goal one rung above it, and the goal's
// own status — the two controls Scott's approved Month mockup puts in a goal's
// head, and the two Codex found had no UI anywhere (2026-09-24: "existing
// month-to-season goal linking is a missing UI capability").
//
// Both write through the EXISTING schema. Nothing here needs a migration:
//
//   month goal  → season goal   `supportsGoalTaskId` on the tasks row
//   season goal → year goal     `goalId` on the tasks row
//
// Three things this is careful about, because they are what the acceptance
// asks for:
//
//   IDENTITY. Linking writes one field. The goal keeps its id, its steps,
//   its placement and its history — nothing is recreated, copied or moved.
//   OPTIONAL MEANS REMOVABLE. "No linked goal" is a real choice that clears
//   the field, not an absence of one.
//   STATUS IS NOT STEP COMPLETION. A goal is Active or Completed because
//   somebody said so. Finishing every step does not say so, and this control
//   never reads a step.
//
// Archive is deliberately absent: the app has no archived state for a goal
// task, and inventing one out of Someday would be a different feature with
// different consequences.
import { useState } from 'react'
import { Target } from 'lucide-react'
import type { SupportLink } from '@/lib/planning/goalSupport'

export interface ParentChoice {
  id: string
  title: string
  /** "Fall 2026", "2026" — which one this is, when titles repeat. */
  period?: string
}

export function GoalParentLink({
  goalTitle, rungLabel, current, choices, onLink, onUnlink, disabled,
}: {
  goalTitle: string
  /** "a season goal", "a year goal" — what may be linked to from here. */
  rungLabel: string
  current: SupportLink | null
  choices: readonly ParentChoice[]
  onLink: (parentId: string) => void
  onUnlink: () => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  // Nothing above to link to, and nothing linked: the control would be a
  // button that can only disappoint.
  if (choices.length === 0 && !current) return null

  return (
    <span className="goal-parent-link">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="goal-parent-trigger"
      >
        {/* The line above already names the parent and opens it. This is the
            verb: change it, or take it away. */}
        {current
          ? 'Change or remove this link'
          : <>Link to {rungLabel} <span className="text-neutral-400">(optional)</span></>}
      </button>
      {open && (
        <span className="goal-parent-editor">
          <label className="goal-parent-label">
            <span className="sr-only">Goal that “{goalTitle}” supports</span>
            <select
              aria-label={`Goal that ${goalTitle} supports`}
              value={current?.id ?? ''}
              disabled={disabled}
              onChange={(e) => {
                const id = e.target.value
                setOpen(false)
                if (!id) onUnlink()
                else if (id !== current?.id) onLink(id)
              }}
              className="goal-parent-select"
            >
              <option value="">No linked goal</option>
              {choices.map((c) => (
                <option key={c.id} value={c.id}>{c.period ? `${c.period} · ${c.title}` : c.title}</option>
              ))}
            </select>
          </label>
          <span className="goal-parent-note">
            Linking changes nothing else about this goal — its steps, timing and history stay as they are.
          </span>
        </span>
      )}
    </span>
  )
}

export type GoalStatus = 'active' | 'completed'

/**
 * Active or Completed, said by a person about the goal itself.
 *
 * Kept apart from the tick on a step on purpose: three steps done is not a
 * transformed porch, and a goal with every step finished may still be open.
 */
export function GoalStatusControl({
  goalTitle, status, onChange, disabled,
}: {
  goalTitle: string
  status: GoalStatus
  onChange: (next: GoalStatus) => void
  disabled?: boolean
}) {
  return (
    <label className="goal-status">
      <span className="sr-only">Status of {goalTitle}</span>
      <select
        aria-label={`Status of ${goalTitle}`}
        value={status}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as GoalStatus)}
        className="goal-status-select"
      >
        <option value="active">Active</option>
        <option value="completed">Completed</option>
      </select>
    </label>
  )
}

/** Which goals a goal on `rung` may link UP to. */
export function parentRungLabel(rung: 'month' | 'season'): string {
  return rung === 'month' ? 'a season goal' : 'a year goal'
}
