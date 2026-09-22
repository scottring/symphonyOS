import { describe, it, expect, vi } from 'vitest'
import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { render, screen, fireEvent } from '@testing-library/react'
import { usePopoverFocus } from './usePopoverFocus'
import { useEscapeKey } from './useEscapeKey'

// A detail panel (useEscapeKey) holding a portalled menu — the shape of
// PanelMoreMenu, DomainSwitcher, RescheduleButton, TaskFateMenu.
function Panel({ onPanelEscape }: { onPanelEscape: () => void }) {
  useEscapeKey(true, onPanelEscape)
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  usePopoverFocus(open, trigger, menu, () => setOpen(false))
  return (
    <>
      <button ref={trigger} onClick={() => setOpen((o) => !o)}>More</button>
      <button>After</button>
      {open && createPortal(
        <div ref={menu} role="menu">
          <button role="menuitem">Pin</button>
          <button role="menuitem">Delete</button>
        </div>,
        document.body,
      )}
    </>
  )
}

describe('usePopoverFocus', () => {
  it('moves focus into a portalled menu and arrows between items', () => {
    render(<Panel onPanelEscape={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    expect(screen.getByRole('menuitem', { name: 'Pin' })).toHaveFocus()
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveFocus()
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
    expect(screen.getByRole('menuitem', { name: 'Pin' })).toHaveFocus()
    fireEvent.keyDown(document.activeElement!, { key: 'End' })
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveFocus()
  })

  it('Escape closes only the menu — the panel stays open — and returns focus to the trigger', () => {
    const onPanelEscape = vi.fn()
    render(<Panel onPanelEscape={onPanelEscape} />)
    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'More' })).toHaveFocus()
    expect(onPanelEscape).not.toHaveBeenCalled()
    // With the menu gone, the next Escape reaches the panel.
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(onPanelEscape).toHaveBeenCalledOnce()
  })

  it('Tab past the last item closes the menu and continues from the trigger', () => {
    render(<Panel onPanelEscape={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    fireEvent.keyDown(document.activeElement!, { key: 'End' })
    fireEvent.keyDown(document.activeElement!, { key: 'Tab' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'More' })).toHaveFocus()
  })
})
