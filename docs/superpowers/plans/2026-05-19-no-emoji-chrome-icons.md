# No-Emoji Main-App Chrome → Lucide Icons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every emoji in main-app chrome with lucide icons routed through one shared `conceptIcons` module.

**Architecture:** A single `src/lib/conceptIcons.tsx` maps concept keys → approved lucide-react icons; the 45 in-scope chrome `.tsx` files render `<ConceptIcon name="…" />` instead of emoji literals. Behavior-preserving for tested components (QuickCapture 20-gate + timeline/capture suites stay green; emoji-asserting tests updated deliberately).

**Tech Stack:** React 19 + TS strict, `lucide-react@^0.556.0` (already a dep), Vitest + RTL. Spec: `docs/superpowers/specs/2026-05-19-no-emoji-chrome-icons-design.md`.

**Worktree:** All work in `/Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/no-emoji-icons` on branch `feat/no-emoji-icons`. NEVER touch the shared main worktree. No `git checkout/switch/reset/cherry-pick/rebase`. Each task: `cd` to the worktree; verify `git rev-parse --abbrev-ref HEAD` == `feat/no-emoji-icons` (else STOP/BLOCKED); capture base SHA before commit. PATH if needed: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/local/bin:$PATH"`.

---

## Authoritative concept → lucide map (used by every task)

`ConceptName` → lucide-react component (PascalCase import name):

| name | import | | name | import |
|---|---|---|---|---|
| `done` | `Check` | | `close` | `X` |
| `list` | `ClipboardList` | | `add` | `Plus` |
| `when` | `Calendar` | | `streak` | `Flame` |
| `note` | `StickyNote` | | `discussion` | `MessageCircle` |
| `task` | `SquareCheckBig` | | `email` | `Mail` |
| `routine` | `Repeat` | | `location` | `MapPin` |
| `project` | `Folder` | | `attachment` | `Paperclip` |
| `person` | `User` | | `warning` | `TriangleAlert` |
| `context` | `Tag` | | `time` | `Clock` |
| `chore` | `SprayCan` | | `ai` | `Sparkles` |
| `errand` | `Car` | | `celebration` | `PartyPopper` |
| `activity` | `Volleyball` | | `idea` | `Lightbulb` |
| `call` | `Phone` | | | |

**Emoji → concept** (apply at every call-site): ✓✔☑→`done` · 📋→`list` · 📅🗓→`when` · 📝✎→`note` · ✅→`task` · 🔁🔄→`routine` · 📁📂→`project` · 👤🧑→`person` · 🏷🏷️→`context` · 🧹→`chore` · 🚗→`errand` · ⚽🏀🎾→`activity` · 📞☎→`call` · ✕✗❌→`close` · ➕→`add` · 🔥→`streak` · 💭💬🗨→`discussion` · ✉📧📨📩→`email` · 📍→`location` · 📎→`attachment` · ⚠⚠️→`warning` · 🕐🕒⏰→`time` · ✨⭐🌟✦💫🌠→`ai` · 🎉🎊→`celebration` · 💡→`idea`. Any emoji not listed → choose the closest concept and note it in the task report.

**Layout rule:** emoji were inline text. Replace with `<ConceptIcon name="x" />` and, where the emoji sat next to text, add `decorative` (icon is `aria-hidden`, text carries meaning) and ensure inline vertical alignment (the component applies `inline-block align-[-0.125em]`; if a call-site used flex/gap the icon slots in unchanged). Where the emoji WAS the only content of an interactive control (e.g. an icon-only button), pass an `aria-label` so the accessible name is preserved/improved.

---

## File Structure

| File | Responsibility | New/Modify |
|---|---|---|
| `src/lib/conceptIcons.tsx` | `ConceptIcon` component + `ConceptName` union + `CONCEPT_ICONS` record — single source of truth | Create |
| `src/lib/conceptIcons.test.tsx` | Contract tests | Create |
| 45 chrome `.tsx` files (Tasks 3–7, listed per task) | emoji literal → `<ConceptIcon>` | Modify |
| `src/components/capture/ParsedFieldChips.test.tsx`, `src/components/layout/QuickCapture.test.tsx`, `src/components/list/ListView.test.tsx` | Update emoji-glyph assertions → icon accessible-name/testid | Modify (in their batch task) |

---

## Task 1: `conceptIcons` module (the contract)

**Files:** Create `src/lib/conceptIcons.tsx`, `src/lib/conceptIcons.test.tsx`.

