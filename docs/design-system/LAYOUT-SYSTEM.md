# Symphony layout system

Approved by Scott, 2026-10-01 (preview: https://claude.ai/artifact/KxVQah2N5nYS9YJHvraWrP).
Amended 2026-10-03: two widths, the narrow-column row, movement, the weekend
band, faint scenery (spec `docs/superpowers/specs/2026-10-03-week-grid-design.md`).
Supersedes the layout parts of the older files in this folder; colours, faces
and the place themes are unchanged (`src/index.css`, painted scenery #104).

The aim: every page reads as one app. One column, one margin lane, one
masthead, one section heading, one row, one empty state.

## 1. Two widths

Scott, 2026-10-03: "widen the content space to fit a landscape screen". The
880px column left half a landscape screen empty.

- **Reading pages** (Inbox, Lists, Notes, Routines, Settings, Contacts, Today
  on its own): the shared left gutter (16 / 40 / 56px) and **1040px of
  content** (`PAGE_COLUMN`, `max-w-[1152px]` with the gutter), centred in the
  1152px frame beneath the header.
- **Planning pages** (Week, Month, Season, Today with its week column) fill
  the screen: up to **1600px of content** (`PAGE_PLANNING`,
  `max-w-[1712px]`). Their root carries `.planning-page`
  (`PLANNING_PAGE_CLASS`), which raises the shell's frame (`--frame-max`) —
  header, page and guide widen together.
- `PAGE_COLUMN_WIDE` is the reading column (kept as a name);
  `PAGE_COLUMN_SPLIT` is now `PAGE_PLANNING`.
- `PAGE_COLUMN_FULL` only for canvases you work on: Week's hourly grid, the
  people river.
- Columns are `mx-auto` (`PAGE_COLUMN`, `PAGE_COLUMN_SPLIT`); don't hand-roll
  `mr-auto` or a different max-width.

## 2. The margin lane

A **64px lane** at the column's left, then a 12px gap, so the body starts at
**76px** (`--ds-body`). The lane holds what a paper daybook puts in its
margin: Today's date numeral, times, dates, a library page's stamp, a row's
icon or avatar. Section headings span lane and body; titles and check circles
start at the body edge.

The lane applies to page-wide lists. Inside a multi-column planning page
(Week / Month / Season / Year), rows start at their column's edge.

## 3. One masthead

`MastheadCard` (`variant="daybook"` on Today, `"page"` everywhere else).
Numeral or stamp in the lane; serif title (34px max); one muted subline;
page controls at the right of the title. On desktop the separate control row
folds into the masthead (status line as the subline, view controls at the
right). Phones keep their control row.

`PageMasthead` is retired; use `MastheadCard variant="page"`.

## 4. One section heading, one group label

- `SectionHeading` (`src/components/layout/SectionHeading.tsx`): serif 21px
  over a hairline, optional quiet note or action at right. Today's
  `.daybook-journal-heading` and the planning pages' `.pv2-colh` match it.
- `GroupLabel`: a group inside a section — 11px caps, 0.08em tracking,
  neutral-500. No rule.

## 5. One row

- Today: `src/components/schedule/todayRowGrid.ts` — lane (time) · 20px mark ·
  title with a 12px meta line · fixed rail (who 84px · context · verb · ⋯).
  All three Today row types use it.
- Library pages: `src/components/layout/listRow.ts` (`LIST_ROW` and parts) —
  lane (icon, avatar, date) · title + meta · trailing.
- 16px titles, 12px meta, no rules between rows, hover tint
  `bg-primary-50/50` with a `primary-100` border. The row box bleeds 12–13px
  past the column so its content sits on the column edge.
- Initials: 24px circles, 10px text, -4px overlap — every letter readable.
- **The narrow-column row** (Week, 2026-10-03): `WeekRow`
  (`src/components/plan/v2/WeekRow.tsx`, styles `.wk-row` in
  `layout-system.css`) — lane (a time, or empty) · mark · title + meta ·
  people · trailing, 16px (14.5px in the grid's day cells). Every column on
  Week draws it; no white cards.
- **Marks:** ○ task · ○ + ↻ routine · — calendar event · ◆ goal · – a month
  line.
- **Movement:** a row that can move shows a grip on hover, and anything that
  can go somewhere else drags there (Scott: "if it can go somewhere else, it
  drags"). A timed task keeps its time on a new day; a routine moves one
  occurrence; a calendar event never moves; nothing lands on a past day.

## 6. One empty state

`EmptyState` (`src/components/layout/EmptyState.tsx`): a serif 20px line,
one 14px sentence saying what goes here, at most one quiet action.
Left-aligned in the column, not a centred icon poster.

## 7. Header band, no footer bar

Agreed with Scott 2026-10-02.

- **The band.** The top bar is the page's header: edge to edge across the
  workspace, a paper wash 40% strong over the page colour or the fixed sky,
  a hairline under it. It pins as a whole.
- **The ends overhang evenly.** At the left, the tree mark and the
  SYMPHONY wordmark (10.5px tracked capitals; links to Today); at the right,
  the area, assistant, Inbox, search and account icons. Both ends sit the
  same distance in from the frame's edges (32px past the page gutter at
  desktop width, 24px below 1024px), and the page column is centred beneath
  them, so the header overhangs the content equally on both sides.
- **The wordmark** shows only when the header band is at least 1240px wide
  (a container query, so an open side pane counts); below that the mark
  stands alone. The mark is `public/symphony-logo.png` (transparent, no
  ring), lifted a step at night so it does not sink into the dark band.
- **Room under the header.** Every desktop page starts 16px below the band
  (`.desktop-workspace-page` padding). It is fixed: a short page is not
  pushed further down (tried and declined, 2026-10-02).
- **No footer bar.** The painted landscape at the foot of the page stays
  clear. Keyboard shortcuts and Help live at the bottom of the ☰ menu;
  Today's "Review today" closes the day's list on desktop (phones keep it
  in the ⋯ menu).

## 8. Columns, and the Week grid

Agreed with Scott 2026-10-02 (Week page; Month and Season followed). Week
became a grid on 2026-10-03.

- **Week is a grid.** The sources on top — the month's plan in two columns
  beside this week's list, each capped at about nine rows and scrolling
  inside itself — and the days across the full width below: the weekend as
  one band (Saturday · Sunday · Sometime this weekend), the weekdays side by
  side. Each day's untimed routines fold to one line ("Routines · N"); timed
  ones stay on the day. Phones stack it: the list, the weekend, the weekdays,
  the month.
- **Planning a week, in steps** (Scott, 2026-10-03: "more obviously
  sequential"). The session is a guide over the same page: **Look back**
  (last week's leftovers, one card at a time; skipped when there are none) ·
  **Fixed points** (the days alone, only what can't move — events, timed
  work, specials) · **Fill the week** (the month and this week's list over the
  days, routines unfolded; everything drags) · **The plan** (the days alone,
  read-only, then Mark planned). The bar numbers the steps with Back / Next
  (`PlanMeetingBar` `steps`); Month and Season keep their two steps.
- **The weekend band.** "Sometime this weekend" holds the weekend's window
  work once: Weekend-rule routines nobody has given a day, and tasks planned
  for the weekend with no day. A Sunday-start week has no band (its Saturday
  and Sunday are different weekends).
- **Source first.** Side-by-side columns read left to right as planning
  moves (Scott, 2026-10-03): the level above, the period's list, then its
  own time. Week: month · list · days (List view: list · days). Month:
  season · list · dates (List view: list · dates). Season: year · list.
- **Side by side, each column scrolls.** On Month (season reference, list,
  dates) and Season (year reference, list) each column fills the room from the column headings down to the
  landscape and scrolls independently; the page itself does not scroll.
  Mark the grid `is-colscroll` and give it the ref `useColumnsFitWindow()`
  returns; it measures that room into `--pv2-col-h` (window height − grid
  top − `--scenery-clearance`, at least 360px). Year is one column and keeps
  the page scroll.
- **Headings hold the top.** Each column's heading pins at its top. In the
  reference column every section heading (each month of a week that
  crosses a month end) holds until its own list ends, then the
  next pushes it off. Pinned headings wear the page's own background (the
  fixed sky).
- **Stacked columns keep one page scroll** (below 861px). On Month the dates
  sit under the list and reference between 861 and 1060px, reached by the
  page scroll.

## Type scale

| Token | Size | Use |
|---|---|---|
| `--ds-text-label` | 11px caps | group labels |
| `--ds-text-meta` | 12px | line under a row title, timestamps |
| `--ds-text-body` | 14px | sentences, sublines, empty-state body |
| `--ds-text-row` | 16px | row titles |
| `--ds-text-section` | 21px serif | section headings |
| `--ds-text-title` | 34px serif | page titles |
| numeral | Jost 200 | horizon numerals (60px on Today, in the lane) |

Prefer these over new arbitrary sizes.

## Scenery

Pages sit on the place's painted sky with no cards behind text (#104). The
scene is **faint by default** — behind the page at a tenth of its strength,
so content runs to the bottom of the window — and **Full** (in front, at the
foot of the page) is a choice in Settings › Your place › Scene; short desktop
windows stay faint either way (2026-10-03).
Settings › Your place › Style picks **Painted** or **Woodblock**
(Hiroshige-inspired prints, 2026-10-01): two landscape sets for the same five
places and three lights, both under the same CSS sky tinted to the place. The
page and the chooser cards draw from `sceneryArt()` in
`src/components/place/panoramas.ts`.

The woodblock files arrived already cut (2172×724, transparent above the
land, each with its veil mask; skylines in
`scripts/scenery/woodblock-manifest.json`). Do not run the extract scripts on
them, crop their transparent padding, or show a veil as an image. The extract
scripts are only for the painted set's full-page concepts.

Use
colour tokens (`--color-neutral-*`, `--color-primary-*`), never literal
colours, so Night lighting's light-on-dark remap reaches every page.

## Where it lives

- Tokens and shared classes: `src/styles/layout-system.css` (loaded after
  `index.css`). Rules that restyle existing classes are desktop-only (md+);
  phones follow the native-app anchor.
- Column constants: `src/components/layout/pageLayout.ts`.
