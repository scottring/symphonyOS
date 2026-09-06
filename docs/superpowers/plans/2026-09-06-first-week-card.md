# "Your first week" card — Implementation Plan (Plan 3 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new household sees one card at the top of Today with four real steps, each launching the existing flow, until the steps are done.

**Architecture:** A pure `firstWeek.ts` decides done-ness from data the Today container already holds (members, tasks, routines, invitations); a `FirstWeekCard` component renders it; `HomeViewContainer` mounts it above the day. The sample page is a bundled JPEG fed into `PageFromPaperFlow` as a Blob.

**Tech Stack:** React 19 + TS strict, Vitest + RTL.

**Spec:** Part F of `docs/superpowers/specs/2026-09-06-demo-run-2-fixes-and-first-week-card-design.md`. Depends on Plan 1 Task 7 (`PageFromPaperFlow` accepting an initial blob).

## Global Constraints

Same as Plan 1. Copy lives in one file. No emoji; lucide icons. No counts on Today (the card shows "done · 4 people" as a fact of a step, which is allowed; never a progress percentage).

---

### Task 1: `firstWeek.ts` — steps and done tests

**Files:** `src/lib/firstWeek.ts`, `src/lib/firstWeek.test.ts`

**Interfaces:**
```ts
export type FirstWeekStepId = 'people' | 'page' | 'partner' | 'routine'
export interface FirstWeekSignals {
  memberCount: number
  pageCommitted: boolean       // any task/note/goal with capture_meta.source === 'page', or a planning_sessions row
  partnerInvited: boolean      // a second active household_members row, or an unexpired invitation
  routineCount: number
}
export interface FirstWeekStep { id: FirstWeekStepId; title: string; done: boolean; doneLine: string | null; to: string }
export function firstWeekSteps(s: FirstWeekSignals): FirstWeekStep[]
export function shouldShowFirstWeek(steps: FirstWeekStep[], hiddenAt: string | null, now: Date): boolean
export const FIRST_WEEK_HIDE_KEY = (uid: string) => `symphony.firstWeek.hidden.${uid}`
```

- [ ] **Step 1: Failing tests**
```ts
import { firstWeekSteps, shouldShowFirstWeek } from '@/lib/firstWeek'
const none = { memberCount: 1, pageCommitted: false, partnerInvited: false, routineCount: 0 }
it('four steps, all undone for a fresh account', () => {
  const s = firstWeekSteps(none)
  expect(s.map((x) => x.id)).toEqual(['people', 'page', 'partner', 'routine'])
  expect(s.every((x) => !x.done)).toBe(true)
  expect(s[1].to).toBe('/today?plan=paper')
})
it('done lines point at where the result lives', () => {
  const s = firstWeekSteps({ memberCount: 4, pageCommitted: true, partnerInvited: true, routineCount: 2 })
  expect(s[0]).toMatchObject({ done: true, doneLine: '4 people' })
  expect(s[1]).toMatchObject({ done: true, doneLine: 'see This Week' })
  expect(s[3]).toMatchObject({ done: true, doneLine: 'see Routines' })
})
it('shows only while ≥2 steps remain, and hides for 7 days after Hide for now', () => {
  const two = firstWeekSteps({ ...none, memberCount: 4, pageCommitted: true })
  expect(shouldShowFirstWeek(two, null, new Date())).toBe(true)
  const one = firstWeekSteps({ ...none, memberCount: 4, pageCommitted: true, partnerInvited: true })
  expect(shouldShowFirstWeek(one, null, new Date())).toBe(false)
  expect(shouldShowFirstWeek(two, new Date(Date.now() - 2 * 86_400_000).toISOString(), new Date())).toBe(false)
  expect(shouldShowFirstWeek(two, new Date(Date.now() - 8 * 86_400_000).toISOString(), new Date())).toBe(true)
})
```
- [ ] **Step 2: Run** `npx vitest run src/lib/firstWeek.test.ts` → FAIL.
- [ ] **Step 3: Implement**
```ts
export function firstWeekSteps(s: FirstWeekSignals): FirstWeekStep[] {
  return [
    { id: 'people', title: 'Name your people', done: s.memberCount > 1, doneLine: s.memberCount > 1 ? `${s.memberCount} people` : null, to: '/settings#household' },
    { id: 'page', title: "Snap this week's page", done: s.pageCommitted, doneLine: s.pageCommitted ? 'see This Week' : null, to: '/today?plan=paper' },
    { id: 'partner', title: 'Invite your partner', done: s.partnerInvited, doneLine: s.partnerInvited ? 'invited' : null, to: '/settings#invite' },
    { id: 'routine', title: 'Add one routine', done: s.routineCount > 0, doneLine: s.routineCount > 0 ? 'see Routines' : null, to: '/routines' },
  ]
}
export function shouldShowFirstWeek(steps: FirstWeekStep[], hiddenAt: string | null, now: Date): boolean {
  const remaining = steps.filter((s) => !s.done).length
  if (remaining < 2) return false
  if (hiddenAt) {
    const t = Date.parse(hiddenAt)
    if (Number.isFinite(t) && now.getTime() - t < 7 * 86_400_000) return false
  }
  return true
}
```
- [ ] **Step 4: Run** → PASS. **Step 5: Commit** — `git commit -am "feat(first-week): the four steps and when the card shows"`

