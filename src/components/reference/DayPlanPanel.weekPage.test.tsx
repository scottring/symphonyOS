import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { DayPlanPanel, PLAN_GROUP_CAP, planningSubtitle, routinePlaceDay, type DayPlanPanelActions } from './DayPlanPanel'
import type { DayPlan, DayPlanEntry } from '@/lib/today/dayPlan'
import { weekStartAnchor, readCadenceConfig } from '@/lib/cadence/config'

afterEach(() => { cleanup(); localStorage.removeItem('symphony.chooser.folded'); localStorage.removeItem('symphony.chooser.hideCompleted') })
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
    month: month.length ? month : Array.from({ length: toPlanCount }, (_, i) => entry(i + 1)),
    counts: { scheduled: 0, available: 0 },
  } as unknown as DayPlan
}

const day = new Date(2026, 8, 19)
const thisWeek = weekStartAnchor(new Date(), readCadenceConfig().weekStartsOn)

// ONE list, "To plan" (Scott, 2026-09-21). Beside /week it IS the work, so
// every row shows; beside a day it is a capped reference. The month plan
// opens on request rather than standing beside the list.
describe('DayPlanPanel — the Planning panel', () => {
  it('Week shows month reference with a bounded list, never today actions or routine rules', () => {
    render(<DayPlanPanel plan={plan(10)} day={day} actions={actions} weekPage={thisWeek} />)
    expect(screen.getByRole('button', { name: 'Month tasks' })).toBeInTheDocument()
    expect(screen.queryByText('Item 10')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Show 4 more/ }))
    expect(screen.getByText('Item 10')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /for today/ })).toBeNull()
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
    expect(screen.getByText(/No week tasks in this view/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Plan your week →' })).toHaveAttribute('href', '/week')
    fireEvent.click(screen.getByRole('navigation', { name: 'Shelf source' }).querySelector('button:last-child')!)
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
    fireEvent.click(screen.getByRole('navigation', { name: 'Shelf source' }).querySelector('button:last-child')!)
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
    fireEvent.click(screen.getByRole('navigation', { name: 'Shelf source' }).querySelector('button:last-child')!)
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
    fireEvent.click(screen.getByRole('navigation', { name: 'Shelf source' }).querySelector('button:last-child')!)
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
    p.month = [entry(1, 'Originally Saturday'), entry(2, 'Weekly routine'), entry(3)]
    render(<DayPlanPanel plan={p} day={day} actions={actions} weekPage={thisWeek} />)
    expect(screen.getByText('Originally Saturday')).toBeInTheDocument()
    expect(screen.getByText('Weekly routine')).toBeInTheDocument()
    expect(screen.queryByText(/Carried over|Available today|Needs a day|Didn.t happen/)).toBeNull()
  })

  it('Month reference is immediately available on Week', () => {
    const commit = vi.fn(); const choose = vi.fn()
    render(<DayPlanPanel plan={plan(1)} day={day} actions={{ ...actions, commit, choose }} weekPage={thisWeek} />)
    fireEvent.click(screen.getByRole('button', { name: /Plan Item .* for this week$/ }))
    expect(commit).toHaveBeenCalledWith(expect.objectContaining({ id: 'w1' }), 'week')
    expect(choose).not.toHaveBeenCalled()
    expect(screen.getByRole('link', { name: /View month goals/ })).toHaveAttribute('href', '/month')
  })

  // Scott, 2026-09-21: a routine with no day of its own has no occurrence to
  // choose or tick. Its verb reads like every other row's — "Plan for today"
  // — and places THIS week's occurrence; changing the repeating schedule is
  // the ⋯ menu's separate, explicit move.
  it('routine rules are absent from the Week task reference', () => {
    const p = plan(0)
    p.toPlan = [{ key: 'routine:r', kind: 'routine', id: 'r', title: 'Vacuum', completed: false, planned: false, group: 'plan' }]
    render(<DayPlanPanel plan={p} day={day} actions={actions} weekPage={thisWeek} />)
    expect(screen.queryByText('Vacuum')).toBeNull()
  })

  it('points at the Expired list for older unfinished work — inside the one fold, without listing or counting it', () => {
    const p = plan(1)
    p.olderUnfinished = 3
    render(<DayPlanPanel plan={p} day={day} actions={actions} weekPage={thisWeek} />)
    // One entrance to unfinished work: the pointer is the fold's last line,
    // not a second door beside it.
    expect(screen.queryByRole('link', { name: /Older unfinished work is in Inbox/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Earlier' }))
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
  it('empty month reference points to direct week entry without filling with backlog', () => {
    const p = plan(0); p.unfinished = [entry(9)]
    render(<DayPlanPanel plan={p} day={day} actions={actions} weekPage={thisWeek} />)
    expect(screen.getByText(/No month tasks waiting/)).toBeInTheDocument()
    expect(screen.queryByText('Item 9')).toBeNull()
  })

  it('"Unfinished from earlier" expands older work on request, in the order given (newest first), without a count', () => {
    const p = plan(1)
    p.unfinished = [
      { ...entry(8, 'Originally Saturday'), group: 'unfinished' },
      { ...entry(7, 'Originally Friday'), group: 'unfinished' },
      { ...entry(6, 'Planned for Sep 6 – Sep 12'), group: 'unfinished' },
    ]
    render(<DayPlanPanel plan={p} day={day} actions={actions} weekPage={thisWeek} />)
    const toggle = screen.getByRole('button', { name: 'Earlier' })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
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
    fireEvent.click(screen.getByRole('button', { name: 'Earlier' }))
    fireEvent.click(screen.getByRole('button', { name: /Plan Item .* for this week$/ }))
    expect(commit).toHaveBeenCalledWith(expect.objectContaining({ id: 'w5' }), 'week')
    fireEvent.click(screen.getByRole('button', { name: 'More for Item 5' }))
    expect(screen.queryByRole('menuitem', { name: /Choose date/ })).toBeNull()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move Item 5 to Someday' }))
    expect(someday).toHaveBeenCalledWith(expect.objectContaining({ id: 'w5' }))
    expect(screen.queryByRole('button', { name: /let go/i })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Plan Item 5 for today' })).toBeNull()
  })

  // Beside a day the same row's verb is "Plan for today", and it dates the
  // task to that day — the one enduring action, no second verb to learn.
  it('Today chooser excludes unfinished and month work', () => {
    const p = plan(0); p.unfinished = [entry(5)]; p.month = [entry(6)]
    render(<DayPlanPanel plan={p} day={day} actions={actions} />)
    expect(screen.queryByText('Item 5')).toBeNull()
    expect(screen.queryByText('Item 6')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Unfinished from earlier' })).toBeNull()
  })

  it('month task secondary actions stay behind the menu', () => {
    render(<DayPlanPanel plan={plan(1)} day={day} actions={actions} weekPage={thisWeek} />)
    expect(screen.queryByRole('menuitem')).toBeNull()
    expect(screen.getByRole('button', { name: 'Choose date for Item 1' })).toBeInTheDocument()
  })

  // Scott, 2026-09-22, on the chooser beside the Week page: "clicking on the
  // task should open its detail pane; titles are truncated because of the
  // space squeeze from the 'plan for today' button"; "also need to be able to
  // delete items from the chooser".
  it('the title opens the row when the host can, wraps in full, and never clamps', () => {
    const open = vi.fn()
    const p = plan(0)
    p.month = [entry(1, 'from October')]
    p.month[0].title = 'A long title that would have been cut short by the verb beside it in a narrow dock'
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

  it('every row offers Delete behind ⋯ when the host can remove — a routine row says "Delete routine"; a done row keeps only Delete', () => {
    const remove = vi.fn()
    const p = plan(1)
    p.month.push({ key: 'routine:r', kind: 'routine', id: 'r', title: 'Vacuum', completed: false, planned: false, group: 'plan', context: 'Weekly routine' })
    p.month.push({ key: 'task:d', kind: 'task', id: 'd', title: 'Done thing', completed: true, planned: false, group: 'plan' })
    render(<DayPlanPanel plan={p} day={day} actions={{ ...actions, remove }} weekPage={thisWeek} />)
    fireEvent.click(screen.getByRole('button', { name: 'More for Item 1' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete: Item 1' }))
    expect(remove).toHaveBeenCalledWith(expect.objectContaining({ id: 'w1' }))
    fireEvent.click(screen.getByRole('button', { name: 'More for Vacuum' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete routine: Vacuum' }))
    expect(remove).toHaveBeenCalledWith(expect.objectContaining({ id: 'r', kind: 'routine' }))
    fireEvent.click(screen.getByRole('button', { name: 'More for Done thing' }))
    expect(screen.getByRole('menuitem', { name: 'Delete: Done thing' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Schedule Done thing' })).toBeNull()
  })

  it('beside a day the chooser rows open and delete the same way', () => {
    const open = vi.fn(); const remove = vi.fn()
    const p = plan(1)
    render(<DayPlanPanel plan={p} day={day} actions={{ ...actions, open, remove }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open Item 1' }))
    expect(open).toHaveBeenCalledWith(expect.objectContaining({ id: 'w1' }))
    fireEvent.click(screen.getByRole('button', { name: 'More for Item 1' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete: Item 1' }))
    expect(remove).toHaveBeenCalledWith(expect.objectContaining({ id: 'w1' }))
  })

  // Scott, 2026-09-22: "a triage view for the Choose Tasks column so that we
  // can have full control and visibility … widening it to half screen".
  it('month goals are reference only, never schedulable task rows', () => {
    const p = plan(0)
    p.month = [{ ...entry(1), task: { isGoal: true } as DayPlanEntry['task'] }]
    render(<DayPlanPanel plan={p} day={day} actions={actions} weekPage={thisWeek} />)
    fireEvent.click(screen.getByText('Month goals · 1'))
    expect(screen.getByText('Item 1')).toBeVisible()
    expect(screen.queryByRole('button', { name: /Plan Item 1/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Complete Item 1/ })).toBeNull()
  })

  it('Today keeps secondary actions in the menu even when passed an old wide preference', () => {
    render(<DayPlanPanel plan={plan(1)} day={day} actions={{ ...actions, remove: vi.fn() }} wide />)
    expect(screen.getByRole('button', { name: 'More for Item 1' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete: Item 1' })).toBeNull()
  })

  it('says what it is planning: the week on screen, or the day', () => {
    expect(planningSubtitle(new Date(2026, 8, 21), new Date(2026, 8, 20))).toBe('Sep 20 – Sep 26')
    expect(planningSubtitle(new Date(2026, 8, 21), null)).toBe('Monday, September 21')
  })

  it('a month task already committed to the displayed week stays marked without a second placement action', () => {
    const p = plan(1)
    p.month[0].task = { bucket: 'week', weekStart: thisWeek } as DayPlanEntry['task']
    render(<DayPlanPanel plan={p} day={day} actions={actions} weekPage={thisWeek} />)
    expect(screen.getByText("On this week's list")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Plan Item .* for this week$/ })).toBeDisabled()
  })

  it('a ticked row stays, struck, with no verb', () => {
    const p = plan(0)
    p.month = [{ key: 'task:d', kind: 'task', id: 'd', title: 'Ordered the rack', completed: true, planned: false, group: 'plan' }]
    render(<DayPlanPanel plan={p} day={day} actions={actions} weekPage={thisWeek} />)
    expect(screen.getByText('Ordered the rack')).toHaveClass('line-through')
    expect(screen.queryByRole('button', { name: /plan for/i })).toBeNull()
  })
})

it('offers a flexible weekend in the task menu for the displayed week', async () => {
  const weekend = vi.fn().mockResolvedValue(true)
  const schedule = vi.fn()
  render(<DayPlanPanel plan={plan(1)} day={day} actions={{ ...actions, weekend, schedule }} weekPage={new Date(2026, 9, 4)} />)
  const button = screen.getByRole('button', { name: 'Plan Item 1 for this weekend' })
  expect(button).toHaveTextContent('Weekend')
  fireEvent.click(button)
  expect(weekend).toHaveBeenCalledWith(expect.objectContaining({ id: 'w1' }), new Date(2026, 9, 10))
  expect(schedule).not.toHaveBeenCalled()
})

it('keeps a failed weekend plan retryable instead of closing the menu', async () => {
  render(<DayPlanPanel plan={plan(1)} day={day} actions={{ ...actions, weekend: vi.fn().mockResolvedValue(false) }} weekPage={thisWeek} />)
  fireEvent.click(screen.getByRole('button', { name: 'Plan Item 1 for this weekend' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save')
  expect(screen.getByRole('button', { name: 'Plan Item 1 for this weekend' })).toBeEnabled()
})

it('exposes week destinations directly and keeps maintenance under More', () => {
  const commit = vi.fn()
  render(<DayPlanPanel plan={plan(1)} day={day} actions={{ ...actions, commit, weekend: vi.fn(), someday: vi.fn(), remove: vi.fn() }} weekPage={thisWeek} />)
  expect(screen.queryByRole('button', { name: 'Plan Item 1' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Plan Item 1 for this weekend' })).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Plan Item 1 for this week' }))
  expect(commit).toHaveBeenCalledWith(expect.objectContaining({ id: 'w1' }), 'week')
  fireEvent.click(screen.getByRole('button', { name: 'More for Item 1' }))
  expect(screen.getAllByRole('menuitem').map(button => button.textContent)).toEqual(['Someday', 'Delete'])
})

it('supports keyboard navigation and Escape back to the More trigger', () => {
  render(<DayPlanPanel plan={plan(1)} day={day} actions={{ ...actions, someday: vi.fn() }} weekPage={thisWeek} />)
  const trigger = screen.getByRole('button', { name: 'More for Item 1' })
  trigger.focus()
  fireEvent.click(trigger)
  fireEvent.keyDown(trigger, { key: 'ArrowDown' })
  expect(screen.getByRole('menuitem', { name: 'Move Item 1 to Someday' })).toHaveFocus()
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
  expect(screen.queryByRole('menu')).toBeNull()
  expect(trigger).toHaveFocus()
})

 it('Earlier excludes already committed tasks and searches the remaining source', () => {
   const p = plan(1)
   p.unfinished = [entry(7), { ...entry(8), task: { commitments: [{level: 'week', periodStart: thisWeek, status: 'open'}] } as DayPlanEntry['task'] }]
   render(<DayPlanPanel plan={p} day={day} actions={actions} weekPage={thisWeek} />)
   fireEvent.click(screen.getByRole('button', { name: 'Earlier' }))
   expect(screen.getByText('Item 7')).toBeVisible()
   expect(screen.queryByText('Item 8')).toBeNull()
   expect(screen.queryByText('Item 1')).toBeNull()
   fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'no match' } })
   expect(screen.queryByText('Item 7')).toBeNull()
 })


describe('routine occurrence time action', () => {
  it.each([false, true])('sets a time on the displayed day, already on Today: %s', (onToday) => {
    const occurrence: DayPlanEntry = { key: 'routine:read', kind: 'routine', id: 'read', title: 'Read', completed: false, planned: false, onToday, group: 'available' }
    const p = plan(0)
    p.chooserRoutines = [occurrence]
    const schedule = vi.fn()
    render(<DayPlanPanel plan={p} day={day} actions={{ ...actions, schedule }} />)
    fireEvent.click(screen.getByRole('navigation', { name: 'Shelf source' }).querySelector('button:last-child')!)
    fireEvent.click(screen.getByRole('button', { name: 'Set time for Read occurrence' }))
    expect(screen.queryByRole('button', { name: 'All Day' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '8pm', exact: true }))
    expect(schedule).toHaveBeenCalledWith(occurrence, new Date(2026, 8, 19, 20), false)
  })
})

it('completes a week task from Today’s shelf without choosing a day', () => {
  const p = plan(1)
  const complete = vi.fn(), choose = vi.fn()
  render(<DayPlanPanel plan={p} day={day} actions={{ ...actions, complete, choose }} />)
  fireEvent.click(screen.getByRole('button', { name: 'Complete Item 1' }))
  expect(complete).toHaveBeenCalledWith(expect.objectContaining({ id: 'w1' }))
  expect(choose).not.toHaveBeenCalled()
})
