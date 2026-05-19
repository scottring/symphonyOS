import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'
import { TimelineInsertPoint } from './TimelineInsertPoint'

describe('TimelineInsertPoint', () => {
  it('renders a + trigger and no segments until opened', () => {
    render(<TimelineInsertPoint onPick={vi.fn()} />)
    expect(screen.getByRole('button', { name: /add between items/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^task$/i })).not.toBeInTheDocument()
  })
  it('opens the radial wheel on click, showing 4 segments', () => {
    render(<TimelineInsertPoint onPick={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /add between items/i }))
    for (const label of ['Note', 'Task', 'Event', 'Routine'])
      expect(screen.getByRole('button', { name: new RegExp(`^${label}$`, 'i') })).toBeInTheDocument()
  })
  it('fires onPick with the kind and closes the wheel', () => {
    const onPick = vi.fn()
    render(<TimelineInsertPoint onPick={onPick} />)
    fireEvent.click(screen.getByRole('button', { name: /add between items/i }))
    fireEvent.click(screen.getByRole('button', { name: /^event$/i }))
    expect(onPick).toHaveBeenCalledWith('event')
    expect(screen.queryByRole('button', { name: /^event$/i })).not.toBeInTheDocument()
  })
  it('closes on Escape without firing onPick', () => {
    const onPick = vi.fn()
    render(<TimelineInsertPoint onPick={onPick} />)
    fireEvent.click(screen.getByRole('button', { name: /add between items/i }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('button', { name: /^task$/i })).not.toBeInTheDocument()
    expect(onPick).not.toHaveBeenCalled()
  })
})
