import { describe, it, expect } from 'vitest'
import { createMockTask } from '@/test/mocks/factories'
import type { Task, TaskCommitment } from '@/types/task'
import { buildChooseTree, countsLine, type ChooseInput } from './chooseFromAbove'

const OCT = new Date(2026, 9, 1)
const WEEK = new Date(2026, 9, 17) // Sat Oct 17
const LAST = new Date(2026, 9, 10)
const month = (status: TaskCommitment['status'] = 'open'): TaskCommitment => ({ level: 'month', periodStart: OCT, status })
const week = (start: Date, status: TaskCommitment['status'] = 'open'): TaskCommitment => ({ level: 'week', periodStart: start, status })
const task = (o: Partial<Task>) => createMockTask({ createdAt: new Date(2026, 9, 1), ...o })

const base = (lines: Task[], pool: Task[], extra: Partial<ChooseInput> = {}): ChooseInput => ({
  lines, pool, level: 'week', periodStart: WEEK, prevStart: LAST, isCurrent: true,
  hereWord: 'this week', lastWord: 'last week', aboveWord: 'October',
  // A fixed "now" inside the week, so a day later in it isn't read as missed
  // once the real date passes it.
  now: new Date(2026, 9, 19), ...extra,
})

describe('buildChooseTree', () => {
  it('labels each step by what it is planned for, under its line', () => {
    const inventory = task({ id: 's1', title: 'Inventory', parentTaskId: 'L', commitments: [month(), week(WEEK)] })
    const scan = task({ id: 's2', title: 'Scan', parentTaskId: 'L', commitments: [month()], scheduledFor: new Date(2026, 9, 22), bucket: 'timed' })
    const share = task({ id: 's3', title: 'Share with Iris', parentTaskId: 'L', commitments: [month()] })
    const gather = task({ id: 's4', title: 'Gather', parentTaskId: 'L', commitments: [month('done')], completed: true })
    const line = task({ id: 'L', title: 'Organize documents', commitments: [month()], subtasks: [inventory, scan, share, gather] })
    const { lines, loose } = buildChooseTree(base([line], [line]))
    expect(lines).toHaveLength(1)
    const labels = Object.fromEntries(lines[0].steps.map((s) => [s.task.title, s.planned.label]))
    expect(labels).toEqual({ Inventory: 'This week', Scan: 'This week · Thu', 'Share with Iris': 'October', Gather: 'Done' })
    // Done sinks to the end.
    expect(lines[0].steps.at(-1)?.task.title).toBe('Gather')
    expect(lines[0].counts).toEqual({ done: 1, here: 2, above: 1, last: 0 })
    expect(countsLine(lines[0].counts, 'this week', 'October', 'last week')).toBe('1 done · 2 this week · 1 on October')
    expect(loose).toEqual([])
  })

  it('a step broken down carries its own steps; a row made under a line is its step, not another line', () => {
    const line = task({ id: 'L', title: 'Organize documents', commitments: [month()] })
    const store = task({ id: 'M', title: 'Store originals', sourceId: 'L', commitments: [month()] })
    const decide = task({ id: 'W', title: 'Decide safe or box', sourceId: 'M', commitments: [week(WEEK)], bucket: 'week', weekStart: WEEK })
    const { lines } = buildChooseTree(base([line, store], [line, store, decide]))
    expect(lines.map((l) => l.task.id)).toEqual(['L'])
    expect(lines[0].steps[0].task.id).toBe('M')
    expect(lines[0].steps[0].planned.label).toBe('October')
    expect(lines[0].steps[0].children[0].task.id).toBe('W')
    expect(lines[0].steps[0].children[0].planned.label).toBe('This week')
  })

  it("last week's leftovers sit under their line when they have one, and in Not under a line when they don't", () => {
    const line = task({ id: 'L', title: 'Plan music lessons', commitments: [month()] })
    const underLine = task({ id: 'a', title: 'Email two teachers', sourceId: 'L', commitments: [week(LAST)], bucket: 'week', weekStart: LAST })
    const loose1 = task({ id: 'b', title: 'Return library books', commitments: [week(LAST)], bucket: 'week', weekStart: LAST })
    const onWeek = task({ id: 'c', title: 'Cleats resized', commitments: [week(WEEK)], bucket: 'week', weekStart: WEEK })
    const inbox = task({ id: 'd', title: 'Renew registration', bucket: 'inbox' })
    const tree = buildChooseTree(base([line], [line, underLine, loose1, onWeek, inbox], { includeInbox: true }))
    expect(tree.lines[0].steps[0]).toMatchObject({ fromLast: true, planned: { kind: 'last', label: 'Last week' } })
    expect(tree.loose.map((l) => [l.task.id, l.source])).toEqual([['b', 'last'], ['c', 'here'], ['d', 'inbox']])
    expect(buildChooseTree(base([line], [line, inbox])).loose).toEqual([])
  })

  it('a line planned straight onto the week says so', () => {
    const line = task({ id: 'L', title: 'Toss umbrella', commitments: [month(), week(WEEK)] })
    expect(buildChooseTree(base([line], [line])).lines[0].planned).toEqual({ kind: 'here', label: 'This week' })
  })

  it('plans a month from the season the same way', () => {
    const fall = new Date(2026, 8, 1)
    const line = task({ id: 'F', title: 'Get the house in order', commitments: [{ level: 'season', periodStart: fall, status: 'open' }] })
    const oct = task({ id: 'o', title: 'Organize documents', sourceId: 'F', commitments: [{ level: 'season', periodStart: fall, status: 'open' }, month()] })
    const later = task({ id: 'n', title: 'Paint the office', sourceId: 'F', commitments: [{ level: 'season', periodStart: fall, status: 'open' }] })
    const tree = buildChooseTree({ lines: [line], pool: [line, oct, later], level: 'month', periodStart: OCT, prevStart: new Date(2026, 8, 1),
      isCurrent: true, hereWord: 'October', lastWord: 'September', aboveWord: 'Fall' })
    expect(tree.lines[0].steps.map((s) => [s.task.title, s.planned.label])).toEqual([['Organize documents', 'October'], ['Paint the office', 'Fall']])
  })
})

