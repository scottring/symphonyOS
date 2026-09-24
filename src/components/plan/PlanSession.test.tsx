import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import type { Task } from '@/types/task'
import { emptyDraft, type SessionDraft } from '@/lib/planning/session'
import { PlanSession } from './PlanSession'

const t = (over: Partial<Task>): Task => ({ id: 'x', title: 'X', completed: false, createdAt: new Date(), updatedAt: new Date(), bucket: 'month', ...over } as Task)
function setup(over: Partial<Parameters<typeof PlanSession>[0]> = {}) {
  let draft: SessionDraft = emptyDraft('month', new Date(2026, 9, 1), new Date(2026, 8, 1))
  const onChange = vi.fn((d: SessionDraft) => { draft = d; view.rerender(el()) })
  const onSave = vi.fn(async () => {})
  const el = () => (
    <PlanSession level="month" aboveLabel="the season" periodLabel="October" prevLabel="September"
      finished={[t({ id: 'f', title: 'Order the bike rack', completed: true })]}
      open={[t({ id: 'g', title: 'Strength 2x/week', isGoal: true }), t({ id: 'l', title: 'Library card' })]}
      current={[]} above={[t({ id: 'b', title: 'Get three bids', bucket: 'quarter' })]}
      aboveGoals={[t({ id: 'sg', title: 'Sign a contractor', isGoal: true, bucket: 'quarter' })]}
      draft={draft} onChange={onChange} onClose={vi.fn()} onSave={onSave} saving={false} {...over} />
  )
  const view = render(el())
  return { onChange, onSave, get draft() { return draft } }
}

describe('PlanSession', () => {
  it('starts on Look back with both reflection boxes and the previous month\'s actual list', () => {
    setup()
    expect(screen.getByRole('heading', { name: /how did september go/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/what went well/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/what didn't/i)).toBeInTheDocument()
    expect(screen.getByText('Order the bike rack')).toBeInTheDocument()
    expect(screen.getByText(/visible to your household/i)).toBeInTheDocument()
  })

  it('offers "Keep, and add a next action" on a goal and asks for the action\'s name', () => {
    const s = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Keep, and add a next action' }))
    fireEvent.change(screen.getByLabelText(/next action for strength 2x\/week/i), { target: { value: 'Book a PT evaluation' } })
    expect(s.draft.verdicts.g).toBe('keep-action')
    expect(s.draft.actionTitles.g).toBe('Book a PT evaluation')
  })

  it('skips Look back when the previous month left nothing', () => {
    setup({ finished: [], open: [] })
    expect(screen.getByText(/nothing to look back at/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /what will october add up to/i })).toBeInTheDocument()
  })

  it('shows the month-goals hint under the Goals heading', () => {
    setup({ finished: [], open: [] })
    expect(screen.getByRole('note')).toHaveTextContent(/Goals are what this period should add up to/)
  })

  it('writes nothing until Save, then saves once', async () => {
    const s = setup()
    fireEvent.click(screen.getByRole('button', { name: /next: plan october/i }))
    fireEvent.change(screen.getByLabelText(/new goal for october/i), { target: { value: 'Three bids in hand' } })
    fireEvent.change(screen.getByLabelText(/for a season goal/i), { target: { value: 'sg' } })
    fireEvent.click(screen.getByRole('button', { name: /add goal/i }))
    expect(screen.getByText('for Sign a contractor')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /add to october: get three bids/i }))
    fireEvent.click(screen.getByRole('button', { name: /next: save/i }))
    expect(s.onSave).not.toHaveBeenCalled()
    expect(screen.getByText('Three bids in hand')).toBeInTheDocument()
    expect(screen.getByText(/stays on the season/i)).toBeInTheDocument()
    expect(screen.getByText(/October goals · for Sign a contractor/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save october/i })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Domain for Get three bids'), { target: { value: 'family' } })
    fireEvent.click(screen.getByRole('button', { name: /save october/i }))
    expect(s.draft.domains).toEqual({ b: 'family' })
    expect(s.onSave).toHaveBeenCalledTimes(1)
  })
})

