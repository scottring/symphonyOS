import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@/test/test-utils'
import { QuickCapture } from './QuickCapture'
import type { DesktopScreenshot } from '@/lib/desktop'

// Scott, 2026-10-30: ⌘K takes screenshots — capture options as one row of tiles.
const m = vi.hoisted(() => ({
  captureFromFile: vi.fn(async () => true),
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
