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
    expect(src).toContain('Routines have no preview yet')
    expect(src).toContain('Just this week, or from now on?')
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
