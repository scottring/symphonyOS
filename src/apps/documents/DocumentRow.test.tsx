import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DocumentRow } from './DocumentRow'
import type { SymphonyDocument } from '@/hooks/useDocuments'

vi.mock('@/lib/supabase', () => ({
  supabase: { storage: { from: () => ({ createSignedUrl: vi.fn().mockResolvedValue({ data: null }) }) } },
}))

function doc(over: Partial<SymphonyDocument> = {}): SymphonyDocument {
  return {
    id: 'a1', fileName: 'license.jpg', fileType: 'image/jpeg', fileSize: 1024,
    storagePath: 'u1/task/t1/license.jpg', kind: 'drivers_license',
    label: "Scott's Maryland driver's license", owner: 'Scott', expiresOn: '2029-03-14',
    scope: 'private', status: 'kept', sourceEntityType: 'task',
    sourceEntityId: 't1', createdAt: new Date('2026-08-05'), ...over,
  }
}

const onSave = vi.fn().mockResolvedValue(true)
const noop = vi.fn()

function renderRow(d = doc()) {
  return render(<DocumentRow document={d} onToggleScope={noop} onDelete={noop} onSave={onSave} />)
}

beforeEach(() => { onSave.mockClear() })

describe('DocumentRow editing', () => {
  it('shows the label as the row title in display mode', () => {
    renderRow()
    expect(screen.getByText("Scott's Maryland driver's license")).toBeInTheDocument()
    expect(screen.queryByLabelText(/document name/i)).not.toBeInTheDocument()
  })

  it('enters edit mode when the rename control is used', () => {
    renderRow()
    fireEvent.click(screen.getByRole('button', { name: /rename/i }))
    expect(screen.getByLabelText(/document name/i)).toHaveValue("Scott's Maryland driver's license")
    expect(screen.getByLabelText(/owner/i)).toHaveValue('Scott')
    expect(screen.getByLabelText(/expires/i)).toHaveValue('2029-03-14')
  })

  it('saves all three fields', () => {
    renderRow()
    fireEvent.click(screen.getByRole('button', { name: /rename/i }))
    fireEvent.change(screen.getByLabelText(/document name/i), { target: { value: "Driver's license (front)" } })
    fireEvent.change(screen.getByLabelText(/owner/i), { target: { value: 'Scott K' } })
    fireEvent.change(screen.getByLabelText(/expires/i), { target: { value: '2030-01-02' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    expect(onSave).toHaveBeenCalledWith('a1', {
      label: "Driver's license (front)",
      owner: 'Scott K',
      expiresOn: '2030-01-02',
    })
  })

  it('cancel discards changes without saving', () => {
    renderRow()
    fireEvent.click(screen.getByRole('button', { name: /rename/i }))
    fireEvent.change(screen.getByLabelText(/document name/i), { target: { value: 'nonsense' } })
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByText("Scott's Maryland driver's license")).toBeInTheDocument()
  })

  it('Escape cancels', () => {
    renderRow()
    fireEvent.click(screen.getByRole('button', { name: /rename/i }))
    fireEvent.keyDown(screen.getByLabelText(/document name/i), { key: 'Escape' })
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByText("Scott's Maryland driver's license")).toBeInTheDocument()
  })

  it('Enter in the name field saves', () => {
    renderRow()
    fireEvent.click(screen.getByRole('button', { name: /rename/i }))
    fireEvent.change(screen.getByLabelText(/document name/i), { target: { value: 'Passport (page 1)' } })
    fireEvent.keyDown(screen.getByLabelText(/document name/i), { key: 'Enter' })
    expect(onSave).toHaveBeenCalledWith('a1', expect.objectContaining({ label: 'Passport (page 1)' }))
  })

  it('refuses to save an empty name', () => {
    renderRow()
    fireEvent.click(screen.getByRole('button', { name: /rename/i }))
    fireEvent.change(screen.getByLabelText(/document name/i), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByLabelText(/document name/i)).toBeInTheDocument()
  })

  it('clearing owner and expiry sends nulls', () => {
    renderRow()
    fireEvent.click(screen.getByRole('button', { name: /rename/i }))
    fireEvent.change(screen.getByLabelText(/owner/i), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText(/expires/i), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    expect(onSave).toHaveBeenCalledWith('a1', expect.objectContaining({ owner: null, expiresOn: null }))
  })

  it('handles a document with no owner or expiry', () => {
    renderRow(doc({ owner: null, expiresOn: null }))
    fireEvent.click(screen.getByRole('button', { name: /rename/i }))
    expect(screen.getByLabelText(/owner/i)).toHaveValue('')
    expect(screen.getByLabelText(/expires/i)).toHaveValue('')
  })
})
