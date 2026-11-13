import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SceneryDial } from './SceneryDial'

describe('scenery dial background', () => {
  beforeEach(() => { localStorage.clear() })

  it('offers the four prints, the overlook by default', () => {
    render(<SceneryDial />)
    fireEvent.click(screen.getByRole('button', { name: 'Scenery settings' }))
    expect(screen.getAllByRole('radio')).toHaveLength(4)
    expect(screen.getByRole('radio', { name: 'Subway platform' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('radio', { name: 'City skyline' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('radio', { name: 'Mountain overlook' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Train yard' })).toHaveAttribute('aria-checked', 'false')
  })

  it('remembers the chosen background on this device', () => {
    render(<SceneryDial />)
    fireEvent.click(screen.getByRole('button', { name: 'Scenery settings' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Train yard' }))
    expect(localStorage.getItem('symphony-scenery-background')).toBe('train-yard')
    expect(screen.getByRole('radio', { name: 'Train yard' })).toHaveAttribute('aria-checked', 'true')
  })

  it("reads an older choice of a place's scene as the overlook", () => {
    localStorage.setItem('symphony-scenery-background', 'urban')
    render(<SceneryDial />)
    fireEvent.click(screen.getByRole('button', { name: 'Scenery settings' }))
    expect(screen.getByRole('radio', { name: 'Mountain overlook' })).toHaveAttribute('aria-checked', 'true')
  })
})
