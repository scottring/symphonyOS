import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '@/test/test-utils'
import type { ChoiceOption } from '@/types/choice'
import type { LogEntry } from '@/types/goalLog'
import { localYmd } from '@/lib/choices/log'

const { run, writers, state } = vi.hoisted(() => ({
  run: vi.fn(async (_l: string, command: () => Promise<unknown>) => (await command()) !== false),
  writers: {
    addLogEntry: vi.fn(), updateLogEntry: vi.fn(async () => true), deleteLogEntry: vi.fn(async () => true),
    planEvent: vi.fn(async () => 'tnew'), updateOption: vi.fn(async () => true), deleteTask: vi.fn(async () => true),
  },
  state: { entries: [] as unknown[], rows: [] as unknown[] },
}))
vi.mock('@/contexts/CanvasActivityContext', () => ({ useCanvasActivity: () => ({ run }) }))
vi.mock('@/hooks/useLogWriters', () => ({ useLogWriters: () => writers }))
vi.mock('@/hooks/useMemberName', () => ({ useMemberName: () => () => 'Scott' }))
vi.mock('@/hooks/useGoalLog', async () => {
  const { mergeLog: merge } = await import('@/lib/choices/log')
  return { useGoalLog: () => ({ log: merge(state.entries as LogEntry[], [], new Date()), entries: state.entries, loading: false, refetch: vi.fn() }) }
})
vi.mock('@/hooks/useChoices', () => ({ useGoalChoices: () => ({ rows: state.rows }) }))
vi.mock('react-router-dom', async (orig) => ({ ...(await orig<typeof import('react-router-dom')>()), useNavigate: () => vi.fn() }))

import { GoalLogSection } from './GoalLogSection'

const goal = { kind: 'task', id: 'g1' } as const
const entry = (n: number): LogEntry => ({
  id: `e${n}`, userId: 'scott', goal, kind: 'call', on: `2026-10-${String(10 + n).padStart(2, '0')}`,
  summary: `Call number ${n}`, createdAt: new Date(2026, 9, 10 + n),
})
const opt = (id: string, name: string, status: ChoiceOption['status']): ChoiceOption => ({
  id, choiceId: 'c1', userId: 'u', name, status, statusChangedAt: new Date(), values: {}, sortOrder: 1, updatedAt: new Date(),
})
const dayFrom = (days: number) => { const d = new Date(); d.setDate(d.getDate() + days); return d }

describe('GoalLogSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    writers.addLogEntry.mockImplementation(async (i: { goal: typeof goal; summary: string }) => ({ ...entry(9), id: 'new', summary: i.summary }))
    state.entries = [1, 2, 3, 4, 5].map(entry)
    state.rows = [
      { choice: { id: 'c1', status: 'open' }, options: [opt('mar', 'Martinez', 'considering')], followUps: [] },
      { choice: { id: 'c2', status: 'decided' }, options: [opt('old', 'Decided Co', 'chosen')], followUps: [] },
    ]
  })
  const show = () => render(<GoalLogSection goal={goal} goalContext="family" goalScope="compound" />)

  it('shows the latest 3 done lines and All N', () => {
    show()
    expect(screen.getByText(/Call number 5/)).toBeInTheDocument()
    expect(screen.getByText(/Call number 3/)).toBeInTheDocument()
    expect(screen.queryByText(/Call number 2/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'All 5' })).toBeInTheDocument()
  })

  it('+ Log saves a project note with no option', async () => {
    show()
    await userEvent.click(screen.getByRole('button', { name: '+ Log' }))
    const d = screen.getByRole('dialog')
    expect(within(d).getByLabelText('About')).toHaveDisplayValue('The project (no one contractor)')
    // only open choices' options
    expect(within(d).queryByRole('option', { name: 'Decided Co' })).not.toBeInTheDocument()
    await userEvent.click(within(d).getByRole('button', { name: 'Note' }))
    await userEvent.type(within(d).getByLabelText("What happened, or what it's for"), 'Measured the hall')
    await userEvent.click(within(d).getByRole('button', { name: 'Save' }))
    expect(writers.addLogEntry).toHaveBeenCalledWith({ goal, kind: 'note', on: localYmd(new Date()), summary: 'Measured the hall' })
    expect(writers.updateOption).not.toHaveBeenCalled()
    expect(run.mock.calls[0][0]).toBe('Log')
  })

  it('a future date plans a task with the goal keys, and a call sets Contacted', async () => {
    show()
    await userEvent.click(screen.getByRole('button', { name: '+ Log' }))
    const d = screen.getByRole('dialog')
    const later = localYmd(dayFrom(3))
    fireEvent.change(within(d).getByLabelText('When'), { target: { value: later } })
    await userEvent.selectOptions(within(d).getByLabelText('About'), 'mar')
    await userEvent.type(within(d).getByLabelText("What happened, or what it's for"), 'Estimate visit')
    await userEvent.click(within(d).getByRole('button', { name: 'Save' }))
    expect(writers.planEvent).toHaveBeenCalledWith(expect.objectContaining({
      goal, goalContext: 'family', goalScope: 'compound', optionId: 'mar', optionName: 'Martinez', kind: 'call', on: later,
    }))
    expect(writers.addLogEntry).not.toHaveBeenCalled()
    expect(writers.updateOption).toHaveBeenCalledWith('mar', { status: 'contacted' })
  })
})
