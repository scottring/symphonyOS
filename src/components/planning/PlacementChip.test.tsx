// src/components/planning/PlacementChip.test.tsx
//
// PlacementChip is the shared rhythm-language card used by Month grid cells
// and pool rows (DenseInboxRow) — see the WeekStrip Chip in
// src/components/routine/rhythm/WeekStrip.tsx for the anatomy this rhymes with.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PlacementChip } from './PlacementChip'

// Minimal DataTransfer mock — jsdom's DataTransfer doesn't implement setData/getData.
function makeDataTransfer() {
  return {
    data: {} as Record<string, string>,
    setData(k: string, v: string) { this.data[k] = v },
    getData(k: string) { return this.data[k] ?? '' },
    get types() { return Object.keys(this.data) },
    effectAllowed: 'none',
  }
}

describe('PlacementChip', () => {
  it('renders the name', () => {
    render(<PlacementChip id="t1" name="Buy groceries" />)
    expect(screen.getByText('Buy groceries')).toBeInTheDocument()
  })

  it('renders a grip glyph when draggable', () => {
    const { container } = render(<PlacementChip id="t1" name="Buy groceries" draggable />)
    expect(container.querySelector('svg.lucide-grip-vertical')).toBeInTheDocument()
  })

  it('does not render a grip glyph when not draggable', () => {
    const { container } = render(<PlacementChip id="t1" name="Buy groceries" />)
    expect(container.querySelector('svg.lucide-grip-vertical')).not.toBeInTheDocument()
  })

  it('sets text/task-id on dragStart when draggable', () => {
    const { container } = render(<PlacementChip id="t1" name="Buy groceries" draggable />)
    const el = container.firstElementChild as HTMLElement
    const dataTransfer = makeDataTransfer()
    fireEvent.dragStart(el, { dataTransfer })
    expect(dataTransfer.getData('text/task-id')).toBe('t1')
  })

  it('applies the purple event tint for kind="event"', () => {
    const { container } = render(<PlacementChip id="e1" name="Dentist" kind="event" />)
    const el = container.firstElementChild as HTMLElement
    expect(el.className).toMatch(/bg-\[#f4effc\]/)
  })

  it('renders a time badge when provided', () => {
    render(<PlacementChip id="t1" name="Buy groceries" time="14:30" />)
    expect(screen.getByText('14:30')).toBeInTheDocument()
  })

  it('renders member avatars with initials', () => {
    render(
      <PlacementChip
        id="t1"
        name="Buy groceries"
        members={[{ id: 'm1', name: 'Iris', initials: 'IK', color: 'blue' }]}
      />,
    )
    expect(screen.getByText('IK')).toBeInTheDocument()
  })

  it('fires onClick when clicked', () => {
    const onClick = vi.fn()
    render(<PlacementChip id="t1" name="Buy groceries" onClick={onClick} />)
    fireEvent.click(screen.getByText('Buy groceries'))
    expect(onClick).toHaveBeenCalled()
  })

  it('renders the name as a button (focusable) when onClick is provided', () => {
    render(<PlacementChip id="t1" name="Buy groceries" onClick={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Buy groceries' })).toBeInTheDocument()
  })

  it('renders the name as a non-focusable div when onClick is absent (e.g. events)', () => {
    render(<PlacementChip id="e1" name="Dentist" kind="event" />)
    expect(screen.queryByRole('button', { name: 'Dentist' })).not.toBeInTheDocument()
    expect(screen.getByText('Dentist')).toBeInTheDocument()
  })

  it('defaults the title tooltip to name', () => {
    const { container } = render(<PlacementChip id="t1" name="Buy groceries" />)
    const el = container.firstElementChild as HTMLElement
    expect(el).toHaveAttribute('title', 'Buy groceries')
  })

  it('uses an explicit title over name when provided', () => {
    const { container } = render(<PlacementChip id="t1" name="Buy groceries" title="Buy groceries (Trader Joe's)" />)
    const el = container.firstElementChild as HTMLElement
    expect(el).toHaveAttribute('title', "Buy groceries (Trader Joe's)")
  })

  it('defaults to clamped/truncated title text (wrap unset)', () => {
    render(<PlacementChip id="t1" name="Buy groceries" onClick={vi.fn()} />)
    const title = screen.getByText('Buy groceries')
    expect(title.className).toMatch(/line-clamp-2/)
    expect(title.className).toMatch(/truncate/)
    expect(title.className).not.toMatch(/break-words/)
  })

  it('wrap=true drops line-clamp/truncate in favor of break-words, for a clickable chip', () => {
    render(<PlacementChip id="t1" name="Buy groceries" onClick={vi.fn()} wrap />)
    const title = screen.getByText('Buy groceries')
    expect(title.className).toMatch(/break-words/)
    expect(title.className).not.toMatch(/line-clamp-2/)
    expect(title.className).not.toMatch(/truncate/)
  })

  it('wrap=true drops line-clamp/truncate for a non-clickable (event) chip too', () => {
    render(<PlacementChip id="e1" name="Dentist" kind="event" wrap />)
    const title = screen.getByText('Dentist')
    expect(title.className).toMatch(/break-words/)
    expect(title.className).not.toMatch(/line-clamp-2/)
    expect(title.className).not.toMatch(/truncate/)
  })
})