describe('a day this week that has passed', () => {
  it('reads "Was {day}, not done" and still counts as this week', () => {
    const line = task({ id: 'L', title: 'Organize documents', commitments: [month()] })
    const missed = task({ id: 'm', title: 'Scan', sourceId: 'L', scheduledFor: new Date(2026, 9, 18), bucket: 'timed' })
    const tree = buildChooseTree(base([line], [line, missed], { now: new Date(2026, 9, 19, 9) }))
    expect(tree.lines[0].steps[0].planned).toEqual({ kind: 'missed', label: 'Was Sunday, not done' })
    expect(tree.lines[0].counts.here).toBe(1)
  })
})

describe('lineFor', () => {
  it('files a dropped line under the one line it plainly belongs to, else nowhere', async () => {
    const { lineFor } = await import('./chooseFromAbove')
    const docs = task({ id: 'L', title: 'Organize important family documents', commitments: [month()],
      subtasks: [task({ id: 's', title: 'Identify missing birth certificates', parentTaskId: 'L', commitments: [month()] })] })
    const music = task({ id: 'M', title: 'Plan music lessons for the kids', commitments: [month()] })
    const { lines } = buildChooseTree(base([docs, music], [docs, music]))
    expect(lineFor('Call county records about the birth certificate', lines)?.task.id).toBe('L')
    expect(lineFor('Email two piano teachers about lessons', lines)?.task.id).toBe('M')
    expect(lineFor('Return library books', lines)).toBeNull()
  })
})

describe('withPlacedSubtasks', () => {
  it('draws a step on the week once it has a week or a day of its own', async () => {
    const { withPlacedSubtasks } = await import('./plannedSubtasks')
    const onWeek = task({ id: 'a', parentTaskId: 'P', commitments: [week(WEEK)] })
    const copied = task({ id: 'b', parentTaskId: 'P', scheduledFor: new Date(2026, 9, 20) })
    const plain = task({ id: 'c', parentTaskId: 'P' })
    const parent = task({ id: 'P', scheduledFor: new Date(2026, 9, 20), subtasks: [onWeek, copied, plain] })
    expect(withPlacedSubtasks([parent]).map((t) => t.id)).toEqual(['P', 'a'])
  })
})
