import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ListSuggestions } from './ListSuggestions'

const stream = vi.hoisted(() => vi.fn())
vi.mock('@/lib/agentStream', () => ({ streamSymphonyAgent: stream }))

describe('ListSuggestions', () => {
  it('renders nothing when there is no level-above list to draw from', () => {
    const { container } = render(
      <ListSuggestions bucket="month" aboveItems={[]} aboveLabel="your season list" onPick={() => {}} />,
    )
    expect(container).toBeEmptyDOMElement()
    expect(stream).not.toHaveBeenCalled()
  })

  it('suggests on demand and FILLS (never submits) via onPick; embeds the above-list + grain in the prompt', async () => {
    stream.mockImplementation(async (_msgs, handlers) => {
      handlers.onDone?.('["Order the dishwasher", "Book the plumber"]', null)
    })
    const onPick = vi.fn()
    render(
      <ListSuggestions
        bucket="month"
        aboveItems={['Renovate the kitchen', 'Sort the basement']}
        aboveLabel="your season list"
        onPick={onPick}
      />,
    )
    expect(stream).not.toHaveBeenCalled() // quiet until asked
    fireEvent.click(screen.getByRole('button', { name: /Suggest month-sized items/ }))
    await waitFor(() => expect(screen.getByText('Order the dishwasher')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Book the plumber'))
    expect(onPick).toHaveBeenCalledWith('Book the plumber')

    const prompt = stream.mock.calls[0][0][0].content as string
    expect(prompt).toContain('Renovate the kitchen') // the whole above-list rides in the prompt
    expect(prompt).toContain('month-sized')          // the grain rule for this horizon
  })

  it('degrades to a quiet line when the agent is offline', async () => {
    stream.mockImplementation(async (_msgs, handlers) => { handlers.onError?.('offline') })
    render(<ListSuggestions bucket="week" aboveItems={['Ship the review']} aboveLabel="your month list" onPick={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /Suggest week-sized items/ }))
    await waitFor(() => expect(screen.getByText(/write it yourself/)).toBeInTheDocument())
  })
})
