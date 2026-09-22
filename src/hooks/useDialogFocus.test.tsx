import { describe, it, expect, vi } from 'vitest'
import { useRef, useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { useDialogFocus } from './useDialogFocus'
import { useEscapeKey } from './useEscapeKey'

function Sheet({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useDialogFocus(true, ref, onClose)
  return <div ref={ref} role="dialog" aria-label="Sheet"><button>First</button><input aria-label="Note" /></div>
}

function Host({ onPanelEscape }: { onPanelEscape: () => void }) {
  useEscapeKey(true, onPanelEscape)
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>Open sheet</button>
      {open && <Sheet onClose={() => setOpen(false)} />}
    </>
  )
}

describe('useDialogFocus', () => {
  it('focuses inside, closes on Escape without closing the panel beneath, and restores focus', () => {
    const onPanelEscape = vi.fn()
    render(<Host onPanelEscape={onPanelEscape} />)
    const opener = screen.getByRole('button', { name: 'Open sheet' })
    opener.focus()
    fireEvent.click(opener)
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus()
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(onPanelEscape).not.toHaveBeenCalled()
    expect(opener).toHaveFocus()
  })

  it('the first Escape from a text field only leaves the field', () => {
    const onClose = vi.fn()
    render(<Sheet onClose={onClose} />)
    const note = screen.getByRole('textbox', { name: 'Note' })
    note.focus()
    fireEvent.keyDown(note, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
    expect(note).not.toHaveFocus()
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })
})
