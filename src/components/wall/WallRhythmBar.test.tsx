import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WallRhythmBar } from './WallRhythmBar'

describe('WallRhythmBar', () => {
  it('renders all 6 modes with labels', () => {
    render(<WallRhythmBar currentMode="dinner" overrideMode={null} onSelectMode={() => {}} />)
    expect(screen.getByRole('button', { name: /morning/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^day/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /after school/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /dinner/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /bedtime/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /wind down/i })).toBeInTheDocument()
  })

  it('marks the current mode as active', () => {
    render(<WallRhythmBar currentMode="dinner" overrideMode={null} onSelectMode={() => {}} />)
    expect(screen.getByRole('button', { name: /dinner/i })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /morning/i })).toHaveAttribute('aria-pressed', 'false')
  })

  it('calls onSelectMode with the mode when tapped', () => {
    const onSelectMode = vi.fn()
    render(<WallRhythmBar currentMode="dinner" overrideMode={null} onSelectMode={onSelectMode} />)
    fireEvent.click(screen.getByRole('button', { name: /morning/i }))
    expect(onSelectMode).toHaveBeenCalledWith('morning')
  })

  it('shows "Now" pill when override is active', () => {
    render(<WallRhythmBar currentMode="morning" overrideMode="morning" onSelectMode={() => {}} />)
    expect(screen.getByRole('button', { name: /^now$/i })).toBeInTheDocument()
  })

  it('Now pill clears override on tap', () => {
    const onSelectMode = vi.fn()
    render(<WallRhythmBar currentMode="morning" overrideMode="morning" onSelectMode={onSelectMode} />)
    fireEvent.click(screen.getByRole('button', { name: /^now$/i }))
    expect(onSelectMode).toHaveBeenCalledWith(null)
  })
})
