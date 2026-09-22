// src/lib/planning/goalsReference.ts
//
// The ◎ Goals reference: what the year, the season and the month are for,
// read straight off the same sources the three planning pages read. Pure and
// read-only — the sheet built on this never writes, and it carries no counts.

import type { Task } from '@/types/task'
import type { Goal } from '@/types/goal'
import type { Seasons } from '@/lib/cadence/seasons'
import type { Layer } from '@/lib/domains'
import { filterTasksForLayers, matchesLayers } from '@/lib/today/domainFilter'
import { periodBounds, selectPeriodTasks } from './periodPage'

export interface RefRow {
  id: string
  title: string
  /** One quiet line of intent — a goal's strategy, or the first line of its notes. */
  note?: string
}

export interface RefSection {
  label: string
  /** The page that owns these rows; the sheet only ever links here. */
  to: string
  rows: RefRow[]
}

export interface GoalsReference {
  year: RefSection
  season: RefSection
  month: RefSection
}

export interface GoalsReferenceInput {
  goals: readonly Goal[]
  tasks: readonly Task[]
  now: Date
  seasons: Seasons
  meId: string | null
  layers: ReadonlySet<Layer>
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** The first line of a note, as one quiet line of intent. Notes render
 *  markdown: a HEADING is structure rather than intent ("## Why" is a label
 *  for the sentence under it), so headings are skipped and the first real
 *  line wins. Bullet and number markers come off the line they lead.
 *  Anything long is left for the row's own page. */
export function firstNoteLine(notes: string | undefined): string | undefined {
  if (!notes) return undefined
  for (const raw of notes.split(/\r?\n/)) {
    const bare = raw.replace(/<[^>]*>/g, '').trim()
    if (!bare || /^#{1,6}\s/.test(bare)) continue
    const line = bare.replace(/^\s*([-*+]|\d+\.)\s*/, '').trim()
    if (line) return line.length > 120 ? `${line.slice(0, 119)}…` : line
  }
  return undefined
}

function periodSection(
  level: 'season' | 'month',
  { tasks, now, seasons, meId, layers }: GoalsReferenceInput,
): RefSection {
  const bounds = periodBounds(level, now, seasons)
  const layered = filterTasksForLayers(tasks as Task[], layers)
  const rows = selectPeriodTasks(layered, level, bounds.start, true, meId, seasons)
    .filter((t) => t.isGoal && !t.completed)
    .map((t) => ({ id: t.id, title: t.title, note: firstNoteLine(t.notes) }))
  return {
    label: level === 'month' ? MONTHS[bounds.start.getMonth()] : bounds.label,
    to: `/${level}`,
    rows,
  }
}

export function goalsReference(input: GoalsReferenceInput): GoalsReference {
  const { goals, now, layers } = input
  const year = now.getFullYear()
  return {
    year: {
      label: String(year),
      to: '/year',
      rows: goals
        .filter((g) => g.year === year && g.status === 'active' && matchesLayers(g.context, layers))
        .map((g) => ({ id: g.id, title: g.name, note: g.strategy?.trim() || firstNoteLine(g.notes) })),
    },
    season: periodSection('season', input),
    month: periodSection('month', input),
  }
}
