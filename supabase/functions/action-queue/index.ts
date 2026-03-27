import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Auth
    const authHeader = req.headers.get('authorization')
    if (!authHeader) {
      return jsonResponse({ error: 'Missing authorization header' }, 401)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Service client for auth verification and action execution
    const serviceSupabase = createClient(supabaseUrl, supabaseServiceKey)

    // User-scoped client for RLS queries
    const userSupabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    // Verify user
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await serviceSupabase.auth.getUser(token)
    if (authError || !user) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    const body = await req.json()
    const { operation } = body

    // ─── LIST: List pending actions ──────────────────────────────────
    if (operation === 'list') {
      const { data, error } = await userSupabase
        .from('action_queue')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error fetching actions:', error)
        return jsonResponse({ error: error.message }, 500)
      }

      return jsonResponse({ actions: data })
    }

    // ─── CREATE: Create a new pending action ─────────────────────────
    if (operation === 'create') {
      const { action_type, summary, payload, source, source_ref, context, expires_at } = body

      if (!action_type || !summary || !source) {
        return jsonResponse({ error: 'action_type, summary, and source are required' }, 400)
      }

      const { data, error } = await userSupabase
        .from('action_queue')
        .insert({
          user_id: user.id,
          action_type,
          summary,
          payload: payload || {},
          source,
          source_ref: source_ref || null,
          context: context || {},
          expires_at: expires_at || null,
        })
        .select()
        .single()

      if (error) {
        console.error('Error creating action:', error)
        return jsonResponse({ error: error.message }, 500)
      }

      return jsonResponse({ action: data }, 201)
    }

    // ─── RESOLVE: Approve or reject an action ────────────────────────
    if (operation === 'resolve') {
      const { id, status, payload: modifiedPayload } = body

      if (!id || !status) {
        return jsonResponse({ error: 'id and status are required' }, 400)
      }

      if (!['approved', 'rejected'].includes(status)) {
        return jsonResponse({ error: 'status must be "approved" or "rejected"' }, 400)
      }

      // Verify user owns this action
      const { data: existing, error: fetchError } = await userSupabase
        .from('action_queue')
        .select('*')
        .eq('id', id)
        .single()

      if (fetchError || !existing) {
        return jsonResponse({ error: 'Action not found' }, 404)
      }

      if (existing.status !== 'pending') {
        return jsonResponse({ error: `Action is already ${existing.status}` }, 409)
      }

      // If rejected, just update status
      if (status === 'rejected') {
        const { data, error } = await userSupabase
          .from('action_queue')
          .update({ status: 'rejected' })
          .eq('id', id)
          .select()
          .single()

        if (error) {
          return jsonResponse({ error: error.message }, 500)
        }
        return jsonResponse({ action: data })
      }

      // If approved, execute the action
      const actionPayload = modifiedPayload || existing.payload
      let executionResult: Record<string, unknown> = {}
      let finalStatus = 'executed'
      let errorMessage: string | null = null

      try {
        executionResult = await executeAction(
          serviceSupabase,
          userSupabase,
          user.id,
          existing.action_type,
          actionPayload,
        )
      } catch (err) {
        finalStatus = 'failed'
        errorMessage = err instanceof Error ? err.message : 'Execution failed'
        console.error(`Action execution failed [${existing.action_type}]:`, err)
      }

      const updateData: Record<string, unknown> = {
        status: finalStatus,
        payload: actionPayload,
        executed_at: new Date().toISOString(),
        execution_result: executionResult,
        error_message: errorMessage,
      }

      const { data, error } = await userSupabase
        .from('action_queue')
        .update(updateData)
        .eq('id', id)
        .select()
        .single()

      if (error) {
        return jsonResponse({ error: error.message }, 500)
      }

      return jsonResponse({ action: data })
    }

    return jsonResponse({ error: `Unknown operation: ${operation}. Use "list", "create", or "resolve".` }, 400)
  } catch (error) {
    console.error('Error in action-queue:', error)
    return jsonResponse({
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500)
  }
})

// ─── Action Executors ────────────────────────────────────────────────────────

