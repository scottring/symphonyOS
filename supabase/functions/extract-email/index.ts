// Receive-only extraction: publish a review proposal, never write a plan.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildEmailPrompt, parseEmailExtraction } from './lib/prompt.ts'
import {
  buildSchoolMailReview,
  isForwardingConfirmation,
} from './lib/review.ts'
import type { Member } from './lib/types.ts'
import { AiUsageError, guardedAiFetchFor } from '../_shared/aiUsage.ts'

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-capture-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers })

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return json({ ok: true })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)
  const secret = Deno.env.get('CAPTURE_SHARED_SECRET')
  if (!secret || req.headers.get('x-capture-secret') !== secret) {
    return json({ error: 'unauthorized' }, 401)
  }
  const { capture_id } = await req.json().catch(() => ({}))
  if (typeof capture_id !== 'string') {
    return json({ error: 'capture_id required' }, 400)
  }
  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  const { data: capture, error: readError } = await db.from('captures').select(
    '*',
  ).eq('id', capture_id).maybeSingle()
  if (readError) return json({ error: 'Could not load email' }, 500)
  if (!capture || capture.kind !== 'email' || !capture.household_id) {
    return json({ error: 'School email not found' }, 404)
  }
  const { data: lease, error: claimError } = await db.rpc(
    'claim_school_mail_review',
    { p_capture: capture_id },
  )
  if (claimError) return json({ error: 'Could not start email review' }, 500)
  if (!lease) return json({ ok: true, already_processing_or_reviewed: true })
  try {
    const { data: hh, error: hhError } = await db.from('households').select(
      'timezone',
    ).eq('id', capture.household_id).single()
    if (hhError) throw hhError
    const { data: membership, error: membershipError } = await db.from(
      'household_members',
    ).select('user_id').eq('household_id', capture.household_id).eq(
      'status',
      'active',
    ).neq('role', 'display')
    if (membershipError || !membership?.length) {
      throw new Error('Household unavailable')
    }
    const { data: roster, error: rosterError } = await db.from('family_members')
      .select('id,name,role_label,is_full_user').in(
        'user_id',
        membership.map((m) => m.user_id),
      ).eq('member_type', 'core')
    if (rosterError) throw rosterError
    const members: Member[] = (roster ?? []).map((m) => ({
      id: m.id,
      name: m.name,
      isChild: m.role_label === 'child' ||
        (m.role_label !== 'parent' && !m.is_full_user),
    }))
    // Anchor relative dates to arrival, including a delayed extraction retry.
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: hh.timezone ?? 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(capture.created_at))
    let proposal
    if (isForwardingConfirmation(capture.sender ?? '', capture.subject ?? '')) {
      proposal = { items: [], gaps: [], confirmation: true }
    } else {
      const fullBody = (capture.raw_text ?? '').replace(
        /^Subject: .*\nFrom: .*\n\n/,
        '',
      )
      const prompt = buildEmailPrompt({
        subject: capture.subject ?? 'Email',
        sender: capture.source_label ?? 'School',
        body: fullBody.slice(0, 60000),
        members,
        todayYmd: today,
        truncated: fullBody.length > 60000,
      })
      const paidFetch = guardedAiFetchFor(db, capture.user_id, 'extract-email')
      const response = await paidFetch(
        'https://api.anthropic.com/v1/messages',
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-5',
            max_tokens: 4096,
            messages: [{ role: 'user', content: prompt }],
          }),
        },
      )
      if (!response.ok) {
        throw new Error(`Email extraction returned ${response.status}`)
      }
      const output = await response.json()
      if (
        output.stop_reason === 'max_tokens' || output.stop_reason === 'refusal'
      ) throw new Error('Incomplete email extraction')
      const raw = output.content?.find((b: { type: string }) =>
        b.type === 'text'
      )?.text
      if (typeof raw !== 'string') {
        throw new Error('No email extraction returned')
      }
      // Never turn malformed output into a successful empty review.
      const decoded = JSON.parse(
        raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, ''),
      )
      if (
        !decoded ||
        !['events', 'todos', 'good_to_know', 'gaps'].every((key) =>
          Array.isArray(decoded[key])
        )
      ) throw new Error('Invalid email extraction')
      proposal = buildSchoolMailReview(
        parseEmailExtraction(raw),
        members,
        today,
      )
      if (fullBody.includes('[Attachments not read:')) {
        proposal.gaps.push(
          'Attachments have not been read. Check them in the original email before saving.',
        )
      }
    }
    const { data: finished, error: finishError } = await db.rpc(
      'finish_school_mail_review',
      { p_capture: capture_id, p_lease: lease, p_proposal: proposal },
    )
    if (finishError || !finished) {
      throw new Error('Could not publish email review')
    }
    return json({
      ok: true,
      review_required: true,
      suggestions: proposal.items.length,
    })
  } catch (error) {
    console.error(
      'School email review failed',
      capture_id,
      error instanceof AiUsageError
        ? error.code
        : error instanceof Error
        ? error.message
        : 'Unknown error',
    )
    await db.rpc('finish_school_mail_review', {
      p_capture: capture_id,
      p_lease: lease,
      p_proposal: null,
      p_failed: true,
    })
    return json({
      error: 'Could not read this email. Please retry.',
      ...(error instanceof AiUsageError
        ? { code: error.code, retry_at: error.retryAt }
        : {}),
    }, error instanceof AiUsageError ? error.status : 500)
  }
})
