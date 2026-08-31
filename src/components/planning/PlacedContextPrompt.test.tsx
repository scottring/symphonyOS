import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PlacedContextPrompt } from './PlacedContextPrompt'

describe('PlacedContextPrompt', () => {
  it('offers the three domains and reports the pick', () => {
    const onPick = vi.fn()
    const onDismiss = vi.fn()
    render(<PlacedContextPrompt position={{ left: 100, top: 100 }} onPick={onPick} onDismiss={onDismiss} />)
    expect(screen.getByText('Which area is this?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Work/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Personal/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Family/ }))
    expect(onPick).toHaveBeenCalledWith('family')
  })

  it('dismisses on Escape without picking', () => {
    const onPick = vi.fn()
    const onDismiss = vi.fn()
    render(<PlacedContextPrompt position={{ left: 0, top: 0 }} onPick={onPick} onDismiss={onDismiss} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onDismiss).toHaveBeenCalled()
    expect(onPick).not.toHaveBeenCalled()
  })
})
