# The walk: mockup contract (from Walk.dc.html)

Source: `docs/superpowers/specs/2026-11-13-iphone-light-walk-mockup/Walk.dc.html` (847 lines, commit 91407fb2).
Spec: `docs/superpowers/specs/2026-11-13-iphone-light-version-design.md`, "The walk is a walk down a mountain" (lines 68–123) and "How the walk works" (lines 163–199).
All `Lnnn` references below are line numbers in Walk.dc.html unless marked "spec".

## Summary (15 lines)

1. The file holds exactly one logic class, `class Component extends DCLogic` (L227–844), plus its template (L47–224). That is the approved "Play this one: the whole walk".
2. The phone frame is a fixed 390 x 844 pt stage (L47). A 1300 x 1720 "world" holds the sky, the square overlook image and every post and flag. It is moved by one camera transform per step (L480, L799).
3. Steps: 0 Welcome, 1 Year (with a "ground" sub-state for picking areas), 2 Season, 3 Month, 4 Week, 5 Today (first thing), 6 "Look back up" with the Today sheet (L459–465, L809–812).
4. Each level has a world-space band (`BAND`, L512). It is tuned so the current level's post base always lands at screen y = 560, just above the orb.
5. Areas are columns. Each column's world x is fixed from the Year view, so lower levels hang on the same column further down the slope (L515–522, L689).
6. The current level shows full banners. Levels above show small triangle tips. A focused parent shows a one-line "compact" banner. Step 6 shows everything compact (L643, L652–674, L682).
7. Tapping an area label (Year) or a parent flag (Season to Today) focuses it. The camera then zooms to scale 0.8 on that column, and the question changes (L523–526, L706–710).
8. The orb works by hold, slide and tap. A hold of 420 ms starts "speaking". Sliding beyond 1.4 x the orb radius selects a compass point within 32°. A press shorter than 420 ms toggles the points open (L334–385).
9. Points: S = Walk on / Skip, N = Back up (says "Start" on Year), W = Type it, E = Examples (steps 1–4 only), NE = Nudge me (L731–744). Welcome and the ground step have their own sets.
10. Plant rules: a Year goal goes to its own area if that area is kept, otherwise to the focused area, otherwise to the unlabeled "Other" post. Lower levels take the focused parent's area (L437–451).
11. The prototype has no real speech, no word classification and no text tidying. It types canned lines from `script()` (L229–236), each with a pre-tagged area and day. All of that must be built for real.
12. Undo appears for 7000 ms after a plant, on that step only. Selecting a current-level banner shows "Move to" chips (all areas) and "Pull it up" (L453–455, L697–705).
13. Sounds are WebAudio synthesis (L249–327): bag, rattle, unfurl, plant, tick. The recipes below say what recorded sounds to choose. The prototype has no haptics.
14. Ending: the "Look back up: that’s your plan." view with the sheet peeking at y 716. Tapping the handle raises it to y 130. Inside are the hardcoded Today list, the ring, "That's the day. Well done." and "Walk another one down" (L172–223, L776–841).
15. Dead or rejected code in the same file: `makeFlag`, `place()` collision search, `SLOTS`, `GHOSTS`, `MIST`, `LEVEL.pole/w` and `estH` (L481–483, L548–636). These build a `flags` list that is thrown away (`flags: []`, L801). Do not port them as the behaviour.

## Which variant is approved, and what was ignored

- The file contains one component class. The `data-props` editor (L226) lets the canvas render it at `step` "0"–"6", default "0", with `$preview` 390 x 844. The artifact's top-row "Play this one: the whole walk" is this component at `step = 0`, played from the start. Other frames in the artifact are most likely the same class frozen at other `step` props. I did not open the live artifact (https://claude.ai/artifact/6qsEdjFMsyg4s415SYk48i), so that last point is inferred.
- When `step` > 0 (preview frames only), the constructor (L237–246) pre-fills `kept = ['Health','Home','People']` and `said` from the script for levels 1..min(step,5). It sets `focus[step] = (step === 2 ? 1 : 0)` for steps 2–5. This is preview seeding, not walk behaviour.
- Ignored as rejected or dead inside the file:
  - **Free-standing flag layout.** `makeFlag` (L548–572), the `flags` loop with `SLOTS` and `place()` collision avoidance (L574–618), and the ghost-flag version using `GHOSTS` (L619–636). `renderVals` returns `flags: []` (L801), so none of it renders. The template loop at L73–90 is fed an empty list. The approved layout is the per-area **post groups** (L639–696). This is the earlier "flags placed in slots" layout that the area-post design replaced.
  - **`MIST` palette** (L481): pale mist tints per step. Never used. The spec says "No pale mist" (spec L78).
  - **`LEVEL[s].pole` and `LEVEL[s].w`** (L485–489): used only by the dead `makeFlag`. Only `LEVEL[s].color` and `.name` are live.
  - **`.wk-ghost-flag` bob** (L25, L40): applied only in `makeFlag`, so approved ghosts do not bob.
  - **`.wk-plant`** (L28): dead-path only. Live banners use `.wk-plant2` (L29, L62).

## Spec sentence → prototype map

