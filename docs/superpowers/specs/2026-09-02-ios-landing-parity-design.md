# iOS landing-page parity — design

Date: 2026-09-02
Branch: `ios-sliders` (the only branch Xcode Cloud builds)
Status: approved in conversation, ready for an implementation plan

## Goal

Make the iOS app look like www.symphony-os.com and deliver the four promises
its Mobile card makes:

1. Quick-add tasks in seconds
2. Day view with everything you need
3. Context surfaces the moment you need it
4. Snap the paper plan — it lands placed

Promises 1 and 2 already exist (capture bar, dock "+", Today with time-of-day
sections and carried-over). Promise 3 is the real gap: notes, links, phone,
source, and per-kid child items are synced to the phone but never rendered
on the row. Promise 4 exists only as a single-task scan (`scan-to-task`);
the web's page-from-paper (`parse-page`) places many items and iOS has no
equivalent.

Out of scope: a This Week screen, a Library screen, dark mode, moving the
web app onto the landing kit.

## Findings that shape the design

- The iOS app bundles **no font files**. `Typography.swift` references
  Instrument Serif and Satoshi, which are not in the bundle, so every screen
  renders in San Francisco today. Bundling fonts is a prerequisite for any
  restyle.
- Landing kit (`landing/index.html` `:root`): ground `#FAF7F2`, deep
  `#F0EBE3`, warm `#F5EFE7`; text `#2C2520` / `#6B5E54` / `#9B8E84` /
  `#BEB3A9`; amber `#D97706` (bg `#FEF3C7`); blue `#2563EB` (bg `#DBEAFE`);
  green `#059669` (bg `#D1FAE5`); card `#FFFFFF` with border `#E8E0D8`,
  shadow `rgba(44,37,32,0.06)`; radii 16 / 10 / 6. Headings Crimson Pro 400
  with amber italics; body DM Sans. Primary button is ink (`#2C2520`) with
  white text; secondary is a cream pill with a border.
- The hero mock ("With Symphony") renders two row densities: a plain row
  (time · dot · title · check circle) and a **block** (amber left rail, small
  time, serif title, source pill top-right, one italic serif note line,
  child items as check-circle rows with a member chip).
- iOS `TimelineViewModel` drops every subtask (`parentTaskId != nil`).
- iOS `SymphonyTask` lacks `scope`, `capture_id`, and `week_start`; the
  SyncEngine pull is `.select()` (all columns), so adding them is a model +
  `RowMapper` change, not a query change.
- Web `parse-page` contract: body `{storagePath, placeStart, placeEnd, today,
  members:[{id,name}]}`; window is `PLAN_WINDOW_DAYS = 14` days from today;
  response echoes `window` and returns `items` (title, placement
  date|week|inbox, assigneeId, note), `notes`, `unclear`. Commit maps
  placement → `scheduled_for` all-day, or `bucket='week'` + `week_start`, or
  `bucket='inbox'`; unassigned items default to the current member; notes go
  to the `notes` table as type `general`; the page is filed as an
  `attachments` row. Retry re-invokes with the already-uploaded path.

## Section 1 — Tokens and fonts

**Fonts.** Add static TTFs to `apple/SymphonyOS/SymphonyOS/Resources/Fonts`:
Crimson Pro Regular, Italic, SemiBold; DM Sans Regular, Medium, SemiBold.
Both are SIL Open Font License (Google Fonts). Register them via
`UIAppFonts` in `project.yml` (`info.properties`) so xcodegen writes the
plist; delete `FontLoader` (runtime registration is unnecessary once the
plist lists them).

**Typography.swift.** Keep the existing names so call sites don't move:

| name | face | size |
|---|---|---|
| displayLarge | CrimsonPro-Regular | 34 |
| displayMedium | CrimsonPro-Regular | 24 |
| displaySmall | CrimsonPro-SemiBold | 18 |
| displayItalic (new) | CrimsonPro-Italic | 14 |
| bodyLarge / Medium / Small | DMSans-Regular | 17 / 15 / 13 |
| *Bold variants | DMSans-SemiBold | same |
| captionText / captionBold | DMSans-Regular / Medium | 11 |
| eyebrow (new) | DMSans-Medium, tracking 1.2, uppercase | 11 |

The 48 raw `.font(.system(...))` calls are migrated to these styles. SF
Symbols keep their own sizing.

**NordicColors.swift.** Same token names, landing values:

| token | value |
|---|---|
| bgBase / bgElevated / bgSurface | #FAF7F2 / #FFFFFF / #F0EBE3 |
| bgWarm (new) | #F5EFE7 |
| textPrimary / textSecondary / textTertiary | #2C2520 / #6B5E54 / #9B8E84 |
| textLight (new) | #BEB3A9 |
| primaryTint | #D97706 (amber) |
| primaryLight | #F59E0B |
| accentBg (new) | #FEF3C7 |
| ink (new) | #2C2520 — primary buttons, active dock tab |
| infoBlue / infoBlueBg (new) | #2563EB / #DBEAFE |
| successGreen / successGreenBg (new) | #059669 / #D1FAE5 |
| cardBorder (new) | #E8E0D8 |
| cardShadow (new) | rgba(44,37,32,0.06) |

Context colors (work/family/personal) and member colors stay; coaching
tints map to amber/accentBg. `CardStyle.swift` becomes: white fill, 1px
`cardBorder`, radius 16, `cardShadow` radius 8 y 2. Light appearance only.

## Section 2 — Screen pass

All screens pick up the tokens automatically. Specific changes:

- **Today masthead.** "Today" in `displayLarge`; date in `bodySmall`
  `textTertiary`; search and day arrows in `textSecondary`. Section titles
  (Morning / Afternoon / Evening / All day) render as `eyebrow` in
  `textTertiary`, like MORNING on the landing.
- **Dock.** Cream bar (`bgBase` 0.97) with a `cardBorder` hairline; active
  tab `ink`, inactive `textTertiary`; the "+" is an `ink` circle with white
  glyph and `cardShadow`.
- **Inbox, Projects, More, Settings, Routines, Contacts.** Rows become white
  cards per `CardStyle`; list headers use `eyebrow`; primary buttons are
  ink pills, secondary are cream pills with `cardBorder`.
- **Detail sheets** (task, event, project, routine). Titles in
  `displayMedium`; section labels `eyebrow`; inputs on `bgSurface`.
- **SlideRow actions.** Complete = `successGreen`; Push = `primaryTint`;
  Context / Skip = `textSecondary`; More / Details = `infoBlue`.
- **Capture bar.** White card, `cardBorder`, camera glyph `textSecondary`,
  submit `ink`.

## Section 3 — The block card

`TimelineItemCard` chooses one of two layouts per item.

**Plain row** — when the item has no context. Time (`captionText`,
`textTertiary`, fixed 44pt column), a 6pt dot in the context color, title
(`bodyMedium`), trailing check circle (`textLight` stroke; filled green when
completed). Background `bgSurface`, radius 10, no border.

**Block** — when the item has any of: notes, links, phoneNumber, location
with directions, one or more child items, or a source. Layout, top to
bottom, inside a white `CardStyle` card with a 3pt `primaryTint` left rail:

1. Header: time (`captionText` `textTertiary`) left; source pill right.
2. Title in `displaySmall`, `textPrimary`, two lines max.
3. Note line: first line of `notes` in `displayItalic`, `textSecondary`,
   two lines max. Omitted when notes are empty.
4. Child rows: one per subtask, each a check circle + member chip (member
   color at 0.15 fill, name in `captionBold`) + title in `bodySmall`.
   Tapping the circle completes that child through the normal task
   completion path. Completed children strike through.
5. Context row: small `textSecondary` icons for link (opens SafariView),
   phone (`tel:`), directions (Maps with `locationPlaceId` or address).
   Omitted when none apply.

**Source pill** (`captionBold`, radius 6, 2×8 padding):

| condition | text | colors |
|---|---|---|
| task has `captureId` | From an email | accentBg / primaryTint |
| item type is event | From the calendar | infoBlueBg / infoBlue |
| task `scope` is couple or compound and no capture | Shared | accentBg / primaryTint |
| otherwise | none | |

**Data changes.**

- `SymphonyTask` gains `scope: String?`, `captureId: UUID?`,
  `weekStart: Date?`; `RowMapper.taskFromRow` reads `scope`, `capture_id`,
  `week_start`; the push serializer writes `week_start` (needed by Section
  4) and never writes `capture_id` or `scope` from the phone.
- `TimelineItem` gains `notes: String?`, `links: [TaskLink]`,
  `phoneNumber: String?`, `locationPlaceId: String?`, `source: Source?`,
  `children: [ChildItem]` where `ChildItem = {id, title, completed,
  assignedTo: [UUID]}`.
