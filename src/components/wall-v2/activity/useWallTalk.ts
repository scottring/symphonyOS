// The conversation on the kitchen wall (Kitchen wall v2, stage 3): turns with
// the full Symphony agent in wall mode, the change card it proposes, and
// planning the week together.
//
// A conversation lasts until two minutes pass with nothing said, or someone
// taps Home or Back to today. A change card is only ever saved by a tap on
// Approve or by saying "approve" while it is up (useTellSymphony routes the
// words); a newer card from the agent replaces the one showing. Approve
// applies the set through the app's own writers (applyChangeSet, wired by the
// Shell with family context for anything new), then offers Undo for 30s.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { askWallAgent, type WallAgentReply, type WallTurn } from '@/lib/wall/wallAgent'
import { changeCardNote, type ChangeCardNote, type ChangeSet } from '@/lib/canvas/changeCard'
import type { ApplyResult } from '@/lib/canvas/applyChangeSet'
import type { WeekStart } from '@/lib/cadence/config'
import { AGENT_TIMEOUT_MS, TALK_IDLE_MS, TALK_UNDO_MS, withTimeout } from '@/lib/wall/wallTalk'
import { planWeek, type PlanWeek } from '@/lib/wall/wallDates'

/** Approve's outcome on the wall: the shared apply, or refused because a task
 *  is not a family one (only family plans change from the wall). */
export type WallApplyResult = ApplyResult | { ok: false; reason: 'private'; title: string }

/** What the Shell hands the wall so it can talk to Symphony and save a card. */
export interface WallTalkDeps {
  applyChanges: (set: ChangeSet) => Promise<WallApplyResult>
  weekStartsOn: WeekStart
  /** The agent call; tests pass a fake. */
  ask?: typeof askWallAgent
}

export interface TalkTurn { id: string; who: 'you' | 'symphony'; text: string }

export interface TalkCard {
  set: ChangeSet
  state: 'proposed' | 'saving' | 'failed'
  message?: string
}

export interface TalkSaved { key: string; title: string; count: number; undo: () => Promise<boolean> }

const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `t${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`)

