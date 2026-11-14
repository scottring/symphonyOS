# iPhone Light Version, Step 1: Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put in place everything the light iPhone app needs that does not depend on design: a household-level light/full edition enforced on the server, the web holding page, open signup, in-app account deletion, Apple Calendar on the phone, and the light app with non-light features hidden.

**Architecture:** `households.edition` ('light' | 'full') is the single source of truth. The server refuses AI for light households inside `reserve_ai_budget`, the one function every paid AI call already passes through. Clients only *read* the edition (web via `my_edition()`, iPhone via the synced household row) to decide what to show; hiding is never the enforcement. Account deletion is a service-role SQL function plus one edge function. Apple Calendar is a second calendar source behind a small feed that picks Google (full) or Apple (light).

**Tech Stack:** Supabase (Postgres RLS, Deno edge functions), React 19 + TypeScript + Vitest (web), SwiftUI + SwiftData + EventKit + Swift Testing (iPhone, `apple/SymphonyOS`).

**Spec:** `docs/superpowers/specs/2026-11-13-iphone-light-version-design.md` (read it first, fully; this plan implements item 1 of its "Order of work"). The walk, Today/Week designs, Plus early access and the App Store listing are later plans.

**One plan, five parts.** The parts (edition, web, iPhone edition, calendar, deletion) share only the edition interface. Each stage below ships on its own.

## Global Constraints

- Work only in `/Users/scottkaufman/.claude-worktrees/symphonyOS/ios-light-build` on branch `claude/ios-light-build`. Never edit the main worktree.
- **Nothing in this plan touches production.** Never apply a migration to the live database, deploy an edge function, push to main, or submit to the App Store. Those are Scott's approvals, collected in Task 12. SQL tests run on a local Postgres only (`127.0.0.1:55322`).
- Existing households stay **full** and must lose nothing. New households are **light**. A light user who joins a full household becomes full.
- The edition is enforced on the server. Never use a service-role client in an app to get round it.
- The light version makes no AI calls and should not cost money per user.
- Privacy and access changes are verified with real signed-in accounts (Task 12), not mocks.
- Web: imports use `@/`; no emoji, icons from `lucide-react`; never `supabase.auth.getUser()` (use `getAuthUser`). Typecheck `npx tsc -b tsconfig.app.json tsconfig.node.json`. Tests `npx vitest run <path>` (never bare `npm test`, it watches). Lint `npm run lint`. PATH must start with `$HOME/.nvm/versions/node/v22.14.0/bin`. The global test mock of `@/lib/supabase` has no `rpc`: a test for code that calls `rpc` must mock `@/lib/supabase` locally.
- iPhone: sources are in `apple/SymphonyOS/SymphonyOS` (called **R** below); tests in `apple/SymphonyOS/SymphonyOSTests`. After adding a file run `cd apple/SymphonyOS && xcodegen generate`. Run a suite with `cd apple/SymphonyOS && xcodebuild test -scheme SymphonyOS -destination 'platform=iOS Simulator,name=iPhone 17' -only-testing:SymphonyOSTests/<Suite>`. New tests use Swift Testing (`import Testing`, `@Test`, `#expect`, `@testable import Symphony`). SF Symbols, no emoji. The Mac target must still build; light is iPhone-only and the Mac sidebar is unchanged.
- Migrations get a rollback in `supabase/migrations/rollback/<name>.down.sql`.
- Commit after each task with the session's attribution lines.

## Review Focus

1. **Scott or Iris lose a feature because the edition resolves wrong** (offline, before the first sync, the migration not applied yet, the lookup failing). Expected: a full household always sees the full app. Pinned in Task 3 (lookup error shows the app) and Task 5 (`Edition.resolve` treats an unknown value as full).
2. **A light owner makes themself full** by writing `edition` directly, or by creating a second household. Expected: stays light. Pinned in Task 1.
3. **Deleting an account in a shared household destroys the partner's things** (the household itself, shared tasks, or the partner's own rows that point at the leaver's). Expected: only the leaver's private things go. Pinned in Task 9.
4. **Deletion stops halfway, or is run twice.** Expected: a failed step stops the later ones, and a retry finishes the job. Pinned in Tasks 9 and 10.
5. **Calendar access never asked, denied, or turned off later; events that cross midnight.** Expected: Today works with no events and no error, and the settings row says how to turn it on. Pinned in Tasks 7 and 8.

## Calls made in this plan (Scott to check)

- **Unknown edition on the phone.** No household row at all (a brand-new account before its first sync) reads as light. A household row with no edition value (an existing install that has not re-synced) reads as full.
- **Address search is hidden in light.** It calls Google Places through `places-proxy`, which costs money per use. Light keeps the plain location text field.
- **Everything is "personal" in light.** With no work/family/personal switcher, new tasks get `personal` and the life-area question never appears.
- **Account deletion in a shared household.** Shared items pass to the longest-standing other member, who becomes the owner if the leaver was. Photos and files the leaver uploaded go with them, even on shared items. AI spend records (amounts only, no content) are kept.
- **Open signup is applied last**, when the light build is ready for strangers. Until then signup stays invite-only.
- **The web holding page has no App Store link** until the listing exists.

## Found while planning, not in the spec

- The iPhone app has **no password reset**. A stranger who forgets a password is stuck. Worth adding before launch.
- Whether new accounts must **confirm their email**, and what that email links to, was not checked. A stranger tapping it on a computer lands on the web holding page.
- The iPhone app has **no life-area model** (`goal_areas`, `area_id`). The walk needs it; it belongs in the walk's plan.
- `places-proxy`, `fetch-recipe` and `send-push` have **no caller check** in code today. Not changed here.

---

## Stage A: the edition on the server

### Task 1: Database: household edition, self-upgrade guard, `my_edition()`, AI refusal

**Files:**
- Create: `supabase/migrations/20261113150000_household_edition.sql`
- Create: `supabase/migrations/rollback/20261113150000_household_edition.down.sql`
- Create: `supabase/tests/106_household_edition.test.sql`
- Create: `supabase/tests/run-local.sh` (generalises `run-102.sh`: `run-local.sh <migration.sql> <test.sql>`, same refusal of any non-local DB)

