import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import { PlanningTaskDrawer } from './PlanningTaskDrawer'
import type { Task } from '@/types/task'

function task(id: string, title: string): Task {
  return { id, title, completed: false, createdAt: new Date(), updatedAt: new Date() } as Task
}
const noop = () => {}

function renderDrawer(over: Partial<React.ComponentProps<typeof PlanningTaskDrawer>> = {}) {
  return render(
    <DndContext>
      <PlanningTaskDrawer
        tasks={[task('a', 'Call VW'), task('b', 'Wash bookbags')]}
        mealTasks={[task('m1', 'Cook Monday dinner'), task('m2', 'Sunday dinner')]}
        view="week"
        onViewChange={noop}
        onPushTask={noop}
        {...over}
      />
    </DndContext>,
  )
}

describe('PlanningTaskDrawer', () => {
  it('renders the three official views and reports a switch', () => {
    const onViewChange = vi.fn()
    renderDrawer({ onViewChange })
    fireEvent.click(screen.getByRole('button', { name: 'This month' }))
    expect(onViewChange).toHaveBeenCalledWith('month')
    expect(screen.getByRole('button', { name: 'This week' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Everything' })).toBeInTheDocument()
  })

  it('collapses meal tasks under a Meals group that expands on click', () => {
    renderDrawer()
    expect(screen.queryByText('Cook Monday dinner')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Meals · 2/ }))
    expect(screen.getByText('Cook Monday dinner')).toBeInTheDocument()
  })

  it('caps loose tasks at 15 behind an expander', () => {
    const many = Array.from({ length: 20 }, (_, i) => task(`t${i}`, `Loose ${i}`))
    renderDrawer({ tasks: many, mealTasks: [] })
    expect(screen.queryByText('Loose 16')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '5 more' }))
    expect(screen.getByText('Loose 16')).toBeInTheDocument()
  })
})
