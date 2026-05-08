# Symphony Home App — Phase 1A Design

**Date:** 2026-05-06
**Status:** Draft — pending implementation plan
**Phase:** 1A of 4 (registry foundation)

---

## Context

Symphony today covers tasks, projects, routines, contacts, lists, notes, meals (with pantry + groceries), family/household, calendar, email intelligence, the wall (kiosk calendar + ambient cards), the agent pane, and a job pipeline. The "household operations" engine is largely there.

What's missing is a **home-as-an-entity** layer: the physical house, the rooms inside it, what's stored where, and what we know about the things we own. This spec defines Phase 1A — the registry foundation — which lands the new entities and the three surfaces (desktop, mobile, kiosk) that browse them.

The full Home app rolls out in four phases:

| Phase | Scope |
|-------|-------|
| **1A (this spec)** | Home + Spaces (rooms→zones) + Assets registry. Photos, reference facts, mobile capture, kiosk Rooms surface. |
| **1B** | Org plans / guided organization (major reorgs + recurring maintenance). Step execution, run history. |
| **2** | Service event log on assets + vendor linkage to existing Contacts. |
| **3** | Document/receipt vault — categorized browsable library across home/space/asset/person. |
| **4** | Critical-date dashboard — pure roll-up of warranty expiries, service due, task due dates, family birthdays. |

Phases 2–4 layer on the 1A spine without new core entities; 1B extends Routines.

---

## Goals (Phase 1A)

1. Capture an asset in under 10 seconds while standing next to it (photo + name + space).
2. Browse "what's in the house and where it lives" from any device — desktop, phone, iPad, kiosk.
3. Surface ambient awareness on the kitchen/living-room kiosk: rooms tab + new card types in the existing kiosk_cards stream.
4. Reuse Symphony infrastructure aggressively: existing notes, attachments, household sharing, RLS, kiosk_cards.

## Non-goals (Phase 1A)

1. Org plans / guided steps (Phase 1B)
2. Service event log + vendor linkage (Phase 2)
3. Document/receipt vault as a categorized library (Phase 3)
4. Critical-date dashboard (Phase 4)
5. Voice capture, AI photo identification, barcode/QR scanning
6. Bulk import / CSV export
7. Multi-photo gallery per asset
8. Offline capture queue
9. Activity history per asset
10. Multi-home switcher UI (schema supports, UI deferred to Phase 2)

---

## Approach

**Approach 3 (selected): new schema for the spine, reuse everything else.**

Three new tables (`homes`, `spaces`, `assets`). Reuse existing Contacts (vendors, Phase 2), Notes (descriptions), Attachments (photos + docs), Family/Household (sharing + RLS), Tasks (asset-linked actions in later phases via `asset_id`), kiosk_cards + kiosk-agent (ambient surfacing).

Rejected alternatives:
- **Standalone app, all-new schema** — too much code, doesn't leverage Symphony's investment in Notes/Attachments/Household.
- **Reuse Lists** (no new schema) — fastest, but list_items don't fit assets (no warranty/serial/purchase semantics) and zones don't fit a flat list. Future phases will fight the abstraction.

---

## 1. Data model

Three new tables. Migration: `supabase/migrations/091_home_registry.sql`.

### `homes`

```
id UUID PK
household_id UUID FK → households(id)
name TEXT NOT NULL
address TEXT NULL
created_by UUID FK → auth.users(id)
created_at TIMESTAMPTZ DEFAULT now()
updated_at TIMESTAMPTZ DEFAULT now()
```

