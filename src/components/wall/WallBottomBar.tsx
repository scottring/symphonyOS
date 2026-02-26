import { useState, useRef, useCallback, useEffect } from 'react'

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

export function WallBottomBar() {
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
        className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-300 select-none ${
          unlocked ? 'bg-white/12 border-2 border-white/30 scale-105' : 'bg-white/8 border border-white/10'
        }`}
        style={{ touchAction: 'none' }}
      >
        <span className="text-[1.8rem]">{mood.emoji}</span>
      </button>

      {/* Mood selector (visible when unlocked) */}
      {unlocked ? (
        <div className="flex items-center gap-2 bg-white/6 rounded-2xl px-3 py-2 border border-white/10 animate-[slideIn_200ms_ease-out]">
          {MOOD_LEVELS.map((level, i) => (
            <button
              key={i}
              onClick={() => handleMoodSelect(i)}
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 select-none ${
                i === moodIndex
                  ? 'scale-110 shadow-lg'
                  : 'opacity-50 hover:opacity-80'
              }`}
              style={i === moodIndex ? { backgroundColor: level.color + '40', boxShadow: `0 0 12px ${level.color}40` } : {}}
            >
              <span className="text-[1.3rem]">{level.emoji}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-col">
          <span className="text-[0.9rem] font-bold text-white/60">{mood.label}</span>
          <span className="text-[0.6rem] font-bold text-white/25 uppercase tracking-widest">
            Double-tap to change
          </span>
        </div>
      )}
    </div>
  )
}
