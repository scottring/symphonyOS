import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Briefcase, Users, User, Globe, Check } from 'lucide-react'
import { useDomain, type Domain } from '@/hooks/useDomain'

// Why this is a click-to-open menu and not a hover-to-fan strip:
// the strip used to live in flow and grow 51px → 189px on hover. That widened
// the header's right-hand cluster past the row, the wrapping flex row dropped
// it to a second line, and the control teleported ~475px away from the cursor
// that had just opened it — firing mouseleave, collapsing, snapping back, and
// repeating. The other domains were pointer-events:none while collapsed, so a
// click could never land on one. Anything that changes this control's own
// layout footprint on open will bring that back; the menu is portalled for
// exactly that reason.

const DOMAINS = [
  { value: 'universal' as Domain, label: 'Universal', icon: Globe, activeColor: 'text-neutral-800' },
  { value: 'work' as Domain, label: 'Work', icon: Briefcase, activeColor: 'text-blue-700' },
  { value: 'family' as Domain, label: 'Family', icon: Users, activeColor: 'text-amber-700' },
  { value: 'personal' as Domain, label: 'Personal', icon: User, activeColor: 'text-purple-700' },
]

export function DomainSwitcher() {
  const { currentDomain, setDomain } = useDomain()
  const [isOpen, setIsOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState<{ top?: number; bottom?: number; right: number }>({ top: 0, right: 0 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const active = DOMAINS.find((d) => d.value === currentDomain) ?? DOMAINS[0]
  const ActiveIcon = active.icon

  // Anchor to the trigger, flipping above it when there isn't room below.
  useEffect(() => {
    if (!isOpen || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const openUp = window.innerHeight - rect.bottom < 200
    setMenuPosition({
      top: openUp ? undefined : rect.bottom + 6,
      bottom: openUp ? window.innerHeight - rect.top + 6 : undefined,
      right: window.innerWidth - rect.right,
    })
  }, [isOpen])

  // Close on outside click / Escape.
  useEffect(() => {
    if (!isOpen) return
    function handlePointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setIsOpen(false)
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  const menu = isOpen ? (
    <div
      ref={menuRef}
      role="menu"
      className="fixed z-[9999] bg-white rounded-xl border border-neutral-200 shadow-lg p-2 min-w-[168px] animate-fade-in-up"
      style={{ top: menuPosition.top, bottom: menuPosition.bottom, right: menuPosition.right }}
    >
      <div className="space-y-0.5">
        {DOMAINS.map(({ value, label, icon: Icon, activeColor }) => {
          const isActive = value === currentDomain
          return (
            <button
              key={value}
              role="menuitem"
              onClick={() => {
                setDomain(value)
                setIsOpen(false)
              }}
              className={`w-full px-3 py-2 text-sm text-left rounded-lg flex items-center gap-2.5 transition-colors ${
                isActive ? 'bg-primary-50 text-primary-700' : 'hover:bg-neutral-50 text-neutral-700'
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${isActive ? activeColor : 'text-neutral-400'}`} strokeWidth={isActive ? 2.5 : 2} />
              <span className="flex-1">{label}</span>
              {isActive && <Check className="w-3.5 h-3.5 shrink-0 text-primary-600" />}
            </button>
          )
        })}
      </div>
    </div>
  ) : null

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={`Domain: ${active.label}`}
        title={`Domain: ${active.label}`}
        className={`inline-flex items-center justify-center px-3.5 py-2.5 rounded-lg bg-bg-elevated/90 backdrop-blur-sm border transition-colors ${
          isOpen ? 'border-primary-300 bg-neutral-50' : 'border-neutral-200 hover:bg-neutral-50/50'
        } ${active.activeColor}`}
        style={{
          boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.4)',
        }}
      >
        <ActiveIcon className="w-[18px] h-[18px]" strokeWidth={2.5} />
      </button>
      {menu && createPortal(menu, document.body)}
    </>
  )
}
