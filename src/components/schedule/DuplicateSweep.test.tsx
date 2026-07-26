import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { TimelineItem } from '@/types/timeline'
import { findDuplicates } from '@/lib/today/duplicates'
import { DuplicateSweep } from './DuplicateSweep'

const item = (over: Partial<TimelineItem> & { id: string; title: string }): TimelineItem => ({
  type: 'task', startTime: null, endTime: null, completed: false, ...over,
} as TimelineItem)

function setup(items: TimelineItem[]) {
  const onKeepOne = vi.fn()
  const onSkipRoutineToday = vi.fn()
  const onClose = vi.fn()
  render(
    <DuplicateSweep
      pairs={findDuplicates(items)}
      onClose={onClose}
      onKeepOne={onKeepOne}
      onSkipRoutineToday={onSkipRoutineToday}
    />
  )
  return { onKeepOne, onSkipRoutineToday, onClose }
}

describe('DuplicateSweep', () => {
  const sameType = [
    item({ id: 'task-bare', title: 'Buy milk' }),
    item({ id: 'task-rich', title: 'Buy milk', notes: 'oat, not skim' }),
  ]

  it('shows the duplicated title once, with each copy listed', () => {
    setup(sameType)
    expect(screen.getByText('Buy milk')).toBeInTheDocument()
    // Each copy is described by the context it carries, so the choice is
    // legible without opening either one.
    expect(screen.getByText('notes')).toBeInTheDocument()
    expect(screen.getByText('no extra context')).toBeInTheDocument()
  })

  it('"Keep the one with context" keeps the richer copy and drops the rest', async () => {
    const user = userEvent.setup()
    const { onKeepOne } = setup(sameType)
    await user.click(screen.getByRole('button', { name: /keep the one with context/i }))
    expect(onKeepOne).toHaveBeenCalledWith('rich', ['bare'])
  })

  it('"Keep both" resolves nothing — it only dismisses', async () => {
    const user = userEvent.setup()
    const { onKeepOne } = setup(sameType)
    await user.click(screen.getByRole('button', { name: /keep both/i }))
    expect(onKeepOne).not.toHaveBeenCalled()
    expect(screen.getByText(/nothing left to sweep/i)).toBeInTheDocument()
  })

  it('a CROSS-TYPE group offers no delete at all', () => {
    setup([
      item({ id: 'task-1', title: 'Water plants' }),
      item({ id: 'routine-r1', title: 'Water plants', type: 'routine' }),
    ])
    // Deleting a routine would remove it from every day, not just today.
    expect(screen.queryByRole('button', { name: /keep the one with context/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /skip the routine today/i })).toBeInTheDocument()
  })

  it('skipping a routine passes its BARE id, dose suffix stripped', async () => {
    const user = userEvent.setup()
    const { onSkipRoutineToday } = setup([
      item({ id: 'task-1', title: 'Take meds' }),
      item({ id: 'routine-r9#2', title: 'Take meds', type: 'routine' }),
    ])
    await user.click(screen.getByRole('button', { name: /skip the routine today/i }))
    expect(onSkipRoutineToday).toHaveBeenCalledWith('r9')
  })

  it('says so plainly when there is nothing to sweep', () => {
    setup([item({ id: 'task-1', title: 'Buy milk' })])
    expect(screen.getByText(/nothing left to sweep/i)).toBeInTheDocument()
  })

  it('closes on the close control', async () => {
    const user = userEvent.setup()
    const { onClose } = setup(sameType)
    await user.click(screen.getByRole('button', { name: /close duplicate sweep/i }))
    expect(onClose).toHaveBeenCalled()
  })
})
