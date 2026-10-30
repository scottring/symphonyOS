import { describe, it, expect, vi, afterEach } from 'vitest'
import { isDesktopShell, desktopEmit, onDesktopEvent, requestDesktopScreenshot } from './desktop'

type TauriMock = {
  event: {
    listen: ReturnType<typeof vi.fn>
    emit: ReturnType<typeof vi.fn>
  }
}

function installTauriMock(): TauriMock {
  const mock: TauriMock = {
    event: {
      listen: vi.fn().mockResolvedValue(vi.fn()),
      emit: vi.fn().mockResolvedValue(undefined),
    },
  }
  ;(window as unknown as { __TAURI__?: TauriMock }).__TAURI__ = mock
  return mock
}

afterEach(() => {
  delete (window as unknown as { __TAURI__?: TauriMock }).__TAURI__
})

describe('desktop bridge', () => {
  it('isDesktopShell is false in a plain browser', () => {
    expect(isDesktopShell()).toBe(false)
  })

  it('isDesktopShell is true when __TAURI__ is present', () => {
    installTauriMock()
    expect(isDesktopShell()).toBe(true)
  })

  it('desktopEmit forwards to __TAURI__.event.emit', () => {
    const mock = installTauriMock()
    desktopEmit('shell:tray-update', { remaining: 2 })
    expect(mock.event.emit).toHaveBeenCalledWith('shell:tray-update', { remaining: 2 })
  })

  it('desktopEmit is a no-op in a plain browser', () => {
    expect(() => desktopEmit('shell:tray-update', {})).not.toThrow()
  })

  it('onDesktopEvent subscribes and unwraps the payload', async () => {
    const mock = installTauriMock()
    const handler = vi.fn()
    onDesktopEvent<string>('shell:navigate', handler)
    expect(mock.event.listen).toHaveBeenCalledWith('shell:navigate', expect.any(Function))
    const registered = mock.event.listen.mock.calls[0][1] as (e: { payload: unknown }) => void
    registered({ payload: 'today' })
    expect(handler).toHaveBeenCalledWith('today')
  })

  it('onDesktopEvent returns a working no-op unsubscribe in a plain browser', () => {
    const unsub = onDesktopEvent('shell:navigate', vi.fn())
    expect(() => unsub()).not.toThrow()
  })
})

describe('requestDesktopScreenshot', () => {
  // Wire listen() so the test can fire shell events at the page.
  function shellWith(onEmit: (fire: (event: string, payload?: unknown) => void) => void) {
    const mock = installTauriMock()
    const handlers = new Map<string, (e: { payload: unknown }) => void>()
    mock.event.listen.mockImplementation(async (event: string, cb: (e: { payload: unknown }) => void) => {
      handlers.set(event, cb)
      return vi.fn()
    })
    const fire = (event: string, payload?: unknown) => handlers.get(event)?.({ payload })
    mock.event.emit.mockImplementation(async (event: string) => {
      if (event === 'shell:screenshot') onEmit(fire)
    })
    return mock
  }

  it('is unsupported in a plain browser', async () => {
    expect(await requestDesktopScreenshot()).toEqual({ status: 'unsupported' })
  })

  it('returns the picture as a JPEG file', async () => {
    shellWith((fire) => {
      fire('shell:screenshot-started')
      fire('shell:screenshot-result', { image: btoa('jpg-bytes'), error: null })
    })
    const result = await requestDesktopScreenshot()
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.file.type).toBe('image/jpeg')
    expect(await result.file.text()).toBe('jpg-bytes')
  })

  it('Esc in the crosshair is cancelled, not an error', async () => {
    shellWith((fire) => {
      fire('shell:screenshot-started')
      fire('shell:screenshot-result', { image: null, error: null })
    })
    expect(await requestDesktopScreenshot()).toEqual({ status: 'cancelled' })
  })

  it('passes the shell’s error through', async () => {
    shellWith((fire) => fire('shell:screenshot-result', { image: null, error: 'screencapture failed' }))
    expect(await requestDesktopScreenshot()).toEqual({ status: 'error', message: 'screencapture failed' })
  })

  it('a shell that never acks (built before screenshots) reads as unsupported', async () => {
    shellWith(() => {})
    expect(await requestDesktopScreenshot(20)).toEqual({ status: 'unsupported' })
  })
})
