import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RoutinesHabitsPanel } from './RoutinesHabitsPanel'
import type { Routine } from '@/types/routine'

const r = (id: string, time: string): Routine =>
  ({ id, name: id, time_of_day: time, recurrence_pattern: { type: 'daily' }, is_active: true } as unknown as Routine)

describe('RoutinesHabitsPanel', () => {
  const routines = [r('Stretch', '07:00:00'), r('Walk', '13:00:00'), r('WindDown', '21:00:00')]

  it('renders three part-of-day columns with the routines', () => {
    render(<RoutinesHabitsPanel routines={routines} isCompleted={() => false} onToggle={() => {}} />)
    expect(screen.getByText('Morning')).toBeInTheDocument()
    expect(screen.getByText('Afternoon')).toBeInTheDocument()
    expect(screen.getByText('Evening')).toBeInTheDocument()
    expect(screen.getByText('Stretch')).toBeInTheDocument()
  })

  it('calls onToggle with the inverse of current completion when a routine is checked', () => {
    const onToggle = vi.fn()
    render(<RoutinesHabitsPanel routines={routines} isCompleted={(id) => id === 'Stretch'} onToggle={onToggle} />)
    fireEvent.click(screen.getByRole('button', { name: /mark stretch/i }))
    expect(onToggle).toHaveBeenCalledWith('Stretch', false)
    fireEvent.click(screen.getByRole('button', { name: /mark walk/i }))
    expect(onToggle).toHaveBeenCalledWith('Walk', true)
  })
})