**Interfaces:**
- Produces: `households.edition text not null default 'light' check (edition in ('light','full'))`, every existing row `'full'`.
- Produces: trigger `households_edition_guard` (before insert or update on `public.households`, function `public.guard_household_edition()`).
- Produces: `public.my_edition() returns text` (`'full'` or `'light'`), executable by `authenticated` only.
- Produces: `public.reserve_ai_budget(...)` (same seven-argument signature) returns `{"allowed": false, "reason": "light_edition"}` for a light household.

- [ ] **Step 1: Write the failing SQL test** `106_household_edition.test.sql` in the style of `105_household_for_every_account.test.sql` (`begin … rollback`, users inserted into `auth.users`, role switched with `set local role authenticated` and `set_config('request.jwt.claims', …)`). The claims JSON must carry `"role":"authenticated"` as well as `"sub"`, because the guard reads the JWT role. Assertions:
  - With no JWT context, `insert into households(owner_id)` gives `edition = 'light'`; `insert … edition = 'full'` gives `'full'`; `edition = 'pro'` violates the check.
  - As signed-in user A: inserting a household with `edition = 'full'` reads back `'light'`.
  - As A, owner of a light household: `update households set edition = 'full'` leaves `'light'`, and `update … set name = 'X'` in the same statement still changes the name.
  - With no JWT context: `update … set edition = 'full'` works (this is how Plus, and Scott by hand, will flip a household).
  - `my_edition()` as A (only a light household) = `'light'`; as F (active member of a full household) = `'full'`; as A after A becomes an active member of F's household = `'full'`; a `pending` membership in a full household does not count.
  - `reserve_ai_budget(A, 'symphony-agent', 'claude-sonnet-5-5', 100, 100)` returns `reason = 'light_edition'` and inserts no row in `ai_budget_reservations` or `ai_provider_call_usage`. For F the `reason` is distinct from `'light_edition'`.
  - As `authenticated`, `select has_function_privilege('anon', 'public.my_edition()', 'execute')` is false.
- [ ] **Step 2: Run it.** `sh supabase/tests/run-local.sh supabase/migrations/20261113150000_household_edition.sql supabase/tests/106_household_edition.test.sql`. Expected: FAIL (migration file empty or column missing). If no local Postgres is listening on 55322, use the throwaway-cluster approach in `scripts/test-choices-rls.mjs`. Never run against the live project.
- [ ] **Step 3: Write the migration.**
  - Column: `add column edition text not null default 'full' check (edition in ('light','full'))`, then `alter column edition set default 'light'`. That order is what makes existing rows full and new rows light.
  - `guard_household_edition()` (plpgsql, not security definer): only when `coalesce(auth.role(), '') in ('authenticated', 'anon')`, on insert set `new.edition := 'light'`, on update set `new.edition := old.edition`. It never raises, so a client that sends a stale `edition` with another change still saves the other change.
  - `my_edition()`: `sql stable security definer set search_path = ''`; `'full'` when the caller has an `active` membership in a household whose `edition = 'full'`, otherwise `'light'`. `revoke all … from public, anon; grant execute … to authenticated`.
  - `reserve_ai_budget`: copy the function verbatim from `20261111120000_ai_budget_minutes_cache_household.sql:29-74` and add, directly after `hh := public.ai_household_of(p_user);`:
    ```sql
    if (select h.edition from public.households h where h.id = hh) = 'light' then
      return jsonb_build_object('allowed', false, 'reason', 'light_edition');
    end if;
    ```
    Keep its existing `revoke`/`grant` lines (service_role only).
  - Rollback: restore `reserve_ai_budget` from `20261111120000`, drop `my_edition`, the trigger, its function and the column.
- [ ] **Step 4: Run the test.** Expected: every assertion passes.
- [ ] **Step 5: Commit.** `git add supabase/migrations/20261113150000_household_edition.sql supabase/migrations/rollback/20261113150000_household_edition.down.sql supabase/tests/106_household_edition.test.sql supabase/tests/run-local.sh && git commit -m "Household edition: light or full, guarded, and AI refuses light households"`

### Task 2: Edge functions: say the light refusal plainly

**Files:**
- Modify: `supabase/functions/_shared/aiUsage.ts:71-92` (`AiUsageError`)
- Test: `supabase/functions/_shared/aiUsage.test.ts`

**Interfaces:**
- Consumes: `reserve_ai_budget` reason `'light_edition'` (Task 1).
- Produces: `new AiUsageError('light_edition')` has `status === 403`, `code === 'ai_light_edition'`, and the message `AI features come with Symphony Plus, which is on its way. You can still view and change your plans directly.` Every function that already returns `{ error, code, retry_at }` from an `AiUsageError` carries it with no further change.

- [ ] **Step 1: Write the failing tests** in `aiUsage.test.ts`, beside the existing `daily_limit` refusal test and using its fake db:
  - `new AiUsageError('light_edition')`: the three values above.
  - `guardedAiFetch` with a db whose `reserve_ai_budget` answers `{ allowed: false, reason: 'light_edition' }` rejects with that error and never calls the transport.
  - The existing reasons are unchanged: `daily_limit` is still 429 `ai_daily_limit`, an unknown reason is still 503 `ai_usage_unavailable`.
