import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RelishStage, RELISH_STAGE_MAX_MS } from './RelishStage'
import { tonightsPrompt } from '@/lib/wall/relish/tonight'
import { WOULD_YOU_RATHER } from '@/lib/wall/relish/games'

const NOW = new Date(2026, 10, 19, 18, 30)
const question = () => within(screen.getByRole('region', { name: 'Tonight’s question' }))

describe('Relish on the wall: tonight’s question', () => {
  it('shows the day’s kid question by default, and Another moves on', () => {
    render(<RelishStage now={NOW} />)
    expect(screen.getByRole('button', { name: 'Kids at the table' })).toHaveAttribute('aria-pressed', 'true')
    expect(question().getByText(tonightsPrompt(NOW, 'kid')!.text)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Another' }))
    expect(question().getByText(tonightsPrompt(NOW, 'kid', 1)!.text)).toBeInTheDocument()
  })

  it('Just grown-ups switches to the adult questions, from the day’s own pick', () => {
    render(<RelishStage now={NOW} />)
    fireEvent.click(screen.getByRole('button', { name: 'Another' }))
    fireEvent.click(screen.getByRole('button', { name: 'Just grown-ups' }))
    expect(screen.getByRole('button', { name: 'Just grown-ups' })).toHaveAttribute('aria-pressed', 'true')
    expect(question().getByText(tonightsPrompt(NOW, 'adult')!.text)).toBeInTheDocument()
  })

  it('a new day starts again from that day’s question', () => {
    const { rerender } = render(<RelishStage now={NOW} />)
    fireEvent.click(screen.getByRole('button', { name: 'Another' }))
    const tomorrow = new Date(2026, 10, 20, 18, 30)
    rerender(<RelishStage now={tomorrow} />)
    expect(question().getByText(tonightsPrompt(tomorrow, 'kid')!.text)).toBeInTheDocument()
  })
})

describe('Relish on the wall: dinnertime activities', () => {
  it('eight games as cards; one opens its steps in place, and All games goes back', () => {
    render(<RelishStage now={NOW} />)
    const games = within(screen.getByRole('region', { name: 'Dinnertime activities' }))
    expect(games.getAllByRole('heading', { level: 3 })).toHaveLength(8)
    fireEvent.click(games.getByRole('button', { name: /Rose, thorn, bud/ }))
    expect(games.getByRole('heading', { level: 3, name: 'Rose, thorn, bud' })).toBeInTheDocument()
    expect(games.getByText('Bud: something you’re looking forward to.')).toBeInTheDocument()
    // Tonight's question stays up beside it.
    expect(question().getByText(tonightsPrompt(NOW, 'kid')!.text)).toBeInTheDocument()
    fireEvent.click(games.getByRole('button', { name: 'All games' }))
    expect(games.getAllByRole('heading', { level: 3 })).toHaveLength(8)
  })

  it('Would you rather shows one pair at a time, and Another one turns to the next', () => {
    render(<RelishStage now={NOW} />)
    fireEvent.click(screen.getByRole('button', { name: /^Would you rather/ }))
    const shown = WOULD_YOU_RATHER.filter((q) => screen.queryByText(q))
    expect(shown).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Another one' }))
    const next = WOULD_YOU_RATHER.filter((q) => screen.queryByText(q))
    expect(next).toHaveLength(1)
    expect(WOULD_YOU_RATHER.indexOf(next[0])).toBe((WOULD_YOU_RATHER.indexOf(shown[0]) + 1) % WOULD_YOU_RATHER.length)
  })

  it('Guess my favorite lays out the small joys to pick from', () => {
    render(<RelishStage now={NOW} />)
    fireEvent.click(screen.getByRole('button', { name: /^Guess my favorite/ }))
    expect(screen.getByText('A movie with snacks')).toBeInTheDocument()
  })
})

describe('Relish on the wall: it doesn’t stay up overnight', () => {
  afterEach(() => { vi.useRealTimers() })

  it('goes back after a long while untouched; a touch starts the wait again', () => {
    vi.useFakeTimers()
    const onClose = vi.fn()
    render(<RelishStage now={NOW} onClose={onClose} />)
    act(() => { vi.advanceTimersByTime(RELISH_STAGE_MAX_MS - 60_000) })
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Another' }))
    act(() => { vi.advanceTimersByTime(RELISH_STAGE_MAX_MS - 60_000) })
    expect(onClose).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(60_000) })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
