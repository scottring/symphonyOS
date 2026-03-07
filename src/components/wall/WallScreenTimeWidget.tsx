import { useState, useCallback } from 'react'

const SCREEN_TIME_KEY = 'symphony-wall-screentime'
const SCREEN_TIME_DATE_KEY = 'symphony-wall-screentime-date'
const STEP = 5 // minutes

type Kid = 'ella' | 'kaleb'

function getToday(): string {
  return new Date().toISOString().split('T')[0]
}

function getStoredTime(): Record<Kid, number> {
  try {
    const date = localStorage.getItem(SCREEN_TIME_DATE_KEY)
    if (date !== getToday()) {
      // Reset at midnight
      localStorage.removeItem(SCREEN_TIME_KEY)
      localStorage.setItem(SCREEN_TIME_DATE_KEY, getToday())
      return { ella: 0, kaleb: 0 }
    }
    const raw = localStorage.getItem(SCREEN_TIME_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return { ella: 0, kaleb: 0 }
}

function storeTime(times: Record<Kid, number>) {
  localStorage.setItem(SCREEN_TIME_KEY, JSON.stringify(times))
  localStorage.setItem(SCREEN_TIME_DATE_KEY, getToday())
}

export function WallScreenTimeWidget() {
  const [times, setTimes] = useState(getStoredTime)

  const adjust = useCallback((kid: Kid, delta: number) => {
    setTimes(prev => {
      const next = { ...prev, [kid]: prev[kid] + delta }
      storeTime(next)
      return next
    })
  }, [])

  const formatMins = (m: number) => {
    if (m === 0) return '0m'
    const neg = m < 0
    const abs = Math.abs(m)
    const h = Math.floor(abs / 60)
    const r = abs % 60
    const sign = neg ? '-' : ''
    if (h > 0 && r > 0) return `${sign}${h}h ${r}m`
    if (h > 0) return `${sign}${h}h`
    return `${sign}${r}m`
  }

  return (
    <div className="flex items-center gap-4">
      <div className="text-[2.2rem]">📺</div>

      <div className="flex gap-4 flex-1">
        {(['ella', 'kaleb'] as const).map(kid => (
          <div key={kid} className="flex items-center gap-2">
            <button
              onClick={() => adjust(kid, -STEP)}
              className="w-10 h-10 rounded-xl bg-white/6 text-white/40 border border-white/10
                         active:bg-white/15 font-black text-[1.1rem] flex items-center justify-center select-none"
            >
              -
            </button>
            <div className="flex flex-col items-center min-w-[50px]">
              <span className={`text-[1.1rem] font-black uppercase tracking-wider ${
                times[kid] < 0 ? 'text-green-400' : times[kid] > 60 ? 'text-red-400' : times[kid] > 30 ? 'text-yellow-400' : 'text-white'
              }`}>
                {formatMins(times[kid])}
              </span>
              <span className="text-[0.7rem] font-bold text-white/25 uppercase tracking-widest">
                {kid}
              </span>
            </div>
            <button
              onClick={() => adjust(kid, STEP)}
              className="w-10 h-10 rounded-xl bg-white/6 text-white/40 border border-white/10
                         active:bg-white/15 font-black text-[1.1rem] flex items-center justify-center select-none"
            >
              +
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
