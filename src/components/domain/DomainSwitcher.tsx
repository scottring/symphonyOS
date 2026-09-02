import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Check, Layers } from 'lucide-react'
import { useDomain } from '@/hooks/useDomain'
import { DOMAINS, UNSORTED, UNSORTED_ICON, LAYER_LABELS, type Layer } from '@/lib/domains'

// Why this is a click-to-open menu and not a hover-to-fan strip:
// the strip used to live in flow and grow 51px → 189px on hover. That widened
// the header's right-hand cluster past the row, the wrapping flex row dropped
// it to a second line, and the control teleported ~475px away from the cursor
// that had just opened it — firing mouseleave, collapsing, snapping back, and
// repeating. The other domains were pointer-events:none while collapsed, so a
// click could never land on one. Anything that changes this control's own
// layout footprint on open will bring that back; the menu is portalled for
// exactly that reason.

const ROWS: { id: Layer; label: string; icon: typeof Layers; color: string }[] = [
  ...DOMAINS.map((d) => ({ id: d.id as Layer, label: d.label, icon: d.icon, color: d.color })),
  { id: UNSORTED, label: LAYER_LABELS.unsorted, icon: UNSORTED_ICON, color: 'rgb(115 115 115)' },
]

function triggerLabel(layers: ReadonlySet<Layer>): string {
  if (ROWS.every((r) => layers.has(r.id))) return 'All'
  return ROWS.filter((r) => layers.has(r.id)).map((r) => r.label).join(', ')
}

export function DomainSwitcher() {
  const { layers, toggle, only, all } = useDomain()
  const [isOpen, setIsOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState<{ top?: number; bottom?: number; right: number }>({ top: 0, right: 0 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

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

  const label = triggerLabel(layers)
  const checked = ROWS.filter((r) => layers.has(r.id))
  const isAll = label === 'All'

  const menu = isOpen ? (
    <div
      ref={menuRef}
      role="menu"
      className="fixed z-[9999] bg-white rounded-xl border border-neutral-200 shadow-lg p-2 min-w-[200px] animate-fade-in-up"
      style={{ top: menuPosition.top, bottom: menuPosition.bottom, right: menuPosition.right }}
    >
      <div className="space-y-0.5">
        {ROWS.map(({ id, label, icon: Icon, color }) => {
          const on = layers.has(id)
          const last = on && layers.size === 1
          return (
            <div key={id} className="group flex items-center gap-1">
              <button
                role="menuitemcheckbox"
                aria-checked={on}
                disabled={last}
                onClick={() => toggle(id)}
                className={`flex-1 px-3 py-2 text-sm text-left rounded-lg flex items-center gap-2.5 transition-colors ${on ? 'text-neutral-800' : 'text-neutral-400'} hover:bg-neutral-50 disabled:cursor-default`}
              >
                <span
                  className={`w-4 h-4 rounded border flex items-center justify-center ${on ? 'border-transparent' : 'border-neutral-300'}`}
                  style={on ? { background: color } : undefined}
                >
                  {on && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                </span>
                <Icon className="w-4 h-4 shrink-0" style={{ color: on ? color : undefined }} />
                <span className="flex-1">{label}</span>
              </button>
              <button
                type="button"
                aria-label={`Only ${label}`}
                onClick={() => only(id)}
                // Hover-revealed on desktop; always visible where there is no hover (touch).
                className="px-2 py-1 text-[11px] text-neutral-500 rounded opacity-0 group-hover:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-100 hover:bg-neutral-100"
              >
                Only
              </button>
            </div>
          )
        })}
      </div>
      <div className="mt-1 pt-1 border-t border-neutral-100">
        <button
          type="button"
          onClick={all}
          disabled={isAll}
          className="w-full px-3 py-1.5 text-xs text-left text-neutral-600 rounded-lg hover:bg-neutral-50 disabled:opacity-40"
        >
          All
        </button>
      </div>
    </div>
  ) : null

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={`Layers: ${label}`}
        title={`Layers: ${label}`}
        className={`inline-flex items-center gap-1.5 px-3 py-2.5 rounded-lg bg-bg-elevated/90 backdrop-blur-sm border transition-colors ${isOpen ? 'border-primary-300 bg-neutral-50' : 'border-neutral-200 hover:bg-neutral-50/50'}`}
        style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.4)' }}
      >
        {isAll ? (
          <Layers className="w-[18px] h-[18px] text-neutral-700" strokeWidth={2.25} />
        ) : checked.length === 1 ? (
          (() => {
            const Icon = checked[0].icon
            return <Icon className="w-[18px] h-[18px]" style={{ color: checked[0].color }} strokeWidth={2.5} />
          })()
        ) : (
          <span className="flex items-center -space-x-1">
            {checked.map((r) => (
              <span key={r.id} className="w-2.5 h-2.5 rounded-full ring-2 ring-white" style={{ background: r.color }} />
            ))}
          </span>
        )}
      </button>
      {menu && createPortal(menu, document.body)}
    </>
  )
}
