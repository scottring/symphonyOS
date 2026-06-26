import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FocusTodayRow } from './FocusTodayRow'
import type { TimelineItem } from '@/types/timeline'

const item = (id: string): TimelineItem =>
  ({ id, type: 'event', title: id, startTime: new Date(2026,5,24,9), endTime: new Date(2026,5,24,10), completed: false } as TimelineItem)

describe('FocusTodayRow', () => {
  it('renders HIGHLIGHTS header', () => {
    render(<FocusTodayRow items={[item('A')]} totalEvents={5} onSelectItem={vi.fn()} />)
    expect(screen.getByText(/^HIGHLIGHTS$/i)).toBeInTheDocument()
  })

  it('renders a card per item and calls onSelectItem on click', () => {
    const onSelect = vi.fn()
    render(<FocusTodayRow items={[item('A'), item('B')]} totalEvents={11} onSelectItem={onSelect} />)
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByText('B')).toBeInTheDocument()
    expect(screen.getByText(/2 highlights/i)).toBeInTheDocument()
    fireEvent.click(screen.getByText('A'))
    expect(onSelect).toHaveBeenCalledWith('A')
  })

  it('does not render when items is empty', () => {
    const { container } = render(<FocusTodayRow items={[]} totalEvents={0} onSelectItem={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })
})
