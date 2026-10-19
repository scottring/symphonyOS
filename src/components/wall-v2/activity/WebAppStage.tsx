// A web app from a kid's routine, full screen on the kitchen wall (Scott,
// 2026-10-19: Kaleb's Puzzle Trail for GAL practice). The app runs in a
// frame; when it posts { type: 'symphony:done' } from its own origin, the
// routine that opened it is checked off for today. Touches inside the frame
// never reach the wall, so the idle rule can't see them: the stage holds
// itself open and goes back after APP_STAGE_MAX_MS instead.

import { useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { useActionableInstances } from '@/hooks/useActionableInstances'
import { isAppDone } from '@/lib/wall/activity/wallApps'

export const APP_STAGE_MAX_MS = 45 * 60_000

export function WebAppStage({ url, title, origin, routineId, onClose }: {
  url: string
  title: string
  origin: string
  routineId?: string
  onClose: () => void
}) {
  const { markDone } = useActionableInstances()
  const [checked, setChecked] = useState(false)
  const done = useRef(false)

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (!isAppDone({ origin }, e.origin, e.data) || done.current) return
      done.current = true
      setChecked(true)
      if (routineId) void markDone('routine', routineId, new Date())
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [origin, routineId, markDone])

  useEffect(() => {
    const id = setTimeout(onClose, APP_STAGE_MAX_MS)
    return () => clearTimeout(id)
  }, [onClose])

  return (
    <div className="kc-card kc-fill" style={{ padding: 0, overflow: 'hidden', position: 'relative' }}>
      <iframe
        src={url}
        title={title}
        style={{ border: 0, width: '100%', height: '100%', display: 'block' }}
        allow="autoplay"
        referrerPolicy="no-referrer"
      />
      {checked && routineId && (
        <p className="kc-quiet-line" role="status"
          style={{ position: 'absolute', right: 16, top: 16, display: 'flex', gap: 8, alignItems: 'center', background: 'var(--kc-surface, #fff)', padding: '8px 14px', borderRadius: 999 }}>
          <Check size={18} aria-hidden="true" /> Checked off for today
        </p>
      )}
    </div>
  )
}
