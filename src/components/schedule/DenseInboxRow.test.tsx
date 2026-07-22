import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DenseInboxRow } from './DenseInboxRow'
import type { QuickAction } from './DenseInboxRow'
import { createMockTask, createMockProject } from '@/test/mocks/factories'

vi.mock('@/hooks/useGooglePlaces', () => ({
  useGooglePlaces: () => ({ results: [], loading: false, searchPlaces: vi.fn(), getPlaceDetails: vi.fn(), clearResults: vi.fn() }),
}))

const INBOX_ACTIONS: QuickAction[] = [
  { kind: 'today' }, { kind: 'week' }, { kind: 'month' }, { kind: 'someday' }, { kind: 'delete' }
]
const WEEK_ACTIONS: QuickAction[] = [
  { kind: 'today' }, { kind: 'next-week' }, { kind: 'someday' }, { kind: 'delete' }
]

// Minimal DataTransfer mock — jsdom's DataTransfer doesn't implement setData/getData.
function makeDataTransfer() {
  return {
    data: {} as Record<string, string>,
    setData(k: string, v: string) { this.data[k] = v },
    getData(k: string) { return this.data[k] ?? '' },
    get types() { return Object.keys(this.data) },
    effectAllowed: 'none',
  }
}

describe('DenseInboxRow', () => {
  const baseProps = {
    task: createMockTask({ id: 't1', title: 'Test row' }),
    familyMembers: [],
    onQuickAction: vi.fn(),
    onToggleComplete: vi.fn(),
    onUpdate: vi.fn(),
    onSelect: vi.fn(),
  }

  beforeEach(() => { vi.clearAllMocks() })

  it('renders task title', () => {
    render(<DenseInboxRow {...baseProps} quickActions={INBOX_ACTIONS} />)
    expect(screen.getByText('Test row')).toBeInTheDocument()
  })

  it('renders the inbox quick-action set', () => {
    render(<DenseInboxRow {...baseProps} quickActions={INBOX_ACTIONS} />)
    expect(screen.getByRole('button', { name: /^today$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^week$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^month$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^someday$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^delete$/i })).toBeInTheDocument()
  })

  it('renders the week quick-action set', () => {
    render(<DenseInboxRow {...baseProps} quickActions={WEEK_ACTIONS} />)
    expect(screen.getByRole('button', { name: /^today$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^next week$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^someday$/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^week$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^month$/i })).not.toBeInTheDocument()
  })

  it('calls onQuickAction with the correct kind when a button is clicked', () => {
    const onQuickAction = vi.fn()
    render(<DenseInboxRow {...baseProps} onQuickAction={onQuickAction} quickActions={INBOX_ACTIONS} />)
    fireEvent.click(screen.getByRole('button', { name: /^week$/i }))
    expect(onQuickAction).toHaveBeenCalledWith({ kind: 'week' })
  })

  it('calls onQuickAction with delete when × clicked', () => {
    const onQuickAction = vi.fn()
    render(<DenseInboxRow {...baseProps} onQuickAction={onQuickAction} quickActions={INBOX_ACTIONS} />)
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    expect(onQuickAction).toHaveBeenCalledWith({ kind: 'delete' })
  })

  it('calls onSelect when title clicked', () => {
    const onSelect = vi.fn()
    render(<DenseInboxRow {...baseProps} onSelect={onSelect} quickActions={INBOX_ACTIONS} />)
    fireEvent.click(screen.getByText('Test row'))
    expect(onSelect).toHaveBeenCalled()
  })

  it('renders project chip when project provided', () => {
    const project = createMockProject({ id: 'p1', name: 'My Project' })
    render(<DenseInboxRow {...baseProps} project={project} quickActions={INBOX_ACTIONS} />)
    expect(screen.getByText('My Project')).toBeInTheDocument()
  })

  it('clears project assignment when chip × clicked', () => {
    const project = createMockProject({ id: 'p1', name: 'My Project' })
    const onUpdate = vi.fn()
    render(<DenseInboxRow {...baseProps} onUpdate={onUpdate} project={project} quickActions={INBOX_ACTIONS} />)
    fireEvent.click(screen.getByRole('button', { name: /remove project/i }))
    expect(onUpdate).toHaveBeenCalledWith({ projectId: undefined })
  })

  it('applies leaving class when isLeaving is true', () => {
    const { container } = render(<DenseInboxRow {...baseProps} isLeaving quickActions={INBOX_ACTIONS} />)
    const row = container.querySelector('[data-row]') as HTMLElement
    expect(row.className).toMatch(/opacity-0/)
  })

  it('renders context dot button when context is set', () => {
    const task = createMockTask({ id: 't2', title: 'Family thing', context: 'family' })
    render(<DenseInboxRow {...baseProps} task={task} quickActions={INBOX_ACTIONS} />)
    expect(screen.getByRole('button', { name: /context/i })).toBeInTheDocument()
  })

  it('strikes through completed tasks', () => {
    const task = createMockTask({ id: 't3', title: 'Done', completed: true })
    render(<DenseInboxRow {...baseProps} task={task} quickActions={INBOX_ACTIONS} />)
    expect(screen.getByText('Done').className).toMatch(/line-through/)
  })

  it('shows a selection checkbox in selection mode and calls onToggleSelection', () => {
    const onToggleSelection = vi.fn()
    render(
      <DenseInboxRow
        {...baseProps}
        quickActions={INBOX_ACTIONS}
        selectionMode
        isSelected={false}
        onToggleSelection={onToggleSelection}
      />,
    )
    const checkbox = screen.getByRole('checkbox', { name: /select Test row/i })
    expect(checkbox).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(checkbox)
    expect(onToggleSelection).toHaveBeenCalled()
  })

  it('sets text/task-id on dragStart from the grip handle', () => {
    const { getByTestId } = render(<DenseInboxRow {...baseProps} quickActions={INBOX_ACTIONS} />)
    const grip = getByTestId('drag-handle')
    const dataTransfer = makeDataTransfer()
    fireEvent.dragStart(grip, { dataTransfer })
    expect(dataTransfer.getData('text/task-id')).toBe('t1')
  })

  it('does not set text/task-id when dragStart fires on the completion checkbox', () => {
    render(<DenseInboxRow {...baseProps} quickActions={INBOX_ACTIONS} />)
    // The completion control isn't draggable — dragStart on it must not
    // populate the payload (only the grip handle may).
    const checkbox = screen.getByRole('button', { name: /mark complete/i })
    const dataTransfer = makeDataTransfer()
    fireEvent.dragStart(checkbox, { dataTransfer })
    expect(dataTransfer.getData('text/task-id')).toBe('')
  })
})
