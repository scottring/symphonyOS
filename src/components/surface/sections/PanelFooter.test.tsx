import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { PanelFooter } from './PanelFooter'

describe('PanelFooter', () => {
  it('renders created date', () => {
    render(<PanelFooter createdAt={new Date('2026-03-27T12:00:00Z')} updatedAt={new Date('2026-03-27T12:00:00Z')} />)
    expect(screen.getByText(/created/i)).toBeInTheDocument()
    expect(screen.getByText(/mar 27/i)).toBeInTheDocument()
  })

  it('renders creator name when provided', () => {
    render(<PanelFooter createdAt={new Date('2026-03-27T12:00:00Z')} updatedAt={new Date('2026-03-27T12:00:00Z')} createdByName="Iris" />)
    expect(screen.getByText(/by iris/i)).toBeInTheDocument()
  })

  it('shows "Updated" when updatedAt is later than createdAt', () => {
    render(<PanelFooter createdAt={new Date('2026-03-27T12:00:00Z')} updatedAt={new Date('2026-05-07T12:00:00Z')} />)
    expect(screen.getByText(/updated/i)).toBeInTheDocument()
  })
})
