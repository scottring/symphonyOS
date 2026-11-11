import { createClient } from '@supabase/supabase-js'
import type { Config } from './types.ts'

type UpsertClient = {
  from: (t: string) => { upsert: (v: unknown, o: unknown) => Promise<{ error: unknown }> }
}

/** A feed that has gone quiet and a feed that has gone dead look identical
 * from the app. This is what tells them apart — the 17-day silent outage on
 * the old Mac Mini is the failure this exists to prevent. */
export async function recordHealth(
  config: Config,
  connector: 'whatsapp' | 'classdojo',
  result: { ok: boolean; error?: string },
  client?: UpsertClient,
): Promise<void> {
  const db = client ?? (createClient(config.supabaseUrl, config.serviceRoleKey) as unknown as UpsertClient)
  const now = new Date().toISOString()
  const { error } = await db.from('connector_health').upsert(
    result.ok
      ? { user_id: config.userId, connector, last_ok_at: now, last_error: null, last_error_at: null, updated_at: now }
      : { user_id: config.userId, connector, last_error: result.error ?? 'unknown', last_error_at: now, updated_at: now },
    { onConflict: 'user_id,connector' },
  )
  if (error) console.error('health upsert failed', error)
}

/** Stamp other fields on a connector's health row: the heartbeat, the 5pm
 * run, the pairing code. Never fails the caller. */
export async function touchHealth(
  config: Config,
  connector: 'whatsapp' | 'classdojo',
  fields: Partial<Record<'heartbeat_at' | 'last_flush_at' | 'pair_qr' | 'pair_qr_at', string | null>>,
  client?: UpsertClient,
): Promise<void> {
  try {
    const db = client ?? (createClient(config.supabaseUrl, config.serviceRoleKey) as unknown as UpsertClient)
    const { error } = await db.from('connector_health').upsert(
      { user_id: config.userId, connector, ...fields },
      { onConflict: 'user_id,connector' },
    )
    if (error) console.error('health touch failed', error)
  } catch (e) {
    console.error('health touch failed', e)
  }
}
