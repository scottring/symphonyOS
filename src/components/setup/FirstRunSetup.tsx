import { useState, type FormEvent } from 'react'
import { Plus, X, Check } from 'lucide-react'
import type { User } from '@supabase/supabase-js'
import { geocodePlace, type GeocodedPlace } from '@/lib/geocode'
import { saveFirstRunSetup, skipFirstRunSetup, type HouseholdRole } from '@/lib/firstRun'

interface Props {
  user: User
  onDone: () => void
}

interface OtherRow {
  key: number
  name: string
  role: HouseholdRole
}

function guessName(user: User): string {
  const meta = user.user_metadata?.full_name
  if (typeof meta === 'string' && meta.trim()) return meta.trim()
  const local = user.email?.split('@')[0] ?? ''
  const first = local.split(/[._-]/)[0] ?? ''
  return first ? first[0].toUpperCase() + first.slice(1) : ''
}

/**
 * One-screen household setup for a brand-new account: name the household,
 * name yourself, list who lives here, and pin home for the weather. Every
 * field is editable later in Settings, so this stays short.
 */
export function FirstRunSetup({ user, onDone }: Props) {
  const [householdName, setHouseholdName] = useState('')
  const [yourName, setYourName] = useState(() => guessName(user))
  const [others, setOthers] = useState<OtherRow[]>([{ key: 1, name: '', role: 'parent' }])
  const [homeQuery, setHomeQuery] = useState('')
  const [home, setHome] = useState<GeocodedPlace | null>(null)
  const [homeStatus, setHomeStatus] = useState<'idle' | 'looking' | 'notfound'>('idle')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const addOther = () => setOthers((rows) => [...rows, { key: Date.now(), name: '', role: 'child' }])
  const removeOther = (key: number) => setOthers((rows) => rows.filter((r) => r.key !== key))
  const patchOther = (key: number, patch: Partial<OtherRow>) =>
    setOthers((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  const resolveHome = async () => {
    const q = homeQuery.trim()
    if (!q) { setHome(null); setHomeStatus('idle'); return }
    if (home && home.label === q) return
    setHomeStatus('looking')
    try {
      const hit = await geocodePlace(q)
      setHome(hit)
      setHomeStatus(hit ? 'idle' : 'notfound')
      if (hit) setHomeQuery(hit.label)
    } catch {
      setHome(null)
      setHomeStatus('notfound')
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      // A typed-but-unresolved home gets one more try before saving.
      let resolvedHome = home
      if (!resolvedHome && homeQuery.trim()) {
        try { resolvedHome = await geocodePlace(homeQuery) } catch { resolvedHome = null }
      }
      await saveFirstRunSetup(user.id, {
        householdName,
        yourName,
        others: others.filter((r) => r.name.trim()).map(({ name, role }) => ({ name, role })),
        home: resolvedHome,
      })
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save. Try again.')
      setSaving(false)
    }
  }

  const handleSkip = async () => {
    if (saving) return
    setSaving(true)
    try {
      await skipFirstRunSetup(user.id)
    } catch (err) {
      console.warn('[first-run] skip failed:', err)
    }
    onDone()
  }

  return (
    <div className="min-h-screen bg-bg-base flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-2">
            <img src="/symphony-logo.jpg" alt="Symphony Logo" className="w-12 h-12 rounded-full object-cover" />
            <h1 className="font-display text-3xl text-neutral-900">Symphony</h1>
          </div>
        </div>

        <div className="card p-8">
          <h2 className="font-display text-xl font-medium text-neutral-800 mb-1 text-center">Set up your household</h2>
          <p className="text-sm text-neutral-500 mb-6 text-center">Two minutes. Everything here can be changed in Settings.</p>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label htmlFor="household-name" className="block text-sm font-medium text-neutral-600">Household name</label>
              <input
                id="household-name"
                type="text"
                value={householdName}
                onChange={(e) => setHouseholdName(e.target.value)}
                className="input-base"
                placeholder="The Rivera household"
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="your-name" className="block text-sm font-medium text-neutral-600">Your name</label>
              <input
                id="your-name"
                type="text"
                value={yourName}
                onChange={(e) => setYourName(e.target.value)}
                className="input-base"
                placeholder="First name"
                autoComplete="given-name"
                required
              />
            </div>

            <fieldset className="space-y-2">
              <legend className="block text-sm font-medium text-neutral-600">Who else lives here?</legend>
              <p className="text-xs text-neutral-400">A partner can get their own login later from Settings.</p>
              <div className="space-y-2">
                {/* input-base is unlayered CSS (width: 100%), so size via wrappers */}
                {others.map((row, i) => (
                  <div key={row.key} className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <input
                        type="text"
                        value={row.name}
                        onChange={(e) => patchOther(row.key, { name: e.target.value })}
                        className="input-base"
                        placeholder={row.role === 'child' ? 'Child’s name' : 'Partner’s name'}
                        aria-label={`Person ${i + 1} name`}
                        autoComplete="off"
                      />
                    </div>
                    <div className="w-28 shrink-0">
                      <select
                        value={row.role}
                        onChange={(e) => patchOther(row.key, { role: e.target.value as HouseholdRole })}
                        className="input-base"
                        aria-label={`Person ${i + 1} role`}
                      >
                        <option value="parent">Partner</option>
                        <option value="child">Child</option>
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeOther(row.key)}
                      className="p-2 text-neutral-400 hover:text-neutral-700"
                      aria-label={`Remove person ${i + 1}`}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={addOther}
                className="inline-flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700"
              >
                <Plus className="w-4 h-4" /> Add someone
              </button>
            </fieldset>

            <div className="space-y-2">
              <label htmlFor="home-place" className="block text-sm font-medium text-neutral-600">Where is home?</label>
              <input
                id="home-place"
                type="text"
                value={homeQuery}
                onChange={(e) => { setHomeQuery(e.target.value); setHome(null); setHomeStatus('idle') }}
                onBlur={resolveHome}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); resolveHome() } }}
                className="input-base"
                placeholder="City or ZIP code"
                autoComplete="off"
              />
              <p className="text-xs text-neutral-400 flex items-center gap-1">
                {home && <><Check className="w-3.5 h-3.5 text-primary-600" aria-label="Location found" /> {home.label}</>}
                {!home && homeStatus === 'looking' && 'Looking that up…'}
                {!home && homeStatus === 'notfound' && 'Could not find that place. Try a nearby city.'}
                {!home && homeStatus === 'idle' && 'For the weather on Today. Optional.'}
              </p>
            </div>

            {error && <div className="p-3 rounded-lg text-sm bg-danger-50 text-danger-700">{error}</div>}

            <button
              type="submit"
              disabled={saving}
              className="w-full btn-primary py-3 text-base font-medium rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Setting up…' : 'Set up my household'}
            </button>
          </form>

          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={handleSkip}
              disabled={saving}
              className="text-sm text-neutral-500 hover:text-neutral-700 disabled:opacity-50"
            >
              Skip for now
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
