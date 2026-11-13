import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// The assistant fell weeks behind the app (AI audit, 2026-11-11): task status,
// owed to, needed on, the Week list order and four routine switches shipped
// without the assistant learning any of them, and on 11/9 it told Scott the
// week list had no manual sort. This test lists every column the app's task
// and routine writers set, and fails when one is neither used by the
// assistant nor listed below with a reason. Adding a field to the app now
// means deciding, in this file, whether Symphony can talk about it.

/** Columns the assistant deliberately does not read or write, and why.
 *  "gap" entries are known catch-up work, not decisions to keep. */
const NOT_FOR_AI: Record<string, string> = {
  // tasks
  deferred_until: 'internal: snooze bookkeeping the app sets with a push',
  week_deferred_at: 'internal: when a week task was pushed, for the review deck',
  weekend_start: 'internal: weekend fold window',
  group_members: 'internal: Today grouping, set by drag',
  is_fun: 'gap: the "for fun" mark on a task',
  due_on: 'gap (2026-11-13): the done-by date ("return by Mon 16"); teach the assistant when the Today facelift ships, as that needs an edge-function deploy',
  is_someday: 'internal: legacy flag; someday is a change-card op',
  link_type: 'internal: what a linked activity is',
  linked_activity_id: 'internal: link to a routine or event the task came from',
  linked_activity_type: 'internal: same',
  linked_event_id: 'internal: same',
  location_place_id: 'internal: Places id behind a typed location',
  picked_at: 'internal: when the day session picked it',
  planned_on: 'gap: "plan for today" from the week sheet (the agent schedules instead)',
  supports_goal_task_id: 'gap: "Part of…" goal link for a task (the agent links with source_id)',
  // routines
  default_assignee: 'internal: legacy instance generation',
  followup_task_templates: 'gap: follow-up tasks a routine creates',
  prep_task_templates: 'gap: prep tasks a routine creates',
  raw_input: 'internal: the words a routine was typed from',
  target_amount: 'gap: a kid routine\'s target (minutes, pages)',
  target_unit: 'gap: same',
}

const read = (p: string) => readFileSync(p, 'utf8')
const columns = (src: string, re: RegExp) => [...new Set([...src.matchAll(re)].map((m) => m[1]))]

function agentSource(): string {
  const dirs = ['supabase/functions/symphony-agent', 'supabase/functions/_shared/context-graph']
  return dirs.flatMap((d) => readdirSync(d).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts')).map((f) => read(join(d, f)))).join('\n')
}

describe('assistant keeps up with the app (AI audit 2026-11-11)', () => {
  const agent = agentSource()
  const taskCols = columns(read('src/hooks/useSupabaseTasks.ts'), /dbUpdates\.([a-z_]+) =/g)
  const routineCols = columns(read('src/hooks/useRoutines.ts'), /\bupdates\.([a-z_]+) = input/g)

  it('finds the app writers (guards the regexes)', () => {
    expect(taskCols).toEqual(expect.arrayContaining(['title', 'scheduled_for', 'owed_to', 'sort_order']))
    expect(routineCols).toEqual(expect.arrayContaining(['name', 'show_on_week', 'background']))
  })

  it('every column the app writes is used by the assistant or listed with a reason', () => {
    const missing = [...taskCols.map((c) => `tasks.${c}`), ...routineCols.map((c) => `routines.${c}`)]
      .filter((qualified) => {
        const col = qualified.split('.')[1]
        return !new RegExp(`\\b${col}\\b`).test(agent) && !(col in NOT_FOR_AI)
      })
    expect(missing, 'Teach symphony-agent this field, or add it to NOT_FOR_AI with a reason').toEqual([])
  })

  it('NOT_FOR_AI holds no stale entries', () => {
    const stale = Object.keys(NOT_FOR_AI).filter((c) => new RegExp(`\\b${c}\\b`).test(agent) || (!taskCols.includes(c) && !routineCols.includes(c)))
    expect(stale, 'The assistant uses these now, or the app no longer writes them: remove them').toEqual([])
  })
})