- [ ] **Step 2: Run** `npx vitest run supabase/functions/_shared/aiUsage.test.ts`. Expected: the new cases FAIL.
- [ ] **Step 3: Add the `light_edition` branch** to the `AiUsageError` constructor (message, status and code as above).
- [ ] **Step 4: Run the file again.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "AI guard: a light household gets a plain 403, not 'usage controls are not ready'"`

---

## Stage B: the web

### Task 3: Web: light accounts see one holding page

**Files:**
- Create: `src/lib/edition.ts`, `src/components/edition/EditionGate.tsx`, `src/components/edition/LightHoldingPage.tsx`
- Test: `src/components/edition/EditionGate.test.tsx`
- Modify: `src/main.tsx:189` (`cutoverShell`), `:200` (`/getting-started`), `:262-265` (`/paper/phone/:id`)

**Interfaces:**
- Consumes: `my_edition()` (Task 1).
- Produces: `type Edition = 'light' | 'full'`; `loadEdition(): Promise<Edition | null>` (null on any error or unexpected value); `<EditionGate user signOut>{children}</EditionGate>`; `<LightHoldingPage email onSignOut />`.

- [ ] **Step 1: Write the failing tests** in `EditionGate.test.tsx`, mocking `@/lib/supabase` locally with an `rpc` spy (pattern: `src/components/setup/FirstRunGate.test.tsx`):
  - `rpc` answers `'light'`: the holding page heading shows, `APP` does not.
  - `rpc` answers `'full'`: `APP` shows.
  - `rpc` returns an error, rejects, or answers something else: `APP` shows (the server is the enforcement; a failed lookup must never lock a full household out).
  - `user.is_anonymous` (a paired wall display): `APP` shows and `rpc` is not called.
  - After one `'full'` answer for a user, a second mount shows `APP` immediately without waiting on `rpc`.
  - On the holding page, the "Sign out" button calls `signOut`.
- [ ] **Step 2: Run** `npx vitest run src/components/edition/EditionGate.test.tsx`. Expected: FAIL (modules missing).
- [ ] **Step 3: Implement.**
  - `loadEdition` calls `supabase.rpc('my_edition')`.
  - `EditionGate` shows "Loading..." while checking (as `FirstRunGate` does). It remembers only a `'full'` answer, in `localStorage` under `symphony.edition.full.<userId>`; a light answer is never cached, so an upgrade shows on the next load.
  - `LightHoldingPage` copies the `AuthForm` page shell (`min-h-screen bg-bg-base flex flex-col items-center justify-center px-6 py-12` › `w-full max-w-md` › `/symphony-logo.png` › `card p-8`). Exact copy: heading "Symphony is on iPhone for now"; "Your account is ready. Open Symphony on your iPhone to plan your year, your week and today."; "Symphony on the web comes with Symphony Plus, which is on its way."; "Signed in as {email}" and a "Sign out" button. No App Store link yet.
- [ ] **Step 4: Wire it into `main.tsx`.** The gate goes *outside* `FirstRunGate`, so a light account never sees web onboarding: `<AuthGate>{({ user, signOut }) => <EditionGate user={user} signOut={signOut}><FirstRunGate user={user}><Shell /></FirstRunGate></EditionGate>}</AuthGate>`. Wrap `/getting-started` and `/paper/phone/:id` the same way. Leave `/join/:token` ungated: accepting an invite is how a light account becomes full, and the page it lands on afterwards re-checks.
- [ ] **Step 5: Run** the test file, `npx tsc -b tsconfig.app.json tsconfig.node.json` and `npm run lint`. Expected: all clean.
- [ ] **Step 6: Look at it.** Run the app, render the holding page (temporarily force `'light'` in the browser), and check it on a desktop width and a narrow phone width. Remove the forcing.
- [ ] **Step 7: Commit.** `git commit -m "Web: a light account sees one page, Symphony is on iPhone for now"`

### Task 4: Open signup to everyone

**Files:**
- Create: `supabase/migrations/20261113170000_open_signup.sql`, `supabase/migrations/rollback/20261113170000_open_signup.down.sql`
- Create: `supabase/tests/108_open_signup.test.sql`
- Modify: `src/components/settings/SettingsPage.tsx:712` (copy)

**Interfaces:**
- Produces: `public.signup_allowed(p_email text) returns boolean` is true for any non-blank email. The live trigger `check_signup_allowed` on `auth.users` (function `check_allowed_signup`) is left in place: it calls `signup_allowed`, so it now lets everyone through and still skips anonymous display users. Web `useAuth` and iPhone `AuthService` both pre-check `signup_allowed`, so they need no change, and older app builds keep working.

- [ ] **Step 1: Write the failing SQL test** `108_open_signup.test.sql`: `signup_allowed('stranger@example.com')` is true; `signup_allowed('')`, `signup_allowed('   ')` and `signup_allowed(null)` are false; `anon` can still execute it; inserting a new non-anonymous `auth.users` row for a stranger leaves them with one active membership in a household whose `edition = 'light'` (run with the Task 1 migration applied first in the same transaction).
- [ ] **Step 2: Run it** with `run-local.sh`. Expected: FAIL on the stranger email.
- [ ] **Step 3: Write the migration:** `create or replace function public.signup_allowed(p_email text)` returning `length(trim(coalesce(p_email, ''))) > 0`, keeping `security definer` and a pinned `search_path`. The rollback restores the body from `20261015130000_signup_allowed_invited.sql:10-31` verbatim.
- [ ] **Step 4: Run the test.** Expected: PASS.
- [ ] **Step 5: Fix the admin copy** at `SettingsPage.tsx:712` to "Signup is open to everyone. These are the people who asked for an invite before it opened." Run that page's existing tests.
- [ ] **Step 6: Commit.** `git commit -m "Signup opens to everyone (migration prepared, applied last)"`

---

## Stage C: the light iPhone app

### Task 5: iPhone: know the edition

**Files:**
- Create: `R/Models/Edition.swift`
- Modify: `R/Models/Household.swift` (add `var edition: String? = nil`), `R/Services/SyncEngine/RowMapper.swift:287-299` (`householdFromRow` reads `edition`), `R/App/AppState.swift`, `R/App/MainView.swift`
- Test: `SymphonyOSTests/EditionTests.swift`, `SymphonyOSTests/SyncSerializationTests.swift`

**Interfaces:**
- Produces:
  ```swift
  enum Feature: CaseIterable {
      case routines, projects, lists, contacts, dinner, spaces, people,
           paperCapture, photoCapture, googleCalendar, placeSearch
  }
  enum Edition: String {
      case light, full
      static func resolve(_ householdEditions: [String?]) -> Edition
      func allows(_ feature: Feature) -> Bool
      var assumedLifeArea: String? { get }   // light: "personal"; full: nil
  }
  extension AppTab { static func visible(in edition: Edition) -> [AppTab] }
  ```
  and `AppState.edition: Edition`.

- [ ] **Step 1: Write the failing tests** in `EditionTests.swift`:
  - `resolve([])` is `.light`; `resolve(["light"])` is `.light`; `resolve(["full"])`, `resolve([nil])`, `resolve(["light", "full"])` and `resolve(["something-new"])` are `.full`.
  - `.light` allows no `Feature` (loop `Feature.allCases`); `.full` allows all.
  - `AppTab.visible(in: .light) == [.planner, .inbox, .more]`; `visible(in: .full) == [.planner, .inbox, .routines, .more]`.
  - `Edition.light.assumedLifeArea == "personal"`; `.full` gives nil.
  And in `SyncSerializationTests.swift`: a households row with `"edition": "light"` maps to `edition == "light"`; a row without the key maps to nil.
- [ ] **Step 2: Run** `-only-testing:SymphonyOSTests/EditionTests`. Expected: FAIL to compile.
- [ ] **Step 3: Implement** `Edition.swift`, the model field and the mapper line. `edition` is read-only on the phone: if `SyncEngine` has a households push row, do not add `edition` to it.
- [ ] **Step 4: Publish it.** `AppState` gains `var edition: Edition = .light`. `iOSMainView` adds `@Query private var households: [Household]` and sets `appState.edition = Edition.resolve(households.map(\.edition))` on appear and whenever that list changes; when it turns light while `activeTab == .routines`, it moves to `.planner`, and it sets `appState.domainFilter = .all`. In Debug demo mode (`DemoMode.isOn`) the edition is `.full` unless the launch argument `-SymphonyLight` is present.
- [ ] **Step 5: Run** `EditionTests` and `SyncSerializationTests`. Expected: PASS.
- [ ] **Step 6: Commit.** `git commit -m "iPhone: read the household's edition"`

### Task 6: iPhone: the light dock, and non-light features hidden

**Files:**
- Modify: `R/App/MainView.swift` (`SymphonyDock` 184-275, `CaptureSheet` 314-325, `MoreView` 530-584), `R/Views/Settings/SettingsView.swift`, `R/Views/Timeline/TodayView.swift`, `R/Views/HalfOpen/HalfOpenView.swift`, `R/Views/Planner/WeekPlanView.swift`, `R/Views/Planner/PeriodPlanView.swift`, `R/Views/Planner/PlannerComponents.swift`, `R/Views/Planner/ChooserSheet.swift`, `R/Views/Planner/TriageController.swift`, `R/Views/Planner/UnfinishedSheet.swift`, `R/Views/Inbox/InboxView.swift`, `R/Views/Timeline/TodayDayColumn.swift`, `R/Views/Task/TaskDetailView.swift`, `R/Views/Capture/QuickCaptureBar.swift`
- Test: `SymphonyOSUITests/LightEditionUITests.swift`

**Interfaces:**
- Consumes: `appState.edition`, `Edition.allows(_:)`, `AppTab.visible(in:)`, `Edition.assumedLifeArea` (Task 5).

Every change is a guard on `appState.edition.allows(...)`. In a full household nothing changes.

- [ ] **Step 1: Write the failing UI test** `LightEditionUITests.swift`, launched with `-SymphonyDemo -SymphonyLight`: the dock has Planner, Inbox and More and no "Routines"; More has no "Projects", "Lists" or "Contacts"; the Add sheet has no "Snap a page". A second test launched with `-SymphonyDemo` alone finds "Routines". The tests do not type (text entry stalls the simulator, see `apple/SymphonyOS/PLANNING.md`).
- [ ] **Step 2: Run** `-only-testing:SymphonyOSUITests/LightEditionUITests`. Expected: the light test FAILS.
- [ ] **Step 3: The dock.** `SymphonyDock` takes `tabs: [AppTab]` from `AppTab.visible(in:)`. Bottom bar order: Planner, Inbox, the "+", then the rest (light: Planner · Inbox · + · More). The side column lists the same tabs under the "+".
- [ ] **Step 4: More and Settings.** `MoreView` shows each of Projects / Lists / Contacts only when its feature is allowed, and drops the section when none are. `SettingsView` hides "Family Members" without `.people` and the "Google Calendar" row without `.googleCalendar`.
- [ ] **Step 5: Today, Week, the horizons and the half-open display.**
  - `.dinner`: `TodayView` (`GlanceDinner` :243, `DinnerCard` :482) and `HalfOpenView` (`HalfOpenDinner` :148) show no dinner and do not ask `DinnerService` for one.
  - `.spaces`: no `DomainMenu` (`TodayView` :554, `WeekPlanView` :108, `PeriodPlanView` :116); no Work/Family/Personal chips in `TaskDetailView` (:142-144).
  - `.people`: no `AssigneeAvatars` (`ChooserSheet` :171, `InboxView` :250, `PlannerComponents` :333, `TodayDayColumn` :149) and no assignee chips in `TaskDetailView` (:165-172).
  - `.projects` / `.contacts`: no Project picker (:182) or Contact picker (:316) in `TaskDetailView`.
  - `.placeSearch`: `TaskDetailView.searchPlaces` (:635) returns without calling `PlacesService`; the location field stays a plain text field.
- [ ] **Step 6: Capture.** Without `.paperCapture`, `CaptureSheet` shows only the `QuickCaptureBar` (no "Snap a page", "Choose photo" or the paragraph under them). Without `.photoCapture`, `QuickCaptureBar` has no camera button (:47-58).
- [ ] **Step 7: Life area.** Where a move would present `LifeAreaSheet` (`TriageController` :43, `ChooserSheet` :135, `InboxView` :110, `UnfinishedSheet` :78), when `appState.edition.assumedLifeArea` is non-nil skip the sheet and pass that value as `lifeArea:` to `PlanWriter.move`.
- [ ] **Step 8: Run** the UI test, then the whole unit suite (`-only-testing:SymphonyOSTests`). Expected: PASS, with no existing test changed.
- [ ] **Step 9: Look at it.** In the simulator with `-SymphonyDemo -SymphonyLight`: Today, Week, Month, the Add sheet, a task's detail, More, Settings. Then once without `-SymphonyLight` to confirm the full app is as before. Check a regular iPhone upright and the Duo outside-screen size.
- [ ] **Step 10: Commit.** `git commit -m "iPhone light: Planner, Inbox, +, More; non-light features hidden"`

### Task 7: iPhone: read Apple Calendar

**Files:**
- Create: `R/Services/AppleCalendar.swift`
- Modify: `R/App/Info.plist` (add `NSCalendarsFullAccessUsageDescription`: "Show your calendar on Today, beside your to-dos. Symphony only reads it.")
- Test: `SymphonyOSTests/AppleCalendarTests.swift`

**Interfaces:**
- Produces:
  ```swift
  struct AppleEvent: Equatable {
      let id: String; let title: String; let start: Date; let end: Date
      let isAllDay: Bool; let location: String?; let declined: Bool
  }
  enum AppleCalendarAccess { case notAsked, allowed, denied }
  protocol AppleEventSource {
      var access: AppleCalendarAccess { get }
      func requestAccess() async -> Bool
      func events(from start: Date, to end: Date) -> [AppleEvent]
  }
  struct EventKitSource: AppleEventSource          // the only code that imports EventKit
  enum AppleCalendarMapper {
      static func items(_ events: [AppleEvent], on day: Date, calendar: Calendar = .current) -> [TimelineItem]
      static func entries(_ events: [AppleEvent], calendar: Calendar = .current) -> [PeriodCalendar.Entry]
  }
  @Observable @MainActor final class AppleCalendarService {
      static let shared: AppleCalendarService
      init(source: AppleEventSource = EventKitSource())
      var access: AppleCalendarAccess { get }
      func requestAccess() async
      func items(for date: Date) -> [TimelineItem]?
      func refresh(_ date: Date)
      func refreshWeek(_ weekStart: Date)
      func entries(from start: Date, to end: Date) -> [PeriodCalendar.Entry]?
      func refreshPeriod(from start: Date, to end: Date)
  }
  ```

- [ ] **Step 1: Write the failing tests** in `AppleCalendarTests.swift` (fixed dates, a fixed `Calendar`):
  - A timed event maps to one `.event` item on its day with `startTime`, `endTime`, its title, `eventKey == nil` (so a tap does not open the Google event screen) and an id starting `ekcal-`.
  - An all-day event maps with `isAllDay == true` and no start time.
  - An event from 22:00 to 01:00 appears on both days; on the second day it starts at the start of that day.
  - An event covering a whole middle day of a three-day span is all-day on that day.
  - An event ending exactly at midnight does not appear on the next day.
  - A declined event is dropped.
  - Order: all-day first, then by start, then by title. Two occurrences of one repeating event on different days get different ids.
  - `entries` gives one `PeriodCalendar.Entry` per day an all-day or multi-day event touches.
  - Service with a fake source: while `access == .notAsked`, `items(for:)` is nil and the source is never asked for events; after `requestAccess()` returns true, `refresh(day)` makes `items(for: day)` non-nil; with `.denied`, `items(for:)` is nil and nothing throws.
- [ ] **Step 2: Run** `-only-testing:SymphonyOSTests/AppleCalendarTests`. Expected: FAIL to compile.
- [ ] **Step 3: Implement.** `EventKitSource` wraps one `EKEventStore`: `access` from `EKEventStore.authorizationStatus(for: .event)` (`.fullAccess` is allowed, `.notDetermined` is notAsked, everything else denied); `requestAccess` calls `requestFullAccessToEvents()`; `events` uses `predicateForEvents(withStart:end:calendars: nil)` and sets `declined` from the current user's participant status. The service caches by day, never prompts on its own, and re-reads its cached days on `.EKEventStoreChanged`.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "iPhone: read Apple Calendar on the device (EventKit, read-only)"`

