# Sticky assistant rail

**Date:** 2026-08-08
**Status:** approved, ready for planning

## Problem

The AI chat pane loses its conversation when you navigate. Start planning a
packing list on Home, go to the trip project to check something, and the chat is
empty — you have to navigate back to Home to keep talking.

The conversation isn't actually lost. There are **two independent assistant
instances**, and navigating swaps which one you're looking at:

| Host | File | Renders when |
|---|---|---|
| `ShellAssistantHost` | `src/shell/Shell.tsx:59` | desktop **and** Today path **and** no detail pane open (420px) |
| `ShellLayoutInner`'s rail | `src/shell/ShellLayout.tsx:144` | `chatOpen` **and** (non-Today **or** mobile) (380px desktop, full-screen mobile) |

Both call `useSymphonyAssistant({ persistKey: 'symphony_rail' })`. Each holds its
own `messages` in React state. Both stay mounted across navigation, so neither
conversation is destroyed — but only one is ever visible, and which one depends
on the route. Leaving Today hides instance A and reveals instance B, which is
empty.

Two open/closed states compound it: Today's rail uses `useScratchpadHidden`
(localStorage, driven by HomeHeader's ✨ via `AppShellChromeContext`), while the
non-Today rail uses `ShellLayoutInner`'s local `chatOpen` `useState` (driven by
its own ✨ button). Toggling one does not affect the other.

Secondary loss: on Today, opening a task/project detail pane hides the rail
entirely (`selection === null` is a render condition at `Shell.tsx:83`).

## Goal

One conversation that follows you. The rail stays open across every route and
never closes on its own — closing it is always a deliberate act.

## Design

### 1. One assistant instance, hoisted to a provider

New `src/contexts/AssistantContext.tsx`:

```
AssistantProvider
  ├─ useSymphonyAssistant({ persistKey: 'symphony_rail' })   ← the single instance
  └─ open / setOpen                                           ← backed by the existing
                                                                 useScratchpadHidden localStorage key
```

`useAssistant()` exposes the hook's full return value plus `{ open, setOpen }`.
Outside the provider it throws — unlike `useAssistantLauncher`, every consumer
here is inside `Shell`, so a silent no-op would hide wiring mistakes.

Mounted in `Shell.tsx` inside `AssistantLaunchProvider`, wrapping both
`ShellRoutes` and the `Layout` — so `ShellLayout` is a consumer, not an owner.

`open` continues to use the `symphony-scratchpad-hidden` localStorage key and its
existing cross-consumer sync event. Keeping the key means Scott's current
preference carries over rather than resetting. `useScratchpadHidden` stays as the
storage primitive; the provider is its only new consumer.

Deleted:

- `useSymphonyAssistant` call at `Shell.tsx:64`
- `useSymphonyAssistant` call and `chatOpen` state at `ShellLayout.tsx:143-144`
- The `TODAY_PATHS` set in **both** files, and the `isToday`/`isMobile` guards in
  both launch-nonce effects (`Shell.tsx:73-80`, `ShellLayout.tsx:152-159`).
  `AssistantLaunchContext`'s nonce now has exactly one listener, so the
  "which host owns this launch" arbitration disappears.

### 2. One rail host, rendered on every route

New `src/shell/AssistantRail.tsx`, rendered once by `Shell.tsx` next to
`<DetailPanel />` — outside `ShellLayout`'s scrolling content div, so it stays
`position: fixed`.

- **Mobile:** full-screen overlay when `open`. Same behavior as today's
  `ShellLayout` overlay, but now backed by the shared conversation. A
  full-screen overlay cannot "stay open" over a page you navigate to, so on
  mobile the rail closes on route change and its open state is **not**
  persisted to localStorage (otherwise a reload would come up with the overlay
  covering the app). Reopening resumes the same live conversation — the
  conversation is what's sticky on mobile, not the panel.
- **Desktop:** fixed right, 420px, whenever `open`. Not gated on route. Not
  gated on `selection`. Open state persists across reloads as it does today.

Width unifies at **420px** everywhere, replacing the current 420 (Today) / 380
(elsewhere) split.

The rail owns the launch-nonce effect (seed message from the ⌘K unibox,
Add-to-today, plan cards): on a new nonce it calls `setOpen(true)` and sends the
seed. No route or viewport conditions.

`NoteViewer` (source-click target, currently rendered by `ShellAssistantHost`)
moves into `AssistantRail`, so it works from every route rather than only Today.

### 3. Layout: rail and detail pane coexist

