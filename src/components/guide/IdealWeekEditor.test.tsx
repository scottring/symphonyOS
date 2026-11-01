import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { IdealWeekEditor } from './IdealWeekEditor'
import { IdealWeekSection } from './IdealWeekSection'
import type { IdealWeek } from '@/lib/guide/idealWeek'

const goals = [{ id: 'g1', title: 'Run a 10k' }, { id: 'g2', title: 'Garage clear-out' }]
const week: IdealWeek = { blocks: [{ id: 'b1', label: 'Sleep', hours: 56 }, { id: 'b2', label: 'Running', hours: 3.75, goalId: 'g1', when: 'Mon Wed Fri' }] }

describe('IdealWeekEditor', () => {
  it('starts empty: nothing pre-filled, 168h left', () => {
    render(<IdealWeekEditor value={{ blocks: [] }} goals={goals} onChange={vi.fn()} />)
    expect(screen.getByText('168h')).toBeInTheDocument()
    expect(screen.getByText(/of 168h left/)).toBeInTheDocument()
    expect(screen.getByLabelText('Label for new block')).toHaveValue('')
    expect(screen.queryByDisplayValue(/sleep/i)).toBeNull()
  })

  it('shows what is left from the blocks', () => {
    render(<IdealWeekEditor value={week} goals={goals} onChange={vi.fn()} />)
    expect(screen.getByText('108h 15m')).toBeInTheDocument()
  })

  it('shows a negative left in the danger style', () => {
    render(<IdealWeekEditor value={{ blocks: [{ id: 'x', label: 'Everything', hours: 170.5 }] }} goals={[]} onChange={vi.fn()} />)
    const b = screen.getByText('-2h 30m')
    expect(b.closest('.guide-iw-left')).toHaveAttribute('data-over')
  })

  it('adds a block only on blur, not per keystroke, and clears the new row', () => {
    const onChange = vi.fn()
    render(<IdealWeekEditor value={{ blocks: [] }} goals={goals} onChange={onChange} />)
    const label = screen.getByLabelText('Label for new block')
    const hours = screen.getByLabelText('Hours for new block')
    fireEvent.change(label, { target: { value: 'Work' } })
    fireEvent.change(hours, { target: { value: '5 x 9h' } })
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.blur(hours)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0].blocks).toEqual([expect.objectContaining({ label: 'Work', hours: 45 })])
    expect(label).toHaveValue('')
  })

  it('commits on Enter', () => {
    const onChange = vi.fn()
    render(<IdealWeekEditor value={week} goals={goals} onChange={onChange} />)
    const hours = screen.getByLabelText('Hours for Sleep')
    hours.focus()
    fireEvent.change(hours, { target: { value: '6 x 8h' } })
    fireEvent.keyDown(hours, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith({ blocks: [{ id: 'b1', label: 'Sleep', hours: 48 }, week.blocks[1]] })
  })

  it('edits hours as typed and keeps other blocks', () => {
    const onChange = vi.fn()
    render(<IdealWeekEditor value={week} goals={goals} onChange={onChange} />)
    const hours = screen.getByLabelText('Hours for Sleep')
    fireEvent.change(hours, { target: { value: '49h' } })
    fireEvent.blur(hours)
    expect(onChange).toHaveBeenCalledWith({ blocks: [{ id: 'b1', label: 'Sleep', hours: 49 }, week.blocks[1]] })
  })

  it('does not commit an unreadable amount and says what works', () => {
    const onChange = vi.fn()
    render(<IdealWeekEditor value={week} goals={goals} onChange={onChange} />)
    const hours = screen.getByLabelText('Hours for Sleep')
    fireEvent.change(hours, { target: { value: 'lots' } })
    fireEvent.blur(hours)
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/3h 45m/)
  })

  it('does not call onChange when nothing changed', () => {
    const onChange = vi.fn()
    render(<IdealWeekEditor value={week} goals={goals} onChange={onChange} />)
    fireEvent.blur(screen.getByLabelText('Label for Sleep'))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('links a block to a goal and clears it', () => {
    const onChange = vi.fn()
    render(<IdealWeekEditor value={week} goals={goals} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Goal for Sleep'), { target: { value: 'g2' } })
    expect(onChange.mock.calls[0][0].blocks[0]).toEqual({ id: 'b1', label: 'Sleep', hours: 56, goalId: 'g2' })
    fireEvent.change(screen.getByLabelText('Goal for Running'), { target: { value: '' } })
    expect(onChange.mock.calls[1][0].blocks[1]).toEqual({ id: 'b2', label: 'Running', hours: 3.75, when: 'Mon Wed Fri' })
  })

  it('leaving a field whose shown amount is unchanged writes nothing, even when the stored hours are finer than a minute', () => {
    const onChange = vi.fn()
    render(<IdealWeekEditor value={{ blocks: [{ id: 'x', label: 'Reading', hours: 1 / 3 }] }} goals={[]} onChange={onChange} />)
    const hours = screen.getByLabelText('Hours for Reading')
    expect(hours).toHaveValue('20m')
    fireEvent.blur(hours)
    fireEvent.blur(screen.getByLabelText('When for Reading'))
    expect(onChange).not.toHaveBeenCalled()
    // Changing the words still writes, and keeps the hours as they were.
    fireEvent.change(screen.getByLabelText('Label for Reading'), { target: { value: 'Reading aloud' } })
    fireEvent.blur(screen.getByLabelText('Label for Reading'))
    expect(onChange).toHaveBeenCalledWith({ blocks: [{ id: 'x', label: 'Reading aloud', hours: 1 / 3 }] })
  })

  it('the new row is added only when focus leaves the row, so a goal picked next lands on it', () => {
    const onChange = vi.fn()
    render(<IdealWeekEditor value={{ blocks: [] }} goals={goals} onChange={onChange} />)
    const label = screen.getByLabelText('Label for new block')
    const hours = screen.getByLabelText('Hours for new block')
    const goal = screen.getByLabelText('Goal for new block')
    fireEvent.change(label, { target: { value: 'Training' } })
    fireEvent.blur(label, { relatedTarget: hours })
    fireEvent.change(hours, { target: { value: '3h' } })
    fireEvent.blur(hours, { relatedTarget: goal })
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.change(goal, { target: { value: 'g1' } })
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.blur(goal, { relatedTarget: document.body })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0].blocks).toEqual([expect.objectContaining({ label: 'Training', hours: 3, goalId: 'g1' })])
    expect(label).toHaveValue('')
    expect(goal).toHaveValue('')
  })

  it('an unreadable amount stops saying so as soon as it is retyped', () => {
    render(<IdealWeekEditor value={week} goals={goals} onChange={vi.fn()} />)
    const hours = screen.getByLabelText('Hours for Sleep')
    fireEvent.change(hours, { target: { value: 'lots' } })
    fireEvent.blur(hours)
    expect(hours).toHaveAttribute('aria-invalid', 'true')
    fireEvent.change(hours, { target: { value: '5' } })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(hours).not.toHaveAttribute('aria-invalid')
  })

  it('removes a block', () => {
    const onChange = vi.fn()
    render(<IdealWeekEditor value={week} goals={goals} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove Sleep' }))
    expect(onChange).toHaveBeenCalledWith({ blocks: [week.blocks[1]] })
  })
})

describe('IdealWeekSection', () => {
  it('renders nothing without blocks', () => {
    const { container } = render(<IdealWeekSection value={{ blocks: [] }} goals={goals} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('is read-only: no inputs; shows rows with goal title and when', () => {
    render(<IdealWeekSection value={week} goals={goals} />)
    expect(screen.queryByRole('textbox')).toBeNull()
    const rows = within(screen.getByRole('list', { name: 'Blocks' }))
    expect(rows.getByText(/Run a 10k · Mon Wed Fri/)).toBeInTheDocument()
    expect(rows.getByText('3h 45m')).toBeInTheDocument()
    expect(screen.getByRole('img')).toHaveAccessibleName(/56h committed, 3h 45m for goals, 108h 15m free/)
    expect(screen.getByText('108h 15m', { selector: 'b' })).toBeInTheDocument()
  })
})
