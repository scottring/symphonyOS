import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PageMenu } from './PageMenu'

function setup(talk?: () => void) {
  const tick = vi.fn(), act = vi.fn()
  render(<PageMenu label="Month options" talk={talk} choices={[
    { id: 'done', label: 'Show done', checked: true, onSelect: tick },
    { id: 'above', label: 'Hide Fall list', onSelect: act },
  ]} />)
  fireEvent.click(screen.getByRole('button', { name: 'Month options' }))
  return { tick, act }
}

describe('PageMenu', () => {
  it('opens on the first choice and shows ticks', () => {
    setup()
    expect(screen.getByRole('menu', { name: 'Month options' })).toBeInTheDocument()
    expect(screen.getByRole('menuitemcheckbox', { name: 'Show done' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('menuitem', { name: 'Hide Fall list' })).toBeInTheDocument()
    expect(screen.getByRole('menuitemcheckbox', { name: 'Show done' })).toHaveFocus()
  })

  it('a tick keeps the menu open; an action closes it', () => {
    const { tick, act } = setup()
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Show done' }))
    expect(tick).toHaveBeenCalled()
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Hide Fall list' }))
    expect(act).toHaveBeenCalled()
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('arrow keys move and wrap; Escape closes and refocuses the button', () => {
    setup()
    const menu = screen.getByRole('menu')
    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(screen.getByRole('menuitem', { name: 'Hide Fall list' })).toHaveFocus()
    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(screen.getByRole('menuitemcheckbox', { name: 'Show done' })).toHaveFocus()
    fireEvent.keyDown(menu, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(screen.getByRole('button', { name: 'Month options' })).toHaveFocus()
  })

  it('a press elsewhere closes it', () => {
    setup()
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('offers Talk it through only when given, and closes on it', () => {
    const talk = vi.fn()
    setup(talk)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Talk it through' }))
    expect(talk).toHaveBeenCalled()
    expect(screen.queryByRole('menu')).toBeNull()
  })
})
