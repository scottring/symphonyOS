import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SESSION_SPINE_PREAMBLE, WEEKLY_PLANNING_SCRIPT } from '../_shared/sessionScripts'
import { changeCardNote, changeSetFromInput, PROPOSE_CHANGES_TOOL, resolveRefs } from './changeSet'

const A = '0b8e7c1a-2d3f-4a5b-8c6d-7e8f9a0b1c2d'
const B = '4f1c2a9e-7b3d-4c11-9a0e-2f6b8d1e3c55'
const M = '9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d'

describe('changeSetFromInput', () => {
  it('keeps valid ops and gives each a stable key', () => {
    const r = changeSetFromInput({ title: '3 changes to your week', ops: [
      { op: 'place', task_id: A, date: '2026-10-15', time: '09:00' },
      { op: 'add', title: 'Hold for WSWMD', date: '2026-10-14', time: '13:00' },
      { op: 'someday', task_id: B },
    ] }, 'tu1')
    if ('error' in r) throw new Error(r.error)
    expect(r.set.key).toBe('tu1')
    expect(r.set.title).toBe('3 changes to your week')
    expect(r.set.ops.map((o) => [o.key, o.op])).toEqual([['tu1:0', 'place'], ['tu1:1', 'add'], ['tu1:2', 'someday']])
    expect(r.set.ops[0]).toMatchObject({ taskId: A, date: '2026-10-15', time: '09:00' })
    expect(r.set.ops[1]).toMatchObject({ title: 'Hold for WSWMD', date: '2026-10-14', time: '13:00' })
  })

  it('refuses bad ops instead of guessing', () => {
    expect('error' in changeSetFromInput({ ops: [] }, 'k')).toBe(true)
    expect('error' in changeSetFromInput({ ops: [{ op: 'delete', task_id: A }] }, 'k')).toBe(true)
    expect('error' in changeSetFromInput({ ops: [{ op: 'place', task_id: 'nope', date: '2026-10-15' }] }, 'k')).toBe(true)
    expect('error' in changeSetFromInput({ ops: [{ op: 'place', task_id: A, date: '2026-02-30' }] }, 'k')).toBe(true)
    expect('error' in changeSetFromInput({ ops: [{ op: 'place', task_id: A, date: '2026-10-15', time: '25:00' }] }, 'k')).toBe(true)
    expect('error' in changeSetFromInput({ ops: [{ op: 'add', title: '  ' }] }, 'k')).toBe(true)
    expect('error' in changeSetFromInput({ ops: [{ op: 'assign', task_id: A }] }, 'k')).toBe(true)
    const many = Array.from({ length: 41 }, () => ({ op: 'someday', task_id: A }))
    expect('error' in changeSetFromInput({ ops: many }, 'k')).toBe(true)
  })

  it('refuses two ops on the same task, and says to send one op per task', () => {
    const r = changeSetFromInput({ ops: [
      { op: 'place', task_id: A, date: '2026-10-15' },
      { op: 'assign', task_id: A, assignee: M },
    ] }, 'k')
    expect(r).toEqual({ error: expect.stringContaining('one op per task') })
  })

  it('refuses an add with a time but no date', () => {
    const r = changeSetFromInput({ ops: [{ op: 'add', title: 'Call the bank', time: '09:00' }] }, 'k')
    expect(r).toEqual({ error: expect.stringContaining('needs a date') })
  })

  it('keeps the week being planned, for adds with no date', () => {
    const r = changeSetFromInput({ week_start: '2026-10-17', ops: [{ op: 'add', title: 'Call the bank' }] }, 'k')
    if ('error' in r) throw new Error(r.error)
    expect(r.set.weekStart).toBe('2026-10-17')
    expect('error' in changeSetFromInput({ week_start: '2026-02-30', ops: [{ op: 'add', title: 'x' }] }, 'k')).toBe(true)
    const none = changeSetFromInput({ ops: [{ op: 'add', title: 'x' }] }, 'k')
    if ('error' in none) throw new Error(none.error)
    expect(none.set.weekStart).toBeUndefined()
  })

  it('defaults the title to the count', () => {
    const r = changeSetFromInput({ ops: [{ op: 'someday', task_id: A }, { op: 'unplace', task_id: B }] }, 'k')
    if ('error' in r) throw new Error(r.error)
    expect(r.set.title).toBe('2 changes')
  })
})