- [ ] **Step 1: Write the failing test** — `src/lib/conceptIcons.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { ConceptIcon, CONCEPT_ICONS } from './conceptIcons'

describe('ConceptIcon', () => {
  it('renders an svg for every concept in the map', () => {
    for (const name of Object.keys(CONCEPT_ICONS) as (keyof typeof CONCEPT_ICONS)[]) {
      const { container, unmount } = render(<ConceptIcon name={name} />)
      expect(container.querySelector('svg')).toBeInTheDocument()
      unmount()
    }
  })
  it('non-decorative has an accessible name (defaults to humanized concept)', () => {
    render(<ConceptIcon name="when" />)
    expect(screen.getByRole('img', { name: /when/i })).toBeInTheDocument()
  })
  it('explicit aria-label wins', () => {
    render(<ConceptIcon name="person" aria-label="Assign person" />)
    expect(screen.getByRole('img', { name: 'Assign person' })).toBeInTheDocument()
  })
  it('decorative is aria-hidden and exposes no accessible name', () => {
    const { container } = render(<ConceptIcon name="note" decorative />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
  it('applies size and className', () => {
    const { container } = render(<ConceptIcon name="task" size={28} className="text-red-500" />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('width')).toBe('28')
    expect(svg.classList.contains('text-red-500')).toBe(true)
  })
})
```

- [ ] **Step 2: Run, expect FAIL** — `npx vitest run src/lib/conceptIcons.test.tsx` → module not found.

- [ ] **Step 3: Implement `src/lib/conceptIcons.tsx`:**
```tsx
import {
  Check, ClipboardList, Calendar, StickyNote, SquareCheckBig, Repeat,
  Folder, User, Tag, SprayCan, Car, Volleyball, Phone, X, Plus, Flame,
  MessageCircle, Mail, MapPin, Paperclip, TriangleAlert, Clock, Sparkles,
  PartyPopper, Lightbulb, type LucideIcon,
} from 'lucide-react'

export const CONCEPT_ICONS = {
  done: Check, list: ClipboardList, when: Calendar, note: StickyNote,
  task: SquareCheckBig, routine: Repeat, project: Folder, person: User,
  context: Tag, chore: SprayCan, errand: Car, activity: Volleyball,
  call: Phone, close: X, add: Plus, streak: Flame, discussion: MessageCircle,
  email: Mail, location: MapPin, attachment: Paperclip, warning: TriangleAlert,
  time: Clock, ai: Sparkles, celebration: PartyPopper, idea: Lightbulb,
} satisfies Record<string, LucideIcon>

export type ConceptName = keyof typeof CONCEPT_ICONS

interface ConceptIconProps {
  name: ConceptName
  size?: number
  className?: string
  decorative?: boolean
  'aria-label'?: string
}

/** Single source of truth for chrome iconography. No emoji anywhere in chrome — use this. */
export function ConceptIcon({ name, size = 16, className, decorative, ...rest }: ConceptIconProps) {
  const Icon = CONCEPT_ICONS[name]
  const label = rest['aria-label'] ?? name
  return (
    <Icon
      size={size}
      className={`inline-block align-[-0.125em]${className ? ` ${className}` : ''}`}
      aria-hidden={decorative ? true : undefined}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : label}
    />
  )
}
```

- [ ] **Step 4: Run, expect PASS** — `npx vitest run src/lib/conceptIcons.test.tsx` (5 tests). Then `npm run build` (tsc clean; pre-existing chunk-size warning OK).

- [ ] **Step 5: Commit**
```bash
git add src/lib/conceptIcons.tsx src/lib/conceptIcons.test.tsx
git commit -m "feat(icons): conceptIcons — shared lucide map (single source of truth)"
```

---

## Conversion task procedure (Tasks 2–6 all follow this)

For each file in the task's list:
1. Read the file; find every emoji literal (regex `[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}\x{2B00}-\x{2BFF}]` plus `\x{FE0F}` variation selector).
2. Replace each with `<ConceptIcon name="<concept from the emoji→concept map>" decorative />` when it sits beside text, or with an `aria-label` (no `decorative`) when it is the sole content of an interactive/standalone control. Add `import { ConceptIcon } from '@/lib/conceptIcons'`.
3. Preserve layout: if the emoji was in a string template/array (not JSX), refactor that spot to render the component (e.g. a `label` string containing an emoji becomes JSX `<><ConceptIcon .../> {text}</>`, or move the icon out of the data into the render). If a data structure must stay a plain string, replace the emoji with the empty string and render the icon at the consuming JSX keyed off the existing discriminant — note any such site in the report.
4. After the file's edits, run that file's component test if one exists; if a test asserts the removed emoji, update the assertion to query the icon by `getByRole('img', { name })` or add/seek a `data-testid` — deliberately, keeping every other assertion in the suite unchanged and green.
5. After all files in the batch: `npm run build` (tsc clean) and run the batch's test files + the always-on gates (`src/components/layout/QuickCapture.test.tsx` MUST stay 20/20 with only intentional in-scope edits; timeline/capture suites green). Then one commit for the batch.

