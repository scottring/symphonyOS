import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { AiSuggestionBanner } from './AiSuggestionBanner'

const hookMock = vi.fn()
vi.mock('@/hooks/useProactiveSuggestions', () => ({ useProactiveSuggestions: () => hookMock() }))
afterEach(() => hookMock.mockReset())

const base = { actOnSuggestion: vi.fn(), dismissSuggestion: vi.fn(), isLoading: false }

describe('AiSuggestionBanner', () => {
  it('renders nothing when there are no suggestions', () => {
    hookMock.mockReturnValue({ ...base, suggestions: [], topSuggestions: [] })
    const { container } = render(<AiSuggestionBanner />)
    expect(container.firstChild).toBeNull()
  })
  it('renders the top suggestion title + detail', () => {
    const s = { id: 's1', title: 'You have 3 outdoor tasks', detail: 'Thursday looks ideal', status: 'active', suggestionType: 'do_today', actionPayload: {}, confidence: 0.9 }
    hookMock.mockReturnValue({ ...base, suggestions: [s], topSuggestions: [s] })
    render(<AiSuggestionBanner />)
    expect(screen.getByText('You have 3 outdoor tasks')).toBeInTheDocument()
    expect(screen.getByText(/Thursday looks ideal/)).toBeInTheDocument()
  })
  it('dismiss calls dismissSuggestion with the id', async () => {
    const dismiss = vi.fn()
    const s = { id: 's1', title: 'X', status: 'active', suggestionType: 'do_today', actionPayload: {}, confidence: 0.5 }
    hookMock.mockReturnValue({ ...base, dismissSuggestion: dismiss, suggestions: [s], topSuggestions: [s] })
    const { user } = render(<AiSuggestionBanner />)
    await user.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(dismiss).toHaveBeenCalledWith('s1')
  })
})
