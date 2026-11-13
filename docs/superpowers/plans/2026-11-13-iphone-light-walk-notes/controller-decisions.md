# The walk: decisions the plan must follow (controller, 2026-11-13)

Scott is away and has said to continue without him. These are calls made on his behalf; each will be
listed for him afterwards. The spec is the binding authority; where the approved mockup and the spec
differ, the spec wins unless noted here.

## Scope of this plan (step 2 of the spec's "Order of work")

Build the walk on the iPhone, as specified, against the interim art, on branch `claude/ios-light-build`
(continuing after the foundations commits). In scope: the scene, the orb, areas, posts and banners,
planting by voice or typing, placement by words, undo/move/pull up, examples, zoom, the five steps,
"Look back up", the ending sheet from the approved mockup, save and resume, both depths, replay from
Settings, the calendar ask at the Today step, the data plumbing the walk needs.

Out of scope (the spec's "Not designed yet" list; needs mockups and Scott's approval first): redesigning
Today, Week, the Year/Season/Month pages, Duo-specific layouts, tent view, the daily signposts, Dynamic
Type design at large sizes, and a full VoiceOver design. Also out: Plus early access, App Store listing,
per-place doorstep art, any server/database change (none is needed: the columns and `goal_areas` exist
on the live database, see live-db-facts.md).

Nothing in this plan touches production: no migration, no deploy, no push to main.

## Data (Scott's decision in the spec: areas are stored the way the web stores them)

1. New synced model `GoalArea` (server table `goal_areas`: id, user_id, name, sort_order, created_at,
   context). The walk writes `context = 'personal'` for a light household.
2. `areaId: UUID?` on `Goal` and `SymphonyTask` (server `goals.area_id`, `tasks.area_id`), pushed and pulled.
3. The iPhone must start SENDING goal links, which it has never done: `tasks.is_goal`,
   `tasks.goal_id` (a season goal → its year goal), `tasks.supports_goal_task_id` (a month goal → its
   season goal), `tasks.goal_task_id` (a week task → the month goal it is a step of). Add
   `supportsGoalTaskId` to `SymphonyTask`. Follow the web's conventions exactly: read how the web
   writes each (`src/`: search `is_goal`, `goal_task_id`, `supports_goal_task_id`, `goal_id`) and the
   live guard triggers' definitions in `supabase/migrations` (`guard_goal_support`,
   `guard_goal_link_target`, `guard_goal_unconvert`, `tasks_fill_period_stamps`,
   `tasks_align_week_to_day`, `tasks_mirror_to_commitments`) BEFORE fixing the representation; if the
   web's convention differs from the mapping above, the web's convention wins and the plan says so.
   A link column must only be sent when the walk (or a later feature) set it; existing rows synced from
   the server must round-trip unchanged (do not null a link the phone merely did not know about).
4. Levels: Year goal = a `goals` row (`year`). Season goal = a task with `is_goal`, placed in the
   season (`season_start`, bucket as the existing Season page writes it). Month goal = a task with
   `is_goal`, placed in the month. Week item = an ordinary task on a day of this week (or the week with
   no day). Today's "first thing" = a `TaskFocus` row for today on one of today's tasks (the existing
   concept: focused items sort first on Today). No new server concept.
5. Everything the walk creates has `context = "personal"` and private scope in a light household. In a
   full household (replay from Settings) it also writes personal; it never asks work/family/personal.
6. Period boundaries (spec, "Claude's call"): started in November or December, "the year ahead" is the
   next calendar year, otherwise the current one. The Season step plans the current season unless fewer
   than three weeks of it are left, then the coming one, and the question names it. The Month step works
   the same way, scaled to a month: plan the current month unless fewer than 7 days of it are left,
   then the coming month; the question and the why-line name the month and its last day.
   Seasons come from the household's `seasons` (existing period maths); a household with none uses the
   app's existing default seasons.

## Behaviour the mockup faked and the app must do for real

7. Speech: the existing on-device path (`Dictation`: SFSpeechRecognizer with on-device recognition
   when supported). No server AI. Fix the two known problems so it can be reused: the transcript must
   reset on each start, and the audio session must be handed back cleanly so walk sounds and speech do
   not fight. If speech or microphone permission is denied or unavailable, holding the orb opens typing
   instead, with one plain hint line. Permission is asked on the first hold, not at launch.
8. Tidying (spec: "tidies spoken filler and pulls out a day; it doesn't rewrite"): a pure function.
   Trim; drop leading filler tokens only (um, uh, er, hmm, so, okay, well, like) and a trailing full
   stop; capitalise the first letter; nothing else changes. On the Week step, pull out a day with the
   existing `CaptureParser` plus weekday names, "today", "tomorrow", "this weekend": the day leaves the
   title only when it is a trailing or comma-separated tail ("the deposit, today" → "The deposit" on
   today); if no day is said the task goes on the week with no day.