async function executeAction(
  serviceSupabase: ReturnType<typeof createClient>,
  userSupabase: ReturnType<typeof createClient>,
  userId: string,
  actionType: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  switch (actionType) {
    case 'send_email':
      return executeSendEmail(payload)

    case 'create_task':
      return executeCreateTask(serviceSupabase, userId, payload)

    case 'schedule_meeting':
      return executeScheduleMeeting(payload)

    case 'update_contact':
      return executeUpdateContact(userSupabase, payload)

    case 'write_vault_note':
      return executeWriteVaultNote(userSupabase, userId, payload)

    case 'send_text':
      return executeSendText(payload)

    default:
      throw new Error(`Unknown action type: ${actionType}`)
  }
}

// Placeholder — will integrate with email sending service
async function executeSendEmail(
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  console.log('Send email action executed (placeholder):', {
    to: payload.to,
    subject: payload.subject,
  })
  return {
    status: 'placeholder',
    message: 'Email sending not yet implemented. Logged for manual action.',
    to: payload.to,
    subject: payload.subject,
  }
}

// Create a task in the tasks table
async function executeCreateTask(
  serviceSupabase: ReturnType<typeof createClient>,
  userId: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const taskData: Record<string, unknown> = {
    user_id: userId,
    title: payload.title,
    completed: false,
    bucket: payload.bucket || 'inbox',
    scheduled_for: payload.scheduled_for || null,
    context: payload.context || null,
    notes: payload.notes || null,
    phone_number: payload.phone_number || null,
    project_id: payload.project_id || null,
    contact_id: payload.contact_id || null,
    category: payload.category || 'task',
  }

  const { data, error } = await serviceSupabase
    .from('tasks')
    .insert(taskData)
    .select('id, title')
    .single()

  if (error) throw new Error(`Failed to create task: ${error.message}`)

  return { task_id: data.id, title: data.title }
}

// Placeholder — will integrate with Google Calendar API
async function executeScheduleMeeting(
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  console.log('Schedule meeting action executed (placeholder):', {
    title: payload.title,
    start_time: payload.start_time,
    attendees: payload.attendees,
  })
  return {
    status: 'placeholder',
    message: 'Meeting scheduling not yet implemented. Logged for manual action.',
    title: payload.title,
  }
}

// Update a contact record
async function executeUpdateContact(
  userSupabase: ReturnType<typeof createClient>,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const contactId = payload.contact_id as string
  if (!contactId) throw new Error('contact_id is required in payload')

  const updates: Record<string, unknown> = {}
  const allowedFields = ['name', 'phone', 'email', 'notes', 'category', 'relationship', 'preferences']
  for (const field of allowedFields) {
    if (payload[field] !== undefined) {
      updates[field] = payload[field]
    }
  }

  if (Object.keys(updates).length === 0) {
    throw new Error('No valid fields to update')
  }

  const { data, error } = await userSupabase
    .from('contacts')
    .update(updates)
    .eq('id', contactId)
    .select('id, name')
    .single()

  if (error) throw new Error(`Failed to update contact: ${error.message}`)

  return { contact_id: data.id, name: data.name, updated_fields: Object.keys(updates) }
}

// Write a note to the vault via the notes table
async function executeWriteVaultNote(
  userSupabase: ReturnType<typeof createClient>,
  userId: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const noteData: Record<string, unknown> = {
    user_id: userId,
    title: payload.title || 'Untitled',
    content: payload.content || '',
    vault_path: payload.vault_path || null,
    vault_domain: payload.vault_domain || null,
  }

  const { data, error } = await userSupabase
    .from('notes')
    .insert(noteData)
    .select('id, title')
    .single()

  if (error) throw new Error(`Failed to write vault note: ${error.message}`)

  return { note_id: data.id, title: data.title }
}

// Send a text message via Open Brain's iMessage integration
async function executeSendText(
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const to = payload.to as string
  const message = payload.message as string
  const service = (payload.service as string) || 'iMessage'

  if (!to || !message) {
    throw new Error('Both "to" and "message" are required in payload')
  }

  const openBrainUrl = Deno.env.get('OPEN_BRAIN_URL')
  const openBrainApiKey = Deno.env.get('OPEN_BRAIN_API_KEY')

  if (!openBrainUrl) {
    throw new Error('OPEN_BRAIN_URL not configured — cannot send text messages')
  }

  const response = await fetch(`${openBrainUrl}/api/messages/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(openBrainApiKey ? { 'X-Api-Key': openBrainApiKey } : {}),
    },
    body: JSON.stringify({ to, message, service }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`Failed to send text: ${response.status} ${errorBody}`)
  }

  const result = await response.json()
  return {
    sent: result.sent,
    to,
    service: result.service,
    message_preview: message.slice(0, 100),
  }
}
