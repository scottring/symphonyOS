import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AssetCapture } from './AssetCapture'

vi.mock('@/hooks/useHomes', () => ({
  useHomes: () => ({ homes: [{ id: 'h1', userId: 'u1', name: 'M', createdAt: new Date(), updatedAt: new Date() }], loading: false }),
}))
vi.mock('@/hooks/useSpaces', () => ({
  useSpaces: () => ({
    spaces: [
      { id: 'r1', homeId: 'h1', parentSpaceId: null, spaceType: 'room', name: 'Kitchen',
        sortOrder: 0, facts: [], createdBy: 'u1', createdAt: new Date(), updatedAt: new Date() },
    ],
    rooms: [
      { id: 'r1', homeId: 'h1', parentSpaceId: null, spaceType: 'room', name: 'Kitchen',
        sortOrder: 0, facts: [], createdBy: 'u1', createdAt: new Date(), updatedAt: new Date() },
    ],
    zones: [], loading: false,
  }),
}))
const captureAsset = vi.fn().mockResolvedValue({ id: 'a-new' })
vi.mock('@/hooks/useAssets', () => ({
  useAssets: () => ({ assets: [], needsDetailsAssets: [], loading: false, captureAsset }),
}))

beforeEach(() => captureAsset.mockClear())

describe('AssetCapture', () => {
  it('renders camera prompt and name field', () => {
    render(<MemoryRouter><AssetCapture /></MemoryRouter>)
    expect(screen.getByText(/take a photo/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument()
  })

  it('saving with name + room calls captureAsset with needs_details handled by hook', async () => {
    render(<MemoryRouter><AssetCapture /></MemoryRouter>)
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Bike' } })
    fireEvent.change(screen.getByLabelText(/where/i), { target: { value: 'r1' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    })
    expect(captureAsset).toHaveBeenCalledWith({ name: 'Bike', spaceId: 'r1', photoUrl: undefined, assetKind: 'item' })
  })

  it('toggle "this is a collection" flips assetKind', async () => {
    render(<MemoryRouter><AssetCapture /></MemoryRouter>)
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Lego' } })
    fireEvent.change(screen.getByLabelText(/where/i), { target: { value: 'r1' } })
    fireEvent.click(screen.getByLabelText(/collection/i))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    })
    expect(captureAsset).toHaveBeenLastCalledWith(expect.objectContaining({ assetKind: 'collection' }))
  })
})
