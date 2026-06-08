import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { TapEventPanel } from './TapEventPanel'
import { createMockTask } from '@/test/mocks/factories'

// TapEventPanel now always renders PanelLocation, which calls useDirections
// (and can render the directions builder). Mock it so neither touches the
// Google Maps SDK in jsdom.
const searchPlaces = vi.fn().mockResolvedValue([
  { placeId: 'p1', description: '1 Main St, Townsville', mainText: '1 Main St', secondaryText: 'Townsville' },
])
const getPlaceDetails = vi.fn().mockResolvedValue({ address: '1 Main St, Townsville', name: '1 Main St' })

vi.mock('@/hooks/useDirections', () => ({
  useDirections: () => ({
    isCalculating: false,
    error: null,
    result: null,
    calculateRoute: vi.fn(),
    searchPlaces,
    getPlaceDetails,
    openInMaps: vi.fn(),
  }),
  formatDuration: (s: number) => `${s}s`,
  formatDistance: (m: number) => `${m}m`,
}))

const baseHandlers = {
  onClose: vi.fn(),
  onNotesChange: vi.fn(),
  onAddPrepTask: vi.fn(),
  onAddLink: vi.fn(),
  onOpenTask: vi.fn(),
  onOpenProject: vi.fn(),
  onOpenRelated: vi.fn(),
}

const mockEvent = {
  id: 'e1',
  title: 'Annual physical',
  start_time: '2026-05-14T09:00:00Z',
  end_time: '2026-05-14T09:30:00Z',
  location: 'Park Ave Pediatrics',
} as any

describe('TapEventPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders event title in header', () => {
    render(<TapEventPanel
      event={mockEvent} notes={undefined} allTasks={[]} {...baseHandlers}
    />)
    expect(screen.getByText('Annual physical')).toBeInTheDocument()
  })

  it('renders prep tasks linked to the event', () => {
    const prep = createMockTask({ id: 't1', linkedEventId: 'e1', title: 'Bring vaccine card' })
    render(<TapEventPanel
      event={mockEvent} notes={undefined} allTasks={[prep]} {...baseHandlers}
    />)
    expect(screen.getByText('Bring vaccine card')).toBeInTheDocument()
  })

  it('uses "What to bring" label for notes', () => {
    render(<TapEventPanel
      event={mockEvent} notes="Insurance card" allTasks={[]} {...baseHandlers}
    />)
    expect(screen.getByText(/what to bring/i)).toBeInTheDocument()
  })

  it('shows the add-location input and no Directions toggle when the event has no location', () => {
    const noLocation = { ...mockEvent, location: undefined }
    render(<TapEventPanel
      event={noLocation} notes={undefined} allTasks={[]} {...baseHandlers} onUpdateEventLocation={vi.fn()}
    />)
    expect(screen.getByPlaceholderText(/add a location/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /directions/i })).not.toBeInTheDocument()
  })

  it('shows the location and a Directions toggle when the event has a location', () => {
    render(<TapEventPanel
      event={mockEvent} notes={undefined} allTasks={[]} {...baseHandlers} onUpdateEventLocation={vi.fn()}
    />)
    expect(screen.getByText('Park Ave Pediatrics')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /directions/i })).toBeInTheDocument()
  })

  it('calls onUpdateEventLocation with the google event id, address, and calendar id on select', async () => {
    const onUpdateEventLocation = vi.fn()
    const event = { ...mockEvent, location: undefined, google_event_id: 'gcal-1', calendar_id: 'cal-1' }
    const { user } = render(<TapEventPanel
      event={event} notes={undefined} allTasks={[]} {...baseHandlers} onUpdateEventLocation={onUpdateEventLocation}
    />)
    await user.type(screen.getByPlaceholderText(/add a location/i), 'Main St')
    const result = await screen.findByText('1 Main St')
    await user.click(result)
    expect(onUpdateEventLocation).toHaveBeenCalledWith('gcal-1', '1 Main St, Townsville', 'cal-1')
  })

  it('renders a Reschedule trigger when onReschedule is provided', () => {
    render(<TapEventPanel
      event={mockEvent} notes={undefined} allTasks={[]} {...baseHandlers} onReschedule={vi.fn()}
    />)
    expect(screen.getByRole('button', { name: /reschedule/i })).toBeInTheDocument()
  })

  it('reschedules the event preserving its duration via the popover', async () => {
    const onReschedule = vi.fn()
    const { user } = render(<TapEventPanel
      event={mockEvent} notes={undefined} allTasks={[]} {...baseHandlers} onReschedule={onReschedule}
    />)
    await user.click(screen.getByRole('button', { name: /reschedule/i }))
    await user.click(screen.getByText('Today'))
    await user.click(screen.getByRole('button', { name: '9am' }))
    expect(onReschedule).toHaveBeenCalledTimes(1)
    const [start, end] = onReschedule.mock.calls[0]
    expect(start).toBeInstanceOf(Date)
    // mockEvent is 09:00–09:30Z (30 min); reschedule must keep that duration
    expect(end.getTime() - start.getTime()).toBe(30 * 60 * 1000)
  })
})
