// src/hooks/usePlanSessionHost.ts
//
// One session host. A guided planning session is the same machine at every
// level — the saved record, the draft in browser storage, the prune against
// the lists on screen, and Save's resumable apply. The page supplies the
// lists and the writers; everything about running the session lives here, so
// the month page and the week page cannot drift apart.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePlanningSession, type SessionHorizon } from '@/hooks/usePlanningSession'
import { localYmd } from '@/lib/cadence/config'
import { emptyDraft, lookBackRows, pruneDraft, type SessionDraft, type SessionLevel } from '@/lib/planning/session'
import { readDraft, writeDraft, clearDraft, DRAFT_CHANGED_EVENT, type DraftChangedDetail } from '@/lib/planning/sessionDraft'
import { applySession, type SessionWriters } from '@/lib/planning/applySession'
import type { Task } from '@/types/task'

export interface PlanSessionHostInput {
  enabled: boolean
  level: SessionLevel
  horizon: SessionHorizon
  token: string
  periodStart: Date
  prevStart: Date
  /** Loading of the lists below; prune waits for them. */
  listsLoading: boolean
  back: ReturnType<typeof lookBackRows>
  current: Task[]
  /** The parent level's TASKS (non-goals). */
  above: Task[]
  writers: Omit<SessionWriters, 'saveSession'>
  isCompleted: (id: string) => boolean
  /** Run ONCE on the draft about to be saved, before the first write, and
   *  persisted before `applySession` reads it. The year uses it to fix the ids
   *  its Keeps will create with: a writer cannot fill them in mid-save, because
   *  every later `changeDraft` spreads the pre-save draft and would drop them. */
  prepareDraft?: (d: SessionDraft) => SessionDraft
}

export interface PlanSessionHost {
  session: ReturnType<typeof usePlanningSession>
  sessionReady: boolean
  draft: SessionDraft | null
  shownDraft: SessionDraft | null
  sessionOpen: boolean
  savingSession: boolean
  justSaved: boolean
  saveError: boolean
  startSession: () => void
  changeDraft: (d: SessionDraft) => void
  closeSession: () => void
  saveDraft: () => Promise<void>
  dismissJustSaved: () => void
}

