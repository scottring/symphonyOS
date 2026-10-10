// src/contexts/CanvasActivityContext.tsx
//
// One place that knows what the person just asked for and what it did.
//
// Conversation turns (typed or spoken, through the shell's one assistant) and
// manual commands (a link, a schedule, a removal on any canvas page) report
// here. The provider turns that into:
// - a receipt: what was asked, its save state (saving, saved, partly saved,
//   didn't save), what changed, and Undo when Undo can honestly reverse it;
// - "arrived" ids, so pages can briefly mark the rows that just changed;
// - proposals: things Symphony suggested, held until the person keeps them.
//
// A save is reported only after the data shows it (refetch + diff for agent
// turns, the writer's own result for manual commands).

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Task } from '@/types/task'
import type { Goal } from '@/types/goal'
import type { Routine } from '@/types/routine'
import type { AgentProposalItem } from '@/lib/agentStream'
import { WRITE_TOOLS } from '@/lib/agentTurn'
import { canUndo, describeChanges, diffSnapshots, type CanvasChange, type Snapshot } from '@/lib/canvas/changeSet'
import { toolSavingLabel } from '@/lib/canvas/toolLabels'

export type SaveState = 'listening' | 'working' | 'saving' | 'saved' | 'partial' | 'failed' | 'answered' | 'unverified'

export interface CanvasReceipt {
  key: number
  source: 'conversation' | 'manual'
  state: SaveState
  /** What was asked ("Add the plumber to today") or the command's label. */
  request: string
  /** One-line summary of the outcome. */
  summary: string
  changes: CanvasChange[]
  /** Failed operations, by name, when known. */
  failures: string[]
  undoable: boolean
  canRetry: boolean
}

export interface CanvasProposal extends AgentProposalItem {
  state: 'proposed' | 'saving' | 'failed'
}

export interface CanvasWriters {
  deleteTask: (id: string) => Promise<unknown>
  updateTask: (id: string, updates: Partial<Task>) => Promise<unknown>
  deleteGoal: (id: string) => Promise<unknown>
  updateGoal: (id: string, updates: Partial<Goal>) => Promise<unknown>
  deleteRoutine?: (id: string) => Promise<unknown>
  updateRoutine?: (id: string, updates: Partial<Routine>) => Promise<unknown>
}

/** Writes whose rows the canvas holds and can check after a turn. */
const TRACKED_TOOLS = new Set([
  'symphony_create_plan_item', 'symphony_link_plan_item', 'symphony_update_intention',
  'symphony_create_task', 'symphony_update_task', 'symphony_complete_task', 'symphony_delete_task',
  'symphony_create_routine', 'symphony_update_routine', 'symphony_delete_routine',
])

interface CommandOptions {
  /** Ids the command touches, marked as arrived once it saves. */
  ids?: string[]
  /** Reverses the command. Offered as Undo only when given. */
  undo?: () => Promise<boolean | void>
  /** Runs the command again, offered when it fails. */
  retry?: () => void
}

export interface CanvasActivity {
  receipt: CanvasReceipt | null
  isArrived: (id: string) => boolean
  arrivedVersion: number
  /** Conversation lifecycle (wired to the shell assistant). */
  turnStarted: (text: string, retry: boolean) => void
  toolUsed: (name: string) => void
  toolResult: (result: { name: string; ok: boolean; ids?: string[]; error?: string }) => void
  turnEnded: (turn: { didWrite: boolean; error: string | null; text: string }) => void
  /** Run a manual command with the same save states and Undo as conversation. */
  run: (label: string, command: () => Promise<boolean | void | string | undefined>, options?: CommandOptions) => Promise<boolean>
  undo: () => Promise<void>
  retry: () => void
  dismiss: () => void
  proposals: CanvasProposal[]
  addProposals: (items: AgentProposalItem[]) => void
  setProposalState: (key: string, state: CanvasProposal['state']) => void
  removeProposal: (key: string) => void
  /** Whether voice/listening is on (drives the strip's mic state). */
  listening: boolean
  setListening: (on: boolean) => void
}

