import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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
    fireEvent.click(screen.getByRole('button', { name: /save october/i }))
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
})
