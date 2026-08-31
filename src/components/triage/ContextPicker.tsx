import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { TaskContext } from '@/types/task'
import { ContextMenuPanel, CONTEXTS } from './ContextMenuPanel'

interface ContextPickerProps {
  value?: TaskContext | null
  onChange: (context: TaskContext | undefined) => void
  /**
   * 'sm' = 28px box, sized to a Today action-rail cell. 'md' (default) = 36px,
   * which is every other call site — inbox cards, the bulk action bar. Opt-in
   * so shrinking the rail can't quietly shrink them too.
   */
  size?: 'sm' | 'md'
}

export function ContextPicker({ value, onChange, size = 'md' }: ContextPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState<{ top?: number; bottom?: number; right: number }>({ top: 0, right: 0 })
  const triggerRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Calculate menu position when opening. Flip the menu ABOVE the trigger when
  // there isn't room below (e.g. this picker lives in the bottom-fixed bulk
  // action bar, where opening downward gets clipped by the viewport edge).
  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom
      const openUp = spaceBelow < 220
      setMenuPosition({
        top: openUp ? undefined : rect.bottom + 4,
        bottom: openUp ? window.innerHeight - rect.top + 4 : undefined,
        right: window.innerWidth - rect.right,
      })
    }
  }, [isOpen])

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      const target = event.target as Node
      if (
        triggerRef.current && !triggerRef.current.contains(target) &&
        menuRef.current && !menuRef.current.contains(target)
      ) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('touchstart', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
        document.removeEventListener('touchstart', handleClickOutside)
      }
    }
  }, [isOpen])

  const handleSelect = (ctx: TaskContext | undefined) => {
    onChange(ctx)
    setIsOpen(false)
  }

  const hasValue = value != null
  const selectedContext = CONTEXTS.find(ctx => ctx.value === value)

  // Map context colors to match domain switcher
  const contextStyles = {
    work: { color: 'rgb(37 99 235)' },      // Blue-600
    family: { color: 'rgb(217 119 6)' },    // Amber-600
    personal: { color: 'rgb(147 51 234)' }, // Purple-600
  }

  const isSmall = size === 'sm'
  const padClass = isSmall ? 'p-1.5' : 'p-2'
  const iconClass = isSmall ? 'w-4 h-4' : 'w-5 h-5'

  const menuContent = isOpen ? (
    <div
      ref={menuRef}
      onClick={(e) => e.stopPropagation()}
      className="fixed z-[9999] bg-white rounded-xl border border-neutral-200 shadow-lg p-2 min-w-[120px] animate-fade-in-up"
      style={{
        top: menuPosition.top,
        bottom: menuPosition.bottom,
        right: menuPosition.right,
      }}
    >
      <ContextMenuPanel value={value} onSelect={handleSelect} />
    </div>
  ) : null

  return (
    <div ref={triggerRef} className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen) }}
        className={`${padClass} rounded-lg transition-colors hover:bg-neutral-100 ${hasValue ? '' : 'tag-needs-context'}`}
        aria-label="Set context"
        title={hasValue ? undefined : 'Untagged — tap to set Work / Family / Personal'}
      >
        <svg
          className={`${iconClass} transition-colors`}
          fill={selectedContext ? 'currentColor' : 'none'}
          stroke={selectedContext ? undefined : 'currentColor'}
          strokeWidth={selectedContext ? undefined : 2}
          viewBox="0 0 24 24"
          style={selectedContext ? contextStyles[selectedContext.value as keyof typeof contextStyles] : { color: 'rgb(163 163 163)' }}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
        </svg>
      </button>
      {menuContent && createPortal(menuContent, document.body)}
    </div>
  )
}
