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
      className="fixed top-0 right-0 h-full z-50 flex flex-col overflow-hidden bg-bg-elevated border-l border-neutral-200/80 shadow-xl"
      style={{ width: `${FOCUS_PANEL_WIDTH}px` }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200/60">
        <div>
          <h2 className="font-medium text-neutral-800">Scratch Pad</h2>
          <p className="text-sm text-neutral-500">{TIME_LABELS[timeOfDay]}</p>
        </div>
        <button
          onClick={onClose}
          className="p-2 -mr-1 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-all"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Scratch pad area */}
      <div className="flex-1 p-6 min-h-0 flex flex-col">
        <div className="flex-1 rounded-xl overflow-hidden bg-white/50 border border-neutral-200/60">
          <textarea
            ref={textareaRef}
            value={scratchPad}
            onChange={(e) => setScratchPad(e.target.value)}
            placeholder="Write your thoughts here..."
            className="
              w-full h-full p-5 resize-none
              bg-transparent
              text-base text-neutral-700
              placeholder:text-neutral-400
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
