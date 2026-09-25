# The planning guide's print check

The guide at `/guide` is four sheets you print. Whether they actually print —
one sheet at a time, at Letter and at A4, without the app's interface on the
paper and without anything falling off the end — is not something a unit test
can answer, so it is answered here, in a real browser.

```
npm run build
npx vitest run --config outputs/planning-guide/vitest.config.mts
node outputs/planning-guide/check-print.mjs
```

The first step builds the stylesheet. The second renders `PlanningGuide` to a
self-contained `guide-print-proof.html` with that stylesheet inlined, so the
check needs no sign-in. The third opens it in Chromium under print media and
asks:

- the introduction and every button are off the paper;
- "Print this sheet" leaves exactly one sheet on the page;
- nothing runs off the side at either paper size;
- every writing line still has room to write on at the printed width;
- the number of sides matches the height of the sheet — the check that caught
  the real bug, below.

`sheet-*-letter.pdf` and the proof HTML are generated and untracked.

## What it caught

The first version lifted the printable subtree out with `position: absolute;
inset: 0`, copying the pattern `PrintableDayList` uses. That works for a list
that fits on one side. Here it left the document no height, so Chromium
paginated nothing: a 2464px sheet printed as **one page** and everything past
the first side was silently clipped — while looking perfectly correct on
screen and in a one-page PDF.

The guide now stays in the document flow. `PlanningGuide` tags the chain of
ancestors between itself and `<body>` on mount, and the print stylesheet has
each of them give up its layout and its other children. Pagination is the
browser's again.

## Where it stands

| Sheet | Sides, Letter and A4 |
| --- | --- |
| Week | 1 |
| Month | 2 |
| Season | 3 |
| Year | 3 |

Nine sides in all, and each sheet says its own number on itself. The check
compares that claim against what Chromium actually prints, so the page cannot
go on saying "four sheets" while producing twelve sides (Codex, 2026-09-24).

The week sheet earns its single side by **asking less** — a shorter look-back
folded into one band, two priorities, three next actions, and the family prompt
as one line rather than a band — not by shrinking the explanation. Print type
went back UP: 10pt labels, 9.5pt questions, 9pt hints and leads. Bands may now
run over a page break (blocks may not), because keeping a 460pt band whole
threw it onto a fresh side and left the one before it half empty.
