import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import { createMockTask } from '@/test/mocks/factories'
import { WeekList } from './WeekList'

const WEEK = new Date(2026, 9, 4)
const row = (over: Parameters<typeof createMockTask>[0]) => createMockTask({ bucket: 'week', weekStart: WEEK, commitments: [{ level: 'week', periodStart: WEEK, status: 'open' }], ...over })

describe('WeekList', () => {
  afterEach(() => { vi.useRealTimers() })
  it('lists the week\'s tasks, done rows struck and last, with their notes', () => {
    const tasks = [
      row({ id: 'a', title: 'Bike rack', createdAt: new Date(2026, 9, 1), completed: true, commitments: [{ level: 'week', periodStart: WEEK, status: 'done' }] }),
      row({ id: 'b', title: 'Call the plumber', createdAt: new Date(2026, 9, 2), commitments: [{ level: 'week', periodStart: WEEK, status: 'open' }, { level: 'month', periodStart: new Date(2026, 9, 1), status: 'open' }] }),
    ]
    render(<WeekList tasks={tasks} weekStart={WEEK} meId={null} userId="me" isCurrent onToggle={vi.fn()} onSelect={vi.fn()} />)
    const list = within(screen.getByRole('region', { name: "This week's list" }))
    fireEvent.click(list.getByRole('button', { name: 'Completed · 1' }))
    const items = list.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Call the plumber')
    expect(items[0]).toHaveTextContent('from October')
    expect(items[1]).toHaveTextContent('Bike rack')
    expect(list.getByText('Bike rack')).toHaveClass('line-through')
    expect(list.queryByText(/\d+ (open|done|tasks)/)).toBeNull()
  })

  it("the row's note is beside the title button, not part of its name", () => {
    const tasks = [row({ id: 'b', title: 'Call the plumber', commitments: [{ level: 'week', periodStart: WEEK, status: 'open' }, { level: 'month', periodStart: new Date(2026, 9, 1), status: 'open' }] })]
    render(<WeekList tasks={tasks} weekStart={WEEK} meId={null} userId="me" isCurrent onToggle={vi.fn()} onSelect={vi.fn()} />)
    const list = within(screen.getByRole('region', { name: "This week's list" }))
    expect(list.getByRole('button', { name: 'Call the plumber' })).toBeInTheDocument()
    expect(list.getAllByRole('listitem')[0]).toHaveTextContent('from October')
  })

  // Week and Day are execution views of the same work, so the host supplies
  // the same timing control the period pages use. The list stays
  // presentational; it just has to give it a place on the row.
  it('renders the host\'s timing control on each row, beside the title rather than inside it', () => {
    const tasks = [row({ id: 'b', title: 'Call the plumber' })]
    render(<WeekList tasks={tasks} weekStart={WEEK} meId={null} userId="me" isCurrent
      onToggle={vi.fn()} onSelect={vi.fn()}
      timingControl={(t) => <button type="button">When: {t.title}</button>} />)
    const list = within(screen.getByRole('region', { name: "This week's list" }))
    expect(list.getByRole('button', { name: 'When: Call the plumber' })).toBeInTheDocument()
    // Still its own button: the control must not join the title's name.
    expect(list.getByRole('button', { name: 'Call the plumber' })).toBeInTheDocument()
  })

  it('renders no timing slot when the host supplies none', () => {
    render(<WeekList tasks={[row({ id: 'b', title: 'Call the plumber' })]} weekStart={WEEK} meId={null} userId="me" isCurrent
      onToggle={vi.fn()} onSelect={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /^When:/ })).toBeNull()
  })

  // Requirement 4: a dated action belongs under its day, once. The list keeps
  // a truthful count and says where the rows are.
  describe('a dated row is not repeated here', () => {
    const inWeek = new Date(2026, 9, 6)   // Tue of the Oct 4 week
    const outside = new Date(2026, 9, 20) // committed to this week, dated beyond it

    it('counts rows that are on a day this week instead of listing them again', () => {
      const tasks = [
        row({ id: 'a', title: 'Undated one' }),
        row({ id: 'b', title: 'Dated in week', bucket: 'timed', scheduledFor: inWeek, isAllDay: true }),
      ]
      render(<WeekList tasks={tasks} weekStart={WEEK} meId={null} userId="me" isCurrent onToggle={vi.fn()} onSelect={vi.fn()} />)
      const list = within(screen.getByRole('region', { name: "This week's list" }))
      expect(list.getByText('Undated one')).toBeInTheDocument()
      expect(list.queryByText('Dated in week')).toBeNull()
      expect(list.getByText(/1 task is on a day this week/)).toBeInTheDocument()
      expect(list.queryByRole('region', { name: 'Assigned a day' })).toBeNull()
    })

    // It has a date, so "Any day" was a lie; the date is not in this week, so
    // it cannot be under one of this week's days either.
    it('gives a row dated outside this week its own heading, not "Any day"', () => {
      const tasks = [row({ id: 'c', title: 'Dated beyond', bucket: 'timed', scheduledFor: outside, isAllDay: true })]
      render(<WeekList tasks={tasks} weekStart={WEEK} meId={null} userId="me" isCurrent onToggle={vi.fn()} onSelect={vi.fn()} />)
      const list = within(screen.getByRole('region', { name: "This week's list" }))
      expect(within(list.getByRole('region', { name: 'Scheduled outside this week' })).getByText('Dated beyond')).toBeInTheDocument()
      expect(list.queryByRole('region', { name: 'Any day' })).toBeNull()
    })

    it('says nothing about days when nothing is on one', () => {
      render(<WeekList tasks={[row({ id: 'a', title: 'Undated one' })]} weekStart={WEEK} meId={null} userId="me" isCurrent onToggle={vi.fn()} onSelect={vi.fn()} />)
      expect(screen.queryByText(/on a day this week/)).toBeNull()
    })
  })

  it('ticks and opens', () => {
    const onToggle = vi.fn(), onSelect = vi.fn()
    render(<WeekList tasks={[row({ id: 'b', title: 'Call the plumber' })]} weekStart={WEEK} meId={null} userId="me" isCurrent onToggle={onToggle} onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: 'Complete Call the plumber' }))
    expect(onToggle).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }))
    fireEvent.click(screen.getByRole('button', { name: 'Call the plumber' }))
    expect(onSelect).toHaveBeenCalledWith('b')
  })

  it('names another week instead of calling it "this week", keeping the region name stable', () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 8, 30, 9)) // the week of Sep 27 — WEEK is a FUTURE week
    render(<WeekList tasks={[row({ id: 'b', title: 'Call the plumber' })]} weekStart={WEEK} meId={null} userId="me" isCurrent={false} onToggle={vi.fn()} onSelect={vi.fn()} />)
    const list = within(screen.getByRole('region', { name: "This week's list" }))
    expect(list.getByRole('heading', { level: 2 })).toHaveTextContent('List for the week of Oct 4')
    expect(screen.queryByText(/This week's list/)).toBeNull()
  })

  it('empty: says so and offers to plan the week', () => {
    const onPlan = vi.fn()
    render(<WeekList tasks={[]} weekStart={WEEK} meId={null} userId="me" isCurrent onToggle={vi.fn()} onSelect={vi.fn()} onPlan={onPlan} />)
    expect(screen.getByText(/nothing on this week's list in this view yet/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /plan this week/i }))
    expect(onPlan).toHaveBeenCalled()
  })
})

