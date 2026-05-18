# Inbox → Note & Project Triage — Smart Routing with AI Match

**Date:** 2026-05-18
**Status:** Spec — pending review
**Branch:** feat/surface-future

**Scope:** Add two new destinations to the inbox-triage flow so that not every captured thought has to become a scheduled task. A captured idea can be routed to a Note (existing or new) or attached to a Project (existing or new), with an AI-assisted matching step that suggests the right destination based on the item's text.

---

## Problem

The current inbox-triage flow forces every captured item into a "when?" decision: Today, Week, Month, or Someday. That works when the item is genuinely a task. It fails when the item is:

- A **thought worth remembering** but not a task (e.g., "remember Liam loved the spaghetti place on 4th") — currently has no destination except Someday, where it dies.
- A **project seed** (e.g., "look into bike storage for the garage") — currently you'd add it to Today, then later remember to create a project and re-attach. Two-step friction at the moment of clearest intent.

The result: the inbox becomes a graveyard for items that *should* have gone somewhere else. Users either accumulate Someday clutter or stop capturing thoughts that don't fit the task model.

A prior attempt to solve this with a persistent right-side "scratchpad" surface was considered and rejected — Symphony's history of removed persistent side panels (`ContextSidebar` was cut for low adoption) suggested adding more ambient chrome wouldn't earn its keep. The fix belongs at the moment of triage, where the user is already engaged.

---

## Design philosophy

**Two destinations beyond scheduling, with distinct semantics:**

- **`→ Note`** = *consume*. The thought becomes a memory in a note; the task itself is removed from the inbox. Bucket transition: `inbox → gone`.
- **`+ Create new project` (via existing Project picker)** = *contextualize*. The task stays a task, just gets a `projectId` attached. Bucket unchanged — scheduling still needed separately. Mirrors how the existing "attach to existing project" already behaves.

**AI assists, doesn't decide.** When the user opens either picker, a single Anthropic Haiku call suggests the most-likely destination (best match + proposed new title). The suggestion is one tap to accept, but the user can ignore it, search, scroll, or create something different. The AI never auto-routes silently.

**No vector embeddings yet.** Fuzzy substring search for filtering + LLM call for ranking is enough for the scale Symphony operates at. pgvector remains an option if duplication becomes a real problem; it's not a v1 requirement.

---

## UI changes

### `DenseInboxRow` — new quick-action + enhanced project picker

The shared row component used by both the Inbox view and the "This Week" popover gets two small additions:

**1. New top-level quick-action: `📝 Note`**

Added to the `quickActions` array alongside `Today / Week / Month / Someday / Delete`. On `Today` priority styling, this is the second-most-visually-prominent action group on the row (after the four "when" buttons). Inbox surface and "This Week" surface both get it; the row is consistent across both.

If the five-action group becomes cramped at the laptop breakpoint, fall back to icon-only for `Week / Month / Someday` (keep `Today` and `Note` as text — they're the two highest-value destinations).

**2. Project picker enhancement**

The existing `ProjectControl` (FolderPlus icon, hover-revealed dropdown of active projects) gains:

- A divider line after the existing-projects list
- A `+ Create new project…` entry below the divider
- Tapping that entry expands inline within the same dropdown: a name input prefilled from the task title, a small context chip row (work/family/personal), and a `Create` button
- On create: project is added via `useProjects.addProject`, task gets `projectId` set, undo toast appears
- The task's `bucket` is **NOT** changed by project creation (consistency with the existing attach-to-existing-project behavior — attaching tags, doesn't schedule)

### `NotePicker` — new popover component

Opens anchored to the inbox row when the user taps `📝 Note`. ~360px wide, single column, max-height ~480px. Contents top to bottom:

```
┌────────────────────────────────────────────┐
│  Looks like → [Backyard reno]  or          │
│  + new note "Bike storage ideas"           │  ← AI suggestion strip
├────────────────────────────────────────────┤
│  🔎 Search notes…                          │  ← client-side filter
├────────────────────────────────────────────┤
│  Backyard reno                             │
│    Front yard ideas + budget tracking      │
│  Liam school                               │
│    Conference notes + teacher info         │  ← scrollable list of
│  Vendors                                   │     existing notes
│    …                                       │
├────────────────────────────────────────────┤
│  + Create new note…                        │  ← expands inline
└────────────────────────────────────────────┘
```

**AI suggestion strip:** the first row of the picker. Two tappable chips: the best-match suggestion (if confidence ≥ 0.6) and a new-note suggestion with a proposed title. Either chip commits the action immediately. While the LLM call is in flight (typical 800-1500ms), the strip shows a faint pulsing placeholder. On error/timeout, the strip silently hides — the rest of the picker remains functional.

