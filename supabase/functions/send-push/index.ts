// @ts-nocheck
// Sends an APNs push to a user's iOS devices.
//
// Requires these function secrets (set once you have a paid Apple Developer
// account + an APNs Auth Key):
//   APNS_KEY        — full contents of AuthKey_XXXXXXXXXX.p8 (the EC private-key PEM)
//   APNS_KEY_ID     — the 10-char Key ID from the key
//   APNS_TEAM_ID    — your Apple Developer Team ID
//   APNS_BUNDLE_ID  — com.scottkaufman.symphonyos
//   APNS_HOST       — api.push.apple.com  (TestFlight + App Store both use prod)
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected automatically.
//
// Call it: supabase.functions.invoke('send-push', { body: { user_id, title, body } })
// NOTE: scaffolding — verify end-to-end once the APNs key is in place.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { create, getNumericDate } from 'https://deno.land/x/djwt@v3.0.2/mod.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '')
  const bin = atob(b64)
  const buf = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
  return buf.buffer
}

async function apnsAuthToken(): Promise<string> {
  const keyData = pemToArrayBuffer(Deno.env.get('APNS_KEY')!)
  const key = await crypto.subtle.importKey(
    'pkcs8',
    keyData,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
  return await create(
    { alg: 'ES256', kid: Deno.env.get('APNS_KEY_ID')! },
    { iss: Deno.env.get('APNS_TEAM_ID')!, iat: getNumericDate(0) },
    key,
  )
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

  try {
    const { user_id, title, body, data } = await req.json()
    if (!user_id || !title) return json({ error: 'user_id and title are required' }, 400)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const { data: tokens } = await supabase
      .from('device_tokens')
      .select('token')
      .eq('user_id', user_id)
      .eq('platform', 'ios')

    if (!tokens?.length) return json({ sent: 0, reason: 'no device tokens' })

    const jwt = await apnsAuthToken()
    const host = Deno.env.get('APNS_HOST') ?? 'api.push.apple.com'
    const topic = Deno.env.get('APNS_BUNDLE_ID')!
    const payload = JSON.stringify({ aps: { alert: { title, body }, sound: 'default' }, ...(data ?? {}) })

    let sent = 0
    for (const { token } of tokens) {
      const res = await fetch(`https://${host}/3/device/${token}`, {
        method: 'POST',
        headers: { authorization: `bearer ${jwt}`, 'apns-topic': topic, 'apns-push-type': 'alert' },
        body: payload,
      })
      if (res.ok) sent++
      else if (res.status === 410) {
        // Token is no longer valid — clean it up.
        await supabase.from('device_tokens').delete().eq('token', token)
      }
    }
    return json({ sent })
  } catch (err) {
    return json({ error: (err as Error).message ?? 'send-push failed' }, 500)
  }
})
