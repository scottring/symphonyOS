import type { MedicationLog } from '@/types/medication'

export interface SlotMatch {
  slot: string // "HH:MM"
  log: MedicationLog | null
}

export interface MatchResult {
  slots: SlotMatch[]
  extras: MedicationLog[]
}

// Build a Date for `HH:MM` on the same local day as `day`.
function slotDate(day: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number)
  const d = new Date(day)
  d.setHours(h, m, 0, 0)
  return d
}

/**
 * Match each log to the nearest schedule slot within `windowMin` minutes.
 * Greedy by absolute distance; each slot and each log used at most once.
 * Unmatched logs become `extras`. Display-only — logs never store a slot.
 */
export function matchLogsToSlots(
  scheduleTimes: string[],
  logs: MedicationLog[],
  day: Date,
  windowMin = 90,
): MatchResult {
  const slots: SlotMatch[] = scheduleTimes.map((slot) => ({ slot, log: null }))
  const windowMs = windowMin * 60_000
  const used = new Set<string>()

  // Candidate (slotIndex, log, distance) triples within the window, closest first.
  const pairs: { si: number; log: MedicationLog; dist: number }[] = []
  slots.forEach((s, si) => {
    const target = slotDate(day, s.slot).getTime()
    for (const l of logs) {
      const dist = Math.abs(l.takenAt.getTime() - target)
      if (dist <= windowMs) pairs.push({ si, log: l, dist })
    }
  })
  pairs.sort((a, b) => a.dist - b.dist)

  for (const p of pairs) {
    if (slots[p.si].log !== null) continue
    if (used.has(p.log.id)) continue
    slots[p.si].log = p.log
    used.add(p.log.id)
  }

  const extras = logs.filter((l) => !used.has(l.id))
  return { slots, extras }
}
