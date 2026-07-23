import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-hub-signature-256',
}

// Map vault domain → Symphony context
function domainToContext(domain: string | undefined): string | null {
  if (!domain) return null
  const map: Record<string, string> = {
    'family': 'family',
    'stacks-data': 'work',
    'symphony-os': 'work',
    'ppvis': 'work',
    'job-search': 'personal',
    'health': 'personal',
    'personal': 'personal',
  }
  return map[domain] ?? null
}

// Parse YAML frontmatter from markdown content
function parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!match) return { frontmatter: {}, body: content }

  const yamlStr = match[1]
  const body = match[2].trim()
  const frontmatter: Record<string, unknown> = {}

  for (const line of yamlStr.split('\n')) {
    // Handle simple key: value pairs
    const kvMatch = line.match(/^(\w[\w-]*)\s*:\s*(.*)$/)
    if (!kvMatch) continue

    const key = kvMatch[1]
    let value: unknown = kvMatch[2].trim()

    // Parse arrays like [tag1, tag2]
    if (typeof value === 'string' && value.startsWith('[') && value.endsWith(']')) {
      value = value.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, ''))
    }
    // Parse linked arrays (multiline YAML arrays)
    else if (value === '') {
      // Could be start of a multiline array — handled below
      continue
    }

    frontmatter[key] = value
  }

  // Handle multiline arrays (linked: \n  - "[[foo]]")
  const linkedMatch = yamlStr.match(/linked:\s*\n((?:\s+-\s+"[^"]*"\n?)+)/)
  if (linkedMatch) {
    const items = linkedMatch[1].match(/"([^"]*)"/g)
    if (items) {
      frontmatter['linked'] = items.map(s => s.replace(/"/g, ''))
    }
  }

  return { frontmatter, body }
}

// Extract wiki-links from markdown body
function extractWikiLinks(content: string): string[] {
  const matches = content.match(/\[\[([^\]]+)\]\]/g)
  if (!matches) return []
  return matches.map(m => m.slice(2, -2)) // Remove [[ and ]]
}

// Derive title from frontmatter or filename
function deriveTitle(frontmatter: Record<string, unknown>, body: string, filePath: string): string {
  // Check for H1 heading in body
  const h1Match = body.match(/^#\s+(.+)$/m)
  if (h1Match) return h1Match[1].trim()

  // Fall back to filename
  const filename = filePath.split('/').pop()?.replace('.md', '') ?? filePath
  return filename.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

// Normalize a name for fuzzy matching: lowercase, remove hyphens, trim
function normalizeName(name: string): string {
  return name.toLowerCase().replace(/-/g, ' ').replace(/\s+/g, ' ').trim()
}

// Verify GitHub webhook signature
async function verifySignature(payload: string, signature: string, secret: string): Promise<boolean> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
  const hexSig = 'sha256=' + Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
  return hexSig === signature
}

// Generate embeddings via OpenAI
async function generateEmbedding(text: string, openAiKey: string): Promise<number[] | null> {
  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: text.slice(0, 8000), // Limit input to avoid token overflow
      }),
    })
    if (!response.ok) {
      console.error('Embedding API error:', await response.text())
      return null
    }
    const result = await response.json()
    return result.data?.[0]?.embedding ?? null
  } catch (err) {
    console.error('Embedding generation failed:', err)
    return null
  }
}

