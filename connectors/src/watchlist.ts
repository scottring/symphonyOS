import { createClient } from '@supabase/supabase-js'
import type { Config, WatchedSource } from './types.ts'

export interface SourceRow {
  connector: string
  source_key: string
  source_label: string
  is_active: boolean
}

const CONNECTORS = new Set<string>(['whatsapp', 'classdojo'])

export function toWatchedSources(rows: SourceRow[]): WatchedSource[] {
  return rows
    .filter((r) => r.is_active && CONNECTORS.has(r.connector))
    .map((r) => ({
      connector: r.connector as WatchedSource['connector'],
      sourceKey: r.source_key,
      sourceLabel: r.source_label,
    }))
}

/** The allowlist gate. Called at the moment a message is RECEIVED, before it
 * is buffered — so an unlisted conversation never enters the worker's memory,
 * let alone the network. */
export function isWatched(sources: WatchedSource[], connector: string, sourceKey: string): boolean {
  return sources.some((s) => s.connector === connector && s.sourceKey === sourceKey)
}

type SupabaseLike = {
  from: (t: string) => {
    select: (c: string) => {
      eq: (c: string, v: unknown) => Promise<{ data: SourceRow[] | null; error: unknown }>
    }
  }
}

export async function loadWatchlist(config: Config, client?: SupabaseLike): Promise<WatchedSource[]> {
  const db = client ?? (createClient(config.supabaseUrl, config.serviceRoleKey) as unknown as SupabaseLike)
  // No user filter: this worker serves exactly one household and reads
  // capture_sources with the service-role key. is_active is the only gate,
  // and since it IS the privacy boundary it belongs in the query rather
  // than in a caller that might forget to apply it.
  const { data, error } = await db
    .from('capture_sources')
    .select('connector, source_key, source_label, is_active')
    .eq('is_active', true)
  // A failed watchlist read must fail CLOSED. Returning [] means nothing is
  // read this tick; returning everything would read chats nobody allowlisted.
  if (error || !data) return []
  return toWatchedSources(data)
}