9. Placement by words (spec: "decided by what it says"): a pure, on-device classifier. Each default
   area has a keyword list (the plan writes them out: Health, Home, People, Work, Money, Fun; about
   15–25 everyday words each, plus the area's own name); a custom area matches its own name's words.
   A goal "clearly belongs" to a kept area when that area scores at least one hit and strictly more
   than every other kept area. Then it goes there even if another peak is focused, with the quiet line
   "That sounded like <area lowercased>, so it went on the <Area> peak." Otherwise the focused peak
   catches it; with no focus it goes on the unlabeled post (area nil). Lower levels inherit the focused
   parent's area and are never classified. Never suggests or adds an area the person did not keep.
10. Parent links: planting on a lower level links to the focused parent (see 3). With no parent focused
    it links to nothing. The ending sheet shows "for <year goal>" by walking the links up.
11. Undo: one undo stack for the whole walk (plant, move, pull up, keep/unkeep an area, name an area).
    The quiet "Undo" pill shows for 7 seconds after each action as in the mockup, and "Back up" on the
    compass also steps back; undo removes the created rows (and their queued sync) or restores the
    previous values.
12. "Flags never overlap or float in the sky" must actually hold (the mockup only partly enforces it):
    the layout is a pure function from (kept areas, items per level, focus, step, screen size) to
    frames, with a test that no two banner frames intersect and every post base lies inside its level's
    band, for 1 to 8 areas and up to 6 banners on a post (beyond what fits, a post shows a "+n" stub
    banner that opens the stack on tap).
13. Examples: only from the compass's Examples point; at most three pale dashed ghost flags; tapping one
    plants it as the person's own; none on the Today step. Use the mockup's example texts
    (mockup-contract.md §9). They are the only words Symphony ever supplies, and only on request.
14. Both depths (spec): "Quick start" walks one year goal down to today. "Plan my whole year" visits
    each kept area in turn on the Year step (the area joggers as a sequence), then walks each year goal
    down through the season. After a quick start the ending sheet offers "Walk another one down" for
    the next year goal that has nothing under it (the mockup always reused the first; fix that).
15. Save and resume (spec): every plant is saved as real rows at once. The walk's own position (step,
    depth, focus, kept areas not yet used, completed flag) is saved locally per signed-in user
    (UserDefaults JSON) and restored on relaunch. There is no server field for it.
16. When it appears: automatically for a signed-in person in a LIGHT household who has no year goals,
    after the first sync has finished (add an explicit "initial sync finished" signal; an empty store
    before sync must not trigger it), and who has not finished or left it before. It can be left at any
    time ("Back up" on Welcome → "Not now"), which lands on the normal app and is remembered. Replay
    from Settings ("Walk the mountain again") in both editions. Demo mode: a launch argument
    `-SymphonyWalk` starts it over an empty in-memory store for UI tests and screenshots.
17. The Today step asks for calendar access the spec's way: a quiet line "See your calendar on Today
    too" with the orb's compass offering it; it calls the existing
    `AppleCalendarService.shared.requestAccess()` (light) and is skipped when access is already
    allowed or the household is full.
18. Ending: as the approved mockup (Look back up; the sheet peeks, a tap raises it), but with real
    data: today's tasks with their "for <goal>" line, the first thing first, the ring filling as
    to-dos are done, and the spec's wording "That's the day." (not the mockup's "Well done."). Closing
    the sheet ends the walk and shows the normal light Today.
19. Sounds (spec: recorded, not synthesized; with haptics): build a small player with five named
    sounds (bag, poles, unfurl, plant, tick) and matching haptics, honouring the existing sound
    setting. No recordings exist yet and none may be taken from the internet. Ship clearly named
    PLACEHOLDER audio files rendered offline from the mockup's synthesis recipes by a script kept in
    the repo, so everything is wired and Scott can drop in recordings by replacing five files. Flag
    this to Scott.
20. Art (spec): build against the square overlook with the mockup's camera. Bundle the square overlook
    from `~/Pictures/Symphony scenery` at a size that stays sharp at the deepest zoom the mockup uses
    without bloating the app (the plan picks the pixel size and format and says why). Bands, columns
    and camera stops are data expressed as fractions of the image so the tall art can replace it later
    without code changes. Do not use blur.
21. Screen sizes: the walk is designed for a regular iPhone upright (the mockup's 390 × 844 stage).
    On any other size it scales the stage to fit and letterboxes with the sky colour; no separate Duo
    or sideways layout is designed here. It is presented full screen above the dock and the half-open
    overlay stays on top as today.
22. Accessibility, minimum only: the orb exposes its compass points as VoiceOver custom actions
    (Walk on, Back up, Type it, Examples, Nudge me), banners and area labels are labelled buttons, and
    Reduce Motion replaces camera glides with cross-fades. A designed VoiceOver path is later.
23. Look: Crimson Pro and DM Sans (already bundled), white text with a soft dark shadow, the faint dark
    band at the top, SF Symbols only, no emoji, no pale mist, no glass controls, no buttons on the walk
    screens other than what the mockup has (area labels, banners, the Undo pill, Move chips, the sheet).

## Process

- TDD for every pure piece (layout, classifier, tidying, periods, state machine, undo stack, link
  writes, sync rows). Views are thin over a testable `WalkModel`.
- One xcodebuild at a time; UI tests are slow and fragile on this machine: at most one small UI test
  suite for the walk (launch with `-SymphonyDemo -SymphonyLight -SymphonyWalk`, reach Welcome, start,
  type one goal via the compass, see its banner), no dictation in UI tests.
- Each task ends with screenshots where it changes what is seen (simulator, saved to the scratchpad).
- Existing full households must see no change unless they choose "Walk the mountain again".
