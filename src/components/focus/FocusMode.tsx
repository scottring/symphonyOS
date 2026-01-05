import { useState, useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { getTimeOfDay, type TimeOfDay } from '@/lib/timeUtils'

interface FocusModeProps {
  isOpen: boolean
  onClose: () => void
}

const SCRATCH_PAD_KEY = 'symphony-focus-scratch-pad'
const SCRATCH_PAD_DATE_KEY = 'symphony-focus-scratch-pad-date'

function getStoredScratchPad(): string {
  const stored = localStorage.getItem(SCRATCH_PAD_KEY)
  const storedDate = localStorage.getItem(SCRATCH_PAD_DATE_KEY)
  const today = new Date().toDateString()

  if (storedDate !== today) {
    localStorage.removeItem(SCRATCH_PAD_KEY)
    localStorage.setItem(SCRATCH_PAD_DATE_KEY, today)
    return ''
  }

  return stored || ''
}

const TIME_LABELS: Record<TimeOfDay, string> = {
  morning: 'This Morning',
  afternoon: 'This Afternoon',
  evening: 'This Evening',
}

export const FOCUS_PANEL_WIDTH = 420

export function FocusMode({ isOpen, onClose }: FocusModeProps) {
  const [scratchPad, setScratchPad] = useState(getStoredScratchPad)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const timeOfDay = getTimeOfDay(new Date())

  // Persist scratch pad
  useEffect(() => {
    localStorage.setItem(SCRATCH_PAD_KEY, scratchPad)
    localStorage.setItem(SCRATCH_PAD_DATE_KEY, new Date().toDateString())
  }, [scratchPad])

  // Focus textarea when opened
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 150)
    }
  }, [isOpen])

  // Escape to close
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      className="fixed z-50 flex flex-col overflow-hidden"
      style={{
        top: '16px',
        bottom: '16px',
        right: '16px',
        width: `${FOCUS_PANEL_WIDTH}px`,
        maxWidth: '95vw',
        borderRadius: '24px',
        background: 'linear-gradient(180deg, hsl(45 30% 97%) 0%, hsl(43 25% 95%) 100%)',
        boxShadow: `
          0 0 0 1px hsl(38 20% 88% / 0.5),
          0 24px 80px -12px hsl(25 30% 20% / 0.25),
          0 12px 40px -8px hsl(25 30% 20% / 0.15)
        `,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-8 pt-8 pb-6">
        <div>
          <h1 className="font-display text-3xl text-neutral-900 mb-1">
            Scratch Pad
          </h1>
          <p className="text-neutral-500">{TIME_LABELS[timeOfDay]}</p>
        </div>
        <button
          onClick={onClose}
          className="p-3 -mr-1 rounded-xl text-neutral-400 hover:text-neutral-600 hover:bg-white/60 transition-all"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Scratch pad area */}
      <div className="flex-1 px-8 pb-8 min-h-0 flex flex-col">
        <div
          className="flex-1 rounded-2xl overflow-hidden"
          style={{
            background: 'hsl(48 40% 99%)',
            boxShadow: `
              inset 0 2px 8px hsl(25 20% 20% / 0.03),
              0 0 0 1px hsl(38 20% 85% / 0.5)
            `,
          }}
        >
          <textarea
            ref={textareaRef}
            value={scratchPad}
            onChange={(e) => setScratchPad(e.target.value)}
            placeholder="Write your thoughts here..."
            className="
              w-full h-full p-6 resize-none
              bg-transparent
              text-lg text-neutral-800
              placeholder:text-neutral-300
              focus:outline-none
              leading-relaxed
            "
          />
        </div>

        {/* Footer row */}
        <div className="flex items-center justify-between mt-4">
          <span className="text-sm text-neutral-400">
            {scratchPad ? `${scratchPad.length} characters` : ''}
          </span>
          {scratchPad && (
            <button
              onClick={() => setScratchPad('')}
              className="text-sm text-neutral-400 hover:text-neutral-600 transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
