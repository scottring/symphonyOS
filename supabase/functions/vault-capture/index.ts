// VAULT-CAPTURE — the phone-anywhere capture path into the scotts-world vault,
// replacing Michael (the Telegram assistant, retired 2026-08-04).
//
// One function, four routes, one shared secret (high-entropy path segment —
// claude.ai custom connectors can't send custom headers, so the secret rides
// the path; blast radius if leaked = appending text to the vault inbox and
// reading/acking pending captures, nothing else):
//
//   POST /vault-capture/capture/<secret>  {text, source?}   — iOS Shortcut / curl
//   POST /vault-capture/mcp/<secret>      JSON-RPC          — Claude-app custom connector
//                                          (initialize / tools/list / tools/call)
//   POST /vault-capture/pull/<secret>                        — local sync job: unsynced rows
//   POST /vault-capture/ack/<secret>      {ids: [...]}       — local sync job: mark synced
//
// Rows land in public.vault_inbox stamped with VAULT_OWNER_USER_ID; the local
// sync job appends them to inbox/captures.md and acks. Deploy with
// --no-verify-jwt (the connector and Shortcut don't carry Supabase JWTs).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const MAX_TEXT = 10_000
const PULL_LIMIT = 200

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } })

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder()
  const ab = enc.encode(a)
  const bb = enc.encode(b)
  if (ab.length !== bb.length) return false
  let diff = 0
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i]
  return diff === 0
}

interface Db {
  insertCapture(text: string, source: string): Promise<string>
  pullUnsynced(): Promise<{ id: string; text: string; source: string; created_at: string }[]>
  ack(ids: string[]): Promise<number>
}

function makeDb(url: string, serviceKey: string, ownerId: string): Db {
  const db = createClient(url, serviceKey)
  return {
    async insertCapture(text, source) {
      const { data, error } = await db
        .from('vault_inbox')
        .insert({ user_id: ownerId, text, source })
        .select('id')
        .single()
      if (error) throw new Error(`insert failed: ${error.message}`)
      return data.id as string
    },
    async pullUnsynced() {
      const { data, error } = await db
        .from('vault_inbox')
        .select('id, text, source, created_at')
        .eq('user_id', ownerId)
        .is('synced_at', null)
        .order('created_at', { ascending: true })
        .limit(PULL_LIMIT)
      if (error) throw new Error(`pull failed: ${error.message}`)
      return data ?? []
    },
    async ack(ids) {
      const { data, error } = await db
        .from('vault_inbox')
        .update({ synced_at: new Date().toISOString() })
        .eq('user_id', ownerId)
        .in('id', ids)
        .select('id')
      if (error) throw new Error(`ack failed: ${error.message}`)
      return data?.length ?? 0
    },
  }
}

function cleanText(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const text = raw.trim()
  if (!text || text.length > MAX_TEXT) return null
  return text
}

// ── MCP (Streamable HTTP, JSON-RPC 2.0) — just enough protocol for a
// one-tool server. No SSE stream: every request gets a single JSON response.
const CAPTURE_TOOL = {
  name: 'capture_to_vault',
  description:
    "Save a quick thought, fact, decision, or commitment to Scott's personal vault inbox (scotts-world). Use for anything Scott wants remembered that isn't a household task — work ideas, strategy thoughts, things heard in conversation. The vault sync picks it up within minutes.",
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'The thought to capture, as one self-contained note.' },
    },
    required: ['text'],
  },
} as const

async function handleMcp(body: Record<string, unknown>, db: Db): Promise<Response> {
  const id = body.id ?? null
  const method = body.method
  const reply = (result: unknown) => json({ jsonrpc: '2.0', id, result })
  const err = (code: number, message: string) => json({ jsonrpc: '2.0', id, error: { code, message } })

  switch (method) {
    case 'initialize':
      return reply({
        protocolVersion: (body.params as { protocolVersion?: string } | undefined)?.protocolVersion ?? '2025-03-26',
        capabilities: { tools: {} },
        serverInfo: { name: 'scotts-vault-capture', version: '1.0.0' },
      })
    case 'notifications/initialized':
      return new Response(null, { status: 202, headers: corsHeaders })
    case 'ping':
      return reply({})
    case 'tools/list':
      return reply({ tools: [CAPTURE_TOOL] })
    case 'tools/call': {
      const params = body.params as { name?: string; arguments?: { text?: unknown } } | undefined
      if (params?.name !== 'capture_to_vault') return err(-32602, `Unknown tool: ${params?.name}`)
      const text = cleanText(params.arguments?.text)
      if (!text) return err(-32602, 'text required (1–10000 chars)')
      await db.insertCapture(text, 'claude-app')
      return reply({ content: [{ type: 'text', text: 'Captured to vault inbox — the sync picks it up within minutes.' }] })
    }
    default:
      // Unknown notifications get a quiet 202; unknown requests a JSON-RPC error.
      if (id === null || id === undefined) return new Response(null, { status: 202, headers: corsHeaders })
      return err(-32601, `Method not found: ${method}`)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const secret = Deno.env.get('CAPTURE_SECRET')
  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const ownerId = Deno.env.get('VAULT_OWNER_USER_ID')
  if (!secret || !url || !serviceKey || !ownerId) return json({ error: 'Missing server config' }, 500)

  // Path shape: /vault-capture/<route>/<secret>
  const segments = new URL(req.url).pathname.split('/').filter(Boolean)
  const route = segments[segments.length - 2]
  const givenSecret = segments[segments.length - 1]
  if (!route || !givenSecret || !timingSafeEqual(givenSecret, secret)) {
    return json({ error: 'Not found' }, 404)
  }
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  const db = makeDb(url, serviceKey, ownerId)
  try {
    switch (route) {
      case 'capture': {
        const text = cleanText(body.text)
        if (!text) return json({ error: 'text required (1–10000 chars)' }, 400)
        const source = typeof body.source === 'string' ? body.source.slice(0, 40) : 'shortcut'
        const rowId = await db.insertCapture(text, source)
        return json({ ok: true, id: rowId })
      }
      case 'pull':
        return json({ ok: true, items: await db.pullUnsynced() })
      case 'ack': {
        const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === 'string').slice(0, PULL_LIMIT) : []
        if (!ids.length) return json({ error: 'ids required' }, 400)
        return json({ ok: true, acked: await db.ack(ids) })
      }
      case 'mcp':
        return await handleMcp(body, db)
      default:
        return json({ error: 'Not found' }, 404)
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('vault-capture failed:', message)
    return json({ error: message }, 500)
  }
})