No `as any`. Do not touch `src/components/wall/**`, content `.ts` files, or anything outside the batch list.

---

## Task 2: Convert `schedule/` (9 files)

**Files (Modify):** `src/components/schedule/DenseInboxRow.tsx`, `EmailActionsBanner.tsx`, `FocusInboxCard.tsx`, `OutcomePicker.tsx`, `ProactiveSuggestionChips.tsx`, `ScheduleItem.tsx`, `TimelineInsertPoint.tsx`, `TimelineNoteCard.tsx`, `TodaySchedule.tsx`. **Tests to check/update:** `src/components/schedule/TimelineInsertPoint.test.tsx`, `ScheduleItem` / `ProactiveSuggestionChips` / `DenseInboxRow` / `FocusInboxCard` / `TimelineNoteCard` / `TodaySchedule` tests if present and emoji-asserting.

- [ ] **Step 1: Apply the conversion procedure** to all 9 files using the authoritative emoji→concept map. Worked example — `TimelineInsertPoint.tsx` wheel segments currently use emoji icons in the `SEGMENTS` array; change each segment to carry a `ConceptName` and render `<ConceptIcon name={s.concept} size={20} decorative />` in place of `<span class="text-xl">{s.icon}</span>` (note → `note`, task → `task`, event → `when`, routine → `routine`). Keep the existing `aria-label={s.label}` on each segment button (do NOT make the icon non-decorative — the button already has the accessible name), so `TimelineInsertPoint.test.tsx` (queries by `name: /^Note$/i` etc.) stays green unchanged.
- [ ] **Step 2:** `npx vitest run src/components/schedule/TimelineInsertPoint.test.tsx` → all pass unchanged. Run any other present schedule test files for these components; update only emoji-glyph assertions per procedure step 4.
- [ ] **Step 3:** `npm run build` (tsc clean) + `npx vitest run src/components/layout/QuickCapture.test.tsx` (must remain 20/20 — sanity that shared deps unaffected).
- [ ] **Step 4:** `grep -rlP "[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}\x{2B00}-\x{2BFF}]" <the 9 files>` → expect NO matches.
- [ ] **Step 5: Commit** `git add src/components/schedule && git commit -m "refactor(icons): schedule/ chrome emoji → ConceptIcon"`

---

## Task 3: Convert `capture/` + `layout/` + `triage/` (6 files — the gated batch)

**Files (Modify):** `src/components/capture/ParsedFieldChips.tsx`, `src/components/layout/QuickCapture.tsx`, `src/components/layout/Sidebar.tsx`, `src/components/triage/InboxTriageModal.tsx`, `src/components/triage/SchedulePopover.tsx`, `src/components/triage/TimePickerPopover.tsx`. **Tests (Modify):** `src/components/capture/ParsedFieldChips.test.tsx`, `src/components/layout/QuickCapture.test.tsx`.

This batch contains the QuickCapture **20-gate** and `ParsedFieldChips` (shared, battle-tested). Treat like the QuickCapture-extraction work: behavior changes only where emoji→icon is intended; every other assertion stays.

