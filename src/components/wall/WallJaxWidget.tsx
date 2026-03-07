import { useState, useCallback } from 'react'

const JAX_KID_KEY = 'symphony-wall-jax-kid'
const JAX_DATE_KEY = 'symphony-wall-jax-date'

type Kid = 'ella' | 'kaleb'

function getLastNight(): { kid: Kid; date: string } | null {
  const kid = localStorage.getItem(JAX_KID_KEY) as Kid | null
  const date = localStorage.getItem(JAX_DATE_KEY)
  if (kid && date) return { kid, date }
  return null
}

function getTonightKid(lastKid: Kid): Kid {
  return lastKid === 'ella' ? 'kaleb' : 'ella'
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  if (d.toDateString() === today.toDateString()) return 'today'
  if (d.toDateString() === yesterday.toDateString()) return 'last night'

  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export function WallJaxWidget() {
  const [lastNight, setLastNight] = useState(getLastNight)

  const setKid = useCallback((kid: Kid) => {
    const today = new Date().toISOString().split('T')[0]
    localStorage.setItem(JAX_KID_KEY, kid)
    localStorage.setItem(JAX_DATE_KEY, today)
    setLastNight({ kid, date: today })
  }, [])

  const tonightKid = lastNight ? getTonightKid(lastNight.kid) : null

  return (
    <div className="flex items-center gap-4">
      <div className="text-[2.2rem]">🐕</div>

      {tonightKid ? (
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="text-[1.1rem] font-black text-white uppercase tracking-wider">
              Tonight: {tonightKid}
            </span>
          </div>
          <span className="text-[0.7rem] font-bold text-white/25 uppercase tracking-widest">
            {lastNight!.kid} had Jax {formatDate(lastNight!.date)}
          </span>
        </div>
      ) : (
        <div className="flex flex-col">
          <span className="text-[0.85rem] font-bold text-white/50">Who had Jax last night?</span>
        </div>
      )}

      {/* Tap to set / correct — 80px+ touch targets */}
      <div className="flex gap-3 ml-auto">
        <button
          onClick={() => setKid('ella')}
          className={`px-5 py-3 rounded-xl text-[0.85rem] font-black uppercase tracking-wider transition-all select-none ${
            lastNight?.kid === 'ella'
              ? 'bg-pink-500/30 text-pink-300 border border-pink-400/30'
              : 'bg-white/6 text-white/40 border border-white/10 active:bg-white/15'
          }`}
        >
          Ella
        </button>
        <button
          onClick={() => setKid('kaleb')}
          className={`px-5 py-3 rounded-xl text-[0.85rem] font-black uppercase tracking-wider transition-all select-none ${
            lastNight?.kid === 'kaleb'
              ? 'bg-blue-500/30 text-blue-300 border border-blue-400/30'
              : 'bg-white/6 text-white/40 border border-white/10 active:bg-white/15'
          }`}
        >
          Kaleb
        </button>
      </div>
    </div>
  )
}
