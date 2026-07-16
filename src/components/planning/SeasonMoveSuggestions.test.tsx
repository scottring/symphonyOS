import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SeasonMoveSuggestions } from './SeasonMoveSuggestions'

const stream = vi.hoisted(() => vi.fn())
vi.mock('@/lib/agentStream', () => ({ streamSymphonyAgent: stream }))

describe('SeasonMoveSuggestions', () => {
  it('fetches on demand and fills (never submits) via onPick', async () => {
    stream.mockImplementation(async (_msgs, handlers) => {
      handlers.onDone?.('["Living room furnished and usable", "Basement cleared"]', null)
    })
    const onPick = vi.fn()
    render(<SeasonMoveSuggestions goalName="Make home into home" onPick={onPick} />)
    // Nothing fetched until asked — the ritual stays quiet by default.
    expect(stream).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Suggest season-sized moves/ }))
    await waitFor(() => expect(screen.getByText('Living room furnished and usable')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Basement cleared'))
    expect(onPick).toHaveBeenCalledWith('Basement cleared')
    // The goal rides in the prompt itself (works pre-sessionContext deploy).
    expect(stream.mock.calls[0][0][0].content).toContain('Make home into home')
  })

  it('degrades to a quiet line when the agent is offline', async () => {
    stream.mockImplementation(async (_msgs, handlers) => { handlers.onError?.('Assistant offline') })
    render(<SeasonMoveSuggestions goalName="X" onPick={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /Suggest season-sized moves/ }))
    await waitFor(() => expect(screen.getByText(/write it yourself/)).toBeInTheDocument())
  })
})