describe('PlanSession — week', () => {
  const week = (over: Partial<Parameters<typeof PlanSession>[0]> = {}) => setup({
    level: 'week', periodLabel: 'this week', prevLabel: 'last week', aboveLabel: 'October',
    dayOptions: [{ ymd: '2026-10-08', label: 'Thu' }],
    finished: [t({ id: 'f', title: 'Ordered the rack', completed: true })],
    open: [t({ id: 'o', title: 'Bike rack', bucket: 'week' })],
    above: [t({ id: 'm1', title: 'Three bids', bucket: 'month' })],
    aboveGoals: [t({ id: 'mg', title: 'Finish the kitchen', isGoal: true, bucket: 'month' })],
    ...over,
  })

  it('has no Goals section and no next-action verdict; the month sits beside it', () => {
    week()
    expect(screen.getByRole('heading', { name: /how did last week go/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Keep, and add a next action' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /next: plan this week/i }))
    expect(screen.queryByLabelText(/new goal for/i)).toBeNull()
    expect(screen.getByText('October')).toBeInTheDocument()
    expect(screen.getByText('Finish the kitchen')).toBeInTheDocument()
  })

  it('a new task may take a day; "+ Add to this week" copies a month task down', () => {
    const s = week()
    fireEvent.click(screen.getByRole('button', { name: /next: plan this week/i }))
    fireEvent.change(screen.getByLabelText(/new task for this week/i), { target: { value: 'Call the plumber' } })
    fireEvent.change(screen.getByLabelText(/day for this task/i), { target: { value: '2026-10-08' } })
    fireEvent.click(screen.getByRole('button', { name: /add task/i }))
    expect(s.draft.newTasks[0]).toMatchObject({ title: 'Call the plumber', day: '2026-10-08' })
    expect(screen.getByText('on Thu')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /add to this week: three bids/i }))
    expect(s.draft.takenFromAbove).toEqual(['m1'])
    fireEvent.click(screen.getByRole('button', { name: /next: save/i }))
    expect(screen.getByText(/stays on October/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save this week/i })).toBeInTheDocument()
  })

  it('shows the week-list hint on the Plan step', () => {
    week()
    fireEvent.click(screen.getByRole('button', { name: /next: plan this week/i }))
    expect(screen.getByRole('note')).toHaveTextContent(/Adding a month task here puts it on this week's list too/)
  })
})

describe('PlanSession — season', () => {
  it('plans goals and tasks with the year\'s goals beside it, and offers nothing to take from the year', () => {
    setup({ level: 'season', periodLabel: 'Winter 2026', prevLabel: 'Fall 2026', aboveLabel: '2026',
      open: [t({ id: 'g', title: 'Strength 2x/week', isGoal: true, bucket: 'quarter' })], above: [],
      aboveGoals: [t({ id: 'yg', title: 'Get strong again', isGoal: true })] })
    expect(screen.getByRole('button', { name: 'Keep, and add a next action' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /next: plan winter 2026/i }))
    expect(screen.getByLabelText(/for a 2026 goal/i)).toBeInTheDocument()
    expect(within(screen.getByRole('complementary')).getByText('Get strong again')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /add to winter 2026/i })).toBeNull()
  })
})

describe('PlanSession — year', () => {
  it('offers Keep · Done · Drop, plans goals only, and has no rail', () => {
    const s = setup({ level: 'year', periodLabel: '2027', prevLabel: '2026', aboveLabel: '',
      finished: [t({ id: 'f', title: 'Kitchen', isGoal: true, completed: true })], open: [t({ id: 'o', title: 'Get strong', isGoal: true })], above: [], aboveGoals: [] })
    expect(screen.getByRole('heading', { name: /how did 2026 go/i })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^(Keep|Done|Drop)$/ })).toHaveLength(3)
    expect(screen.queryByRole('button', { name: /next action/i })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Someday' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }))
    fireEvent.click(screen.getByRole('button', { name: /next: plan 2027/i }))
    expect(screen.queryByLabelText(/new task for/i)).toBeNull()
    expect(screen.queryByRole('complementary')).toBeNull()
    fireEvent.change(screen.getByLabelText(/new goal for 2027/i), { target: { value: 'Run a 10k' } })
    fireEvent.click(screen.getByRole('button', { name: /add goal/i }))
    fireEvent.click(screen.getByRole('button', { name: /next: save/i }))
    expect(screen.getByText(/2027 goals · kept from 2026/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save 2027/i })).toBeInTheDocument()
    expect(s.onSave).not.toHaveBeenCalled()
  })

  it('fills keptIds[id] on Keep, once, and leaves it after toggling off', () => {
    const s = setup({ level: 'year', periodLabel: '2027', prevLabel: '2026', aboveLabel: '',
      finished: [], open: [t({ id: 'o', title: 'Get strong', isGoal: true })], above: [], aboveGoals: [] })
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }))
    const id = s.draft.keptIds?.o
    expect(typeof id).toBe('string')
    expect(id).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }))
    expect(s.draft.keptIds?.o).toBe(id)
  })
})