export function useWallTalk(deps: WallTalkDeps | undefined) {
  const [turns, setTurns] = useState<TalkTurn[]>([])
  const [card, setCardState] = useState<TalkCard | null>(null)
  const [saved, setSaved] = useState<TalkSaved | null>(null)
  /** The week being planned, by its dates; null when not planning. */
  const [plan, setPlan] = useState<PlanWeek | null>(null)
  const planning = !!plan
  const [review, setReview] = useState(false)
  const [pointed, setPointed] = useState<string[]>([])
  const [lastAt, setLastAt] = useState(0)
  const [asking, setAsking] = useState(false)

  const history = useRef<WallTurn[]>([])
  const cardRef = useRef<TalkCard | null>(null)
  const setCard = useCallback((next: TalkCard | null | ((cur: TalkCard | null) => TalkCard | null)) => {
    const value = typeof next === 'function' ? next(cardRef.current) : next
    cardRef.current = value
    setCardState(value)
  }, [])
  /** What became of the last card, until a turn has been told. */
  const noteRef = useRef<ChangeCardNote | null>(null)
  /** Bumped by end(): an answer to an ended conversation is dropped. */
  const epoch = useRef(0)
  const approving = useRef(false)
  const touch = useCallback(() => setLastAt(Date.now()), [])

  const active = turns.length > 0 || !!card || planning

  const end = useCallback(() => {
    // A fresh conversation starts with no history, so nothing to tell it
    // about this card: an unapproved card simply goes.
    epoch.current++
    history.current = []
    noteRef.current = null
    setTurns([]); setCard(null); setPlan(null); setReview(false); setPointed([]); setAsking(false)
  }, [setCard])

  /** Turns go one at a time: a sentence said while Symphony is still
   *  answering waits for that answer, so each turn carries the last. */
  const queue = useRef<Promise<unknown>>(Promise.resolve())

  /** One turn with Symphony. Resolves null when the conversation ended while
   *  it was asked; rejects when the agent failed or took too long. */
  const ask = useCallback((text: string, shown?: string): Promise<WallAgentReply | null> => {
    if (!deps) return Promise.reject(new Error('Symphony is not set up on this screen'))
    const mine = epoch.current
    setTurns((t) => [...t, { id: newId(), who: 'you', text: shown ?? text }])
    touch()
    setAsking(true)
    const run = async (): Promise<WallAgentReply | null> => {
      if (mine !== epoch.current) return null
      const cur = cardRef.current
      const changeCard = cur ? changeCardNote(cur.set, 'pending') : noteRef.current ?? undefined
      try {
        // Past the timeout the agent is aborted, not left to finish unseen.
        const abort = new AbortController()
        const r = await withTimeout((deps.ask ?? askWallAgent)(text, history.current, { changeCard, turnId: newId(), signal: abort.signal }), AGENT_TIMEOUT_MS, () => abort.abort())
        if (mine !== epoch.current) return null
        noteRef.current = null
        history.current = r.history
        setTurns((t) => [...t, { id: newId(), who: 'symphony', text: r.reply }])
        if (r.changeSet && r.changeSet.ops.length) {
          // A revision replaces the card; the same set re-sent while saving stays saving.
          setCard((c) => (c && c.set.key === r.changeSet!.key && c.state === 'saving' ? c : { set: r.changeSet!, state: 'proposed' }))
          setReview(false)
          // This is the card the reply reads out: the one a spoken "approve" means.
          announced.current = r.changeSet.key
        }
        if (r.pointed?.dates.length) setPointed(r.pointed.dates)
        touch()
        return r
      } catch (e) {
        // Keep the words in the history so the next turn still knows them.
        if (mine === epoch.current) history.current = [...history.current, { role: 'user', content: text }]
        throw e
      }
    }
    const turn = queue.current.then(run, run)
    queue.current = turn.catch(() => undefined).finally(() => { if (queue.current === settled && mine === epoch.current) setAsking(false) })
    const settled = queue.current
    return turn
  }, [deps, touch, setCard])

  /** The wall's own answer when Symphony couldn't give one. */
  const addReply = useCallback((text: string) => {
    setTurns((t) => [...t, { id: newId(), who: 'symphony', text }])
    touch()
  }, [touch])

  const startPlanning = useCallback((now = new Date()) => {
    if (!deps) throw new Error('Symphony is not set up on this screen')
    // Said with the week's dates, and shown so: which week is never a guess.
    const week = planWeek(now, deps.weekStartsOn)
    setPlan(week)
    return ask(week.opening, `Plan the week · ${week.label}`)
  }, [deps, ask])

  /** The card the wall last read out. A spoken approve means that one (plan
   *  §6): a card that arrived since is read first and approved on the next
   *  "approve", never bound to whichever card happened to land. */
  const announced = useRef<string | null>(null)

  /** Approve the card showing. Returns what to say, or null with no card. */
  const approve = useCallback(async (opts: { spoken?: boolean } = {}): Promise<string | null> => {
    const c = cardRef.current
    if (!deps || !c || c.state === 'saving' || approving.current) return null
    if (opts.spoken && announced.current !== c.set.key) {
      announced.current = c.set.key
      return `A newer list came in: ${c.set.title}. Say approve again if that is the one.`
    }
    approving.current = true
    touch()
    setCard({ ...c, state: 'saving', message: undefined })
    let r: WallApplyResult
    try { r = await deps.applyChanges(c.set) } catch { r = { ok: false, reason: 'failed', reverted: true, kept: [] } }
    approving.current = false
    if (!r.ok) {
      const message = r.reason === 'stale'
        ? `“${r.title}” changed since Symphony proposed this. Ask for a fresh list.`
        : r.reason === 'private'
          ? `“${r.title}” isn’t a family plan. Only family plans can change from the wall.`
          : r.reverted
            ? 'Couldn’t save. Nothing was changed. Try again.'
            : 'Couldn’t finish, and some of it stayed saved. Check the week before trying again.'
      setCard((cur) => (cur && cur.set.key === c.set.key ? { ...cur, state: 'failed', message } : cur))
      return message
    }
    noteRef.current = changeCardNote(c.set, 'approved')
    setCard((cur) => (cur && cur.set.key === c.set.key ? null : cur))
    setReview(false)
    setSaved({ key: c.set.key, title: c.set.title, count: c.set.ops.length, undo: r.undo })
    touch()
    return `Saved: ${c.set.title}.`
  }, [deps, touch, setCard])

  const dismiss = useCallback(() => {
    const c = cardRef.current
    if (!c || c.state === 'saving') return
    noteRef.current = changeCardNote(c.set, 'dismissed')
    setCard(null)
    setReview(false)
    touch()
  }, [touch, setCard])

  const undoSaved = useCallback(async (): Promise<string> => {
    const s = saved
    setSaved(null)
    if (!s) return 'Nothing to undo.'
    const ok = await s.undo().catch(() => false)
    // Told to the next turn as not saved, so Symphony doesn't count it done.
    if (ok) noteRef.current = { state: 'dismissed', title: s.title, ops: [], at: new Date().toISOString() }
    return ok ? 'Undone. Nothing from that card is saved.' : 'Couldn’t undo all of it. Check the week on the app.'
  }, [saved])

  // Two minutes of quiet ends the conversation (not while Symphony is answering).
  useEffect(() => {
    if (!active || asking || card?.state === 'saving') return
    const id = setTimeout(end, Math.max(0, lastAt + TALK_IDLE_MS - Date.now()))
    return () => clearTimeout(id)
  }, [active, asking, card?.state, lastAt, end])
  // Undo stays 30 seconds.
  useEffect(() => {
    if (!saved) return
    const id = setTimeout(() => setSaved((s) => (s === saved ? null : s)), TALK_UNDO_MS)
    return () => clearTimeout(id)
  }, [saved])

  return useMemo(() => ({
    enabled: !!deps, active, asking, turns, card, saved, planning, plan, review, pointed,
    weekStartsOn: deps?.weekStartsOn ?? 0,
    ask, addReply, startPlanning, approve, dismiss, undoSaved, end, setReview,
  }), [deps, active, asking, turns, card, saved, planning, plan, review, pointed, ask, addReply, startPlanning, approve, dismiss, undoSaved, end])
}

export type WallTalk = ReturnType<typeof useWallTalk>
