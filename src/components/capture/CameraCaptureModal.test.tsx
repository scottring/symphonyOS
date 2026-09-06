import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CameraCaptureModal } from './CameraCaptureModal'

function stubMediaDevices(getUserMedia: ReturnType<typeof vi.fn>) {
  Object.defineProperty(navigator, 'mediaDevices', {
    value: {
      getUserMedia,
      enumerateDevices: vi.fn().mockResolvedValue([]),
    },
    configurable: true,
  })
}

function setTouch(hasTouch: boolean) {
  Object.defineProperty(navigator, 'maxTouchPoints', { value: hasTouch ? 1 : 0, configurable: true })
}

describe('CameraCaptureModal', () => {
  afterEach(() => {
    // @ts-expect-error test cleanup of a property this file defines
    delete navigator.mediaDevices
    setTouch(false)
    try { localStorage.clear() } catch { /* ignore */ }
    vi.restoreAllMocks()
  })

  describe('on desktop, first run', () => {
    beforeEach(() => {
      setTouch(false)
    })

    it('leads with "Choose a file" as the primary action and does not start the camera', async () => {
      const getUserMedia = vi.fn().mockResolvedValue({ getVideoTracks: () => [], getTracks: () => [] })
      stubMediaDevices(getUserMedia)

      render(<CameraCaptureModal onCapture={vi.fn()} onPickFile={vi.fn()} onClose={vi.fn()} />)

      const primary = await screen.findByRole('button', { name: /choose a file/i })
      expect(primary.className).toContain('btn-primary')
      expect(screen.getByRole('button', { name: /use camera/i })).toBeInTheDocument()
      expect(getUserMedia).not.toHaveBeenCalled()
    })

    it('starts the camera only once "Use camera" is pressed', async () => {
      const getUserMedia = vi.fn().mockResolvedValue({ getVideoTracks: () => [], getTracks: () => [] })
      stubMediaDevices(getUserMedia)

      render(<CameraCaptureModal onCapture={vi.fn()} onPickFile={vi.fn()} onClose={vi.fn()} />)
      await userEvent.click(await screen.findByRole('button', { name: /use camera/i }))

      await waitFor(() => expect(getUserMedia).toHaveBeenCalled())
    })

    it('auto-starts the camera when a rotation was remembered from prior use', async () => {
      localStorage.setItem('symphony.camera.rotation.some-device', '90')
      const getUserMedia = vi.fn().mockResolvedValue({ getVideoTracks: () => [], getTracks: () => [] })
      stubMediaDevices(getUserMedia)

      render(<CameraCaptureModal onCapture={vi.fn()} onPickFile={vi.fn()} onClose={vi.fn()} />)

      await waitFor(() => expect(getUserMedia).toHaveBeenCalled())
      expect(screen.queryByRole('button', { name: /use camera/i })).not.toBeInTheDocument()
    })
  })

  describe('on a touch device', () => {
    beforeEach(() => {
      setTouch(true)
    })

    it('swallows its own restart AbortError instead of showing it as a camera failure', async () => {
      const abort = Object.assign(new Error('The request was aborted'), { name: 'AbortError' })
      const getUserMedia = vi.fn().mockRejectedValue(abort)
      stubMediaDevices(getUserMedia)

      render(<CameraCaptureModal onCapture={vi.fn()} onPickFile={vi.fn()} onClose={vi.fn()} />)

      await waitFor(() => expect(getUserMedia).toHaveBeenCalled())
      expect(screen.queryByText(/aborted/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/camera access is blocked/i)).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument()
    })

    it('shows the real error UI for a genuine camera failure', async () => {
      const denied = Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' })
      const getUserMedia = vi.fn().mockRejectedValue(denied)
      stubMediaDevices(getUserMedia)

      render(<CameraCaptureModal onCapture={vi.fn()} onPickFile={vi.fn()} onClose={vi.fn()} />)

      expect(await screen.findByText(/camera access is blocked/i)).toBeInTheDocument()
    })
  })
})

describe('CameraCaptureModal — phone hand-off', () => {
  afterEach(() => {
    // @ts-expect-error test cleanup of a property this file defines
    delete navigator.mediaDevices
    setTouch(false)
    try { localStorage.clear() } catch { /* ignore */ }
    vi.restoreAllMocks()
  })

  it('on desktop, "Use your phone" leads and opens a QR code for the phone route', async () => {
    setTouch(false)
    const getUserMedia = vi.fn().mockResolvedValue({ getVideoTracks: () => [], getTracks: () => [] })
    stubMediaDevices(getUserMedia)
    const onPhoneHandoff = vi.fn()

    render(<CameraCaptureModal onCapture={vi.fn()} onPickFile={vi.fn()} onClose={vi.fn()} onPhoneHandoff={onPhoneHandoff} />)

    const phone = await screen.findByRole('button', { name: /use your phone/i })
    expect(phone.className).toContain('btn-primary')
    expect(screen.getByRole('button', { name: /choose a file/i }).className).not.toContain('btn-primary')

    await userEvent.click(phone)
    const img = await screen.findByRole('img', { name: /qr code/i })
    expect(img.getAttribute('src')).toMatch(/^data:image\/svg\+xml/)
    expect(screen.getByRole('status')).toHaveTextContent(/waiting for your phone/i)
    expect(getUserMedia).not.toHaveBeenCalled()
  })

  it('without the hand-off callback the phone option does not exist', async () => {
    setTouch(false)
    stubMediaDevices(vi.fn().mockResolvedValue({ getVideoTracks: () => [], getTracks: () => [] }))
    render(<CameraCaptureModal onCapture={vi.fn()} onPickFile={vi.fn()} onClose={vi.fn()} />)
    await screen.findByRole('button', { name: /choose a file/i })
    expect(screen.queryByRole('button', { name: /use your phone/i })).toBeNull()
  })
})
