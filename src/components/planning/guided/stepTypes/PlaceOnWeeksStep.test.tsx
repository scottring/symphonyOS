// The monthly arc's place-rocks: month moves land on WEEK rows, with the same
// write the /month page performs — bucket='week' + week_start, scheduledFor
// cleared. periodStart in the harness is July 2026.
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { PlaceOnWeeksStep } from './PlaceOnWeeksStep'
import { renderStep, makeHost } from './testHarness'
import type { Task } from '@/types/task'
import type { GuidedStepConfig } from '../types'

const step: GuidedStepConfig = {
  id: 'place-on-weeks', type: 'place-on-weeks', title: 'Place the moves on weeks',
  narration: 'Drag each move onto a week row.',
}

const t = (over: Partial<Task>): Task => ({
  id: 'm1', title: 'Order the vanity', completed: false,
  createdAt: new Date(), updatedAt: new Date(), bucket: 'month',
  ...over,
} as Task)

describe('PlaceOnWeeksStep', () => {
  it('shows this month\'s unplaced moves in the rocks rail', () => {
    renderStep(<PlaceOnWeeksStep />, { step, host: makeHost({ tasks: [t({})] }) })
    expect(screen.getByText('Order the vanity')).toBeInTheDocument()
    expect(screen.getByText(/0 placed · 1 to place/)).toBeInTheDocument()
  })

  it('dropping a move on a row writes the WEEK placement the /month page writes', () => {
    const host = makeHost({ tasks: [t({})] })
    renderStep(<PlaceOnWeeksStep />, { step, host })
    // The step renders the same week strips /month does — drop on a ROW, which
    // is the only grain this rung accepts.
    fireEvent.drop(screen.getByTestId('week-row-2'), {
      dataTransfer: { getData: () => 'm1' },
    })
    expect(host.onUpdateTask).toHaveBeenCalledTimes(1)
    const [id, updates] = vi.mocked(host.onUpdateTask).mock.calls[0]
    expect(id).toBe('m1')
    expect(updates.bucket).toBe('week')
    expect(updates.weekStart).toBeInstanceOf(Date)
    expect(updates.scheduledFor).toBeUndefined()
  })

  it('counts a week-placed move inside the month as PLACED, not vanished', () => {
    const placedOnWeek = t({ id: 'w1', title: 'Buy the paint', bucket: 'week', weekStart: new Date(2026, 6, 13) })
    renderStep(<PlaceOnWeeksStep />, { step, host: makeHost({ tasks: [t({}), placedOnWeek] }) })
    expect(screen.getByText(/1 placed · 1 to place/)).toBeInTheDocument()
  })

  it('dragging a placed move back to the rail clears its week', () => {
    const placedOnWeek = t({ id: 'w1', title: 'Buy the paint', bucket: 'week', weekStart: new Date(2026, 6, 13) })
    const host = makeHost({ tasks: [placedOnWeek] })
    renderStep(<PlaceOnWeeksStep />, { step, host })
    fireEvent.drop(screen.getByText(/Drag a placed item here to unplace it/), {
      dataTransfer: { getData: () => 'w1' },
    })
    expect(host.onUpdateTask).toHaveBeenCalledWith('w1', { bucket: 'month', scheduledFor: undefined, weekStart: undefined })
  })
})
