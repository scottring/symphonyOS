import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SceneryDial } from './SceneryDial'

describe('scenery dial background', () => {
  beforeEach(() => { localStorage.clear() })

  it('offers every place and the train yard, with your place chosen by default', () => {
    render(<SceneryDial />)
    fireEvent.click(screen.getByRole('button', { name: 'Scenery settings' }))
    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(6)
    expect(screen.getByRole('radio', { name: /Woodsy Cabin \(your place\)/ })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Train yard' })).toHaveAttribute('aria-checked', 'false')
  })

  it('remembers the chosen background on this device, and your place clears it', () => {
    render(<SceneryDial />)
    fireEvent.click(screen.getByRole('button', { name: 'Scenery settings' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Train yard' }))
    expect(localStorage.getItem('symphony-scenery-background')).toBe('train-yard')
    expect(screen.getByRole('radio', { name: 'Train yard' })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('radio', { name: /your place/ }))
    expect(localStorage.getItem('symphony-scenery-background')).toBe('place')
  })
})
