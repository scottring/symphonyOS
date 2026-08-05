# Documents Shelf — design

**Date:** 2026-08-05
**Status:** approved, ready for planning
**Branch:** `documents-shelf`

## Problem

Scott attached photos of his driver's license to a "Rivian Requirements" task so he
could upload them for a Friday test drive. The license is a durable document — he
will need it again, for something that has nothing to do with Rivian. Today Symphony
has no concept of that. An attachment is only reachable by opening the entity it
hangs off, so once the Rivian task is done the license is invisible: still in the
database (`attachments.entity_id` is TEXT with no FK, so nothing cascades), just
unreachable.

Two gaps:

1. **Recognition** — nothing notices that a file is a document worth keeping.
2. **Retrieval** — there is no obvious place to look for documents.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Shape | **Shelf**, not a lens | The need is "Symphony already has my license," which requires the document to outlive the task and be *typed* — not just searchable. A lens over all attachments is a junk drawer. |
| Who files it | **AI proposes, user confirms** | Recognition is automatic; commitment is deliberate. Avoids a shelf full of receipts. |
| Visibility | **Private by default**, share per document | Scope becomes an intentional property of the document rather than inherited from whichever task the file was first dropped on. |
| Sensitive data | **Recognize, don't transcribe** | See below — this is the load-bearing security decision. |
| Scope | **Hold + expiry surfacing.** No request-matching in v1 | Expiry is deterministic (a date is or isn't within N days). Request-matching works by spreading document data across more surfaces, which is what we are explicitly avoiding. |

### The sensitive-data decision, stated fully

`analyze-attachment` runs Claude vision on every image/PDF attachment and writes a
typed `facets` list to the row. Those facets are not inert: `context-graph/assemble.ts`
selects `id, facets` across the user's attachments and `build.ts:5` turns every one
into a `BundleFact` fed to the assistant and `proactive-engine`.

So an ID document analyzed under today's code can put its address, DOB, and ID number
into a context bundle assembled on every suggestion run. Nothing leaves the user's
account — RLS holds — but a structured, searchable index of identity numbers is a
materially worse thing to hold than the photos themselves, particularly under the
threat model that actually matters (account compromise, not repo access).

Therefore: for a fixed list of sensitive kinds, the row stores **what the document is,
whose it is, and when it expires** — and nothing else. The image itself remains in
private storage, reachable by signed URL when the user opens it.

**This is enforced in code, not in the prompt.** The prompt asks; a validator
guarantees. See `stripSensitive` below.

## Data model

Extend `attachments`. Not a new `documents` table: the file, its RLS, its storage
path, and its facets already live on that row, and the "outlives its parent" property
is already free because `entity_id` has no foreign key. A separate table would
duplicate that or FK back to it for no gain.

```sql
alter table attachments
  add column if not exists document_status     text,   -- null | 'proposed' | 'kept' | 'dismissed'
  add column if not exists document_kind       text,
  add column if not exists document_label      text,
  add column if not exists document_owner      text,
  add column if not exists document_expires_on date,
  add column if not exists document_scope      text not null default 'private';
```

Constraints: `document_status in ('proposed','kept','dismissed')`,
`document_scope in ('private','household')`.

Indexes:

```sql
create index if not exists attachments_document_status_idx
  on attachments (user_id, document_status) where document_status is not null;
create index if not exists attachments_document_expiry_idx
  on attachments (user_id, document_expires_on) where document_status = 'kept';
```

`document_status = null` means "not a document" — the overwhelming majority of rows,
so the partial indexes stay small.

### Kind vocabulary

Closed list, validated like facets are:

`drivers_license`, `passport`, `birth_certificate`, `social_security_card`,
`insurance_card`, `vehicle_registration`, `vehicle_title`, `medical_record`,
`tax_document`, `bank_document`, `warranty`, `receipt`, `contract`, `other`

**SENSITIVE subset** (triggers `stripSensitive`):
`drivers_license`, `passport`, `birth_certificate`, `social_security_card`,
`insurance_card`, `vehicle_title`, `medical_record`, `tax_document`, `bank_document`

### RLS — the piece that actually enforces privacy

`2026-08-03_attachments_household_visibility.sql` grants SELECT by way of the *parent
entity*: an attachment on a household-visible task is household-visible. Postgres
OR's permissive policies together, so adding a private-documents policy is not enough —
the existing household policy would still grant access. This requires a **restrictive**
policy:

```sql
create policy "private documents are owner-only"
  on attachments as restrictive for select
  using (document_scope is distinct from 'private'
         or document_status is distinct from 'kept'
         or user_id = auth.uid());
```

Restrictive policies AND with the permissive set, so this clamps every other grant
path. Without it, private-by-default is decoration.

## Recognition

`analyze-attachment` gains a classification step. The prompt asks, in addition to
facets, whether the file is a durable document, emitting:

```json
{"document": {"kind": "drivers_license", "label": "Scott's driver's license",
              "owner": "Scott", "expires_on": "2029-03-14"}}
```

Written to the row as `document_status = 'proposed'` plus the proposal fields.
Absent or unparseable → no document, existing behavior unchanged.

### `stripSensitive`

Added to both twin validators (`src/types/facets.ts` and
`supabase/functions/_shared/facets.ts` — edge functions cannot import from `src/`;
these must stay in sync, as they already must for `parseFacets`).

```
stripSensitive(facets, kind):
  if kind not in SENSITIVE: return facets
  drop every facet of type access_code | phone | location | link | purchase_item | checklist
  replace summary text with a kind-derived string ("Driver's license")
  return the result
```

Applied in `analyze-attachment` **after** parsing and **before** the row write, so no
sensitive facet is ever persisted — not merely hidden at render time. The model is
free to emit whatever it likes; the row is what we control.

`datetime` facets are also dropped for sensitive kinds; expiry travels in
`document_expires_on`, not as a loose fact in the context bundle.

## Promotion UX

`AttachmentFacets.tsx` already renders one deterministic chip per facet with
per-panel promotion actions. A `document_status = 'proposed'` row renders one
additional row there:

> Looks like a **driver's license** — [Keep in Documents] [Not a document]

- **Keep** → `document_status = 'kept'`, fields copied from the proposal.
- **Not a document** → `'dismissed'`; never proposed again for that row.

Editing label / owner / expiry happens on the shelf, not in this prompt. The prompt
stays a single binary decision.

## The shelf — `/documents`

New route, new sidebar entry inside the existing `SidebarGroup label="Library"` in
`Sidebar.tsx`, alongside Projects / Goals / Routines / Health / Meals / Contacts.

Rows grouped by owner, each showing: label, kind, expiry (warning styling when
inside the threshold), a link back to the source entity when it still exists,
view (signed URL), a private/household toggle, and delete.

### Direct upload

The shelf must accept uploads that do not come from a task — otherwise adding a
passport means inventing a fake task, which breaks the "obvious place" promise.
This requires adding `'document'` to the `entity_type` CHECK constraint, with
`entity_id = user_id` for self-hosted rows. `AttachmentEntityType` in
`src/types/attachment.ts` gains the member; `taskAttachments.ts` has a parallel
list that must be updated with it.

## Expiry surfacing

A kept document whose `document_expires_on` falls inside the threshold (60 days,
one constant) becomes an input to the existing suggestion layer via
`proactive-engine`.

**Explicitly not a new row type on Today.** Today is a commitment surface with a
space invariant; adding a sixth thing that can occupy a row is how it got overloaded
before. Routing through the suggestion layer reaches the user without touching that
invariant.

This is the least-pinned-down integration point in this spec and should be verified
against the current `proactive-engine` shape during planning.

## Cleanup of existing rows

A one-time backfill re-runs classification over already-analyzed attachments
(`analyzed_at is not null`). Any row classified into a SENSITIVE kind has
`stripSensitive` applied to its stored facets and gets `document_status = 'proposed'`.

This repairs rows written before this feature existed — including the license that
prompted it — without any person reading the data. Idempotent and re-runnable.

## Testing

- **`stripSensitive`** — table-driven over every kind × every facet type, both
  copies of the validator. This is the security control; it is the thing that must
  fail loudly if it regresses.
- **RLS** — a private kept document is invisible to a household member. Written
  against simulated user sessions, **not** service role, which bypasses RLS and
  would pass a broken policy.
- **Classification parsing** — malformed / absent / unknown-kind `document` blocks
  degrade to "not a document" rather than throwing.
- **Shelf** — list, group-by-owner, expiry warning threshold, scope toggle.
- **Promotion** — keep and dismiss transitions, and that dismissed rows never
  re-propose.

## Out of scope (v1)

- Request-matching ("bring your license" → offers the document).
- OCR search inside document contents.
- Document versioning / renewal history.
- Sharing outside the household.

## Security posture (verified 2026-08-05, context for reviewers)

- Uploaded files never enter git; they live in Supabase Storage.
- Git history contains no key material (checked for `SERVICE_ROLE_KEY=eyJ`, `sk-ant-api`).
- `.env.production` is tracked but holds only `VITE_` vars, which ship in the client
  bundle by design.
- The `attachments` bucket is `public = false`; storage RLS scopes reads to a folder
  prefix matching `auth.uid()`.
- Images are sent to the Anthropic API for analysis. This is inherent to the feature.
- **Open, unrelated:** `VITE_GOOGLE_MAPS_API_KEY` ships in the client bundle and is
  only safe if HTTP-referrer restricted in Google Cloud Console. Worth verifying;
  not part of this work.
