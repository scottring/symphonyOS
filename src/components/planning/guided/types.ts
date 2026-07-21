// src/components/planning/guided/types.ts
//
// Pure types for the guided Five Horizons sessions. sessions.ts (pure data)
// and the narration generation script both depend on this file, so it must
// never import components.

import type { PlanningHorizon, PlanningNotes } from '@/hooks/usePlanningSession'
import type { TaskBucket, TaskContext } from '@/types/task'
import type { PlanningDomain } from '@/lib/today/domainFilter'

export type StepType =
  | 'narration'      // instruction moment, Continue
  | 'reflect'        // voiced prompt + textarea -> planning_sessions.notes[key]
  | 'review'         // this horizon's open items: complete / migrate / let go
  | 'look-above'     // read-only level-above panel (+ copy-down / tap-to-pull)
  | 'projects'       // read-only "projects in motion" reference (the WHAT axis)
  | 'calendar'       // period look-ahead
  | 'write-list'     // add items into this horizon's bucket
  | 'inbox'          // weekly "Look Around": triage inbox to zero
  | 'schedule-grid'  // weekly: the existing StepSchedule grid
  | 'domains-goals'  // annual: goal statements per life domain
  | 'book-next'      // create next session's calendar item

export interface GuidedStepConfig {
  /** Unique within the session; keys the narration manifest as `<horizon>.<id>`. */
  id: string
  type: StepType
  /** Step header, e.g. "Look back". */
  title: string
  /** Shown on screen AND spoken. Single source of truth for the voice. */
  narration: string
  /** Domain-session overrides for lines whose default wording is whole-life
   *  ("each other and the kids"). Variant narration is text-only until its
   *  audio is generated — narrationClip's exact-text match falls back to
   *  silent display by design. Universal always uses the base fields. */
  byDomain?: Partial<Record<TaskContext, { narration?: string; placeholder?: string }>>
  props?: {
    /** reflect: which notes key the textarea persists to. */
    notesKey?: string
    placeholder?: string
    /** review/write-list/inbox/look-above: which bucket this step reads/writes. */
    bucket?: TaskBucket
    /** review source override: 'someday' | 'overdue' | 'goals' (default: bucket). */
    source?: 'someday' | 'overdue' | 'goals'
    /** review/write-list row style. Default: the TriageWhenMenu (day/week/month
     *  routing + Done). 'fate' = seasonal review verdicts (Carry forward /
     *  Change / Put aside). 'plain' = list only, no routing (seasonal write).
     *  'bets' = seasonal write, plain rows + bet cap counter + outcome coach. */
    rows?: 'fate' | 'plain' | 'bets'
    /** look-above: bucket of the level above ('quarter' for month, …) or 'goals'. */
    aboveBucket?: TaskBucket | 'goals'
    aboveLabel?: string
    /** look-above: daily variant — tapping an item MOVES it into today. */
    pick?: boolean
    /** write-list: soft item-count nudge (never blocks). */
    softCap?: number
    /** book-next: which horizon's session to schedule. */
    bookHorizon?: PlanningHorizon
    bookTitle?: string
    /** calendar: render the annual 12-month landscape (with zoom-into-month)
     *  instead of the per-month commitment counts. Year session only. */
    landscape?: boolean
  }
}

export interface GuidedSessionConfig {
  horizon: PlanningHorizon
  title: string        // "Plan the season"
  estMinutes: [number, number]
  /** Optional cascade: offered as a secondary action on the final step
   *  ("Plan the season now") for days with energy to keep descending.
   *  Finishing normally never auto-chains — the booked next session is
   *  the default path. */
  chain?: { horizon: PlanningHorizon; label: string }
  steps: GuidedStepConfig[]
}

/** Everything a step component receives. Passed via GuidedContext. */
export interface GuidedStepRenderContext {
  horizon: PlanningHorizon
  /** The domain this session runs in. 'universal' = whole-life (default). */
  domain: PlanningDomain
  periodToken: string
  periodLabel: string
  periodStart: Date
  periodEnd: Date
  notes: PlanningNotes
  patchNotes: (partial: PlanningNotes) => void
}
