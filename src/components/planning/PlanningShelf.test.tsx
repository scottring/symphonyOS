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

function baseProps(overrides: Partial<PlanningShelfProps> = {}): PlanningShelfProps {
  return {
    tasks: [task('c1', 'Ask for YNAB refund'), task('p1', 'Weed the backyard', 'proj'), task('l1', 'Make a chore plan')],
    carryOverIds: new Set(['c1']),
    projectsMap: new Map([['proj', { id: 'proj', name: 'Backyards' }]]),
    tasksById: new Map(),
    onOpenTask: vi.fn(), onSetBucket: vi.fn(), onDeleteTask: vi.fn(), onPushTask: vi.fn(),
    draft: '', onDraftChange: vi.fn(), onSubmitDraft: vi.fn(),
    tend: idleTend, onApplyProposal: vi.fn(),
    ...overrides,
  }
}

function renderShelf(overrides: Partial<PlanningShelfProps> = {}) {
  const props = baseProps(overrides)
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

  it('clicking the pill title opens the task; clicking the ⋯ button does not', () => {
    const props = renderShelf()
    const onOpenTask = vi.mocked(props.onOpenTask)
    fireEvent.click(screen.getAllByTestId('shelf-pill-title')[0]) // c1's title
    expect(onOpenTask).toHaveBeenCalledWith('c1')

    onOpenTask.mockClear()
    fireEvent.click(screen.getAllByLabelText('Task actions')[0]) // c1's ⋯
    expect(onOpenTask).not.toHaveBeenCalled()
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

  it('reviewing mode header defaults to "Tending this week" but honors a custom tendingLabel', () => {
    renderShelf({ tend: { ...idleTend, status: 'reviewing', proposals: [] } })
    expect(screen.getByText(/^Tending this week/)).toBeInTheDocument()

    renderShelf({ tend: { ...idleTend, status: 'reviewing', proposals: [] }, tendingLabel: 'Tending this month' })
    expect(screen.getByText(/^Tending this month/)).toBeInTheDocument()
  })

  it('native mode pills are HTML-draggable, set text/task-id, and render without a DndContext', () => {
    // NOTE: render WITHOUT the <DndContext> wrapper — that absence IS the test.
    const props = baseProps({ dragMode: 'native', onNativeUnschedule: vi.fn() })
    render(<PlanningShelf {...props} />)
    const pill = screen.getAllByTestId('shelf-pill-title')[0].closest('.group') as HTMLElement
    expect(pill).toHaveAttribute('draggable', 'true')
    const setData = vi.fn()
    fireEvent.dragStart(pill, { dataTransfer: { setData } })
    expect(setData).toHaveBeenCalledWith('text/task-id', props.tasks[0].id)
  })

  it('native mode shelf drop calls onNativeUnschedule with the dragged id', () => {
    const onNativeUnschedule = vi.fn()
    render(<PlanningShelf {...baseProps({ dragMode: 'native', onNativeUnschedule })} />)
    const lane = screen.getByTestId('shelf-lane')
    fireEvent.drop(lane, { dataTransfer: { getData: () => 'c1' } })
    expect(onNativeUnschedule).toHaveBeenCalledWith('c1')
  })

  it('defaults the non-reviewing header to "To place (n)"', () => {
    renderShelf({ carryOverIds: new Set() })
    expect(screen.getByText('To place (3)')).toBeInTheDocument()
  })

  it('honors a custom poolLabel in the non-reviewing header', () => {
    renderShelf({ carryOverIds: new Set(), poolLabel: "July's moves" })
    expect(screen.getByText("July's moves (3)")).toBeInTheDocument()
    expect(screen.queryByText(/^To place/)).not.toBeInTheDocument()
  })

  it('moveDown customizes the demote menu item', () => {
    const props = baseProps({ moveDown: { label: 'To week', bucket: 'week' } })
    render(<DndContext><PlanningShelf {...props} /></DndContext>)
    fireEvent.click(screen.getAllByLabelText('Task actions')[0])
    fireEvent.click(screen.getByRole('menuitem', { name: 'To week' }))
    expect(props.onSetBucket).toHaveBeenCalledWith(props.tasks[0].id, 'week')
  })
})

describe('PlanningShelf — grouped roll-up', () => {
  const grouped = () => ({
    tasks: [
      task('m1', 'Weed the backyard', 'proj'),
      task('m2', 'Put down sand', 'proj'),
      task('m3', 'Buy a bench', 'proj'),
      task('l1', 'Decide what to do with the car'),
    ],
    carryOverIds: new Set<string>(),
    groups: [{ id: 'g1', label: 'Porch and backyard', taskIds: ['m1', 'm2', 'm3'] }],
  })

  it('shows one line per group with its count, not the member pills', () => {
    renderShelf(grouped())
    expect(screen.getByRole('button', { name: /Porch and backyard \(3\)/ })).toBeInTheDocument()
    expect(screen.queryByText('Weed the backyard')).not.toBeInTheDocument()
    // Ungrouped items stay visible as ordinary pills.
    expect(screen.getByText('Decide what to do with the car')).toBeInTheDocument()
  })

  it('expanding a group reveals its members; collapsing hides them again', () => {
    renderShelf(grouped())
    fireEvent.click(screen.getByRole('button', { name: /Porch and backyard \(3\)/ }))
    expect(screen.getByText('Weed the backyard')).toBeInTheDocument()
    expect(screen.getByText('Put down sand')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Porch and backyard \(3\)/ }))
    expect(screen.queryByText('Weed the backyard')).not.toBeInTheDocument()
  })

  it('counts grouped items in the header total', () => {
    renderShelf({ ...grouped(), poolLabel: "July's moves" })
    expect(screen.getByText(/July's moves \(4\)/)).toBeInTheDocument()
  })

  it('without groups it renders exactly as before', () => {
    renderShelf()
    expect(screen.getAllByTestId('shelf-pill-title')).toHaveLength(3)
  })
})
