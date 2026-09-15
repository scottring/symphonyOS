import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { ScheduleActionsProvider, type ScheduleActionsValue } from '@/contexts/ScheduleActionsContext'
import { ScheduleItem } from './ScheduleItem'
import { useMobile } from '@/hooks/useMobile'
import type { TimelineItem } from '@/types/timeline'

vi.mock('@/hooks/useMobile', () => ({ useMobile: vi.fn() }))

const getHomeLocation = vi.fn()
const getTravelEstimate = vi.fn()

vi.mock('@/lib/homeLocation', () => ({ getHomeLocation: () => getHomeLocation() }))
vi.mock('@/lib/travelTime', async () => {
  const actual = await vi.importActual<typeof import('@/lib/travelTime')>('@/lib/travelTime')
  return { ...actual, getTravelEstimate: (...args: unknown[]) => getTravelEstimate(...args) }
})

const GYM = '1400 Coppermine Terr, Baltimore MD 21209'

const baseEvent: TimelineItem = {
  id: 'event-1',
  type: 'event',
  title: 'Boxing',
  startTime: new Date('2026-09-15T09:00:00'),
  endTime: new Date('2026-09-15T10:15:00'),
  allDay: false,
  completed: false,
  skipped: false,
  context: 'family',
  location: GYM,
  locationPlaceId: null,
  assignedTo: null,
  attendees: [],
} as unknown as TimelineItem

function renderRow(overrides: Partial<TimelineItem> = {}) {
  const value = {
    onToggleTask: vi.fn(),
    projects: [], contacts: [], familyMembers: [], lists: [],
    projectsMap: new Map(),
    onOpenProject: vi.fn(),
  } as unknown as ScheduleActionsValue
  return render(
    <ScheduleActionsProvider value={value}>
      <ScheduleItem
        item={{ ...baseEvent, ...overrides }}
        onSelect={vi.fn()}
        onToggleComplete={vi.fn()}
      />
    </ScheduleActionsProvider>,
  )
}

describe('ScheduleItem — travel time', () => {
  beforeEach(() => {
    vi.mocked(useMobile).mockReturnValue(false)
    getHomeLocation.mockReset()
    getTravelEstimate.mockReset()
    getHomeLocation.mockResolvedValue({ address: '100 Home St, Baltimore MD' })
    getTravelEstimate.mockResolvedValue({ durationSeconds: 1080, distanceMeters: 7400 })
  })

  it('shows the drive time for a row with an address', async () => {
    renderRow()
    expect(await screen.findByText('18 min drive')).toBeInTheDocument()
  })

  it('shows nothing for a video meeting', async () => {
    renderRow({ location: 'https://zoom.us/j/123' })
    await waitFor(() => expect(getTravelEstimate).not.toHaveBeenCalled())
    expect(screen.queryByText(/drive/)).not.toBeInTheDocument()
  })

  it('shows nothing when no home address is set', async () => {
    getHomeLocation.mockResolvedValue(null)
    renderRow()
    await waitFor(() => expect(getHomeLocation).toHaveBeenCalled())
    expect(screen.queryByText(/drive/)).not.toBeInTheDocument()
  })

  it('does not estimate travel for work already done', async () => {
    renderRow({ completed: true })
    await waitFor(() => expect(getHomeLocation).not.toHaveBeenCalled())
    expect(screen.queryByText(/drive/)).not.toBeInTheDocument()
  })

  it('renders the estimate on the phone too', async () => {
    vi.mocked(useMobile).mockReturnValue(true)
    renderRow()
    expect(await screen.findByText('18 min')).toBeInTheDocument()
  })
})
