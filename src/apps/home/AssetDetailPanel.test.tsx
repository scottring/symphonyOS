import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AssetDetailPanel } from './AssetDetailPanel'
import type { Asset } from '@/types/home'

const ASSET: Asset = {
  id: 'a1', homeId: 'h1', spaceId: 'r1', assetKind: 'item', assetType: 'appliance',
  name: 'Dishwasher', tags: [], details: {}, notesId: null, domain: 'family',
  needsDetails: false, createdBy: 'u1', createdAt: new Date(), updatedAt: new Date(),
}

describe('AssetDetailPanel', () => {
  it('renders the asset name and type', () => {
    render(<AssetDetailPanel asset={ASSET} spaces={[]} onClose={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByText('Dishwasher')).toBeInTheDocument()
    expect(screen.getByText(/appliance/i)).toBeInTheDocument()
  })

  it('clicking close calls onClose', () => {
    const onClose = vi.fn()
    render(<AssetDetailPanel asset={ASSET} spaces={[]} onClose={onClose} onUpdate={vi.fn()} onDelete={vi.fn()} />)
    fireEvent.click(screen.getByLabelText(/close/i))
    expect(onClose).toHaveBeenCalled()
  })

  it('inline-editing the name fires onUpdate', () => {
    const onUpdate = vi.fn()
    render(<AssetDetailPanel asset={ASSET} spaces={[]} onClose={vi.fn()} onUpdate={onUpdate} onDelete={vi.fn()} />)
    fireEvent.click(screen.getByText('Dishwasher'))
    const input = screen.getByDisplayValue('Dishwasher')
    fireEvent.change(input, { target: { value: 'Bosch DW' } })
    fireEvent.blur(input)
    expect(onUpdate).toHaveBeenCalledWith({ name: 'Bosch DW' })
  })

  it('changing the type select fires onUpdate', () => {
    const onUpdate = vi.fn()
    render(<AssetDetailPanel asset={ASSET} spaces={[]} onClose={vi.fn()} onUpdate={onUpdate} onDelete={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'electronics' } })
    expect(onUpdate).toHaveBeenCalledWith({ assetType: 'electronics' })
  })

  it('editing the code/password field stores it in details.access_code', () => {
    const onUpdate = vi.fn()
    render(<AssetDetailPanel asset={ASSET} spaces={[]} onClose={vi.fn()} onUpdate={onUpdate} onDelete={vi.fn()} />)
    fireEvent.click(screen.getByText('Gate code, lock combo, Wi-Fi…'))
    const input = screen.getByDisplayValue('')
    fireEvent.change(input, { target: { value: '1234#' } })
    fireEvent.blur(input)
    expect(onUpdate).toHaveBeenCalledWith({ details: { access_code: '1234#' } })
  })

  it('masks an existing code and reveals it on Show', () => {
    const withCode: Asset = { ...ASSET, details: { access_code: 'secret9' } }
    render(<AssetDetailPanel asset={withCode} spaces={[]} onClose={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.queryByText('secret9')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Show'))
    expect(screen.getByText('secret9')).toBeInTheDocument()
  })

  it('changing the where select fires onUpdate with new spaceId', () => {
    const onUpdate = vi.fn()
    const spaces = [
      { id: 'r1', homeId: 'h1', parentSpaceId: null, spaceType: 'room' as const, name: 'Kitchen',
        sortOrder: 0, facts: [], createdBy: 'u1', createdAt: new Date(), updatedAt: new Date() },
      { id: 'r2', homeId: 'h1', parentSpaceId: null, spaceType: 'room' as const, name: 'Garage',
        sortOrder: 1, facts: [], createdBy: 'u1', createdAt: new Date(), updatedAt: new Date() },
    ]
    render(<AssetDetailPanel asset={ASSET} spaces={spaces} onClose={vi.fn()} onUpdate={onUpdate} onDelete={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Where'), { target: { value: 'r2' } })
    expect(onUpdate).toHaveBeenCalledWith({ spaceId: 'r2' })
  })
})
