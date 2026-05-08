import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RoomsKioskView } from './RoomsKioskView'

vi.mock('@/hooks/useHomes', () => ({
  useHomes: () => ({ homes: [{ id: 'h1', userId: 'u1', name: 'M', createdAt: new Date(), updatedAt: new Date() }], loading: false }),
}))
vi.mock('@/hooks/useSpaces', () => ({
  useSpaces: () => ({
    spaces: [
      { id: 'r1', homeId: 'h1', parentSpaceId: null, spaceType: 'room', name: 'Kitchen',
        sortOrder: 0, facts: [], createdBy: 'u1', createdAt: new Date(), updatedAt: new Date() },
      { id: 'r2', homeId: 'h1', parentSpaceId: null, spaceType: 'room', name: 'Living Room',
        sortOrder: 1, facts: [], createdBy: 'u1', createdAt: new Date(), updatedAt: new Date() },
    ],
    rooms: [
      { id: 'r1', homeId: 'h1', parentSpaceId: null, spaceType: 'room', name: 'Kitchen',
        sortOrder: 0, facts: [], createdBy: 'u1', createdAt: new Date(), updatedAt: new Date() },
      { id: 'r2', homeId: 'h1', parentSpaceId: null, spaceType: 'room', name: 'Living Room',
        sortOrder: 1, facts: [], createdBy: 'u1', createdAt: new Date(), updatedAt: new Date() },
    ],
    zones: [], loading: false,
  }),
}))
vi.mock('@/hooks/useAssets', () => ({ useAssets: () => ({ assets: [], loading: false }) }))

describe('RoomsKioskView', () => {
  it('renders all rooms as tiles', () => {
    render(<RoomsKioskView />)
    expect(screen.getByText('Kitchen')).toBeInTheDocument()
    expect(screen.getByText('Living Room')).toBeInTheDocument()
  })

  it('clicking a room shows the space view', () => {
    render(<RoomsKioskView />)
    fireEvent.click(screen.getByText('Kitchen'))
    expect(screen.getByText(/← Rooms/)).toBeInTheDocument()
  })
})
