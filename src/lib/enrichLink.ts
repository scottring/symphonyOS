// Fire-and-forget link enrichment.
//
// Saving a link is the moment the user tells us this page matters. Reading it
// then — rather than when they open the task at 7am on the way out the door —
// is what makes the context already-there instead of two taps away. The call
// is deliberately not awaited: the link is already saved and rendered, and
// enrichment landing a few seconds later arrives through the same realtime
// path any other row update does.
//
// Failure is silent by design. The edge function writes an empty facet list on
// failure so it won't be retried, and a link with no facets renders exactly as
// links always have.

import { supabase } from '@/lib/supabase'
import { logger } from '@/lib/logger'

export type EnrichableEntity = 'task' | 'project'

/**
 * Ask the analyze-link function to read `url` and write typed facts back onto
 * the entity's stored link. Never throws; never blocks the caller.
 *
 * `entityContext` is the item's title — the model uses it to judge which facts
 * on the page are the ones this person cared about.
 */
export function enrichLink(
  entityType: EnrichableEntity,
  entityId: string,
  url: string,
  entityContext?: string,
): void {
  void (async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) return

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-link`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ entityType, entityId, url, entityContext }),
        },
      )
      if (!res.ok) logger.debug('[enrichLink] non-OK', res.status)
    } catch (err) {
      logger.debug('[enrichLink] failed', err)
    }
  })()
}
