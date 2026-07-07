# Assistant Everywhere Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the fenced Symphony assistant (`symphony-agent` edge fn) reachable with context from every entry point: the Plan-your-day wizard (P1 anchor — "make this doable"), a merged ⌘K unibox (Quick Add + Search + Ask Symphony), and the Add-to-today input.

**Architecture:** One brain, many doors. The `symphony-agent` Supabase edge function stays the single agent backend; we add (a) a `taskContext` channel so the agent knows which task a conversation is about, (b) an `AssistantLaunchContext` provider so any component can open the rail assistant pre-seeded with a message, and (c) three UI doors wired to it. Local NL parsing stays the instant default everywhere; the AI is an explicit one-tap escalation.

**Tech Stack:** React 19 + TS strict, Vite 7, Tailwind v4 (Nordic Journal), Supabase edge functions (Deno), Vitest + RTL.

## Global Constraints

- Work in worktree `.worktrees/assistant-everywhere`, branch `feat/assistant-everywhere` off `origin/main`. Never edit/commit in the main worktree.
- Pushes to `main` auto-deploy to prod. Only push finished phases; run `npm run lint`, `npx vitest run`, and `npm run build` before each push.
- `npm test` is watch mode — always use `npx vitest run`.
- No emojis in UI — lucide icons / `ConceptIcon` only.
- Edge fn changes deploy separately: `supabase functions deploy symphony-agent` (project `mwadppyrqzuzgstmwpuy`). Deploy before pushing client code that depends on new fields (unknown body fields are ignored by the old fn, so ordering is safe either way).
- P2 lesson (walkthrough): never fake intelligence. AI affordances are explicit, honest, and escalate to the real agent.
- The agent's writes land via edge fn (external writes) — the task list has NO realtime for them; callers must pass `onMutate` → `refetch`.

---

## Phase 0 — Shared plumbing (Tasks 1–3)

### Task 1: `taskContext` channel — client stream + hook

**Files:**
- Modify: `src/lib/agentStream.ts` (StreamHandlers + body)
- Modify: `src/hooks/useSymphonyAssistant.ts` (options object signature)
- Modify: `src/shell/Shell.tsx:61`, `src/shell/ShellLayout.tsx:145` (callers — no-arg call stays valid)
- Test: `src/hooks/useSymphonyAssistant.test.ts` (extend)

**Interfaces:**
- Produces: `export interface AssistantTaskContext { id: string; title: string; notes?: string | null; projectName?: string | null }` (exported from `agentStream.ts`)
- Produces: `useSymphonyAssistant(opts?: { onMutate?: () => void; taskContext?: AssistantTaskContext })` — replaces the positional `onMutate?` param.
- Produces: `StreamHandlers.taskContext?: AssistantTaskContext`, sent as `body.taskContext`.

- [x] **Step 1: Write failing test** — in `useSymphonyAssistant.test.ts`, mock `streamSymphonyAgent` and assert that when the hook is created with `taskContext`, `sendMessage` forwards it in handlers; and that `onMutate` fires on write tools (existing behavior preserved under the new signature).
- [x] **Step 2: Run test, verify fail** — `npx vitest run src/hooks/useSymphonyAssistant.test.ts`
- [x] **Step 3: Implement** — add `taskContext` to `StreamHandlers` and request body in `agentStream.ts`; change hook signature to options object; expand `WRITE_TOOLS` to include `symphony_delete_task`, `symphony_update_project`, `symphony_update_routine`, `symphony_delete_routine`, `symphony_create_note`.
- [x] **Step 4: Tests pass** + update the two call sites (no-arg calls unchanged).
- [x] **Step 5: Commit** — `feat(assistant): task-context channel from client to symphony-agent`

### Task 2: Edge fn — accept `taskContext`, add needs-discussion fields

**Files:**
- Modify: `supabase/functions/symphony-agent/index.ts`

