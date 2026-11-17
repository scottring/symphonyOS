// The kidsPhone ringtone, chosen on the wall itself (it's the only thing that
// rings — the handset's own ringer is switched off). Tapping a tone plays it
// once and makes it the ringtone; there's no separate Save step.

import { useEffect, useRef } from 'react'
import { Check } from 'lucide-react'
import { RINGTONES, playRingtone, type Playback, type RingtoneId, type RingtoneMood } from '@/lib/wall/ringtones'

const GROUPS: { mood: RingtoneMood; label: string }[] = [
  { mood: 'calm', label: 'Calm' },
  { mood: 'fun', label: 'Fun' },
]

export function WallV2RingtonePicker({ value, onChange, onDone }: {
  value: RingtoneId
  onChange: (id: RingtoneId) => void
  onDone: () => void
}) {
  const preview = useRef<Playback | null>(null)
  useEffect(() => () => preview.current?.stop(), [])

  const pick = (id: RingtoneId) => {
    preview.current?.stop()
    preview.current = playRingtone(id)
    onChange(id)
  }

  return (
    <div className="kc-ring">
      <h2>Ringtone</h2>
      <p className="kc-muted">Plays on the wall when someone calls kidsPhone. Tap one to hear it.</p>
      {GROUPS.map((g) => (
        <section key={g.mood} aria-label={g.label} className="kc-ring-group">
          <h3>{g.label}</h3>
          <div className="kc-ring-grid">
            {RINGTONES.filter((r) => r.mood === g.mood).map((r) => (
              <button key={r.id} type="button" aria-pressed={r.id === value}
                className={`kc-btn kc-ring-opt ${r.id === value ? 'is-on' : ''}`} onClick={() => pick(r.id)}>
                <span className="kc-ring-name">
                  {r.id === value && <Check aria-hidden="true" />} {r.label}
                </span>
                <small>{r.blurb}</small>
              </button>
            ))}
          </div>
        </section>
      ))}
      <div className="kc-call-actions is-one">
        <button type="button" className="kc-btn kc-big is-accent" onClick={onDone}>Done</button>
      </div>
    </div>
  )
}
