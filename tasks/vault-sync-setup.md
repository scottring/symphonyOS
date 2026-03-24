# Vault Sync + AI Chat: Setup Guide

## Overview

This system syncs the scotts-world Obsidian vault into Symphony's notes table via GitHub webhooks, generates pgvector embeddings for semantic search, and provides a context-aware AI chat powered by Claude Haiku.

## Step 1: Apply Database Migration

Run migration 069_vault_sync.sql via the Supabase Management API:

```bash
curl -X POST "https://api.supabase.com/v1/projects/mwadppyrqzuzgstmwpuy/database/query" \
  -H "Authorization: Bearer YOUR_SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "CONTENTS_OF_069_vault_sync.sql"}'
```

This adds:
- `vault_path`, `vault_domain`, `vault_frontmatter`, `vault_last_commit_sha` columns to notes
- pgvector extension + embedding column + HNSW index
- `search_notes_semantic()` RPC function
- `vault_domain_to_context()` helper function
- Updated CHECK constraints for `type` and `source`

## Step 2: Set Edge Function Secrets

```bash
# Get Scott's user ID from Supabase Auth dashboard
supabase secrets set VAULT_USER_ID=<scott-user-uuid>

# GitHub PAT with repo read access to scottring/scotts-world
supabase secrets set GITHUB_PAT=<github-personal-access-token>

# Webhook secret (generate a random string)
supabase secrets set GITHUB_WEBHOOK_SECRET=$(openssl rand -hex 32)

# Anthropic API key for Claude Haiku chat
supabase secrets set ANTHROPIC_API_KEY=<anthropic-api-key>

# OpenAI key should already be set (used by other edge functions)
# supabase secrets set OPENAI_API_KEY=<already-set>
```

## Step 3: Deploy Edge Functions

```bash
supabase functions deploy vault-sync
supabase functions deploy semantic-search
supabase functions deploy symphony-chat
```

## Step 4: Configure GitHub Webhook

1. Go to https://github.com/scottring/scotts-world/settings/hooks
2. Click "Add webhook"
3. **Payload URL:** `https://mwadppyrqzuzgstmwpuy.supabase.co/functions/v1/vault-sync`
4. **Content type:** `application/json`
5. **Secret:** The same value you set for `GITHUB_WEBHOOK_SECRET`
6. **Events:** Just the push event
7. Click "Add webhook"

## Step 5: Run Initial Backfill

Sync all existing vault files (run once):

```bash
curl -X POST "https://mwadppyrqzuzgstmwpuy.supabase.co/functions/v1/vault-sync?backfill=true" \
  -H "Authorization: Bearer YOUR_SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json"
```

This will:
- Fetch all ~191 .md files from the vault repo
- Parse frontmatter + body
- Upsert to notes table with entity links
- Generate embeddings for semantic search
- Process in batches of 10 with 500ms delays

## Step 6: Verify

1. Check Supabase notes table for rows with `source = 'vault'`
2. Edit a vault file, wait for auto-commit (5 min)
3. Check that the webhook fires and the note updates
4. Open a contact in Symphony that has a matching vault people file
5. Verify vault notes appear in EntityNotesSection
6. Click the chat FAB and ask a question

## Architecture

```
Vault edit → auto-commit (5 min) → GitHub push
  → webhook → vault-sync edge function
  → parse markdown + YAML frontmatter
  → upsert to notes table (vault_path as dedup key)
  → generate OpenAI embedding
  → match entities (people→contacts, tasks→tasks, projects→projects)
  → create note_entity_links

Chat question → symphony-chat edge function
  → fetch entity details (if viewing task/contact/project)
  → fetch linked notes via note_entity_links
  → generate embedding for question → pgvector semantic search
  → build context from linked + semantic results
  → call Claude Haiku with context
  → return response + source attributions
```

## Privacy

| Vault domain | Symphony context | Shared with Iris? |
|---|---|---|
| family | family | Yes |
| stacks-data | work | No |
| symphony-os | work | No |
| ppvis | work | No |
| job-search | personal | No |
| health | personal | No |
| personal | personal | No |

Privacy is enforced by:
1. `context` column on notes (mapped from vault domain during sync)
2. Existing RLS policy from migration 063: `auth.uid() = user_id OR (context = 'family' AND users_share_household(...))`
3. `search_notes_semantic()` function also respects this policy

## Files Created

| File | Purpose |
|------|---------|
| `supabase/migrations/069_vault_sync.sql` | Schema changes + pgvector + RPC |
| `supabase/functions/vault-sync/index.ts` | GitHub webhook handler + backfill |
| `supabase/functions/semantic-search/index.ts` | Embedding-based search |
| `supabase/functions/symphony-chat/index.ts` | AI chat with Haiku |
| `src/hooks/useChat.ts` | Frontend chat state management |
| `src/components/chat/ChatPanel.tsx` | Chat slide-out panel |
| `src/components/chat/ChatMessage.tsx` | Individual message component |
| `src/components/chat/ChatInput.tsx` | Text input with send button |

## Files Modified

| File | Changes |
|------|---------|
| `src/types/note.ts` | Added vault_note type, vault fields, domain labels |
| `src/hooks/useNotes.ts` | Map vault DB fields, readonly flag |
| `src/components/notes/EntityNotesSection.tsx` | Vault badge on notes |
| `src/components/notes/NoteCard.tsx` | Domain pill for vault notes |
| `src/components/layout/AppShell.tsx` | Chat FAB + panel integration |
| `src/App.tsx` | useChat hook + entity context tracking |
