import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { DayPlanPanel, PLAN_GROUP_CAP, planningSubtitle, routinePlaceDay, type DayPlanPanelActions } from './DayPlanPanel'
import type { DayPlan, DayPlanEntry } from '@/lib/today/dayPlan'
import { weekStartAnchor, readCadenceConfig } from '@/lib/cadence/config'

afterEach(cleanup)
// The unfinished fold remembers itself for the session; each test starts closed.
beforeEach(() => { try { sessionStorage.clear() } catch { /* jsdom */ } })

const actions: DayPlanPanelActions = {
  choose: () => {}, unchoose: () => {}, complete: () => {},
  schedule: () => {}, commit: () => {},
}

function entry(n: number, context?: string): DayPlanEntry {
  return { key: `task:w${n}`, kind: 'task', id: `w${n}`, title: `Item ${n}`, completed: false, planned: false, group: 'plan', context }
}

function plan(toPlanCount: number, month: DayPlanEntry[] = []): DayPlan {
  return {
    toPlan: Array.from({ length: toPlanCount }, (_, i) => entry(i + 1)),
    unfinished: [],
    carried: [], scheduled: [], available: [], week: [],
    month,
    counts: { scheduled: 0, available: 0 },
  } as unknown as DayPlan
}

const day = new Date(2026, 8, 19)
const thisWeek = weekStartAnchor(new Date(), readCadenceConfig().weekStartsOn)

