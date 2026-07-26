import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DaySectionHeader } from '@/components/schedule/DaySectionHeader'

describe('DaySectionHeader', () => {
  it('shows the label and its true range', () => {
    render(<DaySectionHeader section="evening" itemCount={3} completedCount={0}
      collapsed={false} emptyBecauseHero={false} onToggle={() => {}} />)
    expect(screen.getByText('Evening')).toBeInTheDocument()
    expect(screen.getByText('5:00 PM – 9:00 PM')).toBeInTheDocument()
  })

  it('keeps count and progress visible when collapsed', () => {
    render(<DaySectionHeader section="morning" itemCount={5} completedCount={2}
      collapsed emptyBecauseHero={false} onToggle={() => {}} />)
    expect(screen.getByText(/5/)).toBeInTheDocument()
    expect(screen.getByText(/2 done/)).toBeInTheDocument()
  })

  it('reports its collapsed state to assistive tech', () => {
    const { rerender } = render(<DaySectionHeader section="night" itemCount={1} completedCount={0}
      collapsed emptyBecauseHero={false} onToggle={() => {}} />)
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false')
    rerender(<DaySectionHeader section="night" itemCount={1} completedCount={0}
      collapsed={false} emptyBecauseHero={false} onToggle={() => {}} />)
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true')
  })

  it('toggles on click', async () => {
    const onToggle = vi.fn()
    render(<DaySectionHeader section="afternoon" itemCount={2} completedCount={0}
      collapsed={false} emptyBecauseHero={false} onToggle={onToggle} />)
    await userEvent.click(screen.getByRole('button'))
    expect(onToggle).toHaveBeenCalledOnce()
  })

  it('is inert when the section is empty only because of the hero', () => {
    render(<DaySectionHeader section="morning" itemCount={0} completedCount={0}
      collapsed={false} emptyBecauseHero onToggle={() => {}} />)
    expect(screen.getByRole('button')).toBeDisabled()
    expect(screen.getByText(/up next/)).toBeInTheDocument()
  })
})

describe('DaySectionHeader — a band materialised mid-drag', () => {
  it('does NOT claim "up next" for a band that never had an item', () => {
    // Stage 2b renders empty bands during a drag so 6 AM is reachable. Such a
    // band has nothing to lift into the hero, so emptyBecauseHero must be
    // false for it — otherwise the header tells the user its item is "up next"
    // when the band is simply empty.
    render(<DaySectionHeader section="earlyMorning" itemCount={0} completedCount={0}
      collapsed emptyBecauseHero={false} onToggle={() => {}} />)
    expect(screen.queryByText(/up next/i)).not.toBeInTheDocument()
    expect(screen.getByText('Early morning')).toBeInTheDocument()
  })
})
