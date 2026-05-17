import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WallChrome } from './WallChrome'

describe('WallChrome', () => {
  it('renders the time and date from now prop', () => {
    const now = new Date('2026-05-17T17:34:00')
    render(<WallChrome now={now} weather={null} />)
    expect(screen.getByText(/5:34/)).toBeInTheDocument()
    expect(screen.getByText(/PM/i)).toBeInTheDocument()
    expect(screen.getByText(/SUN/i)).toBeInTheDocument()
    expect(screen.getByText(/MAY/i)).toBeInTheDocument()
  })

  it('renders weather when provided', () => {
    const now = new Date('2026-05-17T12:00:00')
    render(<WallChrome now={now} weather={{ temp: 68, description: 'Clear', high: 72, low: 54 }} />)
    expect(screen.getByText(/68°/)).toBeInTheDocument()
    expect(screen.getByText(/Clear/i)).toBeInTheDocument()
  })

  it('does not render weather section when weather is null', () => {
    const now = new Date('2026-05-17T12:00:00')
    const { container } = render(<WallChrome now={now} weather={null} />)
    expect(container.querySelector('[data-weather]')).toBeNull()
  })
})
