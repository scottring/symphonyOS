# Daily work and period references

Today remains the main daily execution surface. Week and month lists hold
commitments belonging to those periods, separately from dated work.

On desktop, the Reference controls pin either or both lists beside the current
page. Today's list dropdowns also offer “Keep beside my work.” Pins survive
navigation and reload within the browser session, scoped by account. Only period
identifiers are saved; list content is read live through the existing task hooks,
domain filters, assignee rules, and period selectors.

Pinning, reading, and unpinning never schedule tasks. “Do today” deliberately
places an item on the actual current day, even while another page is open.
“This week” uses the existing gated placement writer, including its month-copy
lineage behavior. A pin retains its chosen period until replaced or unpinned.

A page that already shows a period's list does not also draw it pinned. /week
holds the week list and folds the month beneath it; /month is the month's own
list. On those routes the matching pin is skipped and the Reference control
reads "on this page" — the pin is kept and its panel returns the moment you
navigate somewhere that isn't showing that period. The page wins because it
holds the period's whole record, completed and placed rows included, while a
pinned panel draws only the open pool. See
`src/components/reference/periodsOnPage.ts`.

Task details and the assistant temporarily take precedence over references;
pins are retained and their panels return when the competing panel closes.
At tablet widths references stack below the work. Phones do not mount reference
controls or panels. Phone navigation emphasizes Today and Inbox; Week and Month
remain available for lookup through More.

Task, routine, and list entries use larger body type, with smaller metadata and
controls. The approved paper-white, ink-blue and vermilion palette is retained,
with an almost-white neutral sidebar. Reference screenshots and fixtures use
fictional data only.

## The masthead every page wears

`MastheadCard` has three variants (`src/components/layout/MastheadCard.tsx`):

- `daybook` — Today: the open rule, the serif greeting, the date numeral in
  the left margin.
- `page` — every other surface: the same rule and serif heading one step down,
  no date numeral, and the surface's motif as a small stamp beside the name
  rather than a wash behind a rounded card.
- `card` — the older illustrated card. Nothing mounts it any more; it is kept
  so a surface that wants it can still ask.

`PageMasthead` (Goals) draws the same open shell. Pages keep their own
organisation: a library page is a list, not a day, and gets no date numerals.
