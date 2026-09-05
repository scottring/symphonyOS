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

  it('Routines tab lists draggable routines with their temporal parameters', () => {
    renderDrawer({ view: 'routines', routines: [routine('r1', 'Food shopping')], mealTasks: [] })
    expect(screen.getByText('Food shopping')).toBeInTheDocument()
    expect(screen.getByText('Weekly · Sat · no set time')).toBeInTheDocument()
    // Task pool stays out of the Routines tab
    expect(screen.queryByText('Call VW')).not.toBeInTheDocument()
  })

  // A routine with no time needs a slot exactly the way an unscheduled task
  // does. On its own tab you had to remember to go looking for it before the
  // week was blocked out, so it stayed unblocked (Scott, 2026-09-05).
  it('carries routines into this week, grouped after the tasks', () => {
    renderDrawer({ view: 'week', routines: [routine('r1', 'Food shopping')] })
    expect(screen.getByText('Food shopping')).toBeInTheDocument()
    expect(screen.getByText('Call VW')).toBeInTheDocument()
    expect(screen.getByText(/Routines · 1/)).toBeInTheDocument()
  })

  it('carries routines into Everything too', () => {
    renderDrawer({ view: 'all', routines: [routine('r1', 'Food shopping')] })
    expect(screen.getByText('Food shopping')).toBeInTheDocument()
  })

  // 'This month' is a BUCKET view — it answers "what did I put in the month
  // bucket", and a routine has no bucket.
  it('leaves routines out of the month bucket', () => {
    renderDrawer({ view: 'month', routines: [routine('r1', 'Food shopping')] })
    expect(screen.queryByText('Food shopping')).not.toBeInTheDocument()
  })

  it('counts routines in the Unscheduled badge', () => {
    renderDrawer({ view: 'week', mealTasks: [], routines: [routine('r1', 'A'), routine('r2', 'B')] })
    // 2 loose tasks + 2 routines
    expect(screen.getByText('4')).toBeInTheDocument()
  })

  // The group is a label, not a disclosure: routines you have to expand are
  // routines you forget to block.
  it('shows the routines group expanded, with no toggle to open', () => {
    renderDrawer({ view: 'week', routines: [routine('r1', 'Food shopping')] })
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
})
