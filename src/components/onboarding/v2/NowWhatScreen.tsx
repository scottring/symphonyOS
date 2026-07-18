import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { OnboardingShell } from './OnboardingShell'
import { useOnboarding } from '@/contexts/OnboardingContext'

// No props — NowWhatScreen handles its own navigation via the single CTA
// card. The flow completes when the user clicks through (or closes the
// tab). Persistence happens on mount; nothing else here needs to fire
// before the user leaves.
type Props = Record<string, never>

/** Terminal screen — also where the durable mutations land. On mount we write
 *  household + season_goals to user_profiles and stamp
 *  onboarding_completed_at. Failures surface a toast but do NOT block the
 *  user from leaving. */

export function NowWhatScreen(_props: Props = {} as Props) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { household, goals } = useOnboarding()
  const persisted = useRef(false)
  const [persistError, setPersistError] = useState<string | null>(null)

  useEffect(() => {
    if (!user || persisted.current) return
    persisted.current = true

    void (async () => {
      const profilePayload = {
        user_id: user.id,
        household: {
          adults: household.adults.filter(a => a.name.trim()),
          kids: household.kids.filter(k => k.name.trim()),
        },
        season_goals: {
          selected: goals.selected,
          ...(goals.custom.trim() ? { custom: goals.custom.trim() } : {}),
        },
        onboarding_completed_at: new Date().toISOString(),
      }
      const { error: profileErr } = await supabase
        .from('user_profiles')
        .upsert(profilePayload, { onConflict: 'user_id' })
      if (profileErr) {
        console.error('Onboarding persistence failure:', profileErr.message)
        setPersistError(profileErr.message)
      }
    })()
  }, [user, household, goals])

  return (
    <OnboardingShell>
      <div className="flex-1 px-20 py-13 flex flex-col items-center justify-center text-center" style={{ paddingTop: 52, paddingBottom: 52 }}>
        <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary-500">
          YOU'RE ALL SET
        </div>
        <div className="h-3" />
        <h1 className="font-display text-[56px] leading-[1.05] text-neutral-800 max-w-[720px]">
          Welcome to <span className="italic text-primary-500">Symphony.</span>
        </h1>
        <div className="h-2.5" />
        <p className="font-display italic text-[20px] text-neutral-500 max-w-[560px] leading-[1.4]">
          Your household and goals are saved. Head in and start capturing what's on your mind.
        </p>

        <div className="h-9" />

        <button
          type="button"
          onClick={() => navigate('/today')}
          className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl text-[14px] font-medium bg-primary-500 text-white shadow-primary hover:bg-primary-600 transition-all"
        >
          Go to Symphony →
        </button>

        {persistError && (
          <div className="mt-6 px-3 py-2 rounded-lg border border-accent-100 bg-accent-50 text-accent-600 text-[12px] italic">
            Couldn't save some of your setup ({persistError}). You can fix it later in Settings.
          </div>
        )}
      </div>
    </OnboardingShell>
  )
}
