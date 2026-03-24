import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface EntityContext {
  type: 'task' | 'contact' | 'project' | 'event' | 'routine'
  id: string
  name: string
}

interface ChatRequest {
  messages: ChatMessage[]
  entityContext?: EntityContext
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    const openAiKey = Deno.env.get('OPENAI_API_KEY')

    if (!anthropicKey) {
      return new Response(JSON.stringify({ error: 'Anthropic API key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (!openAiKey) {
      return new Response(JSON.stringify({ error: 'OpenAI API key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Auth
    const authHeader = req.headers.get('authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // User-scoped client for RLS
    const userSupabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    // Service client for reading entity details
    const serviceSupabase = createClient(supabaseUrl, supabaseServiceKey)

    // Verify user
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await serviceSupabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { messages, entityContext }: ChatRequest = await req.json()

    if (!messages?.length) {
      return new Response(JSON.stringify({ error: 'messages array is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ================================================================
    // 1. Gather context
    // ================================================================
    const contextParts: string[] = []
    const sourceNotes: { id: string; title: string; vaultPath?: string }[] = []

    // Always include today's tasks as baseline context
    {
      // Use date string to avoid timezone issues (tasks store dates as YYYY-MM-DD or timestamps)
      const now = new Date()
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      const tomorrowDate = new Date(now)
      tomorrowDate.setDate(tomorrowDate.getDate() + 1)
      const tomorrowStr = `${tomorrowDate.getFullYear()}-${String(tomorrowDate.getMonth() + 1).padStart(2, '0')}-${String(tomorrowDate.getDate()).padStart(2, '0')}`

      const { data: todayTasks, error: tasksErr } = await serviceSupabase
        .from('tasks')
        .select('id, title, completed, scheduled_for, context, notes, phone_number, location')
        .eq('user_id', user.id)
        .gte('scheduled_for', todayStr)
        .lt('scheduled_for', tomorrowStr)
        .order('scheduled_for', { ascending: true })
        .limit(30)

      console.log(`Tasks query for ${todayStr}: found ${todayTasks?.length ?? 0}, error: ${tasksErr?.message ?? 'none'}`)

      if (todayTasks?.length) {
        contextParts.push("## Today's Tasks\n" + todayTasks.map(t => {
          const status = t.completed ? '[done]' : '[todo]'
          const time = t.scheduled_for ? new Date(t.scheduled_for).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : 'All day'
          const extra = [
            t.context && `(${t.context})`,
            t.notes && `Notes: ${t.notes.slice(0, 200)}`,
            t.phone_number && `Phone: ${t.phone_number}`,
            t.location && `Location: ${t.location}`,
          ].filter(Boolean).join(' | ')
          return `- ${status} ${time}: ${t.title}${extra ? ' — ' + extra : ''}`
        }).join('\n'))
      }
    }

    // Fetch entity details if viewing something specific
    if (entityContext) {
      const entityDetails = await fetchEntityDetails(serviceSupabase, user.id, entityContext)
      if (entityDetails) {
        contextParts.push(`## Currently Viewing: ${entityContext.type}\n${entityDetails}`)
      }

      // Fetch notes already linked to this entity (via note_entity_links)
      const { data: linkedLinks } = await userSupabase
        .from('note_entity_links')
        .select('note_id')
        .eq('entity_type', entityContext.type)
        .eq('entity_id', entityContext.id)

      if (linkedLinks?.length) {
        const noteIds = linkedLinks.map(l => l.note_id)
        const { data: linkedNotes } = await userSupabase
          .from('notes')
          .select('id, title, content, vault_path, vault_domain')
          .in('id', noteIds)
          .limit(10)

        if (linkedNotes?.length) {
          contextParts.push('## Linked Notes\n' + linkedNotes.map(n => {
            sourceNotes.push({ id: n.id, title: n.title || 'Untitled', vaultPath: n.vault_path })
            return `### ${n.title || 'Untitled'}${n.vault_domain ? ` [${n.vault_domain}]` : ''}\n${n.content?.slice(0, 1500) || '(empty)'}`
          }).join('\n\n'))
        }
      }
    }

    // Semantic search for the latest user message
    const lastUserMessage = messages.filter(m => m.role === 'user').pop()?.content
    if (lastUserMessage) {
      // Generate embedding for user's question
      const embResponse = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'text-embedding-3-small',
          input: lastUserMessage,
        }),
      })

      if (embResponse.ok) {
        const embResult = await embResponse.json()
        const queryEmbedding = embResult.data?.[0]?.embedding

        if (queryEmbedding) {
          const { data: semanticResults, error: searchErr } = await userSupabase.rpc('search_notes_semantic', {
            query_embedding: JSON.stringify(queryEmbedding),
            match_threshold: 0.3,
            match_count: 8,
            filter_vault_domain: null,
          })
          console.log(`Semantic search for "${lastUserMessage}": ${semanticResults?.length ?? 0} results, error: ${searchErr?.message ?? 'none'}`)

          if (semanticResults?.length) {
            // Deduplicate against already-linked notes
            const existingIds = new Set(sourceNotes.map(n => n.id))
            const newResults = semanticResults.filter((r: { id: string }) => !existingIds.has(r.id))

            if (newResults.length) {
              contextParts.push('## Related Notes (semantic search)\n' + newResults.map((r: { id: string; title: string; content: string; vault_path: string; vault_domain: string; similarity: number }) => {
                sourceNotes.push({ id: r.id, title: r.title || 'Untitled', vaultPath: r.vault_path })
                return `### ${r.title || 'Untitled'}${r.vault_domain ? ` [${r.vault_domain}]` : ''} (relevance: ${Math.round(r.similarity * 100)}%)\n${r.content?.slice(0, 1500) || '(empty)'}`
              }).join('\n\n'))
            }
          }
        }
      }
    }

    // ================================================================
    // 2. Build prompt and call Haiku
    // ================================================================
    const systemPrompt = `You are Symphony's contextual AI assistant. You help the user manage work, life, and family by surfacing the right information at the right moment.

You have access to the user's vault notes (personal knowledge base) and Symphony data (tasks, contacts, projects, calendar events). When answering:

- Be concise and actionable. No filler.
- Reference specific information from the context provided.
- If you cite a vault note, mention its title so the user can find it.
- If you don't have enough context to answer, say so plainly.
- Never make up information that isn't in the provided context.
- The user has Parkinson's disease. Keep responses focused and easy to act on.

${contextParts.length > 0 ? '---\n\n# Available Context\n\n' + contextParts.join('\n\n---\n\n') : 'No additional context available for this query.'}`

    const anthropicMessages = messages.map(m => ({
      role: m.role,
      content: m.content,
    }))

    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemPrompt,
        messages: anthropicMessages,
      }),
    })

    if (!anthropicResponse.ok) {
      const errText = await anthropicResponse.text()
      console.error('Anthropic API error:', errText)
      return new Response(JSON.stringify({ error: 'AI response failed', details: errText }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const anthropicResult = await anthropicResponse.json()
    const assistantMessage = anthropicResult.content?.[0]?.text ?? 'No response generated.'

    return new Response(JSON.stringify({
      message: assistantMessage,
      sources: sourceNotes,
      usage: anthropicResult.usage,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Error in symphony-chat:', error)
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error', stack: error instanceof Error ? error.stack : undefined }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

async function fetchEntityDetails(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  entity: EntityContext,
): Promise<string | null> {
  switch (entity.type) {
    case 'task': {
      const { data } = await supabase
        .from('tasks')
        .select('title, notes, scheduled_for, context, completed, phone_number, location')
        .eq('id', entity.id)
        .eq('user_id', userId)
        .single()
      if (!data) return null
      const parts = [`**${data.title}**`]
      if (data.scheduled_for) parts.push(`Scheduled: ${data.scheduled_for}`)
      if (data.context) parts.push(`Context: ${data.context}`)
      if (data.completed) parts.push('Status: Completed')
      if (data.notes) parts.push(`Notes: ${data.notes}`)
      if (data.phone_number) parts.push(`Phone: ${data.phone_number}`)
      if (data.location) parts.push(`Location: ${data.location}`)
      return parts.join('\n')
    }
    case 'contact': {
      const { data } = await supabase
        .from('contacts')
        .select('name, phone, email, notes, category, relationship, preferences')
        .eq('id', entity.id)
        .eq('user_id', userId)
        .single()
      if (!data) return null
      const parts = [`**${data.name}**`]
      if (data.category) parts.push(`Category: ${data.category}`)
      if (data.relationship) parts.push(`Relationship: ${data.relationship}`)
      if (data.phone) parts.push(`Phone: ${data.phone}`)
      if (data.email) parts.push(`Email: ${data.email}`)
      if (data.notes) parts.push(`Notes: ${data.notes}`)
      if (data.preferences) parts.push(`Preferences: ${data.preferences}`)
      return parts.join('\n')
    }
    case 'project': {
      const { data } = await supabase
        .from('projects')
        .select('name, notes, status, context')
        .eq('id', entity.id)
        .eq('user_id', userId)
        .single()
      if (!data) return null
      const parts = [`**${data.name}**`]
      if (data.status) parts.push(`Status: ${data.status}`)
      if (data.context) parts.push(`Context: ${data.context}`)
      if (data.notes) parts.push(`Notes: ${data.notes}`)
      return parts.join('\n')
    }
    default:
      return null
  }
}
