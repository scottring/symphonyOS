import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import { PlanningShelf, SHELF_COLLAPSED_COUNT } from './PlanningShelf'
import type { PlanningShelfProps } from './PlanningShelf'
import type { Task } from '@/types/task'
import type { TendState } from '@/hooks/useTendWeek'

function task(id: string, title: string, projectId?: string): Task {
  return { id, title, projectId, completed: false, createdAt: new Date(), updatedAt: new Date() } as Task
}

const idleTend: TendState = {
  status: 'idle', aiLoading: false, aiError: null, proposals: [],
  start: vi.fn(), remove: vi.fn(), done: vi.fn(),
}

function renderShelf(overrides: Partial<PlanningShelfProps> = {}) {
  const props: PlanningShelfProps = {
    tasks: [task('c1', 'Ask for YNAB refund'), task('p1', 'Weed the backyard', 'proj'), task('l1', 'Make a chore plan')],
    carryOverIds: new Set(['c1']),
    projectsMap: new Map([['proj', { id: 'proj', name: 'Backyards' }]]),
    tasksById: new Map(),
    onOpenTask: vi.fn(), onSetBucket: vi.fn(), onDeleteTask: vi.fn(), onPushTask: vi.fn(),
    draft: '', onDraftChange: vi.fn(), onSubmitDraft: vi.fn(),
    tend: idleTend, onApplyProposal: vi.fn(),
    ...overrides,
  }
  render(<DndContext><PlanningShelf {...props} /></DndContext>)
  return props
}

describe('PlanningShelf', () => {
  it('orders pills carried-over → project → loose and never truncates titles', () => {
    renderShelf()
    const titles = screen.getAllByTestId('shelf-pill-title').map((el) => el.textContent)
    expect(titles).toEqual(['Ask for YNAB refund', 'Weed the backyard', 'Make a chore plan'])
    for (const el of screen.getAllByTestId('shelf-pill-title')) {
      expect(el.className).not.toMatch(/truncate|line-clamp/)
    }
  })

  it('collapses past SHELF_COLLAPSED_COUNT behind a +N more toggle', () => {
    const many = Array.from({ length: SHELF_COLLAPSED_COUNT + 3 }, (_, i) => task(`t${i}`, `Task number ${i}`))
    renderShelf({ tasks: many, carryOverIds: new Set() })
    expect(screen.getAllByTestId('shelf-pill-title')).toHaveLength(SHELF_COLLAPSED_COUNT)
    fireEvent.click(screen.getByRole('button', { name: /3 more/i }))
    expect(screen.getAllByTestId('shelf-pill-title')).toHaveLength(SHELF_COLLAPSED_COUNT + 3)
  })

  it('pill menu routes To month / Put aside / Delete / Open to the right callbacks', () => {
    const props = renderShelf()
    fireEvent.click(screen.getAllByLabelText('Task actions')[0]) // c1's ⋯
    fireEvent.click(screen.getByRole('menuitem', { name: 'To month' }))
    expect(props.onSetBucket).toHaveBeenCalledWith('c1', 'month')
  })

  it('clicking outside the ⋯ menu closes it', () => {
    renderShelf()
    fireEvent.click(screen.getAllByLabelText('Task actions')[0]) // c1's ⋯
    expect(screen.getByRole('menuitem', { name: 'Open' })).toBeInTheDocument()
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('menuitem', { name: 'Open' })).not.toBeInTheDocument()
  })

  it('starts a sweep from the Tend button', () => {
    const props = renderShelf()
    fireEvent.click(screen.getByRole('button', { name: /tend/i }))
    expect(props.tend.start).toHaveBeenCalled()
  })

  it('reviewing mode renders proposal cards; Apply calls onApplyProposal then remove', () => {
    const proposal = { kind: 'put_aside' as const, id: 'x1', taskId: 'c1', why: 'Stale for 4 weeks.' }
    const remove = vi.fn()
    const props = renderShelf({
      tasksById: new Map([['c1', task('c1', 'Ask for YNAB refund')]]),
      tend: { ...idleTend, status: 'reviewing', proposals: [proposal], remove },
    })
    expect(screen.getByText('Stale for 4 weeks.')).toBeInTheDocument()
    expect(screen.queryAllByTestId('shelf-pill-title')).toHaveLength(0) // pills replaced
    fireEvent.click(screen.getByRole('button', { name: 'Put aside' }))
    expect(props.onApplyProposal).toHaveBeenCalledWith(proposal)
    expect(remove).toHaveBeenCalledWith('x1')
  })

  it('reviewing mode with no proposals and AI settled shows the healthy message', () => {
    renderShelf({ tend: { ...idleTend, status: 'reviewing', proposals: [] } })
    expect(screen.getByText(/nothing to tend/i)).toBeInTheDocument()
  })
})
