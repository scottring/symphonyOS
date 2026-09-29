import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import type { User } from '@supabase/supabase-js'

const h = vi.hoisted(() => ({
  signals: vi.fn(),
}))
vi.mock('@/lib/firstRun', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/firstRun')>()
  return { ...mod, loadFirstRunSignals: h.signals }
})
vi.mock('./FirstRunSetup', () => ({ FirstRunSetup: () => <div>SETUP SCREEN</div> }))

import { FirstRunGate } from './FirstRunGate'

const user = { id: 'u-gate', email: 'a@b.c' } as unknown as User

beforeEach(() => { h.signals.mockReset(); localStorage.clear() })

describe('FirstRunGate', () => {
  it('shows setup for a fresh account', async () => {
    h.signals.mockResolvedValue({ completed: false, hasTasks: false, memberCount: 1 })
    render(<FirstRunGate user={user}><div>APP</div></FirstRunGate>)
    expect(await screen.findByText('SETUP SCREEN')).toBeInTheDocument()
    expect(screen.queryByText('APP')).not.toBeInTheDocument()
  })

  it('passes an existing account through and remembers that per browser', async () => {
    h.signals.mockResolvedValue({ completed: false, hasTasks: true, memberCount: 4 })
    const { unmount } = render(<FirstRunGate user={user}><div>APP</div></FirstRunGate>)
    expect(await screen.findByText('APP')).toBeInTheDocument()
    unmount()
    render(<FirstRunGate user={user}><div>APP</div></FirstRunGate>)
    expect(screen.getByText('APP')).toBeInTheDocument()
    expect(h.signals).toHaveBeenCalledTimes(1)
  })

  it('never blocks the app when the check fails', async () => {
    h.signals.mockRejectedValue(new Error('offline'))
    render(<FirstRunGate user={user}><div>APP</div></FirstRunGate>)
    expect(await screen.findByText('APP')).toBeInTheDocument()
  })

  // Clarity audit 2026-09-29: an invited partner who signed up was sent to
  // setup and made a second household.
  it('sends a fresh account with a pending invitation back to it, not to setup', async () => {
    h.signals.mockResolvedValue({ completed: false, hasTasks: false, memberCount: 1 })
    localStorage.setItem('symphony.pendingJoin', JSON.stringify({ token: 'tok-9', at: Date.now() }))
    const replace = vi.fn()
    const loc = window.location
    Object.defineProperty(window, 'location', { configurable: true, value: { ...loc, replace } })
    try {
      render(<FirstRunGate user={user}><div>APP</div></FirstRunGate>)
      await vi.waitFor(() => expect(replace).toHaveBeenCalledWith('/join/tok-9'))
      expect(screen.queryByText('SETUP SCREEN')).not.toBeInTheDocument()
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: loc })
    }
  })

  it('ignores an invitation older than a week', async () => {
    h.signals.mockResolvedValue({ completed: false, hasTasks: false, memberCount: 1 })
    localStorage.setItem('symphony.pendingJoin', JSON.stringify({ token: 'old', at: Date.now() - 8 * 86400000 }))
    render(<FirstRunGate user={user}><div>APP</div></FirstRunGate>)
    expect(await screen.findByText('SETUP SCREEN')).toBeInTheDocument()
  })
})
