import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { TravelChip } from './TravelChip'
import { readTravelChoice, routeMode, travelKey, writeTravelChoice } from '@/lib/travelChoice'
import type { TimelineItem } from '@/types/timeline'

describe('TravelChip — how are you getting there?', () => {
  it('hovering the travel time asks, with the five ways; picking one says so', () => {
    const onChoose = vi.fn()
    render(<TravelChip label="15 min drive" choice="driving" onChoose={onChoose} />)
    fireEvent.mouseEnter(screen.getByRole('button', { name: /15 min drive/ }).parentElement!)
    const menu = screen.getByRole('group', { name: 'How are you getting there?' })
    expect([...menu.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Walking', 'Biking', 'Driving', 'Uber', 'Public transport'])
    expect(screen.getByRole('button', { name: 'Driving' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Uber' }))
    expect(onChoose).toHaveBeenCalledWith('rideshare')
    expect(screen.queryByRole('group', { name: 'How are you getting there?' })).not.toBeInTheDocument()
  })

  it('a click opens it too (touch), and nothing shows without a travel time', () => {
    const { rerender } = render(<TravelChip label="15 min drive" choice="driving" onChoose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /15 min drive/ }))
    expect(screen.getByRole('group', { name: 'How are you getting there?' })).toBeInTheDocument()
    rerender(<TravelChip label={null} choice="driving" onChoose={vi.fn()} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

describe('travelChoice', () => {
  beforeEach(() => localStorage.clear())
  it('keeps one choice per event, under its calendar id; driving until picked', () => {
    const item = { id: 'event-x', originalEvent: { id: 'row-1', google_event_id: 'g-1' } } as unknown as TimelineItem
    expect(travelKey(item)).toBe('g-1')
    expect(readTravelChoice('g-1')).toBe('driving')
    writeTravelChoice('g-1', 'transit')
    expect(readTravelChoice('g-1')).toBe('transit')
    expect(readTravelChoice('g-2')).toBe('driving')
  })
  it('Uber is timed as a drive', () => {
    expect(routeMode('rideshare')).toBe('driving')
    expect(routeMode('bicycling')).toBe('bicycling')
  })
})
