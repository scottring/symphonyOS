import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { RoomSessionMode } from './RoomSessionMode'

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('@/hooks/useHomes', () => ({
  useHomes: () => ({ homes: [{ id: 'h1', userId: 'u1', name: 'M', createdAt: new Date(), updatedAt: new Date() }], loading: false }),
}))
const captureAsset = vi.fn().mockResolvedValue({ id: 'a-new' })
vi.mock('@/hooks/useAssets', () => ({
  useAssets: () => ({ captureAsset, assets: [], needsDetailsAssets: [], loading: false }),
}))
vi.mock('@/hooks/useSpaces', () => ({
  useSpaces: () => ({
    spaces: [{ id: 'r1', homeId: 'h1', parentSpaceId: null, spaceType: 'room', name: 'Kitchen',
      sortOrder: 0, facts: [], createdBy: 'u1', createdAt: new Date(), updatedAt: new Date() }],
    rooms: [], zones: [], loading: false,
  }),
}))

beforeEach(() => captureAsset.mockClear())

describe('RoomSessionMode', () => {
  it('renders the pinned room header and counter', () => {
    render(
      <MemoryRouter initialEntries={['/home/space/r1/session']}>
        <Routes>
          <Route path="/home/space/:id/session" element={<RoomSessionMode />} />
        </Routes>
      </MemoryRouter>
    )
    expect(screen.getByText(/Kitchen/)).toBeInTheDocument()
    expect(screen.getByText(/0 added/i)).toBeInTheDocument()
  })

  it('saving an asset increments the counter', async () => {
    render(
      <MemoryRouter initialEntries={['/home/space/r1/session']}>
        <Routes>
          <Route path="/home/space/:id/session" element={<RoomSessionMode />} />
        </Routes>
      </MemoryRouter>
    )
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Bike' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /save/i })))
    expect(captureAsset).toHaveBeenCalledWith({ name: 'Bike', spaceId: 'r1', photoUrl: undefined, assetKind: 'item' })
    expect(screen.getByText(/1 added/i)).toBeInTheDocument()
  })
})
