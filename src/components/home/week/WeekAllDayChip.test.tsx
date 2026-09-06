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
})
