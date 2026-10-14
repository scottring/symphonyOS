// src/components/routine/picture/routinesPreview.ts
//
// A pending change card, drawn dashed on the Routines picture (frames "This
// week" and "From now on"): new slots dashed teal, slots leaving dashed grey.
// Pure; nothing here writes.
//
//   routine_skip    that day's occurrence, struck through, dashed teal
//   routine_move    leaves its day (grey); appears on the new day (teal)
//   routine_who     that day's occurrence, dashed teal, with the new person
//   routine_change  every slot it has now goes grey; the new ones are teal on
//                   every day they land (new days, new time, new name)
//   routine_rest    its slots go grey
//   routine_add     teal on its days
//
// A routine written once on a line (Every day, Each month, No day yet) is
// marked on that line rather than in seven cells.

import type { ChangeOp, ChangeSet, DayKey } from '@/lib/canvas/changeCard'
import type { Routine } from '@/types/actionable'
import { localYmd } from '@/lib/cadence/config'
import { routineOwners } from '@/lib/routineUtils'
import { cadenceHint, cadenceOf, dayKeyOf, type Cadence, type Chip, type Occurrence } from './routinesPicture'

export interface PicturePreview {
  occurrences: Occurrence[]
  /** Routines whose chip on a line goes grey. */
  lineMarks: Map<string, 'leaving'>
  newChips: { line: 'everyDay' | 'lessOften' | 'noDay'; chip: Chip }[]
}

export interface PreviewArgs {
  occurrences: Occurrence[]
  set: ChangeSet | null
  days: Date[]
  routines: ReadonlyMap<string, Routine>
  stepCounts: ReadonlyMap<string, number>
}

const at = (day: Date, hhmm: string | null | undefined): Date | null => {
  if (!hhmm) return null
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m || 0)
}
const shortDay = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short' })
}

/** The weekly day keys a routine's pattern names now (all seven for daily). */
function patternDays(r: Routine): DayKey[] | null {
  const p = r.recurrence_pattern
  if (p.type === 'daily' && (p.interval ?? 1) <= 1) return ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  if (p.type === 'weekly') return (p.days ?? []).map((d) => d.slice(0, 3).toLowerCase() as DayKey)
  return null
}

