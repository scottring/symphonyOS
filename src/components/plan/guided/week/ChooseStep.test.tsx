import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within, act } from '@testing-library/react'
import type { WeekChoose } from '@/components/home/week/useChooseWeek'
import type { StripDay } from '@/components/plan/deck/WeekStrip'
import { ChooseStep } from './ChooseStep'

const day = (i: number): StripDay => {
  const date = new Date(2026, 10, 1 + i)
  return { key: `d${i}`, date, label: `Day ${i}`, isWeekend: false, past: false, lines: [], more: 0 }
}
const choose = (over: Partial<WeekChoose> = {}): WeekChoose => ({
  monthWord: 'November', notDoneLastWeek: 0,
  lines: [{ key: 'L', title: 'Get the house ready', planned: { kind: 'above', label: 'November' }, counts: '1 on November',
    verbs: [{ label: 'This week', role: 'here', run: vi.fn(async () => true) }], steps: [] }],
  doneLines: [], loose: [], onAddLoose: vi.fn(async () => true),
  placeItems: [{ key: 'p', title: 'Call the plumber', onPlace: vi.fn(async () => true) }], placedCount: 2,
  ...over,
})

describe('ChooseStep — step 5, choose this week’s tasks', () => {
  it('shows the week’s count, the about-15 line, and the month’s lines to choose from', () => {
    render(<ChooseStep count={14} choose={choose()} days={[day(0), day(1)]} />)
    expect(screen.getByText('That’s 14 of about 15.')).toBeInTheDocument()
    expect(screen.getByText('About 15 fits a week. The count is there to see, not a limit.')).toBeInTheDocument()
    // ChoosePlan, compact: the lines as one list, no deck chrome of its own.
    expect(screen.getByRole('list', { name: 'November goals' })).toBeInTheDocument()
    expect(screen.getByText('Get the house ready')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Leave' })).toBeNull()
    expect(screen.queryByRole('radiogroup', { name: 'View' })).toBeNull()
  })

  it('a choice saves through the verbs it was given', async () => {
    const c = choose()
    render(<ChooseStep count={3} choose={c} days={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /Get the house ready/ }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'This week: Get the house ready' })) })
    expect(c.lines[0].verbs[0].run).toHaveBeenCalledTimes(1)
  })

  it('"Give them a day" opens the days inside the step, and comes back to choosing', async () => {
    const c = choose()
    render(<ChooseStep count={3} choose={c} days={[day(0), day(1)]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Give them a day' }))
    expect(screen.getByRole('heading', { name: 'Give them a day' })).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'November goals' })).toBeNull()
    // The count stays above the days.
    expect(screen.getByText('That’s 3 of about 15.')).toBeInTheDocument()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Give “Call the plumber” Day 1' })) })
    expect(c.placeItems[0].onPlace).toHaveBeenCalledWith(new Date(2026, 10, 2))
    fireEvent.click(screen.getByRole('button', { name: 'Back to choosing' }))
    expect(screen.getByRole('list', { name: 'November goals' })).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'November goals' })).getByText('Get the house ready')).toBeInTheDocument()
  })
})
