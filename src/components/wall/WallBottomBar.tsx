import { useState, useRef, useCallback, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

// ─── Quick Capture (Mic Button) ───
// Kid protection: 2-second hold to activate, not a simple tap

interface WallQuickCaptureProps {
  onTaskAdded?: () => void
}

function WallQuickCapture({ onTaskAdded }: WallQuickCaptureProps) {
  const [isActivating, setIsActivating] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [flash, setFlash] = useState(false)
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handlePointerDown = useCallback(() => {
    if (isOpen) return
    setIsActivating(true)
    holdTimerRef.current = setTimeout(() => {
      setIsActivating(false)
      setIsOpen(true)
    }, 2000) // 2-second hold required
  }, [isOpen])

  const handlePointerCancel = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current)
      holdTimerRef.current = null
    }
    setIsActivating(false)
  }, [])

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  const handleSubmit = useCallback(async () => {
    const title = inputValue.trim()
    if (!title || submitting) return

    setSubmitting(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      await supabase.from('tasks').insert({
        title,
        user_id: user.id,
        completed: false,
        // No scheduled_for → goes to inbox
      })

      setFlash(true)
      setTimeout(() => setFlash(false), 600)
      setInputValue('')
      setIsOpen(false)
      onTaskAdded?.()
    } finally {
      setSubmitting(false)
    }
  }, [inputValue, submitting, onTaskAdded])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    } else if (e.key === 'Escape') {
      setIsOpen(false)
      setInputValue('')
    }
  }, [handleSubmit])

  return (
    <div className="flex items-center gap-4">
      {/* Mic button */}
      <button
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerCancel}
        onPointerLeave={handlePointerCancel}
        onPointerCancel={handlePointerCancel}
        className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-300 select-none relative overflow-hidden ${
          isOpen ? 'bg-[#6DC4A7] shadow-lg shadow-[#6DC4A7]/30' :
          flash ? 'bg-[#6DC4A7] scale-110' :
          'bg-white/8 border border-white/10 hover:bg-white/12'
        }`}
        style={{ touchAction: 'none' }}
      >
        {/* Hold fill ring */}
        {isActivating && (
          <div className="absolute inset-0 bg-[#6DC4A7]/40 origin-bottom scale-y-0 animate-[fillUp_2s_linear_forwards] pointer-events-none" />
        )}
        <span className="text-[1.8rem] relative z-10">
          {isOpen ? '✏️' : '🎤'}
        </span>
      </button>

      {/* Inline input (slides open) */}
      {isOpen && (
        <div className="flex items-center gap-3 bg-white/8 border border-white/10 rounded-2xl px-4 py-3 backdrop-blur-sm animate-[slideIn_200ms_ease-out]">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add a task..."
            className="bg-transparent text-white text-[1.1rem] font-bold placeholder:text-white/30 outline-none w-[280px]"
            autoComplete="off"
          />
          <button
            onClick={handleSubmit}
            disabled={!inputValue.trim() || submitting}
            className="text-[1.4rem] opacity-60 hover:opacity-100 transition-opacity disabled:opacity-20"
          >
            ✅
          </button>
          <button
            onClick={() => { setIsOpen(false); setInputValue('') }}
            className="text-[1.2rem] opacity-40 hover:opacity-80 transition-opacity"
          >
            ✕
          </button>
        </div>
      )}

      {!isOpen && (
        <span className="text-[0.75rem] font-bold text-white/25 uppercase tracking-widest">
          Hold 2s to capture
        </span>
      )}
    </div>
  )
}


// ─── Family Mood Meter ───
// Kid protection: double-tap to unlock, auto-locks after 5s idle

const MOOD_LEVELS = [
  { emoji: '😤', label: 'Rough', color: '#F26E63' },
  { emoji: '😐', label: 'Meh', color: '#F9C35C' },
  { emoji: '😊', label: 'Good', color: '#A8D5BA' },
  { emoji: '😄', label: 'Great', color: '#6DC4A7' },
  { emoji: '🤩', label: 'Amazing', color: '#34D399' },
]

const MOOD_STORAGE_KEY = 'symphony-wall-family-mood'
const MOOD_DATE_KEY = 'symphony-wall-family-mood-date'

function getSavedMood(): number {
  const savedDate = localStorage.getItem(MOOD_DATE_KEY)
  const today = new Date().toDateString()
  // Reset mood each day
  if (savedDate !== today) {
    localStorage.setItem(MOOD_DATE_KEY, today)
    localStorage.setItem(MOOD_STORAGE_KEY, '2') // Default to "Good"
    return 2
  }
  const saved = localStorage.getItem(MOOD_STORAGE_KEY)
  return saved !== null ? parseInt(saved, 10) : 2
}

function WallMoodMeter() {
  const [moodIndex, setMoodIndex] = useState(getSavedMood)
  const [unlocked, setUnlocked] = useState(false)
  const tapCountRef = useRef(0)
  const tapTimerRef = useRef<NodeJS.Timeout | null>(null)
  const lockTimerRef = useRef<NodeJS.Timeout | null>(null)

  const mood = MOOD_LEVELS[moodIndex]

  // Double-tap to unlock
  const handleUnlockTap = useCallback(() => {
    if (unlocked) return

    tapCountRef.current += 1
    if (tapCountRef.current >= 2) {
      setUnlocked(true)
      tapCountRef.current = 0
    }

    // Reset tap count after 500ms
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current)
    tapTimerRef.current = setTimeout(() => { tapCountRef.current = 0 }, 500)
  }, [unlocked])

  // Auto-lock after 5s of no interaction
  const resetLockTimer = useCallback(() => {
    if (lockTimerRef.current) clearTimeout(lockTimerRef.current)
    lockTimerRef.current = setTimeout(() => setUnlocked(false), 5000)
  }, [])

  const handleMoodSelect = useCallback((index: number) => {
    if (!unlocked) return
    setMoodIndex(index)
    localStorage.setItem(MOOD_STORAGE_KEY, String(index))
    localStorage.setItem(MOOD_DATE_KEY, new Date().toDateString())
    resetLockTimer()
  }, [unlocked, resetLockTimer])

  // Start lock timer when unlocked
  useEffect(() => {
    if (unlocked) resetLockTimer()
    return () => { if (lockTimerRef.current) clearTimeout(lockTimerRef.current) }
  }, [unlocked, resetLockTimer])

  return (
    <div className="flex items-center gap-4">
      {/* Current mood display (tap target for unlock) */}
      <button
        onClick={handleUnlockTap}
        className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-300 select-none ${
          unlocked ? 'bg-white/12 border-2 border-white/30 scale-105' : 'bg-white/8 border border-white/10'
        }`}
        style={{ touchAction: 'none' }}
      >
        <span className="text-[2rem]">{mood.emoji}</span>
      </button>

      {/* Mood selector (visible when unlocked) */}
      {unlocked ? (
        <div className="flex items-center gap-2 bg-white/6 rounded-2xl px-3 py-2 border border-white/10 animate-[slideIn_200ms_ease-out]">
          {MOOD_LEVELS.map((level, i) => (
            <button
              key={i}
              onClick={() => handleMoodSelect(i)}
              className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200 select-none ${
                i === moodIndex
                  ? 'scale-110 shadow-lg'
                  : 'opacity-50 hover:opacity-80'
              }`}
              style={i === moodIndex ? { backgroundColor: level.color + '40', boxShadow: `0 0 12px ${level.color}40` } : {}}
            >
              <span className="text-[1.4rem]">{level.emoji}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-col">
          <span className="text-[0.95rem] font-bold text-white/60">{mood.label}</span>
          <span className="text-[0.65rem] font-bold text-white/25 uppercase tracking-widest">
            Double-tap to change
          </span>
        </div>
      )}
    </div>
  )
}


// ─── Bottom Bar Container ───

interface WallBottomBarProps {
  onTaskAdded?: () => void
}

export function WallBottomBar({ onTaskAdded }: WallBottomBarProps) {
  return (
    <div className="flex items-center justify-between w-full gap-8">
      <WallQuickCapture onTaskAdded={onTaskAdded} />
      <WallMoodMeter />
    </div>
  )
}
