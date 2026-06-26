import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FocusTodayRow } from './FocusTodayRow'
import type { TimelineItem } from '@/types/timeline'

const item = (id: string): TimelineItem =>
  ({ id, type: 'event', title: id, startTime: new Date(2026,5,24,9), endTime: new Date(2026,5,24,10), completed: false } as TimelineItem)

describe('FocusTodayRow', () => {
  it('renders a card per item and calls onSelectItem on click', () => {
    const onSelect = vi.fn()
    render(<FocusTodayRow items={[item('A'), item('B')]} totalEvents={11} onSelectItem={onSelect} />)
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByText(/2 focus items/i)).toBeInTheDocument()
    fireEvent.click(screen.getByText('A'))
    expect(onSelect).toHaveBeenCalledWith('A')
  })
})