| Spec (L68–123) | Where in the prototype |
|---|---|
| The walk is a walk down a mountain, not a set of form screens. | Whole component. One stage, one camera (L47–91, L799). |
| The scene is the progress. Welcome shows the whole vista small under a deep sky. | `VIEW[0] = [0,-1093,0.30]` (L480). The image fills the bottom 390 pt of the screen and sky is above it (worldStyle L799, frame bg L47). |
| Each step zooms in a little and moves lower. | `VIEW[1..5]` scale 0.42 → 0.45 → 0.48 → 0.50 → 0.52, with y moving down (L480). The transition is 1400 ms (L799). |
| Year at the snow peaks, Season and Month past the river valley, Week by the pines and cliff, the first thing today on the rock ledge. | `BAND` (L512). This is image row 27.7% / 40.8% / 52.3% / 62.3% / 70.0% (see Camera). |
| No step labels. | No "step n of 5" anywhere. **But** an eyebrow names the period ("The year ahead", "November", etc., L105, L460–464). |
| Look: crisp, saturated woodblock (tall and square overlook prints, deep blue sky). | Square image only (L50). The tall print is not used. Deep blue sky gradients are at L47 and L799. |
| White Crimson Pro / DM Sans text with a soft dark shadow. | `.wk-glow` (L42) and the font link (L11). |
| A faint dark band at the top for legibility. | `mistStyle` (L800). |
| No pale mist. | `MIST` is defined but unused (L481). |
| The orb is the only control. A warm, breathing light at the bottom. | Orb L134–142, breathing L19–20, L34–37, geometry L112, L826. Other tap targets also exist: area labels, banners, Undo, Move chips and the step 6 sheet. |
| …with compass ticks and a small needle that points down (toward today) once something is planted. | Ring and ticks L116–117. Needle L118, L776, L818–819. **Differs:** it also points down on Welcome, and it resets to up on each new step until that level has a plant (`cur.length > 0`). |
| Press and hold: a flag pole rises out of the orb, the cloth unfurls, and the words fill in as the person speaks. | L349–354 (420 ms), `startWriting` L408–424, live flag L121–132. Words come from canned lines typed at 55 ms/char. |
| Let go and it plants. | `orbUp` L382 → `plant()` L425–456. |
| Slide to the edge while holding, or tap once, and compass points open… | `orbMove` L359–374 (1.4 r), `orbUp` tap branch L383, `showPetals` L748. |
| down = Walk on (or Skip), up = Back up, left = Type it, right = Examples, up-right = Nudge me. | `petalDefs` L736–744. N on Year reads "Start". |
| Let go on (or tap) a point to choose it. | L381 (release on hover) and petal `onClick` L145. |
| No other buttons on the walk screens. One line of glowing text under the orb says what holding or sliding will do. | Hint row L154–169, text L760–771. The Undo pill and Move chips share that row. |
| Sounds: canvas-bag rustle and wooden poles clacking as a pole is drawn out. | `sfxBag` + `sfxRattle` on every orb press at steps 1–5 (L349–351). |
| …a cloth flap as it unfurls. | `sfxUnfurl` 280 ms after writing starts (L415). |
| …a swish and soft earthy thud as it plants. | `sfxPlant` (L431, L315–323). |
| …a tiny tick crossing a compass point. | `sfxTick` on hover change (L373). Also used on area-keep toggles (L539) and banner select (L687). |
| Use recorded sounds in the app, not synthesized ones; pair with haptics. | **Not in the prototype.** It synthesizes and has no haptics. |
| Areas are the ground. Year opens with "First, your ground. Which parts of life matter most this year?" | `ground` state set by quick/full (L715–716), question L708. |
| …the ridgeline is labeled like a map (Health, Home, People, Work, Money, Fun, in staggered rows…). | `AREA_NAMES` L478. Positions L517–522, labels L528–543. |
| Tap to keep; hold the orb to name your own. | Keep toggle L539. Name-your-own via hold or "Name your own" point: `nextLine` L398–401, `plant` L432–435 (canned names). |
| Areas are labels on goals, stored the way the web app stores them (`goal_areas`, `goals.area_id`, `tasks.area_id`). | **Not in the prototype** (no storage). Items carry `a` (area name string). |
| One post per area, a trail down the mountain. Each kept area is a post at the base of its peak; goals hang on it as stacked banners. | Groups L639–691. |
| Lower levels hang on the same area's post further down the slope… one column per area. | Shared `colX` (L518), per-level `BAND` (L512, L689). Step 6 compact view (L682). |
| Goals with no area go on an unlabeled post. | `'Other'` column (L514, L678). It gets no label (labels only for `shownAreas`, L528). |
| Flags never overlap or float in the sky. | **Only partly enforced.** Live: column spacing, the row stagger (L517, L689) and bands placed on land. The real collision search `place()` (L578–596) only feeds the dead `flags` list. See §5. |
| Where a goal goes is decided by what it says… even if another peak is focused, with a quiet line ("That sounded like home, so it went on the Home peak"). | **Not implemented as words.** The canned `a` tag stands in (L230–234). Rule L437–445, note text L443. |
| A focused peak only catches goals that don't clearly belong elsewhere. | L439: `line.a` if kept, else `focusArea`. |
| Lower levels inherit the area of the focused parent goal. | L447–451 (plants), L693–694 (examples). |
| Zoom to an area: tapping a peak (or a parent flag) glides the camera in close; tapping again glides back out. | `zoomCol` L523–526. Toggles at L540 and L687. |
| Nudge me pans between areas. | L722–728. It cycles the focus, which drives the zoom. |
| Distance: only the level you're on shows full banners. Levels above shrink to small flags; tap one to focus (opens to a one-line banner and the question becomes about it). | `mode` L682, tip and compact L652–665, question L710. |
| Undo and fix: a quiet "Undo" beside the hint for about seven seconds. | `undoT` 7000 ms (L453–454, L694). Button L165–167, logic L703–705. |
| Tapping a flag on the current level selects it and shows "Move to" area chips (moving to an area not yet kept adds it) and "Pull it up" (remove). | L684–687, L697–702, row L155–162. |
| In the app, undo of the last action should be available throughout the walk. | **Not in the prototype.** It undoes only the last plant, on the same step, for 7 s. Move and Pull it up cannot be undone. |
| It ends with Today rising in as a sheet, after a "Look back up: that's your plan" view of every area column. | Step 6 (L172–223, L829–831). The sheet peeks; a tap on the handle raises it. |
| A ring fills as to-dos are done, with a quiet "That's the day" when it closes. | Ring L187–192, L793–794, L838–841. Text L220: "That's the day. Well done." |

---

## 1. State model (L237–246, plus keys added later by setState)

Initial state at `step = 0` (L245):

| Key | Type | Initial | Meaning |
|---|---|---|---|
| `step` | Int 0…6 | `parseInt(props.step)` or 0 | 0 Welcome, 1 Year, 2 Season, 3 Month, 4 Week, 5 Today step, 6 Look back up / Today sheet |
| `said` | `[Int: [Item]]` keyed by level 1…5 | `{}` | Planted items per level, in planting order. `Item = { t: String, a: String? (area name), d: String? (day tag) }`. **No parent link is stored** (see §15). |
| `focus` | `[Int: Int?]` keyed by step 2…5 | `{}` | Index into `said[step-1]` of the focused parent flag for that step. It persists per step; `go()` does not clear it. |
| `focusArea` | String? | `null` | Focused area on the Year step (non-ground). |
| `ground` | Bool | `false` | Year step is in the "pick your ground" sub-state. Only meaningful when `step == 1`. |
| `kept` | `[String]` | `[]` | Kept area names, **in the order tapped** (Nudge uses this order). |
| `custom` | `[String]` | `[]` | Custom area names, appended after the six defaults. |
| `ex` | `[Int: Bool]` | `{}` | Examples shown on that step. Persists across steps. |
| `sheetOpen` | Bool | `false` | Step 6 sheet raised. |
| `mode` | `'quick'` \| `'full'` | `'quick'` | Depth chosen on Welcome. Not reset by `restart`. |
| `holding` | Bool | `false` | Finger is down on the orb. |
| `petalsOpen` | Bool | `false` | Compass points open after a tap. |
| `hover` | String? (petal id) | `null` | Compass point currently under the slide. |
| `speaking` | Bool | `false` | Live flag is rising and filling. |
| `live` | String | `''` | Text shown so far on the live flag. |
| `note` | String | (unset) | Quiet placement line. Cleared after 3200 ms (L443–444). |
| `lastPlant` | `{s: Int, j: Int}?` | (unset) | Last planted item, for Undo. Cleared after 7000 ms, by `go()`, by select, by undo and by pull-up. |
| `selected` | `{s: Int, j: Int}?` | (unset) | Selected current-level banner (Move to / Pull it up). |
| `done` | `[Int: Bool]` | `{0: true}` (default at L783) | Done flags for the 4 hardcoded Today rows. |

Instance (non-render) fields: `ac`, `master`, `noise` (audio). `c` is the orb centre and radius in client px. `t0` is the press time. `wasOpen` is `petalsOpen` at press. `onMove`, `onUp` and `onCancel` are listeners. Timers are `holdT`, `iv`, `plantT`, `unfurlT`, `noteT` and `undoT`. `target` is the line being written. `petalDefs`, `act` and `POS` are cached from the last render for use by the pointer handlers.

## 2. Steps

### Fixed text (L459–471, L96–109)

`ASK[step] = [eyebrow, question, why]`:

| Step | Eyebrow | Default question | Why line |
|---|---|---|---|
| 1 Year | `The year ahead` (whole-year mode: `The year ahead · area by area`, L813) | `What would make the year ahead a good one?` | `Something that would feel true twelve months from now.` |
| 2 Season | `This season · to Feb 28` | `And this winter? What’s it about?` | `A season is a few months. What is this stretch really for?` |
| 3 Month | `November` | `What’s one thing for the rest of November?` | `Small enough to finish by the 30th.` |
| 4 Week | `This week · to Sun 15` | `What would move that forward this week?` | `Say the day for each: “the deposit, today.”` |
| 5 Today | `Friday, 13 November` | `What’s the first thing you’ll do today?` | `Just one. The rest of today can wait its turn.` |

Typography: question marks are curly (’ “ ”) exactly as above. Spec table L167 adds "Big or small." to the Year why line. The prototype does **not** have it.

Welcome (step 0, L95–101): wordmark `Symphony`. h1 `Let's start up high and walk down to today.` (straight apostrophe in the source). Sub `Plant a flag for what matters, then follow it down.`

### Question overrides (L706–710), in priority order