it('adds a task directly and keeps the entry available after a failed save', async () => {
  const onAdd = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined)
  render(<WeekList tasks={[]} weekStart={WEEK} meId={null} userId="me" isCurrent onToggle={vi.fn()} onSelect={vi.fn()} onAdd={onAdd} />)
  fireEvent.click(screen.getByRole('button', { name: /Add task to this week/ }))
  fireEvent.change(screen.getByRole('textbox', { name: 'New week task' }), { target: { value: '  Book car service  ' } })
  fireEvent.click(screen.getByRole('button', { name: 'Add', exact: true }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not add')
  expect(screen.getByRole('textbox')).toHaveValue('  Book car service  ')
  fireEvent.click(screen.getByRole('button', { name: 'Add', exact: true }))
  await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull())
  expect(onAdd).toHaveBeenLastCalledWith('Book car service')
})

describe('the goal a week row serves', () => {
  it('names the goal under a step, so a week reads as commitments not noise', () => {
    // Scott, 2026-09-23: "none of the three weeks coming up say antying about
    // the october goal". goalTitleMap reached dated grid rows only; the week's
    // list, where work with no day lives, showed nothing. The existing "from
    // October" note says which PERIOD a row came from; it never said which
    // outcome the row serves.
    const goal = createMockTask({ id: 'g1', title: 'Take Kaleb to an Islanders game in DC', isGoal: true, bucket: 'month' })
    const step = row({ id: 's1', title: 'research tickets', goalTaskId: 'g1' })
    render(<WeekList tasks={[goal, step]} weekStart={WEEK} meId={null} userId="me" isCurrent onToggle={vi.fn()} onSelect={vi.fn()} />)
    const list = within(screen.getByRole('region', { name: "This week's list" }))
    expect(list.getByText('research tickets')).toBeInTheDocument()
    expect(list.getByText('Take Kaleb to an Islanders game in DC')).toBeInTheDocument()
  })

  it('says nothing for a row that serves no goal', () => {
    render(<WeekList tasks={[row({ id: 's2', title: 'book the car in' })]} weekStart={WEEK} meId={null} userId="me" isCurrent onToggle={vi.fn()} onSelect={vi.fn()} />)
    const list = within(screen.getByRole('region', { name: "This week's list" }))
    expect(list.getByText('book the car in')).toBeInTheDocument()
    expect(list.queryByText(/Islanders/)).not.toBeInTheDocument()
  })
})
