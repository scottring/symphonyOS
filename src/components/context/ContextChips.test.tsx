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

    render(<ContextChips entityType="task" entityId="task-1" variant="panel" />)

    expect(screen.getByText('Call the vet')).toBeInTheDocument()
    expect(screen.getByText('Text the vet')).toBeInTheDocument()
    expect(screen.getByText(/Last: Called the vet — left message · today/)).toBeInTheDocument()
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
})