// Requirement 7: a session starts from saved work, says plainly when nothing
// would change, and closes without a write. "Nothing is saved yet" was shown
// over months that already held a goal and three tasks (S3-04).
describe('the save step tells the truth about what is already there', () => {
  const existing = [
    t({ id: 'g1', title: 'Take Kaleb to an Islanders game in DC', isGoal: true }),
    t({ id: 'x1', title: 'Research games dates and tickets' }),
    t({ id: 'x2', title: 'Buy game tickets', completed: true }),
  ]
  /** No look-back rows, so the session opens straight on Plan. */
  const quiet = { current: existing, finished: [], open: [], above: [], aboveGoals: [] }

  const toSave = () => fireEvent.click(screen.getByRole('button', { name: /next: save/i }))

  it('shows the existing plan on the save step, completed work included', () => {
    setup(quiet)
    toSave()
    const already = within(screen.getByRole('region', { name: /Already in your .* plan/ }))
    expect(already.getByText('Take Kaleb to an Islanders game in DC')).toBeInTheDocument()
    expect(already.getByText('Research games dates and tickets')).toBeInTheDocument()
    expect(already.getByText('Buy game tickets')).toBeInTheDocument()
    expect(already.getByText('completed')).toBeInTheDocument()
  })

  it('says the plan is unchanged instead of claiming nothing is saved', () => {
    setup(quiet)
    toSave()
    expect(screen.getByText(/plan is unchanged\. Nothing will be written\./)).toBeInTheDocument()
    expect(screen.queryByText('Nothing is saved yet.')).toBeNull()
    expect(screen.queryByText('Nothing chosen.')).toBeNull()
  })

  // Codex live test, 2026-09-24: an unchanged November plan said "Nothing will
  // be written" and then listed every untouched October row under WHAT SAVE
  // WILL CHANGE, as "Left open in October". No changes may sit under a change
  // heading.
  it('never puts an untouched row under "What Save will change"', () => {
    setup({ ...quiet, open: [t({ id: 'o1', title: 'Tile saw' })] })
    // A look-back row means the session opens on the look-back step.
    fireEvent.click(screen.getByRole('button', { name: /next: plan/i }))
    toSave()
    expect(screen.getByText(/plan is unchanged\. Nothing will be written\./)).toBeInTheDocument()
    expect(screen.queryByText('What Save will change')).toBeNull()
    // Still shown, as review context, under a heading that tells the truth.
    const untouched = within(screen.getByRole('region', { name: /Unchanged by Save/ }))
    expect(untouched.getByText('Tile saw')).toBeInTheDocument()
    expect(untouched.getByText(/Left open in/)).toBeInTheDocument()
  })

  it('separates the untouched rows from the ones Save really writes', () => {
    setup({ ...quiet, open: [t({ id: 'o1', title: 'Tile saw' }), t({ id: 'o2', title: 'Library card' })] })
    // One verdict: that row changes, the other does not.
    fireEvent.click(screen.getAllByRole('button', { name: 'Keep' })[1])
    fireEvent.click(screen.getByRole('button', { name: /next: plan/i }))
    toSave()
    const changing = within(screen.getByRole('list', { name: 'What Save will change' }))
    expect(changing.getByText('Library card')).toBeInTheDocument()
    expect(changing.queryByText('Tile saw')).toBeNull()
    const untouched = within(screen.getByRole('region', { name: /Unchanged by Save/ }))
    expect(untouched.getByText('Tile saw')).toBeInTheDocument()
    expect(untouched.queryByText('Library card')).toBeNull()
  })

  it('offers Done, not Save, and closes without writing', () => {
    const onClose = vi.fn()
    const { onSave } = setup({ ...quiet, onClose })
    toSave()
    expect(screen.queryByRole('button', { name: /^Save / })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(onClose).toHaveBeenCalled()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('once something IS proposed, separates it from the existing plan and offers Save', () => {
    setup(quiet)
    fireEvent.change(screen.getByLabelText(/new task for/i), { target: { value: 'Call the box office' } })
    fireEvent.click(screen.getByRole('button', { name: /add task/i }))
    toSave()
    expect(screen.getByText('These changes are not saved yet.')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: /Already in your .* plan/ })).toBeInTheDocument()
    expect(screen.getByText('What Save will change')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Save / })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull()
  })

  // A reflection note is written to the session record, so it IS a change.
  it('treats a reflection note alone as something to save', () => {
    setup({ current: existing, open: [], above: [], aboveGoals: [] })
    fireEvent.change(screen.getByLabelText(/what went well/i), { target: { value: 'the tickets arrived' } })
    fireEvent.click(screen.getByRole('button', { name: /next: plan/i }))
    toSave()
    expect(screen.getByRole('button', { name: /^Save / })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull()
  })
})