**Search input:** filters the existing-notes list by case-insensitive substring match on title and content. Sub-50ms, no network. Domain-filtered the same way `NotesList` already filters: if the current domain is `universal`, show all notes; otherwise show notes matching the current domain (notes without a `context` are visible in every domain — they're treated as universal).

**Existing notes list:** alphabetical by title. Each row shows title + first ~60 chars of content. Vault-readonly notes (`note.readonly === true`) are excluded — they're source-of-truth in the user's vault and the app can't write to them. Tapping a row commits to that note.

**Create new note:** divider + entry that expands inline, same pattern as the project picker. Input prefilled with the AI-suggested title, optional context chip row, `Create` button.

**Dismiss:** Esc / click-outside / row-selection.

---

## Append format & lifecycle

### Appending to an existing note

Append a timestamped bullet to the end of `note.content`:

```
- 2026-05-18 14:23 — <task title>
  <task notes, indented two spaces, if present>
```

Leading newline so the bullet doesn't get glued to the prior content. `note.updatedAt` ticks so the note bubbles up in the Notes list.

### Creating a new note

Call `useNotes.addNote({
  title: <user-confirmed title>,
  content: '- 2026-05-18 14:23 — <task title>' + (task.notes ? '\n  ' + task.notes : ''),
  source: 'inbox_triage',
  context: <current domain> || <task.context> || undefined,
})`. The new note is seeded with the first bullet immediately so it's not empty.

### Task lifecycle on `→ Note`

The task is hard-deleted (matches existing `deleteTask` behavior in `useSupabaseTasks`; introducing soft-delete here is out of scope and would create a new pattern that doesn't exist elsewhere).

A 10-second undo toast appears: *"Sent to '<note title>' · Undo"* (10s matches the new universal undo duration set in commit `a90890c`).

### Undo behavior

Undo must reverse three pieces of state:

1. **Re-create the task** via `useSupabaseTasks.addTask` with the original fields snapshot (title, notes, bucket, context, assignedTo, links, phoneNumber, projectId, contactId — everything we captured at the start of the action). The new task gets a fresh id; consumers tracking the old id need to refresh, but in practice the inbox just re-renders.
2. **Revert the note's content** to the snapshot taken before the append. Stored as a string in the undo payload — cheap, even for large notes.
3. **If a new note was created**, delete it. The pre-append content snapshot is empty in this case, so step 2 collapses to a delete operation.

The undo payload is held in the existing `useUndo` system as a single action with a custom `onUndo` callback that performs steps 1-3 in order. If any step fails, the others still attempt; we log but don't surface partial-undo errors (the user will see what's there and can re-triage).

### Task lifecycle on `+ Create new project`

The task is **not** deleted. It receives the new `projectId` and the undo toast says *"Attached to '<project name>' · Undo"*. Undo clears the `projectId` and deletes the just-created project.

---

## AI matching

### Why a server call

The Anthropic API key cannot live in the browser. A new Supabase Edge Function (`note-match`) is the proxy. The function takes the inbox item + candidate notes + domain, calls Anthropic, returns the parsed JSON shape.

### Edge function: `note-match`

**Path:** `supabase/functions/note-match/index.ts`

**Request:**
```ts
{
  inbox_item: { title: string, notes?: string },
  candidate_notes: Array<{ id: string, title: string, first_200_chars: string }>,
  domain: 'work' | 'family' | 'personal' | 'universal',
}
```

**Response:**
```ts
{
  best_match: { id: string, confidence: number } | null,
  suggested_new_title: string,
}
```

**Implementation notes:**
- Model: `claude-haiku-4-5-20251001` (cheap, fast, plenty good at this judgment).
- Max input notes: 30 — sorted by `updatedAt` descending before being sent. Older notes are excluded from the LLM consideration (still findable via search in the picker).
- Prompt instructs the model: return a match only when confident the item meaningfully fits the existing note; otherwise `null`. Always return a `suggested_new_title` (short, descriptive, no quotes).
- Response parsed via `JSON.parse` of the assistant message; on parse failure, function returns `{ best_match: null, suggested_new_title: <task title> }`.
- Timeout: 3 seconds. If Anthropic doesn't respond in time, the function returns the same fallback shape.

### Cost

~$0.001 per call. Cached per `task.id` for the session so re-opening the picker on the same row doesn't re-bill. Typical daily usage is a handful of triages → sub-dollar per month per user.

---

## Component changes

```
src/components/notes/
├── NotePicker.tsx              ← NEW: the popover described above
└── NotePicker.test.tsx         ← NEW: unit tests

src/components/schedule/
├── DenseInboxRow.tsx           ← modify: add { kind: 'note' } to QuickAction;
│                                  add Note button to the quick-action group
├── InboxView.tsx               ← modify: pass the new action through;
│                                  apply note-routing logic in onQuickAction
└── StagingFloat.tsx            ← modify: include 'note' in WEEK_ACTIONS

src/components/project/         ← already exists; ProjectControl lives in
                                  DenseInboxRow today. Either:
                                  (a) extract ProjectControl into its own
                                      file under components/project/, or
                                  (b) extend it inline in DenseInboxRow.
                                  Recommend (a) — the file is growing and
                                  ProjectControl is reused by the picker
                                  and by other surfaces in the future.

src/hooks/
├── useNoteSuggestion.ts        ← NEW: tiny hook around the Edge Function
│                                  call with per-task-id cache
└── useNotes.ts                 ← modify: extend NoteSource type with
                                  'inbox_triage'; no behavior changes

src/types/
└── note.ts                     ← modify: add 'inbox_triage' to NoteSource enum

supabase/functions/
└── note-match/                 ← NEW: Edge Function described above
    ├── index.ts
    └── deno.json
```

---

## Storage / data model

**No schema migrations.** All changes use existing tables:

- `notes.content` is already a `text` column — appends are just string concatenation.
- `notes.source` is already a `text` column — adding `'inbox_triage'` as a valid value is a type-system change only (no DB constraint to alter).
- Tasks are hard-deleted via the existing `deleteTask` flow; no new table state.
- The undo payload lives in client memory only (the existing `useUndo` model) — nothing persisted across reloads. If the user reloads before undoing, the action is final. This matches existing inbox-triage undo behavior.

---

## Error handling

| Scenario | Behavior |
|---|---|
| LLM call fails / times out (>3s) | Suggestion strip hides silently; picker stays functional |
| Note `updateNote` fails | Roll back optimistic UI; toast `"Couldn't save to '<note>' — try again"`; task stays in inbox |
| Note `addNote` fails on Create New | Roll back; toast; task stays in inbox |
| User edits suggested title before confirming Create New | Uses their version, not the AI's |
| Picker closed without selection | No-op; task stays in inbox |
| Undo fails mid-step (e.g., note revert succeeds, task re-create fails) | Log error; surface what's recovered; user can manually re-add the task |
| Note that's the best match is deleted between suggestion and tap | `updateNote` returns an error; treated as the "fail" case above |

---

## Testing strategy

**Unit tests (Vitest):**

- `useNoteSuggestion.test.ts` — fetches, parses, handles error/timeout, caches per taskId, returns fallback shape on parse error
- `NotePicker.test.tsx` — renders suggestion chip when confidence ≥ 0.6; hides it below threshold; search filters case-insensitively; vault-readonly notes excluded; "create new" expands inline; calls `onSelect` with correct payload (existing-note id OR new-note shape)
- Append formatter (small pure function in `useNotes` or a new util) — bullet generation, indentation when notes present, leading-newline handling
- `ProjectControl.test.tsx` — divider + "Create new project" entry visible at bottom; inline expansion; calls `onCreate` with name + context
- Undo callback — restores task fields verbatim, reverts note content snapshot, deletes new note when applicable

**Integration tests (Vitest):**

- Full row interaction: render Inbox view, tap 📝 on a row, accept best-match suggestion → expect `deleteTask` called + note's content updated + undo toast visible
- Full row interaction: tap 📝, expand Create New, type title, click Create → expect `addNote` called with seeded content + `deleteTask` called + undo toast visible
- Undo flow after Create New: trigger create-new path, click Undo → expect task re-created + new note deleted

**E2E (Playwright):**

- One golden-path: create a task, triage to a new note titled "Test idea", navigate to Notes page, verify the note exists with the seeded bullet

**Edge function test (separate from app suite):**

- Mock `fetch` to `api.anthropic.com`; assert the request body shape; assert various response parses (valid JSON, malformed JSON → fallback, timeout → fallback, 5xx → fallback)

---

## Migration / rollout

- No DB migration required.
- The Edge Function ships independently — deploy before the client code so the function is live when users start tapping 📝.
- Single PR. Feature flag not needed: this is purely additive (a new button + a new picker). Existing triage paths are untouched.
- Existing inbox-redesign tests are unaffected; the row component gains one element but the existing quick actions and their behaviors are unchanged.

---

## Out of scope

- **Apple Pencil / ink-based scratchpad.** Considered, rejected for now. The "consume into a note" flow at triage covers the same use case (capture-and-remember) without the ambient-surface chrome problem.
- **Vector / semantic dedup.** Plain LLM ranking + substring search is enough for v1. pgvector can come later if duplication becomes a measured problem.
- **Bulk triage** (multiple inbox items → same note at once). Out of scope; possible v2.
- **AI auto-routing** (no-confirm send to note based on confidence). Explicitly rejected — every triage stays user-confirmed.
- **Editing the appended bullet inline.** The user can open the note to edit; no inline edit on the picker.
- **Project picker AI suggestion.** The Project picker only adds "Create new" inline. AI suggestion for project matching is symmetric to note matching but adds another LLM call surface; defer to v1.1 if useful.
- **Note suggestion based on prior user behavior** (learning over time). v2.

---

## Open questions

1. **Title for the AI suggestion strip when no good match is found:** "Looks new — 'Bike storage ideas'" vs just "+ new note 'Bike storage ideas'"? Both work; propose the second (less anthropomorphic, more action-coded).
2. **Should the inbox row's `📝 Note` action be disabled if there are zero existing notes AND zero vault notes?** Probably not — the Create-new path still works. Leave it enabled.
3. **Cap on candidate_notes (currently 30) — too low?** The picker still shows the full list to the user; the cap only affects what the AI sees. 30 most-recent should cover ~90% of relevant matches; revisit if users report bad suggestions for items that match older notes.

These are minor and can be resolved during implementation without changing the design.
