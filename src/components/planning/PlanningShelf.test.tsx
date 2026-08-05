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
    onOpenTask: vi.fn(), onSetBucket: vi.fn(), onDeleteTask: vi.fn(), onPushTask: vi.fn(), onCompleteTask: vi.fn(),
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

  // The pill carries the FULL fate vocabulary — the same TriageWhenMenu the
  // wizard review rows render, via TaskFateMenu. Whens route through
  // applyTriageWhen; Done and Delete are first-class.
  it('pill menu routes whens through the canonical vocabulary (Someday → onSetBucket)', () => {
    const props = renderShelf()
    fireEvent.click(screen.getAllByLabelText('Task actions')[0]) // c1's ⋯
    fireEvent.click(screen.getByRole('button', { name: 'Someday' }))
    expect(props.onSetBucket).toHaveBeenCalledWith('c1', 'someday')
  })

  it('pill menu offers Done — completing from the shelf is a first-class fate', () => {
    const props = renderShelf()
    fireEvent.click(screen.getAllByLabelText('Task actions')[0])
    fireEvent.click(screen.getByLabelText('Mark done'))
    expect(props.onCompleteTask).toHaveBeenCalledWith('c1')
  })

  it('pill menu routes Delete to onDeleteTask', () => {
    const props = renderShelf()
    fireEvent.click(screen.getAllByLabelText('Task actions')[0])
    fireEvent.click(screen.getByLabelText('Delete'))
    expect(props.onDeleteTask).toHaveBeenCalledWith('c1')
  })

  // Done and gone are the two fates a pill earns most, so they sit ON the
  // pill — the ⋯ menu keeps them too, but shouldn't be the only way there.
  it('the pill check-circle completes without opening the task', () => {
    const props = renderShelf()
    fireEvent.click(screen.getByLabelText('Complete Ask for YNAB refund'))
    expect(props.onCompleteTask).toHaveBeenCalledWith('c1')
    expect(props.onOpenTask).not.toHaveBeenCalled()
  })

  it('the pill delete button deletes without opening the task', () => {
    const props = renderShelf()
    fireEvent.click(screen.getByLabelText('Delete Weed the backyard'))
    expect(props.onDeleteTask).toHaveBeenCalledWith('p1')
    expect(props.onOpenTask).not.toHaveBeenCalled()
  })

  it('inline pill actions render in native drag mode too (month page)', () => {
    const props = baseProps({ dragMode: 'native' })
    render(<PlanningShelf {...props} />)
    fireEvent.click(screen.getByLabelText('Complete Make a chore plan'))
    expect(props.onCompleteTask).toHaveBeenCalledWith('l1')
    fireEvent.click(screen.getByLabelText('Delete Make a chore plan'))
    expect(props.onDeleteTask).toHaveBeenCalledWith('l1')
  })

  it('demoting is a when: Month → This month sets the bucket', () => {
    const props = renderShelf()
    fireEvent.click(screen.getAllByLabelText('Task actions')[0])
    fireEvent.click(screen.getByRole('button', { name: 'Month' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'This month' }))
    expect(props.onSetBucket).toHaveBeenCalledWith('c1', 'month')
  })

  it('fileUnder lists the season picks and threads the pill under one', () => {
    const onFile = vi.fn()
    renderShelf({ fileUnder: { picks: [{ id: 'p1', title: 'Porch set up' }], onFile } })
    fireEvent.click(screen.getAllByLabelText('Task actions')[0])
    fireEvent.click(screen.getByRole('menuitem', { name: 'File under a pick' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Porch set up/ }))
    expect(onFile).toHaveBeenCalledWith('c1', 'p1')
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

  it('a place card names the day in plain language, never the raw ISO date', () => {
    const proposal = { kind: 'place' as const, id: 'x2', taskIds: ['c1'], date: '2026-08-07', time: '09:30', why: '' }
    renderShelf({
      tasksById: new Map([['c1', task('c1', 'Ask for YNAB refund')]]),
      tend: { ...idleTend, status: 'reviewing', proposals: [proposal] },
    })
    expect(screen.getByText(/Fri, Aug 7 · 9:30 AM/)).toBeInTheDocument()
    expect(screen.queryByText(/2026-08-07/)).not.toBeInTheDocument()
  })

  it('a place card with no time shows only the day', () => {
    const proposal = { kind: 'place' as const, id: 'x3', taskIds: ['c1'], date: '2026-08-07', why: '' }
    renderShelf({
      tasksById: new Map([['c1', task('c1', 'Ask for YNAB refund')]]),
      tend: { ...idleTend, status: 'reviewing', proposals: [proposal] },
    })
    expect(screen.getByText(/Fri, Aug 7/)).toBeInTheDocument()
    expect(screen.queryByText(/AM|PM/)).not.toBeInTheDocument()
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

// ── Stale week placements: moves placed on a week that came and went without
// ever getting a day. Amber alone doesn't explain itself, and a drag can't
// express "keep it unplaced but stop it being late". ──
describe('PlanningShelf — stale week placements', () => {
  function staleTask(id: string, title: string, weekStart: Date): Task {
    return { id, title, completed: false, bucket: 'week', weekStart, createdAt: new Date(), updatedAt: new Date() } as Task
  }

  const stale = staleTask('s1', 'Order the vanity', new Date(2026, 6, 12))

  function staleProps(overrides: Partial<PlanningShelfProps> = {}) {
    return baseProps({
      tasks: [task('l1', 'Make a chore plan'), stale],
      carryOverIds: new Set(['s1']),
      staleWeekIds: new Set(['s1']),
      onBringForward: vi.fn(),
      ...overrides,
    })
  }

  it("names the week it came from, so 'carried over' isn't a mystery", () => {
    render(<DndContext><PlanningShelf {...staleProps()} /></DndContext>)
    expect(screen.getByTestId('stale-week-tag')).toHaveTextContent('from Jul 12')
  })

  it('offers "Bring to this week" — the one fate a drag cannot express', () => {
    const props = staleProps()
    render(<DndContext><PlanningShelf {...props} /></DndContext>)
    // The stale pill sorts first, so its actions button is the first one.
    fireEvent.click(screen.getAllByLabelText('Task actions')[0])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Bring to this week' }))
    expect(props.onBringForward).toHaveBeenCalledWith('s1')
  })

  it('leads the shelf — only the first pills render, and this is the one to lose', () => {
    const many = Array.from({ length: SHELF_COLLAPSED_COUNT }, (_, i) => task(`c${i}`, `Overdue ${i}`))
    render(<DndContext><PlanningShelf {...staleProps({
      tasks: [...many, stale],
      carryOverIds: new Set([...many.map((t) => t.id), 's1']),
    })} /></DndContext>)
    const titles = screen.getAllByTestId('shelf-pill-title').map((el) => el.textContent)
    expect(titles[0]).toBe('Order the vanity')
  })

  it('shows no tag and no bring-forward action for an ordinary carried-over item', () => {
    render(<DndContext><PlanningShelf {...baseProps()} /></DndContext>)
    expect(screen.queryByTestId('stale-week-tag')).not.toBeInTheDocument()
    fireEvent.click(screen.getAllByLabelText('Task actions')[0])
    expect(screen.queryByRole('menuitem', { name: 'Bring to this week' })).not.toBeInTheDocument()
  })
})

describe('PlanningShelf board layout', () => {
  const boardTasks = [
    task('a', 'Rug', 'proj'),
    task('b', 'Lamp', 'proj'),
    task('c', 'Research keyboards'),
  ]
  const boardGroups = [
    { id: 'project:proj', label: 'Living room upgrades', kind: 'project' as const, taskIds: ['a', 'b'] },
    { id: 'unfiled', label: 'Unfiled', kind: 'unfiled' as const, taskIds: ['c'] },
  ]

  // No DndContext: board mode is native-drag only, and PlanningShelf itself
  // calls no dnd-kit hooks.
  const renderBoard = (over: Partial<PlanningShelfProps> = {}) => {
    const props = baseProps({
      layout: 'board', dragMode: 'native', carryOverIds: new Set<string>(),
      tasks: boardTasks, groups: boardGroups, ...over,
    })
    render(<PlanningShelf {...props} />)
    return props
  }

  it('renders one block per group, each showing all its members', () => {
    renderBoard()
    const block = screen.getByTestId('shelf-block-project:proj')
    expect(block).toHaveTextContent('Living room upgrades')
    expect(block).toHaveTextContent('Rug')
    expect(block).toHaveTextContent('Lamp')
  })

  // The chevron existed to tame the wrap-flow. Once blocks are boxed, hiding
  // moves behind a disclosure is exactly what let 24 pile up unnoticed.
  it('renders no expand/collapse control and no overflow control', () => {
    renderBoard()
    expect(screen.queryByText(/more$/)).not.toBeInTheDocument()
    expect(screen.queryByText('Show fewer')).not.toBeInTheDocument()
  })

  it('gives a cluster header a drag handle carrying every member id', () => {
    renderBoard()
    const handle = screen.getByTestId('shelf-block-drag-project:proj')
    const setData = vi.fn()
    fireEvent.dragStart(handle, { dataTransfer: { setData } })
    expect(setData).toHaveBeenCalledWith('text/task-ids', 'a,b')
  })

  // Unfiled is a residue, not a cluster — dragging it would fling unrelated
  // moves into one week.
  it('gives the Unfiled block NO drag handle', () => {
    renderBoard()
    expect(screen.queryByTestId('shelf-block-drag-unfiled')).not.toBeInTheDocument()
    expect(screen.getByTestId('shelf-block-unfiled')).toHaveTextContent('Research keyboards')
  })

  it('hosts the composer inside the Unfiled block, which renders even when empty', () => {
    renderBoard({
      tasks: [task('a', 'Rug', 'proj'), task('b', 'Lamp', 'proj')],
      groups: [boardGroups[0]],
      draftPlaceholder: 'Add a chunk to this month',
    })
    const unfiled = screen.getByTestId('shelf-block-unfiled')
    expect(unfiled).toContainElement(screen.getByPlaceholderText('Add a chunk to this month'))
  })

  it('flow layout is untouched — /week still gets its wrap-flow pills', () => {
    renderShelf({ tasks: boardTasks, carryOverIds: new Set<string>() })
    expect(screen.queryByTestId('shelf-block-unfiled')).not.toBeInTheDocument()
    expect(screen.getByText('Rug')).toBeInTheDocument()
  })

  // A project block's own tasks restating "· <that project>" on every pill is
  // pure noise — the block header already says it. projectsMap names 'proj'
  // "Backyards"; the suffix must not appear anywhere in this block.
  it('suppresses the project suffix on a project block for its own project', () => {
    renderBoard()
    const block = screen.getByTestId('shelf-block-project:proj')
    expect(block).not.toHaveTextContent('· Backyards')
  })

  // A pick block's members can belong to a DIFFERENT project than the block
  // itself names — that's genuinely useful information, so it must survive.
  it('keeps the project suffix on a pick block whose task belongs to a project', () => {
    renderBoard({
      groups: [
        { id: 'pick:p1', label: 'Porch and backyard set up', kind: 'pick', taskIds: ['a'] },
        { id: 'unfiled', label: 'Unfiled', kind: 'unfiled', taskIds: ['c'] },
      ],
    })
    const block = screen.getByTestId('shelf-block-pick:p1')
    expect(block).toHaveTextContent('· Backyards')
  })
})
