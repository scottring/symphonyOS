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
})