- [ ] **Step 1: Apply the conversion procedure** to all 6 files. `ParsedFieldChips.tsx`: the date/time chip uses `🕐`/`📅` (→ `time` / `when`), category chip emoji (→ `chore`/`errand`/`activity`/etc. per the task category), context chip — replace each with `<ConceptIcon ... decorative />` inside the existing chip `<span>` (keep the chip `<span>` + its × `<button>` with `onMouseDown` preventDefault + `aria-label` exactly as-is). `QuickCapture.tsx`: any emoji in its preview/labels → ConceptIcon.
- [ ] **Step 2: Update the two gated test files deliberately.** In `ParsedFieldChips.test.tsx`, the time-chip test currently matches `/6:15|18:15|🕐/`. Change the emoji alternative to assert the icon: render still shows the time text, plus the clock icon — update that assertion to `expect(screen.getAllByText(/6:15|18:15/).length).toBeGreaterThan(0)` (drop the `🕐` alternative; the time text remains the real assertion) OR query `getByRole('img',{name:/time/i})` if the icon is non-decorative there (it is decorative beside the time text → use the text assertion). In `QuickCapture.test.tsx`, scan for any assertion referencing an emoji glyph; if a preview/chip test asserts an emoji, re-point it to the rendered text or the icon's testid — change ONLY those assertions; the other 20 stay byte-identical.
- [ ] **Step 3:** `npx vitest run src/components/capture/ParsedFieldChips.test.tsx src/components/layout/QuickCapture.test.tsx` — ParsedFieldChips green; QuickCapture **still 20/20** (only the deliberately-updated emoji assertions changed). If any QuickCapture test fails for a reason other than an intended emoji→icon assertion, STOP/BLOCKED (behavior drift).
- [ ] **Step 4:** `npm run build` (tsc clean). Grep the 6 files → zero emoji.
- [ ] **Step 5: Commit** `git add src/components/capture src/components/layout src/components/triage && git commit -m "refactor(icons): capture/layout/triage chrome emoji → ConceptIcon (gated suites green)"`

---

## Task 4: Convert `surface/` (9 files)

**Files (Modify):** `src/components/surface/TapContactPanel.tsx`, `TapEventPanel.tsx`, `TapProjectPanel.tsx`, `sections/PanelActions.tsx`, `sections/PanelLinked.tsx`, `sections/PanelLinks.tsx`, `sections/PanelMightBeRelevant.tsx`, `sections/PanelPeople.tsx`, `sections/PanelSubtasks.tsx`.

- [ ] **Step 1:** Apply the conversion procedure to all 9 files (emoji→concept map; `decorative` beside text; `aria-label` for icon-only controls).
- [ ] **Step 2:** Run any present surface test files; update only emoji-glyph assertions per procedure step 4.
- [ ] **Step 3:** `npm run build` (tsc clean) + grep the 9 files → zero emoji + `npx vitest run src/components/layout/QuickCapture.test.tsx` (20/20 sanity).
- [ ] **Step 4: Commit** `git add src/components/surface && git commit -m "refactor(icons): surface/ chrome emoji → ConceptIcon"`

---

## Task 5: Convert `meals/` + `chat/` + meal `detail/` (11 files)

**Files (Modify):** `src/components/meals/habits/StandingHabitsPage.tsx`, `meals/plan/DistributeLeftoversModal.tsx`, `meals/plan/InlineBriefComposer.tsx`, `meals/plan/MealPlanRitualPage.tsx`, `meals/plan/RitualStatus.tsx`, `meals/shelf/AddRecipeButton.tsx`, `meals/shelf/RecipeDiscoverDialog.tsx`, `meals/today/MealStateRow.tsx`, `meals/tonight/MobileTabBar.tsx`, `src/components/chat/MealRequestCards.tsx`, `src/components/detail/MealEventSection.tsx`.

- [ ] **Step 1:** Apply the conversion procedure to all 11 files. Food/meal emojis not in the map (e.g. 🍝🥗🍳) → there is no food concept in scope; replace with the closest UI concept only if the emoji is chrome (e.g. a status marker). If an emoji is genuine *content* (a meal name/label rendered from data, not chrome), it is OUT of Slice 1 — leave it and list it in the report as "content emoji, deferred" (do NOT invent food concepts).
- [ ] **Step 2:** Run any present meals/chat/detail test files; update only emoji-glyph assertions per procedure step 4.
- [ ] **Step 3:** `npm run build` (tsc clean) + grep the 11 files → only deferred-content emoji (if any) remain, each listed in the report; zero chrome emoji + QuickCapture 20/20 sanity.
- [ ] **Step 4: Commit** `git add src/components/meals src/components/chat src/components/detail/MealEventSection.tsx && git commit -m "refactor(icons): meals/chat chrome emoji → ConceptIcon (content emoji noted/deferred)"`

---

## Task 6: Convert remaining chrome (10 files)

**Files (Modify):** `src/components/notes/EntityLinkPicker.tsx`, `notes/NoteDetail.tsx`, `notes/NoteModal.tsx`, `src/components/detail/AgentInsightsSection.tsx`, `src/components/health/InboxZeroCelebration.tsx`, `health/SystemHealthWidget.tsx`, `src/components/onboarding/v2/GoalsScreen.tsx`, `onboarding/v2/HelpPanel.tsx`, `src/components/someday/SomedayView.tsx`, `src/components/settings/DemoControls.tsx`, `src/components/contact/CategoryPicker.tsx`. (`InboxZeroCelebration` 🎉 → `celebration`; `CategoryPicker` category emojis → `chore`/`errand`/`activity`/`when`/`task` per category.)

