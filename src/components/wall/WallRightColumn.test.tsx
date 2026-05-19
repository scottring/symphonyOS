import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WallRightColumn } from './WallRightColumn'

const base = {
  todayItems: [],
  discussItems: [],
  upcomingDays: [],
  members: [],
  selectedOwnerId: null,
  onSelectOwner: () => {},
  onCheckItem: () => {},
  onTapEvent: () => {},
  onResolveDiscussion: () => {},
}

describe('WallRightColumn hideDaily toggle', () => {
  it('renders the toggle and calls onToggleHideDaily when tapped', () => {
    const onToggleHideDaily = vi.fn()
    render(<WallRightColumn {...base} hideDaily={false} onToggleHideDaily={onToggleHideDaily} />)
    fireEvent.click(screen.getByRole('button', { name: /hide daily routines/i }))
    expect(onToggleHideDaily).toHaveBeenCalledTimes(1)
  })

  it('labels the control "Show daily routines" when already hiding', () => {
    render(<WallRightColumn {...base} hideDaily={true} onToggleHideDaily={() => {}} />)
    expect(screen.getByRole('button', { name: /show daily routines/i })).toBeInTheDocument()
  })

  it('renders no toggle when onToggleHideDaily is omitted', () => {
    render(<WallRightColumn {...base} />)
    expect(screen.queryByRole('button', { name: /daily routines/i })).not.toBeInTheDocument()
  })
})