1. Ground (`step == 1 && ground`): `First, your ground. Which parts of life matter most this year?`
2. Year with `focusArea`: `'What about ' + PHRASE[area] + ', this year?'`. `PHRASE` (L479) is Health → `your health`, Home → `home`, People → `the people in your life`, Work → `work`, Money → `money`, Fun → `fun`. A custom area uses `area.toLowerCase()`. For example, `What about home, this year?`
3. Steps 2–5 with `focus[step] != null` and the parent exists: `FOCUSQ[step](parent.t)` (L466–471):
   - 2: `For “<t>”, what’s this winter’s piece?`
   - 3: `For “<t>”, what’s November’s piece?`
   - 4: `For “<t>”, what happens this week?`
   - 5: `Start the day with “<t>”?` (here `t` is a Week task)
4. Otherwise the default question.

### Why line (L773–774)

- Ground: `Tap the peaks to keep them. Hold the light to name your own.`
- Else `ASK[step][2]`.
- Steps 2–5: if the level above has at least one flag and nothing is focused, append ` Tap one of your flags to focus on it.`

### Hint line under the orb (L760–771), first match wins

| Condition | Hint |
|---|---|
| Compass points visible (`petalsOpen || (holding && !speaking)`) | `''` (empty) |
| `note` set | the note (see §6) |
| step 0 | `Hold the light to begin` |
| ground and not speaking and no hover | `Tap the peaks that matter` |
| speaking | `Let go to plant it` |
| hover | `Let go to choose` (unreachable in practice: hover only exists while points are visible) |
| petalsOpen | `Tap a point, or tap the light to close` (unreachable for the same reason) |
| current level has ≥1 item | `Hold to plant another · slide down to walk on` |
| else | `Hold the light and speak · slide to its edge for more` |

The two unreachable strings are probably intended copy. A rebuild may want to show them instead of the empty string while the points are open. That is ambiguous, so confirm with Scott.

The hint row is hidden while a banner is selected; the Move row replaces it (L803–804). It renders only on steps 0–5 (it sits inside the `showDial` block, L111–170).

### Advancing, skipping and period names

- `act('next')` (L719):
  - On ground, it leaves ground (`ground = false`). In whole-year mode it also sets `focusArea = kept[0]` (or null); in quick mode it sets `focusArea = null`.
  - Otherwise it clears `focusArea` and `sheetOpen` and goes to `min(6, step+1)`.
  - Every step is skippable. The S point reads `Skip` when the current level is empty, `Walk on` when it has items, and on ground `Plant goals` / `Skip` by whether anything is kept.
  - Ground "Skip" only leaves the ground sub-state; it does not skip Year.
- `go(s)` (L712) stops timers and sets `step`. It clears `speaking`, `live`, `petalsOpen`, `hover`, `holding`, `selected` and `lastPlant`. It keeps `said`, `focus`, `ex` and `kept`.
- On arriving at a step, no parent is focused (except via "Walk another one down", which sets `focus = {2: 0}`).
- `act('back')` (L718): on Year non-ground it returns to ground (`ground = true`, `focusArea = null`) even though its label says "Start". Otherwise it goes to `max(0, step-1)`. From ground it goes to Welcome.
- **Period names are hardcoded** in the prototype ("this winter", "Feb 28", "November", "the 30th", "Sun 15", "Friday, 13 November"). They must be computed using the spec's rule (spec L184–190):
  - Year goals file under next calendar year if the walk starts in November or December, otherwise the current year.
  - Season is the current season unless fewer than 3 weeks are left, then the coming one, and the question names it ("And this winter?").
  - Month follows the same rule.
  - The prototype's season ends Feb 28, which implies a Dec–Feb winter. Confirm the season boundaries against the app's existing season definitions; that is not visible in the prototype.

### Step 6 and the Today step

- **Step 5 (Today)** plants a purple "Today" banner (`d: 'First thing'` in the script). The spec says it "marks one of today's tasks as first" (spec L171). The prototype creates a new item instead. When focused (`Start the day with “…”?`) it is meant to pick a Week task; the rebuild should mark that task rather than duplicate it. That is ambiguous, so confirm.
- **Step 6** is described in §13.

## 3. Camera

### Stage and world

- Stage: 390 x 844, `overflow: hidden`. Stage background `linear-gradient(180deg, #00106e 0%, #0a2a7a 60%, #142430 100%)` (L47).
- World: 1300 x 1720, origin top-left. Background `linear-gradient(180deg, #00106e 0px, #011c8c 424px, #0a2a9a 1720px)` (L799).
- Image: placed at world (0, 420), size 1300 x 1300 (L50, `/_blob/419f44de…`, the blob is not in the repo). From the spec this is the square overlook print (1932 px original; `overlook-square-original.png` and the 3x upscale `overlook-square-3x.png/jpg` at 5796 px live in `~/Pictures/Symphony scenery`). I could not confirm which file the blob is; it matches none of them by SHA-1, so it may be a re-encode.
- Camera transform (L799): `transform-origin: 0 0; transform: scale(k) translate(-x px, -y px)`. So **screen = (world − (x, y)) × k**. It animates with `transition: transform 1400ms cubic-bezier(.45,.05,.2,1)`. In SwiftUI that is `.timingCurve(0.45, 0.05, 0.2, 1, duration: 1.4)`.

### Stops `VIEW[step] = [x, y, k]` (L480)

| Step | x | y | k | World visible (x range; y range) | Image top → bottom on screen |
|---|---|---|---|---|---|
| 0 Welcome | 0 | −1093 | 0.30 | 0–1300; −1093–1720 | 453.9 → 843.9 |
| 1 Year | 186 | −553 | 0.42 | 186–1114.6; −553–1456.5 | 408.7 → 954.7 |
| 2 Season | 217 | −294 | 0.45 | 217–1083.7; −294–1581.6 | 321.3 → 906.3 |
| 3 Month | 244 | −67 | 0.48 | 244–1056.5; −67–1691.3 | 233.8 → 857.8 |
| 4 Week | 260 | 110 | 0.50 | 260–1040; 110–1798 | 155.0 → 805.0 |
| 5 Today | 275 | 253 | 0.52 | 275–1025; 253–1876.1 | 86.8 → 762.8 |
| 6 Look back up | 186 | 15 | 0.42 | 186–1114.6; 15–2024.5 | 170.1 → 716.1 |

At steps 4 and 5 the camera shows below the image bottom (world > 1720). The stage background `#142430` shows there. At step 4 it is 39 pt and at step 5 81 pt, both behind the dial, and at step 6 behind the sheet. With taller art (spec L191–199) this goes away.

### Bands `BAND[level]` (L512): where each level's posts stand (world y of the post base, row 0)

| Level | BAND | Image row (fraction of the 1300 image) | Scene (my reading of the square print) |
|---|---|---|---|
| 1 Year | 780 | 0.277 | snow peaks |
| 2 Season | 950 | 0.408 | upper river valley |
| 3 Month | 1100 | 0.523 | middle valley |
| 4 Week | 1230 | 0.623 | pines and cliff |
| 5 Today | 1330 | 0.700 | top of the rock ledge |

**Invariant:** at its own step, every level's row-0 post base lands at screen y ≈ 560 (computed: 560, 560, 560, 560, 560). On other steps:

| Step \ level base y | Year | Season | Month | Week | Today |
|---|---|---|---|---|---|
| 1 | 560 | (631) | (694) | (749) | (791) |
| 2 | 483 | 560 | (627) | (686) | (731) |
| 3 | 407 | 488 | 560 | (623) | (671) |
| 4 | 335 | 420 | 495 | 560 | (610) |
| 5 | 274 | 362 | 440 | 508 | 560 |
| 6 | 321 | 393 | 456 | 510 | 552 |

Values in brackets are levels that are normally empty at that step. Row offsets are added on top of these (see §5).

### Zoom to an area (L523–526)

