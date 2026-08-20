/** Plan-from-paper duplicate matching.
 *
 *  Given the titles transcribed off a plan page and the user's open tasks,
 *  decide which written lines ALREADY EXIST as tasks. A match re-places the
 *  existing task instead of creating a twin (see the 2026-08-19 spec).
 *
 *  Deliberately separate from the vision call in parse-plan: transcription is
 *  the thing that must not regress, so its prompt is untouched, and a matcher
 *  failure degrades to "no matches" rather than losing a parsed page. */

const MODEL = 'claude-haiku-4-5-20251001'
/** Enough context for a plan page against a working backlog; caps prompt cost. */
export const MAX_CANDIDATES = 300

export interface MatchCandidate {
  id: string
  title: string
}

export interface PlanMatch {
  index: number
  taskId: string
}

export type ModelCaller = (prompt: string) => Promise<string>

export function buildMatchPrompt(titles: string[], candidates: MatchCandidate[]): string {
  const written = titles.map((t, i) => `${i}: ${t}`).join('\n')
  const existing = candidates.map((c) => `- ${c.id}: ${c.title}`).join('\n')
  return `A user planned on paper and photographed the page. These lines were transcribed from it:

${written}

These are the tasks already in their app:

${existing}

For each written line, decide whether it refers to a task that already exists.

The bar for a match: the written line and the existing task must name the same action.
- Paraphrase and shorthand DO match. "bank" matches "Call bank re: the wire transfer".
- A different action on the same subject does NOT match. "Call roofer" does not match "Pay roofer invoice".
- If you are unsure, return no match for that line. A missed match costs the user a duplicate they can delete; a wrong match silently re-dates real work.

Respond with ONLY a JSON object (no markdown fences, no prose). Include an entry ONLY for lines that match:

{"matches": [{"index": 0, "task_id": "the id of the existing task"}]}

If nothing matches, return {"matches": []}.`
}

/** Validate the model's response. Every guard degrades to "no match" — an
 *  invented id or a stray index must never reach a write. A repeated index
 *  or a repeated task_id both keep only their first occurrence: two written
 *  lines resolving to the same existing task is the same false-positive
 *  class as an invented id, just reached through id confusion instead. */
export function validateMatches(
  raw: unknown,
  candidateIds: Set<string>,
  itemCount: number,
): PlanMatch[] {
  const matches = (raw as { matches?: unknown } | null)?.matches
  if (!Array.isArray(matches)) return []
  const out: PlanMatch[] = []
  const claimedIndexes = new Set<number>()
  const claimedTaskIds = new Set<string>()
  for (const entry of matches) {
    const e = entry as { index?: unknown; task_id?: unknown }
    if (typeof e.index !== 'number' || !Number.isInteger(e.index)) continue
    if (e.index < 0 || e.index >= itemCount) continue
    if (typeof e.task_id !== 'string' || !candidateIds.has(e.task_id)) continue
    if (claimedIndexes.has(e.index)) continue
    if (claimedTaskIds.has(e.task_id)) continue
    claimedIndexes.add(e.index)
    claimedTaskIds.add(e.task_id)
    out.push({ index: e.index, taskId: e.task_id })
  }
  return out
}

/** One text-only Haiku call. Never throws — see the module note. */
export async function matchPlanItems(
  titles: string[],
  candidates: MatchCandidate[],
  call: ModelCaller,
): Promise<PlanMatch[]> {
  if (titles.length === 0 || candidates.length === 0) return []
  try {
    const text = await call(buildMatchPrompt(titles, candidates))
    const stripped = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
    return validateMatches(
      JSON.parse(stripped),
      new Set(candidates.map((c) => c.id)),
      titles.length,
    )
  } catch (e) {
    console.error('planMatch failed, continuing without matches:', e instanceof Error ? e.message : String(e))
    return []
  }
}

export function callHaiku(apiKey: string): ModelCaller {
  return async (prompt: string) => {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
      }),
      // A hung upstream connection never rejects on its own — it just never
      // resolves, stalling the caller instead of degrading to "no matches".
      // A timeout turns that hang into a rejection matchPlanItems already
      // catches. 20s stays well inside the edge function's own budget while
      // leaving room for a slow-but-working call.
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) throw new Error(`Anthropic returned ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const data = (await res.json()) as { content?: { type: string; text?: string }[] }
    const text = data.content?.find((b) => b.type === 'text')?.text
    if (typeof text !== 'string') throw new Error('No text in Anthropic response')
    return text
  }
}