interface GitHubPushEvent {
  ref: string
  commits: {
    id: string
    added: string[]
    modified: string[]
    removed: string[]
  }[]
  repository: {
    full_name: string
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const githubPat = Deno.env.get('GITHUB_PAT')!
    const webhookSecret = Deno.env.get('GITHUB_WEBHOOK_SECRET')
    const openAiKey = Deno.env.get('OPENAI_API_KEY')
    const vaultUserId = Deno.env.get('VAULT_USER_ID')! // Scott's user ID

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Check if this is a backfill request
    const url = new URL(req.url)
    const isBackfill = url.searchParams.get('backfill') === 'true'

    if (isBackfill) {
      // Verify auth for backfill (require service role or auth header)
      const authHeader = req.headers.get('authorization')
      if (!authHeader?.includes(supabaseServiceKey) && authHeader !== `Bearer ${supabaseServiceKey}`) {
        return new Response(JSON.stringify({ error: 'Unauthorized for backfill' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Optional path prefix to process a subset (e.g. 'job-search/') so a large
      // vault can be backfilled in chunks that each fit the worker compute limit.
      const prefix = url.searchParams.get('prefix') ?? undefined
      return await handleBackfill(supabase, githubPat, openAiKey, vaultUserId, prefix)
    }

    // Normal webhook flow
    const rawBody = await req.text()

    // Verify webhook signature if secret is configured
    if (webhookSecret) {
      const signature = req.headers.get('x-hub-signature-256')
      if (!signature || !(await verifySignature(rawBody, signature, webhookSecret))) {
        return new Response(JSON.stringify({ error: 'Invalid signature' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    const payload: GitHubPushEvent = JSON.parse(rawBody)

    // Only process pushes to main branch
    if (payload.ref !== 'refs/heads/main') {
      return new Response(JSON.stringify({ message: 'Ignoring non-main branch push' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Collect all changed files across commits
    const added = new Set<string>()
    const modified = new Set<string>()
    const removed = new Set<string>()
    let lastCommitSha = ''

    for (const commit of payload.commits) {
      lastCommitSha = commit.id
      for (const f of commit.added) if (f.endsWith('.md')) added.add(f)
      for (const f of commit.modified) if (f.endsWith('.md')) modified.add(f)
      for (const f of commit.removed) if (f.endsWith('.md')) removed.add(f)
    }

    // Files that were added then removed in the same push — skip them
    for (const f of removed) {
      added.delete(f)
      modified.delete(f)
    }

    const filesToSync = [...added, ...modified]
    const attempted = filesToSync.length
    const results = { synced: 0, removed: 0, errors: [] as string[] }

    // Remove deleted files
    for (const filePath of removed) {
      const { error } = await supabase
        .from('notes')
        .delete()
        .eq('user_id', vaultUserId)
        .eq('source', 'vault')
        .eq('vault_path', filePath)

      if (error) {
        results.errors.push(`Delete ${filePath}: ${error.message}`)
      } else {
        results.removed++
      }
    }

    // Sync added/modified files
    for (const filePath of filesToSync) {
      try {
        await syncFile(supabase, githubPat, openAiKey, vaultUserId, filePath, lastCommitSha, payload.repository.full_name)
        results.synced++
      } catch (err) {
        results.errors.push(`Sync ${filePath}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    // Surface systemic failures. A webhook that always returns 200 hid an
    // expired GITHUB_PAT for a month (every file 401'd, synced stayed 0, yet
    // the delivery showed green). If we attempted files but synced none, that's
    // a real breakage — return 500 so it shows as a failed delivery, not a
    // silent no-op. Partial failures still return 200 with errors in the body.
    if (results.errors.length > 0) {
      console.error('vault-sync errors:', JSON.stringify(results.errors))
    }
    if (attempted > 0 && results.synced === 0) {
      return new Response(JSON.stringify({ ...results, systemic_failure: true }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Error in vault-sync:', error)
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

async function syncFile(
  supabase: ReturnType<typeof createClient>,
  githubPat: string,
  openAiKey: string | undefined,
  userId: string,
  filePath: string,
  commitSha: string,
  repoFullName: string,
) {
  // Skip non-content directories
  if (filePath.startsWith('.') || filePath.startsWith('scripts/') || filePath.startsWith('assets/')) {
    return
  }

  // Fetch file content from GitHub
  const response = await fetch(
    `https://api.github.com/repos/${repoFullName}/contents/${encodeURIComponent(filePath)}`,
    {
      headers: {
        'Authorization': `Bearer ${githubPat}`,
        'Accept': 'application/vnd.github.raw+json',
      },
    }
  )

  if (!response.ok) {
    throw new Error(`GitHub API error for ${filePath}: ${response.status}`)
  }

  const rawContent = await response.text()
  const { frontmatter, body } = parseFrontmatter(rawContent)
  const title = deriveTitle(frontmatter, body, filePath)
  const domain = frontmatter.domain as string | undefined
  const context = domainToContext(domain)

  // Generate embedding
  const embeddingText = `${title}\n\n${body}`.slice(0, 8000)
  const embedding = openAiKey ? await generateEmbedding(embeddingText, openAiKey) : null

  // Upsert note
  const noteData: Record<string, unknown> = {
    user_id: userId,
    title,
    content: body,
    type: 'vault_note',
    source: 'vault',
    vault_path: filePath,
    vault_domain: domain ?? null,
    vault_frontmatter: frontmatter,
    vault_last_commit_sha: commitSha,
    context: context,
    external_id: filePath,
    external_url: `https://github.com/${repoFullName}/blob/main/${filePath}`,
  }

  if (embedding) {
    noteData.embedding = JSON.stringify(embedding)
  }

  // Upsert using vault_path as the conflict key
  const { data: note, error: upsertError } = await supabase
    .from('notes')
    .upsert(noteData, { onConflict: 'user_id,vault_path', ignoreDuplicates: false })
    .select('id')
    .single()

  if (upsertError) {
    throw new Error(`Upsert error for ${filePath}: ${upsertError.message}`)
  }

  // Entity matching
  await matchEntities(supabase, userId, note.id, filePath, frontmatter, body)
}

async function matchEntities(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  noteId: string,
  filePath: string,
  frontmatter: Record<string, unknown>,
  body: string,
) {
  // Collect wiki-links from frontmatter and body
  const linkedFromFrontmatter = (frontmatter.linked as string[] || [])
    .map(l => l.replace(/\[\[|\]\]/g, ''))
  const linkedFromBody = extractWikiLinks(body)
  const allLinks = [...new Set([...linkedFromFrontmatter, ...linkedFromBody])]

  const fileType = frontmatter.type as string | undefined
  const dir = filePath.split('/')[0]

  // 1. Match people files to contacts
  if (dir === 'people' || fileType === 'person') {
    const filename = filePath.split('/').pop()?.replace('.md', '') ?? ''
    const normalizedFilename = normalizeName(filename)

    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, name')
      .eq('user_id', userId)

    if (contacts) {
      for (const contact of contacts) {
        const normalizedContact = normalizeName(contact.name)
        if (normalizedContact === normalizedFilename ||
            normalizedContact.includes(normalizedFilename) ||
            normalizedFilename.includes(normalizedContact)) {
          await upsertEntityLink(supabase, noteId, 'contact', contact.id)
          break
        }
      }
    }
  }

  // 2. Match wiki-linked people to contacts
  for (const link of allLinks) {
    const normalizedLink = normalizeName(link)

    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, name')
      .eq('user_id', userId)

    if (contacts) {
      for (const contact of contacts) {
        if (normalizeName(contact.name) === normalizedLink) {
          await upsertEntityLink(supabase, noteId, 'contact', contact.id)
          break
        }
      }
    }
  }

  // 3. Match project files to projects
  if (dir === 'projects' || fileType === 'project') {
    const normalizedTitle = normalizeName(
      (body.match(/^#\s+(.+)$/m)?.[1] ?? filePath.split('/').pop()?.replace('.md', '') ?? '')
    )

    const { data: projects } = await supabase
      .from('projects')
      .select('id, name')
      .eq('user_id', userId)

    if (projects) {
      for (const project of projects) {
        if (normalizeName(project.name).includes(normalizedTitle) ||
            normalizedTitle.includes(normalizeName(project.name))) {
          await upsertEntityLink(supabase, noteId, 'project', project.id)
          break
        }
      }
    }
  }

  // 4. Match task files to tasks
  if (dir === 'tasks' || fileType === 'task') {
    const taskTitle = body.match(/^#\s+(.+)$/m)?.[1]?.trim()
    if (taskTitle) {
      const { data: tasks } = await supabase
        .from('tasks')
        .select('id, title')
        .eq('user_id', userId)
        .ilike('title', `%${taskTitle}%`)
        .limit(1)

      if (tasks?.[0]) {
        await upsertEntityLink(supabase, noteId, 'task', tasks[0].id)
      }
    }
  }
}

async function upsertEntityLink(
  supabase: ReturnType<typeof createClient>,
  noteId: string,
  entityType: string,
  entityId: string,
) {
  const { error } = await supabase
    .from('note_entity_links')
    .upsert(
      { note_id: noteId, entity_type: entityType, entity_id: entityId, link_type: 'related' },
      { onConflict: 'note_id,entity_type,entity_id' }
    )
  if (error) {
    console.error(`Entity link error (${entityType}:${entityId}):`, error.message)
  }
}

async function handleBackfill(
  supabase: ReturnType<typeof createClient>,
  githubPat: string,
  openAiKey: string | undefined,
  userId: string,
  prefix?: string,
) {
  const repoFullName = 'scottring/scotts-world'

  // Fetch repo tree
  const treeResponse = await fetch(
    `https://api.github.com/repos/${repoFullName}/git/trees/main?recursive=1`,
    {
      headers: {
        'Authorization': `Bearer ${githubPat}`,
        'Accept': 'application/vnd.github+json',
      },
    }
  )

  if (!treeResponse.ok) {
    return new Response(JSON.stringify({ error: `GitHub tree API error: ${treeResponse.status}` }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const tree = await treeResponse.json()
  const mdFiles = tree.tree
    .filter((f: { path: string; type: string }) =>
      f.type === 'blob' &&
      f.path.endsWith('.md') &&
      !f.path.startsWith('.') &&
      !f.path.startsWith('scripts/') &&
      !f.path.startsWith('assets/') &&
      !f.path.startsWith('private/') &&
      (!prefix || f.path.startsWith(prefix))
    )
    .map((f: { path: string }) => f.path)

  const results = { total: mdFiles.length, synced: 0, errors: [] as string[] }

  // Process in batches to avoid rate limits
  const batchSize = 10
  for (let i = 0; i < mdFiles.length; i += batchSize) {
    const batch = mdFiles.slice(i, i + batchSize)
    const promises = batch.map(async (filePath: string) => {
      try {
        await syncFile(supabase, githubPat, openAiKey, userId, filePath, 'backfill', repoFullName)
        results.synced++
      } catch (err) {
        results.errors.push(`${filePath}: ${err instanceof Error ? err.message : String(err)}`)
      }
    })
    await Promise.all(promises)

    // Small delay between batches to respect rate limits
    if (i + batchSize < mdFiles.length) {
      await new Promise(r => setTimeout(r, 500))
    }
  }

  return new Response(JSON.stringify(results), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
