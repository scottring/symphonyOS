import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import { PlanLine, type LineActions } from './PlanLine'
import type { Task } from '@/types/task'

const line = (t: Task, actions: LineActions) => render(
  <DndContext><ul><PlanLine vm={{ task: t, fate: 'open', partOf: null, where: null }} actions={actions} members={[]} nextLabel="November" open={false} onToggle={vi.fn()} editable={false} /></ul></DndContext>,
)

// The card language (2026-10-07): a period list's line wears the task's icon,
// which is also its check — the mark every page uses.
describe('PlanLine — the icon tile is the check', () => {
  it('finishes the line from its tile', () => {
    const done = vi.fn()
    const t = { id: 'm1', title: 'Plan Thanksgiving', completed: false, createdAt: new Date() } as Task
    line(t, { done, carry: vi.fn(), drop: vi.fn(), assign: vi.fn(), details: vi.fn(), rename: vi.fn(), openPartOf: vi.fn() } as unknown as LineActions)
    fireEvent.click(screen.getByRole('button', { name: 'Done: Plan Thanksgiving' }))
    expect(done).toHaveBeenCalledWith(t)
  })

  it('a finished line says so on its tile, and offers to reopen', () => {
    const t = { id: 'm2', title: 'Buy Ella a helmet', completed: true, createdAt: new Date() } as Task
    line(t, { done: vi.fn(), carry: vi.fn(), drop: vi.fn(), assign: vi.fn(), details: vi.fn(), rename: vi.fn(), openPartOf: vi.fn() } as unknown as LineActions)
    expect(screen.getByRole('button', { name: 'Mark not done: Buy Ella a helmet' })).toHaveAttribute('aria-pressed', 'true')
  })
})
