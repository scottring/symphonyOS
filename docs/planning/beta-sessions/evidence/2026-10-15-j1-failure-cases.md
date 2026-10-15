# J1 failure cases — hosted evidence, 2026-10-15 (synthetic household A, Chrome signed in as the invited adult A2; A1 acts through the REST API as "the other person")

Build `assets/index-CWdSOp8P.js` (main `74803e64`) unless noted.

| Case | Steps | Observed | Records |
|---|---|---|---|
| Retry after a dropped connection, no duplicate | The same direct-write turn ("Add a task: call Morgan …") sent twice with one `turnId` | Both replies reported the same row id `a94a324a-…`; outcome `saved` both times | exactly one row; deleted afterwards |
| Stale approval | Card "2 tasks moved to Saturday"; A1 renames one of the two tasks (database `updated_at` bumped); A2 presses Approve | Card refused: "'Return library books (renewed)' changed since I proposed this. Ask me for a fresh list." Receipt "Didn't save … Nothing changed." — `2026-10-15-stale-approval-refused.jpg` | neither task moved |
| Undo conflict | Card "2 tasks moved to Friday" approved (`2026-10-15-approve-two-moves.jpg`); A1 adds a note to one task; A2 presses Undo | "Didn't save · Couldn't undo all of it. Check the page." — `2026-10-15-undo-conflict.jpg` | untouched task back to No day yet; A1's edited task stayed on Friday with A1's note |
| Reload with a pending card | Card pending; reload | **Failed on this build:** the card was gone after reload (stored card wiped by the first render before auth resolved). Fixed in `676029ee` (card restored once the person is known; regression test). Re-verified on the next build: see below. | — |

Found and fixed along the way: a row updated through a path that did not set `updated_at` was invisible to both checks; migration `20261015200000` stamps `updated_at` in the database on every update (applied hosted). The first Undo-conflict attempt showed the gap (A1's REST edit left `updated_at` unchanged); the second, after the trigger, was detected.