**The detail panes do not move.** Each app's panel hardcodes its own
`fixed right-0` positioning and width — `TaskDetailPanel.tsx:66` at
`md:w-[480px]`, `ApplicationDetailPanel.tsx:93` at `w-[420px]`, plus nested
overlays like `PanelNotes.tsx:151`. Offsetting the detail pane would mean
touching every one of them. Instead **the rail slides left of the detail pane**,
so exactly one component owns the dynamic positioning.

To do that the rail needs the active panel's width, which varies by app:

- Add `detailPanelWidth?: number` to `AppDef` in `appRegistry.ts` (default
  `480`; job-pipeline declares `420`).
- New `useDetailPaneWidth()` in `src/shell/providers/SelectionProvider.tsx`'s
  neighborhood — resolves the active selection's app via the existing
  `resolveAppForSelection` and returns its width, or `0` when nothing is
  selected.

Rail `right` = `useDetailPaneWidth()`. Detail panes stay flush right, exactly
as today, whether or not the chat is open — no reflow jump when you open the
chat.

`ShellLayout.tsx:275`'s `marginRight` becomes additive rather than exclusive:

| state | detail pane | rail | content `marginRight` |
|---|---|---|---|
| neither open | — | — | `0` |
| rail only | — | `right: 0`, 420 | `420px` |
| detail only | `right: 0`, 480 | — | `480px` |
| both, viewport ≥ 1600 | `right: 0`, 480 | `right: 480px`, 420 | `900px` |
| both, viewport < 1600 | `right: 0`, 480 | `right: 480px`, 420 | `480px` |

On mobile, `marginRight` stays `0` (unchanged).

**The < 1600 row:** 420 + 480 + a 256px expanded sidebar is 1156px of chrome.
Below ~1600px there is no room to reflow the content column — at 1512pt (14"
MacBook Pro) it would be ~356px, too narrow to read. Rather than hiding the rail
(the bug this spec fixes), the rail overlays the content column while the detail
pane keeps its reflowed slot. Both surfaces the user asked for stay visible; the
list behind the rail is temporarily covered. On an external monitor there is
room, so all three reflow properly.

New `src/hooks/useWideViewport.ts` — same `matchMedia` shape as `useMobile`,
threshold `1600`. Consumed only by `ShellLayout` for the margin calculation.

### 4. Toggle affordances

Both ✨ buttons drive the same `setOpen`:

- HomeHeader's (Today) — already routed through `AppShellChromeContext`;
  `TasksApp.tsx:32` swaps `useScratchpadHidden` for `useAssistant`.
- `ShellLayout.tsx:324`'s top-right button — currently rendered only on
  non-Today desktop views. Condition stays as-is (Today's lives in the
  masthead), but `onClick` becomes `setOpen(!open)` and the active ring reads
  the shared `open`.

The collapsed-rail edge tab (`Shell.tsx:87-97`, the `PanelRightOpen` chevron)
moves into `AssistantRail` and now shows on every desktop route, giving a
reopen affordance on pages whose ✨ is off-screen.

## Out of scope

- `AssistDrawer` (per-task/routine drawer) and `GuideChat` (planning wizard)
  keep their own scoped `useSymphonyAssistant` instances. They are deliberately
  entity-scoped conversations, not the global rail.
- Conversation history / `chat_sessions` persistence is unchanged. Collapsing to
  one instance means one writer instead of two racing on the same
  `entity_type`, which is strictly safer.
- No change to the `symphony-agent` edge function.

## Testing

- `AssistantContext.test.tsx` — provider yields one instance: `sendMessage` from
  consumer A appears in consumer B's `messages`; `setOpen` from A is visible to
  B; the localStorage key round-trips.
- `AssistantRail.test.tsx` — renders on a non-Today route; renders with a
  `selection` active and offsets to `right: 480px`; falls back to `right: 0`
  with no selection; mobile renders the full-screen overlay and closes on route
  change; the launch nonce opens the rail and sends the seed exactly once.
- `useDetailPaneWidth` — returns `0` unselected, the app's declared
  `detailPanelWidth` when selected, and the `480` default for apps that don't
  declare one.
- **Regression test for the reported bug** (Shell-level): send a message on
  `/today`, navigate to a non-Today route, assert the rail is still mounted,
  still open, and the transcript is intact.
- `ShellLayout.test.tsx` — the margin table above, including both ≥1600 and
  <1600 branches with a stubbed `useWideViewport`.
- Update `Shell.test.tsx` for the removed `ShellAssistantHost`.

## Verification

Type-checks are not inspection. After the suite is green, run the dev server and
walk it in a browser: start a conversation on Today, navigate to `/projects`,
confirm the transcript is there and the rail never blinked; open a task detail
and confirm both panes are visible; repeat at a narrow window width to confirm
the overlay fallback.
