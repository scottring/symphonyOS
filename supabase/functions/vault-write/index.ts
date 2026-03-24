import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const REPO = 'scottring/scotts-world'

// Map Symphony context back to vault domain
function contextToDomain(context: string | null | undefined): string | undefined {
  if (!context) return undefined
  const map: Record<string, string> = {
    'family': 'family',
    'work': 'stacks-data',
    'personal': 'personal',
  }
  return map[context] ?? undefined
}

// Build YAML frontmatter string from key-value pairs
function buildFrontmatter(fields: Record<string, unknown>): string {
  const lines: string[] = ['---']
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue
    if (Array.isArray(value)) {
      lines.push(`${key}: [${value.map(v => `"${v}"`).join(', ')}]`)
    } else if (typeof value === 'string' && value.includes('\n')) {
      lines.push(`${key}: |`)
      for (const line of value.split('\n')) {
        lines.push(`  ${line}`)
      }
    } else {
      lines.push(`${key}: ${JSON.stringify(value)}`)
    }
  }
  lines.push('---')
  return lines.join('\n')
}

// Generate a vault path from title and domain
function generateVaultPath(title: string, domain?: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  if (domain) {
    return `${domain}/${slug}.md`
  }
  return `notes/${slug}.md`
}

// Get or create file via GitHub Contents API
async function pushToGitHub(
  githubPat: string,
  filePath: string,
  content: string,
  commitMessage: string,
): Promise<{ sha: string; htmlUrl: string }> {
  // 1. Check if file already exists (need SHA for updates)
  let existingSha: string | undefined
  const getResponse = await fetch(
    `https://api.github.com/repos/${REPO}/contents/${encodeURIComponent(filePath)}`,
    {
      headers: {
        'Authorization': `Bearer ${githubPat}`,
        'Accept': 'application/vnd.github+json',
      },
    },
  )

  if (getResponse.ok) {
    const existing = await getResponse.json()
    existingSha = existing.sha
  } else if (getResponse.status !== 404) {
    throw new Error(`GitHub GET error: ${getResponse.status} ${await getResponse.text()}`)
  }

  // 2. PUT to create or update
  const base64Content = btoa(unescape(encodeURIComponent(content)))

  const putBody: Record<string, unknown> = {
    message: commitMessage,
    content: base64Content,
  }
  if (existingSha) {
    putBody.sha = existingSha
  }

  const putResponse = await fetch(
    `https://api.github.com/repos/${REPO}/contents/${encodeURIComponent(filePath)}`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${githubPat}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(putBody),
    },
  )

  if (!putResponse.ok) {
    throw new Error(`GitHub PUT error: ${putResponse.status} ${await putResponse.text()}`)
  }

  const result = await putResponse.json()
  return {
    sha: result.commit.sha,
    htmlUrl: result.content.html_url,
  }
}

interface PushExistingNoteRequest {
  noteId: string
  commitMessage?: string
}

interface CreateNewNoteRequest {
  title: string
  content: string
  domain?: string
  vaultPath?: string
  commitMessage?: string
}

type VaultWriteRequest = PushExistingNoteRequest | CreateNewNoteRequest

function isExistingNoteRequest(body: VaultWriteRequest): body is PushExistingNoteRequest {
  return 'noteId' in body && typeof body.noteId === 'string'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const githubPat = Deno.env.get('GITHUB_PAT')!
    const vaultUserId = Deno.env.get('VAULT_USER_ID')!

    // Auth: verify JWT and check user is the vault owner
    const authHeader = req.headers.get('authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (user.id !== vaultUserId) {
      return new Response(JSON.stringify({ error: 'Unauthorized: only the vault owner can write to the vault' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body: VaultWriteRequest = await req.json()
    const now = new Date().toISOString().split('T')[0] // YYYY-MM-DD

    let markdownContent: string
    let vaultPath: string
    let noteId: string | null = null
    let title: string
    let domain: string | undefined

    if (isExistingNoteRequest(body)) {
      // ── Existing note: fetch from DB and generate markdown ──
      noteId = body.noteId

      const { data: note, error: fetchError } = await supabase
        .from('notes')
        .select('*')
        .eq('id', noteId)
        .eq('user_id', vaultUserId)
        .single()

      if (fetchError || !note) {
        return new Response(JSON.stringify({ error: 'Note not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      title = note.title || 'Untitled'
      domain = note.vault_domain || contextToDomain(note.context) || undefined
      vaultPath = note.vault_path || generateVaultPath(title, domain)

      // Build frontmatter from existing vault_frontmatter or generate fresh
      const frontmatterFields: Record<string, unknown> = {
        title,
        domain: domain || undefined,
        created: note.created_at?.split('T')[0] || now,
        updated: now,
        source: 'symphony',
        tags: (note.vault_frontmatter as Record<string, unknown>)?.tags || [],
      }

      // Preserve any extra frontmatter fields from the vault
      if (note.vault_frontmatter) {
        const preserved = note.vault_frontmatter as Record<string, unknown>
        for (const [key, value] of Object.entries(preserved)) {
          if (!frontmatterFields[key]) {
            frontmatterFields[key] = value
          }
        }
      }

      const frontmatter = buildFrontmatter(frontmatterFields)
      markdownContent = `${frontmatter}\n\n${note.content}`

    } else {
      // ── New note: use provided content directly ──
      title = body.title
      domain = body.domain || undefined
      vaultPath = body.vaultPath || generateVaultPath(title, domain)

      const frontmatterFields: Record<string, unknown> = {
        title,
        domain: domain || undefined,
        created: now,
        updated: now,
        source: 'symphony',
        tags: [],
      }

      const frontmatter = buildFrontmatter(frontmatterFields)
      markdownContent = `${frontmatter}\n\n${body.content}`
    }

    // ── Push to GitHub ──
    const commitMessage = body.commitMessage || `Update from Symphony: ${title}`
    const { sha, htmlUrl } = await pushToGitHub(githubPat, vaultPath, markdownContent, commitMessage)

    // ── Update or create the note in Symphony DB ──
    if (noteId) {
      // Update existing note
      const { error: updateError } = await supabase
        .from('notes')
        .update({
          vault_path: vaultPath,
          vault_last_commit_sha: sha,
          vault_domain: domain || null,
          source: 'vault',
          external_url: htmlUrl,
        })
        .eq('id', noteId)

      if (updateError) {
        console.error('DB update error after successful GitHub push:', updateError)
        // Don't fail — the file is already in GitHub
      }
    } else {
      // Create a new note in Symphony linked to the vault file
      const context = domain ? (
        { 'family': 'family', 'stacks-data': 'work', 'symphony-os': 'work', 'ppvis': 'work', 'job-search': 'personal', 'health': 'personal', 'personal': 'personal' }[domain] ?? null
      ) : null

      const { data: newNote, error: insertError } = await supabase
        .from('notes')
        .insert({
          user_id: vaultUserId,
          title,
          content: body.content,
          type: 'vault_note',
          source: 'vault',
          vault_path: vaultPath,
          vault_domain: domain || null,
          vault_last_commit_sha: sha,
          context,
          external_url: htmlUrl,
          external_id: vaultPath,
        })
        .select('id')
        .single()

      if (insertError) {
        console.error('DB insert error after successful GitHub push:', insertError)
      }

      noteId = newNote?.id || null
    }

    return new Response(JSON.stringify({
      success: true,
      noteId,
      vaultPath,
      commitSha: sha,
      githubUrl: htmlUrl,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Error in vault-write:', error)
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
