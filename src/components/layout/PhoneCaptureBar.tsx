import { useState, type ReactNode } from 'react'
import { Plus, ArrowUp } from 'lucide-react'
import { MOBILE_TAB_BAR_HEIGHT } from '@/shell/mobileChrome'
import { useKeyboardInset, useTextEntryActive } from '@/hooks/useKeyboardInset'

/**
 * The phone's floating capture bar (native QuickCaptureBar): one white field
 * resting just above the dock on Today and Inbox. While typing it rides on the
 * keyboard, and the dock steps aside.
 *
 * It renders a spacer in the page flow as well, so the last card can always
 * scroll clear of the bar — the bar must never cover work (mockup review,
 * 2026-09-23).
 */
export function PhoneCaptureBar({ children }: { children: ReactNode }) {
  const keyboard = useKeyboardInset()
  const typing = useTextEntryActive()
  // With the keyboard up the dock is hidden, so the bar sits on the keyboard.
  const bottom = keyboard > 0 || typing
    ? `${keyboard + 8}px`
    : `calc(${MOBILE_TAB_BAR_HEIGHT} + env(safe-area-inset-bottom, 0px) + 8px)`
  return (
    <>
      <div aria-hidden className="phone-capture-spacer" />
      <div className="phone-capture-bar" style={{ bottom }}>
        {children}
      </div>
    </>
  )
}

/**
 * The plain form of the bar: type, press return (or the arrow), and the text
 * is captured. Used where there is no day to add to — the Inbox.
 */
export function PhoneCaptureField({
  placeholder,
  onSubmit,
}: {
  placeholder: string
  onSubmit: (text: string) => void
}) {
  const [value, setValue] = useState('')
  const submit = () => {
    const text = value.trim()
    if (!text) return
    onSubmit(text)
    setValue('')
  }
  return (
    <form
      className="phone-capture-field"
      onSubmit={(e) => { e.preventDefault(); submit() }}
    >
      <Plus className="h-5 w-5 shrink-0 text-neutral-400" aria-hidden="true" />
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder.replace(/…$/, '')}
        enterKeyHint="done"
        className="min-w-0 flex-1 bg-transparent text-[16px] text-neutral-900 outline-none placeholder:text-neutral-500"
      />
      {value.trim() && (
        <button type="submit" aria-label="Add" className="phone-capture-send">
          <ArrowUp className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </form>
  )
}
