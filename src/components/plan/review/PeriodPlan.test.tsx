import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { PeriodPlan, type PeriodPlanProps } from './PeriodPlan'
import type { ReviewLine } from './PeriodReview'

const carried = (key: string, title: string, run = vi.fn(async () => true)): ReviewLine =>
  ({ key, title, state: 'open', verbs: [{ label: 'Bring into October', run }, { label: 'Done', run }, { label: 'Let go', run }] })

function mount(over: Partial<PeriodPlanProps> = {}) {
  const props: PeriodPlanProps = {
    periodWord: 'October', itemWord: 'an October goal', loading: false,
    carry: { fromWord: 'September', lines: [carried('a', 'Fix the gate')] },
    parents: { word: 'Fall', goals: [{ key: 'f', title: 'Get outside', children: ['Hike Bear Mountain'], onAdd: vi.fn(async () => true) }] },
    current: ['Hike Bear Mountain', 'Pay taxes'], onAdd: vi.fn(async () => true),
    planned: null, onMark: vi.fn(async () => true), onClose: vi.fn(), ...over,
  }
  const view = render(<PeriodPlan {...props} />)
  return { props, rerender: (next: Partial<PeriodPlanProps>) => view.rerender(<PeriodPlan {...props} {...next} />) }
}

describe('PeriodPlan', () => {
  it('walks the talk’s steps: last period’s leftovers, the goals above, anything else', () => {
    mount()
    expect(screen.getByRole('heading', { name: 'Plan October' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '1. Left from September' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '2. For Fall' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '3. Anything else' })).toBeInTheDocument()
    const left = screen.getByRole('list', { name: 'Left from September' })
    expect(within(left).getAllByRole('button').map((b) => b.textContent)).toEqual(['Bring into October', 'Done', 'Let go'])
    expect(screen.getByText('In October: Hike Bear Mountain')).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'On October so far' })).getAllByRole('listitem')).toHaveLength(2)
    // No day step off the week.
    expect(screen.queryByRole('heading', { name: /Give them a day/ })).toBeNull()
  })

  it('a leftover answered leaves the list and says what happened; Undo brings it back', async () => {
    const run = vi.fn(async () => true)
    const { props, rerender } = mount({ carry: { fromWord: 'September', lines: [carried('a', 'Fix the gate', run)] } })
    fireEvent.click(screen.getByRole('button', { name: 'Bring into October: Fix the gate' }))
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1))
    rerender({ carry: { fromWord: 'September', lines: [] } })
    expect(screen.getByText('Every line from September has an answer.')).toBeInTheDocument()
    expect(screen.getByText('Fix the gate').closest('li')).toHaveTextContent('Bring into October')
    rerender({ carry: props.carry })
    expect(within(screen.getByRole('list', { name: 'Left from September' })).getByText('Fix the gate')).toBeInTheDocument()
  })

  it('adds under a goal above, and on its own; the line clears for the next one', async () => {
    const { props } = mount()
    fireEvent.click(screen.getByRole('button', { name: 'Add to October for Get outside' }))
    const field = screen.getByRole('textbox', { name: 'New line in October for Get outside' })
    fireEvent.change(field, { target: { value: 'Rake leaves' } })
    fireEvent.submit(field.closest('form')!)
    await waitFor(() => expect(props.parents!.goals[0].onAdd).toHaveBeenCalledWith('Rake leaves'))
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'New line in October for Get outside' })).toHaveValue(''))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByRole('button', { name: '+ Add an October goal' }))
    const loose = screen.getByRole('textbox', { name: 'New line in October' })
    fireEvent.change(loose, { target: { value: 'Book the dentist' } })
    fireEvent.submit(loose.closest('form')!)
    await waitFor(() => expect(props.onAdd).toHaveBeenCalledWith('Book the dentist'))
  })

  it('Year has nothing above: its own list is step two', () => {
    mount({ periodWord: '2026', parents: undefined, carry: { fromWord: '2025', lines: [] } })
    expect(screen.getByText('Nothing is left open from 2025.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '2. What 2026 is for' })).toBeInTheDocument()
  })

  it('Week: each task with no day gets the days it can take', async () => {
    const run = vi.fn(async () => true)
    mount({ periodWord: 'this week', place: [{ key: 't', title: 'Call the plumber', days: [{ label: 'Sat 17', run }, { label: 'Sun 18', run }] }] })
    expect(screen.getByRole('heading', { name: '4. Give them a day' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Sun 18: Call the plumber' }))
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1))
  })

  it('I’m happy with October marks it planned, then offers the next horizon down', async () => {
    const next = { label: 'Plan this week →', onClick: vi.fn() }
    const { props } = mount({ next })
    fireEvent.click(screen.getByRole('button', { name: 'I’m happy with October' }))
    await waitFor(() => expect(props.onMark).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('October is planned.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Plan this week →' }))
    expect(next.onClick).toHaveBeenCalled()
  })

  it('a blocked or failed mark says so; an earlier mark is named', async () => {
    mount({ markBlocked: 'Save or discard the draft in Chat first.', planned: { at: new Date(2026, 9, 2), by: 'Iris' } })
    expect(screen.getByText(/October was planned Oct 2 by Iris/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'I’m happy with October' })).toBeDisabled()
  })

  it('a mark that fails leaves it unplanned', async () => {
    mount({ onMark: vi.fn(async () => false) })
    fireEvent.click(screen.getByRole('button', { name: 'I’m happy with October' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t save that.')
    expect(screen.queryByText('October is planned.')).toBeNull()
  })
})
