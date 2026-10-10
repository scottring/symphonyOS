// src/components/routine/board/useRoutineCommands.ts
//
// The board's routine verbs, each run through the canvas activity so it shows
// saving / saved / didn't save, with Undo restoring what was there.

import { useCallback } from 'react'
import type { Routine } from '@/types/actionable'
import type { UpdateRoutineInput } from '@/hooks/useRoutines'
import { useCanvasActivity } from '@/contexts/CanvasActivityContext'
import { offSwitchPatch, routineSwitches } from '@/lib/routineUtils'
import { formatWake, wakeDate } from '@/lib/routines/explain'
import { useHideForToday } from '../useHideForToday'

type Update = (id: string, updates: UpdateRoutineInput) => Promise<boolean> | void | unknown

export function useRoutineCommands({ onUpdateRoutine, onDelete, onAddToCollection }: {
  onUpdateRoutine: Update
  onDelete?: (id: string) => unknown
  onAddToCollection?: (collectionId: string, routineIds: string[]) => unknown
}) {
  const { run } = useCanvasActivity()
  const { hideForToday, showToday } = useHideForToday()
  const write = useCallback(async (id: string, updates: UpdateRoutineInput) => (await onUpdateRoutine(id, updates)) !== false, [onUpdateRoutine])

  const rest = useCallback((r: Routine, ymd: string | null) => {
    const iso = ymd ? new Date(`${ymd}T00:00:00`).toISOString() : null
    const wake = ymd ? wakeDate(ymd) : null
    const prior: UpdateRoutineInput = { visibility: r.visibility, paused_until: r.paused_until ?? null }
    return run(wake ? `Rest "${r.name}" until ${formatWake(wake)}` : `Rest "${r.name}"`,
      () => write(r.id, { visibility: 'reference', paused_until: iso }),
      { ids: [r.id], undo: () => write(r.id, prior) })
  }, [run, write])

  const wake = useCallback((r: Routine) => {
    const prior: UpdateRoutineInput = { visibility: r.visibility, paused_until: r.paused_until ?? null }
    return run(`Wake "${r.name}"`, () => write(r.id, { visibility: 'active', paused_until: null }),
      { ids: [r.id], undo: () => write(r.id, prior) })
  }, [run, write])

  /** Off = hidden from Today and planning; it keeps running and stays on the kiosk. */
  const setOff = useCallback((r: Routine, off: boolean) => {
    const was = routineSwitches(r).off
    return run(off ? `Turn "${r.name}" off` : `Show "${r.name}" in Today and planning`,
      () => write(r.id, offSwitchPatch(off)),
      { ids: [r.id], undo: () => write(r.id, offSwitchPatch(was)) })
  }, [run, write])

  const remove = useCallback((r: Routine) => {
    if (!onDelete) return Promise.resolve(false)
    // Deleting takes its history with it, so it asks, and offers no Undo.
    if (!window.confirm(`Delete "${r.name}" and its history?`)) return Promise.resolve(false)
    return run(`Delete "${r.name}"`, async () => (await onDelete(r.id)) !== false)
  }, [run, onDelete])

  /** Drop one routine onto another: it becomes a step there. Undo lifts it back out. */
  const group = useCallback((dragged: Routine, target: Routine) => {
    if (!onAddToCollection || dragged.id === target.id) return Promise.resolve(false)
    return run(`Make "${dragged.name}" a step of "${target.name}"`,
      async () => (await onAddToCollection(target.id, [dragged.id])) !== false,
      { ids: [target.id, dragged.id], undo: () => write(dragged.id, { parent_routine_id: null, step_order: null }) })
  }, [run, onAddToCollection, write])

  return { rest, wake, setOff, remove, group, hideForToday, showToday }
}

export type RoutineCommands = ReturnType<typeof useRoutineCommands>