// ONE list, "To plan" (Scott, 2026-09-21). Beside /week it IS the work, so
// every row shows; beside a day it is a capped reference. The month plan
// opens on request rather than standing beside the list.
describe('DayPlanPanel — the Planning panel', () => {
  it('beside a week page, shows every row of the one list', () => {
    const n = PLAN_GROUP_CAP + 4
    render(<DayPlanPanel plan={plan(n)} day={day} actions={actions} weekPage={thisWeek} />)
    const list = screen.getByRole('button', { name: /^To plan$/ })
    expect(list).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(`Item ${n}`)).toBeInTheDocument()
    expect(screen.queryByText(/\+\d+ more/)).not.toBeInTheDocument()
    // No count on the heading — no scoreboard.
    expect(list.textContent).toBe('To plan')
  })

  // Beside a day the panel is Today's chooser (approved white journal,
  // 2026-09-22): two ruled sections, and a quiet foot line instead of a
  // dismissible hint.
  it('beside a day, is the chooser: "This week\'s tasks" with the week\'s range, a foot line, no dismissible hint', () => {
    render(<DayPlanPanel plan={plan(1)} day={day} actions={actions} />)
    expect(screen.getByRole('heading', { name: /This week's tasks/ })).toBeInTheDocument()
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
    expect(screen.getByText(/Choices stay on your week's list/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Browse month plan/ })).toBeNull()
  })

  // The hint explains picking a day's work from the week's list — meaningless
  // beside /week, where the list already IS the work being planned.
  it('omits the day-pick hint beside a week page', () => {
    render(<DayPlanPanel plan={plan(1)} day={day} actions={actions} weekPage={thisWeek} />)
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })

  it('beside a day, stays a capped reference', () => {
    const n = PLAN_GROUP_CAP + 4
    render(<DayPlanPanel plan={plan(n)} day={day} actions={actions} />)
    expect(screen.getByRole('heading', { name: /This week's tasks/ })).toBeInTheDocument()
    expect(screen.queryByText(`Item ${n}`)).not.toBeInTheDocument()
    expect(screen.getByText(/Show 4 more/)).toBeInTheDocument()
  })

  it('beside a day, an empty week offers "Plan your week" and the routines stay', () => {
    const p = plan(0)
    p.chooserRoutines = [{ key: 'routine:r1', kind: 'routine', id: 'r1', title: 'Take a walk', completed: false, planned: false, group: 'available', context: 'Daily routine' }]
    render(<DayPlanPanel plan={p} day={day} actions={actions} />)
    expect(screen.getByText(/No tasks on this week's list yet/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Plan your week →' })).toHaveAttribute('href', '/week')
    expect(screen.getByRole('heading', { name: /Routines/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Choose Take a walk for today' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('beside a day, a section folds on its heading without closing the chooser, and the fold is remembered', () => {
    localStorage.removeItem('symphony.chooser.folded')
    const p = plan(2)
    p.chooserRoutines = [{ key: 'routine:r1', kind: 'routine', id: 'r1', title: 'Take a walk', completed: false, planned: false, group: 'available', context: 'Daily routine' }]
    const view = render(<DayPlanPanel plan={p} day={day} actions={actions} />)
    const tasksHeading = screen.getByRole('button', { name: /This week's tasks/ })
    expect(tasksHeading).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(tasksHeading)
    expect(tasksHeading).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Item 1')).not.toBeInTheDocument()
    // The other section and the foot are untouched — the chooser is still open.
    expect(screen.getByText('Take a walk')).toBeInTheDocument()
    expect(screen.getByText(/Choices stay on your week's list/)).toBeInTheDocument()
    view.unmount()
    render(<DayPlanPanel plan={p} day={day} actions={actions} />)
    expect(screen.getByRole('button', { name: /This week's tasks/ })).toHaveAttribute('aria-expanded', 'false')
    localStorage.removeItem('symphony.chooser.folded')
  })

  it('beside a day, "Hide completed" hides done rows in both sections and is remembered; all-done says so', () => {
    localStorage.removeItem('symphony.chooser.hideCompleted')
    const p = plan(0)
    p.chooserTasks = [
      { key: 'task:a', kind: 'task', id: 'a', title: 'Open task', completed: false, planned: false, group: 'plan' },
      { key: 'task:b', kind: 'task', id: 'b', title: 'Done task', completed: true, planned: false, group: 'plan' },
    ]
    p.chooserRoutines = [{ key: 'routine:d', kind: 'routine', id: 'd', title: 'Done routine', completed: true, planned: true, group: 'available', context: 'Daily routine' }]
    const view = render(<DayPlanPanel plan={p} day={day} actions={actions} />)
    expect(screen.getByText('Done task')).toBeInTheDocument()
    const toggle = screen.getByRole('button', { name: 'Hide completed' })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(toggle)
    expect(screen.queryByText('Done task')).not.toBeInTheDocument()
    expect(screen.getByText('Open task')).toBeInTheDocument()
    expect(screen.queryByText('Done routine')).not.toBeInTheDocument()
    expect(screen.getByText('Every routine for today is done.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show completed' })).toHaveAttribute('aria-pressed', 'true')
    view.unmount()
    render(<DayPlanPanel plan={p} day={day} actions={actions} />)
    expect(screen.queryByText('Done task')).not.toBeInTheDocument()
    localStorage.removeItem('symphony.chooser.hideCompleted')
  })

  it('beside a day, a routine already on the schedule is marked, not offered; a chosen one reads "Today ✓" and unchooses', () => {
    const choose = vi.fn(); const unchoose = vi.fn()
    const p = plan(0)
    p.chooserRoutines = [
      { key: 'routine:b', kind: 'routine', id: 'b', title: 'Boxing', completed: false, planned: true, onToday: true, group: 'available', context: 'Weekly routine · 9a' },
      { key: 'routine:w', kind: 'routine', id: 'w', title: 'Take a walk', completed: false, planned: true, group: 'available', context: 'Daily routine' },
      { key: 'routine:d', kind: 'routine', id: 'd', title: 'Evening reset', completed: true, planned: true, group: 'available', context: 'Daily routine' },
    ]
    render(<DayPlanPanel plan={p} day={day} actions={{ ...actions, choose, unchoose }} />)
    expect(screen.getByText("On today's schedule")).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Boxing for today/ })).toBeNull()
    expect(screen.getByText('Weekly routine · 9a')).toBeInTheDocument()
    const walk = screen.getByRole('button', { name: 'Unchoose Take a walk for today' })
    expect(walk).toHaveAttribute('aria-pressed', 'true')
    expect(walk).toHaveTextContent('Today ✓')
    fireEvent.click(walk)
    expect(unchoose).toHaveBeenCalledWith(expect.objectContaining({ id: 'w' }))
    expect(choose).not.toHaveBeenCalled()
    expect(screen.getByText('Completed')).toBeInTheDocument()
    expect(screen.getByText('Evening reset')).toHaveClass('line-through')
  })

  it('a row carries its context line, never a second category', () => {
    const p = plan(0)
    p.toPlan = [entry(1, 'Originally Saturday'), entry(2, 'Weekly routine'), entry(3)]
    render(<DayPlanPanel plan={p} day={day} actions={actions} weekPage={thisWeek} />)
    expect(screen.getByText('Originally Saturday')).toBeInTheDocument()
    expect(screen.getByText('Weekly routine')).toBeInTheDocument()
    expect(screen.queryByText(/Carried over|Available today|Needs a day|Didn.t happen/)).toBeNull()
  })

  it('the month plan opens on request', () => {
    const monthRow: DayPlanEntry = { key: 'task:m', kind: 'task', id: 'm', title: 'Repaint the porch', completed: false, planned: false, group: 'month' }
    render(<DayPlanPanel plan={plan(1, [monthRow])} day={day} actions={actions} weekPage={thisWeek} />)
    expect(screen.queryByText('Repaint the porch')).not.toBeInTheDocument()
    const browse = screen.getByRole('button', { name: /Browse month plan/ })
    expect(browse).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(browse)
    expect(screen.getByText('Repaint the porch')).toBeInTheDocument()
  })

  // Scott, 2026-09-21: a routine with no day of its own has no occurrence to
  // choose or tick. Its verb reads like every other row's — "Plan for today"
  // — and places THIS week's occurrence; changing the repeating schedule is
  // the ⋯ menu's separate, explicit move.
  it('a routine with no day offers "Plan for today" (this week\'s occurrence) and, behind ⋯, "Change repeating schedule" — nothing else', () => {
    const p = plan(0)
    p.toPlan = [{ key: 'routine:v', kind: 'routine', id: 'v', title: 'Vacuum', completed: false, planned: false, group: 'plan',
      routine: { id: 'v', name: 'Vacuum', recurrence_pattern: { type: 'weekly', days: [] } } as never, context: 'Weekly routine · no set day' }]
    const changeRoutineRule = vi.fn()
    render(<DayPlanPanel plan={p} day={day} actions={{ ...actions, changeRoutineRule }} weekPage={thisWeek} />)
    // The ellipsis says a picker follows: a routine with no day has no
    // occurrence until it has a time. Same verb, same destination.
    expect(screen.getByRole('button', { name: 'Plan Vacuum for today' })).toHaveTextContent('Plan for today…')
    expect(screen.queryByRole('button', { name: /Give .* a day/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'More for Vacuum' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Change repeating schedule for Vacuum' }))
    expect(changeRoutineRule).toHaveBeenCalledWith(expect.objectContaining({ id: 'v' }))
    expect(screen.queryByRole('button', { name: 'Complete Vacuum' })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: 'Move Vacuum to Someday' })).toBeNull()
  })

  it('points at the Expired list for older unfinished work — inside the one fold, without listing or counting it', () => {
    const p = plan(1)
    p.olderUnfinished = 3
    render(<DayPlanPanel plan={p} day={day} actions={actions} weekPage={thisWeek} />)
    // One entrance to unfinished work: the pointer is the fold's last line,
    // not a second door beside it.
    expect(screen.queryByRole('link', { name: /Older unfinished work is in Inbox/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Unfinished from earlier' }))
    expect(screen.getByRole('link', { name: /Older unfinished work is in Inbox/ })).toHaveAttribute('href', '/inbox#expired')
    expect(screen.queryByText(/3/)).toBeNull()
  })

  // The occurrence lands in the week on screen: beside a future week the
  // picker opens on that week's first day, not on today.
  it("a routine's \"Plan for today\" picker opens on the viewed week when today is not in it", () => {
    const today = new Date(2026, 8, 21)
    const current = weekStartAnchor(today, readCadenceConfig().weekStartsOn)
    const next = new Date(current); next.setDate(next.getDate() + 7)
    expect(routinePlaceDay(today, null)).toBe(today)
    expect(routinePlaceDay(today, current)).toBe(today)
    expect(routinePlaceDay(today, next)).toBe(next)
  })

  // Scott, 2026-09-21 evening: the default list is the week's own work. An
  // empty week says so and offers Add task; it is never filled with backlog.
  it('an empty week says "Nothing waiting to be scheduled this week" and offers Add task', () => {
    const addTask = vi.fn()
    const p = plan(0)
    p.unfinished = [entry(9, 'Originally Saturday')]
    render(<DayPlanPanel plan={p} day={day} actions={{ ...actions, addTask }} weekPage={thisWeek} />)
    expect(screen.getByText("Nothing on this week's list yet.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Add to this week' }))
    expect(addTask).toHaveBeenCalled()
    // The backlog did not flood in.
    expect(screen.queryByText('Item 9')).not.toBeInTheDocument()
  })

  it('"Unfinished from earlier" expands older work on request, in the order given (newest first), without a count', () => {
    const p = plan(1)
    p.unfinished = [
      { ...entry(8, 'Originally Saturday'), group: 'unfinished' },
      { ...entry(7, 'Originally Friday'), group: 'unfinished' },
      { ...entry(6, 'Planned for Sep 6 – Sep 12'), group: 'unfinished' },
    ]
    render(<DayPlanPanel plan={p} day={day} actions={actions} weekPage={thisWeek} />)
    const toggle = screen.getByRole('button', { name: 'Unfinished from earlier' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle.textContent).not.toMatch(/\d/)
    expect(screen.queryByText('Item 8')).not.toBeInTheDocument()
    fireEvent.click(toggle)
    expect(screen.getByRole('button', { name: 'Unfinished from earlier' })).toHaveAttribute('aria-expanded', 'true')
    const rows = screen.getAllByText(/^Item [678]$/).map((el) => el.textContent)
    expect(rows).toEqual(['Item 8', 'Item 7', 'Item 6'])
  })

  it('no toggle at all when nothing is unfinished', () => {
    render(<DayPlanPanel plan={plan(1)} day={day} actions={actions} weekPage={thisWeek} />)
    expect(screen.queryByRole('button', { name: /unfinished from earlier/ })).not.toBeInTheDocument()
  })

  // Precise verbs: "Plan for this week" re-commits (undated); behind ⋯,
  // "Schedule…" gives a date and "Someday" defers by name. Nothing is called
  // "let go".
  it('an unfinished row offers Plan for this week, and Schedule… and Someday behind ⋯', () => {
    const commit = vi.fn(); const someday = vi.fn()
    const p = plan(0)
    p.unfinished = [{ ...entry(5, 'Originally Saturday'), group: 'unfinished' }]
    render(<DayPlanPanel plan={p} day={day} actions={{ ...actions, commit, someday }} weekPage={thisWeek} />)
    fireEvent.click(screen.getByRole('button', { name: 'Unfinished from earlier' }))
    fireEvent.click(screen.getByRole('button', { name: 'Plan Item 5 for this week' }))
    expect(commit).toHaveBeenCalledWith(expect.objectContaining({ id: 'w5' }), 'week')
    fireEvent.click(screen.getByRole('button', { name: 'More for Item 5' }))
    expect(screen.getByRole('menuitem', { name: 'Schedule Item 5' })).toHaveTextContent('Schedule…')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move Item 5 to Someday' }))
    expect(someday).toHaveBeenCalledWith(expect.objectContaining({ id: 'w5' }))
    expect(screen.queryByRole('button', { name: /let go/i })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Plan Item 5 for today' })).toBeNull()
  })

  // Beside a day the same row's verb is "Plan for today", and it dates the
  // task to that day — the one enduring action, no second verb to learn.
  it('beside a day an unfinished row says Plan for today, and that schedules it onto the day', () => {
    const schedule = vi.fn()
    const p = plan(0)
    p.unfinished = [{ ...entry(5, 'Originally Saturday'), group: 'unfinished' }]
    render(<DayPlanPanel plan={p} day={day} actions={{ ...actions, schedule }} weekPage={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'Unfinished from earlier' }))
    fireEvent.click(screen.getByRole('button', { name: 'Plan Item 5 for today' }))
    expect(schedule).toHaveBeenCalledWith(expect.objectContaining({ id: 'w5' }), day, true)
    expect(screen.queryByRole('button', { name: /for this week/ })).toBeNull()
  })

  it("a week row's date control is called Schedule, behind ⋯; its verb is Plan for today", () => {
    render(<DayPlanPanel plan={plan(1)} day={day} actions={actions} weekPage={thisWeek} />)
    expect(screen.getByRole('button', { name: 'Plan Item 1 for today' })).toHaveTextContent('Plan for today')
    fireEvent.click(screen.getByRole('button', { name: 'More for Item 1' }))
    expect(screen.getByRole('menuitem', { name: 'Schedule Item 1' })).toHaveTextContent('Schedule…')
    // No clock glyph, no second control to interpret.
    expect(screen.queryByTitle('Schedule…')).toBeNull()
  })

  // Scott, 2026-09-22, on the chooser beside the Week page: "clicking on the
  // task should open its detail pane; titles are truncated because of the
  // space squeeze from the 'plan for today' button"; "also need to be able to
  // delete items from the chooser".
  it('the title opens the row when the host can, wraps in full, and never clamps', () => {
    const open = vi.fn()
    const p = plan(0)
    p.toPlan = [entry(1, 'from October')]
    p.toPlan[0].title = 'A long title that would have been cut short by the verb beside it in a narrow dock'
    render(<DayPlanPanel plan={p} day={day} actions={{ ...actions, open }} weekPage={thisWeek} />)
    const title = screen.getByRole('button', { name: /^Open A long title/ })
    expect(title.className).not.toMatch(/line-clamp/)
    fireEvent.click(title)
    expect(open).toHaveBeenCalledWith(expect.objectContaining({ id: 'w1' }))
  })

  it('without a host that can open, the title is plain text', () => {
    render(<DayPlanPanel plan={plan(1)} day={day} actions={actions} weekPage={thisWeek} />)
    expect(screen.queryByRole('button', { name: /^Open Item 1/ })).toBeNull()
    expect(screen.getByText('Item 1')).toBeInTheDocument()
  })

  it('a task row offers Delete behind ⋯ when the host can remove; a routine does not', () => {
    const remove = vi.fn()
    const p = plan(1)
    p.toPlan.push({ key: 'routine:r', kind: 'routine', id: 'r', title: 'Vacuum', completed: false, planned: false, group: 'plan', context: 'Weekly routine' })
    render(<DayPlanPanel plan={p} day={day} actions={{ ...actions, remove }} weekPage={thisWeek} />)
    fireEvent.click(screen.getByRole('button', { name: 'More for Item 1' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete Item 1' }))
    expect(remove).toHaveBeenCalledWith(expect.objectContaining({ id: 'w1' }))
    fireEvent.click(screen.getByRole('button', { name: 'More for Vacuum' }))
    expect(screen.queryByRole('menuitem', { name: 'Delete Vacuum' })).toBeNull()
  })

  it('beside a day the chooser rows open and delete the same way', () => {
    const open = vi.fn(); const remove = vi.fn()
    const p = plan(1)
    render(<DayPlanPanel plan={p} day={day} actions={{ ...actions, open, remove }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open Item 1' }))
    expect(open).toHaveBeenCalledWith(expect.objectContaining({ id: 'w1' }))
    fireEvent.click(screen.getByRole('button', { name: 'More for Item 1' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete Item 1' }))
    expect(remove).toHaveBeenCalledWith(expect.objectContaining({ id: 'w1' }))
  })

  it('says what it is planning: the week on screen, or the day', () => {
    expect(planningSubtitle(new Date(2026, 8, 21), new Date(2026, 8, 20))).toBe('Sep 20 – Sep 26')
    expect(planningSubtitle(new Date(2026, 8, 21), null)).toBe('Monday, September 21')
  })

  it('a picked row stays on the list, marked "Planned today", with Undo instead of the verb', () => {
    const p = plan(0)
    p.toPlan = [{ key: 'task:p', kind: 'task', id: 'p', title: 'Book the plumber', completed: false, planned: true, group: 'plan', context: 'from October' }]
    render(<DayPlanPanel plan={p} day={day} actions={actions} weekPage={thisWeek} />)
    expect(screen.getByText('Book the plumber')).toBeInTheDocument()
    expect(screen.getByText('Planned today')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /move book the plumber back off today/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /plan for today/i })).toBeNull()
  })

  it('a ticked row stays, struck, with no verb', () => {
    const p = plan(0)
    p.toPlan = [{ key: 'task:d', kind: 'task', id: 'd', title: 'Ordered the rack', completed: true, planned: false, group: 'plan' }]
    render(<DayPlanPanel plan={p} day={day} actions={actions} weekPage={thisWeek} />)
    expect(screen.getByText('Ordered the rack')).toHaveClass('line-through')
    expect(screen.queryByRole('button', { name: /plan for/i })).toBeNull()
  })
})
