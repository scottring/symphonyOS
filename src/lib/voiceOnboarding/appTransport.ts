// src/lib/voiceOnboarding/appTransport.ts
//
// Which voice the app uses: live voice only when this build opts in
// (VITE_VOICE_LIVE=1) on top of the server's own switch
// (VOICE_ONBOARDING_ENABLED). Otherwise NONE — the page shows no voice
// controls and typing is the way. The labelled simulation (DemoTransport) is
// for the DEV design preview only, never a signed-in page.

import { supabase } from '@/lib/supabase'
import type { VoiceTransport } from './transport'
import { RealtimeTransport } from './realtimeTransport'

export const LIVE_VOICE = import.meta.env.VITE_VOICE_LIVE === '1'

export function makeAppTransport(): VoiceTransport {
  return new RealtimeTransport({
    endpoint: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/voice-session`,
    apiKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    getAccessToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null,
  })
}

/** The page's voice: a factory only when live voice is on, else undefined. */
export const appVoice: (() => VoiceTransport) | undefined = LIVE_VOICE ? makeAppTransport : undefined
