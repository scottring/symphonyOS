import { useState, useCallback } from 'react'

// ─── Storage ───
const STORAGE_KEY = 'symphony-jax-care'
const JAX_KID_KEY = 'symphony-wall-jax-kid'
const JAX_DATE_KEY = 'symphony-wall-jax-date'

// ─── Weaning schedule ───
const WEAN_START = new Date(2026, 2, 19) // Mar 19, 2026

function getWeanInfo(): { dose: string; phase: string; pct: number } | null {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dayNum = Math.floor((today.getTime() - WEAN_START.getTime()) / 86400000) + 1
  if (dayNum < 1) return null
  const isHalfPhase = dayNum <= 14
  const dose = isHalfPhase ? '½ tab' : '¼ tab'
  const phase = isHalfPhase ? `Day ${dayNum}/14` : `Day ${dayNum - 14} taper`
  const pct = isHalfPhase ? dayNum / 14 : Math.min((dayNum - 14) / 14, 1)
  return { dose, phase, pct }
}

// ─── Care items ───
interface CareItem {
  id: string
  emoji: string
  label: string
}

const CARE_ITEMS: CareItem[] = [
  { id: 'med-am', emoji: '💊', label: 'AM Meds' },
  { id: 'med-pm', emoji: '💊', label: 'PM Meds' },
  { id: 'fed-am', emoji: '🍖', label: 'Breakfast' },
  { id: 'fed-pm', emoji: '🍖', label: 'Dinner' },
  { id: 'bone',   emoji: '🦴', label: 'Bone' },
  { id: 'treat',  emoji: '🦷', label: 'Treat' },
]

function getTodayStr(): string {
  return new Date().toISOString().split('T')[0]
}

type CheckedMap = Record<string, boolean>

function loadChecked(): CheckedMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const data = JSON.parse(raw)
    // Reset if date changed
    if (data.date !== getTodayStr()) return {}
    return data.checked || {}
  } catch { return {} }
}

function saveChecked(checked: CheckedMap) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ date: getTodayStr(), checked }))
}

// ─── Sleep tracker (who had Jax) ───
type Kid = 'ella' | 'kaleb'

function getLastNight(): { kid: Kid; date: string } | null {
  const kid = localStorage.getItem(JAX_KID_KEY) as Kid | null
  const date = localStorage.getItem(JAX_DATE_KEY)
  if (kid && date) return { kid, date }
  return null
}

function formatLastDate(dateStr: string): string {
  const d = new Date(dateStr)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  if (d.toDateString() === today.toDateString()) return 'today'
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return 'last night'
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

// ─── Component ───
export function WallJaxCareWidget() {
  const [checked, setChecked] = useState<CheckedMap>(loadChecked)
  const [lastNight, setLastNight] = useState(getLastNight)
  const wean = getWeanInfo()

  const toggleItem = useCallback((id: string) => {
    setChecked(prev => {
      const next = { ...prev, [id]: !prev[id] }
      saveChecked(next)
      return next
    })
  }, [])

  const setKid = useCallback((kid: Kid) => {
    const today = getTodayStr()
    localStorage.setItem(JAX_KID_KEY, kid)
    localStorage.setItem(JAX_DATE_KEY, today)
    setLastNight({ kid, date: today })
  }, [])

  const tonightKid = lastNight ? (lastNight.kid === 'ella' ? 'kaleb' : 'ella') : null
  const checkedCount = CARE_ITEMS.filter(i => checked[i.id]).length

  return (
    <div className="flex items-center gap-5 w-full">
      {/* Dog icon + sleep info */}
      <div className="flex flex-col items-center flex-shrink-0">
        <div className="text-[2.2rem] mb-0.5">🐕</div>
        {tonightKid ? (
          <div className="text-center">
            <div className="text-[0.6rem] font-black text-white/40 uppercase tracking-widest">Tonight</div>
            <div className="text-[0.75rem] font-black text-white uppercase">{tonightKid}</div>
          </div>
        ) : (
          <div className="text-[0.55rem] font-bold text-white/30 uppercase text-center leading-tight">Who had<br/>Jax?</div>
        )}
        <div className="flex gap-1.5 mt-1.5">
          <button
            onClick={() => setKid('ella')}
            className={`px-2 py-0.5 rounded text-[0.55rem] font-black uppercase tracking-wider select-none ${
              lastNight?.kid === 'ella'
                ? 'bg-pink-500/30 text-pink-300'
                : 'bg-white/6 text-white/30 active:bg-white/15'
            }`}
          >E</button>
          <button
            onClick={() => setKid('kaleb')}
            className={`px-2 py-0.5 rounded text-[0.55rem] font-black uppercase tracking-wider select-none ${
              lastNight?.kid === 'kaleb'
                ? 'bg-blue-500/30 text-blue-300'
                : 'bg-white/6 text-white/30 active:bg-white/15'
            }`}
          >K</button>
        </div>
      </div>

      {/* Divider */}
      <div className="w-px h-14 bg-white/10 flex-shrink-0" />

      {/* Care checklist */}
      <div className="flex gap-2 flex-1 min-w-0">
        {CARE_ITEMS.map(item => {
          const isDone = !!checked[item.id]
          return (
            <button
              key={item.id}
              onClick={() => toggleItem(item.id)}
              className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg transition-all select-none flex-1 min-w-0 ${
                isDone
                  ? 'bg-[#6DC4A7]/20 border border-[#6DC4A7]/30'
                  : 'bg-white/[0.04] border border-white/[0.06] active:bg-white/10'
              }`}
              style={{ touchAction: 'manipulation' }}
            >
              <span className={`text-[1rem] ${isDone ? '' : 'grayscale opacity-50'}`}>
                {isDone ? '✅' : item.emoji}
              </span>
              <span className={`text-[0.5rem] font-black uppercase tracking-wider leading-none ${
                isDone ? 'text-[#6DC4A7]' : 'text-white/40'
              }`}>
                {item.label}
              </span>
            </button>
          )
        })}
      </div>

      {/* Divider */}
      <div className="w-px h-14 bg-white/10 flex-shrink-0" />

      {/* Meds weaning info + progress */}
      <div className="flex flex-col flex-shrink-0" style={{ width: 100 }}>
        {wean ? (
          <>
            <span className="text-[0.5rem] font-black text-white/40 uppercase tracking-widest">Weaning</span>
            <span className="text-[0.9rem] font-black text-white leading-tight">{wean.dose}</span>
            <span className="text-[0.5rem] font-bold text-white/30">{wean.phase}</span>
            <div className="h-1 bg-white/10 rounded-full mt-1 overflow-hidden">
              <div className="h-full bg-[#6DC4A7] rounded-full transition-all" style={{ width: `${wean.pct * 100}%` }} />
            </div>
          </>
        ) : (
          <>
            <span className="text-[0.5rem] font-black text-white/40 uppercase tracking-widest">Care</span>
            <span className="text-[0.9rem] font-black text-white leading-tight">{checkedCount}/{CARE_ITEMS.length}</span>
            <span className="text-[0.5rem] font-bold text-white/30">done today</span>
          </>
        )}
        {lastNight && (
          <span className="text-[0.45rem] font-bold text-white/20 mt-1 uppercase tracking-wider">
            {lastNight.kid} {formatLastDate(lastNight.date)}
          </span>
        )}
      </div>
    </div>
  )
}
