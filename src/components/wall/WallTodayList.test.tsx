import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WallTodayList } from './WallTodayList'
import type { TodayItem } from './today/todayItem'
import { createMockFamilyMember } from '@/test/mocks/factories'

const members = [createMockFamilyMember({ id: 'm1', name: 'Scott' })]

const items: TodayItem[] = [
  { id: 'a', kind: 'task', title: 'Run', completed: false, ownerId: 'm1', startTime: null, sourceId: 'a' },
  { id: 'b', kind: 'chore', title: 'Trash', completed: false, ownerId: null, startTime: null, sourceId: 'b' },
  { id: 'c', kind: 'event', title: 'Soccer', completed: false, ownerId: 'm1', startTime: new Date('2026-05-17T19:00:00'), sourceId: 'c' },
]

describe('WallTodayList', () => {
  it('renders all items', () => {
    render(<WallTodayList items={items} members={members} onCheckItem={() => {}} onTapEvent={() => {}} />)
    expect(screen.getByText('Run')).toBeInTheDocument()
    expect(screen.getByText('Trash')).toBeInTheDocument()
    expect(screen.getByText('Soccer')).toBeInTheDocument()
  })

  it('renders empty state when no items', () => {
    render(<WallTodayList items={[]} members={members} onCheckItem={() => {}} onTapEvent={() => {}} />)
    expect(screen.getByText(/nothing for today/i)).toBeInTheDocument()
  })

  it('calls onCheckItem when checkbox tapped on a task', () => {
    const onCheckItem = vi.fn()
    render(<WallTodayList items={items} members={members} onCheckItem={onCheckItem} onTapEvent={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /check run/i }))
    expect(onCheckItem).toHaveBeenCalledWith('a', true)
  })

  it('calls onTapEvent when an event row is tapped', () => {
    const onTapEvent = vi.fn()
    render(<WallTodayList items={items} members={members} onCheckItem={() => {}} onTapEvent={onTapEvent} />)
    fireEvent.click(screen.getByText('Soccer'))
    expect(onTapEvent).toHaveBeenCalledWith('c')
  })

  it('renders event icon (clock) for event rows, not checkbox', () => {
    render(<WallTodayList items={items} members={members} onCheckItem={() => {}} onTapEvent={() => {}} />)
    expect(screen.queryByRole('button', { name: /check soccer/i })).not.toBeInTheDocument()
  })

  it('applies line-through to completed items', () => {
    const done: TodayItem[] = [{ ...items[0], completed: true }]
    render(<WallTodayList items={done} members={members} onCheckItem={() => {}} onTapEvent={() => {}} />)
    const title = screen.getByText('Run')
    expect(title.className).toMatch(/line-through/)
  })
})
