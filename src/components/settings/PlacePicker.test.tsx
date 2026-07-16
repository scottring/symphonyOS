import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { PlacePicker } from './PlacePicker'
import { PLACES } from '@/config/places'

describe('PlacePicker', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => { delete document.documentElement.dataset.place })

  it('renders all five places with the default pressed', () => {
    render(<PlacePicker />)
    for (const p of PLACES) expect(screen.getByText(p.name)).toBeInTheDocument()
    const pressed = screen.getAllByRole('button', { pressed: true })
    expect(pressed).toHaveLength(1)
    expect(pressed[0]).toHaveTextContent('Woodsy Cabin')
  })

  it('tapping a place applies it instantly', async () => {
    const { user } = render(<PlacePicker />)
    await user.click(screen.getByRole('button', { name: /Densely Urban/ }))
    expect(document.documentElement.dataset.place).toBe('urban')
    expect(screen.getByRole('button', { name: /Densely Urban/ })).toHaveAttribute('aria-pressed', 'true')
  })
})