- `zoomCol` is:
  - on Year (not ground), `focusArea` if it has a column;
  - on steps 2–5, the area of the focused parent (`said[step-1][focus[step]].a`) if it is non-null and has a column. Focusing a parent with no area does **not** zoom.
- If `zoomCol` is set, the camera becomes `zs = 0.8` and:
  - `x = colX[col] − 195/0.8`
  - `y = BAND[step] − 520/0.8 − (colIdx[col] % rows) × 70 / VIEW[step].k`
  - `k = 0.8`
- The result: the column is centred at screen x 195 and the current level's post base lands at screen y 520, whatever row it is in. It uses the same 1400 ms transition. Clearing focus (tap again) returns to `VIEW[step]`.
- Banners and labels are counter-scaled (`scale(f / k)`), so zooming **does not enlarge banners or labels**. It spreads and enlarges only the scenery.

### Triggers

- Year: tap an area label (non-ground) to toggle `focusArea` (L540). No sound.
- Steps 2–5: tap a parent-level flag to toggle `focus[step]` (L687). No sound.
- Nudge me (L722–728):
  - Year: if any area is kept, `focusArea = kept[(kept.indexOf(focusArea) + 1) % kept.length]`. With nothing focused it starts at `kept[0]`. It cycles in **tap order** and never returns to "whole range".
  - Steps 2–5: if the level above has n > 0 items, focus goes `null → 0 → 1 → … → n−1 → 0`, cycling. Panning happens only when the parent has an area.

## 4. Areas and peaks

- Defaults `AREA_NAMES = ['Health','Home','People','Work','Money','Fun']` (L478). `allAreas = AREA_NAMES + custom` (L510).
- `shownAreas` (L511): on ground, all areas; otherwise only kept ones, **in `allAreas` order** (not tap order).
- Columns (L513–518): `colNames = shownAreas`, plus `'Other'` (not on ground) if any item on any level has no area or an area without a column.
- With `cnt` columns and index `i`, the screen x at Year zoom is:
  - `vx = 195` if `cnt == 1`
  - on ground: `vx = 50 + i × 290/(cnt−1)` (6 defaults → 50, 108, 166, 224, 282, 340)
  - otherwise: `vx = 87 + i × 215/(cnt−1)` (3 kept → 87, 194.5, 302)
- World x: `colX = 186 + vx / 0.42`. This is fixed from the Year view and shared by all levels. Image-relative x runs from 0.235 to 0.766 on ground and from 0.302 to 0.696 otherwise.
- Screen x of a column at each step (for the post groups):

| Year-screen vx | step 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| 50 | 50.0 | 39.6 | 29.3 | 22.5 | 15.6 | 50.0 |
| 87 | 87.0 | 79.3 | 71.6 | 66.6 | 61.4 | 87.0 |
| 195 | 195 | 195 | 195 | 195.1 | 195.1 | 195 |
| 302 | 302.0 | 309.6 | 317.3 | 322.5 | 327.6 | 302.0 |
| 340 | 340.0 | 350.3 | 360.7 | 367.8 | 374.7 | 340.0 |

- Rows (L517): `rows = cnt > 6 ? 3 : (cnt > 3 ? 2 : 1)`, and `row = colIdx % rows`.
- **Label stagger, downward** (L522, L534): label anchor `wy = 780 + row × 34/0.42`. The label top is `wy + 3/0.42`. On the Year screen that gives label tops at y 563 / 597 / 631 for rows 0/1/2.
- Label element (L534–536):
  - 90 wide, min-height 34, centred on `colX`, `transform-origin: 50% 0`.
  - Scale: on ground, `1 / k`; otherwise `max(0.6, 1 − 0.1·d1) / k`, where `d1 = max(0, min(step,6) − 1)`.
  - Opacity: on ground, 1 if kept and 0.62 if not; otherwise `max(0.5, 1 − 0.1·d1)`.
  - Transitions: opacity 400 ms, transform 1400 ms with the camera curve, left/top 700 ms ease (labels glide when columns re-flow).
  - z 9.
  - Content: an upward triangle marker (10 wide, 7 tall) above a pill. Pill text is 11 px, weight 700, letter-spacing 0.1 em, uppercase, padding 4 x 9, background blur 6.
  - States: focused = text `#1f2a2b` on `#f6dfa6`, glow `0 0 18px rgba(255,220,150,.95)`. Kept = text `#f6dfa6` on `rgba(0,22,96,.72)` with an inset 1.5 px `#f6dfa6` ring. Otherwise white on `rgba(0,22,96,.55)`. The marker is `#f6dfa6` when kept or focused, otherwise `rgba(255,255,255,.85)`.
- Keep toggle (L539): only on Year in ground. Each tap plays a tick and toggles the name in `kept` (append on, filter off).
- Custom area (L398–401, L432–435): on ground, a hold (or the W point "Name your own") "speaks" the next unused of `['Creative work','Faith','Learning']` (canned). Planting appends it to both `custom` and `kept`. No banner is made, and no Undo is offered for it. It becomes the next column after the defaults. Once the pool is used up, hold shows "That’s all I have here".
- Limits: there is no explicit area limit. With 7 or more columns there are 3 label rows. In the real app the name comes from speech or typing; there is no limit in the spec either.
- Possible collision: at 3 rows, row-2 labels (y 631) reach the orb (top ≈ 630, x 147–243), and the dial sits above the world. Not handled in the prototype.

## 5. Posts, flags and banners (approved path, L639–696)

**Grouping (L675–691).** For each level s from 1 to 5:

1. Bucket `said[s]` by column: `it.a` if `colX[it.a]` exists, else `'Other'`.
2. Skip a bucket whose column does not exist. This happens on ground for `Other` items, which are then hidden.
3. Make one group (= one post) per level per column. Each area therefore has up to five posts, one per level, stacked vertically down the slope at the same x.

**Group anchor** (L689, L646). The post's bottom-centre is at world `(colX, BAND[s] − row × R / VIEW[s].k)`, with `R = 70` in full mode and `R = 26` otherwise. Rows stagger **upward**, unlike labels. Transform: `scale(f / k) translate(-50%, -100%)`, origin 0 0.

**Mode per level (L682).**
- Step 6: `'compact'` for all levels.
- Level == step: `'full'`.
- Otherwise: `'tip'`.
- A tip that is focused or selected is shown as `'compact'` (L655).

**Group scale f (L643).** Full = 1, compact = 0.85, tip = `max(0.6, 1 − 0.1·(d − 1))`, where `d = max(0, min(step,6) − s)` is the distance in levels.

**Group width (L519–520, L644).**
- All tips: 34.
- Otherwise `bw = clamp(round(spacing − 8), 70, 124)`, where `spacing = cnt > 1 ? 215/(cnt−1) : 200`. That gives 1–2 columns → 124, 3 → 100, 4 or more → 70.

**Distance fade (L646).** Opacity is `max(0.6, 1 − 0.09·d)` (ghost groups 0.88). Filter is `blur(0.3·d px) saturate(max(0.55, 1 − 0.1·d))`. Transitions: transform, opacity and filter at 1400 ms. z-index is `10 + s`.

**Group box.** Flex column, items centred, gap 4, padding `2px 0 18px`. The 18 pt of bare pole shows below the lowest banner. Items run top to bottom in planting order, so newer banners sit lower, nearer the ground. The stack grows upward because the group is bottom-anchored.

**Pole and shadow.** The pole is 3 wide, full group height and centred, `linear-gradient(90deg,#4a3a2c,#2c2219)` (ghost: `rgba(255,255,255,.85)`). The shadow is an 18 x 5 ellipse at bottom −3, `rgba(30,25,20,.4)`, blurred 1.5.

**Level colours (L485–489).** Year `#a8452c`, Season `#b0701c`, Month `#2f6b52`, Week `#2f5f8a`, Today `#6b4a8c`.

