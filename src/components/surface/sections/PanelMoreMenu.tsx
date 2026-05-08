import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { MoreHorizontal, Pin, PinOff, Trash2 } from 'lucide-react'

interface PanelMoreMenuProps {
  isPinned: boolean
  onTogglePin: () => void
  onDelete: () => void
}

export function PanelMoreMenu({ isPinned, onTogglePin, onDelete }: PanelMoreMenuProps) {
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [pos, setPos] = useState({ top: 0, right: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node
      if (!buttonRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false)
        setConfirming(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  function close() {
    setOpen(false)
    setConfirming(false)
  }

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => setOpen(prev => !prev)}
        aria-label="More actions"
        className="px-3 py-1.5 rounded-lg text-sm font-medium bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-colors"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          className="fixed z-[100] bg-white rounded-xl border border-neutral-200 shadow-lg p-1.5 min-w-[170px]"
          style={{ top: pos.top, right: pos.right }}
        >
          <button
            onClick={() => { onTogglePin(); close() }}
            className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm text-neutral-700 hover:bg-neutral-100 transition-colors"
          >
            {isPinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
            <span>{isPinned ? 'Unpin' : 'Pin'}</span>
          </button>
          <div className="border-t border-neutral-100 my-1" />
          {confirming ? (
            <button
              onClick={() => { onDelete(); close() }}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm text-rose-700 bg-rose-50 hover:bg-rose-100 transition-colors font-semibold"
            >
              <Trash2 className="w-4 h-4" />
              <span>Confirm delete</span>
            </button>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm text-rose-600 hover:bg-rose-50 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              <span>Delete</span>
            </button>
          )}
        </div>,
        document.body
      )}
    </>
  )
}
