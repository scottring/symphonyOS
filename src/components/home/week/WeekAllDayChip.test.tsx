import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import { WeekAllDayChip } from './WeekAllDayChip'
import type { Task } from '@/types/task'

const task = {
  id: 'a',
  title: 'Specials - Ella: Visual Arts and Library',
  completed: false,
  createdAt: new Date(),
  updatedAt: new Date(),
} as Task

describe('WeekAllDayChip', () => {
  // The all-day lane grows with its chips, so a chip wraps to two lines
  // rather than cutting a title at the first word.
  it('wraps a long title to two lines instead of truncating', () => {
    render(
      <DndContext>
        <WeekAllDayChip task={task} onSelect={vi.fn()} />
      </DndContext>,
    )
    const chip = screen.getByText('Specials - Ella: Visual Arts and Library')
    expect(chip.className).not.toMatch(/\btruncate\b/)
    expect(chip.className).toMatch(/line-clamp-2/)
  })

  // Scott, 2026-09-07: a card whose day passed without a tick is back on the
  // week's list. What stays on the day is a record, not a commitment.
  it('fades a chip whose day passed without a tick', () => {
    const missed = { ...task, scheduledFor: new Date(Date.now() - 2 * 86_400_000) } as Task
    render(
      <DndContext>
        <WeekAllDayChip task={missed} onSelect={vi.fn()} />
      </DndContext>,
    )
    expect(screen.getByTitle(missed.title).className).toMatch(/border-dashed/)
  })

  it('leaves a chip on a day still ahead alone', () => {
    const ahead = { ...task, scheduledFor: new Date(Date.now() + 2 * 86_400_000) } as Task
    render(
      <DndContext>
        <WeekAllDayChip task={ahead} onSelect={vi.fn()} />
      </DndContext>,
    )
    expect(screen.getByTitle(ahead.title).className).not.toMatch(/border-dashed/)
  })

  it('leaves a chip that was ticked on its day alone', () => {
    const done = { ...task, completed: true, scheduledFor: new Date(Date.now() - 2 * 86_400_000) } as Task
    render(
      <DndContext>
        <WeekAllDayChip task={done} onSelect={vi.fn()} />
      </DndContext>,
    )
    expect(screen.getByTitle(done.title).className).not.toMatch(/border-dashed/)
  })
})