**Full banner (L666–673).**
- Full group width. Cloth padding `6px 8px 13px`, with a V-notch at the bottom: `clip-path: polygon(0 0, 100% 0, 100% 100%, 50% calc(100% − 8px), 0 100%)`.
- Text: 13/16, weight 600, white, centred.
- Optional tag line (levels 2–5 only, the day `d`): 10 px, weight 700, 0.08 em, uppercase, `rgba(255,255,255,.85)`, margin-top 2.
- Shadow `drop-shadow(0 2px 3px rgba(20,20,20,.35))`. Focused or selected banners glow instead: `drop-shadow(0 0 7px rgba(255,226,160,1)) drop-shadow(0 0 14px rgba(255,214,140,.9))`.
- Motion: flutter `skewY(0 → −2.5° → 0)` over 3.2 s ease-in-out, looping (L22, L31). Planting drop-in `.wk-plant2` (L16, L29) runs 700 ms with `cubic-bezier(.2,.8,.2,1)`: opacity 0, translateY −46, scale 0.7 → at 70%: opacity 1, translateY +3, scale 1.03 → rest.

**Compact (one-line) banner.** Padding `4px 6px 9px`, notch 5. Text 11/14, weight 600, white, `nowrap`, ellipsis. No tag.

**Tip (small flag, L656–664).** Wrap is 17 tall. The cloth is a right-pointing triangle, 22 x 15, `margin-left: 18px` (just right of the pole), in the level colour. Shadow `drop-shadow(0 1px 2px rgba(20,20,20,.35))`. No text.

**Unlabeled post.** The `'Other'` column is the last column and gets no area label.

**Max before stacking or collapsing.** There is no collapse logic. Speech and examples stop at 3 items per level (`nextLine` L403, example tap L629/L694), so a post holds at most 3 banners unless several are moved onto it. The spec leaves stacking to the builder (spec L283–284).

**"Never overlap / never float" — how much is enforced.**
- Floating: bands sit on land in the image, and posts stand on the band, so nothing floats.
- Overlap is only reduced, not prevented:
  - Columns are spaced 215/(cnt−1) at Year zoom, and lower levels spread slightly wider (table in §4).
  - Alternate columns use different rows: 70 pt apart in full mode, 26 in tip mode.
  - Width shrinks to 70 at 4 or more columns.
- With 4–6 columns the spacing is 43–72 pt and banners are 70 wide. Neighbours in the same row are two columns apart (86–143 pt), so tall stacks can still touch neighbours in the other row.
- The only real collision-avoidance algorithm is the dead `place()` (L578–596). It tries offsets `[0,0], [0,−gap], [dx,0], [−dx,0], [dx,−gap], [−dx,−gap], [0,−2gap], [dx,−2gap], [−dx,−2gap], [0,gap], [dx,gap], [−dx,gap]`, where `gap = (H+10)/k` and `dx = round(0.75·W)/k`. It flips the side at screen edges (8..382) and uses a 4 pt pad against placed boxes, including area labels.
- If strict non-overlap is required, a rebuild needs its own pass, for example measuring group frames and nudging rows.

## 6. Placement by words

**Not implemented in the prototype.** There are no keyword lists, matching or tie-breaks. The area comes from the canned script's `a` field (L230–234). What *is* implemented (L436–451):

- **Year (s = 1):** `a = (line.a && kept.includes(line.a)) ? line.a : (focusArea ?? null)`. So the "clear" area wins when it is kept. Otherwise the focused area catches it. Otherwise it goes to `null`, the unlabeled post.
  - If `focusArea` is set and `a` is non-null and differs from it, the code sets `note = 'That sounded like ' + a.toLowerCase() + ', so it went on the ' + a + ' peak'`, shown for **3200 ms** in the hint line.
  - Example: `That sounded like home, so it went on the Home peak`. There is no full stop. The area name is lowercased with `toLowerCase()`, not `PHRASE` (so People → "people").
  - A "clear" area that is **not kept** is ignored. The goal goes to the focused area or to Other. The prototype never auto-adds an area from words.
- **Season to Today (s ≥ 2):** `a = focusedParent?.a ?? line.a ?? null`. Inheritance from the focused parent wins, even over a "clear" area in the words. With no focus it uses the classified area (the canned `a`), else null. No note is shown at lower levels.
- **Examples** (L693–694): `a = focused parent's area` (steps 2–4) or `focusArea` (step 1), else null. No classification.
- **Days:** `d` comes from the script. It is displayed as an uppercase tag on levels 2–5 (Year never shows a tag, L687).
- **What the real app needs and the prototype lacks:** an on-device classifier from words to kept area. The spec says "No server AI" (spec L180–181), so this needs keyword lists per area, matching, tie-breaks and a confidence threshold for "clearly belongs". None of these exist in the prototype; they must be designed. Also decide whether a clear but un-kept area should go to Other or offer to add the area; the prototype sends it to Other.

## 7. The orb

**Geometry (L112, L134–142, L826).**
- The dial box is 300 x 300 at stage (45, 528), z 6, `pointer-events: none` (except the orb and points).
- The orb is 96 x 96 at dial (102, 102), so its centre is at stage **(195, 678)** with radius 48. It scales to 1.1 while held, over 200 ms.
- Halo: inset −38 (172 pt disc), `radial-gradient(circle, rgba(255,238,196,.75) 0%, rgba(255,226,170,.3) 42%, rgba(255,226,170,0) 70%)`.
- Body: `radial-gradient(circle at 38% 30%, #ffffff 0%, #fff7e0 20%, #f8e2ad 48%, #ebbf72 76%, #dda152 100%)`. Shadows: `0 0 36px rgba(255,214,140,.85), 0 0 90px rgba(255,214,140,.5)`, inset `0 -10px 20px rgba(185,118,40,.3)`, inset `0 4px 10px rgba(255,255,255,.8)`.
- Specular highlight: a 32 x 18 blob at (20, 13), white 0.8, blurred 5.

**Breathing (L19–20, L34–37).**
- Idle: orb scale 1 → 1.05 → 1 and halo opacity 0.65 → 1, scale 0.94 → 1.1, over 4.5 s ease-in-out, looping.
- While held or speaking, the same cycle runs at 1.1 s.
- While speaking, two ripple rings also run: 2 px `rgba(255,230,180,.9)` border, scale 1 → 2.1, opacity 0.75 → 0, 1.6 s ease-out, looping; the second is delayed 0.8 s (L21, L38, L136–139).

**Compass (L115–119).**
- Ring: circle r 66 at the dial centre, `rgba(255,255,255,.55)`, 1 px.
- Four ticks, each 8 long at radius 62–70, at N/S/E/W, `rgba(255,255,255,.8)`, 1.5 px, round caps.
- Needle: a triangle 10 wide and 12 tall.
  - Down: `M150 214 l-5 -12 h10 z`, apex at radius 64 below the centre, colour `rgba(168,69,44,.9)`.
  - Up: `M150 86 l-5 12 h10 z`, colour `rgba(255,255,255,.75)`.
  - Fill transition 400 ms. The shape flips instantly.
  - `needleDown = (current level has ≥1 item) || step == 0` (L776).

**Dial back wash (L817).** Shown only while points are visible, fading over 220 ms: `radial-gradient(circle, rgba(255,250,236,.55) 0%, rgba(255,250,236,.35) 45%, rgba(255,250,236,0) 72%)`.

**Press (`orbDown`, L334–358).**
- Ignored while `speaking`.
- Records the orb centre and radius, `t0`, and `wasOpen = petalsOpen`. Sets `holding = true` and `hover = null`. Global move, up and cancel listeners are attached.
- Steps 1–5:
  - Immediately play `sfxBag()` and `sfxRattle()` (the rattle starts +120 ms).
  - At **420 ms**, if still holding and no point is hovered, call `startWriting(55, false)`.
- Step 0: only unlocks audio.
- While `holding && !speaking`, the compass points are visible (L748). So the points flash for the first 420 ms of every hold on steps 1–5. On step 0 they stay visible for the whole hold.

