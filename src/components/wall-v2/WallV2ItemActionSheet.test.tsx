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
    render(<WallV2ItemActionSheet event={routine} onSkip={onSkip} onMarkDone={onMarkDone} onPushTask={vi.fn()} onClose={onClose} />)
    fireEvent.click(screen.getByText('Skip today'))
    expect(onSkip).toHaveBeenCalledWith('routine-1', 'routine')
    fireEvent.click(screen.getByText('Mark done'))
    expect(onMarkDone).toHaveBeenCalledWith('routine-1', 'routine')
  })

  it('event: shows Skip today, not Mark done', () => {
    const onSkip = vi.fn(); const onMarkDone = vi.fn(); const onClose = vi.fn()
    render(<WallV2ItemActionSheet event={event} onSkip={onSkip} onMarkDone={onMarkDone} onPushTask={vi.fn()} onClose={onClose} />)
    expect(screen.queryByText('Mark done')).toBeNull()
    fireEvent.click(screen.getByText('Skip today'))
    expect(onSkip).toHaveBeenCalledWith('event-9', 'event')
  })

  it('task: renders Mark complete + 4 push presets + Cancel; no Skip today', () => {
    const task: WallV2TimelineEvent = {
      id: 'task-od-1', icon: Calendar, tint: 'honey',
      title: 'Pay water bill', subtitle: 'Was due 3 days ago',
      kind: 'task',
    }
    const onSkip = vi.fn(); const onMarkDone = vi.fn(); const onPushTask = vi.fn(); const onClose = vi.fn()
    render(
      <WallV2ItemActionSheet
        event={task}
        onSkip={onSkip}
        onMarkDone={onMarkDone}
        onPushTask={onPushTask}
        onClose={onClose}
      />
    )

    // Visible affordances
    expect(screen.getByText('Mark complete')).toBeInTheDocument()
    expect(screen.getByText('This week')).toBeInTheDocument()
    expect(screen.getByText('Next week')).toBeInTheDocument()
    expect(screen.getByText('Next month')).toBeInTheDocument()
    expect(screen.getByText('Someday')).toBeInTheDocument()
    expect(screen.getByText('Cancel')).toBeInTheDocument()

    // Task variant must NOT render the routine/event "Skip today" button.
    expect(screen.queryByText('Skip today')).toBeNull()
    // Task variant must NOT render the routine "Mark done" button —
    // the task copy is "Mark complete," a different button.
    expect(screen.queryByText('Mark done')).toBeNull()
  })

  it('task: Mark complete fires onMarkDone with (id, "task")', () => {
    const task: WallV2TimelineEvent = { id: 'task-od-1', icon: Calendar, tint: 'honey', title: 'Pay water bill', kind: 'task' }
    const onMarkDone = vi.fn()
    render(
      <WallV2ItemActionSheet
        event={task}
        onSkip={vi.fn()}
        onMarkDone={onMarkDone}
        onPushTask={vi.fn()}
        onClose={vi.fn()}
      />
    )
    fireEvent.click(screen.getByText('Mark complete'))
    expect(onMarkDone).toHaveBeenCalledWith('task-od-1', 'task')
  })

  it.each([
    ['This week',  'this-week'],
    ['Next week',  'next-week'],
    ['Next month', 'next-month'],
    ['Someday',    'someday'],
  ])('task: tapping %s fires onPushTask with preset %s', (label, preset) => {
    const task: WallV2TimelineEvent = { id: 'task-od-1', icon: Calendar, tint: 'honey', title: 'Pay water bill', kind: 'task' }
    const onPushTask = vi.fn()
    render(
      <WallV2ItemActionSheet
        event={task}
        onSkip={vi.fn()}
        onMarkDone={vi.fn()}
        onPushTask={onPushTask}
        onClose={vi.fn()}
      />
    )
    fireEvent.click(screen.getByText(label))
    expect(onPushTask).toHaveBeenCalledWith('task-od-1', preset)
  })

  it('task: tapping any push button closes the sheet', () => {
    const task: WallV2TimelineEvent = { id: 'task-od-1', icon: Calendar, tint: 'honey', title: 'Pay water bill', kind: 'task' }
    const onClose = vi.fn()
    render(
      <WallV2ItemActionSheet
        event={task}
        onSkip={vi.fn()}
        onMarkDone={vi.fn()}
        onPushTask={vi.fn()}
        onClose={onClose}
      />
    )
    fireEvent.click(screen.getByText('Next month'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('context: renders phone (tap-to-call), location (Maps), meeting, links and notes', () => {
    const rich: WallV2TimelineEvent = {
      id: 'event-rich', icon: Calendar, tint: 'sky', title: 'Dentist', kind: 'event',
      phoneNumber: '555-0142',
      location: '123 Main St',
      locationPlaceId: 'place_abc',
      meetingUrl: 'https://meet.example.com/xyz',
      links: [{ url: 'https://forms.example.com', title: 'Intake form' }],
      notes: 'Bring insurance card',
    }
    render(<WallV2ItemActionSheet event={rich} onSkip={vi.fn()} onMarkDone={vi.fn()} onPushTask={vi.fn()} onClose={vi.fn()} />)

    expect(screen.getByText('555-0142').closest('a')).toHaveAttribute('href', 'tel:555-0142')
    const maps = screen.getByText('123 Main St').closest('a')
    expect(maps).toHaveAttribute('href', expect.stringContaining('query_place_id=place_abc'))
    expect(screen.getByText('Join meeting').closest('a')).toHaveAttribute('href', 'https://meet.example.com/xyz')
    expect(screen.getByText('Intake form').closest('a')).toHaveAttribute('href', 'https://forms.example.com')
    expect(screen.getByText('Bring insurance card')).toBeInTheDocument()
  })

  it('context: renders nothing extra when the item has no context', () => {
    render(<WallV2ItemActionSheet event={event} onSkip={vi.fn()} onMarkDone={vi.fn()} onPushTask={vi.fn()} onClose={vi.fn()} />)
    expect(screen.queryByText('Tap to call')).toBeNull()
    expect(screen.queryByText('Directions')).toBeNull()
    expect(screen.queryByText('Join meeting')).toBeNull()
  })

  it('routine and event variants are unchanged (onPushTask never fires)', () => {
    const onPushTask = vi.fn()
    render(
      <WallV2ItemActionSheet
        event={routine}
        onSkip={vi.fn()}
        onMarkDone={vi.fn()}
        onPushTask={onPushTask}
        onClose={vi.fn()}
      />
    )
    fireEvent.click(screen.getByText('Mark done'))
    expect(onPushTask).not.toHaveBeenCalled()
    expect(screen.queryByText('This week')).toBeNull()
  })
})
