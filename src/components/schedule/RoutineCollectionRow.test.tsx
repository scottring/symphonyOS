import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { RoutineCollectionRow } from './RoutineCollectionRow'
import type { TimelineItem } from '@/types/timeline'

const YESTERDAY = new Date(Date.now() - 86_400_000)
const TOMORROW = new Date(Date.now() + 86_400_000)

function collectionItem(overrides: Partial<TimelineItem> = {}): TimelineItem {
  return {
    id: 'routine-collection-hep',
    type: 'routine-collection',
    title: 'Shoulder HEP',
    startTime: YESTERDAY,
    endTime: null,
    completed: false,
    collectionProgress: { done: 0, total: 2 },
    collectionNextUp: { stepId: 'chin', stepName: 'Chin Tuck', time: '07:00', doseSlot: 0 },
    collectionSteps: [
      {
        stepId: 'chin',
        name: 'Chin Tuck',
        progress: { done: 0, total: 2 },
        doses: [
          { id: 'routine-chin#0', time: '07:00', completed: false },
          { id: 'routine-chin#1', time: '09:00', completed: false },
        ],
      },
    ],
    ...overrides,
  } as TimelineItem
}

const handlers = {
  onSelect: vi.fn(),
  onSelectStep: vi.fn(),
  onCompleteStep: vi.fn(),
  onSkipStep: vi.fn(),
  onCompleteStepAt: vi.fn(),
}

function renderRow(item: TimelineItem) {
  return render(<RoutineCollectionRow item={item} {...handlers} />)
}

function expandRow() {
  fireEvent.click(screen.getByText('Shoulder HEP'))
}

describe('RoutineCollectionRow dose handling', () => {
  beforeEach(() => vi.clearAllMocks())

  it('clicking a missed (past-due) dose opens the Done now / Did then / Skip menu', () => {
    renderRow(collectionItem())
    expandRow()

    fireEvent.click(screen.getByRole('button', { name: /resolve missed chin tuck at 7:00 am/i }))
    expect(screen.getByRole('menu')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /skip this one/i }))
    expect(handlers.onSkipStep).toHaveBeenCalledWith('routine-chin#0')
    expect(handlers.onCompleteStep).not.toHaveBeenCalled()
  })

  it('"Did then" completes the dose at the chosen time', () => {
    renderRow(collectionItem())
    expandRow()

    fireEvent.click(screen.getByRole('button', { name: /resolve missed chin tuck at 7:00 am/i }))
    fireEvent.change(screen.getByLabelText(/time you did it/i), { target: { value: '08:15' } })
    fireEvent.click(screen.getByRole('button', { name: /did then/i }))

    expect(handlers.onCompleteStepAt).toHaveBeenCalledTimes(1)
    const [doseId, when] = handlers.onCompleteStepAt.mock.calls[0]
    expect(doseId).toBe('routine-chin#0')
    expect(when.getHours()).toBe(8)
    expect(when.getMinutes()).toBe(15)
  })

  it('"Done now" completes the dose directly from the menu', () => {
    renderRow(collectionItem())
    expandRow()

    fireEvent.click(screen.getByRole('button', { name: /resolve missed chin tuck at 7:00 am/i }))
    fireEvent.click(screen.getByRole('button', { name: /done now/i }))
    expect(handlers.onCompleteStep).toHaveBeenCalledWith('routine-chin#0', true)
  })

  it('a future dose completes on a single tap (no menu)', () => {
    renderRow(collectionItem({ startTime: TOMORROW }))
    expandRow()

    fireEvent.click(screen.getByRole('button', { name: /complete chin tuck at 7:00 am/i }))
    expect(handlers.onCompleteStep).toHaveBeenCalledWith('routine-chin#0', true)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('a skipped dose renders struck-through and taps back to pending', () => {
    const item = collectionItem()
    item.collectionSteps![0].doses[0] = { id: 'routine-chin#0', time: '07:00', completed: false, skipped: true }
    renderRow(item)
    expandRow()

    const pill = screen.getByRole('button', { name: /unskip chin tuck at 7:00 am/i })
    expect(pill.className).toMatch(/line-through/)
    fireEvent.click(pill)
    expect(handlers.onCompleteStep).toHaveBeenCalledWith('routine-chin#0', false)
  })

  it('Skip all skips every unresolved dose, leaving completed ones alone', () => {
    const item = collectionItem()
    item.collectionSteps![0].doses[1] = { id: 'routine-chin#1', time: '09:00', completed: true }
    renderRow(item)
    expandRow()

    fireEvent.click(screen.getByText(/skip all/i))
    expect(handlers.onSkipStep).toHaveBeenCalledTimes(1)
    expect(handlers.onSkipStep).toHaveBeenCalledWith('routine-chin#0')
    expect(handlers.onCompleteStep).not.toHaveBeenCalled()
  })

  it('Mark all done leaves skipped doses alone', () => {
    const item = collectionItem()
    item.collectionSteps![0].doses[0] = { id: 'routine-chin#0', time: '07:00', completed: false, skipped: true }
    renderRow(item)
    expandRow()

    fireEvent.click(screen.getByText(/mark all done/i))
    expect(handlers.onCompleteStep).toHaveBeenCalledTimes(1)
    expect(handlers.onCompleteStep).toHaveBeenCalledWith('routine-chin#1', true)
  })
})

describe('RoutineCollectionRow management menu', () => {
  beforeEach(() => vi.clearAllMocks())

  const mgmtHandlers = { onHideToday: vi.fn(), onRemove: vi.fn() }

  function renderWithMenu() {
    return render(<RoutineCollectionRow item={collectionItem()} {...handlers} {...mgmtHandlers} />)
  }

  it('opens the options menu with Hide / Edit / Remove', () => {
    renderWithMenu()
    fireEvent.click(screen.getByRole('button', { name: /routine options/i }))
    expect(screen.getByRole('menuitem', { name: /hide for today/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /edit routine/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /remove from today/i })).toBeInTheDocument()
  })

  it('Hide for today fires onHideToday and closes the menu', () => {
    renderWithMenu()
    fireEvent.click(screen.getByRole('button', { name: /routine options/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /hide for today/i }))
    expect(mgmtHandlers.onHideToday).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menuitem', { name: /hide for today/i })).not.toBeInTheDocument()
  })

  it('Edit routine fires onSelect (opens the routine panel)', () => {
    renderWithMenu()
    fireEvent.click(screen.getByRole('button', { name: /routine options/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /edit routine/i }))
    expect(handlers.onSelect).toHaveBeenCalledTimes(1)
  })

  it('Remove from Today fires onRemove', () => {
    renderWithMenu()
    fireEvent.click(screen.getByRole('button', { name: /routine options/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /remove from today/i }))
    expect(mgmtHandlers.onRemove).toHaveBeenCalledTimes(1)
  })

  it('hides Hide/Remove items when handlers are not provided, keeps Edit', () => {
    render(<RoutineCollectionRow item={collectionItem()} {...handlers} />)
    fireEvent.click(screen.getByRole('button', { name: /routine options/i }))
    expect(screen.queryByRole('menuitem', { name: /hide for today/i })).not.toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /edit routine/i })).toBeInTheDocument()
  })
})