**Writing (`startWriting`, L408–424).**
- Takes the next line. Sets `speaking = true`, closes the points and clears hover.
- If there is no line: `live = 'That’s all I have here'`.
- Otherwise:
  - `sfxUnfurl()` plays at +280 ms.
  - One more character appears every `speed` ms (55 when holding, 85 for Type it).
  - With auto-plant (Type it), it plants 650 ms after the last character.

**Live flag (L121–132, L822).**
- Anchored at dial (150, 18), so the pole runs from stage y 546 to 632. It stands on top of the orb, whose top is at ≈ 630.
- Pole: 3 x 86, `linear-gradient(90deg,#4a3a2c,#2c2219)`. It rises with `scaleY 0 → 1` over 380 ms ease-out from the bottom.
- Cloth: hangs from the pole top-right at (2, 2) with glow `drop-shadow(0 0 10px rgba(255,226,160,.9))`. It unfurls `scaleX 0 → 1` over 500 ms after a 300 ms delay, ease-out, from the left.
  - Shape: min width 40, max 220, in the current level colour (ground: Year colour), padding `6px 18px 6px 10px`.
  - Swallowtail on the right: `polygon(0 0, 100% 0, calc(100% − 10px) 50%, 100% 100%, 0 100%)`.
  - Text: 14/17, weight 600, white, followed by a blinking caret (2 x 14 white, 1 s steps).
- Total press-to-full-flag timeline: 0 ms bag + rattle → 420 ms pole starts (to 800 ms) → cloth 720–1220 ms → flap sound at ~700 ms → characters from ~475 ms.

**Slide (`orbMove`, L359–374).**
- `dist = |pointer − centre| / 48`. If `dist < 1.4` (under 67.2 pt, about the ring radius of 66), hover is cleared.
- Otherwise, if writing has started, it is **cancelled** (timers stopped, `target = null`, `speaking = false`, `live = ''`) and the points reappear.
- The angle is `atan2(dy, dx)` in degrees, screen y down, so up is −90.
- The point chosen is the nearest point of the current set by angular difference (wrapped to 180). It is accepted only if under **32°**.
- Hover changes play `sfxTick()` when entering a point. The hovered disc grows from 46 to 54 and brightens.

**Release (`orbUp`, L375–385), first match wins.**
1. Hovering a point → `act(id)`.
2. Speaking → `plant()`. It plants the whole canned line even if the typing hadn't finished.
3. Press under 420 ms (tap) → `petalsOpen = !wasOpen`. A tap opens the points; a tap while they're open closes them.
4. Long press, not speaking, no hover (for example, slid out then back to the centre) → `petalsOpen = (step == 0)`. On steps 1–5 that is a cancel; on Welcome the points stay open.

**Cancel** (pointercancel, L386–389) clears holding, hover, speaking and live, and stops timers.

**Points `POS`** (dial coordinates, centre (150,150), radius 116; L501):
- N (150, 34, −90°)
- NE (232, 68, −45°)
- E (266, 150, 0°)
- SE (232, 232, 45°)
- S (150, 266, 90°)
- SW (68, 232, 135°)
- W (34, 150, 180°)
- NW (68, 68, −135°)

**Point look (L144–151, L749–757).**
- Disc: 46 (54 when hot), `radial-gradient(circle at 40% 35%, rgba(255,255,255,.92|1) 0%, rgba(255,246,222,.7|.95) 60%, rgba(255,236,196,0) 100%)`, glow `0 0 16|28px rgba(255,226,160,.6|.95)`, transition 160 ms.
- Icon: 20 pt, stroke `#1f2a2b`, 1.6. The icon paths are at L491–500.
- Label: below the disc, 12 px, weight 700, white with the glow shadow (the `.wk-glow` class overrides the inline `#1f2a2b`).
- Entry: `petalIn` 260 ms `cubic-bezier(.2,.9,.3,1.2)`, scale 0.4 → 1, fading in.

**Point sets (L731–744).**

| Context | Points |
|---|---|
| Welcome (0) | S `Quick start` (quick), E `Whole year` (full), W `Just today` (today) |
| Year, ground | N `Start` (back), S `Plant goals` if anything is kept else `Skip` (next), W `Name your own` (type) |
| Steps 1–5 | N `Start` on step 1 / `Back up` (back); S `Walk on` if this level has items else `Skip` (next); W `Type it`; NE `Nudge me`; E `Examples` / `Hide examples` **only if the step has examples (1–4)** |
| Step 6 | no dial |

**Actions (L713–729)**, each first closing the points:

| Id | Effect |
|---|---|
| `quick` | `mode = 'quick'`, `ground = true`, `kept = []`, `focusArea = null`, go to 1 |
| `full` | as `quick` with `mode = 'full'` |
| `today` | `sheetOpen = true`, go to 6 (straight to Today, skipping the walk; not in the spec) |
| `back`, `next` | see §2 |
| `type` | `startWriting(85, true)` |
| `examples` | toggle `ex[step]` |
| `nudge` | see §3 |

## 8. Type it (L720, L408–424)

- **The prototype fakes it.** It plays the same canned next line at 85 ms/char on the live flag, then auto-plants 650 ms after the last character. There is no keyboard or text field.
- On ground it is labelled "Name your own" and plants a canned custom area name.
- While it runs, the orb ignores presses (`speaking` blocks `orbDown`) and the hint reads "Let go to plant it".
- If there is no line left, it shows "That’s all I have here" and **stays stuck in `speaking`** until something else resets it. That is a prototype bug.
- The real app needs a single-line text entry. The spec says "a single line" (spec L251–252). It should plant through the same `plant()` rules, with the area classified and the day pulled out (§6, §11).

## 9. Examples (L472–477, L692–696)

`EXAMPLES` per step. The lists are not per area:
- 1 Year: `Run a 5K`, `Read a book a month`, `Pay off the car`
- 2 Season: `Clear out the garage`, `Get outside every weekend`
- 3 Month: `Book the plumber`, `Two early nights a week`
- 4 Week: `Call the tile shop`, `Gym on Tuesday`
- 5 Today: none. There is no Examples point on Today.

Behaviour:
- When toggled on (`ex[step]`), the first 3 are shown, minus any whose exact text is already planted on this level.
- They appear as **one ghost post** centred on screen at x 195, 170 pt above the current band's base: world `(v.x + 195/k, BAND[step] − 170/k)`. That is screen y 390 unzoomed and y 350 when zoomed on a row-0 column.
- Look:
  - Group opacity 0.88, white pole `rgba(255,255,255,.85)`.
  - Cloth `rgba(255,255,255,.62)` with a dashed outline `1.5px dashed rgba(255,255,255,.95)`, offset −3.
  - Text italic `#1f2a2b`, 13/16, weight 600. Tag colour `#3f4b49`.
  - Same drop-in and flutter as other banners. No bob in the approved path.
- Tap one:
  - Ignored if the level already has 3.
  - Otherwise play `sfxRattle()`, then `sfxPlant()` at +160 ms.
  - Append `{t, a: focused parent's area (steps 2–4) or focusArea (step 1) or null}`. No day.
  - Set `lastPlant` and the 7000 ms Undo timer.
- The examples stay open per step until toggled off. Examples supply content only on request, so the anti-goal is respected.

## 10. Undo, Move to, Pull it up

- **Undo** (L453–455, L703–705, L165–167). Each plant or example tap sets `lastPlant = {s, j}` and restarts a 7000 ms timer that clears it.
  - Shown when `lastPlant.s == step`, not speaking, and nothing selected.
  - It sits right of the hint text as a pill: min-height 34, padding 0 12, 1 px `rgba(255,255,255,.55)` border, `rgba(0,22,96,.6)` background with blur 8, white text 13/700, a back-arrow icon 14, label `Undo`.
  - Tap: remove `said[s][j]`, play `sfxRattle()`, clear `lastPlant`.
  - Cleared by step change (`go`), by selecting a banner, and by pull-up.
  - Custom-area naming, Move and Pull it up are not undoable. The spec wants app-wide undo of the last action (spec L119–120).