### Task 8: iPhone: one calendar feed, picked by edition

**Files:**
- Create: `R/Services/CalendarFeed.swift`
- Modify: `R/Views/Timeline/TodayView.swift:18`, `R/Views/Planner/WeekPlanView.swift:35`, `R/Views/Planner/PaperFoldView.swift:875`, `R/Views/HalfOpen/HalfOpenView.swift:18` (each `GoogleCalendarService.shared` becomes `CalendarFeed.shared`), `R/Views/Settings/CalendarSettingsView.swift`, `R/App/MainView.swift` (where `appState.edition` is set)
- Test: `SymphonyOSTests/CalendarFeedTests.swift`

**Interfaces:**
- Consumes: `AppleCalendarService` (Task 7), `GoogleCalendarService` (existing), `Edition` (Task 5).
- Produces: `@Observable @MainActor final class CalendarFeed` with `static let shared`, `var edition: Edition`, `enum Source { case google, apple }`, `static func source(for edition: Edition) -> Source`, and the same reading surface the four views use today: `items(for:)`, `isLoading(_:)`, `refresh(_:maxAge:)`, `refreshWeek(_:)`, `entries(from:to:)`, `periodFailed(from:to:)`, `refreshPeriod(from:to:maxAge:)`.

- [ ] **Step 1: Write the failing tests:** `CalendarFeed.source(for: .full) == .google`; `source(for: .light) == .apple`.
- [ ] **Step 2: Run** `-only-testing:SymphonyOSTests/CalendarFeedTests`. Expected: FAIL to compile.
- [ ] **Step 3: Implement `CalendarFeed`** as a switch on `Self.source(for: edition)` in each method. A full household behaves exactly as today (Google only). A light household never calls `google-calendar-events`. For Apple, `isLoading` and `periodFailed` are false. Set `CalendarFeed.shared.edition` in the same place `appState.edition` is set.
- [ ] **Step 4: Swap the four call sites.** No other change in those views.
- [ ] **Step 5: Calendar settings.** When the source is Apple, `CalendarSettingsView` shows one "Apple Calendar" section instead of the Google one: not asked: "See your calendar on Today too" and a button "Show my calendar" (calls `requestAccess()`); allowed: "Your Apple Calendar shows on Today and Week."; denied: "Calendar access is off." and a button "Open Settings" (`UIApplication.openSettingsURLString`). The walk's Today step will call the same `requestAccess()` later.
- [ ] **Step 6: Run** the unit suite. Then, in the simulator with `-SymphonyLight`, add an event in the Calendar app, allow access from Calendar settings, and confirm it shows on Today and Week; deny access and confirm Today still works.
- [ ] **Step 7: Commit.** `git commit -m "iPhone: Apple Calendar for light households, Google stays for full"`

