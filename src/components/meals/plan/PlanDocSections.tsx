import { useState } from 'react'

interface CollapseProps {
  title: string
  count?: number
  initialOpen?: boolean
  children: React.ReactNode
}

/** Collapsible section header used by the doc-shape plan view (surface 3). */
export function CollapseSection({ title, count, initialOpen = false, children }: CollapseProps) {
  const [open, setOpen] = useState(initialOpen)
  return (
    <section className="mb-4 border-b border-neutral-100 pb-4 last:border-b-0">
      <button onClick={() => setOpen(o => !o)}
              aria-expanded={open}
              className="w-full flex items-center gap-2 text-left">
        <span className={`text-neutral-400 transition-transform ${open ? 'rotate-90' : ''}`}>▸</span>
        <span className="font-display text-[1.2rem] text-neutral-800">{title}</span>
        {count !== undefined && (
          <span className="font-display italic text-[0.95rem] text-neutral-400">({count})</span>
        )}
      </button>
      {open && <div className="mt-3 pl-5">{children}</div>}
    </section>
  )
}
