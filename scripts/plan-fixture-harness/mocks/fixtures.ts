// Generic fixture week for the layout harness — no real account data.
import type { Task } from '@/types/task'
import { readCadenceConfig, weekStartAnchor } from '@/lib/cadence/config'
const now = new Date()
export const WEEK = weekStartAnchor(new Date(now.getFullYear(), now.getMonth(), now.getDate()), readCadenceConfig().weekStartsOn)
const d = (n: number, h?: number) => { const x = new Date(WEEK); x.setDate(x.getDate() + n); if (h !== undefined) x.setHours(h, 0, 0, 0); return x }
const monthStart = new Date(d(3).getFullYear(), d(3).getMonth(), 1)
// The weekend in this week, by date — never paired across weeks. In a
// Sunday-start week Saturday is the last day and its Sunday is next week's.
const satOffset = [0, 1, 2, 3, 4, 5, 6].find((n) => d(n).getDay() === 6)!
export const SATURDAY = d(satOffset)
export const SUNDAY_AFTER = d(satOffset + 1) // may fall outside this week
const prev = new Date(WEEK); prev.setDate(prev.getDate() - 7)
const base = { completed: false, createdAt: new Date(2026, 8, 1), assignedTo: 'me' }
const m = (id: string, title: string, done = false, o: Partial<Task> = {}) => ({ ...base, id, title, completed: done, bucket: 'month', monthStart, commitments: [{ level: 'month', periodStart: monthStart, status: done ? 'done' : 'open' }], ...o }) as Task
const w = (id: string, title: string, o: Partial<Task> = {}) => ({ ...base, id, title, bucket: 'week', weekStart: WEEK, commitments: [{ level: 'week', periodStart: WEEK, status: 'open' }], ...o }) as Task
const season = new Date(2026, 8, 1)
const s = (id: string, title: string, o: Partial<Task> = {}) => ({ ...base, id, title, bucket: 'quarter', seasonStart: season, commitments: [{ level: 'season', periodStart: season, status: 'open' }], ...o }) as Task
// Open journal (2026-10-08): several Fall lines, one left untouched; October
// lines written for them (source_id, and one older month goal backing a Fall
// goal through supports_goal_task_id); unlinked lines; one linked to a Fall
// line only another person can see; one October line also taken into the week.
export const TASKS: Task[] = [
  s('s1', 'Garden beds ready for winter'),
  s('s2', 'A calmer morning routine for the house'),
  s('s3', 'Household admin under control'),
  s('s4', 'Learn three songs on the guitar'),
  s('s9', 'Another person’s private Fall line', { assignedTo: 'partner' }),
  m('m1', 'Plan the autumn trip with everyone’s dates'),
  m('m2', 'Clear out the shed before the first frost', false, { sourceId: 's1' }),
  m('m7', 'Order garlic bulbs for the beds', false, { sourceId: 's1' }),
  m('m8', 'Set up a launch pad by the front door', false, { sourceId: 's2' }),
  m('m3', 'Get the household paperwork in order for the year', false, { isGoal: true, supportsGoalTaskId: 's3' }),
  m('m9', 'Draft the family newsletter outline', false, { sourceId: 's9' }),
  { ...base, id: 'm10', title: 'Book the boiler service', bucket: 'week', monthStart, weekStart: WEEK, sourceId: 's3',
    commitments: [{ level: 'month', periodStart: monthStart, status: 'open' }, { level: 'week', periodStart: WEEK, status: 'open' }] } as Task,
  m('m4', 'Paint the spare room', true),
  // Long lines, for the month-line menu (2026-10-08 review).
  m('m5', 'Get the household paperwork, insurance renewals and the shared filing system sorted out properly before the end of the year'),
  m('m6', 'Supercalifragilisticexpialidociousreorganisationofthegarageshelving'),
  w('w1', 'Book the cabin', { sourceId: 'm1' }),
  w('w2', 'Go through the onboarding checklist'),
  w('w3', 'Ask the neighbours about borrowing a trailer for the weekend', { sourceId: 'm2' }),
  w('w4', 'Schedule the appointment with the accountant about the household paperwork', { sourceId: 'm3', scheduledFor: d(5), isAllDay: true }),
  w('w5', 'Sign up for the community newsletter', { scheduledFor: d(5), isAllDay: true, completed: true }),
  w('w6', 'Drop the old paint at the recycling centre', { sourceId: 'm2', scheduledFor: d(4, 10) }),
  w('w7', 'Call the plumber', { scheduledFor: d(3), isAllDay: true }),
  // Weekend things, by real date: a dated Saturday task, one for the Sunday
  // right after it (on screen only when that Sunday is in this week), and one
  // for the weekend with no day ("Sometime this weekend").
  w('wk1', 'Farmers market', { scheduledFor: SATURDAY, isAllDay: true }),
  w('wk2', 'Call the grandparents', { scheduledFor: SUNDAY_AFTER, isAllDay: true, weekStart: undefined, bucket: 'timed', commitments: [] }),
  w('wk3', 'Wash the car', { weekendStart: SATURDAY }),
  { ...base, id: 'l1', title: 'Talk through the holiday plans', bucket: 'week', weekStart: prev, commitments: [{ level: 'week', periodStart: prev, status: 'open' }] } as Task,
]