---

## Stage D: account deletion

### Task 9: Database: `delete_account_data`

**Files:**
- Create: `supabase/migrations/20261113160000_delete_account_data.sql`, `supabase/migrations/rollback/20261113160000_delete_account_data.down.sql`
- Create: `supabase/tests/107_delete_account.test.sql`

**Interfaces:**
- Produces: `public.delete_account_data(p_user uuid) returns jsonb`, `security definer`, `search_path = ''`, executable by `service_role` only. Result: `{"heir": uuid|null, "households_deleted": int, "households_handed_on": int, "not_moved": [text], "display_user_ids": [uuid]}`. After it returns, `delete from auth.users where id = p_user` succeeds and takes the rest of that person's rows with it by cascade. The function does not delete the `auth.users` row itself.

The algorithm, in this order:
1. **Heir.** Among the leaver's households, oldest membership first, the first one that has another `active` member with role `owner`, `admin` or `member` (never `display`); within it pick by role (owner, admin, member), then `joined_at` nulls last, then `user_id`. No such member means `heir` is null.
2. **Detach other people's rows** from the leaver's rows, so a cascade cannot take them: reuse the three detach statements at the top of `reset_test_account` (`20261011120000_reset_test_account.sql`: `tasks.parent_task_id`, `routines.parent_routine_id`, `meal_plan_entries`).
3. **If there is an heir, hand shared things on** (`user_id := heir`), each table in its own `begin … exception when unique_violation` block; a table that conflicts is left to be deleted and named in `not_moved`:
   - rows with `scope in ('couple','compound')` in `tasks`, `notes`, `goals`, `contacts`, `routines`, `projects`, `chat_sessions`;
   - all the leaver's rows in `family_members`, `meal_plans`, `recipes`, `scratchpad_notes`, `notices`, `homes`, `kid_math_prefs`, `kid_math_problems`;
   - `goal_areas` where `context = 'family'`; `captures` where `household_id is not null`;
   - `spaces.created_by` and `assets.created_by`.