- `TimelineViewModel` no longer skips subtasks outright. It indexes subtasks
  by `parentTaskId`; a subtask whose parent is on the day attaches to that
  parent as a child (in `created_at` order). A subtask whose parent is not
  on the day keeps the current behavior (excluded). This preserves the
  documented iOS/web divergence for orphan-dated subtasks rather than
  widening it.
- Swipe and tap behavior are unchanged: left swipe completes the parent,
  right swipe reveals actions, tap opens the detail sheet.

## Section 4 — Paper snap

Replaces "Scan document" in the dock "+" sheet with **Snap a page**. The
photo-capture path (`analyze-capture`, one object → one task) is untouched.

**Flow.**

1. User taps Snap a page → `DocumentScanner` (existing) or camera.
2. JPEG is uploaded to the `attachments` bucket at
   `{userId}/pages/{uuid}.jpg` (mirrors the web's page location).
3. Invoke `parse-page` with `{storagePath, placeStart: today,
   placeEnd: today+13, today, members}` where members come from the local
   `FamilyMember` store. Window length is a single constant
   `PageParse.windowDays = 14` with a comment naming `PLAN_WINDOW_DAYS` in
   `src/lib/planParse.ts` as its twin.
4. Validate the response the way `src/lib/pageParse.ts` does: cap items,
   notes (20), unclear (20); clamp lengths; a placement date outside the
   echoed window falls back to `week`; an assignee not in the member set
   becomes nil.
5. `PageReviewSheet` (new, replaces `ScanReviewSheet`): thumbnail; a list of
   items, each with an editable title, a placement chip (a day from the
   echoed window, This week, or Inbox) and an assignee chip; a Notes group;
   an "Couldn't read" group listing unclear lines. Buttons: Add all, Cancel.
6. Commit, all through the local SwiftData + `PendingChange` queue so the
   rows are shielded from reconcile and survive offline:
   - date → `scheduledFor` at local midnight, `isAllDay = true`
   - week → `bucket = "week"`, `weekStart` = the current week anchor
     (respecting the household's week-start day, read from the same source
     the web's `readCadenceConfig` uses; if that setting is not on the
     phone, default Monday and note it)
   - inbox → `bucket = "inbox"`
   - `assignedTo` = named member, else the current user's member id
   - `context = nil` (a capture never stamps the lens)
   - `notes` = item note
   - each page note → a `notes` row of type `general`
   - one `attachments` row pointing at the page, `entity_type = task`,
     `entity_id` = first created task
7. Parse failure keeps the uploaded path and shows Retry, which re-invokes
   without re-uploading. Commit failures are counted and reported; the page
   is never deleted.

**Not done on the phone:** deleting the page after commit (web doesn't
either), editing placement after commit (use the task's own detail sheet).

## Testing

Unit (XCTest, `SymphonyOSTests`):

- Font resolution: every name in `Typography.swift` resolves to a non-system
  `UIFont` (guards against the silent-fallback bug this work uncovered).
- `TimelineViewModel`: a subtask attaches to its on-day parent; an orphan
  subtask is excluded; child order is by `created_at`.
- Source-pill derivation table.
- `PageParse` validation: window clamp, member fallback, caps.
- Placement → task-field mapping for date, week, inbox, with week-start
  anchoring on a known date.

UI / visual:

- Simulator build; reuse the `CarriedOverUITests` sign-in + screenshot
  harness (test account `symphonytest4444@gmail.com`) to capture Today,
  Inbox, the dock, a block card with children, and the review sheet. I
  look at every screenshot before claiming done.
- On-device check of swipe on Scott's phone via TestFlight for the restyled
  `SlideRow` (iOS 27 gesture arbitration has bitten before).

## Sequencing (each a shippable checkpoint)

1. Fonts + tokens + `CardStyle` + dock + masthead (Sections 1–2).
2. Model/mapper additions + `TimelineItem` enrichment + block card
   (Section 3).
3. Paper snap (Section 4).

## Risks

- xcodegen must regenerate the project after adding fonts and the plist
  key; a stale `.xcodeproj` ships no fonts and no error.
- `week_start` must exist as a column on `tasks` (it does; the web writes
  it) — the push serializer must only send it when set.
- SlideRow gesture tuning must not change; only tints do.
