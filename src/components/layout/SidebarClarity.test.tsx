import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SidebarClarity } from './SidebarClarity'

describe('SidebarClarity', () => {
  it('renders the label for each health color', () => {
    render(<SidebarClarity healthColor="fair" />)
    expect(screen.getByText('Clarity')).toBeInTheDocument()
    expect(screen.getByText('Fair')).toBeInTheDocument()
  })
  it('maps needsAttention to "Needs attention"', () => {
    render(<SidebarClarity healthColor="needsAttention" />)
    expect(screen.getByText('Needs attention')).toBeInTheDocument()
  })
})
