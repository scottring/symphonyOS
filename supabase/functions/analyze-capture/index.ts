// ANALYZE-CAPTURE — given a task created from a photo capture (capture_meta.status
// = 'pending') and its storage path in the `attachments` bucket, runs Claude
// vision to identify the object, writes an enriched title + structured note onto
// the task, files the photo as an attachments row, and suggests an existing open
// task to merge into (capture_meta.suggested_task_id). Idempotent: re-invoking a
// task already marked done is a no-op. Auth: user JWT (same pattern as
// symphony-agent).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const MODEL = 'claude-sonnet-4-6'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } })

interface AnalysisResult {
  title: string
  note: string
  suggested_task_id: string | null
}

function buildPrompt(openTasks: { id: string; title: string }[]): string {
  const taskList = openTasks.length
    ? openTasks.map((t) => `- ${t.id}: ${t.title}`).join('\n')
    : '(none)'
  return `You are the capture assistant for Symphony, a personal task app. The user photographed a physical object (often a broken/burned-out part, a product, a label, a document, or a handwritten note) so they can deal with it later — usually by buying a replacement or acting on what the photo shows.

Analyze the photo and respond with ONLY a JSON object (no markdown fences, no prose) with these keys:

{
  "title": "Short task-card title identifying the thing and the likely action, e.g. 'Replacement bulb — T8 18W 4-pin fluorescent'",
  "note": "Plain-text note the user will read on their phone in a store. Use short labeled lines separated by newlines, no markdown syntax. Cover, when applicable:\nWhat it is: <common name of the item>\nSpecs: <size, wattage, model, base/fitting, dimensions — everything visible or inferable>\nWhere to buy: <typical stores or online>\nAt the store, say: <one sentence the user can say to an employee>\nNotes: <anything else useful — compatibility caveats, quantity guess, uncertainty>",
  "suggested_task_id": "id of ONE task from the list below if this photo clearly belongs to it, else null"
}

The user's open tasks (id: title):
${taskList}

Only suggest a task if the photo plainly relates to it (e.g. photo of a light bulb and a task about buying bulbs). When unsure, use null. If the photo is a document or screenshot, transcribe the useful content into the note instead of physical specs. Be concrete; never pad with generic advice.`
}

function parseAnalysis(text: string): AnalysisResult {
  const stripped = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  const parsed = JSON.parse(stripped) as Partial<AnalysisResult>
  if (typeof parsed.title !== 'string' || typeof parsed.note !== 'string') {
    throw new Error('Analysis missing title or note')
  }
  return {
    title: parsed.title.slice(0, 200),
    note: parsed.note,
    suggested_task_id: typeof parsed.suggested_task_id === 'string' ? parsed.suggested_task_id : null,
  }
}

async function callVision(imageUrl: string, prompt: string, apiKey: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1500,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'url', url: imageUrl } },
            { type: 'text', text: prompt },
          ],
        },
      ],
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Anthropic returned ${res.status}: ${body.slice(0, 300)}`)
  }
  const data = (await res.json()) as { content?: { type: string; text?: string }[] }
  const text = data.content?.find((b) => b.type === 'text')?.text
  if (typeof text !== 'string') throw new Error('No text in Anthropic response')
  return text
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Missing Authorization' }, 401)

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  const url = Deno.env.get('SUPABASE_URL')
  const anon = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!apiKey || !url || !anon || !serviceKey) return json({ error: 'Missing server config' }, 500)

  const token = authHeader.slice('Bearer '.length)
  const service = createClient(url, serviceKey)
  const { data: { user }, error: authErr } = await service.auth.getUser(token)
  if (authErr || !user) return json({ error: 'Invalid token' }, 401)

  // User-scoped client: every table op below is RLS-enforced as the caller.
  const db = createClient(url, anon, { global: { headers: { Authorization: authHeader } } })

  let body: { taskId?: string; storagePath?: string; fileName?: string; fileType?: string; fileSize?: number }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  const { taskId, storagePath } = body
  if (!taskId || !storagePath) return json({ error: 'taskId and storagePath required' }, 400)
  if (!storagePath.startsWith(`${user.id}/`)) return json({ error: 'storagePath must be under your user id' }, 403)

  const { data: task, error: taskErr } = await db
    .from('tasks')
    .select('id, title, notes, capture_meta')
    .eq('id', taskId)
    .maybeSingle()
  if (taskErr) return json({ error: `Task lookup failed: ${taskErr.message}` }, 500)
  if (!task) return json({ error: 'Task not found' }, 404)
  if ((task.capture_meta as { status?: string } | null)?.status === 'done') {
    return json({ ok: true, alreadyDone: true })
  }

  const fail = async (message: string, status = 500) => {
    await db.from('tasks').update({
      capture_meta: { status: 'failed', storage_path: storagePath, error: message.slice(0, 300) },
      updated_at: new Date().toISOString(),
    }).eq('id', taskId)
    return json({ error: message }, status)
  }

  try {
    const { data: signed, error: signErr } = await service.storage
      .from('attachments')
      .createSignedUrl(storagePath, 600)
    if (signErr || !signed?.signedUrl) throw new Error(`Could not sign image URL: ${signErr?.message}`)

    // Candidate tasks for the destination suggestion: open, not this capture,
    // not other pending captures. Recent first, capped to keep the prompt small.
    const { data: openTasks } = await db
      .from('tasks')
      .select('id, title, capture_meta')
      .eq('completed', false)
      .neq('id', taskId)
      .order('updated_at', { ascending: false })
      .limit(120)
    const candidates = (openTasks ?? [])
      .filter((t) => (t.capture_meta as { status?: string } | null)?.status !== 'pending')
      .map((t) => ({ id: t.id as string, title: t.title as string }))

    const raw = await callVision(signed.signedUrl, buildPrompt(candidates), apiKey)
    const analysis = parseAnalysis(raw)

    // Only trust suggestions that point at a real candidate id.
    const suggestedId = analysis.suggested_task_id && candidates.some((c) => c.id === analysis.suggested_task_id)
      ? analysis.suggested_task_id
      : null

    const { error: updateErr } = await db
      .from('tasks')
      .update({
        title: analysis.title,
        notes: analysis.note,
        capture_meta: {
          status: 'done',
          storage_path: storagePath,
          suggested_task_id: suggestedId,
          analyzed_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', taskId)
    if (updateErr) throw new Error(`Task update failed: ${updateErr.message}`)

    // File the photo as a task attachment (visible in web detail panel + iOS).
    // Skip if a row for this storage path already exists (retry safety).
    const { data: existing } = await db
      .from('attachments')
      .select('id')
      .eq('storage_path', storagePath)
      .maybeSingle()
    if (!existing) {
      const { error: attachErr } = await db.from('attachments').insert({
        user_id: user.id,
        entity_type: 'task',
        entity_id: taskId,
        file_name: body.fileName ?? storagePath.split('/').pop() ?? 'photo.jpg',
        file_type: body.fileType ?? 'image/jpeg',
        file_size: body.fileSize ?? 0,
        storage_path: storagePath,
      })
      if (attachErr) console.error('attachments insert failed:', attachErr.message)
    }

    return json({ ok: true, title: analysis.title, suggested_task_id: suggestedId })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('analyze-capture failed:', message)
    return await fail(message)
  }
})
