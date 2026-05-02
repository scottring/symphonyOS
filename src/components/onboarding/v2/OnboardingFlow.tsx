import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { OnboardingProvider } from '@/contexts/OnboardingContext'
import { WelcomeScreen } from './WelcomeScreen'
import { HouseholdScreen } from './HouseholdScreen'
import { GoalsScreen } from './GoalsScreen'
import { RhythmsScreen } from './RhythmsScreen'
import { BriefScreen } from './BriefScreen'
import { NowWhatScreen } from './NowWhatScreen'

type ScreenKey = 'welcome' | 'household' | 'goals' | 'rhythms' | 'brief' | 'nowwhat'

/** Top-level route component for /onboarding. Owns the OnboardingProvider
 *  and dispatches between the 6 screens. Auth is required — unauthed users
 *  bounce to the auth flow (handled by App.tsx, but we also redirect here
 *  in case someone hits the URL directly). */
export function OnboardingFlow() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center">
        <p className="text-neutral-500">Loading…</p>
      </div>
    )
  }

  if (!user) {
    // Send unauthed visitors to the public sample plan instead of bouncing
    // them to the root auth screen — the WelcomeScreen surfaces the sample
    // path, but the route itself isn't the right landing for unauthed users.
    return <Navigate to="/onboarding/sample" replace />
  }

  return (
    <OnboardingProvider>
      <FlowController />
    </OnboardingProvider>
  )
}

function FlowController() {
  const [screen, setScreen] = useState<ScreenKey>('welcome')

  const goto = (next: ScreenKey) => setScreen(next)

  switch (screen) {
    case 'welcome':
      return <WelcomeScreen onStart={() => goto('household')} />
    case 'household':
      return (
        <HouseholdScreen
          onBack={() => goto('welcome')}
          onContinue={() => goto('goals')}
        />
      )
    case 'goals':
      return (
        <GoalsScreen
          onBack={() => goto('household')}
          onContinue={() => goto('rhythms')}
        />
      )
    case 'rhythms':
      return (
        <RhythmsScreen
          onBack={() => goto('goals')}
          onContinue={() => goto('brief')}
        />
      )
    case 'brief':
      return (
        <BriefScreen
          onBack={() => goto('rhythms')}
          onGenerated={() => goto('nowwhat')}
        />
      )
    case 'nowwhat':
      return <NowWhatScreen />
  }
}
