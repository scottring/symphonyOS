import type { AppDef } from '@/shell/types'
import { VoiceOnboardingPage } from '@/components/voice/VoiceOnboardingPage'

// Plan out loud (prototype): optional voice-guided planning, its own destination.
export const planAloudAppDef: AppDef = { id: 'plan-aloud', route: '/plan-aloud', Component: VoiceOnboardingPage }
