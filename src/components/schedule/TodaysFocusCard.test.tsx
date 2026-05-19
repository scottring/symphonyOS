import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { TodaysFocusCard } from './TodaysFocusCard'

describe('TodaysFocusCard', () => {
  it('renders the headline and a counts sub-line', () => {
    render(<TodaysFocusCard headline="Keep today simple and connected." priorities={2} meals={1} events={3} />)
    expect(screen.getByText('Keep today simple and connected.')).toBeInTheDocument()
    expect(screen.getByText('2 priorities • 1 meal • 3 events')).toBeInTheDocument()
  })
  it('uses singular nouns for counts of 1 and omits zero segments', () => {
    render(<TodaysFocusCard headline="x" priorities={1} meals={0} events={1} />)
    expect(screen.getByText('1 priority • 1 event')).toBeInTheDocument()
  })
  it('shows a gentle fallback when everything is zero', () => {
    render(<TodaysFocusCard headline="x" priorities={0} meals={0} events={0} />)
    expect(screen.getByText('Nothing scheduled yet')).toBeInTheDocument()
  })
  it('calls onActivate when clicked', async () => {
    const onActivate = vi.fn()
    const { user } = render(<TodaysFocusCard headline="x" priorities={1} meals={0} events={0} onActivate={onActivate} />)
    await user.click(screen.getByRole('button', { name: /today's focus/i }))
    expect(onActivate).toHaveBeenCalledTimes(1)
  })
  it('is a plain card (no button role) when onActivate is absent', () => {
    render(<TodaysFocusCard headline="x" priorities={1} meals={0} events={0} />)
    expect(screen.queryByRole('button', { name: /today's focus/i })).not.toBeInTheDocument()
  })
})