const CanvasActivityContext = createContext<CanvasActivity | null>(null)

const ARRIVED_MS = 6000
/** How long to wait for refetched rows before diffing what is there. */
const SETTLE_MS = 2500

interface ProviderProps {
  children: ReactNode
  snapshot: Snapshot
  writers: CanvasWriters
  refetch: () => Promise<unknown> | void
  /** Resend the last conversation turn (same turn id). */
  retryTurn?: () => void
}

export function CanvasActivityProvider({ children, snapshot, writers, refetch, retryTurn }: ProviderProps) {
  const [receipt, setReceipt] = useState<CanvasReceipt | null>(null)
  const [arrived, setArrived] = useState<Map<string, number>>(new Map())
  const [arrivedVersion, setArrivedVersion] = useState(0)
  const [proposals, setProposals] = useState<CanvasProposal[]>([])
  const [listening, setListening] = useState(false)
  const keyRef = useRef(0)
  const snapshotRef = useRef(snapshot)
  snapshotRef.current = snapshot
  const writersRef = useRef(writers)
  writersRef.current = writers
  const undoRef = useRef<(() => Promise<boolean | void>) | null>(null)
  const retryRef = useRef<(() => void) | null>(null)

  // The turn in flight.
  const turnRef = useRef<{
    key: number; request: string; before: Snapshot; startedAt: number
    wrote: boolean; trackedWrite: boolean; reportedOk: boolean; failures: string[]; reportedIds: string[]; awaitingDiff: boolean; ended?: { error: string | null; text: string }
  } | null>(null)

  const nextKey = () => { keyRef.current += 1; return keyRef.current }

  const markArrived = useCallback((ids: string[]) => {
    if (!ids.length) return
    const until = Date.now() + ARRIVED_MS
    setArrived((prev) => { const next = new Map(prev); ids.forEach((id) => next.set(id, until)); return next })
    setArrivedVersion((v) => v + 1)
  }, [])

  // Expire arrived marks.
  useEffect(() => {
    if (!arrived.size) return
    const soonest = Math.min(...arrived.values())
    const t = setTimeout(() => {
      const now = Date.now()
      setArrived((prev) => new Map([...prev].filter(([, until]) => until > now)))
      setArrivedVersion((v) => v + 1)
    }, Math.max(50, soonest - Date.now()))
    return () => clearTimeout(t)
  }, [arrived])

  const isArrived = useCallback((id: string) => (arrived.get(id) ?? 0) > Date.now(), [arrived])

  const turnStarted = useCallback((text: string, retry: boolean) => {
    const key = nextKey()
    turnRef.current = { key, request: text, before: snapshotRef.current, startedAt: Date.now() - 2000, wrote: false, trackedWrite: false, reportedOk: false, failures: [], reportedIds: [], awaitingDiff: false }
    undoRef.current = null
    retryRef.current = retryTurn ?? null
    setReceipt({ key, source: 'conversation', state: 'working', request: text, summary: retry ? 'Trying again…' : 'Working on it…', changes: [], failures: [], undoable: false, canRetry: false })
  }, [retryTurn])

  const toolUsed = useCallback((name: string) => {
    const turn = turnRef.current
    if (!turn || !WRITE_TOOLS.has(name)) return
    turn.wrote = true
    if (TRACKED_TOOLS.has(name)) turn.trackedWrite = true
    setReceipt((r) => r && r.key === turn.key ? { ...r, state: 'saving', summary: toolSavingLabel(name) } : r)
  }, [])

  const toolResult = useCallback((result: { name: string; ok: boolean; ids?: string[]; error?: string }) => {
    const turn = turnRef.current
    if (!turn) return
    if (result.ok) { turn.reportedOk = true; turn.reportedIds.push(...(result.ids ?? [])); markArrived(result.ids ?? []) }
    else turn.failures.push(toolSavingLabel(result.name).replace(/…$/, ''))
  }, [markArrived])

  const finishDiff = useCallback(() => {
    const turn = turnRef.current
    if (!turn || !turn.awaitingDiff) return
    turn.awaitingDiff = false
    const changes = diffSnapshots(turn.before, snapshotRef.current, turn.startedAt)
    markArrived(changes.filter((c) => c.kind !== 'removed').map((c) => c.id))
    const error = turn.ended?.error ?? null
    const failed = turn.failures.length > 0 || !!error
    // Nothing visible changed: a failure only when the write was one this
    // canvas can see. A note, contact or event saved elsewhere is reported as
    // saved when the server confirmed it, otherwise as not checked here.
    const state: SaveState = changes.length
      ? (failed ? 'partial' : 'saved')
      : failed ? 'failed'
        : turn.trackedWrite ? 'failed'
          : turn.wrote ? (turn.reportedOk ? 'saved' : 'unverified')
            : 'answered'
    const routineUndo = !!writersRef.current.deleteRoutine && !!writersRef.current.updateRoutine
    const undoable = changes.length > 0 && changes.every((c) => canUndo(c) && (c.entity !== 'routine' || routineUndo))
    const summary = state === 'answered' ? ''
      : state === 'unverified' ? "Symphony says it's done. It isn't shown on this page, so it wasn't checked here."
      : state === 'saved' && !changes.length ? 'Saved'
      : state === 'failed'
      ? (turn.wrote && !error && !turn.failures.length ? 'Nothing changed. The request may not have saved.' : "Didn't save. Nothing changed.")
      : state === 'partial'
        ? `${describeChanges(changes)}. Some of it didn't save.`
        : describeChanges(changes)
    undoRef.current = undoable ? async () => {
      const w = writersRef.current
      for (const c of [...changes].reverse()) {
        if (c.kind === 'created') {
          if (c.entity === 'task') await w.deleteTask(c.id)
          else if (c.entity === 'goal') await w.deleteGoal(c.id)
          else await w.deleteRoutine?.(c.id)
        } else if (c.kind === 'updated' && c.before) {
          if (c.entity === 'task') await w.updateTask(c.id, c.before as Partial<Task>)
          else if (c.entity === 'goal') await w.updateGoal(c.id, c.before as Partial<Goal>)
          else await w.updateRoutine?.(c.id, c.before as Partial<Routine>)
        }
      }
    } : null
    setReceipt({ key: turn.key, source: 'conversation', state, request: turn.request, summary, changes, failures: turn.failures, undoable, canRetry: failed && !!retryRef.current })
  }, [markArrived])

  // After a writing turn ends, the refetched rows arrive as a new snapshot.
  useEffect(() => { if (turnRef.current?.awaitingDiff && turnRef.current.ended) finishDiff() }, [snapshot, finishDiff])

  const turnEnded = useCallback((ended: { didWrite: boolean; error: string | null; text: string }) => {
    const turn = turnRef.current
    if (!turn) return
    turn.ended = { error: ended.error, text: ended.text }
    if (!ended.didWrite && !turn.wrote) {
      setReceipt((r) => r && r.key === turn.key
        ? { ...r, state: ended.error ? 'failed' : 'answered', summary: ended.error ? "Couldn't reach Symphony. Nothing changed." : '', canRetry: !!ended.error && !!retryRef.current }
        : r)
      return
    }
    turn.awaitingDiff = true
    void Promise.resolve(refetch()).finally(() => setTimeout(finishDiff, SETTLE_MS))
  }, [refetch, finishDiff])

  const run = useCallback(async (label: string, command: () => Promise<boolean | void | string | undefined>, options?: CommandOptions) => {
    const key = nextKey()
    turnRef.current = null
    undoRef.current = null
    retryRef.current = options?.retry ?? null
    setReceipt({ key, source: 'manual', state: 'saving', request: label, summary: 'Saving…', changes: [], failures: [], undoable: false, canRetry: false })
    let ok = false
    try {
      const result = await command()
      ok = result !== false
    } catch { ok = false }
    if (ok) {
      markArrived(options?.ids ?? [])
      undoRef.current = options?.undo ?? null
    }
    setReceipt((r) => r && r.key === key ? {
      ...r, state: ok ? 'saved' : 'failed',
      summary: ok ? 'Saved' : "Didn't save. Nothing changed.",
      undoable: ok && !!options?.undo, canRetry: !ok && !!options?.retry,
    } : r)
    return ok
  }, [markArrived])

  const undo = useCallback(async () => {
    const fn = undoRef.current
    if (!fn) return
    undoRef.current = null
    const key = receipt?.key
    setReceipt((r) => r && r.key === key ? { ...r, state: 'saving', summary: 'Undoing…', undoable: false } : r)
    try {
      const ok = await fn()
      setReceipt((r) => r && r.key === key ? { ...r, state: ok === false ? 'failed' : 'saved', summary: ok === false ? "Couldn't undo. Nothing changed." : 'Undone', changes: ok === false ? r.changes : [] } : r)
      void refetch()
    } catch {
      setReceipt((r) => r && r.key === key ? { ...r, state: 'failed', summary: "Couldn't undo. Nothing changed." } : r)
    }
  }, [receipt?.key, refetch])

  const retry = useCallback(() => { const fn = retryRef.current; if (fn) fn() }, [])
  const dismiss = useCallback(() => setReceipt(null), [])

  const addProposals = useCallback((items: AgentProposalItem[]) => {
    if (!items.length) return
    setProposals((prev) => {
      const known = new Set(prev.map((p) => p.key))
      return [...prev, ...items.filter((i) => i.key && i.title && !known.has(i.key)).map((i) => ({ ...i, state: 'proposed' as const }))]
    })
  }, [])
  const setProposalState = useCallback((key: string, state: CanvasProposal['state']) => {
    setProposals((prev) => prev.map((p) => p.key === key ? { ...p, state } : p))
  }, [])
  const removeProposal = useCallback((key: string) => setProposals((prev) => prev.filter((p) => p.key !== key)), [])

  const value = useMemo<CanvasActivity>(() => ({
    receipt, isArrived, arrivedVersion, turnStarted, toolUsed, toolResult, turnEnded, run, undo, retry, dismiss,
    proposals, addProposals, setProposalState, removeProposal, listening, setListening,
  }), [receipt, isArrived, arrivedVersion, turnStarted, toolUsed, toolResult, turnEnded, run, undo, retry, dismiss, proposals, addProposals, setProposalState, removeProposal, listening])

  return <CanvasActivityContext.Provider value={value}>{children}</CanvasActivityContext.Provider>
}

const NOOP_ACTIVITY: CanvasActivity = {
  receipt: null, isArrived: () => false, arrivedVersion: 0,
  turnStarted: () => {}, toolUsed: () => {}, toolResult: () => {}, turnEnded: () => {},
  run: async (_l, command) => { try { return (await command()) !== false } catch { return false } },
  undo: async () => {}, retry: () => {}, dismiss: () => {},
  proposals: [], addProposals: () => {}, setProposalState: () => {}, removeProposal: () => {},
  listening: false, setListening: () => {},
}

/** The shell's canvas activity. Outside the shell (tests, the wall) commands
 *  still run, without receipts. */
export function useCanvasActivity(): CanvasActivity {
  return useContext(CanvasActivityContext) ?? NOOP_ACTIVITY
}

/** True for a few seconds after the row with this id was created or changed. */
export function useArrived(id: string | null | undefined): boolean {
  const { isArrived } = useCanvasActivity()
  return !!id && isArrived(id)
}
