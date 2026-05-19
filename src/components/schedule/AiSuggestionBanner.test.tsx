import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { AiSuggestionBanner } from './AiSuggestionBanner'

const hookMock = vi.fn()
vi.mock('@/hooks/useProactiveSuggestions', () => ({ useProactiveSuggestions: () => hookMock() }))
afterEach(() => hookMock.mockReset())

const base = { actOnSuggestion: vi.fn(), dismissSuggestion: vi.fn(), isLoading: false }

const A = (o: Partial<Record<string, unknown>>) => ({
  id: 'x',
  title: 'T',
  status: 'active',
  suggestionType: 'call',
  actionPayload: {},
  confidence: 0.9,
  suggestionKey: 'k',
  ...o,
})

describe('AiSuggestionBanner', () => {
  it('renders nothing when there are no suggestions', () => {
    hookMock.mockReturnValue({ ...base, suggestions: [], topSuggestions: [] })
    const { container } = render(<AiSuggestionBanner />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when no suggestion clears the bar (low confidence)', () => {
    hookMock.mockReturnValue({ ...base, suggestions: [A({ confidence: 0.2 })], topSuggestions: [A({ confidence: 0.2 })] })
    const { container } = render(<AiSuggestionBanner />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing for non-actionable types', () => {
    const s = A({ suggestionType: 'someday', confidence: 0.99 })
    hookMock.mockReturnValue({ ...base, suggestions: [s], topSuggestions: [s] })
    const { container } = render(<AiSuggestionBanner />)
    expect(container.firstChild).toBeNull()
  })

  it('renders the top actionable suggestion title + detail', () => {
    const s = A({ id: 's1', title: 'Call Dr. Smith', detail: 'Waiting 5 days', suggestionType: 'call', confidence: 0.95 })
    hookMock.mockReturnValue({ ...base, suggestions: [s], topSuggestions: [s] })
    render(<AiSuggestionBanner />)
    expect(screen.getByText('Call Dr. Smith')).toBeInTheDocument()
    expect(screen.getByText(/Waiting 5 days/)).toBeInTheDocument()
  })

  it('picks the single highest-confidence actionable suggestion, stable across re-render (no cycling)', () => {
    const lo = A({ id: 'lo', title: 'Low', confidence: 0.7, suggestionKey: 'lo' })
    const hi = A({ id: 'hi', title: 'High', confidence: 0.95, suggestionKey: 'hi' })
    hookMock.mockReturnValue({ ...base, suggestions: [lo, hi], topSuggestions: [lo, hi] })
    const { rerender } = render(<AiSuggestionBanner />)
    expect(screen.getByText('High')).toBeInTheDocument()
    expect(screen.queryByText('Low')).not.toBeInTheDocument()
    rerender(<AiSuggestionBanner />)
    expect(screen.getByText('High')).toBeInTheDocument()
  })

  it('a dismissed suggestionKey stays gone for the session', async () => {
    const dismiss = vi.fn()
    const s = A({ id: 's1', title: 'Solo', confidence: 0.9, suggestionKey: 'kk' })
    hookMock.mockReturnValue({ ...base, dismissSuggestion: dismiss, suggestions: [s], topSuggestions: [s] })
    const { user, rerender } = render(<AiSuggestionBanner />)
    await user.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(dismiss).toHaveBeenCalledWith('s1')
    rerender(<AiSuggestionBanner />)
    expect(screen.queryByText('Solo')).not.toBeInTheDocument()
  })

  it('dismiss calls dismissSuggestion with the id', async () => {
    const dismiss = vi.fn()
    const s = A({ id: 's1', title: 'Follow up with Jane', suggestionType: 'followup', confidence: 0.85, suggestionKey: 'fu1' })
    hookMock.mockReturnValue({ ...base, dismissSuggestion: dismiss, suggestions: [s], topSuggestions: [s] })
    const { user } = render(<AiSuggestionBanner />)
    await user.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(dismiss).toHaveBeenCalledWith('s1')
  })
})
