import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { HomeOverview } from './HomeOverview'

vi.mock('@/hooks/useHomes', () => ({
  useHomes: () => ({
    homes: [{ id: 'h1', userId: 'u1', name: 'Main', createdAt: new Date(), updatedAt: new Date() }],
    loading: false, addHome: vi.fn(),
  }),
}))
vi.mock('@/hooks/useSpaces', () => ({
  useSpaces: () => ({
    spaces: [],
    rooms: [
      { id: 'r1', homeId: 'h1', parentSpaceId: null, spaceType: 'room', name: 'Kitchen',
        sortOrder: 0, facts: [], createdBy: 'u1', createdAt: new Date(), updatedAt: new Date() },
    ],
    zones: [], loading: false, addRoom: vi.fn(),
  }),
}))
vi.mock('@/hooks/useAssets', () => ({
  useAssets: () => ({
    assets: [
      { id: 'a1', homeId: 'h1', spaceId: 'r1', name: 'Dishwasher', assetKind: 'item',
        assetType: 'appliance', tags: [], details: {}, notesId: null, domain: 'family',
        needsDetails: false, createdBy: 'u1', createdAt: new Date(), updatedAt: new Date() },
    ],
    needsDetailsAssets: [
      { id: 'a2', homeId: 'h1', spaceId: 'r1', name: 'Bike', assetKind: 'item',
        assetType: 'other', tags: [], details: {}, notesId: null, domain: 'family',
        needsDetails: true, createdBy: 'u1', createdAt: new Date(), updatedAt: new Date() },
    ],
    loading: false, captureAsset: vi.fn(),
  }),
}))

describe('HomeOverview', () => {
  it('shows the room grid', () => {
    render(<MemoryRouter><HomeOverview /></MemoryRouter>)
    expect(screen.getByText('Kitchen')).toBeInTheDocument()
    expect(screen.getByText(/1 item/)).toBeInTheDocument()
  })

  it('shows the needs-details banner when count > 0', () => {
    render(<MemoryRouter><HomeOverview /></MemoryRouter>)
    expect(screen.getByText(/1 asset(s)? need details/i)).toBeInTheDocument()
  })

  it('lists recent assets', () => {
    render(<MemoryRouter><HomeOverview /></MemoryRouter>)
    expect(screen.getByText('Dishwasher')).toBeInTheDocument()
  })
})
