import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '@/test/test-utils'
import type { User } from '@supabase/supabase-js'

const h = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: h.rpc } }))

import { EditionGate } from './EditionGate'

const user = { id: 'u-ed', email: 'a@b.c' } as unknown as User
const signOut = vi.fn(async () => ({ error: null }))
const gate = (u: User = user) => (
  <EditionGate user={u} signOut={signOut}><div>APP</div></EditionGate>
)

beforeEach(() => { h.rpc.mockReset(); signOut.mockClear(); localStorage.clear() })

describe('EditionGate', () => {
  it('shows the holding page, not the app, for a light account', async () => {
    h.rpc.mockResolvedValue({ data: 'light', error: null })
    render(gate())
    expect(await screen.findByRole('heading', { name: 'Symphony is on iPhone for now' })).toBeInTheDocument()
    expect(screen.queryByText('APP')).not.toBeInTheDocument()
    expect(h.rpc).toHaveBeenCalledWith('my_edition')
  })

  it('shows the app for a full account', async () => {
    h.rpc.mockResolvedValue({ data: 'full', error: null })
    render(gate())
    expect(await screen.findByText('APP')).toBeInTheDocument()
  })

  it.each([
    ['an error', () => h.rpc.mockResolvedValue({ data: null, error: { message: 'no function' } })],
    ['a rejection', () => h.rpc.mockRejectedValue(new Error('offline'))],
    ['an unexpected answer', () => h.rpc.mockResolvedValue({ data: 'gold', error: null })],
  ])('shows the app on %s', async (_n, arrange) => {
    arrange()
    render(gate())
    expect(await screen.findByText('APP')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Symphony is on iPhone for now' })).not.toBeInTheDocument()
  })

  it('lets a paired display straight through without asking', () => {
    render(gate({ id: 'anon', is_anonymous: true } as unknown as User))
    expect(screen.getByText('APP')).toBeInTheDocument()
    expect(h.rpc).not.toHaveBeenCalled()
  })

  it('remembers a full answer so a second mount does not wait', async () => {
    h.rpc.mockResolvedValue({ data: 'full', error: null })
    const { unmount } = render(gate())
    expect(await screen.findByText('APP')).toBeInTheDocument()
    unmount()
    render(gate())
    expect(screen.getByText('APP')).toBeInTheDocument()
    expect(h.rpc).toHaveBeenCalledTimes(1)
  })

  it('does not remember a light answer', async () => {
    h.rpc.mockResolvedValue({ data: 'light', error: null })
    const { unmount } = render(gate())
    await screen.findByRole('heading', { name: 'Symphony is on iPhone for now' })
    unmount()
    h.rpc.mockResolvedValue({ data: 'full', error: null })
    render(gate())
    expect(await screen.findByText('APP')).toBeInTheDocument()
    expect(h.rpc).toHaveBeenCalledTimes(2)
  })

  it('signs out from the holding page', async () => {
    h.rpc.mockResolvedValue({ data: 'light', error: null })
    render(gate())
    await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }))
    expect(signOut).toHaveBeenCalled()
    expect(screen.getByText('Signed in as a@b.c')).toBeInTheDocument()
  })
})