4. **Households.** For each household the leaver owns or belongs to: if another human member is active, and the leaver is `owner_id`, set `owner_id` to that household's heir and that member's role to `owner` (counted in `households_handed_on`). Otherwise collect its `household_displays.user_id` into `display_user_ids` and delete the household (`households_deleted`).
5. **Sweep what would block the delete.** For every foreign key in schema `public` that references `auth.users` with no delete action (read from `pg_constraint` at run time, `confdeltype in ('a','r')`): if the column is nullable set it to null where it equals `p_user`, otherwise delete those rows. Read at run time because the live database has 23 of these and the migrations show 19.
6. `delete from public.task_focus where user_id = p_user` (it has no foreign key).
7. AI spend tables are left alone.

A null `p_user` raises. A second call for the same user changes nothing and returns zeros.

- [ ] **Step 1: Write the failing SQL test** `107_delete_account.test.sql` (style of 105; A owns a household, B is an active member, C is alone). Seed: A's shared task (`scope = 'couple'`), A's private task, A's `family_members` rows (A's own and a child's), A's shared routine, A's private note, a `chat_sessions` row and an `evening_reflections` row for A (two of the no-action tables), and B's own task whose `parent_task_id` is A's private task. Assertions after `select delete_account_data(A)` then `delete from auth.users where id = A`:
  - The `auth.users` delete raises no foreign-key error.
  - A's shared task and shared routine exist with `user_id = B`; A's private task and private note are gone.
  - Both `family_members` rows exist with `user_id = B`.
  - The household exists with `owner_id = B`, B's role is `owner`, and A has no membership.
  - B's own task still exists with `parent_task_id` null.
  - Acting as B (role and claims set): B can select the shared task, and selects zero of A's former private rows.
  - For C: the result has `households_deleted = 1`, `heir` null, and C's household is gone after C's `auth.users` row is deleted.
  - As `authenticated`, calling `delete_account_data` fails with `42501`.
  - Calling it a second time for A raises nothing.
