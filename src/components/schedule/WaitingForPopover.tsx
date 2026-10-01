// "Waiting for…" capture — a sentence, not a flag, and a day to check back.
//
// The check-back day moves the task to that day (all-day), so it leaves Today
// now and returns when you said you'd follow up — see lib/today/waiting.ts.
//
// Opens anchored to the row's ellipsis rather than navigating away, so setting a
// wait never costs you your place on Today. Free text on purpose: typing "Guy"
// must not force a contacts lookup.

import { useState, useCallback, useRef, useEffect } from 'react'
import { Hourglass, X, Sparkles, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { CHECK_BACK_CHOICES, checkBackLabel } from '@/lib/today/waiting'

interface Props {
  /** Existing sentence, when editing an already-waiting task. */
  initialValue?: string
  /** Task the wait belongs to — used to ground the AI suggestions. */
  taskId?: string
  /** `checkBack` is undefined when the reader left the date alone. */
  onSave: (waitingFor: string, checkBack?: Date) => void
  /** Clears the wait entirely. Only offered when already waiting. */
  onClear?: () => void
  onCancel: () => void
  /** Render in place (inside another popover) instead of anchored under the
   *  row's ellipsis. */
  inline?: boolean
}

const localYmd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function WaitingForPopover({ initialValue, taskId, onSave, onClear, onCancel, inline = false }: Props) {
  const [value, setValue] = useState(initialValue ?? '')
  const [checkBack, setCheckBack] = useState<Date | undefined>(undefined)
  const [suggestions, setSuggestions] = useState<string[] | null>(null)
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  // Suggestions are grounded in the context bundle (notes, the person it's
  // about, the project, what was already tried) via the suggest-waiting-for
  // edge function. Fetched on demand rather than on open: this bills a model
  // call, and most waits are faster to just type.
  const fetchSuggestions = useCallback(async () => {
    if (!taskId || loadingSuggestions) return
    setLoadingSuggestions(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) { setSuggestions([]); return }
      const { data, error } = await supabase.functions.invoke('suggest-waiting-for', {
        body: { taskId },
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const list = (data as { suggestions?: unknown } | null)?.suggestions
      // Fail quiet in the UI, loud in the console: an empty list renders
      // "nothing to suggest" rather than an error dialog over a field you were
      // about to type into anyway — but a silent failure is undebuggable.
      if (error || !Array.isArray(list)) {
        console.error('[waiting-for] suggest failed', error, data)
      }
      setSuggestions(error || !Array.isArray(list) ? [] : list.filter((s): s is string => typeof s === 'string'))
    } catch (err) {
      console.error('[waiting-for] suggest threw', err)
      setSuggestions([])
    } finally {
      setLoadingSuggestions(false)
    }
  }, [taskId, loadingSuggestions])

  const save = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed) {
      // Empty means "stop waiting" when there was a wait, otherwise a no-op.
      if (onClear) onClear()
      else onCancel()
      return
    }
    onSave(trimmed, checkBack)
  }, [value, checkBack, onSave, onClear, onCancel])

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Enter saves; Shift+Enter allows a longer sentence to wrap.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      save()
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    }
  }, [save, onCancel])

  return (
    <div
      className={inline
        ? 'w-full'
        : 'absolute right-0 top-full mt-1 z-50 w-[min(22rem,calc(100vw-2rem))] p-3 bg-white rounded-xl border border-neutral-200 shadow-lg'}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2 mb-2">
        <Hourglass className="w-3.5 h-3.5 text-amber-500 shrink-0" aria-hidden />
        <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
          Waiting for
        </span>
        <button
          type="button"
          aria-label="Cancel"
          onClick={onCancel}
          className="ml-auto p-0.5 rounded text-neutral-300 hover:text-neutral-600"
        >
          <X className="w-3.5 h-3.5" aria-hidden />
        </button>
      </div>

      <textarea
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        rows={2}
        placeholder="Guy's response on whether they can make pizza Saturday"
        className="w-full resize-none text-sm px-2.5 py-2 rounded-lg border border-neutral-200 focus:border-primary-400 focus:outline-none placeholder:text-neutral-400"
      />

      {/* Grounded suggestions. Tapping one fills the field rather than saving
          outright — the AI proposes, your tap commits (same rule as sharpen-goal). */}
      {taskId && (
        <div className="mt-2">
          {suggestions === null ? (
            <button
              type="button"
              onClick={fetchSuggestions}
              disabled={loadingSuggestions}
              className="inline-flex items-center gap-1.5 text-xs text-primary-700 hover:text-primary-800 disabled:text-neutral-400 transition-colors"
            >
              {loadingSuggestions
                ? <Loader2 className="w-3 h-3 animate-spin" aria-hidden />
                : <Sparkles className="w-3 h-3" aria-hidden />}
              {loadingSuggestions ? 'Thinking…' : 'Suggest what I’m waiting on'}
            </button>
          ) : suggestions.length === 0 ? (
            <p className="text-xs text-neutral-400">Nothing to suggest — type it instead.</p>
          ) : (
            <div className="flex flex-col gap-1">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => { setValue(s); inputRef.current?.focus() }}
                  className="text-left text-xs px-2 py-1.5 rounded-lg bg-primary-50/70 text-primary-800 hover:bg-primary-100 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Check back — when this comes back to Today. Optional: leaving it
          unset keeps the task's date as it is. */}
      <div className="mt-3">
        <div className="text-[11px] uppercase tracking-wider text-neutral-400 mb-1.5">Check back</div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Check back">
          {CHECK_BACK_CHOICES.map((c) => {
            const d = c.date()
            const on = !!checkBack && localYmd(checkBack) === localYmd(d)
            return (
              <button
                key={c.key}
                type="button"
                aria-pressed={on}
                title={checkBackLabel(d)}
                onClick={() => setCheckBack(on ? undefined : d)}
                className={`text-xs px-2.5 py-1.5 rounded-lg transition-colors ${on
                  ? 'bg-primary-600 text-white'
                  : 'bg-neutral-50 text-neutral-700 hover:bg-primary-50 hover:text-primary-700'}`}
              >
                {c.label}
              </button>
            )
          })}
          <input
            type="date"
            aria-label="Check back on"
            value={checkBack && !CHECK_BACK_CHOICES.some((c) => localYmd(c.date()) === localYmd(checkBack)) ? localYmd(checkBack) : ''}
            onChange={(e) => {
              const v = e.target.value
              if (!v) { setCheckBack(undefined); return }
              const [y, m, d] = v.split('-').map(Number)
              setCheckBack(new Date(y, m - 1, d))
            }}
            className="text-xs px-2 py-1 rounded-lg border border-neutral-200 text-neutral-600 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
          />
        </div>
        {checkBack && (
          <p className="mt-1.5 text-[11px] text-neutral-500">Leaves Today and comes back {checkBackLabel(checkBack)}.</p>
        )}
      </div>

      <div className="flex items-center gap-2 mt-3">
        <button
          type="button"
          onClick={save}
          className="text-xs font-medium px-3 py-1.5 rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors"
        >
          Save
        </button>
        {onClear && (
          <button
            type="button"
            onClick={onClear}
            className="text-xs text-neutral-500 hover:text-neutral-800 transition-colors"
          >
            Not waiting anymore
          </button>
        )}
        <span className="ml-auto text-[10px] text-neutral-400">Enter to save</span>
      </div>
    </div>
  )
}
