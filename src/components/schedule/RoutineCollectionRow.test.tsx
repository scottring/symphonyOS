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

describe('RoutineCollectionRow untimed ("anytime") dose', () => {
  beforeEach(() => vi.clearAllMocks())

  function untimedItem(doseOverrides: Partial<{ completed: boolean; skipped: boolean }> = {}) {
    const item = collectionItem()
    item.collectionSteps![0].doses = [
      { id: 'routine-chin#0', time: null, completed: false, ...doseOverrides },
    ]
    item.collectionNextUp = { stepId: 'chin', stepName: 'Chin Tuck', time: null, doseSlot: 0 }
    return item
  }

  it('renders the standard check circle, not a text pill, for an untimed dose', () => {
    renderRow(untimedItem())
    expandRow()

    const dose = screen.getByRole('button', { name: /complete chin tuck/i })
    // No time to show, so the old "anytime" pill text is gone…
    expect(dose).not.toHaveTextContent('anytime')
    // …and it's rendered as a circle (TaskCheckbox's shape/size/border
    // language: w-5 h-5 rounded-full border-2), not the pill's `text-xs` pill.
    expect(dose.className).toContain('w-5 h-5 rounded-full border-2')
    expect(dose.className).not.toContain('text-xs') // old pill's own signature
  })

  it('tapping an untimed dose completes it, same as a timed one', () => {
    renderRow(untimedItem())
    expandRow()

    fireEvent.click(screen.getByRole('button', { name: /complete chin tuck/i }))
    expect(handlers.onCompleteStep).toHaveBeenCalledWith('routine-chin#0', true)
  })

  it('a completed untimed dose shows a checkmark and taps back to pending', () => {
    renderRow(untimedItem({ completed: true }))
    expandRow()

    const dose = screen.getByRole('button', { name: /uncomplete chin tuck/i })
    expect(dose.className).toContain('bg-primary-500')
    fireEvent.click(dose)
    expect(handlers.onCompleteStep).toHaveBeenCalledWith('routine-chin#0', false)
  })

  it('a skipped untimed dose is visually muted and taps back to pending', () => {
    renderRow(untimedItem({ skipped: true }))
    expandRow()

    const dose = screen.getByRole('button', { name: /unskip chin tuck/i })
    expect(dose.className).toContain('bg-neutral-100')
    fireEvent.click(dose)
    expect(handlers.onCompleteStep).toHaveBeenCalledWith('routine-chin#0', false)
  })

  // isPastDue() short-circuits to false whenever `dose.time` is null — an
  // "anytime" dose has no due time to have missed, so it can never enter the
  // amber past-due/resolve-missed state (true before this fix too; the pill
  // had the same unreachable amber branch). Even with a stale startTime
  // (YESTERDAY, from collectionItem()), it stays a plain single-tap-completes
  // dose, never the resolve-missed menu.
  it('an untimed dose is never past-due, even with a stale startTime', () => {
    renderRow(untimedItem())
    expandRow()

    expect(screen.getByRole('button', { name: /^complete chin tuck$/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /resolve missed/i })).toBeNull()
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