**Changes:**
1. `symphony_update_task` input_schema gains: `needs_discussion: { type: 'boolean', description: 'Flag that the real next step is a conversation with someone' }`, `discussion_note: { type: ['string','null'], description: 'Who to talk to and what about' }`. Handler already spreads updates — no handler change.
2. Body parsing: `const taskContext = body.taskContext ?? null` (validate `id`+`title` are strings, else ignore).
3. First-user-message prefix (where `datePrefix` is built): when taskContext present, append to the prefix:
   `\n(This conversation is about the task "<title>" (id <id>).<notes?> Task notes: <notes>.</notes?><project?> Project: <projectName>.</project?> The user wants help making this task doable. You can: break it into subtasks (symphony_create_task with parent_task_id), enrich its notes with what you find out, or — when the real next step is a conversation with someone — set needs_discussion true with a discussion_note via symphony_update_task. Look the task up by id before writing.)`
4. Deploy: `supabase functions deploy symphony-agent` and verify a 401 without JWT still returned (auth gate intact).

- [x] Steps: implement → deploy → curl smoke test (401 unauthenticated) → commit `feat(agent): taskContext injection + needs_discussion tool fields`

### Task 3: `AssistantLaunchContext` — open the rail with a seed from anywhere

**Files:**
- Create: `src/contexts/AssistantLaunchContext.tsx`
- Modify: `src/shell/Shell.tsx` (wrap content in provider; ShellAssistantHost consumes seed)
- Modify: `src/shell/ShellLayout.tsx` (non-Today rail consumes seed; opens on launch)
- Test: `src/contexts/AssistantLaunchContext.test.tsx`

**Interfaces:**
- Produces:
```typescript
export interface AssistantSeed { message: string; autoSend?: boolean }
export function useAssistantLauncher(): { openAssistant: (seed?: AssistantSeed) => void }
// internal to hosts:
export function useAssistantSeedConsumer(): { seedRequest: { seed: AssistantSeed | null; nonce: number } | null; consume: () => AssistantSeed | null }
```
- Provider holds a `{ seed, nonce }` request. `openAssistant()` (no seed) just raises the open request. The *active* host (Today rail when on a Today path; ShellLayout rail otherwise) reacts to nonce changes: un-hides/opens itself and, if `seed.autoSend`, calls `assistant.sendMessage(seed.message)` exactly once via `consume()`.
- Outside the provider, `useAssistantLauncher` returns a no-op (so components are usable in tests without the provider).

- [x] Steps: failing test (launch → host opens + auto-sends once) → implement → tests green → commit `feat(assistant): global launch context seeds the rail from anywhere`

**Phase 0 gate:** `npm run lint && npx vitest run && npm run build` → push `origin HEAD:main`.

---

## Phase 1 — P1 anchor: "Help me plan" in the Plan-your-day wizard (Tasks 4–6)

### Task 4: ChatPanel suggestion chips

**Files:**
- Modify: `src/components/chat/ChatPanel.tsx` (new optional prop)
- Test: `src/components/chat/ChatPanel.test.tsx` (extend or create)

**Interfaces:**
- Produces: `ChatPanelProps.suggestions?: string[]` — rendered as tappable chips in the empty state (under the "Ask me anything" copy); click calls `onSend(suggestion)`.

```tsx
{suggestions && suggestions.length > 0 && (
  <div className="mt-4 flex flex-col gap-2 w-full max-w-[260px]">
    {suggestions.map((s) => (
      <button key={s} type="button" onClick={() => onSend(s)}
        className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600 hover:bg-primary-50 hover:text-primary-700 hover:border-primary-200 transition-colors text-left">
        {s}
      </button>
    ))}
  </div>
)}
```

- [x] Steps: failing test (chips render when empty, click fires onSend, hidden once messages exist) → implement → green → commit `feat(chat): suggestion chips in ChatPanel empty state`

### Task 5: `PlanAssistDrawer` — the wizard's assistant surface

**Files:**
- Create: `src/components/planning/daily/PlanAssistDrawer.tsx`
- Test: `src/components/planning/daily/PlanAssistDrawer.test.tsx`