One row per household by default; schema permits multiple homes (vacation, parents'). UI hides the switcher in 1A.

### `spaces`

```
id UUID PK
home_id UUID FK → homes(id)
parent_space_id UUID NULL FK → spaces(id)   -- self-ref for room→zone
space_type TEXT NOT NULL CHECK (space_type IN ('room','zone'))
name TEXT NOT NULL
photo_url TEXT NULL                          -- denormalized hero
sort_order INT DEFAULT 0
facts JSONB DEFAULT '[]'::jsonb              -- typed list, see below
created_by UUID
created_at, updated_at
CONSTRAINT zone_must_have_room_parent
  CHECK ((space_type='room' AND parent_space_id IS NULL)
      OR (space_type='zone' AND parent_space_id IS NOT NULL))
```

Application also enforces zones cannot have zones as parents (no nesting beyond two levels). DB constraint covers room/zone exclusivity; the no-nested-zones rule is enforced in `useSpaces.ts`.

### `assets`

```
id UUID PK
home_id UUID FK → homes(id)                  -- denormalized for fast filter
space_id UUID NULL FK → spaces(id)           -- nullable: "no location" allowed
asset_kind TEXT NOT NULL CHECK (asset_kind IN ('item','collection'))
asset_type TEXT NOT NULL CHECK (asset_type IN
  ('appliance','vehicle','electronics','furniture','fixture','tool','collection','other'))
name TEXT NOT NULL
photo_url TEXT NULL                          -- denormalized hero
purchase_date DATE NULL
purchase_price NUMERIC NULL
warranty_expires_at DATE NULL
serial_number TEXT NULL
manual_url TEXT NULL
tags TEXT[] DEFAULT '{}'
details JSONB DEFAULT '{}'                   -- type-specific fields
notes_id UUID NULL FK → notes(id)            -- long-form description
domain TEXT DEFAULT 'family'                 -- work | family | personal
needs_details BOOL DEFAULT FALSE             -- true after photo-first capture
created_by, created_at, updated_at
```

Indexes:
- `(home_id, space_type)` on spaces
- `(space_id)` on assets
- `(home_id, needs_details) WHERE needs_details = true` on assets (triage queries)
- `(home_id, warranty_expires_at) WHERE warranty_expires_at IS NOT NULL` (Phase 4 dashboard, but cheap to add now)

### `spaces.facts` shape (typed JSON list)

```jsonc
[
  { "type": "wifi",    "label": "Guest WiFi",   "value": "stax-guest / ********" },
  { "type": "paint",   "label": "Wall color",   "value": "Benjamin Moore Cloud White HC-40" },
  { "type": "code",    "label": "Garage code",  "value": "1234*" },
  { "type": "supply",  "label": "Filter size",  "value": "20x25x1 MERV 11" },
  { "type": "measurement", "label": "Window width", "value": "36 inches" },
  { "type": "freetext","label": "Notes",        "value": "Breaker box behind laundry door" }
]
```

Defined types: `wifi | paint | code | supply | measurement | freetext`. Each type drives an icon and per-row UI. The `label` is user-defined within a type. Validated by `useReferenceFacts.ts` on read/write.

### Asset details jsonb — type-specific config

A static config map at `src/apps/home/assetTypes.ts`:

```ts
export const ASSET_TYPE_FIELDS: Record<AssetType, FieldConfig[]> = {
  appliance: [
    { key: 'energy_rating', label: 'Energy rating', type: 'text' },
    { key: 'last_filter_change', label: 'Last filter change', type: 'date' },
  ],
  vehicle: [
    { key: 'vin', label: 'VIN', type: 'text' },
    { key: 'license_plate', label: 'Plate', type: 'text' },
    { key: 'mileage', label: 'Mileage', type: 'number' },
  ],
  electronics: [
    { key: 'model_number', label: 'Model', type: 'text' },
  ],
  // furniture, fixture, tool, collection, other -> no extra fields in 1A
};
```

Adding a type later = one file change.

### Sharing & RLS

Mirrors existing household-shared entities (meal plans, family lists). Read/write to a row if `auth.uid()` is in the same `household_id` as the row's home.

```sql
CREATE POLICY home_household_access ON homes
  FOR ALL USING (household_id IN (
    SELECT household_id FROM household_members WHERE user_id = auth.uid()
  ));

-- spaces and assets inherit via home_id JOIN. Same pattern as meal_plans.
```

The `domain` field on assets is a UI filter only; it doesn't restrict access. (An asset marked `personal` is still visible to other household members; the domain switcher just hides it in `family` view. This matches existing Symphony domain semantics.)

### Reused infrastructure (no new tables)

- **Photos & documents** → existing `attachments` table, polymorphic on `entity_type='asset'|'space'|'home'`. `photo_url` denormalized for browse views.
- **Sharing** → `household_id` on homes; standard RLS policy.
- **Notes** → `notes_id` FK on assets. Vault dual-write happens automatically through existing `useNotes` infrastructure.
- **Domain filtering** → existing `useDomain` hook.

---

## 2. Surfaces & navigation

### Desktop (≥768px — includes iPad)

- New sidebar entry **"Home"** between `Lists` and `Notes`.
- Routes:
  - `/home` — overview (room grid + recent + needs-details banner)
  - `/home/space/:id` — room or zone view
  - `/home/asset/:id` — full-page asset detail
- DetailPanel slide-over reused for asset views opened from inside list contexts.
- `[+ Asset]` and `[+ Room]` buttons persistent on overview; `[+ Asset here]` on room/zone view.

### Mobile (<768px)

- Same sidebar entry. Tapping "Home" lands on the room grid (compact two columns).
- Persistent floating action button **"+ Asset"** on `/home`, room views, zone views → opens capture flow.
- Asset detail uses existing bottom-sheet `DetailPanel` pattern.

### Kiosk (`/wall`)

- `WallCalendar` gets a tab toggle: **Calendar | Rooms** (top-left, persistent).
- Rooms tab: 4-up grid of room tiles (photo + name + asset count). Touch targets ≥280×200.
- Tap a room → full-bleed room view (hero photo + facts card + zones + asset list). Read-only.
- Tap a zone → same view scoped to the zone.
- Tap an asset → modal with photo + read-only fields + "Open on phone" QR shortcut.
- After 5 minutes idle → auto-return to Calendar tab (mirrors existing wall idle pattern).
- Realtime: existing Supabase subscription pattern (already wired for kiosk_cards).

### Domain switcher

Existing work/family/personal switcher filters the room grid by `assets.domain`. Default `family` view shows everything household-shared. Switching to `personal` shows only assets the current user marked personal-only.

### Code locations

```
src/apps/home/
  HomeApp.tsx              # router/entry
  HomeOverview.tsx         # room grid + recent + triage banner
  SpaceView.tsx            # room or zone detail (desktop)
  AssetView.tsx            # full-page asset detail (desktop)
  AssetDetailPanel.tsx     # bottom-sheet detail (mobile + slide-over)
  assetTypes.ts            # per-type field config
  capture/
    AssetCapture.tsx       # photo-first capture flow
    RoomSessionMode.tsx    # sticky-room rapid capture
  kiosk/
    RoomsKioskView.tsx     # rooms tab content
    SpaceKioskView.tsx     # full-bleed room/zone view
    AssetKioskModal.tsx    # tap-to-view asset on kiosk
  facts/
    ReferenceFactsCard.tsx # facts list display + edit
    FactRow.tsx
src/hooks/
  useHomes.ts
  useSpaces.ts
  useAssets.ts
  useReferenceFacts.ts     # thin wrapper around spaces.facts
src/types/
  home.ts                  # Home, Space, Asset, Fact, AssetType, FactType
supabase/migrations/
  091_home_registry.sql
```

---

## 3. Mobile capture flow

Two modes share the same underlying screen. The only difference is whether the room is sticky.

### Single-asset mode (photo-first) — entry point: `[+ Asset]` FAB

1. Camera opens immediately (browser camera API; iOS Safari + Android Chrome supported).
2. Snap photo (or "Skip photo" link).
3. Single screen, two required fields:
   - **Name** (autofocused)
   - **Where** — room picker (required). After room selected, optional zone picker appears.
4. Buttons: **[Save]** and **[Save & add another]**. "Save & add another" re-opens the camera with the same room (and zone, if set) pre-selected — a lightweight one-shot of session mode without pinning the header.
5. Toggle: "This is a collection" → flips `asset_kind`.
6. After save: `needs_details = true`. Toast: *"Saved. Tap to add details."*

### Room-session mode — entry point: "Start room session" button on a room view

- Header pinned: "Master Bedroom · session · 3 added".
- Camera stays full-screen between captures.
- Snap → inline name modal → save → camera reopens. ~5 seconds per asset.
- "End session" → returns to room view with newly-added assets in a "just added" carousel.
- "Switch room" → choose another room without ending the session count.

### "Needs details" triage

Photo-first capture leaves assets with `needs_details = true`. They surface in two places:

1. **Home overview banner**: "⚠ 8 assets need details · [Triage now →]"
2. **Existing Inbox view** (`/inbox`) gets a new section: **"Home items needing details"** — each row = photo + name + room + "Fill in" button → opens asset detail panel.

No separate triage screen. Reuses the existing inbox primitive.

### Kiosk card surfacing for triage

When household-wide `needs_details` count > 5, a `home.needs_details` card appears in the kiosk_cards stream: "8 assets need details. Open on phone."

### Photo handling

- Uploaded via existing **attachment infrastructure** (Supabase Storage + `attachments` table).
- Auto-resized to 1600px max on upload (existing image pipeline).
- Hero photo URL denormalized to `photo_url` on the asset/space row.
- One hero per asset in 1A; gallery deferred.

### Capture flow non-goals (1A)

- Voice capture
- AI photo identification (post-MVP layer)
- Barcode/QR scanning
- Offline queue (require connectivity in 1A; revisit if painful)
- Existing-asset re-capture / camera-as-search

---

## 4. Kiosk Rooms surface

### Tab toggle on existing `WallCalendar`

```
┌──────────────────────────────────────────────────────┐
│  [ Calendar ]  [ Rooms ]                       ⚙ ⌂  │
├──────────────────────────────────────────────────────┤
│  ROOMS VIEW                                          │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐     │
│  │ photo   │ │ photo   │ │ photo   │ │ photo   │     │
│  │ Kitchen │ │ Living  │ │ Master  │ │ Garage  │     │
│  │ 12 items│ │ 8 items │ │ 14 items│ │ 31 items│     │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘     │
└──────────────────────────────────────────────────────┘
```

- Tile = full-bleed room photo + name + asset count.
- Layout: CSS grid, target 4-up at 1024×768; degrades to 3-up or 2-up on smaller screens.
- Category-color placeholder if no photo.
- No editing on kiosk.

### Full-bleed room/zone view

```
┌──────────────────────────────────────────────────────┐
│  ← Rooms                                Kitchen   ⚙  │
├──────────────────────────────────────────────────────┤
│  ┌────────────────────────────┐ ┌──────────────────┐ │
│  │     hero photo             │ │ FACTS            │ │
│  │     (tap to enlarge)       │ │ Wall color       │ │
│  │                            │ │   BM Cloud White │ │
│  └────────────────────────────┘ │ WiFi             │ │
│                                 │   stax-guest…    │ │
│  ZONES                          │ Filter size      │ │
│  ┌─────┐ ┌─────┐ ┌─────┐        │   20×25×1 MERV11 │ │
│  │Pantry│ │Coffee│ │Junk │      └──────────────────┘ │
│  │ 8   │ │ 5    │ │drawer│                           │
│  └─────┘ └─────┘ └─────┘                             │
│                                                      │
│  ASSETS                                              │
│  • Dishwasher (Bosch 800 series · warranty 2027)     │
│  • Espresso machine                                  │
│  • Refrigerator (LG · warranty 2026)                 │
└──────────────────────────────────────────────────────┘
```

- Zone tap → same view scoped to the zone (zone hero + parent-room facts in a smaller card + zone assets).
- Asset tap → modal with photo + read-only fields + "Open on phone" QR.

### New ambient kiosk_cards types

Four new `card_type` values added to the existing stream. The `kiosk-agent` edge function gets four matching rules; no new infrastructure.

| `card_type` | Trigger |
|-------------|---------|
| `home.asset_added` | 24h after a `needs_details=true` asset is captured. CTA: "Tap your phone to fill in." |
| `home.warranty_expiring` | 60 days before `warranty_expires_at`. CTA: per-asset detail link. |
| `home.needs_details` | Household `needs_details` count > 5. CTA: "Open Home." |
| `home.recently_added` | Weekly digest on Sundays. "5 new assets this week." |

`kiosk_cards` table already supports `source_task_id` and `source_project_id`. We add `source_asset_id` (nullable FK) in migration 091. Existing dismiss + expire mechanics reused.

### Idle behavior

- 5 minutes no touch → return to Calendar tab. (Implementation note: implement here even if the existing wall has its own idle handling; behavior should be tab-aware so users on Rooms aren't yanked back mid-tap.)
- Realtime drop → fall back to 60s polling. Implementation plan verifies whether `WallCalendar` already does this and reuses or adds.

### Implementation risk

`WallCalendar` was built before tab navigation. Adding the toggle requires lifting state up. The implementation plan must verify:
1. Realtime subscription survives tab switching.
2. Idle return logic still works.
3. Existing wall users unaffected on first deploy.

Fallback if refactoring is risky: separate route `/wall/rooms` with its own component. Worse UX (URL switch) but zero risk to existing wall.

---

## 5. Desktop browse/edit

### Home overview (`/home`)

Room grid + search/filter + recent + needs-details banner. `[+ Asset]` and `[+ Room]` actions. "Triage now" button opens `/inbox` filtered to "Home items needing details".

### Space view (`/home/space/:id`)

Hero photo (drag-drop replace) + reference-facts card (inline edit) + zones grid + asset list. Asset rows clickable → detail panel slide-over. Checkbox-driven small batch operations: move-to-zone, delete (no fancy bulk edit in 1A).

### Asset detail (`/home/asset/:id` full-page; bottom sheet on mobile)

- Inline edit on every field (matches existing task/project pattern).
- Tags as chip input.
- Type-specific details rendered from `assetTypes.ts` config.
- Notes: existing notes editor, vault dual-write.
- Attachments: existing `useAttachments` hook + `AttachmentList`.

### Triage screen

Existing Inbox view gets a new section: **"Home items needing details."** Each row = photo + name + room + "Fill in" → opens asset detail panel emphasizing missing fields.

### Desktop non-goals (1A)

- Bulk import / CSV
- Asset duplication / templates
- Multi-photo gallery
- Activity history per asset
- Asset move history

---

## 6. Error handling & testing

### Error handling

| Failure mode | Behavior |
|--------------|----------|
| Photo upload fails | Asset saves with `photo_url=null`. Toast with retry. |
| Two devices edit same asset | Last-write-wins on field level; `updated_at` shown in detail. No conflict UI. |
| User has no household | Empty state with `JoinHousehold` CTA (existing component). |
| Kiosk realtime drops | 60s polling fallback. The implementation plan must verify whether this exists in `WallCalendar` today; if not, add it as part of this work since the Rooms tab inherits the same risk. |
| Camera permission denied | Capture screen shows "Photo skipped" affordance; asset can save without photo. |

### Edge cases

| Case | 1A behavior |
|------|-------------|
| Asset with no space (`space_id IS NULL`) | Allowed. Shows in "No location" section on overview. |
| Zone deleted with assets | Cascades assets to parent room. Toast: "12 assets moved to Kitchen." |
| Room deleted with zones+assets | Hard block. Modal: "This room has 3 zones and 18 assets. Move them first." |
| Collection of hundreds of items | Single asset row. Notes field holds inventory-within-the-collection. |
| Identifying placard photo at capture | No OCR in 1A. User types serial. Placard photo is fine as hero. |
| Multiple homes | Schema supports. UI hides switcher in 1A. Add `?home=` switcher in Phase 2. |
| User tries to nest a zone inside a zone | Application-level block in `useSpaces.ts`: zone picker only offers rooms as parent. DB has no `parent.space_type='room'` constraint (would require a function-based CHECK), so app validation is the source of truth. |

### Testing strategy

- **Unit (Vitest)**: hooks (`useHomes`, `useSpaces`, `useAssets`, `useReferenceFacts`) — CRUD, RLS-aware filtering, jsonb-shape validation.
- **Component (Vitest + RTL)**: `HomeOverview`, `SpaceView`, `AssetDetailPanel`, `AssetCapture`, `RoomSessionMode`, `RoomsKioskView`. Snapshot + interaction tests.
- **E2E (Playwright)**: one happy-path per surface — `home-desktop.spec.ts`, `home-mobile.spec.ts` (existing Mobile Chrome project), `home-kiosk.spec.ts` (loads `/wall`, switches to Rooms tab). Camera mocked via `page.route` for getUserMedia.
- **Migration test**: `supabase/tests/091_home_registry.test.sql` — fresh database + seed + RLS-as-other-user check.

---

## Open questions for implementation plan

These are not blockers for spec approval but need decisions during implementation:

1. **WallCalendar tab toggle** — refactor in place vs new `/wall/rooms` route fallback. Decide after reading current wall state-management code.
2. **`spaces.facts` validation** — Zod schema in `useReferenceFacts.ts` vs DB CHECK on jsonb shape. Probably both: DB CHECK for catastrophic shape errors, Zod for UX.
3. **Camera UX on iPad Safari** — getUserMedia behavior differs from iOS Chrome. May need a "open camera roll instead" fallback.
4. **`source_asset_id` on `kiosk_cards`** — adds a column to an existing table. Verify no downstream consumers break.

---

## Phase 1A scope summary

| New tables | `homes`, `spaces`, `assets` |
| New migration | `091_home_registry.sql` (+ `source_asset_id` on `kiosk_cards`) |
| New routes | `/home`, `/home/space/:id`, `/home/asset/:id` |
| New sidebar entry | "Home" between Lists and Notes |
| New kiosk surface | Rooms tab on `WallCalendar` |
| New kiosk card types | `home.asset_added`, `home.warranty_expiring`, `home.needs_details`, `home.recently_added` |
| Reused infra | Notes, Attachments, Household RLS, Inbox triage, Domain switcher, kiosk_cards stream, kiosk-agent edge function |
| Hooks added | `useHomes`, `useSpaces`, `useAssets`, `useReferenceFacts` |
| Components added | ~14 (see code-locations tree) |
| Test files added | ~6 unit/component, 3 E2E, 1 migration test |
