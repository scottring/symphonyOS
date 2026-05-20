import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { AtAGlance } from './AtAGlance'

describe('AtAGlance', () => {
  it('renders the open-tasks line', () => {
    render(
      <AtAGlance
        openTaskCount={3}
        eventsTodayCount={2}
        tomorrowFirstEvent={null}
        onViewFullPlan={vi.fn()}
      />,
    )
    expect(screen.getByText(/3 tasks still open/i)).toBeInTheDocument()
  })

  it('uses singular for one task', () => {
    render(
      <AtAGlance
        openTaskCount={1}
        eventsTodayCount={0}
        tomorrowFirstEvent={null}
        onViewFullPlan={vi.fn()}
      />,
    )
    expect(screen.getByText(/1 task still open/i)).toBeInTheDocument()
  })

  it('renders the events-today line when count > 0', () => {
    render(
      <AtAGlance
        openTaskCount={0}
        eventsTodayCount={4}
        tomorrowFirstEvent={null}
        onViewFullPlan={vi.fn()}
      />,
    )
    expect(screen.getByText(/4 events today/i)).toBeInTheDocument()
  })

  it('omits the events-today line when zero', () => {
    render(
      <AtAGlance
        openTaskCount={0}
        eventsTodayCount={0}
        tomorrowFirstEvent={null}
        onViewFullPlan={vi.fn()}
      />,
    )
    expect(screen.queryByText(/events today/i)).not.toBeInTheDocument()
  })

  it('renders tomorrow line when an event is provided', () => {
    render(
      <AtAGlance
        openTaskCount={0}
        eventsTodayCount={0}
        tomorrowFirstEvent={{ title: 'Soccer practice', timeLabel: '5:00 PM' }}
        onViewFullPlan={vi.fn()}
      />,
    )
    expect(screen.getByText(/soccer practice tomorrow/i)).toBeInTheDocument()
  })

  it('omits tomorrow line when null', () => {
    render(
      <AtAGlance
        openTaskCount={0}
        eventsTodayCount={0}
        tomorrowFirstEvent={null}
        onViewFullPlan={vi.fn()}
      />,
    )
    expect(screen.queryByText(/tomorrow/i)).not.toBeInTheDocument()
  })

  it('shows a fallback when there is nothing to surface', () => {
    render(
      <AtAGlance
        openTaskCount={0}
        eventsTodayCount={0}
        tomorrowFirstEvent={null}
        onViewFullPlan={vi.fn()}
      />,
    )
    expect(screen.getByText(/all clear/i)).toBeInTheDocument()
  })

  it('calls onViewFullPlan when the CTA is clicked', async () => {
    const onViewFullPlan = vi.fn()
    const { user } = render(
      <AtAGlance
        openTaskCount={3}
        eventsTodayCount={2}
        tomorrowFirstEvent={null}
        onViewFullPlan={onViewFullPlan}
      />,
    )
    await user.click(screen.getByRole('button', { name: /view full plan/i }))
    expect(onViewFullPlan).toHaveBeenCalledTimes(1)
  })
})
