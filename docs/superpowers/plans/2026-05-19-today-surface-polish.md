# Today-Surface Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide the Today `<main>` column's gray scrollbar (keep scroll) and convert ClarityIndicator's last 2 emoji to ConceptIcon.

**Architecture:** Two tiny, independent edits: (1) a scoped `.scrollbar-none` CSS utility applied to one `<main>`; (2) two emoji `<span>`s → `<ConceptIcon>` via the already-shipped shared module. No behavior change; no test edits (no test asserts the scrollbar or the glyphs).

**Tech Stack:** Tailwind v4 / `src/index.css`, React 19 + TS, `lucide-react` via `@/lib/conceptIcons`. Spec: `docs/superpowers/specs/2026-05-19-today-surface-polish-design.md`.

**Worktree:** All work in `/Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/today-polish` on branch `feat/today-polish`. NEVER touch the shared main worktree. No `git checkout/switch/reset/cherry-pick/rebase`. Verify `git rev-parse --abbrev-ref HEAD` == `feat/today-polish` before each task. PATH if needed: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/local/bin:$PATH"`.

**Testing note:** These are pure visual/CSS + emoji-glyph swaps with no testable behavior, and no existing test asserts the scrollbar or the `✓`/`✨` glyphs (verified: `ClarityIndicator.test.tsx` only asserts `'Clarity Good'`; no `AppShell` test). So there is no TDD failing-test step — verification is tsc-clean build + the existing suites staying green + grep-guard + manual visual check. This is the honest verification for this change, not a skipped step.

---

## File Structure

| File | Change |
|---|---|
| `src/index.css` | Add `.scrollbar-none` utility in the SCROLLBAR STYLING section |
| `src/components/layout/AppShell.tsx` | Add `scrollbar-none` class to the Today `<main>` |
| `src/components/schedule/ClarityIndicator.tsx` | Import `ConceptIcon`; replace 2 emoji spans |

---

## Task 1: Hide the Today-column scrollbar

**Files:**
- Modify: `src/index.css` (SCROLLBAR STYLING section, after the `* { scrollbar-width: thin; … }` block ~line 865)
- Modify: `src/components/layout/AppShell.tsx` (the Today `<main>` className, ~line 237)

- [ ] **Step 1: Add the scoped utility to `src/index.css`.** Immediately after this existing block:

```css
* {
  scrollbar-width: thin;
  scrollbar-color: var(--color-neutral-300) transparent;
}
```

insert:

```css
/* Opt-in: hide scrollbar but keep scrolling (Today main column) */
.scrollbar-none {
  scrollbar-width: none;
}
.scrollbar-none::-webkit-scrollbar {
  display: none;
}
```

- [ ] **Step 2: Apply the class in `src/components/layout/AppShell.tsx`.** The Today `<main>` className is a template literal whose first line is exactly:

```
          relative flex-1 overflow-auto overflow-x-hidden
```

Change that line to:

```
          relative flex-1 overflow-auto overflow-x-hidden scrollbar-none
```

(Keep `overflow-auto` and every other line of the className/`style` unchanged — scroll stays functional; only the bar is hidden. Do not add the class anywhere else.)

- [ ] **Step 3: Build.**

Run: `npm run build`
Expected: tsc clean, Vite build succeeds (only the pre-existing chunk-size warning). No new errors.

- [ ] **Step 4: Commit.**

```bash
git add src/index.css src/components/layout/AppShell.tsx
git commit -m "feat(today): hide Today-column scrollbar (scoped .scrollbar-none, scroll kept)"
```

---

## Task 2: ClarityIndicator emoji → ConceptIcon

**Files:**
- Modify: `src/components/schedule/ClarityIndicator.tsx` (imports; lines ~158 and ~318)

- [ ] **Step 1: Add the import.** After the existing import line `import { MultiAssigneeDropdown } from '@/components/family/MultiAssigneeDropdown'`, add:

```tsx
import { ConceptIcon } from '@/lib/conceptIcons'
```

- [ ] **Step 2: Replace the `✓` span (~line 158).** Change:

```tsx
                  <span className="text-primary-500">✓</span>
```

to:

```tsx
                  <ConceptIcon name="done" decorative className="text-primary-500" />
```

- [ ] **Step 3: Replace the `✨` span (~line 318).** Change:

```tsx
                  <span>✨</span>
```

to:

```tsx
                  <ConceptIcon name="ai" decorative />
```

- [ ] **Step 4: Build + confirm no emoji + suites green.**

Run:
```bash
npm run build
grep -nP "[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}\x{2B00}-\x{2BFF}]" src/components/schedule/ClarityIndicator.tsx || echo "ZERO EMOJI - good"
npx vitest run src/components/schedule/ClarityIndicator.test.tsx src/lib/conceptIcons.test.tsx
```
Expected: tsc clean; grep prints `ZERO EMOJI - good`; `ClarityIndicator.test.tsx` passes **unchanged** (it only asserts `'Clarity Good'`, not the glyphs); `conceptIcons.test.tsx` 5/5.

- [ ] **Step 5: Commit.**

```bash
git add src/components/schedule/ClarityIndicator.tsx
git commit -m "refactor(today): ClarityIndicator ✓/✨ → ConceptIcon (last Today-surface emoji)"
```

---

## Task 3: Final verify

**Files:** none (verification only; no commit).

- [ ] **Step 1: Build clean.** `npm run build` → 0 tsc errors (pre-existing chunk-size warning OK).

- [ ] **Step 2: Today-surface emoji-free + no regressions.**

Run:
```bash
grep -rlP "[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}\x{2B00}-\x{2BFF}]" src/components/schedule --include="*.tsx" 2>/dev/null | grep -v ".test."
npx vitest run src/components/schedule/ClarityIndicator.test.tsx src/lib/conceptIcons.test.tsx src/components/layout/QuickCapture.test.tsx
```
Expected: first command → no output (zero emoji in `schedule/` non-test chrome). Suites green (ClarityIndicator unchanged, conceptIcons 5/5, QuickCapture 20/20 sanity).

- [ ] **Step 3: Manual matrix (record in PR).** On the live result: Today column scrolls (wheel/trackpad/touch) with **no visible gray bar** at the scratchpad seam; ClarityIndicator's scheduled-items check and "Everything is organized" sparkle render as aligned lucide icons (Check / Sparkles) inheriting their text color. Desktop + mobile.

---

## Self-Review

**Spec coverage:** Change 1 (scoped `.scrollbar-none` + apply to Today `<main>`, keep `overflow-auto`) → Task 1 ✓. Change 2 (ClarityIndicator `✓`→`done`, `✨`→`ai`, decorative, import) → Task 2 ✓. Behavior-preserving gates (no test asserts scrollbar/glyphs; ClarityIndicator.test stays byte-identical; build clean) → Tasks 1/2/3 ✓. Out-of-scope (no fade, no other edits) → honored (no task adds them). Verification (build, grep-guard, manual) → Task 3 ✓.

**Placeholder scan:** none — every step has the exact before/after code and exact commands. The "no TDD failing-test step" is an explicit, justified decision (no testable behavior; no asserting test), not an omission.

**Type consistency:** `ConceptIcon` props (`name: 'done'|'ai'`, `decorative`, `className`) match the shipped `@/lib/conceptIcons` contract used across no-emoji Slice 1. Class name `scrollbar-none` defined in Task 1 Step 1 and applied verbatim in Task 1 Step 2.

**Scope:** one tiny bundled change; inline execution proportionate (noted in spec).
