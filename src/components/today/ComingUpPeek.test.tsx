import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { ComingUpPeek } from './ComingUpPeek'
import type { ComingUpSummary } from '@/lib/today/comingUp'

const now = new Date(2026, 5, 7, 10, 0, 0) // Sun Jun 7

describe('ComingUpPeek', () => {
  it('renders nothing when the summary is empty', () => {
    const summary: ComingUpSummary = { nextDays: [], weekCount: 0, inboxCount: 0 }
    const { container } = render(
      <ComingUpPeek summary={summary} now={now} onSelectDay={vi.fn()} onOpenWeek={vi.fn()} onOpenInbox={vi.fn()} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('shows week + inbox pills and routes them', async () => {
    const summary: ComingUpSummary = { nextDays: [], weekCount: 3, inboxCount: 2 }
    const onOpenWeek = vi.fn(); const onOpenInbox = vi.fn()
    const { user } = render(
      <ComingUpPeek summary={summary} now={now} onSelectDay={vi.fn()} onOpenWeek={onOpenWeek} onOpenInbox={onOpenInbox} />
    )
    await user.click(screen.getByText(/3 this week/i))
    expect(onOpenWeek).toHaveBeenCalled()
    await user.click(screen.getByText(/2 to sort/i))
    expect(onOpenInbox).toHaveBeenCalled()
  })

  it('labels tomorrow and routes a day pill', async () => {
    const tomorrow = new Date(2026, 5, 8); tomorrow.setHours(0, 0, 0, 0)
    const summary: ComingUpSummary = { nextDays: [{ date: tomorrow, count: 2 }], weekCount: 0, inboxCount: 0 }
    const onSelectDay = vi.fn()
    const { user } = render(
      <ComingUpPeek summary={summary} now={now} onSelectDay={onSelectDay} onOpenWeek={vi.fn()} onOpenInbox={vi.fn()} />
    )
    await user.click(screen.getByText(/Tomorrow · 2/i))
    expect(onSelectDay).toHaveBeenCalledWith(tomorrow)
  })

  it('caps the number of day pills', () => {
    const mk = (day: number) => { const d = new Date(2026, 5, day); d.setHours(0, 0, 0, 0); return { date: d, count: 1 } }
    const summary: ComingUpSummary = { nextDays: [mk(8), mk(9), mk(10), mk(11)], weekCount: 0, inboxCount: 0 }
    render(
      <ComingUpPeek summary={summary} now={now} onSelectDay={vi.fn()} onOpenWeek={vi.fn()} onOpenInbox={vi.fn()} maxDays={3} />
    )
    // Only 3 day pills render (each shows "· 1")
    expect(screen.getAllByText(/· 1/).length).toBe(3)
  })
})
