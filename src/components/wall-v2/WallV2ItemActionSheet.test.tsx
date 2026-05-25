import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WallV2ItemActionSheet } from './WallV2ItemActionSheet'
import { Calendar } from 'lucide-react'
import type { WallV2TimelineEvent } from './types'

const routine: WallV2TimelineEvent = { id: 'routine-1', icon: Calendar, tint: 'sage', title: 'Trash', kind: 'routine' }
const event: WallV2TimelineEvent = { id: 'event-9', icon: Calendar, tint: 'sky', title: 'Dentist', kind: 'event' }

describe('WallV2ItemActionSheet', () => {
  it('routine: Skip today + Mark done fire with id+kind', () => {
    const onSkip = vi.fn(); const onMarkDone = vi.fn(); const onClose = vi.fn()
    render(<WallV2ItemActionSheet event={routine} onSkip={onSkip} onMarkDone={onMarkDone} onClose={onClose} />)
    fireEvent.click(screen.getByText('Skip today'))
    expect(onSkip).toHaveBeenCalledWith('routine-1', 'routine')
    fireEvent.click(screen.getByText('Mark done'))
    expect(onMarkDone).toHaveBeenCalledWith('routine-1', 'routine')
  })

  it('event: shows Skip today, not Mark done', () => {
    const onSkip = vi.fn(); const onMarkDone = vi.fn(); const onClose = vi.fn()
    render(<WallV2ItemActionSheet event={event} onSkip={onSkip} onMarkDone={onMarkDone} onClose={onClose} />)
    expect(screen.queryByText('Mark done')).toBeNull()
    fireEvent.click(screen.getByText('Skip today'))
    expect(onSkip).toHaveBeenCalledWith('event-9', 'event')
  })
})
