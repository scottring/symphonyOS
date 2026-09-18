# Page parity with the approved Today design

Worktree `.worktrees/daybook-design`, branch `codex/daybook-design`. Nothing
pushed, deployed, merged or published. The approved uncommitted baseline was
preserved and extended — no reset, no branch switch, no edits outside this
worktree. All sample content is fictional.

## What the open masthead is now

`MastheadCard` gained a third variant so every surface shares one shape
(`src/components/layout/MastheadCard.tsx`):

| variant | who wears it | what it draws |
|---|---|---|
| `daybook` | Today | rule, serif greeting, date numeral in the left margin |
| `page` | Week, Month/Season/Year, Inbox, every library page | the same rule and serif heading one step down; the surface's motif as a small stamp; no date numeral |
| `card` | nothing, kept available | the older rounded illustrated card + place wash |

`PageMasthead` (Goals) draws the same open shell. The rounded illustrated
header card and its place wash are gone from every reachable page. The motifs
shipped on 2026-09-11 were kept rather than deleted — they now ride as a 38px
stamp at full strength instead of a faded medallion behind a card, and they are
`aria-hidden` because the heading beside them already names the page.

## 1 — Week/Month/period pages and Inbox

- `/week` and the workweek/month fallback in `HomeHeader.tsx`, the three period
  pages (`PeriodPlanPage.tsx`) and `InboxView.tsx` all use `variant="page"`.
  Each keeps its own navigation and controls: the period eyebrow with its
  prev/next carets and "Back to this month" chip, /week's range presets on the
  quiet line, Inbox's Select/List/Focus/assignee row along the foot.
- Cards became ruled blocks. On the period pages: the goals block is a 2px ink
  rule (it used to be a tinted rounded panel), tasks and the completed fold sit
  under hairlines, and the "bigger picture" rail's three folds (season/year,
  routines, calendar) lost their borders and shadows. Same in `/week`'s list
  column (`WeekPoolLane`, `PlanRail`) and in the Inbox list, where
  `DenseInboxRow` is now a ruled row rather than a shadowed tile.
- Type: see **Entry size** below. Metadata and controls are held at 11–13px
  everywhere.

### Reconciling the folded lists with desktop pinning

New rule, in `src/components/reference/periodsOnPage.ts`: **a page that already
shows a period's list does not also draw it pinned.**

- `/week` shows the week list and folds the month beneath it, so both pins
  stand down there. `/month` is the month's own list, so the month pin stands
  down. `/season`, `/year`, Today and the library show neither, so pins draw
  normally.
- The pin is **kept**, not dropped. The Reference control reads
  "Week · on this page" and the panel returns the moment you navigate away.
- The page wins rather than the panel because the page holds the period's whole
  record — completed and placed rows included — while a pinned panel draws
  `selectHorizonPool`, i.e. only what is still open. Suppressing the page's
  list in favour of the pin is exactly the "full period record reduced to an
  incomplete-only queue" mistake the brief warned about, so it was avoided.
- Nothing about pinning writes or navigates; the gated placement writers and
  copy-down lineage are untouched.

## Entry size — revised after a live look (2026-09-18)

The handoff specified roughly 19–20px for primary content, and the first pass
built that. Seeing it in the running app, Scott didn't like it, and chose 16px
from a four-way comparison (`output/daybook/type-scale-compare.png`, 14 / 16 /
17 / 19px). **Entries are now 16px across the whole app, Today included** —
that scope was his call too, so nothing reads louder than anything else.

What moved down:

| surface | was | now |
|---|---|---|
| Today rows (`ScheduleItem`, both branches) | 19 / 20px | 16px |
| Routine collection row / its steps | 20 / 18px | 16 / 15px |
| List items, triage rows | 19px | 16px |
| Plan rows — task / goal | 19 / 20px serif | 16 / 17px serif |
| Inbox rows | 19px | 16px |
| Notes, Documents, Contacts, Lists, Discussions, History, House, Routines | 19px | 16px |
| Meal slot — shared / per person | 19 / 18px serif | 17 / 16px serif |
| Reference folds (`PlanRail`) | 15px | 14px |