export function usePlanSessionHost(input: PlanSessionHostInput): PlanSessionHost {
  const { enabled, level, horizon, token, periodStart, prevStart, listsLoading, back, current, above, writers, isCompleted, prepareDraft } = input
  const { user } = useAuth()
  const userId = user?.id ?? null
  const session = usePlanningSession(horizon, token)
  const { mine: myNotes, loadedToken, save: saveSession } = session
  // Open only on THIS period's loaded record — never on a blank or a neighbour's (review 2026-09-21).
  const sessionReady = loadedToken === token
  const periodYmd = localYmd(periodStart)
  // The period on screen NOW — a save that finishes after the page has moved
  // on must not land its result on the new period (final review M2).
  const periodYmdRef = useRef(periodYmd)
  useEffect(() => { periodYmdRef.current = periodYmd }, [periodYmd])
  const [draft, setDraft] = useState<SessionDraft | null>(null)
  const [sessionOpen, setSessionOpen] = useState(false)
  const [savingSession, setSavingSession] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [saveError, setSaveError] = useState(false)
  useEffect(() => {
    setSessionOpen(false); setJustSaved(false); setSaveError(false)
    setDraft(enabled ? readDraft(userId, level, periodYmd) : null)
  }, [periodYmd, enabled, userId, level])

  // Something else in this tab wrote THIS draft — a page from paper joining
  // the plan. Storage wins: the in-memory copy predates it, and saving it
  // back would drop what the page just added. Never mid-save, which is
  // already writing from a decided draft.
  const savingRef = useRef(false)
  useEffect(() => {
    const onChanged = (e: Event) => {
      const d = (e as CustomEvent<DraftChangedDetail>).detail
      if (!enabled || savingRef.current) return
      if (!d || d.level !== level || d.periodStart !== periodYmdRef.current) return
      const fresh = readDraft(userId, level, periodYmdRef.current)
      if (fresh) setDraft(fresh)
    }
    window.addEventListener(DRAFT_CHANGED_EVENT, onChanged)
    return () => window.removeEventListener(DRAFT_CHANGED_EVENT, onChanged)
  }, [enabled, level, userId])

  // The draft as the session can show it — the ONE draft both the summary and
  // Save read, so a stale entry (a deleted task, a row the domain in view
  // hides) is neither written nor an invisible blocker (final review I2).
  // Not while the lists are still loading: an empty list is not "all gone".
  const shownDraft = useMemo(
    () => (draft && !listsLoading ? pruneDraft(draft, { open: back.open, above, current }) : draft),
    [draft, listsLoading, back.open, above, current],
  )

  // Reopening a saved plan starts from MY saved notes, so saving again never
  // writes blank reflections over them (review 2026-09-21).
  const startSession = useCallback(() => {
    if (!sessionReady) return
    setDraft((d) => d ?? readDraft(userId, level, periodYmd)
      ?? { ...emptyDraft(level, periodStart, prevStart), wentWell: myNotes?.wentWell ?? '', didnt: myNotes?.didnt ?? '' })
    setSaveError(false)
    setJustSaved(false)
    setSessionOpen(true)
  }, [sessionReady, userId, level, periodYmd, periodStart, prevStart, myNotes])
  const changeDraft = useCallback((d: SessionDraft) => { setDraft(d); writeDraft(userId, d) }, [userId])
  const closeSession = useCallback(() => setSessionOpen(false), [])
  const dismissJustSaved = useCallback(() => setJustSaved(false), [])
  const saveDraft = useCallback(async () => {
    if (!shownDraft) return
    const savingYmd = periodYmd
    // Everything the writers will need decided is decided here, once, and is in
    // storage before the first write — so a retry resumes on the same rows.
    const draftForSave = prepareDraft ? prepareDraft(shownDraft) : shownDraft
    if (draftForSave !== shownDraft) { setDraft(draftForSave); writeDraft(userId, draftForSave) }
    setSavingSession(true)
    savingRef.current = true
    // What WE last put in storage — the draft we're about to save, then each
    // progress write applySession makes. Compared below against what's
    // actually in storage once the save finishes, to notice anything else
    // wrote there in between.
    const lastWritten = { current: draftForSave as SessionDraft | null }
    const result = await applySession(draftForSave, { ...writers, saveSession: (notes) => saveSession(notes) },
      isCompleted,
      // Persist after EVERY write, so a reload mid-save resumes from here.
      (remaining) => { lastWritten.current = remaining; writeDraft(userId, remaining) })
    setSavingSession(false)
    savingRef.current = false

    // An import event that landed mid-save was ignored (the listener bails
    // out while savingRef.current is true) and never re-read. If storage now
    // differs from what OUR save last wrote, something else wrote it after —
    // prefer storage over what the save computed, so that import isn't
    // silently clobbered by the clear/write we're about to do.
    function reconcile<T extends SessionDraft | null>(computed: T): T | SessionDraft {
      const fresh = readDraft(userId, level, savingYmd)
      if (fresh && JSON.stringify(fresh) !== JSON.stringify(lastWritten.current)) return fresh
      return computed
    }

    if (periodYmdRef.current !== savingYmd) {
      // The page moved to another period mid-save: the result belongs to the
      // period it was saving, in storage only — never on the page now shown.
      if (result.ok) {
        const remaining = reconcile(null)
        if (remaining) writeDraft(userId, remaining)
        else clearDraft(userId, level, savingYmd)
      } else {
        writeDraft(userId, reconcile(result.remaining))
      }
      return
    }
    if (!result.ok) {
      // Keep only what did not write — Save again retries exactly that.
      const remaining = reconcile(result.remaining)
      setDraft(remaining)
      writeDraft(userId, remaining)
      setSaveError(true)
      return
    }
    const remaining = reconcile(null)
    if (remaining) {
      // Storage moved on during the save (an import landed) — keep it
      // instead of clearing; the save itself still succeeded.
      setDraft(remaining)
      writeDraft(userId, remaining)
    } else {
      clearDraft(userId, level, periodYmd)
      setDraft(null)
    }
    setSaveError(false)
    setSessionOpen(false)
    setJustSaved(true)
  }, [shownDraft, writers, saveSession, isCompleted, userId, level, periodYmd, prepareDraft])

  return {
    session, sessionReady, draft, shownDraft, sessionOpen, savingSession, justSaved, saveError,
    startSession, changeDraft, closeSession, saveDraft, dismissJustSaved,
  }
}
