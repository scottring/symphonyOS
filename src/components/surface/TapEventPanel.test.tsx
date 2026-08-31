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

  it('renders a Photos & files section keyed to the event', () => {
    render(<TapEventPanel
      event={mockEvent} notes={undefined} allTasks={[]} {...baseHandlers}
    />)
    expect(screen.getByText('Photos & files')).toBeInTheDocument()
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

  it('shows the current duration and changes it via the preset menu', async () => {
    const onReschedule = vi.fn()
    const { user } = render(<TapEventPanel
      event={mockEvent} notes={undefined} allTasks={[]} {...baseHandlers} onReschedule={onReschedule}
    />)
    // 09:00–09:30Z = 30 min
    const durationButton = screen.getByRole('button', { name: /change duration/i })
    expect(durationButton).toHaveTextContent('30 min')

    await user.click(durationButton)
    await user.click(screen.getByRole('button', { name: '45 min' }))

    expect(onReschedule).toHaveBeenCalledTimes(1)
    const [start, end] = onReschedule.mock.calls[0]
    expect(start.toISOString()).toBe(new Date(mockEvent.start_time).toISOString())
    expect(end.getTime() - start.getTime()).toBe(45 * 60 * 1000)
  })

  it('hides the duration control when onReschedule is not provided', () => {
    render(<TapEventPanel event={mockEvent} notes={undefined} allTasks={[]} {...baseHandlers} />)
    expect(screen.queryByRole('button', { name: /change duration/i })).not.toBeInTheDocument()
  })

  it('adds a prep task on Enter and clears the input', async () => {
    const { user } = render(<TapEventPanel
      event={mockEvent} notes={undefined} allTasks={[]} {...baseHandlers}
    />)
    const input = screen.getByPlaceholderText(/add a prep task/i)
    await user.type(input, 'Print the financial plan{Enter}')
    expect(baseHandlers.onAddPrepTask).toHaveBeenCalledWith('Print the financial plan')
    expect(input).toHaveValue('')
  })

  it('renders saved links and passes new URLs to onAddLink', async () => {
    const { user } = render(<TapEventPanel
      event={mockEvent} notes={undefined} allTasks={[]} {...baseHandlers}
      links={[{ url: 'https://example.com/agenda', title: 'Agenda' }]}
    />)
    expect(screen.getByText('Agenda')).toBeInTheDocument()
    await user.type(screen.getByPlaceholderText(/paste a url/i), 'https://example.com/doc{Enter}')
    expect(baseHandlers.onAddLink).toHaveBeenCalledWith('https://example.com/doc')
  })

  describe('discussion flag', () => {
    it('hides the Discuss chip when onToggleDiscussion is not provided', () => {
      render(<TapEventPanel event={mockEvent} notes={undefined} allTasks={[]} {...baseHandlers} />)
      expect(screen.queryByRole('button', { name: /discuss/i })).not.toBeInTheDocument()
    })

    it('flags an unflagged event via the Discuss chip', async () => {
      const onToggleDiscussion = vi.fn()
      const { user } = render(<TapEventPanel
        event={mockEvent} notes={undefined} allTasks={[]} {...baseHandlers}
        discussion={{ flagged: false }}
        onToggleDiscussion={onToggleDiscussion}
      />)
      await user.click(screen.getByRole('button', { name: /discuss/i }))
      expect(onToggleDiscussion).toHaveBeenCalledWith(true)
    })

    it('flagged event: shows the To discuss state, note field, and saves the note on blur', async () => {
      const onToggleDiscussion = vi.fn()
      const onDiscussionNoteChange = vi.fn()
      const { user } = render(<TapEventPanel
        event={mockEvent} notes={undefined} allTasks={[]} {...baseHandlers}
        discussion={{ flagged: true, note: '' }}
        onToggleDiscussion={onToggleDiscussion}
        onDiscussionNoteChange={onDiscussionNoteChange}
      />)
      const chip = screen.getByRole('button', { name: /to discuss/i })
      expect(chip).toHaveAttribute('aria-pressed', 'true')

      const noteField = screen.getByPlaceholderText(/what's the question/i)
      await user.type(noteField, 'Do we move the retirement money?')
      await user.tab()
      expect(onDiscussionNoteChange).toHaveBeenCalledWith('Do we move the retirement money?')

      await user.click(chip)
      expect(onToggleDiscussion).toHaveBeenCalledWith(false)
    })
  })

  describe('mark done', () => {
    it('hides the Complete pill when onToggleComplete is not provided', () => {
      render(<TapEventPanel event={mockEvent} notes={undefined} allTasks={[]} {...baseHandlers} />)
      expect(screen.queryByRole('button', { name: /complete/i })).not.toBeInTheDocument()
    })

    it('open event: shows Complete and fires onToggleComplete on click', async () => {
      const onToggleComplete = vi.fn()
      const { user } = render(<TapEventPanel
        event={mockEvent} notes={undefined} allTasks={[]} {...baseHandlers}
        completed={false}
        onToggleComplete={onToggleComplete}
      />)
      await user.click(screen.getByRole('button', { name: 'Complete' }))
      expect(onToggleComplete).toHaveBeenCalledTimes(1)
    })

    it('completed event: shows the Completed state; click fires onToggleComplete to reopen', async () => {
      const onToggleComplete = vi.fn()
      const { user } = render(<TapEventPanel
        event={mockEvent} notes={undefined} allTasks={[]} {...baseHandlers}
        completed={true}
        onToggleComplete={onToggleComplete}
      />)
      const pill = screen.getByRole('button', { name: /completed/i })
      await user.click(pill)
      expect(onToggleComplete).toHaveBeenCalledTimes(1)
    })

    it('shows Complete even on a view-only calendar (completion is Symphony-side)', () => {
      render(<TapEventPanel
        event={mockEvent} notes={undefined} allTasks={[]} {...baseHandlers}
        completed={false}
        onToggleComplete={vi.fn()}
        calendarAccess={{ name: 'Work Schedule', readOnly: true }}
      />)
      expect(screen.getByRole('button', { name: 'Complete' })).toBeInTheDocument()
    })
  })

  describe('calendar access', () => {
    it('view-only calendar: badge shown, reschedule/duration hidden', () => {
      render(<TapEventPanel
        event={mockEvent} notes={undefined} allTasks={[]} {...baseHandlers}
        onReschedule={vi.fn()}
        calendarAccess={{ name: 'Work Schedule', readOnly: true }}
      />)
      expect(screen.getByText('Work Schedule')).toBeInTheDocument()
      expect(screen.getByText('view-only')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /reschedule/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /change duration/i })).not.toBeInTheDocument()
    })

    it('writable calendar: shows Move to picker and fires onMoveToCalendar', async () => {
      const onMoveToCalendar = vi.fn()
      const { user } = render(<TapEventPanel
        event={mockEvent} notes={undefined} allTasks={[]} {...baseHandlers}
        onReschedule={vi.fn()}
        calendarAccess={{ name: 'Family calendar', readOnly: false }}
        writableCalendars={[
          { id: 'fam@group.calendar.google.com', summary: 'Family calendar' },
          { id: 'meals@group.calendar.google.com', summary: 'Meal planning' },
        ]}
        onMoveToCalendar={onMoveToCalendar}
      />)
      expect(screen.getByRole('button', { name: /reschedule/i })).toBeInTheDocument()
      await user.selectOptions(screen.getByLabelText('Move to calendar'), 'meals@group.calendar.google.com')
      expect(onMoveToCalendar).toHaveBeenCalledWith('meals@group.calendar.google.com')
    })
  })

  describe('renaming', () => {
    it('commits a title edit through onRenameEvent on Enter', async () => {
      const onRenameEvent = vi.fn()
      const { user } = render(<TapEventPanel
        event={mockEvent} notes={undefined} allTasks={[]} {...baseHandlers}
        onRenameEvent={onRenameEvent}
        calendarAccess={{ name: 'Family', readOnly: false }}
      />)
      await user.click(screen.getByText('Annual physical'))
      const input = screen.getByDisplayValue('Annual physical')
      await user.clear(input)
      await user.type(input, 'PT appointment{Enter}')
      expect(onRenameEvent).toHaveBeenCalledWith('PT appointment')
    })

    it('does not rename on a read-only calendar — the edit reverts', async () => {
      const onRenameEvent = vi.fn()
      const { user } = render(<TapEventPanel
        event={mockEvent} notes={undefined} allTasks={[]} {...baseHandlers}
        onRenameEvent={onRenameEvent}
        calendarAccess={{ name: 'Work', readOnly: true }}
      />)
      await user.click(screen.getByText('Annual physical'))
      const input = screen.getByDisplayValue('Annual physical')
      await user.clear(input)
      await user.type(input, 'Nope{Enter}')
      expect(onRenameEvent).not.toHaveBeenCalled()
      expect(screen.getByText('Annual physical')).toBeInTheDocument()
    })
  })
})
