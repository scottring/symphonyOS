import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DocumentProposalRow } from './DocumentProposal'

describe('DocumentProposalRow', () => {
  it('names the kind it recognized', () => {
    render(
      <DocumentProposalRow
        kind="drivers_license"
        label="Scott's driver's license"
        onKeep={vi.fn()}
        onDismiss={vi.fn()}
      />
    )
    // The label leads so two proposals of the same kind stay distinguishable;
    // the recognized kind sits underneath it.
    expect(screen.getByText("Scott's driver's license")).toBeInTheDocument()
    expect(screen.getByText(/looks like a driver's license/i)).toBeInTheDocument()
  })

  it('distinguishes two proposals of the same kind by their labels', () => {
    const { rerender } = render(
      <DocumentProposalRow kind="drivers_license" label="Maryland licence (front)" onKeep={vi.fn()} onDismiss={vi.fn()} />
    )
    expect(screen.getByText('Maryland licence (front)')).toBeInTheDocument()
    rerender(
      <DocumentProposalRow kind="drivers_license" label="Maryland licence (back)" onKeep={vi.fn()} onDismiss={vi.fn()} />
    )
    expect(screen.getByText('Maryland licence (back)')).toBeInTheDocument()
  })

  it('calls onKeep when kept', () => {
    const onKeep = vi.fn()
    render(<DocumentProposalRow kind="passport" label="Passport" onKeep={onKeep} onDismiss={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /keep in documents/i }))
    expect(onKeep).toHaveBeenCalledTimes(1)
  })

  it('calls onDismiss when rejected', () => {
    const onDismiss = vi.fn()
    render(<DocumentProposalRow kind="passport" label="Passport" onKeep={vi.fn()} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByRole('button', { name: /not a document/i }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