Left where they were: /week's pool pills at 15px (a 288px column beside the
grid — one step down from the app scale rather than four, which is tighter
than the 13px they started at), detail-panel body copy at 15px (body text, not
an entry), and the note composer's 19px serif input, which predates both
passes. Goal rows landed back on the 17px serif they had *before* this work,
so the goal-vs-task step survives.

Everything in this section is a size literal in a className — trivially
re-dialled if 16 turns out to be a notch too far either way.

## 2 — Detail panels

- `PanelShell` lost its place wash and its 2xl radius; it is a hairline-bordered
  `rounded-lg` surface on the same divider rhythm.
- `PanelHeader`'s title is 22px serif (was 18px semibold), still click-to-edit
  with the same Enter/Escape/blur behaviour.
- One body size across every section: `text-sm` → `text-[15px]` in 25 files.
  Kept at 15px in the 16px revision — this is body copy, not a list entry.
  Section labels standardised from 10px/`tracking-wider` to 11px/`0.08em`,
  matching Today's quiet-label grammar.
- Phones keep the app's 48px touch buttons, so the action row and field rows
  stay tappable; see `parity-panel-390.png`.

## 3 — Library pages

Notes, Documents, Lists, Contacts, Meals (plan + recipe shelf), Routines,
Discussions, House and History: open masthead, primary entries at 16px, quieter
12–13px metadata, and card nesting replaced by ruled rows. Specifics worth
knowing:

- `DocumentRow` had a hardcoded sage-green focus ring (`#5c8a5c`) and green/grey
  inset rings standing in for borders; all three are now palette tokens.
- Settings' grey pill tab tray became an underlined tab strip with a vermilion
  active rule, and its three nested white cards became ruled rows.
- History's month groups are ruled lists rather than bordered white panels.
- `HomeOverview` also lost two emoji (⚠, 🏠) for lucide icons, per the project's
  no-emoji convention.
- Recipe cards on the meal shelf already used the open ruled treatment and were
  left alone.

## 4/5 — Stray legacy decoration

- Green: `.input-base:focus` (a teal-forest ring), `DocumentRow`'s field ring,
  `SlotAdd`, and the whole `TendCard` dark-green panel are on ink-blue tokens.
- Warm: the shadow ramp was warm-brown tinted under white paper and is now
  ink-tinted; the auth page's `gradient-mesh` was teal + cream and is now paper
  white with ink and vermilion at a whisper; the routine pill in /week's list
  and the drag overlay were hardcoded warm hsl and are now primary tokens.
- Meal warmth was **kept** but moved onto tokens: the dinner chip, the week
  grid's dinner band and the Today meal tick now use `accent-*` (vermilion) in
  place of hardcoded `hsl(14 …)` / `hsl(28 …)`.
- Preserved deliberately: domain and person colours, `amber` for the waiting
  state and the House "needs details" warning, success green, `danger` red, and
  the `review` family.
- One judgement call to flag: the goal target glyph on planning surfaces moved
  from amber to `accent-600`. Amber read as an orphan hue once the neutrals went
  blue, and the baseline had already moved Today's "Up next" and "Needs a
  Decision" marks to accent. It is a one-line revert in `PlanRow`, `PlanRail`
  and `PeriodPlanPage` if you want the amber back.
- The assistant pane's place wash (`tint="strong"`, opacity 0.24) was removed —
  a strong tinted gradient down that column fought the paper-white work beside
  it.

## 6 — Layout verification

Static previews rendered from the real components with mocked hooks and
fictional data, then photographed with Playwright. All in `output/daybook/`:

