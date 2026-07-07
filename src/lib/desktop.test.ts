import { describe, it, expect, vi, afterEach } from 'vitest'
import { isDesktopShell, desktopEmit, onDesktopEvent } from './desktop'

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
