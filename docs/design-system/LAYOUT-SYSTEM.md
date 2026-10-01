# Symphony layout system

Approved by Scott, 2026-10-01 (preview: https://claude.ai/artifact/KxVQah2N5nYS9YJHvraWrP).
Supersedes the layout parts of the older files in this folder; colours, faces
and the place themes are unchanged (`src/index.css`, painted scenery #104).

The aim: every page reads as one app. One column, one margin lane, one
masthead, one section heading, one row, one empty state.

## 1. One column

- Every page: the shared left gutter (16 / 40 / 56px) and **880px of content**
  (`PAGE_COLUMN`, `max-w-[992px]` with the gutter), left-aligned.
- `PAGE_COLUMN_WIDE` is now the same column (kept as a name).
- `PAGE_COLUMN_SPLIT` (1152px) only for two panes side by side: Today with
  its week column.
- `PAGE_COLUMN_FULL` only for canvases you work on: Week's hourly grid, the
  people river.
- Never `mx-auto` or `margin: 0 auto` on a page column.

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

## 6. One empty state

`EmptyState` (`src/components/layout/EmptyState.tsx`): a serif 20px line,
one 14px sentence saying what goes here, at most one quiet action.
Left-aligned in the column, not a centred icon poster.

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

Pages sit on the place's painted sky with no cards behind text (#104). Use
colour tokens (`--color-neutral-*`, `--color-primary-*`), never literal
colours, so Night lighting's light-on-dark remap reaches every page.

## Where it lives

- Tokens and shared classes: `src/styles/layout-system.css` (loaded after
  `index.css`). Rules that restyle existing classes are desktop-only (md+);
  phones follow the native-app anchor.
- Column constants: `src/components/layout/pageLayout.ts`.