| preview | what it shows |
|---|---|
| `parity-refs-0-1600.png` | desktop, zero pinned lists — full-width work |
| `parity-refs-1-1600.png` | one pinned list |
| `parity-refs-2-1600.png` | two pinned lists |
| `parity-refs-2-1024.png` | tablet: references stack below the work |
| `parity-month-1600.png` / `-1100.png` / `-390.png` | /month at wide, constrained and phone widths |
| `parity-week-1600.png` | /week masthead + list column + month fold |
| `parity-inbox-1600.png` / `-390.png` | Inbox |
| `parity-contacts-1600.png` / `-390.png` | a library page |
| `parity-panel-1600.png` / `-390.png` | detail panel |
| `parity-dinner-1600.png` | the retinted dinner chip |
| `type-scale-compare.png` | the 14 / 16 / 17 / 19px comparison the size decision came from |

All previews were re-rendered after the 16px revision, so they match the code.

The `.html` source for each sits beside it. The temporary fixture files used to
render them were deleted; re-running them means re-writing them.

Two phone defects found and fixed while checking 390px:

1. `PlanRow`'s hover verb rail (Keep / Someday / Drop / take-down) is now
   `hidden sm:flex`. On a phone it was invisible — there is no hover — yet took
   the width of four 48px touch buttons, squeezing the title to one word a
   line, and an unseen "Drop" was still tappable. A phone opens the row. The
   16px revision eases the squeeze but not the reason: without hover those
   buttons are unreachable chrome either way.
2. The goal target glyph is desktop-only for the same reason; the section
   heading already says the rows are goals.

Both are visual/interaction scope, both are one-line reverts.

The 48px phone button floor in `index.css` (an unlayered
`@media (max-width: 768px) button { … }` rule) was left alone. It is pre-existing,
it beats every Tailwind utility because unlayered CSS outranks layered CSS, and
the approved Today phone preview is built on it. It is the reason phone ticks
and chips render as large rings — consistent with `final-mobile-390.png`, not a
new regression.

## Verification

- `npm run build` — passes (`output/daybook/claude-build.log`).
- `npx tsc --noEmit -p tsconfig.app.json` — clean.
- `npm run lint` — 0 errors, 324 pre-existing warnings
  (`output/daybook/claude-lint.log`).
- `npx vitest run` — **6015 passed, 3 skipped, 582 of 583 files pass**
  (`output/daybook/claude-tests.log`). The one failing file,
  `connectors/src/whatsapp/adapter.test.ts`, cannot resolve
  `@whiskeysockets/baileys`: `connectors/` has no `node_modules` in this
  worktree and no local changes. Pre-existing environment gap, unrelated to
  this work; it needs `npm install` inside `connectors/`.
- Tests run under Node 22.14.0 via nvm, which avoids the Node 26 web-storage
  incompatibility entirely (no `NODE_OPTIONS` flag needed).

New regression coverage:

- `src/components/reference/periodsOnPage.test.ts` — which periods each route
  already shows.
- `src/components/reference/ReferenceLists.test.tsx` — two new cases: a pin is
  skipped (not dropped) on a page already showing that list and comes back on
  navigation; a week pin still draws on `/month`, which shows no week list.
- `src/shell/ShellLayout.test.tsx` — the reference panel yields to an open task
  detail, says so, and returns when the detail closes.
- `src/components/layout/MastheadCard.test.tsx` — the `daybook` and `page`
  variants: open shell, no wash, date numeral only on Today, motif as a
  decorative stamp.

## Honest limitations

- Previews are static renders of the real components with mocked hooks, not the
  running app against a live account. They prove layout and type, not data.
- Today's own page was not re-photographed from `TodayView` (it needs the full
  app harness). Its approved previews still stand; the only Today-surface
  changes in this pass are the meal-chip retint and the meal tick border, and
  `parity-dinner-1600.png` covers those.
- `/week`'s preview covers the masthead, the pool column and the month fold —
  the pieces this pass changed. The day grid itself is unchanged and was not
  re-rendered.
- No access-control or domain-filter logic was touched. The reference lists
  still read through `filterTasksForLayers` / `doableBy` / the period
  selectors. Mocked filtering in tests does not prove database privacy, and
  nothing here was verified against real authenticated accounts.
- The `card` masthead variant now has no callers. It was kept rather than
  deleted to stay inside the requested scope.
