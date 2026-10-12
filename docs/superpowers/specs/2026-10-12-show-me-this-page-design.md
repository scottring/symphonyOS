# Show me this page: design

Date: 2026-10-12 · Status: built and shipped with #180 (see "As built" at the end)
Mockup (agreed): https://claude.ai/artifact/UmMGNygchL37MVVW8mmvKH

## Purpose

Scott opened Fall 2026 and didn't know what the page was for or what to do on
it. Symphony should explain whatever page you are on by **talking and pointing
at the real page at the same time**. It outlines the actual cards, rows and
controls, draws arrows (including a "drag this onto that" arrow), and words
each note from your live data ("Feel stronger has three", not "a goal has
items").

It explains the page and how to use it. It never supplies goals or content
(the same rule as the planning walk; Scott 2026-10-11: "pushy in terms of its
own ideas").

## What the person sees

Two ways in, both from the same conversation (typed or Talk):

1. **Tour.** A "What is this page?" button in the docked bar, beside the
   page's walk ("Plan this season with me"). Symphony builds 3–6 steps from
   what is on screen. Each step:
   - lightly dims the page and draws an amber outline around one or two real
     elements;
   - shows a short note (title and one to three sentences) beside them, with
     an arrow from the note to the element;
   - may draw one extra arrow between two elements, e.g. a dashed "drag" arrow
     from a loose item to the cards.

   The bar shows "2 of 5 · Back · Next · Close", and the last step shows a
   single Done. The arrow keys step through and Esc closes.
2. **Pointing in conversation.** For any question ("what do I do with the two
   at the bottom?", "where's the dentist task?"), Symphony may point while it
   answers: one step with no Back or Next, which clears on Esc, on clicking the
   page, or when the next message is sent.

With Talk on, Symphony speaks each step and moves on when it finishes, so the
person can listen without touching anything. Saying "back", "stop" or "again"
works because the tour is part of the conversation.

On phones there is no docked bar, so "What is this page?" sits beside the
page's own walk button. The note docks above the bottom bar at full width, and
its arrow points up at the element.

Pages in v1: Year, Season, Month, Week and Today, which all carry the docked
bar. Routines follows once the first five work.

## How it works

### 1. Pages mark what can be pointed at

- **Regions:** `data-explain="season.loose"` plus `data-explain-label="Not
  under a year goal"` on the parts of a page worth explaining (period header,
  card grid, loose section, empty fold, Next link, Week's shelf, Today's
  schedule, and so on). Each page has a handful.
- **Items:** every row a person sees carries `data-explain-item="<task or goal
  id>"`. PlanItemRow already has `data-plan-key`, and Today rows already have
  `data-task-id`. Week rows and the plan group cards get the shared attribute.

Pointing only works on elements that carry one of these attributes. The model
cannot target arbitrary DOM.

### 2. The page snapshot carries the guide and the targets

`workspaceContext()` (src/lib/workspace/context.ts) already sends the page,
dates and visible items with every text and voice turn. It gains two fields:

- `guide`: a few sentences from `src/lib/explain/pageGuides.ts` saying what the
  page is for and what its controls do. These are written by us, reviewed by
  Scott, and kept in the code so they change when the page changes. Example
  for Season: a brainstorm list for this stretch of the year; cards are year
  goals; loose items are fine; drag to connect; folded goals have nothing this
  season; Next goes to Month.
- `targets`: the regions mounted right now (`id`, `label`), read from the DOM
  when the turn is sent. Items are referenced by the ids the snapshot already
  lists.

### 3. One new action, in both chat backends

`show_on_page({ steps: [{ targets: string[], title, text, arrow?: { from, to,
label?, drag? } }] })`

- A target is a region id or an item id from the snapshot; anything else is
  dropped. A step with no valid target is skipped.
- With 1 step it's a point; with 2–6 steps it's a tour.
- It changes no data.

**Text (symphony-agent edge function).** Add the tool and handle it as
`symphony_show_workspace` is handled today: the server validates the shape and
streams a `{type:'show'}` event, `agentStream.ts` passes it to an `onShow`
handler, and ShellLayout hands it to the guide layer. The chat transcript
keeps the spoken summary, so the conversation still reads on its own.

**Voice (workspace-voice).** Add the same tool to the realtime session, handled
client-side in `useWorkspaceVoice`'s `handleTool`, as `show_workspace` is. The
voice model is told to call it before it speaks each part of an explanation,
one step per call, so the outline appears as the words start. Requests the
voice hands to the text agent (`ask_symphony`) also bring back any `show`
events.

**Instructions added to both prompts.** When asked what a page is, or when
pointing helps an answer, use `show_on_page`. Use the snapshot's `guide` for
what the page does and its items for the person's own words and counts.
Describe and show how; never suggest goals or content. Keep each note short.

### 4. The guide layer (new, `src/components/explain/`)

- `GuideLayer`: one fixed SVG over the shell, with the scrim and its cut-outs,
  the outlines and the arrows, plus the note card. It sits above the page and
  below the docked bar, so the bar stays usable.
- `geometry.ts`: pure functions for edge points, the curve between two
  rectangles, note placement (the preferred side, then a fallback order, then
  clamped above the bar), and phone docking. These are unit-tested.
- `useGuide`: state (steps, index, mode), Next, Back and Close, keyboard
  handling, redrawing on scroll and resize (rAF-throttled), and clearing on
  route change. Lives in a context next to CanvasActivity.
- Follows `prefers-reduced-motion` (no dash animation or fades). The note is a
  live region; the outlines are hidden from screen readers.

### 5. The button

ConversationStrip gains an "explain" slot beside the walk. The page provides
the label and message through a hook like `useConversationWalk`, so the
wording can follow the page ("What is this page?"). The message sent is plain
text, so the same button works typed or with Talk on.

## Errors and edges

- A target scrolled off screen: the layer scrolls it into view (smoothly
  unless reduced motion) before drawing.
- A target that disappears (data changed or a group folded): skip it, and if
  no target is left in the step, show the note docked with no arrow.
- The model returns a bad shape or unknown ids: drop it silently; the spoken
  answer still stands.
- Navigation, a domain switch or Esc clears the layer.
- Folded content: the tour can point at the folded line but does not unfold it.

## Privacy

Nothing new leaves the browser except region ids and labels, which are UI
text. Items come from the existing snapshot, which is already filtered by
area, people and permissions. Notes are rendered as plain text, never HTML.

## Testing

- Unit tests for geometry, target resolution (unknown, hidden and duplicate
  ids), the tour state machine, and stream event parsing.
- Component tests for the bar's tour controls (one Done at the end, Close
  before it) and the explain button on each page.
- Edge function tests for the tool schema and validation (symphony-agent and
  workspace-voice handler tests).
- By hand, with a real signed-in account: a tour on Season, Month, Week and
  Today at desktop and 390px; a point during typed chat; a tour with Talk on.

## Shipping

Two edge functions change (symphony-agent and workspace-voice), and deploying
them needs Scott's approval like any production change. The web change ships
in one PR after #180 (Season/Month in two parts) merges, so the guides
describe the new layout.

## Out of scope for v1

- Routines, Inbox, Notes and other side-pane pages.
- Remembering that you have seen a tour, or tours that start on their own.
- Pointing inside dialogs or the detail panel.

## As built (2026-10-12)

- **Targets** are read from the page itself when a turn is sent: anything
  marked `data-explain` (period header, the two Season/Month parts, the
  folded line, Next, the horizon switch, Today's masthead and This week),
  plus every section, list or group the page already names for screen
  readers (`aria-label` / `aria-labelledby`), such as Week's "Still to place"
  and each day. Rows and cards are found by the ids they already carry
  (`data-plan-key`, `data-group-key`, `data-task-id`). Only the content
  frame counts (`data-explain-root`); the bar and the chrome never do.
- **The agent action** is `symphony_show_on_page`. It is offered only when
  the client sends `targets`, so older app versions never see it. It streams
  a `show` event, and the client draws it through a module signal
  (`src/lib/explain/showSignal.ts`). Talk has `show_on_page`, one step per
  call, handled in `useWorkspaceVoice`.
- **Phones:** "What is this page?" sits beside the page's own walk on
  Year, Season and Month. It sends without opening the conversation over the
  page (`stayOnPage`), and the note carries Back and Next. Today and Week on
  phones don't have the button; typing the question works.
- **Verified by hand** with a real account: tours on Season, Week and Today,
  a single point from a typed question, and the phone-width tour on Season.
  **Not verified:** Talk (needs a microphone); Month and Year tours.