---

### Task 2: Signals from data — `useFirstWeekSignals`

**Files:** `src/hooks/useFirstWeekSignals.ts` (+ test)

- [ ] **Step 1: Failing test** — with mocked supabase: `family_members` count 4, `tasks` where `capture_meta->>source = 'page'` count 1, `household_members` count 2, `routines` count 0 → `{ memberCount: 4, pageCommitted: true, partnerInvited: true, routineCount: 0 }`. Also `household_invitations` unexpired count counts as invited.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** — four `head: true, count: 'exact'` selects run in parallel, plus one on `household_invitations` (`gt('expires_at', now)`). If `tasks.capture_meta` never gets `source: 'page'` set by `useCommitPage` (check Plan 1 Task 5 — add `captureMeta: { source: 'page' }` to the addTask options there if the options support it; else fall back to `planning_sessions` count for the same user), use whichever signal exists. Re-fetch when the window regains focus (the flows write elsewhere).
- [ ] **Step 4: Run** → PASS. **Step 5: Commit** — `git commit -am "feat(first-week): signals from the data the account already has"`

---

### Task 3: `FirstWeekCard` on Today + sample page

**Files:** `src/components/schedule/FirstWeekCard.tsx` (+ test), `src/apps/tasks/HomeViewContainer.tsx`, `public/sample/week-page.jpg` (copy of `~/Documents/scotts-world/projects/symphony-os/assets/2026-09-06-demo-paper-page-week-of-sept-7.jpg` re-rendered with names Sam / Jo / the kids — edit the `-source.html`, render with the Playwright snippet from this session, save under `public/sample/`), `src/components/capture/PageFromPaperFlow.tsx` (accept `initialBlob?: Blob` and `initialAltitude?: PageAltitude`)

- [ ] **Step 1: Failing tests**
```tsx
it('lists four steps, each a link into the real flow', () => {
  render(<FirstWeekCard steps={firstWeekSteps(none)} onHide={vi.fn()} onSamplePage={vi.fn()} />)
  expect(screen.getByRole('heading', { name: 'Your first week' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /Snap this week's page/ })).toHaveAttribute('href', '/today?plan=paper')
  expect(screen.getByRole('button', { name: /use our sample page/i })).toBeInTheDocument()
})
it('a done step collapses to its done line', () => {
  render(<FirstWeekCard steps={firstWeekSteps({ …none, memberCount: 4 })} … />)
  expect(screen.getByText('4 people')).toBeInTheDocument()
})
it('Hide for now calls onHide', async () => { … })
// HomeViewContainer: `?plan=paper` opens the flow; `?plan=sample` opens it with the bundled blob on the week altitude
```
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** — card markup per the spec sketch: `<section aria-labelledby="first-week">` with a `<h2 id="first-week" className="font-display text-lg">Your first week</h2>`, a `<ul>` of steps (lucide `Circle`/`CheckCircle2`), undone rows are `<Link to={step.to}>`; the page step has the extra line "No paper handy? <button>Use our sample page</button>"; footer "Hide for now". `HomeViewContainer`: mount above the day when `shouldShowFirstWeek(steps, localStorage[FIRST_WEEK_HIDE_KEY(uid)], new Date())`; handle `?plan=paper` → `setPlanFromPaperOpen(true)`; `?plan=sample` → `fetch('/sample/week-page.jpg').then(r => r.blob())` → open the flow with `initialBlob` and `initialAltitude: 'week'`; rows committed from the sample carry `captureMeta: { source: 'page', sample: true }` (pass through `PageFromPaperFlow` → `useCommitPage` payload `sample: true`) and the card shows "Clear sample" (deletes tasks/notes where `capture_meta->>sample = 'true'`) once a real page has been committed.
- [ ] **Step 4: Run** → PASS; `npx tsc -p tsconfig.app.json --noEmit` clean. Check the card in the browser on `smkaufman+test1@gmail.com` (a fresh account) at `localhost:5174/today`.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(today): the Your first week card, with a sample page for households without paper handy"`

---

### Task 4: Suite + push

- [ ] `npx vitest run`, `npm run lint`, tsc → clean. Rebase; push the branch. Ship to `main` together with Plans 1–2 once the migrations are applied.
