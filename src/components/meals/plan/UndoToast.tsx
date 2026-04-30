import { useEffect, useState } from 'react'
import { useGeneratePlanContext } from '@/contexts/GeneratePlanContext'
import { useGeneratePlan } from '@/hooks/useGeneratePlan'
import { useMealPlan } from '@/hooks/useMealPlan'
import { mondayOfWeek } from '@/lib/weekHelpers'

const VISIBLE_MS = 30_000

export function UndoToast() {
  const { lastUndoToken, setLastUndoToken } = useGeneratePlanContext()
  const { undo } = useGeneratePlan()
  const { refresh } = useMealPlan(mondayOfWeek(new Date()))
  const [busy, setBusy] = useState(false)
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    if (!lastUndoToken) return
    setHidden(false)
    const t = setTimeout(() => setHidden(true), VISIBLE_MS)
    return () => clearTimeout(t)
  }, [lastUndoToken?.id])

  if (!lastUndoToken || hidden) return null

  const onUndo = async () => {
    if (!lastUndoToken) return
    setBusy(true)
    const r = await undo(lastUndoToken.id)
    setBusy(false)
    if (r.ok) {
      setLastUndoToken(null)
      await refresh()
    }
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-sm rounded-2xl border border-neutral-200 bg-bg-elevated shadow-card px-5 py-3 flex items-center gap-3">
      <span className="font-display italic text-[14px] text-neutral-700">
        Plan drafted from your brief.
      </span>
      <button
        onClick={onUndo}
        disabled={busy}
        className="text-[12px] font-medium text-primary-500 hover:text-primary-600 disabled:opacity-40"
      >
        {busy ? '…' : '↶ Undo'}
      </button>
      <button
        onClick={() => setHidden(true)}
        aria-label="Dismiss"
        className="text-neutral-400 hover:text-neutral-600 text-[14px]"
      >
        ×
      </button>
    </div>
  )
}
