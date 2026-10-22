import { useEffect, useId, type ReactNode } from 'react'

/** The centered sheet the comparison page's editors open in. Escape or the
 *  backdrop closes it. */
export function DialogFrame({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const id = useId()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <>
      <div className="fixed inset-0 z-[70] bg-black/30" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        className="fixed left-1/2 top-1/2 z-[70] flex max-h-[85vh] w-[calc(100%-24px)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col overflow-y-auto rounded-2xl bg-bg-elevated p-5 shadow-xl"
      >
        <h2 id={id} className="mb-3 font-display text-lg text-neutral-900">{title}</h2>
        {children}
      </div>
    </>
  )
}

export const inputClass =
  'w-full rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-800 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-500'
export const primaryButton =
  'rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50'
export const quietButton = 'px-2 py-1.5 text-sm font-medium text-neutral-500 hover:text-neutral-700'
export const linkButton = 'text-[13px] text-primary-600 hover:text-primary-700'
