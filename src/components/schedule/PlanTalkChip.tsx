// src/components/schedule/PlanTalkChip.tsx
//
// The Month, Season and Year conversations, on schedule, on Today (spec
// 2026-10-14, "The schedule"; mockup frame "After 2"): one quiet chip in the
// header line — "November starts Sunday · Plan it" — with Later and Not this
// time. When several are due it offers one at a time: Year, then Season, then
// Month (planSchedule.ts). "Plan it" sends "Plan November." the way Today's
// own walk does. Today's date only; the host decides that.

import { useEffect, useState } from 'react'
import type { Task } from '@/types/task'
import type { Seasons } from '@/lib/cadence/seasons'
import { useHouseholdSeasons } from '@/hooks/useHouseholdSeasons'
import { useGoals } from '@/hooks/useGoals'
import { useAssistantLauncher } from '@/contexts/AssistantLaunchContext'
import {
  talkFor, dueTalks, listIsEmpty, readDismissals, putOffUntilTomorrow, skipThisTime, talkLead, TALK_DISMISSED_EVENT,
} from '@/lib/planning/planSchedule'

interface Props {
  tasks: readonly Task[]
  /** The signed-in member: the lists are theirs (Month, Season and Year are personal). */
  meId: string | null
  today: Date
}

export function PlanTalkChip(props: Props) {
  const { seasons } = useHouseholdSeasons()
  // Year goals are fetched only while the year's window is open (Dec 25 – Jan 14).
  return talkFor('year', props.today, seasons)
    ? <WithYearGoals {...props} seasons={seasons} />
    : <Chip {...props} seasons={seasons} goals={[]} />
}

function WithYearGoals(props: Props & { seasons: Seasons }) {
  const { goals, loading } = useGoals()
  // Until they load, nobody can say whether next year is empty: say nothing.
  if (loading) return null
  return <Chip {...props} goals={goals} />
}

function Chip({ tasks, meId, today, seasons, goals }: Props & { seasons: Seasons; goals: readonly { year: number; status: string }[] }) {
  const { openAssistant } = useAssistantLauncher()
  // Re-read what is put off when this chip, or another, is dismissed.
  const [, setVersion] = useState(0)
  useEffect(() => {
    const bump = () => setVersion((v) => v + 1)
    window.addEventListener(TALK_DISMISSED_EVENT, bump)
    return () => window.removeEventListener(TALK_DISMISSED_EVENT, bump)
  }, [])
  const [talk] = dueTalks(today, seasons, (t) => listIsEmpty(t, { tasks, goals, meId, seasons, today }), readDismissals())
  if (!talk) return null
  return <span className="plan-talk-chip" role="group" aria-label={talk.label}>
    <button type="button" className="plan-talk-chip-go" onClick={() => openAssistant({ message: talk.message, autoSend: true })}>
      {talkLead(talk, today)} · Plan it
    </button>
    <button type="button" className="plan-talk-chip-quiet" onClick={() => putOffUntilTomorrow(talk, today)}>Later</button>
    <button type="button" className="plan-talk-chip-quiet" onClick={() => skipThisTime(talk)}>Not this time</button>
  </span>
}
