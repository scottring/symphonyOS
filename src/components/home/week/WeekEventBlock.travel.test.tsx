import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import type { ReactNode } from 'react'
import { render } from '@/test/test-utils'
import { WeekEventBlock } from './WeekEventBlock'
import type { TimelineItem } from '@/types/timeline'
import type { PlacedItem } from './layoutLanes'

const getHomeLocation = vi.fn()
const getTravelEstimate = vi.fn()

vi.mock('@/lib/homeLocation', () => ({ getHomeLocation: () => getHomeLocation() }))
vi.mock('@/lib/travelTime', async () => {
  const actual = await vi.importActual<typeof import('@/lib/travelTime')>('@/lib/travelTime')
  return { ...actual, getTravelEstimate: (...args: unknown[]) => getTravelEstimate(...args) }
})

const GYM = '1400 Coppermine Terr, Baltimore MD 21209'
const weekStart = new Date(2026, 4, 17) // Sun May 17

function mkPlaced(overrides: Partial<TimelineItem> = {}): PlacedItem {
  return {
    item: {
      id: 't1',
      type: 'task',
      title: 'Therapy appt',
      completed: false,
      // An hour long — tall enough to spare a line for the estimate.
      startTime: new Date(2026, 4, 20, 13, 0),
      endTime: new Date(2026, 4, 20, 14, 0),
      allDay: false,
      location: GYM,
      ...overrides,
    } as TimelineItem,
    dayIdx: 3,
    laneIdx: 0,
    laneCount: 1,
  }
}

const renderBlock = (placedItem: PlacedItem) =>
  render(
    <DndContext>
      <WeekEventBlock placedItem={placedItem} weekStart={weekStart} onSelect={vi.fn()} />
    </DndContext> as ReactNode as React.ReactElement,
  )

describe('WeekEventBlock — travel time', () => {
  beforeEach(() => {
    getHomeLocation.mockReset()
    getTravelEstimate.mockReset()
    getHomeLocation.mockResolvedValue({ address: '100 Home St, Baltimore MD' })
    getTravelEstimate.mockResolvedValue({ durationSeconds: 1080, distanceMeters: 7400 })
  })

  it('shows the estimate on a block with an address', async () => {
    renderBlock(mkPlaced())
    expect(await screen.findByText('18 min')).toBeInTheDocument()
  })

  it('leaves a short block to its title', async () => {
    // 15 minutes — the block is already clamped to one line.
    renderBlock(
      mkPlaced({
        startTime: new Date(2026, 4, 20, 13, 0),
        endTime: new Date(2026, 4, 20, 13, 15),
      }),
    )
    await waitFor(() => expect(getTravelEstimate).toHaveBeenCalled())
    expect(screen.queryByText('18 min')).not.toBeInTheDocument()
  })

  it('does not displace an existing subtitle', async () => {
    renderBlock(mkPlaced({ subtitle: 'Specials: Art' }))
    await waitFor(() => expect(getTravelEstimate).toHaveBeenCalled())
    expect(screen.getByText('Specials: Art')).toBeInTheDocument()
    expect(screen.queryByText('18 min')).not.toBeInTheDocument()
  })

  it('shows nothing for a block without an address', async () => {
    renderBlock(mkPlaced({ location: undefined }))
    await waitFor(() => expect(getTravelEstimate).not.toHaveBeenCalled())
    expect(screen.queryByText('18 min')).not.toBeInTheDocument()
  })
})
