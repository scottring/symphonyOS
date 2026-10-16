// src/components/settings/DisplaysSection.tsx
//
// Settings → Displays: pair a kitchen wall with a ten-minute code, see which
// displays are paired, and revoke one. A display has its own restricted
// sign-in (src/lib/display/pairing.ts); revoking fails it closed at once.

import { useCallback, useEffect, useState } from 'react'
import { SectionHeading } from '@/components/layout/SectionHeading'
import { createPairingCode, listDisplays, revokeDisplay, type HouseholdDisplay, type PairingCode } from '@/lib/display/pairing'

export function DisplaysSection() {
  const [displays, setDisplays] = useState<HouseholdDisplay[]>([])
  const [code, setCode] = useState<PairingCode | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [checked, setChecked] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  const refresh = useCallback(async () => { try { setDisplays(await listDisplays());setError(null);setChecked(true) } catch {setChecked(false);setError('Could not check paired displays. Try again.')} }, [])
  useEffect(() => { void refresh() }, [refresh])
  // The code's countdown.
  useEffect(() => {
    if (!code) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [code])

  const makeCode = async () => {
    setError(null)
    setBusy(true)
    try {
      const r = await createPairingCode('Kitchen wall')
      if (!r.ok) { setError(r.error); return }
      setCode(r.code);setNow(Date.now())
    } catch {setError('Could not make a pairing code. Try again.')} finally {setBusy(false)}
  }
  const revoke = async (d: HouseholdDisplay) => {
    setError(null)
    setBusy(true)
    try {
      const r = await revokeDisplay(d.id)
      if (!r.ok) { setError(r.error); return }
      await refresh()
    } catch {setError('Could not confirm revocation. Try again.')} finally {setBusy(false)}
  }

  const secondsLeft = code ? Math.max(0, Math.floor((code.expiresAt.getTime() - now) / 1000)) : 0
  const live = displays.filter((d) => !d.revokedAt)

  return (
    <section data-testid="displays-section">
      <SectionHeading>Displays</SectionHeading>
      <p className="text-[13px] text-neutral-500 mb-3">
        A kitchen wall or tablet gets its own sign-in: it shows the family’s day and can add to family lists, and nothing else. Nobody’s account is left open on it.
      </p>
      {code && secondsLeft > 0 ? (
        <div className="mb-3 p-4 rounded-lg bg-primary-50 border border-primary-100 text-center">
          <p className="text-[12px] text-neutral-600 mb-1">On the display, open Symphony and enter</p>
          <p className="font-mono text-3xl tracking-[0.4em] text-neutral-900" aria-label="Pairing code">{code.code}</p>
          <p className="text-[12px] text-neutral-500 mt-1">Good for {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}</p>
        </div>
      ) : (
        <button onClick={makeCode} disabled={busy} className="w-full p-3 border-2 border-dashed border-primary-200 rounded-lg text-primary-600 hover:border-primary-300 hover:bg-primary-50/50 transition-colors disabled:opacity-50">
          {busy ? 'Making a code…' : 'Pair a display'}
        </button>
      )}
      {error && <p role="alert" className="text-xs text-red-600 mt-2">{error}</p>}
      {code&&secondsLeft===0&&<p role="status" className="text-xs text-neutral-500">This code expired. Make a new one when the tablet is ready.</p>}
      <button className="onboarding-link" disabled={busy} onClick={()=>void refresh()}>Check paired displays</button>
      {checked&&!error&&live.length===0&&<p role="status" className="text-xs text-neutral-500">No paired displays found.</p>}
      {live.length > 0 && (
        <div className="mt-3">
          {live.map((d) => (
            <div key={d.id} className="flex items-center gap-3 py-2.5">
              <div className="flex-1 min-w-0">
                <p className="text-[16px] text-neutral-900 truncate">{d.name}</p>
                <p className="mt-0.5 text-[12px] text-neutral-500">Paired {d.pairedAt.toLocaleDateString()}</p>
                <p className="mt-0.5 text-[12px] text-neutral-500">{d.lastSeenAt?`Last connected ${d.lastSeenAt.toLocaleString()}`:'Waiting for its first connection'}</p>
              </div>
              <button disabled={busy} onClick={() => revoke(d)} className="text-xs font-medium text-danger-600 hover:text-danger-700 px-2 py-1 rounded hover:bg-danger-50 transition-colors whitespace-nowrap">
                Revoke
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
