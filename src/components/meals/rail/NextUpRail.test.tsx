import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { NextUpRail } from './NextUpRail'

describe('NextUpRail', () => {
  it('renders nothing when there are no upcoming events', () => {
    const { container } = render(
      <NextUpRail events={[]} onViewCalendar={vi.fn()} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders each event title with its day label', () => {
    render(
      <NextUpRail
        events={[
          { id: 'e1', dayLabel: 'Tomorrow', title: 'Early release 1:15 PM' },
          { id: 'e2', dayLabel: 'Friday',   title: "Ella's field trip" },
        ]}
        onViewCalendar={vi.fn()}
      />,
    )
    expect(screen.getByText('Tomorrow')).toBeInTheDocument()
    expect(screen.getByText('Early release 1:15 PM')).toBeInTheDocument()
    expect(screen.getByText('Friday')).toBeInTheDocument()
    expect(screen.getByText("Ella's field trip")).toBeInTheDocument()
  })

  it('calls onViewCalendar when the CTA is clicked', async () => {
    const onViewCalendar = vi.fn()
    const { user } = render(
      <NextUpRail
        events={[{ id: 'e1', dayLabel: 'Tomorrow', title: 'Foo' }]}
        onViewCalendar={onViewCalendar}
      />,
    )
    await user.click(screen.getByRole('button', { name: /view calendar/i }))
    expect(onViewCalendar).toHaveBeenCalledTimes(1)
  })
})
