# Symphony OS — Master Plan v2

## Last updated: 2026-03-26

## Architecture Decisions

| System | Role |
|--------|------|
| **Symphony** | The beautiful, stupidly simple front end — one calm screen where your day unfolds |
| **Open Brain** | The knowledge engine, running on an always-on Mac Mini |
| **Vault (Obsidian)** | Single source of truth — all notes write here. No data trapped in Supabase. Full portability. |

**Unified notes:** One stream, no tabs, no "where does this live" decisions. System knows provenance behind the scenes.

**Agent pane:** Its own overlay layer, not sharing space with the detail panel. Persistent across views.

**Coaching removed:** Top-down abstract system replaced by bottom-up intelligence embedded where it matters.

---

## Status

### Done
- [x] Phase 1: Coaching removal — ~21,800 lines removed across 92 files, merged to main
- [x] 7 dead edge functions removed
- [x] 6 old component versions + tests removed
- [x] All coaching hooks (12), types (4), config (2), lib utilities (5) removed

### Phase 2: Simplify App.tsx
- [ ] Break remaining 60+ hooks into focused context providers (scheduling, notes, calendar, etc.)
- [ ] Reduce re-render blast radius

### Phase 3: Wall System Access ✅
- [x] Wire the wall into sidebar navigation so it's reachable from the UI (opens /wall in new tab)

### Phase 4: Build the New Vision (in order)
1. **Unified notes viewer/editor** — one stream, vault as source of truth, Open Brain API powers search/retrieval, Symphony writes back to vault
2. **Smart overdue suggestions** — AI reads task context (links, phone numbers, notes, staleness) and suggests contextual actions
3. **Email intelligence** — Gmail triage agent, surface email cards in day view, suggested actions (like the Kelly/UPM example)
4. **Agent pane** — persistent right-side overlay, conversational fallback, context-aware, action-capable
5. **Routine intelligence** — behavior tracking embedded in routines (like the Kjellum bedtime example), pattern recognition, contextual reminders

---

## Infrastructure Needed

- [ ] Open Brain running on Mac Mini with stable network endpoint (Cloudflare Tunnel or Tailscale)
- [ ] Open Brain API hardened (auth, CORS)
- [ ] Symphony → Open Brain API connection for knowledge/search
- [ ] Symphony → vault write-back for captures and notes

---

## Open Questions

### Mac Mini always-on setup
- How to expose Open Brain API: Cloudflare Tunnel vs Tailscale?
- Service management: launchd to keep it running?
- Network reliability for Symphony (deployed) → Mac Mini (home network)?

### Telegram replacement
- Does Symphony's mobile view replace the Telegram capture channel?
- What's needed: PWA install, push notifications, offline capture, share target?
- Or keep Telegram as a quick-capture pipe into Symphony?

---

## What Already Exists (integration code in codebase)

### Symphony hooks (built, need wiring to Open Brain)
- `useVaultWrite` (97 lines) — writes to vault (currently via Supabase edge function)
- `useChat` (110 lines) — AI chat (currently via `symphony-chat` edge function)
- `useNotes` (487 lines) — unified notes system
- `useActionQueue` (150 lines) — approval-based action queue
- `useGranolaSync` (257 lines) — Granola meeting sync
- `useProjectSync` (190 lines) — project sync to Open Brain

### Symphony UI components (built)
- `ChatPanel` — AI chat interface
- `EntityNotesSection` + `NoteCard` — notes display
- `ActionQueueBar` — action approval UI
- `MeetingNotesView` — Granola meeting view

### Supabase edge functions (deployed)
- `vault-sync`, `vault-write` — vault integration
- `semantic-search`, `symphony-chat` — AI/knowledge (to be replaced by Open Brain)
- `gmail-check`, `gmail-send`, `email-scanner` — email integration
- `action-queue` — action pipeline

### Open Brain (separate repo: open-brain-ui)
- Express server with routes: today, search, capture, notes, upload, dataview, meetings, projects
- SQLite + sqlite-vec for local vector search
- Granola auto-sync (reads cache every 30s)
- Vault library for direct Obsidian reads
- Embeddings engine (OpenAI)
