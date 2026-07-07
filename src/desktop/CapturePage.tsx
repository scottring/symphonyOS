// Frameless quick-capture window for the Mac shell (global hotkey ⌘⇧Space).
// Loaded at /capture in a transparent, always-on-top Tauri window that stays
// alive hidden — so keep this page idle-cheap: no task hooks, no subscriptions.
import { useEffect, useRef, useState } from 'react'
import { Inbox } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { desktopEmit, onDesktopEvent } from '@/lib/desktop'
import { insertInboxTask } from './captureInsert'

export function CapturePage() {
  const { user } = useAuth()
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Transparent window chrome: the page background must not paint.
  useEffect(() => {
    document.documentElement.classList.add('capture-window')
    return () => document.documentElement.classList.remove('capture-window')
  }, [])

  // Refocus + reset every time the shell shows the window again.
  useEffect(() => {
    return onDesktopEvent('capture:shown', () => {
      setTitle('')
      inputRef.current?.focus()
    })
  }, [])

  const close = () => desktopEmit('capture:close')

  const submit = async () => {
    const trimmed = title.trim()
    if (!trimmed || !user || saving) return
    setSaving(true)
    const ok = await insertInboxTask(user.id, trimmed)
    setSaving(false)
    if (ok) {
      setTitle('')
      close()
    }
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center p-3">
      <div className="card flex w-full items-center gap-3 rounded-2xl px-5 py-4 shadow-2xl">
        <Inbox className="h-5 w-5 shrink-0 text-neutral-400" aria-hidden />
        {user ? (
          <input
            ref={inputRef}
            autoFocus
            value={title}
            disabled={saving}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit()
              if (e.key === 'Escape') close()
            }}
            placeholder="Add to inbox…"
            className="w-full bg-transparent text-2xl font-display outline-none placeholder:text-neutral-300"
          />
        ) : (
          <p className="text-lg text-neutral-500">Open Symphony and sign in first.</p>
        )}
      </div>
    </div>
  )
}
