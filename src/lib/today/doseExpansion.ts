import type { Routine } from '@/types/actionable'

/** Split a Today routine timeline id into its routine id and optional dose slot. */
export function parseRoutineTimelineId(id: string): { routineId: string; slot: number | null } {
  const body = id.startsWith('routine-') ? id.slice('routine-'.length) : id
  const hash = body.lastIndexOf('#')
  if (hash === -1) return { routineId: body, slot: null }
  const slot = Number(body.slice(hash + 1))
  if (!Number.isInteger(slot)) return { routineId: body, slot: null }
  return { routineId: body.slice(0, hash), slot }
}

/** The actionable_instances entity_id for a routine dose. null slot = legacy bare id. */
export function routineStatusKey(routineId: string, slot: number | null): string {
  return slot === null ? routineId : `${routineId}#${slot}`
}

/** Expand a routine into its per-day doses. Non-dosed routines yield one bare entry. */
export function expandRoutineDoses(
  routine: Routine,
): { slotId: string; slotIndex: number | null; time: string | null }[] {
  const times = routine.times_per_day
  if (Array.isArray(times) && times.length > 0) {
    return times.map((t, i) => ({
      slotId: `routine-${routine.id}#${i}`,
      slotIndex: i,
      time: t.slice(0, 5),
    }))
  }
  return [{
    slotId: `routine-${routine.id}`,
    slotIndex: null,
    time: routine.time_of_day ? routine.time_of_day.slice(0, 5) : null,
  }]
}