describe('resolveRefs', () => {
  const base = changeSetFromInput({ ops: [
    { op: 'place', task_id: A, date: '2026-10-15' },
    { op: 'assign', task_id: B, assignee: M },
  ] }, 'k')
  if ('error' in base) throw new Error(base.error)

  it('fills titles, what Symphony saw, and names', () => {
    const r = resolveRefs(base.set,
      [{ id: A, title: 'Reply to Christian', updated_at: '2026-10-14T07:00:00.123456+00:00', completed: false },
       { id: B, title: 'Kids clean rooms', updated_at: '2026-10-13T20:00:00+00:00', completed: false }],
      [{ id: M, name: 'Ella' }])
    if ('error' in r) throw new Error(r.error)
    expect(r.set.ops[0]).toMatchObject({ title: 'Reply to Christian', seen: '2026-10-14T07:00:00.123456+00:00' })
    expect(r.set.ops[1]).toMatchObject({ title: 'Kids clean rooms', assigneeName: 'Ella' })
  })

  it('refuses a task the person cannot see, a finished task, or an unknown person', () => {
    expect('error' in resolveRefs(base.set, [{ id: B, title: 'x', updated_at: 'x', completed: false }], [{ id: M, name: 'Ella' }])).toBe(true)
    expect('error' in resolveRefs(base.set,
      [{ id: A, title: 'a', updated_at: 'x', completed: true }, { id: B, title: 'b', updated_at: 'x', completed: false }],
      [{ id: M, name: 'Ella' }])).toBe(true)
    expect('error' in resolveRefs(base.set,
      [{ id: A, title: 'a', updated_at: 'x', completed: false }, { id: B, title: 'b', updated_at: 'x', completed: false }],
      [])).toBe(true)
  })
})

const R = 'c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e6f'
const R2 = 'd4e5f6a7-b8c9-4d0e-9f1a-2b3c4d5e6f70'
const STEP = 'e5f6a7b8-c9d0-4e1f-8a2b-3c4d5e6f7081'
const M2 = '1b2c3d4e-5f6a-4b7c-9d8e-0f1a2b3c4d5e'
const parse = (ops: Record<string, unknown>[]) => changeSetFromInput({ ops }, 'k')
const ok = (ops: Record<string, unknown>[]) => {
  const r = parse(ops)
  if ('error' in r) throw new Error(r.error)
  return r.set.ops
}
const err = (ops: Record<string, unknown>[]) => {
  const r = parse(ops)
  return 'error' in r ? r.error : null
}

describe('task ops: done, merge, talk', () => {
  it('keeps done, merge and talk', () => {
    const [done, merge, talk] = ok([
      { op: 'done', task_id: A },
      { op: 'merge', task_id: B, from_task_id: '7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f' },
      { op: 'talk', task_id: '8d2e3f4a-5b6c-4d7e-9f8a-0b1c2d3e4f5a', note: '  with Iris ' },
    ])
    expect(done).toMatchObject({ op: 'done', taskId: A })
    expect(merge).toMatchObject({ op: 'merge', taskId: B, fromTaskId: '7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f' })
    expect(talk).toMatchObject({ op: 'talk', note: 'with Iris' })
    expect(ok([{ op: 'talk', task_id: A }])[0].note).toBeUndefined()
  })
  it('refuses a merge without a second task, or with the same task twice', () => {
    expect(err([{ op: 'merge', task_id: A }])).toContain('from_task_id')
    expect(err([{ op: 'merge', task_id: A, from_task_id: A }])).toContain('two different tasks')
  })
  it('counts a merge for both of its tasks', () => {
    expect(err([{ op: 'merge', task_id: A, from_task_id: B }, { op: 'done', task_id: B }])).toContain('one op per task')
    expect(err([{ op: 'someday', task_id: B }, { op: 'merge', task_id: A, from_task_id: B }])).toContain('one op per task')
  })
  it('refuses a talk note that is not one short line', () => {
    expect(err([{ op: 'talk', task_id: A, note: 'x'.repeat(121) }])).toContain('120')
    expect(err([{ op: 'talk', task_id: A, note: 7 }])).toContain('note')
  })
})

