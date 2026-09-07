// src/components/wall-v2/WallV2Gantt.test.tsx
//
// The board's Face + name column doubles as a tap target that opens
// KidDayView (Task 6) — but only for a real person. The household row is
// "Everyone", not a person, and stays inert; and the new header button must
// not swallow the existing bar-tap handler.

import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { WallV2Gantt } from './WallV2Gantt'
import { HOUSEHOLD_ID } from './wallEventAttribution'
import type { GanttBoard, GanttTrack, GanttBlock } from './wallGantt'

const axis = (): GanttBoard['axis'] => ({
  startMin: 8 * 60,
  endMin: 16 * 60,
  ticks: [],
  nowPct: 50,
})

const block = (over: Partial<GanttBlock> = {}): GanttBlock => ({
  id: 'task-1',
  title: 'Reading',
  leftPct: 10,
  widthPct: 20,
  labelSide: 'in',
  labelRoomPct: 0,
  past: false,
  type: 'task',
  ...over,
})

const track = (over: Partial<GanttTrack> = {}): GanttTrack => ({
  memberId: 'kid-1',
  name: 'Ella',
  blocks: [block()],
  homework: [],
  zone: [],
  laterCount: 0,
  ...over,
})

const board = (tracks: GanttTrack[], zoneW = 0): GanttBoard => ({ axis: axis(), tracks, zoneW })

describe('WallV2Gantt portrait tap', () => {
  it('calls onTapMember with the member id when a person track face/name is tapped', async () => {
    const onTapMember = vi.fn()
    const b = board([
      track(),
      track({ memberId: HOUSEHOLD_ID, name: 'Everyone', blocks: [] }),
    ])
    const { user } = render(<WallV2Gantt board={b} onTapMember={onTapMember} />)
    await user.click(screen.getByRole('button', { name: "Open Ella's day" }))
    expect(onTapMember).toHaveBeenCalledWith('kid-1')
  })

  it('does not make the household track face/name interactive', () => {
    const onTapMember = vi.fn()
    const b = board([
      track(),
      track({ memberId: HOUSEHOLD_ID, name: 'Everyone', blocks: [] }),
    ])
    render(<WallV2Gantt board={b} onTapMember={onTapMember} />)
    expect(screen.queryByRole('button', { name: /Open Everyone's day/i })).not.toBeInTheDocument()
  })

  it('still calls onTapItem when a bar is tapped, unaffected by the new header button', async () => {
    const onTapItem = vi.fn()
    const onTapMember = vi.fn()
    const b = board([track()])
    const { user } = render(<WallV2Gantt board={b} onTapItem={onTapItem} onTapMember={onTapMember} />)
    await user.click(screen.getByText('Reading'))
    expect(onTapItem).toHaveBeenCalledWith('task-1')
    expect(onTapMember).not.toHaveBeenCalled()
  })

  it('does not render a face/name button at all when onTapMember is not provided', () => {
    const b = board([track()])
    render(<WallV2Gantt board={b} />)
    expect(screen.queryByRole('button', { name: /Open .*'s day/i })).not.toBeInTheDocument()
  })
})

describe('WallV2Gantt free events', () => {
  it('dims a free bar and shows a Free label', () => {
    const b = board([track({ blocks: [block({ title: 'FFG', free: true })] })])
    render(<WallV2Gantt board={b} />)
    const bar = screen.getByRole('button', { name: /FFG/i })
    expect(bar.className).toContain('opacity-40')
    expect(screen.getByText('Free')).toBeInTheDocument()
  })

  it('does not dim or label a non-free bar', () => {
    const b = board([track({ blocks: [block({ title: 'Reading', free: false })] })])
    render(<WallV2Gantt board={b} />)
    const bar = screen.getByRole('button', { name: 'Reading' })
    expect(bar.className).not.toContain('opacity-40')
    expect(screen.queryByText('Free')).not.toBeInTheDocument()
  })
})

describe('the zone column', () => {
  it('lists a row\'s specials and rare routines as lines, capped, with "and N more"', () => {
    const t = track({
      blocks: [],
      zone: [
        { id: 'z1', title: 'Visual Art', kind: 'special' },
        { id: 'z2', title: 'Laundry', kind: 'routine' },
        { id: 'z3', title: 'Picture Day', kind: 'special' },
        { id: 'z4', title: 'Bins out', kind: 'routine' },
      ],
    })
    render(<WallV2Gantt board={board([t], 236)} />)
    expect(screen.getByText('Visual Art')).toBeInTheDocument()
    expect(screen.getByText('Laundry')).toBeInTheDocument()
    expect(screen.getByText('Picture Day')).toBeInTheDocument()
    expect(screen.queryByText('Bins out')).toBeNull()
    expect(screen.getByText('and 1 more')).toBeInTheDocument()
    expect(screen.queryByText('Nothing scheduled')).toBeNull()
  })

  it('homework leads the zone and the whole zone opens the person\'s page', async () => {
    const onTapMember = vi.fn()
    const t = track({ blocks: [], homework: [{ id: 'h', label: 'Blue sheet · Fri', late: false }], zone: [{ id: 'z', title: 'PE', kind: 'special' }] })
    const { user } = render(<WallV2Gantt board={board([t], 236)} onTapMember={onTapMember} />)
    const zone = screen.getByRole('button', { name: "Ella's day, today" })
    await user.click(zone)
    expect(onTapMember).toHaveBeenCalledWith('kid-1')
    expect(zone.textContent).toMatch(/Blue sheet · Fri.*PE/)
  })

  it('the household zone is words, not a button', () => {
    const t = track({ memberId: HOUSEHOLD_ID, name: 'Everyone', blocks: [], zone: [{ id: 'z', title: 'Labor Day', kind: 'special' }] })
    render(<WallV2Gantt board={board([t], 236)} onTapMember={vi.fn()} />)
    expect(screen.getByText('Labor Day')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Everyone's day/ })).toBeNull()
  })

  it('draws no zone column at all when the board reserved none', () => {
    render(<WallV2Gantt board={board([track()], 0)} />)
    expect(screen.queryByTestId('zone')).toBeNull()
  })

  it('a bare row with no bars and no zone says so once', () => {
    render(<WallV2Gantt board={board([track({ blocks: [] })], 0)} />)
    expect(screen.getByText('Nothing scheduled')).toBeInTheDocument()
  })
})
