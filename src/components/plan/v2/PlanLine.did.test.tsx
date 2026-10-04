import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import { PlanLine, type LineActions } from './PlanLine'
import type { Task } from '@/types/task'

const actions = { done: vi.fn(), carry: vi.fn(), drop: vi.fn(), assign: vi.fn(), details: vi.fn(), rename: vi.fn(), openPartOf: vi.fn() } as unknown as LineActions

// Scott, 2026-10-04: the month line shows what the weeks did for it, so a line
// with nothing under it stands out when the month is reviewed.
describe('PlanLine — what the weeks did', () => {
  it('lists the week items written for the line, done ones struck', () => {
    const t = { id: 'm1', title: 'fix up the porch', completed: false, createdAt: new Date() } as Task
    render(<DndContext><ul><PlanLine vm={{ task: t, fate: 'open', partOf: null, where: null, did: [
      { id: 'a', title: 'Porch — first coat', done: true, when: 'Sat' },
      { id: 'b', title: 'Porch — second coat', done: false, when: 'Sun' },
    ] }} actions={actions} members={[]} nextLabel="November" open={false} onToggle={vi.fn()} editable={false} /></ul></DndContext>)
    expect(screen.getByText('Porch — first coat')).toHaveClass('is-done')
    expect(screen.getByText('Porch — second coat')).toBeInTheDocument()
  })
})
