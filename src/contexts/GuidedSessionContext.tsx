// src/contexts/GuidedSessionContext.tsx
//
// A guided planning session (spec 2026-11-01) runs on its page, but its
// conversation is the shell's: the page registers the session here, and the
// shell opens the conversation beside it with the step's header on top,
// reopens the session's own saved thread, and sends the step with every turn.
//
// Two contexts so a page that registers never re-renders on its own
// registration: pages get the stable setter, the shell reads the value.

import { createContext, useContext, useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import type { AssistantSessionContext } from '@/lib/agentStream'
import type { GuideLevel, StepWrite } from '@/lib/guide/steps'
import type { TaskContext } from '@/types/task'

/** What the agent is told about the current step, every turn (as
 *  `sessionContext.guide`). */
export interface GuideTurnContext {
  level: GuideLevel
  stepId: string
  stepTitle: string
  /** What this step may write; the agent keeps its change set inside it. */
  writes: StepWrite[]
  /** The level above's lines, for breaking big items down. */
  aboveLines: { id: string; title: string }[]
  /** Life areas, within their space. */
  areas: { id: string; name: string; context: TaskContext | null }[]
  /** A count shown, never enforced: "{n} of {of}". */
  counts?: { label: string; n: number; of: string }
}

export interface GuidedSessionRegistration {
  level: GuideLevel
  periodLabel: string
  token: string
  stepId: string
  /** The step header, shown at the top of the conversation panel. */
  header: ReactNode
  sessionContext: AssistantSessionContext & { guide: GuideTurnContext }
  /** `${horizon}:${token}` — the session's chat thread is the chat_sessions
   *  row with entity_type 'planning_session' and this entity_id. */
  threadKey: string
  /** The session's thread row, once it exists (to link it from the session). */
  onThread: (chatSessionId: string) => void
  /** The thread already linked from the session row, if any. */
  threadId?: string
}

type Setter = Dispatch<SetStateAction<GuidedSessionRegistration | null>>

const RegistrationValue = createContext<GuidedSessionRegistration | null>(null)
const RegistrationSetter = createContext<Setter | null>(null)

export function GuidedSessionProvider({ children }: { children: ReactNode }) {
  const [registration, setRegistration] = useState<GuidedSessionRegistration | null>(null)
  return (
    <RegistrationSetter.Provider value={setRegistration}>
      <RegistrationValue.Provider value={registration}>{children}</RegistrationValue.Provider>
    </RegistrationSetter.Provider>
  )
}

/**
 * Page side: register the running session (null unregisters; so does
 * unmounting). Pass a memoized registration — a new object every render
 * re-renders the shell every render.
 */
export function useGuidedSessionRegistration(reg: GuidedSessionRegistration | null): void {
  const set = useContext(RegistrationSetter)
  // What this page registered, so leaving never clears another page's session.
  const mine = useRef<GuidedSessionRegistration | null>(null)
  useEffect(() => {
    if (!set) return
    const previous = mine.current
    mine.current = reg
    if (reg) set(reg)
    else set((current) => (current === previous ? null : current))
  }, [set, reg])
  useEffect(() => {
    if (!set) return
    return () => {
      const last = mine.current
      mine.current = null
      set((current) => (current === last ? null : current))
    }
  }, [set])
}

/** Shell side: the session running on the page, if any. */
export function useGuidedSession(): GuidedSessionRegistration | null {
  return useContext(RegistrationValue)
}
