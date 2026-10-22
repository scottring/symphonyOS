import { useState, type ReactNode } from 'react'
import { OPTION_STATUSES, STATUS_LABEL, type OptionStatus } from '@/types/choice'

/** A small dropdown: a trigger and a list of items. Tapping outside closes it. */
export function PopMenu({ label, trigger, items, className }: {
  label?: string
  trigger: ReactNode
  items: { label: string; onPick: () => void; current?: boolean; danger?: boolean }[]
  className?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <span className="relative inline-block">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={className ?? 'text-neutral-500 hover:text-neutral-700'}
      >
        {trigger}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
          <ul role="menu" className="absolute right-0 z-[61] mt-1 min-w-[140px] rounded-lg border border-neutral-200 bg-white py-1 text-left shadow-lg">
            {items.map((it) => (
              <li key={it.label} role="none">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => { setOpen(false); it.onPick() }}
                  className={`block w-full px-3 py-1.5 text-left text-[13px] hover:bg-neutral-50 ${
                    it.danger ? 'text-red-600' : it.current ? 'font-semibold text-neutral-900' : 'text-neutral-700'
                  }`}
                >
                  {it.label}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </span>
  )
}

export function StatusMenu({ status, onPick }: { status: OptionStatus; onPick: (s: OptionStatus) => void }) {
  return (
    <PopMenu
      trigger="Status ▾"
      items={OPTION_STATUSES.map((s) => ({ label: STATUS_LABEL[s], current: s === status, onPick: () => { if (s !== status) onPick(s) } }))}
    />
  )
}
