import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ContextChips } from './ContextChips'
import { useEntityContext } from '@/hooks/useEntityContext'
import type { ProactiveSuggestion } from '@/types/proactiveSuggestion'

vi.mock('@/hooks/useEntityContext', () => ({
  useEntityContext: vi.fn(),
}))

const mockUseEntityContext = vi.mocked(useEntityContext)

function makeSuggestion(overrides: Partial<ProactiveSuggestion> = {}): ProactiveSuggestion {
  return {
    id: 's1',
    userId: 'u1',
    entityType: 'task',
    entityId: 'task-1',
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
    ...overrides,
  }
}

describe('ContextChips', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders suggestion chips and the last-action line in panel variant', () => {
    mockUseEntityContext.mockReturnValue({
      suggestions: [makeSuggestion(), makeSuggestion({ id: 's2', title: 'Text the vet', actionType: 'text' })],
      lastAction: {
        actionType: 'call',
        detail: 'Called the vet',
        outcome: 'left_message',
        createdAt: new Date(),
      },
      loading: false,
      actOnSuggestion: vi.fn(),
      dismissSuggestion: vi.fn(),
    })

    const { container } = render(<ContextChips entityType="task" entityId="task-1" variant="panel" />)

    expect(screen.getByText('Call the vet')).toBeInTheDocument()
    expect(screen.getByText('Text the vet')).toBeInTheDocument()
    expect(screen.getByText(/Last: Called the vet — left message · today/)).toBeInTheDocument()
    // Suggestions + last-action must land inside ONE root element, not two
    // separate direct children — a Fragment root would break TapContextPanel's
    // `divide-y [&>*]:py-4` layout into two hairline-divided rows.
    expect(container.children).toHaveLength(1)
  })

  it('renders only the top suggestion in row variant', () => {
    mockUseEntityContext.mockReturnValue({
      suggestions: [makeSuggestion(), makeSuggestion({ id: 's2', title: 'Text the vet', actionType: 'text' })],
      lastAction: {
        actionType: 'call',
        detail: 'Called the vet',
        outcome: 'left_message',
        createdAt: new Date(),
      },
      loading: false,
      actOnSuggestion: vi.fn(),
      dismissSuggestion: vi.fn(),
    })

    render(<ContextChips entityType="task" entityId="task-1" variant="row" />)

    expect(screen.getByText('Call the vet')).toBeInTheDocument()
    expect(screen.queryByText('Text the vet')).not.toBeInTheDocument()
    expect(screen.queryByText(/Last:/)).not.toBeInTheDocument()
  })

  it('renders nothing when there are no suggestions and no last action', () => {
    mockUseEntityContext.mockReturnValue({
      suggestions: [],
      lastAction: null,
      loading: false,
      actOnSuggestion: vi.fn(),
      dismissSuggestion: vi.fn(),
    })

    const { container } = render(<ContextChips entityType="task" entityId="task-1" variant="panel" />)

    expect(container).toBeEmptyDOMElement()
  })

  it('filters out a someday suggestion — ContextChips never wires onPush, so its chip would be dead', () => {
    mockUseEntityContext.mockReturnValue({
      suggestions: [makeSuggestion({ id: 's1', suggestionType: 'someday', actionType: 'someday', title: 'Move to Someday' })],
      lastAction: null,
      loading: false,
      actOnSuggestion: vi.fn(),
      dismissSuggestion: vi.fn(),
    })

    const { container } = render(<ContextChips entityType="task" entityId="task-1" variant="panel" />)

    expect(screen.queryByText('Move to Someday')).not.toBeInTheDocument()
    expect(container).toBeEmptyDOMElement()
  })

  it('filters out a stale suggestion — ContextChips never wires onDelete, so its chip would be dead', () => {
    mockUseEntityContext.mockReturnValue({
      suggestions: [makeSuggestion({ id: 's1', suggestionType: 'stale', actionType: 'stale', title: 'Delete stale task' })],
      lastAction: null,
      loading: false,
      actOnSuggestion: vi.fn(),
      dismissSuggestion: vi.fn(),
    })

    const { container } = render(<ContextChips entityType="task" entityId="task-1" variant="panel" />)

    expect(screen.queryByText('Delete stale task')).not.toBeInTheDocument()
    expect(container).toBeEmptyDOMElement()
  })

  it('renders a guided_chat suggestion only when onOpenGuidedChat is provided', () => {
    mockUseEntityContext.mockReturnValue({
      suggestions: [makeSuggestion({ id: 's1', suggestionType: 'guided_chat', actionType: 'guided_chat', title: 'Help me think this through' })],
      lastAction: null,
      loading: false,
      actOnSuggestion: vi.fn(),
      dismissSuggestion: vi.fn(),
    })

    const withoutHandler = render(<ContextChips entityType="task" entityId="task-1" variant="panel" />)
    expect(withoutHandler.container).toBeEmptyDOMElement()
    withoutHandler.unmount()

    render(<ContextChips entityType="task" entityId="task-1" variant="panel" onOpenGuidedChat={vi.fn()} />)
    expect(screen.getByText('Help me think this through')).toBeInTheDocument()
  })

  it('row variant picks the first ACTIONABLE suggestion, skipping a dead one ahead of it', () => {
    mockUseEntityContext.mockReturnValue({
      suggestions: [
        makeSuggestion({ id: 's1', suggestionType: 'someday', actionType: 'someday', title: 'Move to Someday' }),
        makeSuggestion({ id: 's2', title: 'Call the vet' }),
      ],
      lastAction: null,
      loading: false,
      actOnSuggestion: vi.fn(),
      dismissSuggestion: vi.fn(),
    })

    render(<ContextChips entityType="task" entityId="task-1" variant="row" />)

    expect(screen.queryByText('Move to Someday')).not.toBeInTheDocument()
    expect(screen.getByText('Call the vet')).toBeInTheDocument()
  })
})