- [ ] **Step 2: Run it** with `run-local.sh`. Expected: FAIL (function missing).
- [ ] **Step 3: Write the migration** to the algorithm above; `revoke all … from public, anon, authenticated; grant execute … to service_role`. The rollback drops the function.
- [ ] **Step 4: Run the test.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "Account deletion: shared things pass on, private things go, nothing blocks the delete"`

### Task 10: Edge function: `delete-account`

**Files:**
- Create: `supabase/functions/delete-account/handler.ts`, `supabase/functions/delete-account/index.ts`
- Test: `supabase/functions/delete-account/handler.test.ts`
- Modify: `supabase/config.toml` (add `[functions.delete-account]` with `verify_jwt = true`)

**Interfaces:**
- Consumes: `delete_account_data` (Task 9).
- Produces: `POST /functions/v1/delete-account`, caller's JWT, JSON body `{"confirm": "delete my account"}`. Answers `200 {"ok": true}`, or `{ "error", "code", "step"? }` with: 401 no or bad token; 403 `not_a_person` for an anonymous display session; 400 `confirm_required`; 405 for other methods; 500 `delete_failed` with `step` one of `files`, `data`, `auth`.
  ```ts
  export interface DeleteAccountDeps {
    userFor(authorization: string): Promise<{ id: string; isAnonymous: boolean } | null>
    removeFiles(userId: string): Promise<void>
    deleteData(userId: string): Promise<{ display_user_ids: string[] }>
    deleteAuthUser(userId: string): Promise<void>
  }
  export async function handleDeleteAccount(req: Request, deps: DeleteAccountDeps): Promise<Response>
  ```

- [ ] **Step 1: Write the failing tests** in `handler.test.ts` (vitest, fake deps that record call order; pattern: `supabase/functions/workspace-voice/handler.test.ts`):
  - No `Authorization` header: 401 and no dep is called. `userFor` returns null: 401 and nothing else is called.
  - Anonymous user: 403 `not_a_person`, nothing removed.
  - Missing or wrong `confirm`: 400 `confirm_required`, nothing removed. A `GET`: 405.
  - Happy path: calls happen in the order `removeFiles(user)`, `deleteData(user)`, `deleteAuthUser` for each returned display id, `deleteAuthUser(user)`; answer 200 `{ ok: true }`.
  - `removeFiles` throws: 500 with `step: 'files'`; `deleteData` and `deleteAuthUser` are not called.
  - `deleteData` throws: 500 with `step: 'data'`; `deleteAuthUser` is not called.
  - `deleteAuthUser(user)` throws: 500 with `step: 'auth'`.
  - `OPTIONS` answers with the CORS headers the other functions use.
- [ ] **Step 2: Run** `npx vitest run supabase/functions/delete-account/handler.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement `handler.ts`,** then `index.ts` with the real deps: `userFor` with an anon-key client carrying the caller's header (as `suggest-waiting-for/index.ts:107-120`); the other three with a service-role client. `removeFiles` walks every object under `<userId>/` in the `attachments` and `asset-photos` buckets (folders are list entries with a null `id`; recurse) and removes them in batches of 100. `deleteData` calls `rpc('delete_account_data', { p_user })`. `deleteAuthUser` calls `auth.admin.deleteUser`.
- [ ] **Step 4: Run the tests** and `npm run lint`. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "delete-account: files, then data, then the sign-in, stopping at the first failure"`

### Task 11: iPhone: Delete account in Settings

**Files:**
- Create: `R/Services/AccountDeletion.swift`, `R/Views/Settings/DeleteAccountView.swift`
- Modify: `R/Views/Settings/SettingsView.swift` ("Account" section), `R/Services/AuthService.swift`, `R/App/SymphonyApp.swift:34-51`, `R/App/ContentView.swift`, `R/App/AppState.swift`
- Test: `SymphonyOSTests/AccountDeletionTests.swift`

**Interfaces:**
- Consumes: `POST delete-account` (Task 10).
- Produces:
  ```swift
  enum AccountDeletion {
      static let confirmPhrase = "delete my account"
      static func warning(sharesHousehold: Bool) -> String
      static func sharesHousehold(members: [FamilyMember], me: UUID?) -> Bool
      static func wipe(_ container: ModelContainer) throws
      static func run(container: ModelContainer, auth: AuthService, stopSync: () async -> Void) async throws
  }
  extension SymphonyApp { static let modelTypes: [any PersistentModel.Type] }   // the one list, used by .modelContainer and by wipe
  extension AuthService { func forgetSession() async }   // local sign-out; succeeds even though the server no longer knows the user
  ```
  and `AppState.stopSync: (() async -> Void)?`, set by `ContentView`.

- [ ] **Step 1: Write the failing tests** in `AccountDeletionTests.swift`:
  - `warning(sharesHousehold: false)` is exactly "This deletes your Symphony account and everything in it: your goals, tasks, notes and photos. It can't be undone."
  - `warning(sharesHousehold: true)` is that sentence followed by " Things you share with your household stay with them."
  - `sharesHousehold` is true when another member has a non-nil `authUserId` different from `me`; false with only me, with only members who have no sign-in (children), and with `me == nil`.
  - `wipe`: an in-memory container holding a `SymphonyTask`, a `Goal`, a `Household`, a `FamilyMember` and a `PendingChange` has none of them afterwards.
- [ ] **Step 2: Run** `-only-testing:SymphonyOSTests/AccountDeletionTests`. Expected: FAIL to compile.
- [ ] **Step 3: Implement.** `run` does, in order: invoke `delete-account` with `["confirm": confirmPhrase]` (a failure throws and nothing local changes); `await stopSync()`; `wipe(container)`; `await auth.forgetSession()`. `forgetSession` uses `supabase.auth.signOut(scope: .local)` and clears `currentUser` whatever the result.
- [ ] **Step 4: The screen.** In `SettingsView`'s "Account" section, under the email, a `NavigationLink` "Delete account" to `DeleteAccountView`: the warning text, then a red "Delete my account" button that opens a confirmation dialog titled "Delete your account?" with a destructive "Delete my account" and a cancel "Keep my account". While running: "Deleting…" with the button disabled. On failure: "Symphony couldn't delete your account. Try again in a moment, or write to hello@symphony-os.com." Present in both editions (Apple requires it for every account).
- [ ] **Step 5: Run** the tests, then the whole unit suite. Expected: PASS.
- [ ] **Step 6: Look at it** in the simulator (demo mode): Settings, the Delete account screen, the dialog, Keep my account. Do not confirm against a real account.
- [ ] **Step 7: Commit.** `git commit -m "iPhone: delete your account from Settings"`

---

## Stage E: proof with real accounts, then Scott's approvals

### Task 12: Two-account tests and the release checklist

**Files:**
- Create: `tests/integration/helpers.ts` (move the provisioning and sweep helpers out of `tests/integration/task-privacy.integration.test.ts`, which then imports them; no behaviour change)
- Create: `tests/integration/edition.integration.test.ts`, `tests/integration/delete-account.integration.test.ts`

These run against the live project with throwaway `symphony-rlstest-…@gmail.com` accounts, exactly as the existing privacy test does. They can only pass once Scott has approved applying the migrations, so they are written now and run in the checklist below.

- [ ] **Step 1: Write `edition.integration.test.ts`.** One new throwaway account L. Assertions: L has one active membership in a household with `edition = 'light'`; `rpc('my_edition')` as L is `'light'`; as L, `update households set edition = 'full'` leaves `'light'`; a signed-in call to `question-ideas` with the body `src/lib/chat/questionIdeas.ts:36` sends answers 403 with `code: 'ai_light_edition'`, and `ai_provider_call_usage` has no row for L. Then the admin client sets L's household to `'full'`: `my_edition` is `'full'`, and `admin.rpc('reserve_ai_budget', …)` for L answers `allowed: true` (settle that reservation at zero).
- [ ] **Step 2: Write `delete-account.integration.test.ts`.** A and B in one household (A owner), plus C alone. A has a shared task, a private task and one uploaded file under `<A>/`. A calls `delete-account` with the confirm phrase. Assertions: 200; A can no longer sign in; B (anon-key client) sees the shared task and not the private one; the household's `owner_id` is B; A's file is gone from storage. C deletes: C's household no longer exists. A call without the confirm phrase answers 400 and changes nothing.
- [ ] **Step 3: Typecheck** with `npx tsc --noEmit -p tsconfig.integration.json`. Commit: `git commit -m "Two-account proofs for the edition gate and account deletion"`
- [ ] **Step 4: STOP. Hand Scott the release checklist in "As built" below; do nothing on it without his go-ahead for that line.**

---

## As built (2026-11-13): what changed from the plan above

The plan was executed task by task with a review after each and one whole-branch review at the end.
Where this section and a task above disagree, this section is what the branch contains.

**Added while building**
- **Task 1b, membership guard** (`20261113151000_household_membership_guard.sql`, test 109). Found in
  review and confirmed on the live database: any signed-in person could move their own household
  membership into another household if they knew its id, or raise their own role, and an owner could
  add anyone as an active member without their consent. A direct write from the app can now no longer
  move a membership, change a role without being owner or admin, create a membership that is not
  `pending`, or accept on someone else's behalf. The database's own functions (accepting an invitation,
  first-run setup, pairing a display) are unaffected.
- **A full-household check on three server functions** that acted for any signed-in person:
  `list-contacts` and `place-call` (the kid phone) and `places-proxy` (Google Places). They allow
  everyone until the edition migration exists, then only full households.
- **The edition check on the web wall and kid routes** for a signed-in (not paired-display) account.

**Changed from the plan**
- SQL proofs run in a throwaway local Postgres through `scripts/test-*.mjs --pg-bin …` (the local
  database on port 55322 was months stale). `supabase/tests/run-local.sh` was not created.
- iPhone: the edition defaults to **full**, an empty household list keeps the last known edition for
  that person, and the calendar feed waits until the edition is known. This is what stops a full
  household flickering to light during a sync.
- Account deletion: the hand-on runs before detaching; a household is deleted only when the leaver
  owns it and no other active person is in it; a clash costs one row, not a whole table; assignments
  to the leaver's family rows are cleared first so the delete cannot be blocked; shared routine and
  calendar check-offs pass to the remaining member; a partner who joined by invitation can delete.
- Light also hides: the colour dot on rows, the routines count in "Choose from this week", and the
  background retry of stuck photo captures (it called the AI function).
- The "Mac target must still build" rule became "add no new Mac problems": the Mac build was already
  failing on main.

**Not done, on purpose**
- The two-account integration tests are written and type-checked, not run (they use the live project).
- Apple Calendar has only run against a fake source; the real permission prompt needs a person.
- iPhone Duo sizes were not screenshotted.

### Rulings made during the build (each is a call made for the owner)

1. SQL proofs run in a throwaway local Postgres, not the stale local database. If wrong: none; the same tests run anywhere.
2. The AI-refusal test switches the allowance on inside its own transaction. If wrong: none.
3. The calendar feed keeps one shape for Google and Apple, and Apple with no access shows no events, not endless loading. If wrong: none.
4. Account deletion skips tables and columns that do not exist. If wrong: a renamed table is silently skipped; the dry run in the checklist catches it.
5. "Look at it" steps a subagent could not do were collected and done by the controller. If wrong: none.
6. **The membership hole was closed inside this plan** (a new migration), not left for later. If wrong: a legitimate direct write is refused; the database's own functions are unaffected.
7. A direct write may only create a `pending` membership, and only the person themself may accept. If wrong: as above.
8. Reviews ran while the next task was being built when their files did not overlap. If wrong: none.
9. "The Mac target must still build" became "add no new Mac problems" (it was already failing on main). If wrong: a Mac-only error could slip in unnoticed.
10. Tasks ran out of order where their files were disjoint. If wrong: none.
11. The iPhone's edition defaults to full and remembers the last known edition. If wrong: a brand-new light person could see a full screen for a moment; the server still refuses.
12. Deletion hands shared rows on before detaching, and deletes a household only when its owner leaves and nobody else is in it. If wrong: a shared row could go with the leaver.
13. Deletion clears assignments first and falls back to row by row on a clash. If wrong: a clashing row stays with the leaver and is deleted.
14. The More "Calendar" row stays in light (it becomes the Apple Calendar settings). If wrong: one row to hide.
15. The calendar feed waits until the edition is known. If wrong: none.
16. One fix wave after the whole-branch review: invited partners can delete; shared routine history stays; the kid phone and address search need a full household; the wall and kid routes get the light holding page. If wrong: see each commit.
17. **Not fixed:** lists and pantry rows are not handed on (not shared on live); calendar and dinner caches survive a sign-out; a previous person's household row can be read briefly after a user switch on one phone. If wrong: small leaks of stale, own-device data.
18. Two load-bearing findings from the re-review were fixed before the walk began: the phone wipes its data only when the server says the account is gone (not on any 401); see 19.
19. The departing person's own family row is always demoted and handed on, never repointed or deleted. If wrong: a leftover adult row in the remaining member's family list.

### Release checklist (each line needs Scott's go-ahead)

Before anything:
- [ ] Compare the live `reserve_ai_budget` with `20261111120000_ai_budget_minutes_cache_household.sql:29-74`
      (the edition migration replaces it from that copy). If live is newer, update the migration first.
- [ ] Dry-run `delete_account_data` against the real schema inside a transaction that is rolled back
      (the proofs ran on a stub schema), including one person who joined by invitation.

Then, in order:
1. Apply `20261113150000_household_edition.sql` and `20261113151000_household_membership_guard.sql`.
   Check `select edition, count(*) from households group by 1`: every existing household is `full`.
   **From this moment every new account is light**, including a waitlist approval, a new demo or
   walkthrough account, and the three beta accounts that have no household yet. To make one full:
   `update households set edition = 'full' where id = '<household id>';` in the SQL editor.
2. Apply `20261113160000_delete_account_data.sql`; deploy the `delete-account` function.
3. Redeploy the AI edge functions (so a light refusal is the plain 403) and deploy `list-contacts`,
   `place-call` and `places-proxy`. **Check the kitchen wall's phone and an address search in your own
   account straight afterwards.** Required before step 4: its test expects the 403.
4. Run `npm run test:integration` (three files, throwaway accounts only).
5. Rebase onto `origin/main`, run the build and tests, merge. Merging deploys the web and starts an
   Xcode Cloud build to TestFlight; bump `MARKETING_VERSION` in `apple/SymphonyOS/project.yml` for the
   app and the widget together.
6. On Scott's and Iris's phones and on the web: everything is as before. Settings now has
   "Delete account".
7. **Last, and only when the light build is ready for strangers (after the walk):** apply
   `20261113170000_open_signup.sql`, then check that `anon` and `authenticated` can still execute
   `signup_allowed`. Do not apply it before step 3 is deployed: until then a stranger's account could
   reach the kid phone and paid address search.