**Interfaces:**
- Consumes: `useSymphonyAssistant({ taskContext, onMutate })`, `ChatPanel` (+`suggestions`), `AssistantTaskContext`.
- Produces:
```typescript
interface PlanAssistDrawerProps {
  task: AssistantTaskContext
  onClose: () => void
  /** Called after the agent writes (subtasks/notes/discussion) so the wizard refetches. */
  onMutate?: () => void
}
export function PlanAssistDrawer(props: PlanAssistDrawerProps): JSX.Element
```
- Render: fixed right-side panel `fixed inset-y-0 right-0 z-[60] w-full max-w-[420px] shadow-2xl` (above the wizard's z-50), backdrop button on the left to close. Mounts `ChatPanel` with `entityContext={{ id: task.id, name: task.title, type: 'task' }}`, `mode="chat"`, and suggestions:
  - `"Break this into doable steps"`
  - `"What do I need before I can start?"`
  - `"The next step is a conversation — set that up"`

- [x] Steps: failing test (renders task title; suggestion chip send reaches the mocked hook; Escape/backdrop closes) → implement → green → commit `feat(planning): PlanAssistDrawer — fenced assistant inside the daily wizard`

### Task 6: Wire the wizard — card button + drawer + refetch

**Files:**
- Modify: `src/components/planning/daily/PlanItemCard.tsx` — new `onAssist?: () => void`; button in the "When" header row, between the label and "Not today":
```tsx
{onAssist && (
  <button type="button" onClick={onAssist}
    className="inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 transition-colors">
    <ConceptIcon name="ai" size={13} decorative /> Help me plan
  </button>
)}
```
- Modify: `src/components/planning/daily/PlanTodaySession.tsx` — props gain `onRefetchTasks?: () => void`; state `const [assistItem, setAssistItem] = useState<PlanItem | null>(null)`; tasks-kind cards get `onAssist={() => setAssistItem(it)}` (routine cards: omit — routines aren't tasks; v2 later); render drawer:
```tsx
{assistItem && (() => {
  const t = tasks.find((x) => x.id === assistItem.id)
  return (
    <PlanAssistDrawer
      task={{ id: assistItem.id, title: assistItem.title, notes: t?.notes ?? null, projectName: null }}
      onClose={() => setAssistItem(null)}
      onMutate={onRefetchTasks}
    />
  )
})()}
```
- Modify: `src/apps/tasks/HomeViewContainer.tsx:624` — pass `onRefetchTasks={refetch}`.
- Test: `src/components/planning/daily/PlanTodaySession.test.tsx` (extend: button renders on task cards, opens drawer).

- [x] Steps: failing test → implement → green → commit `feat(planning): Help-me-plan on daily plan cards (P1 anchor)`

**Phase 1 gate:** lint + vitest + build → push → **live browser verify** (plan wizard → Help me plan → agent breaks a task down; subtasks visible after refetch).

---

## Phase 2 — ⌘K Unibox (Tasks 7–9)

### Task 7: Extract search-result navigation

**Files:**
- Create: `src/shell/useSearchNavigation.ts` (logic lifted verbatim from `ShellSearch.tsx` `handleSelect`)
- Modify: `src/shell/ShellSearch.tsx` to consume it.
- Test: covered by existing ShellSearch behavior tests if any; else unit-test the hook's URL construction with a mocked navigate.

**Interfaces:**
- Produces: `useSearchNavigation(): (result: SearchResult, tasks: Task[]) => void` — navigates/opens the right surface for a result.

- [x] Steps: implement + test → commit `refactor(search): extract useSearchNavigation`

### Task 8: Search results inside Quick Add (the merge)

**Files:**
- Create: `src/components/omnibox/OmniboxResults.tsx` — self-contained (subscribes to data hooks ONLY while mounted, mirroring ShellSearch): takes `query: string` and `onNavigate: () => void` (closes the modal), runs `useSearch`, renders a compact result list (top 6, grouped icons as in `SearchModal`) using `useSearchNavigation`.
- Modify: `src/components/layout/QuickCapture.tsx` — render `<OmniboxResults query={title} onNavigate={handleClose} />` between the preview card and the buttons when `title.trim().length >= 2`. Header copy stays "Quick Add"; kbd hint shows `⌘K`.
- Modify: `src/shell/ShellLayout.tsx` — ⌘/ now also opens Quick Add (`setQuickAddOpen(true)`); remove `searchOpen` state + `ShellSearch` mount; add a Search icon button in the sidebar nav that opens Quick Add.
- Test: `src/components/omnibox/OmniboxResults.test.tsx` (query renders matching task rows; selecting calls navigation + onNavigate).

**Interfaces:**
- Consumes: `useSearch`, `useSearchNavigation`, data hooks (`useSupabaseTasks`, `useProjects`, `useContacts`, `useRoutines`, `useListsContext`).
- Produces: `OmniboxResults({ query, onNavigate }): JSX.Element | null`.

- [x] Steps: failing test → implement → green → commit `feat(omnibox): merge search into ⌘K Quick Add; ⌘/ aliases; sidebar search entry`

### Task 9: "Ask Symphony" escalation row in the unibox

**Files:**
- Modify: `src/components/layout/QuickCapture.tsx` — when `title.trim()` non-empty, render after OmniboxResults:
```tsx
<button type="button" onClick={handleAskSymphony}
  className="w-full flex items-center gap-2 rounded-xl border border-primary-100 bg-primary-50/60 px-4 py-3 text-sm text-primary-700 hover:bg-primary-50 transition-colors">
  <Sparkles className="w-4 h-4" />
  <span className="flex-1 text-left truncate">Ask Symphony to set this up: “{title.trim()}”</span>
  <kbd className="px-1.5 py-0.5 bg-white/70 text-primary-500 rounded text-xs font-mono">⌘↵</kbd>
</button>
```
  `handleAskSymphony` = `openAssistant({ message: title.trim(), autoSend: true })` + `handleClose()`. Also wire ⌘+Enter in `handleKeyDown`.
- Consumes: `useAssistantLauncher` (Task 3).
- Test: extend `QuickCapture.test.tsx` — row appears with text, click calls launcher + closes.

- [x] Steps: failing test → implement → green → commit `feat(omnibox): Ask-Symphony escalation row (⌘↵)`

**Phase 2 gate:** lint + vitest + build → push → browser verify (⌘K search + add + ask; ⌘/ opens same box).

---

## Phase 3 — Smart Add-to-today (Task 10)

### Task 10: escalation affordance in `TodayAddInput`

**Files:**
- Modify: `src/components/schedule/TodayAddInput.tsx` — when expanded and `value.trim()` non-empty, render below the suggestion row:
```tsx
<button type="button" onMouseDown={(e) => e.preventDefault()} onClick={handleAskSymphony}
  className="flex items-center gap-1.5 px-3 pb-2 md:px-4 text-xs text-primary-600 hover:text-primary-700 transition-colors">
  <Sparkles className="w-3.5 h-3.5" /> Set this up with Symphony
</button>
```
  `handleAskSymphony` = `openAssistant({ message: \`Set this up and schedule it for today: ${value.trim()}\`, autoSend: true })` + `reset()`.
- Test: extend/create `TodayAddInput.test.tsx` — row shows when typing; click calls launcher with the composed message and resets.

- [x] Steps: failing test → implement → green → commit `feat(today): Symphony escalation on Add-to-today`

**Phase 3 gate:** lint + vitest + build → push → browser verify → update vault walkthrough file (P1 no longer parked) + Claude memory.

---

## Self-review notes

- Spec coverage: P1 anchor (Tasks 4–6), unibox merge F14+F5 (7–9), smart Add-to-today (10), plumbing (1–3). Rail availability on non-Today already exists (ShellLayout `chatOpen`) — launcher (Task 3) makes it reachable programmatically; no separate task needed.
- Type consistency: `AssistantTaskContext` defined once in `agentStream.ts`, consumed by hook/drawer. `AssistantSeed.message` is required (openAssistant with no seed = just open).
- Routines in the wizard don't get Help-me-plan in v1 (agent task tools are task-shaped); noted in Task 6.
