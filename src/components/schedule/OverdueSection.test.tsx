import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { Task } from '@/types/task'
import type { ProactiveSuggestion } from '@/types/proactiveSuggestion'
import { ScheduleActionsProvider } from '@/contexts/ScheduleActionsContext'
import { OverdueSection } from './OverdueSection'

vi.mock('@/hooks/useMobile', () => ({ useMobile: () => false }))
vi.mock('@/hooks/useProactiveSuggestions', () => ({
  useProactiveSuggestions: () => ({ suggestionsForEntity: () => [], actOnSuggestion: vi.fn(), dismissSuggestion: vi.fn() }),
}))

const day = (daysAgo: number) => {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  d.setHours(9, 0, 0, 0)
  return d
}

const task = (over: Partial<Task> & { id: string; title: string }): Task => ({
  completed: false,
  bucket: 'timed',
  isAllDay: true,
  createdAt: day(9),
  updatedAt: day(9),
  ...over,
} as Task)

const ctxValue = {
  onToggleTask: vi.fn(), projects: [], contacts: [], familyMembers: [], lists: [],
}

/** Render the section and open it — it is collapsed by default. */
function renderSection(tasks: Task[]) {
  render(
    <ScheduleActionsProvider value={ctxValue as never}>
      <OverdueSection tasks={tasks} selectedItemId={null} onSelectTask={vi.fn()} onToggleTask={vi.fn()} />
    </ScheduleActionsProvider>
  )
  fireEvent.click(screen.getByRole('button', { name: /carried over/i }))
}

describe('OverdueSection — a child sits under its own parent', () => {
  it('places a subtask directly beneath its parent, not under whatever the date sort put above it', () => {
    // Reported from real use: four yard subtasks rendered nested under an
    // unrelated "Pay Camp Notre Dame final session payment" — which itself
    // showed 1/1 — because the list sorts by date while indentation only
    // checks that the parent is somewhere in the list.
    const tasks = [
      task({ id: 'payment', title: 'Pay Camp Notre Dame', scheduledFor: day(2) }),
      task({ id: 'weed', title: 'Weed the backyard', scheduledFor: day(1), parentTaskId: 'yard' }),
      task({ id: 'umbrella', title: 'Throw out the umbrella', scheduledFor: day(1), parentTaskId: 'yard' }),
      task({ id: 'yard', title: 'Yard optimization', scheduledFor: day(0) }),
    ]
    renderSection(tasks)

    const text = document.body.textContent ?? ''
    const iPayment = text.indexOf('Pay Camp Notre Dame')
    const iYard = text.indexOf('Yard optimization')
    const iWeed = text.indexOf('Weed the backyard')
    const iUmbrella = text.indexOf('Throw out the umbrella')

    expect(iPayment).toBeGreaterThanOrEqual(0)
    expect(iYard).toBeGreaterThanOrEqual(0)
    // Both children follow their parent, and neither sits between the unrelated
    // payment row and that parent.
    expect(iWeed).toBeGreaterThan(iYard)
    expect(iUmbrella).toBeGreaterThan(iYard)
  })

  it('leaves a flat list untouched', () => {
    const tasks = [
      task({ id: 'a', title: 'Older thing', scheduledFor: day(3) }),
      task({ id: 'b', title: 'Newer thing', scheduledFor: day(1) }),
    ]
    renderSection(tasks)
    const text = document.body.textContent ?? ''
    expect(text.indexOf('Older thing')).toBeLessThan(text.indexOf('Newer thing'))
  })

  it('does not reorder a child whose parent is absent from the list', () => {
    // An orphan keeps its date position and renders un-indented — the existing
    // parentVisible guard already handles the indentation half.
    const tasks = [
      task({ id: 'a', title: 'Older thing', scheduledFor: day(3) }),
      task({ id: 'orphan', title: 'Orphan child', scheduledFor: day(1), parentTaskId: 'not-here' }),
    ]
    renderSection(tasks)
    const text = document.body.textContent ?? ''
    expect(text.indexOf('Older thing')).toBeLessThan(text.indexOf('Orphan child'))
  })
})

describe('OverdueSection — proactive suggestion chips', () => {
  const suggestion = (over: Partial<ProactiveSuggestion> = {}): ProactiveSuggestion => ({
    id: 's1',
    userId: 'u1',
    entityType: 'task',
    entityId: 'overdue-1',
    suggestionType: 'call',
    title: 'Call the vet',
    detail: undefined,
    confidence: 0.9,
    actionType: 'call',
    actionPayload: { phoneNumber: '555-1234' },
    status: 'active',
    suggestionKey: 'k1',
    generatedAt: '2024-01-01T00:00:00Z',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...over,
  })

  it('renders a top-1 suggestion chip below an overdue task when suggestionsForTask is provided', () => {
    const tasks = [task({ id: 'overdue-1', title: 'Reschedule the vet', scheduledFor: day(2) })]
    const suggestionsForTask = vi.fn().mockReturnValue([
      suggestion(),
      suggestion({ id: 's2', title: 'Text the vet', actionType: 'text' }),
    ])

    render(
      <ScheduleActionsProvider value={ctxValue as never}>
        <OverdueSection
          tasks={tasks}
          selectedItemId={null}
          onSelectTask={vi.fn()}
          onToggleTask={vi.fn()}
          suggestionsForTask={suggestionsForTask}
        />
      </ScheduleActionsProvider>
    )
    fireEvent.click(screen.getByRole('button', { name: /carried over/i }))

    expect(suggestionsForTask).toHaveBeenCalledWith('task', 'overdue-1')
    expect(screen.getByText('Call the vet')).toBeInTheDocument()
    expect(screen.queryByText('Text the vet')).not.toBeInTheDocument()
  })

  it('does not render chips when suggestionsForTask is omitted', () => {
    const tasks = [task({ id: 'overdue-1', title: 'Reschedule the vet', scheduledFor: day(2) })]
    renderSection(tasks)
    expect(screen.queryByText('Call the vet')).not.toBeInTheDocument()
  })
})
