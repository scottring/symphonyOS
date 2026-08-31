import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import { PlanningTaskCard } from './PlanningTaskCard'
import type { Task } from '@/types/task'

const task = {
  id: 't1',
  title: 'Call VW',
  completed: false,
  createdAt: new Date(),
  updatedAt: new Date(),
} as Task

function renderCard(over: Partial<React.ComponentProps<typeof PlanningTaskCard>> = {}) {
  return render(
    <DndContext>
      <PlanningTaskCard task={task} {...over} />
    </DndContext>,
  )
}

describe('PlanningTaskCard actions', () => {
  it('completes on the circle tap', () => {
    const onComplete = vi.fn()
    renderCard({ onComplete })
    fireEvent.click(screen.getByRole('button', { name: 'Complete Call VW' }))
    expect(onComplete).toHaveBeenCalledWith('t1')
  })

  it('offers "Not this week" and reports it', () => {
    const onNotThisWeek = vi.fn()
    renderCard({ onNotThisWeek })
    fireEvent.click(screen.getByRole('button', { name: 'Not this week — move to next week' }))
    expect(onNotThisWeek).toHaveBeenCalledWith('t1')
  })

  it('renders neither action without handlers', () => {
    renderCard()
    expect(screen.queryByRole('button', { name: /Complete/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Not this week/ })).not.toBeInTheDocument()
  })
})