describe('routine ops: this week only', () => {
  it('keeps skip, move and who on one day', () => {
    const [skip, move, who] = ok([
      { op: 'routine_skip', routine_id: R, date: '2026-10-16' },
      { op: 'routine_move', routine_id: R, date: '2026-10-15', to_date: '2026-10-16', time: '16:00' },
      { op: 'routine_who', routine_id: R2, date: '2026-10-15', assignee: M },
    ])
    expect(skip).toMatchObject({ op: 'routine_skip', routineId: R, date: '2026-10-16' })
    expect(skip.taskId).toBeUndefined()
    expect(move).toMatchObject({ routineId: R, date: '2026-10-15', toDate: '2026-10-16', time: '16:00' })
    expect(who).toMatchObject({ routineId: R2, date: '2026-10-15', assignee: M })
  })
  it('refuses bad fields', () => {
    expect(err([{ op: 'routine_skip', routine_id: 'bed', date: '2026-10-16' }])).toContain('routine_id')
    expect(err([{ op: 'routine_skip', routine_id: R }])).toContain('date')
    expect(err([{ op: 'routine_move', routine_id: R, date: '2026-10-15' }])).toContain('to_date')
    expect(err([{ op: 'routine_move', routine_id: R, date: '2026-10-15', to_date: '2026-10-16', time: '4pm' }])).toContain('HH:MM')
    expect(err([{ op: 'routine_move', routine_id: R, date: '2026-10-15', to_date: '2026-10-15' }])).toContain('new time')
    expect(err([{ op: 'routine_who', routine_id: R, date: '2026-10-15' }])).toContain('assignee')
  })
  it('allows one op per routine and day', () => {
    expect(err([
      { op: 'routine_skip', routine_id: R, date: '2026-10-16' },
      { op: 'routine_who', routine_id: R, date: '2026-10-16', assignee: M },
    ])).toContain('one op per routine and day')
  })
})

describe('routine ops: from now on', () => {
  it('keeps a change with any of name, time, days and assignees', () => {
    const [c] = ok([{ op: 'routine_change', routine_id: R, name: ' Tuesday run ', time: '08:30', days: ['tue', 'sun', 'tue'], assignees: [M, M] }])
    expect(c).toMatchObject({ op: 'routine_change', routineId: R, name: 'Tuesday run', time: '08:30', days: ['sun', 'tue'], assignees: [M] })
    expect(c.clearTime).toBeUndefined()
  })
  it('reads time null as any time of day, and an empty assignees list as no one', () => {
    const [c] = ok([{ op: 'routine_change', routine_id: R, time: null, assignees: [] }])
    expect(c).toMatchObject({ clearTime: true, assignees: [] })
    expect(c.time).toBeUndefined()
  })
  it('refuses a change that changes nothing, or bad fields', () => {
    expect(err([{ op: 'routine_change', routine_id: R }])).toContain('at least one of')
    expect(err([{ op: 'routine_change', routine_id: R, days: [] }])).toContain('days')
    expect(err([{ op: 'routine_change', routine_id: R, days: ['monday'] }])).toContain('days')
    expect(err([{ op: 'routine_change', routine_id: R, time: '8:30' }])).toContain('HH:MM')
    expect(err([{ op: 'routine_change', routine_id: R, name: '  ' }])).toContain('name')
    expect(err([{ op: 'routine_change', routine_id: R, assignees: ['Iris'] }])).toContain('assignees')
  })
  it('keeps a rest, with or without until', () => {
    const [a, b] = ok([{ op: 'routine_rest', routine_id: R, until: '2026-11-01' }, { op: 'routine_rest', routine_id: R2 }])
    expect(a).toMatchObject({ op: 'routine_rest', routineId: R, until: '2026-11-01' })
    expect(b.until).toBeUndefined()
    expect(err([{ op: 'routine_rest', routine_id: R, until: '2026-11-31' }])).toContain('until')
  })
  it('keeps a new routine, family unless told otherwise', () => {
    const [n, w] = ok([
      { op: 'routine_add', name: 'Reading time', days: ['sun', 'mon', 'tue', 'wed', 'thu'], time: '19:00', assignees: [M] },
      { op: 'routine_add', name: 'Inbox zero', context: 'work' },
    ])
    expect(n).toMatchObject({ op: 'routine_add', title: 'Reading time', days: ['sun', 'mon', 'tue', 'wed', 'thu'], time: '19:00', assignees: [M], context: 'family' })
    expect(n.routineId).toBeUndefined()
    expect(w).toMatchObject({ title: 'Inbox zero', context: 'work' })
    expect(err([{ op: 'routine_add', days: ['mon'] }])).toContain('name')
    expect(err([{ op: 'routine_add', name: 'x', context: 'school' }])).toContain('context')
  })
  it('allows one lasting op per routine, alongside its this-week ops', () => {
    expect(err([
      { op: 'routine_change', routine_id: R, time: '08:30' },
      { op: 'routine_rest', routine_id: R },
    ])).toContain('one routine_change')
    expect(ok([
      { op: 'routine_change', routine_id: R, time: '08:30' },
      { op: 'routine_skip', routine_id: R, date: '2026-10-16' },
    ])).toHaveLength(2)
  })
  it('names every op in an unknown-op error', () => {
    expect(err([{ op: 'routine_delete', routine_id: R }])).toContain('routine_rest')
  })
})

