import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@/test/test-utils'
import { QuickCapture } from './QuickCapture'
import type { DesktopScreenshot } from '@/lib/desktop'

// Scott, 2026-10-30: ⌘K takes screenshots — capture options as one row of tiles.
const m = vi.hoisted(() => ({
  captureFromFile: vi.fn(async (..._a: unknown[]): Promise<unknown> => ({ taskId: 't1', storagePath: 'u/capture/t1.jpg', events: [], links: [] })),
  requestDesktopScreenshot: vi.fn(async (): Promise<DesktopScreenshot> => ({ status: 'unsupported' })),
}))
vi.mock('@/hooks/usePhotoCapture', () => ({
  usePhotoCapture: () => ({ status: 'idle', error: null, captureFromFile: m.captureFromFile, reset: vi.fn() }),
}))
vi.mock('@/lib/desktop', () => ({
  isDesktopShell: () => true,
  requestDesktopScreenshot: m.requestDesktopScreenshot,
}))

const shot = () => new File(['jpg'], 'screenshot.jpg', { type: 'image/jpeg' })

beforeEach(() => {
  m.captureFromFile.mockClear()
  m.captureFromFile.mockResolvedValue({ taskId: 't1', storagePath: 'u/capture/t1.jpg', events: [], links: [] })
  m.requestDesktopScreenshot.mockReset()
  URL.createObjectURL = vi.fn(() => 'blob:preview')
  URL.revokeObjectURL = vi.fn()
})

