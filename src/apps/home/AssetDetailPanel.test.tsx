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
    render(<AssetDetailPanel asset={ASSET} onClose={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByText('Dishwasher')).toBeInTheDocument()
    expect(screen.getByText(/appliance/i)).toBeInTheDocument()
  })

  it('clicking close calls onClose', () => {
    const onClose = vi.fn()
    render(<AssetDetailPanel asset={ASSET} onClose={onClose} onUpdate={vi.fn()} onDelete={vi.fn()} />)
    fireEvent.click(screen.getByLabelText(/close/i))
    expect(onClose).toHaveBeenCalled()
  })

  it('inline-editing the name fires onUpdate', () => {
    const onUpdate = vi.fn()
    render(<AssetDetailPanel asset={ASSET} onClose={vi.fn()} onUpdate={onUpdate} onDelete={vi.fn()} />)
    fireEvent.click(screen.getByText('Dishwasher'))
    const input = screen.getByDisplayValue('Dishwasher')
    fireEvent.change(input, { target: { value: 'Bosch DW' } })
    fireEvent.blur(input)
    expect(onUpdate).toHaveBeenCalledWith({ name: 'Bosch DW' })
  })
})
