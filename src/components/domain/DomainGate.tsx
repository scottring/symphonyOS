import { useDialogFocus } from '@/hooks/useDialogFocus'
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Task } from '@/types/task'
import type { DomainId } from '@/lib/domains'
import { DomainChooser } from './DomainChooser'

// Iris's rule: any process on an Unsorted item has to involve giving it a
// domain. This provider is the single place that rule is enforced — every
// process (schedule, bucket, assign, project, push, bulk-tag) that would
// touch a `context == null` task calls `requireDomain(task)` first via
// useGatedTaskActions. It resolves immediately when the task is already
// tagged; otherwise it opens this modal and resolves the user's pick (or
// null on cancel).

type Pending = { task: Pick<Task, 'id' | 'title' | 'context'>; resolve: (d: DomainId | null) => void }
const Ctx = createContext<{ requireDomain: (t: Pick<Task, 'id' | 'title' | 'context'>) => Promise<DomainId | null> } | null>(null)

export function DomainGateProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null)
  const pendingRef = useRef<Pending | null>(null)
  const requireDomain = useCallback((task: Pick<Task, 'id' | 'title' | 'context'>) => {
    if (task.context) return Promise.resolve(task.context as DomainId)
    pendingRef.current?.resolve(null) // a second ask cancels the first
    return new Promise<DomainId | null>((resolve) => {
      const p = { task, resolve }
      pendingRef.current = p
      setPending(p)
    })
  }, [])
  const settle = useCallback((d: DomainId | null) => {
    pendingRef.current = null
    setPending((prev) => { prev?.resolve(d); return null })
  }, [])
  // Focus moves into the portalled dialog (it used to stay on the trigger) and
  // Escape cancels — consumed, so the detail panel underneath stays open.
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancel = useCallback(() => settle(null), [settle])
  useDialogFocus(!!pending, dialogRef, cancel)
  const value = useMemo(() => ({ requireDomain }), [requireDomain])
  return (
    <Ctx.Provider value={value}>
      {children}
      {pending && createPortal(
        <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Which domain?" className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/20"
          onMouseDown={(e) => { if (e.target === e.currentTarget) settle(null) }}>
          <div className="card p-5 max-w-sm w-[92vw]">
            <p className="text-sm text-neutral-500">Where does this belong?</p>
            <p className="font-display text-lg mt-1 truncate">{pending.task.title}</p>
            {/* It arrived mid-way through a different choice with no reason
                given (S2-19). The gate only guards a placement, so one
                sentence covers every caller: why it asks, and what each
                answer shares. The placement waits and lands once answered. */}
            <p className="mt-1 mb-4 text-[13px] text-neutral-500">It needs a life area before it can be planned — then it goes where you chose. Family is shared with your household; Personal and Work stay private.</p>
            <DomainChooser onChoose={settle} />
            <button type="button" onClick={() => settle(null)} className="mt-4 text-xs text-neutral-500 hover:text-neutral-800">Cancel</button>
          </div>
        </div>, document.body)}
    </Ctx.Provider>
  )
}

export function useDomainGate() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useDomainGate must be used within DomainGateProvider')
  return ctx
}