describe('⌘K capture tiles', () => {
  it('offers Photo, Screenshot, Plan from paper and School paper as one row', () => {
    render(<QuickCapture onAdd={vi.fn()} isOpen showFab={false} onPlanFromPaper={vi.fn()} onSchoolPaper={vi.fn()} />)
    for (const name of ['Photo', 'Screenshot', 'Plan from paper', 'School paper']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
  })

  it('the Mac app’s screenshot goes through the same reading step as a photo', async () => {
    const file = shot()
    m.requestDesktopScreenshot.mockResolvedValue({ status: 'ok', file })
    const { user } = render(<QuickCapture onAdd={vi.fn()} isOpen showFab={false} />)
    await user.click(screen.getByRole('button', { name: 'Screenshot' }))
    await waitFor(() => expect(m.captureFromFile).toHaveBeenCalledWith(file, null, 'screenshot'))
  })

  it('pressing Esc in the crosshair sends nothing', async () => {
    m.requestDesktopScreenshot.mockResolvedValue({ status: 'cancelled' })
    const { user } = render(<QuickCapture onAdd={vi.fn()} isOpen showFab={false} />)
    await user.click(screen.getByRole('button', { name: 'Screenshot' }))
    await waitFor(() => expect(m.requestDesktopScreenshot).toHaveBeenCalled())
    expect(m.captureFromFile).not.toHaveBeenCalled()
    expect(screen.getByText('or paste or drop an image')).toBeInTheDocument()
  })

  it('without native capture, the tile says how to paste one', async () => {
    m.requestDesktopScreenshot.mockResolvedValue({ status: 'unsupported' })
    const { user } = render(<QuickCapture onAdd={vi.fn()} isOpen showFab={false} />)
    await user.click(screen.getByRole('button', { name: 'Screenshot' }))
    expect(await screen.findByText(/then press/)).toBeInTheDocument()
    expect(m.captureFromFile).not.toHaveBeenCalled()
  })

  it('a pasted image is captured', () => {
    render(<QuickCapture onAdd={vi.fn()} isOpen showFab={false} />)
    const file = shot()
    fireEvent.paste(screen.getByPlaceholderText('Try "call the vet tomorrow 2pm"'), {
      clipboardData: { types: ['Files'], files: [file] },
    })
    expect(m.captureFromFile).toHaveBeenCalledWith(file, null, 'image')
  })

  it('a paste that also carries text stays a text paste', () => {
    render(<QuickCapture onAdd={vi.fn()} isOpen showFab={false} />)
    fireEvent.paste(screen.getByPlaceholderText('Try "call the vet tomorrow 2pm"'), {
      clipboardData: { types: ['text/plain', 'Files'], files: [shot()], getData: () => 'B12' },
    })
    expect(m.captureFromFile).not.toHaveBeenCalled()
  })

  it('a dropped image is captured', () => {
    render(<QuickCapture onAdd={vi.fn()} isOpen showFab={false} />)
    const file = shot()
    fireEvent.drop(screen.getByTestId('quick-capture-sheet'), { dataTransfer: { types: ['Files'], files: [file] } })
    expect(m.captureFromFile).toHaveBeenCalledWith(file, null, 'image')
  })
})

// Scott, 2026-10-30: a Southwest itinerary should become events, not a task.
describe('⌘K event card', () => {
  const flights = [
    { title: 'Flight BWI → BOS (WN 2742)', start: new Date(2026, 11, 4, 17, 10).toISOString(), end: new Date(2026, 11, 4, 18, 45).toISOString(), allDay: false, location: 'BWI', who: ['Iris Leviner'], details: 'Confirmation 2ILYQY' },
    { title: 'Flight BOS → BWI (WN 1717)', start: new Date(2026, 11, 7, 11, 20).toISOString(), end: new Date(2026, 11, 7, 12, 55).toISOString(), allDay: false, location: 'BOS', who: ['Iris Leviner'], details: 'Confirmation 2ILYQY' },
  ]
  const members = [{ id: 'scott', name: 'Scott' }, { id: 'iris', name: 'Iris' }]
  const capture = { taskId: 't1', storagePath: 'u/capture/t1.jpg', events: flights, links: [] }

  async function screenshotFlights(onAddCaptureEvents = vi.fn(async () => true), onClose = vi.fn()) {
    m.requestDesktopScreenshot.mockResolvedValue({ status: 'ok', file: shot() })
    m.captureFromFile.mockResolvedValue(capture)
    const r = render(<QuickCapture onAdd={vi.fn()} isOpen showFab={false} familyMembers={members} onAddCaptureEvents={onAddCaptureEvents} onClose={onClose} />)
    await r.user.click(screen.getByRole('button', { name: 'Screenshot' }))
    await screen.findByText('From this screenshot — 2 events')
    return { ...r, onAddCaptureEvents, onClose }
  }

  it('offers each flight with its time and who, filed under Family because Iris is named', async () => {
    await screenshotFlights()
    expect(screen.getByText('Flight BWI → BOS (WN 2742)')).toBeInTheDocument()
    expect(screen.getByText(/Fri, Dec 4 · 5:10\sPM – 6:45\sPM · Iris/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Family/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Add 2 events' })).toBeEnabled()
  })

  it('adds only the ticked events, with Iris assigned, then closes', async () => {
    const { user, onAddCaptureEvents, onClose } = await screenshotFlights()
    await user.click(screen.getAllByRole('checkbox')[1])
    await user.click(screen.getByRole('button', { name: 'Add 1 event' }))
    expect(onAddCaptureEvents).toHaveBeenCalledWith(capture, [expect.objectContaining({ title: 'Flight BWI → BOS (WN 2742)', assignedMemberIds: ['iris'] })], 'family')
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('a failed add keeps the card open', async () => {
    const { user, onClose } = await screenshotFlights(vi.fn(async () => false))
    await user.click(screen.getByRole('button', { name: 'Add 2 events' }))
    expect(screen.getByText('From this screenshot — 2 events')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('"Just put it in my Inbox" adds nothing and closes', async () => {
    const { user, onAddCaptureEvents, onClose } = await screenshotFlights()
    await user.click(screen.getByRole('button', { name: 'Just put it in my Inbox' }))
    expect(onAddCaptureEvents).not.toHaveBeenCalled()
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })
})