export function previewPicture({ occurrences, set, days, routines, stepCounts }: PreviewArgs): PicturePreview {
  const lineMarks = new Map<string, 'leaving'>()
  const newChips: PicturePreview['newChips'] = []
  if (!set?.ops.length) return { occurrences, lineMarks, newChips }
  const keys = days.map(localYmd)
  const changed = new Map<string, Partial<Occurrence>>()
  const added: Occurrence[] = []
  const find = (routineId: string, dayKey: string) => occurrences.find((o) => o.routineId === routineId && o.dayKey === dayKey)
  const leave = (o: Occurrence, note?: string) => changed.set(o.key, { preview: 'leaving', ...(note ? { previewNote: note } : {}) })

  // New slots for a routine as it would be: on each of the week's days its
  // days name, or on a line when it has every day or none.
  const place = (op: ChangeOp, r: Routine | undefined, cad: Cadence, onDays: DayKey[] | null, sameDaysAs: string[]) => {
    const title = op.op === 'routine_add' ? op.title : (op.name ?? r?.name ?? op.title)
    const time = op.clearTime ? null : (op.time ?? r?.time_of_day ?? null)
    const people = op.assignees ?? (r ? routineOwners(r) : [])
    const steps = r ? stepCounts.get(r.id) ?? 0 : 0
    const routineId = r?.id ?? `new:${op.key}`
    if (cad === 'every-day' || cad === 'no-day' || (cad === 'less-often' && !sameDaysAs.length)) {
      const line = cad === 'every-day' ? 'everyDay' : cad === 'no-day' ? 'noDay' : 'lessOften'
      newChips.push({ line, chip: {
        key: `p:${op.key}`, routineId, title, time: at(new Date(2000, 0, 1), time), people, steps, preview: 'proposed',
        ...(cad === 'less-often' && r ? { hint: cadenceHint(r.recurrence_pattern) } : {}),
      } })
      return
    }
    days.forEach((day, i) => {
      const dayKey = keys[i]
      const lands = onDays ? onDays.includes(dayKeyOf(day)) : sameDaysAs.includes(dayKey)
      if (!lands) return
      added.push({
        key: `p:${op.key}:${dayKey}`, routineId, dayKey, title, time: at(day, time), people, steps,
        everyDay: false, preview: 'proposed',
      })
    })
  }

  for (const op of set.ops) {
    const r = op.routineId ? routines.get(op.routineId) : undefined
    switch (op.op) {
      case 'routine_skip': {
        const o = op.routineId && op.date ? find(op.routineId, op.date) : undefined
        if (o) changed.set(o.key, { preview: 'proposed', struck: true, previewNote: 'Skipped · this week' })
        break
      }
      case 'routine_who': {
        const o = op.routineId && op.date ? find(op.routineId, op.date) : undefined
        if (o) changed.set(o.key, { preview: 'proposed', people: op.assignee ? [op.assignee] : [], previewNote: `${op.assigneeName ?? 'Someone else'} · this week` })
        break
      }
      case 'routine_move': {
        if (!op.routineId || !op.date || !op.toDate) break
        const o = find(op.routineId, op.date)
        if (o) leave(o, 'Moving · this week')
        const i = keys.indexOf(op.toDate)
        if (i < 0) break
        const time = op.time ? at(days[i], op.time) : o?.time ? at(days[i], `${o.time.getHours()}:${o.time.getMinutes()}`) : null
        added.push({
          key: `p:${op.key}`, routineId: op.routineId, dayKey: op.toDate, title: o?.title ?? op.title, time,
          people: o?.people ?? (r ? routineOwners(r) : []), steps: o?.steps ?? 0, everyDay: false,
          preview: 'proposed', previewNote: `From ${shortDay(op.date)} · this week`,
        })
        break
      }
      case 'routine_rest': {
        if (!op.routineId) break
        const note = op.until ? `Resting until ${new Date(`${op.until}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : 'Resting'
        if (r && cadenceOf(r.recurrence_pattern) !== 'weekly') lineMarks.set(op.routineId, 'leaving')
        if (!r || cadenceOf(r.recurrence_pattern) !== 'every-day') {
          for (const o of occurrences) if (o.routineId === op.routineId) leave(o, note)
        }
        break
      }
      case 'routine_change': {
        if (!op.routineId || !r) break
        const oldCad = cadenceOf(r.recurrence_pattern)
        const onDays = op.days ?? patternDays(r)
        const newCad: Cadence = op.days ? (op.days.length === 7 ? 'every-day' : op.days.length === 0 ? 'no-day' : 'weekly') : oldCad
        if (oldCad !== 'weekly') lineMarks.set(op.routineId, 'leaving')
        const mine = occurrences.filter((o) => o.routineId === op.routineId)
        // An every-day routine is written once on its line; its seven cells
        // stay quiet unless the new days put it in them.
        if (oldCad !== 'every-day') for (const o of mine) leave(o)
        place(op, r, newCad, op.days ?? (oldCad === 'weekly' ? onDays : null), mine.map((o) => o.dayKey))
        break
      }
      case 'routine_add': {
        const cad: Cadence = !op.days?.length ? 'no-day' : op.days.length === 7 ? 'every-day' : 'weekly'
        place(op, undefined, cad, op.days ?? null, [])
        break
      }
      default: break
    }
  }

  return {
    occurrences: [...occurrences.map((o) => (changed.has(o.key) ? { ...o, ...changed.get(o.key) } : o)), ...added],
    lineMarks, newChips,
  }
}