- **Select** (L684–687). Only current-level banners on steps 1–5 can be selected.
  - Tap: `sfxTick()`, toggle `selected = {s, j}`, clear `lastPlant`. The selected banner glows like a focused one.
  - Aria label: `<Level>: <text>, tap to move or pull up`.
- **Move to row** (L155–162, L697–702). It replaces the hint row and scrolls horizontally.
  - Label `Move to` (12 px, weight 700, glow).
  - Chips, one per area in **`allAreas`** (all six defaults plus custom, kept or not) except the item's current area, then `Pull it up`.
  - Chip style: min-height 34, padding 0 12, pill, 1 px `rgba(255,255,255,.55)`, `rgba(0,22,96,.62)` background with blur 8, white 11 px, weight 700, 0.06 em, uppercase. "Pull it up" uses colour `#ffd0c0` and border `rgba(255,180,160,.7)`.
- **Move** sets the item's `a = n`, plays `sfxRattle()` and `sfxPlant()` at +140 ms, and clears `selected`. If `n` is not kept, it is appended to `kept`, so a new column appears.
- **Pull it up** removes the item, plays `sfxRattle()`, and clears `selected` and `lastPlant`.
- Index caveat: removing or undoing a parent-level item shifts indices, so `focus[step+1]` can then point at the wrong parent. A rebuild should use stable ids.

## 11. Text tidying and pulling out a day

**Not in the prototype.** There are no regexes or filler removal. The day comes pre-split in the script (`d: 'Today'`, `'Saturday'`, `'First thing'`). The spec rule (spec L175–176) says to use the person's own words as the title, tidy spoken filler, pull out a day ("the deposit, today"), and not rewrite. The spec routes this through the existing on-device `CaptureParser` after TellSheet speech (spec L180–181), so look there for the real rules. Display: the day shows as the uppercase tag under the banner text on levels 2–5.

## 12. Sounds (L249–327)

Engine: one AudioContext, master gain 0.6, a 1 s mono white-noise buffer. `burst()` plays noise through a biquad filter (optional exponential frequency sweep) with an exponential envelope from 0.0001 → gain (attack default 5 ms) → 0.0001 at `dur`. Each burst starts at a random offset of 0–0.5 s into the noise. `tone()` is an oscillator with an exponential frequency glide f0 → f1, a 4 ms attack and exponential decay over `dur`.

| Method | Fires when | Recipe | Recorded equivalent to look for |
|---|---|---|---|
| `sfxBag` | every orb press on steps 1–5 (taps included) | 6 highpass noise bursts at `i·50 ms + rand(0–30) ms`, each 70–130 ms, cutoff 2600–4800 Hz, Q 0.7, gain 0.07–0.12, 10 ms attack; plus a bandpass sweep 900 → 1800 Hz, 280 ms, Q 0.8, gain 0.05, 60 ms attack at +50 ms | canvas bag rustle, about 0.35 s, soft and airy |
| `sfxRattle` | with `sfxBag` on press (starts +120 ms); also on example tap, Move, Pull it up and Undo | 5 clacks spaced 35–95 ms apart, each a triangle tone 900–1500 Hz gliding to 0.92·f over 70 ms (gain 0.05–0.08) plus a 35 ms bandpass click at 2200–2800 Hz, Q 6, gain 0.09 | wooden poles / dowels clacking, 5 light knocks, about 0.4 s |
| `sfxUnfurl` | 280 ms after writing starts (hold or Type it) | 3 bandpass sweeps: 450 → 1900 Hz, 200 ms, Q 1.2, gain 0.16, 30 ms attack; at +170 ms 700 → 1600 Hz, 120 ms, Q 1.4, 0.08; at +270 ms 900 → 1400 Hz, 90 ms, Q 1.6, 0.05 | a single cloth or flag flap that decays, about 0.36 s |
| `sfxPlant` | on every successful plant (including custom area); +160 ms after an example tap; +140 ms after Move | swish: bandpass 600 → 1500 Hz, 140 ms, gain 0.05, 50 ms attack. Hit at +130 ms: sine 120 → 42 Hz over 220 ms, gain 0.42 (thud); lowpass noise 380 Hz, 120 ms, gain 0.3, 3 ms attack; 4 highpass grit ticks (1800–3300 Hz, 30 ms, gain 0.05) every 22 ms from +10 ms; faint triangle 1100 → 980 Hz, 120 ms, gain 0.025 | a short whoosh into a soft earthy thud of a stake into soil, with a little grit, about 0.4 s |
| `sfxTick` | entering a compass point while sliding; toggling a ground area; selecting a banner | sine 2300 → 2100 Hz, 35 ms, gain 0.03 | a tiny click or tick, very quiet |

There are no sounds for: focusing an area or parent, tapping a point (as opposed to sliding to it), step changes, ring fill, or "That's the day". **The app must use recorded sounds, not synthesis, and pair them with haptics** (spec L90–93). The prototype has no haptics.

## 13. Ending (step 6, L172–223, L776–841)

**Entry.**
- Walk on from Today (step 5) → step 6 with `sheetOpen = false`.
- Welcome "Just today" → step 6 with `sheetOpen = true`.

