import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import { PlanningTaskDrawer } from './PlanningTaskDrawer'
import type { Task } from '@/types/task'

function task(id: string, title: string): Task {
  return { id, title, completed: false, createdAt: new Date(), updatedAt: new Date() } as Task
}
function routine(id: string, name: string) {
  return {
    id,
    name,
    recurrence_pattern: { type: 'weekly', days: ['sat'] },
    time_of_day: null,
    is_active: true,
  } as never
}
const noop = () => {}

function renderDrawer(over: Partial<React.ComponentProps<typeof PlanningTaskDrawer>> = {}) {
  return render(
    <DndContext>
      <PlanningTaskDrawer
        tasks={[task('a', 'Call VW'), task('b', 'Wash bookbags')]}
        mealTasks={[task('m1', 'Cook Monday dinner'), task('m2', 'Sunday dinner')]}
        onPushTask={noop}
        {...over}
      />
    </DndContext>,
  )
}

describe('PlanningTaskDrawer', () => {
  it('collapses meal tasks under a Meals group that expands on click', () => {
    renderDrawer()
    expect(screen.queryByText('Cook Monday dinner')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Meals · 2/ }))
    expect(screen.getByText('Cook Monday dinner')).toBeInTheDocument()
  })

  // A routine with no time needs a slot exactly the way an unscheduled task
  // does. On its own tab you had to remember to go looking for it before the
  // week was blocked out, so it stayed unblocked (Scott, 2026-09-05).
  it('carries routines into the list, grouped after the tasks', () => {
    renderDrawer({ routines: [routine('r1', 'Food shopping')] })
    expect(screen.getByText('Food shopping')).toBeInTheDocument()
    expect(screen.getByText('Call VW')).toBeInTheDocument()
    expect(screen.getByText(/Routines · 1/)).toBeInTheDocument()
  })

  it('counts routines in the badge', () => {
    renderDrawer({ mealTasks: [], routines: [routine('r1', 'A'), routine('r2', 'B')] })
    // 2 loose tasks + 2 routines
    expect(screen.getByText('4')).toBeInTheDocument()
  })

  // The group is a label, not a disclosure: routines you have to expand are
  // routines you forget to block.
  it('shows the routines group expanded, with no toggle to open', () => {
    renderDrawer({ routines: [routine('r1', 'Food shopping')] })
    expect(screen.queryByRole('button', { name: /Routines · 1/ })).not.toBeInTheDocument()
    expect(screen.getByText('Food shopping')).toBeInTheDocument()
  })

  it('caps loose tasks at 15 behind an expander', () => {
    const many = Array.from({ length: 20 }, (_, i) => task(`t${i}`, `Loose ${i}`))
    renderDrawer({ tasks: many, mealTasks: [] })
    expect(screen.queryByText('Loose 16')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '5 more' }))
    expect(screen.getByText('Loose 16')).toBeInTheDocument()
  })

  // The drawer is the week list, full stop. Day planning references the week;
  // there is no month or backlog tab to wander into (Scott, 2026-09-05).
  it('is the week list with no view tabs', () => {
    renderDrawer()
    expect(screen.getByText('This week')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'This month' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Everything' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Routines' })).not.toBeInTheDocument()
  })
})
