// src/components/settings/DisplaysSection.tsx
//
// Settings → Displays: pair a kitchen wall, or a tablet for one kid, with a
// ten-minute code (or start over: the code stops working and the picker
// comes back); see which displays are paired, and revoke one. A display
// has its own restricted sign-in (src/lib/display/pairing.ts); revoking
// fails it closed at once. A kid's tablet keeps the thoughts that kid saved
// for later; a grown-up marks them gone over here.

import { useCallback, useEffect, useState } from 'react'
import { SectionHeading } from '@/components/layout/SectionHeading'
import { cancelPairingCode, createPairingCode, listDisplays, revokeDisplay, type HouseholdDisplay, type KidLayout, type PairingCode } from '@/lib/display/pairing'
import { listOpenThoughts, markThoughtReviewed, kindLabel, type KidThought } from '@/lib/kids/kidThoughts'
import { memberShape } from '@/lib/wall/memberPageModel'
import type { FamilyMember } from '@/types/family'

const LAYOUTS: { id: KidLayout; label: string }[] = [
  { id: 'trail', label: 'One thing at a time (a trail)' },
  { id: 'list', label: 'A list, in any order' },
]
const layoutLabel = (l: KidLayout | null) => (l === 'list' ? 'a list, in any order' : 'one thing at a time')

export function DisplaysSection({ members = [] }: { members?: FamilyMember[] }) {
  const kids = members.filter((m) => m.member_type !== 'guest' && memberShape(m) === 'kid')
  const [forId, setForId] = useState('')
  const [layout, setLayout] = useState<KidLayout>('trail')
  const [thoughts, setThoughts] = useState<KidThought[]>([])
  const [displays, setDisplays] = useState<HouseholdDisplay[]>([])
  const [code, setCode] = useState<PairingCode | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [checked, setChecked] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  const refresh = useCallback(async () => { try { setDisplays(await listDisplays());setError(null);setChecked(true) } catch {setChecked(false);setError('Could not check paired displays. Try again.')} }, [])
  const refreshThoughts = useCallback(async () => { try { setThoughts(await listOpenThoughts(null)) } catch { setThoughts([]) } }, [])
  useEffect(() => { void refreshThoughts() }, [refreshThoughts])
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
      const kid = kids.find((k) => k.id === forId)
      const r = kid ? await createPairingCode(`${kid.name}’s tablet`, { familyMemberId: kid.id, layout }) : await createPairingCode('Kitchen wall')
      if (!r.ok) { setError(r.error); return }
      setCode(r.code);setNow(Date.now())
    } catch {setError('Could not make a pairing code. Try again.')} finally {setBusy(false)}
  }
  const startOver = async () => {
    if (!code) return
    setError(null)
    setBusy(true)
    try {
      const r = await cancelPairingCode(code.code)
      if (!r.ok) { setError(r.error); return }
      setCode(null)
    } catch {setError('Could not cancel that code. Try again.')} finally {setBusy(false)}
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

  const reviewed = async (t: KidThought) => {
    if (await markThoughtReviewed(t.id)) setThoughts((list) => list.filter((x) => x.id !== t.id))
    else setError('Could not mark that thought. Try again.')
  }
  const secondsLeft = code ? Math.max(0, Math.floor((code.expiresAt.getTime() - now) / 1000)) : 0
  const live = displays.filter((d) => !d.revokedAt)

  return (
    <section data-testid="displays-section">
      <SectionHeading>Displays</SectionHeading>
      <p className="text-[13px] text-neutral-500 mb-3">
        A kitchen wall or tablet gets its own sign-in: it shows the family’s day and can add to family lists, and nothing else. Nobody’s account is left open on it.
      </p>
      {kids.length > 0 && !(code && secondsLeft > 0) && (
        <div className="mb-3 space-y-2">
          <label className="block text-[13px] text-neutral-600">
            For
            <select value={forId} onChange={(e) => setForId(e.target.value)} className="input-base mt-1 w-full">
              <option value="">The kitchen wall</option>
              {kids.map((k) => <option key={k.id} value={k.id}>{k.name}’s tablet</option>)}
            </select>
          </label>
          {forId && (
            <fieldset className="text-[13px] text-neutral-600">
              <legend className="mb-1">How it shows the day</legend>
              {LAYOUTS.map((l) => (
                <label key={l.id} className="flex items-center gap-2 py-1">
                  <input type="radio" name="kid-layout" checked={layout === l.id} onChange={() => setLayout(l.id)} />
                  {l.label}
                </label>
              ))}
            </fieldset>
          )}
        </div>
      )}
      {code && secondsLeft > 0 ? (
        <div className="mb-3 p-4 rounded-lg bg-primary-50 border border-primary-100 text-center">
          <p className="text-[12px] text-neutral-600 mb-1">On the display, open Symphony and enter</p>
          <p className="font-mono text-3xl tracking-[0.4em] text-neutral-900" aria-label="Pairing code">{code.code}</p>
          <p className="text-[12px] text-neutral-500 mt-1">Good for {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}</p>
          <button className="onboarding-link mt-2" disabled={busy} onClick={() => void startOver()}>Start over</button>
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
                {d.familyMemberId && (
                  <p className="mt-0.5 text-[12px] text-neutral-500">
                    Shows {members.find((m) => m.id === d.familyMemberId)?.name ?? 'one kid'}’s day, {layoutLabel(d.layout)} ·{' '}
                    <a className="underline" href={`/kid/${d.familyMemberId}?layout=${d.layout ?? 'trail'}`}>See it</a>
                  </p>
                )}
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
      {thoughts.length > 0 && (
        <div className="mt-4" data-testid="kid-thoughts">
          <p className="text-[13px] font-medium text-neutral-700 mb-1">Saved thoughts to go over</p>
          {thoughts.map((t) => (
            <div key={t.id} className="flex items-start gap-3 py-2">
              <div className="flex-1 min-w-0">
                <p className="text-[15px] text-neutral-900">{t.text}</p>
                <p className="mt-0.5 text-[12px] text-neutral-500">
                  {members.find((m) => m.id === t.familyMemberId)?.name ?? 'A kid'} · {t.createdAt.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
                  {t.kind ? ` · ${kindLabel(t.kind)}` : ''}
                </p>
              </div>
              <button onClick={() => void reviewed(t)} className="text-xs font-medium text-primary-600 hover:text-primary-700 px-2 py-1 rounded hover:bg-primary-50 transition-colors whitespace-nowrap">
                Went over it
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
