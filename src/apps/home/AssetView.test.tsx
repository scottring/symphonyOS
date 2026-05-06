import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { AssetView } from './AssetView'

vi.mock('@/hooks/useHomes', () => ({
  useHomes: () => ({ homes: [{ id: 'h1', userId: 'u1', name: 'M', createdAt: new Date(), updatedAt: new Date() }], loading: false }),
}))
vi.mock('@/hooks/useAssets', () => ({
  useAssets: () => ({
    assets: [
      { id: 'a1', homeId: 'h1', spaceId: 'r1', assetKind: 'item', assetType: 'appliance',
        name: 'Dishwasher', tags: [], details: {}, notesId: null, domain: 'family',
        needsDetails: false, createdBy: 'u1', createdAt: new Date(), updatedAt: new Date() },
    ],
    loading: false, updateAsset: vi.fn(), deleteAsset: vi.fn(),
  }),
}))
vi.mock('@/hooks/useSpaces', () => ({
  useSpaces: () => ({
    spaces: [{ id: 'r1', homeId: 'h1', parentSpaceId: null, spaceType: 'room', name: 'Kitchen',
      sortOrder: 0, facts: [], createdBy: 'u1', createdAt: new Date(), updatedAt: new Date() }],
    loading: false,
  }),
}))

describe('AssetView', () => {
  it('renders the asset and a breadcrumb to the room', () => {
    render(
      <MemoryRouter initialEntries={['/home/asset/a1']}>
        <Routes>
          <Route path="/home/asset/:id" element={<AssetView />} />
        </Routes>
      </MemoryRouter>
    )
    expect(screen.getByText('Dishwasher')).toBeInTheDocument()
    expect(screen.getByText(/← Kitchen/)).toBeInTheDocument()
  })
})
