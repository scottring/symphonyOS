import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RoutinePlacePopover } from './RoutinePlacePopover'
import { createMockRoutine } from '@/test/mocks/factories'
import type { RecurrencePattern } from '@/types/actionable'

const thursday5pm = new Date(2026, 8, 3, 17, 0) // Thu Sep 3, 5:00 PM

describe('RoutinePlacePopover', () => {
  it('offers the rule write for a weekly routine and confirms it by default', () => {
    const onConfirm = vi.fn()
    const routine = createMockRoutine({
      name: 'Trash night',
      time_of_day: null,
      recurrence_pattern: { type: 'weekly' } as RecurrencePattern,
    })
    render(
      <RoutinePlacePopover routine={routine} when={thursday5pm} onConfirm={onConfirm} onCancel={() => {}} canOnce />,
    )
    expect(screen.getByText(/Place "Trash night"/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Every Thursday at 5:00 PM/)).toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'Place' }))
    expect(onConfirm).toHaveBeenCalledWith('rule')
  })

  it('labels a daily routine "Every day" instead of a weekday', () => {
    const routine = createMockRoutine({ name: 'Feed Jax', time_of_day: null })
    render(
      <RoutinePlacePopover routine={routine} when={thursday5pm} onConfirm={() => {}} onCancel={() => {}} canOnce />,
    )
    expect(screen.getByLabelText(/Every day at 5:00 PM/)).toBeInTheDocument()
  })

  it('confirms a one-week placement when that option is chosen', () => {
    const onConfirm = vi.fn()
    const routine = createMockRoutine({ name: 'Trash night', time_of_day: null })
    render(
      <RoutinePlacePopover routine={routine} when={thursday5pm} onConfirm={onConfirm} onCancel={() => {}} canOnce />,
    )
    fireEvent.click(screen.getByLabelText(/Just this Thursday/))
    fireEvent.click(screen.getByRole('button', { name: 'Place' }))
    expect(onConfirm).toHaveBeenCalledWith('once')
  })

  it('hides the one-week option when the host cannot override', () => {
    const routine = createMockRoutine({ name: 'Trash night', time_of_day: null })
    render(
      <RoutinePlacePopover routine={routine} when={thursday5pm} onConfirm={() => {}} onCancel={() => {}} canOnce={false} />,
    )
    expect(screen.queryByLabelText(/Just this Thursday/)).not.toBeInTheDocument()
  })

  it('cancels', () => {
    const onCancel = vi.fn()
    const routine = createMockRoutine({ name: 'Trash night', time_of_day: null })
    render(
      <RoutinePlacePopover routine={routine} when={thursday5pm} onConfirm={() => {}} onCancel={onCancel} canOnce />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalled()
  })
})
