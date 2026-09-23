import { describe, it, expect } from 'vitest'
import type { Analysis, Item } from '../../../supabase/functions/plan-from-paper/lib/plan'
import { buildSaveRows, defaultInclude, summarizeRows, targetFor, type SaveOptions } from './savePlan'
import { newImport, withAnalysis } from './importState'

// Neutral example pages: an Autumn season page and the October page taken from it.
const item = (over: Partial<Item> & Pick<Item, 'id' | 'kind' | 'original'>): Item => ({
  title: over.original, page: 1, source_lines: [], placement: { level: 'season', label: 'Autumn 2026', start: '2026-09-01' },
  date_text: null, date: null, relationships: [], flags: [], routine: null, why: null, ...over,
})

const analysis: Analysis = {
  summary: '',
  questions: [],
  pages: [
    { page: 1, image: 1, side: 'left', heading: 'Autumn', period: { level: 'season', label: 'Autumn 2026', start: '2026-09-01', end: '2026-11-30' },
      lines: [{ id: 'p1-l1', text: 'Plan the garden', uncertain: false, uncertainty: null, struck: false }] },
    { page: 2, image: 1, side: 'right', heading: 'October', period: { level: 'month', label: 'October 2026', start: '2026-10-01', end: '2026-10-31' },
      lines: [{ id: 'p2-l1', text: 'Draft garden plan', uncertain: true, uncertainty: 'second word', struck: true }] },
  ],
  items: [
    item({ id: 'y', kind: 'goal', original: 'Calmer mornings', placement: { level: 'year', label: '2026', start: '2026-01-01' } }),
    item({ id: 'g', kind: 'goal', original: 'Plan the garden', relationships: [{ type: 'supports', target_kind: 'year_goal', target_id: 'existing-year-goal', target_label: 'Home', reason: '' }] }),
    item({ id: 't', kind: 'task', original: 'Buy a rain barrel', relationships: [{ type: 'supports', target_kind: 'item', target_id: 'g', target_label: 'Plan the garden', reason: '' }] }),
    item({ id: 'm', kind: 'task', original: 'Draft garden plan', title: 'Draft the garden plan', page: 2, date_text: '10/16', date: '2026-10-16',
      placement: { level: 'month', label: 'October 2026', start: '2026-10-01' },
      relationships: [
        { type: 'derived_from', target_kind: 'item', target_id: 'g', target_label: 'Plan the garden', reason: 'carried down' },
        { type: 'supports', target_kind: 'item', target_id: 'y', target_label: 'Calmer mornings', reason: '' },
        { type: 'supports', target_kind: 'item', target_id: 'g', target_label: 'Plan the garden', reason: '' },
      ] }),
    item({ id: 'r', kind: 'routine', original: 'Plan weekly on Sunday nights', page: 2, placement: { level: 'month', label: 'October 2026', start: '2026-10-01' },
      routine: { cadence: 'weekly', time: 'Sunday night', who: null, steps: ['Look at the week'] } }),
    item({ id: 'n', kind: 'note', original: 'Ideas: bench, lights', placement: { level: 'none', label: '', start: null } }),
    item({ id: 'skip', kind: 'task', original: 'Book the piano tuner' }),
  ],
}

const opts: SaveOptions = {
  userId: 'user-1',
  domain: 'family',
  year: 2026,
  weekStart: '2026-09-21',
  include: { skip: false },
  rowIds: { y: 'row-y', g: 'row-g', t: 'row-t', m: 'row-m', r: 'row-r', n: 'row-n', skip: 'row-skip' },
  sourceNote: { id: 'row-source', title: 'Paper plan: Autumn · October' },
  images: [{ path: 'user-1/paper-plan/imp/photo-1.jpg', attachmentId: 'att-1', bytes: 1234 }],
  existingPeriodGoals: {},
  existing: { yearGoalIds: new Set(['existing-year-goal']), taskIds: new Set() },
}

