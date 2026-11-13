import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'

const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  auth: { user: null as unknown, loading: false, signOut: vi.fn(async () => ({ error: null })) },
}))
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: h.rpc } }))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => h.auth }))

import { EditionGateIfSignedIn } from './EditionGateIfSignedIn'

const HOLDING = { name: 'Symphony is on iPhone for now' }
const gate = () => <EditionGateIfSignedIn><div>WALL</div></EditionGateIfSignedIn>

beforeEach(() => {
  h.rpc.mockReset()
  h.auth.user = null
  h.auth.loading = false
  localStorage.clear()
})

describe('EditionGateIfSignedIn', () => {
  it('shows the children with no user (the wall must reach pairing)', () => {
    render(gate())
    expect(screen.getByText('WALL')).toBeInTheDocument()
    expect(h.rpc).not.toHaveBeenCalled()
  })

  it('shows the children to an anonymous user (a paired display) without asking', () => {
    h.auth.user = { id: 'display-1', is_anonymous: true }
    render(gate())
    expect(screen.getByText('WALL')).toBeInTheDocument()
    expect(h.rpc).not.toHaveBeenCalled()
  })

  it('shows the holding page, not the children, to a signed-in light account', async () => {
    h.auth.user = { id: 'light-1', email: 'l@example.com', is_anonymous: false }
    h.rpc.mockResolvedValue({ data: 'light', error: null })
    render(gate())
    expect(await screen.findByRole('heading', HOLDING)).toBeInTheDocument()
    expect(screen.queryByText('WALL')).not.toBeInTheDocument()
    expect(h.rpc).toHaveBeenCalledWith('my_edition')
  })

  it('shows the children to a signed-in full account', async () => {
    h.auth.user = { id: 'full-1', email: 'f@example.com', is_anonymous: false }
    h.rpc.mockResolvedValue({ data: 'full', error: null })
    render(gate())
    expect(await screen.findByText('WALL')).toBeInTheDocument()
    expect(screen.queryByRole('heading', HOLDING)).not.toBeInTheDocument()
  })

  it('shows the children while auth is loading', () => {
    h.auth.loading = true
    h.auth.user = { id: 'light-2', email: 'l2@example.com', is_anonymous: false }
    render(gate())
    expect(screen.getByText('WALL')).toBeInTheDocument()
    expect(h.rpc).not.toHaveBeenCalled()
  })
})