**Camera and posts.** `VIEW[6] = [186, 15, 0.42]` (Year's x and scale, shifted down). Every level shows as **compact** one-line banners (scale 0.85) on its area column, faded by distance: Year opacity 0.6, blur 1.5, saturate 0.55. Area labels are at opacity 0.5 and scale 0.6.

**Header** (L173–176). Top 54, padding 0 20, space-between.
- Title: Crimson Pro 24, weight 500, glow. It reads `Look back up: that’s your plan.` when there are any posts and the sheet is down, otherwise `Here’s today.`
- Link button `Walk it again` (DM Sans 14, weight 600, min-height 44, glow) → `restart`. Restart resets step 0 and clears said, focus, kept, custom and ex. It sets `done = {0:true}`.

**Sheet** (L177, L830).
- `top: 130` when open or when there are no posts, else `716`. Bottom 0. Background `#fbf8f2`, radius 28 at the top, shadow `0 -10px 40px rgba(30,38,40,.18)`, padding `4px 18px 0`, column gap 12.
- `top` animates over 600 ms `cubic-bezier(.2,.8,.2,1)`. On first appearance it rises from `translateY(100%)` over 900 ms with the same curve (`.wk-sheet`).
- Handle: a 40 x 5 grabber `#d4cdc0`, label `Show my day` when down, `Look back up at your plan` when up (13 px, weight 600, `#3f4b49`). A tap toggles.
- **Today does not rise on its own** after the look-back view; the person taps the handle. The spec says "Today rising in as a sheet, after…". Whether the rise should be automatic (after a beat) is ambiguous.

**Sheet content.**
- **Hardcoded**, not taken from the walk:
  - `Today` eyebrow (12 px, weight 700, 0.08 em, uppercase, `#56625f`).
  - `Friday, 13 November` (Crimson Pro 28/32, weight 500).
- **Ring** (L187–192, L793–794, L838–841):
  - 64 pt, viewBox 72, r 29, stroke 8. Track `#e2dccf`, progress `#32664d`, round cap, starting at 12 o'clock.
  - `dasharray = (C·k/n) C` with `C = 2π·29 = 182.2`, transition 500 ms ease-out.
  - Centre `k/n` (15 px, weight 700, tabular). Aria label `k of n done`.
- **Next card** (hardcoded): `Next · 2:30 pm` (12 px, weight 700, uppercase, `#9a3d1f`), `Dentist` (17/600), `in 3 hours` (14, `#6a4a3e`). Background `#fbebe3`, border `#f0cdbd`, radius 14, padding 12 16.
- **To-do list** (hardcoded 4 rows, L777–792):

  | Title | "for" |
  |---|---|
  | Send the contractor the deposit | Pick the tile and pay the deposit |
  | Measure the bathroom wall | Finish the bathroom |
  | Lift, 30 minutes | Feel strong again |
  | Plan Saturday breakfast out | More slow weekends together |

  - The first row starts done.
  - Rows: min-height 60, padding 8 16, gap 14, top border 1 px `#e6e0d6` (none on the first). Card white, border `#e6e0d6`, radius 16.
  - Check circle 26: done = filled `#32664d` with a white tick; open = 2 px `#857d72` ring.
  - Title 16/600 `#1f2a2b`. Done = `#6b7472`, line-through in `#a9b0ad`.
  - Second line `for <goal>` (13 px `#4a5654`, goal in Crimson Pro 15 `#32664d`). A tap toggles done.
- **`Walk another one down`** (L215–218, L834–835):
  - Dashed 1.5 px `#9cbca8` card on `#f3f8f4`, radius 14, min-height 60. Title 15/600. Second line `Next flag: <name>` (13 px `#3f4b49`, name in Crimson Pro 15 `#244b38`), with a down arrow.
  - `name` = the **first** Year goal (`said[1][0]`, or the script's if none).
  - Tap: keeps the Year goals (seeding the script's if empty), sets `focus = {2: 0}`, clears `focusArea`, `ground` and `sheetOpen`, and goes to Season.
  - Prototype shortcut: it always picks index 0, never "the next" un-walked goal, and it wipes other focus entries.
  - It is shown in both modes.
- **Done line** (L219–221): when `k == n`, the line `That's the day. Well done.` appears (Crimson Pro 22, `#244b38`, centred). The spec says only "That's the day". "Well done" leans toward praise, which Scott's anti-goals avoid, so confirm the copy.

**Quick vs whole year** (only differences in the prototype):
- The `mode` flag.
- The Year eyebrow (`The year ahead · area by area`).
- Leaving ground in whole-year mode auto-focuses `kept[0]`, so the Year question becomes "What about …, this year?" and Nudge steps through areas.

Nothing else differs:
- Quick start does not stop at one goal.
- Whole year does not sequence each year goal down through Season.
- There is no "offer the full plan again each season".
- There is no save or resume.

Those spec items (spec L133–137, L182–183) must be designed.

## 14. Look

- **Fonts** (L11): Crimson Pro 400/500/600 and 400 italic; DM Sans 400/500/600/700. The base font is DM Sans, colour `#1f2a2b` (L47).
- **Glow text `.wk-glow`** (L42): `color: #ffffff !important; text-shadow: 0 1px 14px rgba(0,14,70,.75), 0 0 3px rgba(0,14,70,.6)`. It overrides the inline `#2f3a38` / `#1f2a2b` colours on the eyebrow, why line, welcome subline and point labels, so these all render white.
- **Sizes:**
  - Welcome: wordmark Crimson Pro 22, 0.04 em, `#f6dfa6` (gold, no glow). h1 Crimson Pro 42/46, weight 500. Sub 17/25. Block top 140, side padding 32, gap 16.
  - Asking block (top 64, side padding 28, gap 8): eyebrow 12, weight 700, 0.1 em, uppercase; question Crimson Pro 32/36, weight 500; why 15/21.
  - Hint 13, weight 600, centred. The bottom row is at left/right 10, bottom 8, min-height 38, gap 10, z 7.
- **Entrance:** `.wk-q` fades and rises 8 pt over 700 ms after a 500 ms delay, ease-out. It is applied to the welcome block, the eyebrow and the why line. The question h1 has none. Whether it replays on each step depends on the DC framework's re-mounting, which is not visible here.
- **Dark band at top** (L800): height 260, z 2, `linear-gradient(180deg, rgba(0,18,96,.55) 0%, rgba(0,18,96,.25) 60%, rgba(0,18,96,0) 100%)`.
- **Z-order:** world 1 (inside it, labels 9 and posts 10 + level), dark band 2, text 4, sheet 5, dial 6, bottom row 7.
- **Accent colours:** gold `#f6dfa6`, navy glass `rgba(0,22,96,.55–.72)`, sheet paper `#fbf8f2`, green `#32664d` / `#244b38`. Level colours are in §5.
- **Art:**
  - The prototype uses the square overlook at 1300 x 1300 world units at world (0, 420), over a 1720-tall world with a sky gradient above it.
  - The source prints are in `~/Pictures/Symphony scenery/`: `overlook-square-original.png` 1932², `overlook-square-3x.png/.jpg` 5796², `overlook-tall-original.png` 1125 x 2000, `overlook-tall-3x.*` 3375 x 6000.
  - The spec says to build against the square overlook now, with the same zoom-in descent, and to swap in a tall ~3000 x 9000 painting later (spec L191–199). Express `BAND` and column x as **fractions of the image** (§3, §4) so the art can be swapped.
- **User selection** is disabled on the stage (L47).

## 15. Everything else, and prototype shortcuts

**Other behaviour a rebuild needs:**
- **Accessibility labels:**
  - Orb: `Hold to begin` (step 0), else `Hold and speak to plant a flag; tap for more`.
  - Points: their label.
  - Area labels: name with `aria-pressed` (kept on ground, focused otherwise).
  - Banners: `<Level>: <text>`, plus `, tap to focus` (parent level) or `, tap to move or pull up` (own level).
  - Examples: `Example: <t>, tap to make it yours`.
  - Live flag region: `aria-live="polite"`.
  - The spec defers a full VoiceOver path (spec L316–317).
- **Long-press context menu and touch callout** are suppressed on the orb (`onContextMenu` preventDefault, `-webkit-touch-callout: none`, `touch-action: none`).
- **Area label taps** are only active on Year. Elsewhere they are inert (cursor default).
- **Parent focus is per step and remembered** when going back and forth.
- **Max 3 items per level** through speech and examples (`nextLine` L403, L629, L694). The spec does not state this limit, so confirm it.
- **Column re-flow:** when columns appear or disappear (keep, Move to an un-kept area, the first Other item), labels glide over 700 ms, but post groups have no left/top transition and jump.
- **Ground hides "Other" items.** If you go back to ground after planting, unareaed goals are hidden there.

**Prototype shortcuts that must be replaced:**
1. Speech is fake. `script()` (L229–236) supplies canned lines and the hold "types" them at 55 ms/char. Replace with on-device speech (the TellSheet path) with live partial results.
2. Type it is fake. It auto-types the canned line at 85 ms/char. Replace with a real one-line text entry.
3. Area classification is fake. The canned `a` tags stand in. Replace with a keyword or on-device classifier (§6).
4. Day extraction and filler tidying are absent. The canned `d` tags stand in. Use `CaptureParser`.
5. Custom area names are canned (`Creative work`, `Faith`, `Learning`).
6. Dates and period names are hardcoded (Feb 28, November, the 30th, Sun 15, Friday 13 November). Compute them using the boundary rule.
7. The Today sheet is hardcoded: the date, the Dentist "next" card, and the four to-dos with their "for" lines. Bind to real tasks, Apple Calendar via EventKit (asked at the Today step per spec L235–237, not in the prototype), and the walk's lineage.
8. There is no persistence, save or resume, and no writes to goals, tasks or areas. Items store neither a parent link nor ids. Store the parent at plant time (the focused parent), plus `area_id` / `goal_areas`.
9. "Walk another one down" always uses Year goal #0 and reseeds from the script if empty.
10. Sounds are synthesized and there are no haptics.
11. Undo covers only the last plant on the same step, for 7 s. The spec wants last-action undo throughout.
12. The prototype stays stuck after Type it with no lines left (§8).
13. Index-based focus and selection break after deletions (§10).
14. The welcome point is labelled `Whole year`; the spec calls it "Plan my whole year". "Just today" exists only in the prototype.
15. Dead code (§ "Which variant"): `makeFlag`, `place()`, `SLOTS`, `GHOSTS`, `MIST`, `estH`, `.wk-plant`, `.wk-ghost-flag`.
