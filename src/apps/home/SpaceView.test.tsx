import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { SpaceView } from './SpaceView'

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('@/hooks/useHomes', () => ({
  useHomes: () => ({
    homes: [{ id: 'h1', userId: 'u1', name: 'Main', createdAt: new Date(), updatedAt: new Date() }],
    loading: false,
  }),
}))
vi.mock('@/hooks/useSpaces', () => ({
  useSpaces: () => ({
    spaces: [
      { id: 'r1', homeId: 'h1', parentSpaceId: null, spaceType: 'room', name: 'Kitchen',
        photoUrl: undefined, sortOrder: 0,
        facts: [{ type: 'paint', label: 'Wall', value: 'BM Cloud White' }],
        createdBy: 'u1', createdAt: new Date(), updatedAt: new Date() },
      { id: 'z1', homeId: 'h1', parentSpaceId: 'r1', spaceType: 'zone', name: 'Pantry',
        sortOrder: 0, facts: [], createdBy: 'u1', createdAt: new Date(), updatedAt: new Date() },
    ],
    rooms: [],
    zones: [],
    loading: false,
    updateSpace: vi.fn(),
    addZone: vi.fn(),
  }),
}))
vi.mock('@/hooks/useAssets', () => ({
  useAssets: () => ({
    assets: [
      { id: 'a1', homeId: 'h1', spaceId: 'r1', name: 'Dishwasher', assetKind: 'item',
        assetType: 'appliance', tags: [], details: {}, notesId: null, domain: 'family',
        needsDetails: false, createdBy: 'u1', createdAt: new Date(), updatedAt: new Date() },
    ],
    loading: false, captureAsset: vi.fn(),
  }),
}))

describe('SpaceView', () => {
  it('renders the room with facts and zones and assets', () => {
    render(
      <MemoryRouter initialEntries={['/home/space/r1']}>
        <Routes>
          <Route path="/home/space/:id" element={<SpaceView />} />
        </Routes>
      </MemoryRouter>
    )
    expect(screen.getByText('Kitchen')).toBeInTheDocument()
    expect(screen.getByText('BM Cloud White')).toBeInTheDocument()
    expect(screen.getByText('Pantry')).toBeInTheDocument()
    expect(screen.getByText('Dishwasher')).toBeInTheDocument()
  })
})