describe('resolveRefs: new ops', () => {
  const tasks = [
    { id: A, title: 'Call Molly about the Buick', updated_at: 't-a', completed: false },
    { id: B, title: 'Call Molly', updated_at: 't-b', completed: false },
  ]
  const members = [{ id: M, name: 'Iris' }, { id: M2, name: 'Scott' }]
  const routines = [
    { id: R, name: 'Monday run', updated_at: 'r-1', parent_routine_id: null },
    { id: R2, name: 'FFG pickup', updated_at: 'r-2', parent_routine_id: null },
    { id: STEP, name: 'Brush teeth', updated_at: 'r-3', parent_routine_id: R2 },
  ]
  const resolve = (ops: Record<string, unknown>[], t = tasks, r = routines) => {
    const p = parse(ops)
    if ('error' in p) throw new Error(p.error)
    return resolveRefs(p.set, t, members, r)
  }
  it('fills both halves of a merge', () => {
    const r = resolve([{ op: 'merge', task_id: A, from_task_id: B }])
    if ('error' in r) throw new Error(r.error)
    expect(r.set.ops[0]).toMatchObject({ title: 'Call Molly about the Buick', seen: 't-a', fromTaskId: B, fromTitle: 'Call Molly', fromSeen: 't-b' })
  })
  it('refuses a merge from a finished or unseen task', () => {
    expect(resolve([{ op: 'merge', task_id: A, from_task_id: B }], [tasks[0], { ...tasks[1], completed: true }])).toEqual({ error: expect.stringContaining('already done') })
    expect(resolve([{ op: 'merge', task_id: A, from_task_id: B }], [tasks[0]])).toEqual({ error: expect.stringContaining(`No task ${B}`) })
  })
  it('names the routine, and keeps what Symphony saw only for lasting ops', () => {
    const r = resolve([
      { op: 'routine_skip', routine_id: R, date: '2026-10-16' },
      { op: 'routine_change', routine_id: R, days: ['tue'], assignees: [M2, M] },
      { op: 'routine_who', routine_id: R2, date: '2026-10-15', assignee: M },
      { op: 'routine_rest', routine_id: R2 },
      { op: 'routine_add', name: 'Reading time', assignees: [M] },
    ])
    if ('error' in r) throw new Error(r.error)
    const [skip, change, who, rest, add] = r.set.ops
    expect(skip).toMatchObject({ title: 'Monday run' })
    expect(skip.seen).toBeUndefined()
    expect(change).toMatchObject({ title: 'Monday run', seen: 'r-1', assigneeNames: ['Scott', 'Iris'] })
    expect(who).toMatchObject({ title: 'FFG pickup', assigneeName: 'Iris' })
    expect(who.seen).toBeUndefined()
    expect(rest).toMatchObject({ title: 'FFG pickup', seen: 'r-2' })
    expect(add).toMatchObject({ title: 'Reading time', assigneeNames: ['Iris'] })
  })
  it('refuses a routine the person cannot see, a step, or an unknown person', () => {
    expect(resolve([{ op: 'routine_skip', routine_id: R, date: '2026-10-16' }], tasks, [])).toEqual({ error: expect.stringContaining(`No routine ${R}`) })
    expect(resolve([{ op: 'routine_rest', routine_id: STEP }])).toEqual({ error: '"Brush teeth" is a step of another routine; change the routine itself' })
    const stranger = '2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f'
    expect(resolve([{ op: 'routine_who', routine_id: R, date: '2026-10-15', assignee: stranger }])).toEqual({ error: expect.stringContaining(`No household member ${stranger}`) })
    expect(resolve([{ op: 'routine_change', routine_id: R, assignees: [M, stranger] }])).toEqual({ error: expect.stringContaining(`No household member ${stranger}`) })
  })
})