describe('targetFor', () => {
  it('year goals go to goals; season/month goals are goal tasks on their list; a year task waits in Someday', () => {
    expect(targetFor({ kind: 'goal', placement: { level: 'year', label: '', start: null } })).toEqual({ table: 'goals' })
    expect(targetFor({ kind: 'goal', placement: { level: 'season', label: '', start: '2026-09-01' } })).toMatchObject({ table: 'tasks', bucket: 'quarter', isGoal: true })
    expect(targetFor({ kind: 'goal', placement: { level: 'month', label: '', start: '2026-10-01' } })).toMatchObject({ table: 'tasks', bucket: 'month', isGoal: true })
    expect(targetFor({ kind: 'task', placement: { level: 'year', label: '', start: null } })).toMatchObject({ table: 'tasks', bucket: 'someday', isGoal: false })
    expect(targetFor({ kind: 'task', placement: { level: 'none', label: '', start: null } })).toMatchObject({ table: 'tasks', bucket: 'inbox' })
    expect(targetFor({ kind: 'routine', placement: { level: 'month', label: '', start: null } })).toEqual({ table: 'routines' })
  })
})

describe('buildSaveRows', () => {
  const rows = buildSaveRows(analysis, 'Left is Autumn, right is October.', opts)
  const task = (id: string) => rows.tasks.find((t) => t.id === id)!

  it('uses the ids fixed at proposal time and leaves out what the user unticked', () => {
    expect(rows.goals.map((g) => g.id)).toEqual(['row-y'])
    expect(rows.tasks.map((t) => t.id).sort()).toEqual(['row-g', 'row-m', 'row-t'])
    expect(rows.tasks.some((t) => t.id === 'row-skip')).toBe(false)
  })

  it('never puts anything on a day or on Today', () => {
    for (const t of rows.tasks) {
      expect(t.scheduled_for).toBeNull()
      expect(t).not.toHaveProperty('planned_on')
      expect(t).not.toHaveProperty('focus')
      expect(t.bucket).not.toBe('timed')
    }
  })

  it('places goals and tasks on their period with explicit dates', () => {
    expect(task('row-g')).toMatchObject({ bucket: 'quarter', season_start: '2026-09-01', is_goal: true, month_start: null })
    expect(task('row-m')).toMatchObject({ bucket: 'month', month_start: '2026-10-01', is_goal: false })
  })

  it('maps relationships: carried down = source, serves a year goal = goal_id, a step on the same list = goal_task_id', () => {
    expect(task('row-g').goal_id).toBe('existing-year-goal')
    expect(task('row-t').goal_task_id).toBe('row-g')
    expect(task('row-m').source_id).toBe('row-g')
    expect(task('row-m').goal_id).toBe('row-y')
    // A month task cannot be a step under a season goal (different list): kept in review, not forced.
    expect(task('row-m').goal_task_id).toBeNull()
    expect(rows.unlinked).toEqual([expect.objectContaining({ itemId: 'm' })])
  })

  it('never links to a goal or task that no longer exists — it goes into the notes, so the save cannot fail on it', () => {
    const gone = buildSaveRows(analysis, null, { ...opts, existing: { yearGoalIds: new Set(), taskIds: new Set() } })
    const g = gone.tasks.find((t) => t.id === 'row-g')!
    expect(g.goal_id).toBeNull()
    expect(g.notes).toBe('On paper, this serves “Home”')
    const derived = buildSaveRows({ ...analysis, items: [item({ id: 'x', kind: 'task', original: 'Oil the gate', relationships: [{ type: 'derived_from', target_kind: 'task', target_id: 'deleted-task', target_label: 'Gate work', reason: '' }] })] }, null, { ...opts, rowIds: { x: 'row-x' } })
    expect(derived.tasks[0].source_id).toBeNull()
  })

  it('does not force a goal onto a task without one', () => {
    const lone = buildSaveRows({ ...analysis, items: [item({ id: 'x', kind: 'task', original: 'Oil the gate' })] }, null, { ...opts, rowIds: { x: 'row-x' } })
    expect(lone.tasks[0]).toMatchObject({ goal_id: null, goal_task_id: null, source_id: null })
  })

  it('keeps the page wording: an edited title records the original, and a date stays as written', () => {
    expect(task('row-m').title).toBe('Draft the garden plan')
    expect(task('row-m').notes).toBe('On paper: “Draft garden plan”\nDate on the page: 10/16\nOn paper, this serves “Plan the garden”')
    expect(task('row-t').notes).toBeNull()
  })

  it('saves routine ideas switched off, with no time guessed', () => {
    expect(rows.routines).toEqual([expect.objectContaining({ id: 'row-r', visibility: 'reference', time_of_day: null, raw_input: 'Plan weekly on Sunday nights' })])
    expect(rows.routines[0].description).toContain('How often: weekly')
  })

  it('writes a source note with the transcription, and files the photos on it', () => {
    const source = rows.notes[0]
    expect(source).toMatchObject({ id: 'row-source', type: 'general', source: 'import', context: 'family', scope: 'compound' })
    expect(source.content).toContain('About these pages: Left is Autumn, right is October.')
    expect(source.content).toContain('~~Draft garden plan~~ [unsure: second word]')
    expect(rows.notes[1]).toMatchObject({ id: 'row-n', content: 'Ideas: bench, lights' })
    expect(rows.attachments).toEqual([expect.objectContaining({ id: 'att-1', entity_type: 'note', entity_id: 'row-source', storage_path: 'user-1/paper-plan/imp/photo-1.jpg' })])
  })

  it('orders tasks so every referenced row is written first', () => {
    const order = rows.tasks.map((t) => t.id)
    expect(order.indexOf('row-g')).toBeLessThan(order.indexOf('row-t'))
    expect(order.indexOf('row-g')).toBeLessThan(order.indexOf('row-m'))
  })

  it('derives privacy from the domain: personal stays individual', () => {
    const personal = buildSaveRows(analysis, null, { ...opts, domain: 'personal' })
    expect(new Set([...personal.tasks, ...personal.goals, ...personal.notes, ...personal.routines].map((r) => r.scope))).toEqual(new Set(['individual']))
  })

  it('summarises what will be saved', () => {
    expect(summarizeRows(rows)).toMatchObject({ yearGoals: 1, seasonGoals: 1, seasonTasks: 1, monthTasks: 1, routines: 1, notes: 1, total: 7 })
  })
})

