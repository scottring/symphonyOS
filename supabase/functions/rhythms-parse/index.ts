// supabase/functions/rhythms-parse/index.ts
// Parses 4 free-text answers about a household's eating rhythms into a
// structured list of standing-habit drafts. Used by the onboarding RhythmsScreen.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SYSTEM_PROMPT = `You are Symphony, a meal-planning assistant. The user just answered prompts about their family's eating rhythms. Parse their free-text answers into a structured list of standing habits.

A standing habit has:
- when: one of MORNINGS | WEEKDAY LUNCH | SNACK | OFF-NIGHT | BATCH-DAY | EVENINGS
- what: a short noun phrase (e.g. "Yogurt + tomatoes for Iris")
- detail: optional second line with portion/grams or who-applies-to
- contributesGrams: optional integer (estimate of fruit+veg grams toward the 800g target)

Be conservative. If an answer is vague, don't invent a habit — return only what's clearly stated. Group by person where given.

Output ONLY a JSON object, no prose. Schema:
{
  "habits": [
    { "when": "MORNINGS", "what": "...", "detail": "...", "contributesGrams": 200 }
  ],
  "note": "Here's what I'm hearing. ..."
}

The "note" is a one-sentence reflection (max ~20 words). Omit habits entirely if the answers are blank.`

interface RequestBody {
  answers: {
    breakfast?: string
    lunch?: string
    snack?: string
    off_nights?: string
  }
}

interface RhythmHabit {
  when: 'MORNINGS' | 'WEEKDAY LUNCH' | 'SNACK' | 'OFF-NIGHT' | 'BATCH-DAY' | 'EVENINGS'
  what: string
  detail?: string
  contributesGrams?: number
}

function extractJson(s: string): string {
  const start = s.indexOf('{')
  if (start < 0) return s
  let depth = 0, inStr = false, esc = false
  for (let i = start; i < s.length; i++) {
    const c = s[i]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
    } else if (c === '"') inStr = true
    else if (c === '{') depth++
    else if (c === '}' && --depth === 0) return s.slice(start, i + 1)
  }
  return s
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonError(401, 'missing authorization')

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicKey) return jsonError(500, 'ANTHROPIC_API_KEY not set')

    const body = (await req.json()) as RequestBody
    const a = body.answers ?? {}
    const allBlank = !(a.breakfast?.trim() || a.lunch?.trim() || a.snack?.trim() || a.off_nights?.trim())
    if (allBlank) {
      return new Response(JSON.stringify({ habits: [], note: '' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const userMessage = [
      a.breakfast?.trim() && `Breakfast usually looks like…\n${a.breakfast.trim()}`,
      a.lunch?.trim() && `Lunch most weekdays…\n${a.lunch.trim()}`,
      a.snack?.trim() && `Anything you tend to snack on?\n${a.snack.trim()}`,
      a.off_nights?.trim() && `Any nights you don't cook?\n${a.off_nights.trim()}`,
    ].filter(Boolean).join('\n\n')

    const aiResp = await callAnthropic(anthropicKey, userMessage)
    let parsed: { habits?: RhythmHabit[]; note?: string }
    try {
      parsed = JSON.parse(extractJson(aiResp))
    } catch (e) {
      return jsonError(502, `model returned non-JSON: ${e instanceof Error ? e.message : String(e)}`)
    }

    const habits = Array.isArray(parsed.habits)
      ? parsed.habits.filter(h => h && typeof h.when === 'string' && typeof h.what === 'string')
      : []

    return new Response(JSON.stringify({ habits, note: parsed.note ?? '' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return jsonError(500, `unexpected: ${e instanceof Error ? e.message : String(e)}`)
  }
})

async function callAnthropic(apiKey: string, userMessage: string): Promise<string> {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: userMessage },
        { role: 'assistant', content: '{\n  "habits":' },
      ],
    }),
  })
  if (!resp.ok) {
    const bodyText = await resp.text()
    const requestId = resp.headers.get('request-id') ?? resp.headers.get('x-request-id') ?? null
    console.error('anthropic upstream error', { status: resp.status, requestId, body: bodyText })
    throw new Error(`anthropic upstream ${resp.status}${requestId ? ` (request-id: ${requestId})` : ''}`)
  }
  const data = await resp.json()
  const text = data.content?.[0]?.text ?? ''
  if (data.stop_reason === 'max_tokens') {
    throw new Error('model response truncated at max_tokens')
  }
  return `{\n  "habits":${text}`
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