describe('changeCardNote', () => {
  it('says the last card was approved and its changes are saved', () => {
    const note = changeCardNote({ state: 'approved', title: '2 changes', ops: [{ op: 'someday', title: 'Paper mail', where: '→ Someday' }], at: '2026-10-14T09:00:00Z' })
    expect(note).toContain('approved')
    expect(note).toContain('Paper mail')
    expect(note).toContain('untrusted data')
  })
  it('drops anything malformed', () => {
    expect(changeCardNote(undefined)).toBe('')
    expect(changeCardNote({ state: 'deleted', title: 'x', ops: [] })).toBe('')
    expect(changeCardNote('approved')).toBe('')
  })
})

describe('agent wiring', () => {
  const src = readFileSync('supabase/functions/symphony-agent/index.ts', 'utf8')
  it('offers the tool and streams one change_set', () => {
    expect(src).toMatch(/PROPOSE_CHANGES_TOOL,/)
    expect(src).toMatch(/send\(\{ type: 'change_set', set: resolved\.set \}\)/)
  })
  it('tells the model to propose, not write, when several items change', () => {
    expect(src).toContain('MORE THAN ONE task')
    expect(src).toContain('symphony_propose_changes')
  })
  it('does a clear single change directly and asks one question when ambiguous', () => {
    expect(src).toContain('A clear, reversible change to ONE item')
    expect(src).toContain('ask ONE short question')
    expect(src).toContain('Just this week, or from now on?')
  })
  it('runs Plan my day and Review my day as talks that end in one card (Today stage)', () => {
    expect(src).toContain('- "Plan my day" (the Today page\'s morning chip): call symphony_read_week')
    expect(src).toContain('never invent a time they did not give')
    expect(src).toContain('- "Review my day" (the evening chip): call symphony_read_week')
    expect(src).toContain('done for what they finished')
    expect(src).toContain('No row-by-row questionnaire')
  })
  it('sends routine changes to the card, this week or from now on, and never deletes one', () => {
    expect(src).not.toContain('Routines have no preview yet')
    expect(src).toContain('A routine change ends in symphony_propose_changes.')
    expect(src).toContain('A named day, "tomorrow" or "this week" means this week only: routine_skip, routine_move or routine_who')
    expect(src).toContain('"From now on", "every week", "anymore" or "always" means a lasting change: routine_change, routine_rest or routine_add')
    expect(src).toContain('Otherwise ask exactly one question: "Just this week, or from now on?"')
    expect(src).toContain('Say the change back plainly')
    expect(src).toContain('stopping a routine is routine_rest')
    expect(src).toContain('Splitting one routine into two (different times on different days) is not an op: say so and offer the nearest change.')
  })
  it('puts done, merge and talk on the card when several things change', () => {
    expect(src).toContain('When several things change, these go on the card with the rest: done (mark a task finished), merge (two tasks that are the same thing')
    expect(src).toContain('A single clear done can still be done directly.')
  })
  it('resolves routines and merged tasks through the same RLS client', () => {
    expect(src).toContain("tdb.from('routines').select('id, name, updated_at, parent_routine_id').in('id', routineIds)")
    expect(src).toMatch(/resolveRefs\(parsed\.set, tasksRead\.data \?\? \[\], membersRead\.data \?\? \[\], routinesRead\.data \?\? \[\]\)/)
    expect(src).toContain('[o.taskId, o.fromTaskId]')
  })
  it("reads this week's routine exceptions for read_week", () => {
    expect(src).toContain("db.from('actionable_instances').select('entity_id, date, status, deferred_to, assigned_to_override')")
    expect(src).toContain("assigned_to_all, visibility, paused_until')")
  })
  it('documents every op in the tool', () => {
    const schema = JSON.stringify(PROPOSE_CHANGES_TOOL.input_schema)
    for (const op of ['done', 'merge', 'talk', 'routine_skip', 'routine_move', 'routine_who', 'routine_change', 'routine_rest', 'routine_add']) {
      expect(schema).toContain(`"${op}"`)
      expect(PROPOSE_CHANGES_TOOL.description).toContain(op)
    }
    for (const field of ['from_task_id', 'note', 'routine_id', 'to_date', 'days', 'assignees', 'until', 'context', 'name']) expect(schema).toContain(`"${field}"`)
  })
  it('reads what became of the last card, and never re-proposes saved or dismissed changes', () => {
    expect(src).toMatch(/changeCardNote\(body\.changeCard\)/)
    expect(src).toContain('If the page says the last change card was approved, its changes are saved: the next list holds only what is still unsaved. If it was dismissed, do not re-propose those changes unless asked.')
  })
  it('plans the week the message names, and sends that week with the card', () => {
    expect(src).toContain('the week the message names ("Plan the week of Oct 17"')
    expect(src).toContain('week_start set to the start symphony_read_week returned')
    expect(JSON.stringify(PROPOSE_CHANGES_TOOL.input_schema)).toContain('week_start')
  })
  // Final review 2026-10-14 #6: three older rules contradicted the card.
  it('writes an explicit request directly only when it is ONE item', () => {
    expect(src).not.toContain('When the person says what they want ("add X", "my goals are A and B", "book a consultation"), do it with the write tools')
    expect(src).toContain('When the person says what they want for ONE item')
    expect(src).toContain('Several tasks at once go on the change card')
  })
  it('prepares a task to act on only once it is saved, never while it waits on a card', () => {
    expect(src).toContain('only for a task that is saved: after the person approves the card, or after a one-item change.')
    expect(src).toContain('Approve refuses the card')
  })
  it('goes across the horizons only when planning Month, Season or Year', () => {
    expect(src).not.toContain('then one combined week of tasks')
    expect(src).toContain('Planning a month, season or year goes across, not down')
  })
  it('proposes early and revises after each answer while planning', () => {
    expect(src).toContain('as soon as one answer settles a change')
    expect(PROPOSE_CHANGES_TOOL.description).toContain('call it again with the whole list so far')
  })
  // Task 25: one session script shared with the voice.
  it('carries the shared session spine, hard rules and everyday manner', () => {
    for (const name of ['SESSION_SPINE_PREAMBLE', 'HARD_RULES', 'WEEKLY_PLANNING_SCRIPT', 'EVERYDAY_TALK_RULES', 'MONTH_SEASON_YEAR_NOTE']) {
      expect(src).toContain('${' + name + '}')
    }
    expect(src).toContain("from '../_shared/sessionScripts.ts'")
    expect(src).toContain('Everyday talk:')
    expect(src).toContain('${WEEKLY_PLANNING_SCRIPT}\n\nOther planning rules:\n- When the person says what they want for ONE item')
    // the interpolated strings themselves
    expect(SESSION_SPINE_PREAMBLE).toContain('Sessions follow a spine, not a script')
    expect(WEEKLY_PLANNING_SCRIPT).toContain("Let's plan the week of")
  })
  // Task 25 add-on: three older lines competed with the card.
  it('writes linked week work directly only for ONE stated week task', () => {
    expect(src).not.toContain('Create linked weekly work with symphony_create_plan_item and parent_id, then schedule that same ID.')
    expect(src).toContain('For ONE week task the person states, create it with symphony_create_plan_item and parent_id, then schedule that same ID.')
    expect(src).toContain('use symphony_propose_changes add with goal_id')
  })
  it('sends week-level suggestions through the card, plan items only for goals and links', () => {
    expect(src).not.toContain('(a missing month goal, a week task), offer it with symphony_propose_plan_items')
    expect(src).toContain('offer a missing month, season or year goal, or a goal link, with symphony_propose_plan_items')
    expect(src).toContain('offer a week task on the change card with symphony_propose_changes')
  })
  it('scopes across-the-horizon planning in the workspace prefix to Month, Season and Year', () => {
    expect(src).not.toContain('Full planning proceeds across all items at each horizon before moving down;')
    expect(src).toContain('When planning a Month, Season or Year, proceed across all items at each horizon before moving down')
    expect(src).not.toContain('Ask one natural question at a time;')
    expect(src).toContain('Ask one question at a time;')
  })
})