describe('defaultInclude / withAnalysis', () => {
  it('leaves out, by default, a line that repeats something already saved — but not a repeat of another line here', () => {
    const ids = new Set(['a', 'b'])
    expect(defaultInclude(item({ id: 'a', kind: 'task', original: 'x', flags: [{ type: 'possible_duplicate', detail: '', target_id: 'existing-task' }] }), ids)).toBe(false)
    expect(defaultInclude(item({ id: 'a', kind: 'task', original: 'x', flags: [{ type: 'possible_duplicate', detail: '', target_id: 'b' }] }), ids)).toBe(true)
  })

  it('keeps each item’s row id and choice across revisions, and gives new items new ids', () => {
    const first = withAnalysis(newImport('family'), analysis)
    const unticked = { ...first, include: { ...first.include, t: false } }
    const revised = withAnalysis(unticked, { ...analysis, items: [...analysis.items.filter((i) => i.id !== 'n'), item({ id: 'new', kind: 'task', original: 'Oil the gate' })] })
    expect(revised.rowIds.t).toBe(first.rowIds.t)
    expect(revised.include.t).toBe(false)
    expect(revised.rowIds.new).toMatch(/^[0-9a-f-]{36}$/)
    expect(revised.rowIds).not.toHaveProperty('n')
  })
})