- [ ] **Step 1:** Apply the conversion procedure to all 11 files.
- [ ] **Step 2:** Run any present test files for these; update only emoji-glyph assertions per procedure step 4. Also handle `src/components/list/ListView.test.tsx` — its assertions reference an emoji rendered by an in-scope component (`CategoryPicker`/category rendering); re-point those assertions to the icon (`getByRole('img',{name})`/testid) consistent with the conversion. If `ListView.tsx` itself contains no emoji, only its test changes.
- [ ] **Step 3:** `npm run build` (tsc clean) + grep the 11 files → zero emoji + QuickCapture 20/20 sanity.
- [ ] **Step 4: Commit** `git add src/components/notes src/components/detail/AgentInsightsSection.tsx src/components/health src/components/onboarding src/components/someday src/components/settings src/components/contact src/components/list/ListView.test.tsx && git commit -m "refactor(icons): remaining chrome emoji → ConceptIcon"`

---

## Task 7: Guard + full verification

**Files:** none (verification only; no source changes — no commit unless Step 4 adds the guard doc).

- [ ] **Step 1: Chrome emoji grep-guard.** Run:
```bash
grep -rlP "[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}\x{2B00}-\x{2BFF}]" src/components --include="*.tsx" 2>/dev/null | grep -v "/wall/" | grep -v ".test."
```
Expected: **no output** (zero emoji in non-wall chrome). Any file listed that is genuinely deferred *content* emoji (from Task 5) must be explicitly enumerated with justification in the report; anything else = FAIL, return to the owning batch.

- [ ] **Step 2: Build + full suite.** `npm run build` (tsc clean). `npm test -- --run 2>&1 | tail -15` (note: `npm test` is vitest; use `--run` or `npx vitest run` to avoid watch mode). Expected: only the documented pre-existing unrelated failures may remain (`src/hooks/useSpaces.test.ts`, `src/components/notes/NotesPage.test.tsx` — both pre-existing on `origin/main`, unrelated). Confirm **zero new failures** vs that baseline, and QuickCapture 20/20.

- [ ] **Step 3: Manual matrix (record in PR).** Desktop + mobile spot-check: timeline radial wheel (Note/Task/Event/Routine icons aligned, tappable), `ParsedFieldChips` chips (time/category/context icons inline with text, × still works), triage row (when/context/person icons), inbox list, `InboxZeroCelebration`. No layout breakage / icon-vs-text baseline misalignment.

- [ ] **Step 4: Commit (only if a guard doc/CI note is added; else skip).**

---

## Self-Review

**Spec coverage:** shared `conceptIcons` module (Task 1 ✓); approved mapping applied everywhere (authoritative map + Tasks 2–6 ✓); ~45 chrome files all listed across Tasks 2–6 (schedule 9, capture/layout/triage 6, surface 9, meals/chat/detail 11, remaining 11 = 46 incl. CategoryPicker/MealEventSection — covers the grep'd set ✓); wall/ + content `.ts` excluded (stated in every task ✓); behavior-preserving + QuickCapture 20-gate (Task 3 explicit, gate re-checked every batch ✓); a11y via decorative/aria-label (Task 1 contract ✓); grep-guard enforceable invariant (Task 7 ✓); manual matrix (Task 7 ✓).

**Placeholder scan:** Task 1 has full module + test code. Conversion tasks use one authoritative emoji→concept map + a worked example (`TimelineInsertPoint`, `ParsedFieldChips`) + exact file lists + exact gated-test-update instructions — the mapping table IS the complete substitution spec (not vague). The deferred-content-emoji handling (Task 5) is an explicit decision rule, not a TODO.

**Type consistency:** `ConceptName`/`CONCEPT_ICONS`/`ConceptIcon` props (`name`,`size`,`className`,`decorative`,`aria-label`) defined Task 1, consumed identically Tasks 2–6. lucide import names are the verified PascalCase for `lucide-react@0.556` (`SquareCheckBig`, `TriangleAlert`, `SprayCan`, `Volleyball`, `PartyPopper`, etc.).

**Scope:** one slice, one plan; batched bite-sized tasks; no decomposition needed beyond the already-agreed Slice-1 boundary.
