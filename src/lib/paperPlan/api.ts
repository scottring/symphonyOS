// Calls to the plan-from-paper edge function. Every failure becomes a
// PaperPlanError carrying a stable code (errors.ts), never a raw message.
import { supabase } from '@/lib/supabase'
import type { Analysis, PlanContext } from '../../../supabase/functions/plan-from-paper/lib/plan'
import { PaperPlanError, codeFromBody } from './errors'
import type { ChatTurn } from './importState'

async function call<T>(body: Record<string, unknown>): Promise<T> {
  let data: unknown
  let fnErr: unknown
  try {
    ({ data, error: fnErr } = await supabase.functions.invoke('plan-from-paper', { body }))
  } catch {
    throw new PaperPlanError('network')
  }
  if (fnErr) {
    const ctx = (fnErr as { name?: string; context?: Response }).context
    if ((fnErr as { name?: string }).name === 'FunctionsFetchError') throw new PaperPlanError('network')
    let parsed: unknown = null
    try { parsed = await ctx?.json() } catch { /* not JSON */ }
    throw new PaperPlanError(codeFromBody(parsed, ctx?.status))
  }
  // Once the reading starts the response is already 200, so a failure after
  // that point arrives in the body.
  if (data && typeof data === 'object' && 'error' in data) throw new PaperPlanError(codeFromBody(data))
  if (!data || typeof data !== 'object' || !('ok' in data)) throw new PaperPlanError('reply_unreadable')
  return data as T
}

export function analyzePages(storagePaths: string[], instructions: string, context: PlanContext) {
  return call<{ ok: true; analysis: Analysis }>({ action: 'analyze', storagePaths, instructions, context })
}

export function revisePlan(analysis: Analysis, conversation: ChatTurn[], message: string, instructions: string, context: PlanContext) {
  return call<{ ok: true; reply: string; changes: string[]; analysis: Analysis }>({
    action: 'revise',
    analysis,
    instructions,
    context,
    message,
    conversation: conversation.map((t) => ({ role: t.role, text: t.text })),
  })
}
