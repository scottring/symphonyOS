# Pages, Today, grid, forms, auth, invite — Implementation Plan (Plan 2 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The altitude pages open on the period you plan for, Today looks forward, nothing on the grid or in a form invents a time or hides a row, and a lost session or a new partner is handled on purpose.

**Architecture:** Small pure helpers (`planningPeriod`, `presetRange`, `forwardLook`) with tests; thin edits to the pages that call them. Auth gets one explicit "session lost" path. Two SQL migrations are files Scott applies by hand.

**Tech Stack:** React 19 + TS strict, Vitest + RTL, Supabase.

**Spec:** `docs/superpowers/specs/2026-09-06-demo-run-2-fixes-and-first-week-card-design.md` — Parts B2–B4, D, E.

## Global Constraints

Same as Plan 1 (Node 22.14.0, worktree `.worktrees/demo-run-2-fixes`, derived scope, no emoji, commit trailer). Migrations are written to `supabase/migrations/` and NOT applied from here (DDL is classifier-blocked) — list them for Scott at the end.

---

### Task 1: Fall starts September 1 (B4)

**Files:** `src/lib/cadence/seasons.ts`, `src/lib/cadence/seasons.test.ts`, `src/hooks/useHouseholdSeasons.ts` (owner seed uses DEFAULT_SEASONS — unchanged)

- [ ] **Step 1: Failing test**
```ts
it('defaults: Winter Dec 1, Spring Mar 1, Summer Jun 1, Fall Sep 1 — Sep 6 is Fall', () => {
  expect(seasonLabel(new Date(2026, 8, 6), DEFAULT_SEASONS)).toBe('Fall 2026')
  expect(seasonLabel(new Date(2026, 11, 15), DEFAULT_SEASONS)).toBe('Winter 2026')
  expect(seasonLabel(new Date(2027, 0, 15), DEFAULT_SEASONS)).toBe('Winter 2026')
})
```
- [ ] **Step 2: Run** `npx vitest run src/lib/cadence/seasons.test.ts` → FAIL.
- [ ] **Step 3: Implement** — `DEFAULT_SEASONS = [{Winter,12,1},{Spring,3,1},{Summer,6,1},{Fall,9,1}]` sorted by `normalizeSeasons` convention (calendar order: Spring 3, Summer 6, Fall 9, Winter 12). `seasonStartFor` already handles "before the first boundary → last boundary of the previous year". Fix any test that assumed Oct 1.
- [ ] **Step 4: Run** the seasons + planParse + periodPage tests → PASS. **Step 5: Commit** — `git commit -am "feat(seasons): Fall starts Sep 1 by default"`

---

### Task 2: `planningPeriod` — pages and folds open on the period you plan for (B2)

**Files:** `src/lib/planning/periodPage.ts` (+ test), `src/components/plan/PeriodPlanPage.tsx`

**Interfaces:**
```ts
export interface PlanningPeriodInput { level: PlanLevel; today: Date; seasons: Seasons; explicitStart?: Date | null; countFor: (start: Date) => number }
/** The period a planning page should show first. */
export function planningPeriod(i: PlanningPeriodInput): { start: Date; lookingAhead: boolean }
```

- [ ] **Step 1: Failing tests**
```ts
const seasons = DEFAULT_SEASONS
it('an explicit start wins', () => {
  expect(planningPeriod({ level: 'season', today: new Date(2026, 8, 6), seasons, explicitStart: new Date(2026, 11, 1), countFor: () => 0 }).start).toEqual(new Date(2026, 11, 1))
})
it('looks ahead when the current season has ≤14 days left', () => {
  const r = planningPeriod({ level: 'season', today: new Date(2026, 10, 20), seasons, countFor: () => 0 })
  expect(r).toEqual({ start: new Date(2026, 11, 1), lookingAhead: true })
})
it('looks ahead when this period is empty and the next has a list', () => {
  const next = new Date(2026, 9, 1)
  const r = planningPeriod({ level: 'month', today: new Date(2026, 8, 6), seasons, countFor: (s) => (s.getTime() === next.getTime() ? 9 : 0) })
  expect(r).toEqual({ start: next, lookingAhead: true })
})
it('otherwise the current period', () => {
  expect(planningPeriod({ level: 'month', today: new Date(2026, 8, 6), seasons, countFor: () => 3 })).toEqual({ start: new Date(2026, 8, 1), lookingAhead: false })
})
```
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**
```ts
export function planningPeriod({ level, today, seasons, explicitStart, countFor }: PlanningPeriodInput): { start: Date; lookingAhead: boolean } {
  if (explicitStart) return { start: periodBounds(level, explicitStart, seasons).start, lookingAhead: false }
  const cur = periodBounds(level, today, seasons)
  if (level === 'year') return { start: cur.start, lookingAhead: false }
  const daysLeft = Math.round((cur.end.getTime() - today.getTime()) / 86_400_000)
  const threshold = level === 'season' ? 14 : 6
  const nextStart = cur.next
  if (daysLeft <= threshold) return { start: nextStart, lookingAhead: true }
  if (countFor(cur.start) === 0 && countFor(nextStart) > 0) return { start: nextStart, lookingAhead: true }
  return { start: cur.start, lookingAhead: false }
}
```
`PeriodPlanPage`: read `?start=YYYY-MM-DD` via `useSearchParams`; initial `anchor` = `planningPeriod({ level, today, seasons, explicitStart, countFor: (s) => selectPeriodTasks(layered, level as 'month'|'season', s, isCurrentPeriod(periodBounds(level, s, seasons), today), meId).length }).start` (compute once tasks have loaded: keep `anchor` state but set it in an effect the first time `tasks.length > 0 || !loading`; guard with a ref so user navigation isn't overridden). When `lookingAhead`, render under the masthead: `<p className="text-[12px] text-neutral-500">{bounds.label} starts in {n} days · you're looking ahead</p>` and the existing "Back to this {noun}" chip. The folds (`railRows`): replace `seasonStartFor(today, seasons)` / `today.getFullYear()` with the same helper for the rail level.
- [ ] **Step 4: Run** `npx vitest run src/lib/planning src/components/plan` + tsc → PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(plan pages): open on the period you plan for; folds follow"`

---

### Task 3: Today looks forward; all-day rows print no time (B3, A2.3)

**Files:** `src/components/schedule/TodayView.tsx`, `src/lib/today/forwardLook.ts` (+ test)

**Interfaces:**
```ts
export interface ForwardItem { title: string; when: Date; isAllDay: boolean }
/** The first thing on the next day that has anything, within `days` days. */
export function forwardLook(tasks: readonly { title: string; scheduledFor?: Date | null; isAllDay?: boolean | null; completed?: boolean }[], today: Date, days?: number): ForwardItem | null
export function forwardLine(item: ForwardItem | null, today: Date): string
```
- [ ] **Step 1: Failing tests**
```ts
it('names tomorrow’s first item, no time for all-day', () => {
  const t = new Date(2026, 8, 6)
  const item = forwardLook([{ title: 'Book flights', scheduledFor: new Date(2026, 8, 7), isAllDay: true }], t)
  expect(forwardLine(item, t)).toBe('Tomorrow: Book flights')
})
it('names the weekday past tomorrow, with a time when timed', () => {
  const t = new Date(2026, 8, 6)
  const item = forwardLook([{ title: 'Piano', scheduledFor: new Date(2026, 8, 10, 16, 0), isAllDay: false }], t)
  expect(forwardLine(item, t)).toBe('Thursday: Piano · 4:00 PM')
})
it('nothing within 7 days', () => { expect(forwardLine(forwardLook([], new Date(2026, 8, 6)), new Date(2026, 8, 6))).toBe('Nothing on the board this week.') })
```
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** the helper (skip completed, skip today, earliest `scheduledFor` ≥ tomorrow 00:00 and < today+days; all-day sorts before timed on the same day) and in `TodayView.heroLine`: when `data.isToday && !upNext` → `forwardLine(forwardLook(tasks, viewedDate), viewedDate)`; when `data.counts.totalItems === 0 && data.isToday` → same. `firstTimedLabel`/`nextTimeLabel`: return `''` when the item `isAllDay`.
- [ ] **Step 4: Run** → PASS. **Step 5: Commit** — `git commit -am "feat(today): a clear day looks forward; all-day rows print no time"`

---

### Task 4: "Do today" is all-day at midnight (C3 / A2.5)

**Files:** `src/components/schedule/TriageRow.tsx` (+ `TriageRow.test.tsx`)

- [ ] **Step 1: Failing test** — `applyTriageVerdict(task, 'today', { viewedDate: new Date(2026, 8, 6, 6, 50), onPushTask })` → `onPushTask` called with `new Date(2026, 8, 6, 0, 0, 0, 0)`; same for `'tomorrow'` → Sep 7 00:00.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** — `const day = new Date(h.viewedDate); day.setHours(0,0,0,0)` in both branches. (`pushTask` already writes `isAllDay: true` for a midnight target.)
- [ ] **Step 4: Run** → PASS. **Step 5: Commit** — `git commit -am "fix(today): Do today lands all-day, not at the clock time you pressed it"`

---

### Task 5: Inline add — strip the dangling preposition; date-only is all-day (A2.7)

**Files:** `src/lib/quickInputParser.ts` (+ test), `src/components/schedule/TodayAddInput.tsx`, `src/components/layout/QuickCapture.tsx` (⌘K — same result shape)

**Interfaces:** `ParsedQuickInput.hasTime: boolean` (true only when chrono was certain of an hour).

- [ ] **Step 1: Failing tests**
```ts
it('"Finish the deck for Monday" → title without the dangling for, no time', () => {
  const r = parseQuickInput('Finish the deck for Monday', ctx)
  expect(r.title).toBe('Finish the deck'); expect(r.hasTime).toBe(false)
  expect(r.dueDate?.getHours()).toBe(0)
})
it('"Dentist thu 2pm" keeps the time', () => { expect(parseQuickInput('Dentist thu 2pm', ctx).hasTime).toBe(true) })
```
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** — after removing `dateMatch.text`: `workingText = workingText.replace(/\s+(for|on|by|until|till|at)\s*$/i, '').trim()`; `result.hasTime = dateMatch.start.isCertain('hour')`; when `!hasTime`, `result.dueDate.setHours(0,0,0,0)`. `TodayAddInput` and `QuickCapture` submit `isAllDay: p.dueDate ? !p.hasTime : undefined` in the addTask options.
- [ ] **Step 4: Run** parser + TodayAddInput + QuickCapture tests → PASS. **Step 5: Commit** — `git commit -am "fix(capture): a date with no time is all-day; the preposition goes with the date"`

---

### Task 6: /week — all-day events in the all-day lane; early items in an Earlier row; Weekend on Sunday (A2.8, A2.9, D3)

**Files:** `src/components/home/week/WeekViewV2.tsx`, `src/components/home/week/WeekAllDayChip.tsx`, `src/lib/planning/dateRange.ts` (+ test)

- [ ] **Step 1: Failing tests**
```ts
// dateRange.test.ts
it('Weekend on a Sunday is the coming Sat–Sun', () => {
  const d = presetRange('weekend', new Date(2026, 8, 6))
  expect(d.map((x) => x.getDate())).toEqual([12, 13])
})
// WeekViewV2.test.tsx (extend): an all-day event renders in the all-day lane, not the grid
it('an all-day calendar event sits in the all-day lane', () => {
  render(<WeekViewV2 … events={[{ id: 'e1', title: 'Labor Day', start_time: '2026-09-07T00:00:00', end_time: '2026-09-08T00:00:00', is_all_day: true }]} />)
  expect(within(screen.getByTestId('allday-2026-09-07')).getByText('Labor Day')).toBeInTheDocument()
})
it('a 6:50 AM task shows in the Earlier row with its time', () => { … expect(screen.getByText(/6:50 AM · Get gutter/)).toBeInTheDocument() })
```
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** — `weekEvents` splits on `is_all_day ?? isAllDay ?? (start at 00:00 && end - start ≥ 24h)`; all-day events go into a new `allDayEventsByDay` map and `renderAllDay(day)` renders them as `WeekAllDayChip` variants (read-only, event styling) before the task chips. `scheduledTasks` with `startMins < FIRST_HOUR*60` are excluded from the grid and rendered in the all-day lane as a chip prefixed with the time (`6:50 AM · title`), `aria-label="Earlier: …"`. `presetRange('weekend')`: `if (dow === 0) { const sat = addDays(start, 6); return buildRange(sat, addDays(sat, 1)) }` and HomeHeader's masthead label for that preset reads "Weekend".
- [ ] **Step 4: Run** → PASS. **Step 5: Commit** — `git commit -am "fix(week): holidays sit in the all-day lane; early items get an Earlier row; Weekend on a Sunday is the coming one"`

---

### Task 7: /month "On the calendar" strip; PlanRail arrow visible; list order (D1, D2, A1.21)

**Files:** `src/components/plan/PeriodPlanPage.tsx`, `src/components/plan/PlanRail.tsx`, `src/lib/planning/periodPage.ts` (+ tests)

**Interfaces:** `export function selectDatedInPeriod(tasks, bounds): Task[]` (timed tasks with `scheduledFor` inside `[start,end)`, not completed, sorted by date).

- [ ] **Step 1: Failing tests** — `selectDatedInPeriod` returns the 4 September dated rows in order; `selectPeriodTasks` returns rows in `created_at` ascending (add a sort); RTL: `/month` renders heading "On the calendar" with "Tue, Sep 15 · Back to school night · 6:30 PM".
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** — strip above the list on month (and season) pages; rows link to `/task/:id`. `PlanRail` Row: arrow `opacity-60 group-hover:opacity-100` (always visible), `title="Place this week"` / `"Place this month"` from `pullLabel`; when `onPullDown` and rows exist, a one-line hint under the heading the first time (`localStorage symphony-plan-rail-hint-seen`): "Press → to bring one into this {level}."
- [ ] **Step 4: Run** → PASS. **Step 5: Commit** — `git commit -am "feat(plan pages): dated items on the month page; the fold's arrow is visible"`

---

### Task 8: Routine form scrolls; own lens includes what you made (D5, D6)

**Files:** `src/components/routine/RhythmPage.tsx` (modal wrapper L467–486 + lens filter), `src/components/routine/RoutineForm.tsx`

- [ ] **Step 1: Failing test** — RTL: the modal container has class `max-h-[calc(100vh-2rem)]` and `overflow-y-auto` on its body; the lens filter: a routine with `assigned_to: null, user_id: me` appears under the current user's lens.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** — wrapper: `fixed inset-0 … p-4` → dialog `flex max-h-[calc(100vh-2rem)] flex-col`; header (name input + Escape/close button) `shrink-0`; body `min-h-0 flex-1 overflow-y-auto`; footer (Delete · Done) `shrink-0 border-t`. Lens: where `memberId` filters routines, treat `assigned_to == null && routine.user_id === currentUserId` as matching the current user's own lens.
- [ ] **Step 4: Run** → PASS. **Step 5: Commit** — `git commit -am "fix(routines): the form scrolls; your lens includes unassigned routines you made"`

---

### Task 9: Session loss is visible and logged; edge 401s route to sign-in (E1, D8)

**Files:** `src/lib/authErrors.ts` (from Plan 1 Task 7; create if Plan 1 hasn't), `src/hooks/useAuth.ts` (+ test), `src/components/auth/AuthGate.tsx` (sign-in screen message + return route), `src/lib/supabase.ts`

- [ ] **Step 1: Failing tests** (`useAuth.test.ts`)
```ts
it('a SIGNED_OUT that the user did not ask for is recorded and reported', async () => {
  const { result } = renderHook(() => useAuth())
  act(() => emitAuth('SIGNED_IN', session))
  act(() => emitAuth('SIGNED_OUT', null))
  expect(localStorage.getItem('symphony.auth.lostAt')).toBeTruthy()
  expect(Sentry.captureEvent).toHaveBeenCalledWith(expect.objectContaining({ message: 'auth.session_lost' }))
  expect(result.current.sessionLost).toBe(true)
})
it('pressing Sign out does not count as a lost session', async () => { … expect(localStorage.getItem('symphony.auth.lostAt')).toBeNull() })
```
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** — `useAuth`: `const signingOutRef = useRef(false)`; `signOut` sets it true first. Listener: `if (event === 'SIGNED_OUT' && prevUserRef.current && !signingOutRef.current) { localStorage.setItem('symphony.auth.lostAt', new Date().toISOString()); Sentry.captureEvent({ message: 'auth.session_lost', level: 'warning', extra: { path: location.pathname, tabsOpen: navigator?.locks ? 'unknown' : 'unknown', prevExpiresAt: prevExpiresRef.current } }); setSessionLost(true) }`; track `prevExpiresRef` from `session?.expires_at` on every event. Expose `sessionLost`. `AuthGate`: when `sessionLost` (or `?return=` present), the sign-in card shows "Your session ended. Sign in to continue where you were." and after sign-in navigates to `sessionStorage.symphony.returnTo ?? '/today'`. `supabase.ts`: add `auth: { …, debug: import.meta.env.DEV && localStorage.getItem('symphony.auth.debug') === '1' }` so the next repro can log token refreshes. `SessionExpiredError` consumers (Plan 1 Task 7) navigate to `/?return=<path>`.
- [ ] **Step 4: Run** → PASS. **Step 5: Commit** — `git commit -am "feat(auth): a lost session is recorded, reported, and explained on the sign-in screen"`

---

### Task 10: Signup gate = approved waitlist; Settings → Admin approves (E2)

**Files:**
- Create: `supabase/migrations/2026-09-06_signup_gate_waitlist.sql`
- Modify: `src/components/settings/SettingsPage.tsx` (Admin section: pending waitlist rows + Approve), `src/hooks/useWaitlistAdmin.ts` (create, + test)

Migration:
```sql
-- Signups: the live check_allowed_signup() trigger allow-listed six emails and
-- two patterns. A founding household that signed up on the landing page could
-- not create an account. Now: the allowlist OR an approved waitlist row.
alter table public.waitlist add column if not exists approved_at timestamptz;
create index if not exists idx_waitlist_email_lower on public.waitlist (lower(email));

create or replace function public.check_allowed_signup()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  allowed_emails text[] := array['scottring@hotmail.com','smkaufman@gmail.com','irisleviner@gmail.com','tim.rappold@gmail.com','stephanie.nothelle@gmail.com','meganhryan@gmail.com'];
  allowed_patterns text[] := array['smkaufman+%@gmail.com','symphony%@gmail.com'];
  email_val text := lower(new.email);
  pattern text;
begin
  if email_val = any(allowed_emails) then return new; end if;
  foreach pattern in array allowed_patterns loop
    if email_val like pattern then return new; end if;
  end loop;
  if exists (select 1 from public.waitlist w where lower(w.email) = email_val and w.approved_at is not null) then
    return new;
  end if;
  raise exception 'Signups are currently restricted. Contact the administrator.';
end $$;
-- The trigger check_signup_allowed on auth.users already calls this function; no re-create needed.
notify pgrst, 'reload schema';
```
- [ ] **Step 1: Failing test** — `useWaitlistAdmin().approve(id)` updates `waitlist` with `approved_at`; the Admin list renders pending rows with an Approve button (mock `useIsAppAdmin` → true).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** the hook (`select id,email,created_at,approved_at from waitlist order by created_at desc`; `approve` = `update({ approved_at: now })`) and the Settings Admin block: "Founding households" list, Approve button, "approved" label. The inbox task the trigger creates already links to Settings.
- [ ] **Step 4: Run** → PASS. **Step 5: Commit** — `git add -A && git commit -m "feat(admin): approve a waitlist signup; signup gate reads the waitlist (migration)"`

---

### Task 11: Join page asks who you are; RPC links the member; invites create the household on demand (E3, E4)

**Files:**
- Create: `supabase/migrations/2026-09-06_accept_invitation_member.sql`
- Modify: `src/components/JoinHousehold.tsx` (+ test), `src/hooks/useHouseholdInvitations.ts`

Migration:
```sql
-- The invitee says which member row is theirs; the name==email guess stays as a fallback.
create or replace function public.accept_household_invitation(invitation_token uuid, member_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare inv record; current_user_id uuid := auth.uid(); current_membership record;
begin
  if current_user_id is null then raise exception 'Not authenticated'; end if;
  select * into inv from household_invitations where token = invitation_token and accepted_at is null and expires_at > now();
  if inv is null then raise exception 'Invalid or expired invitation'; end if;
  select * into current_membership from household_members where user_id = current_user_id and status = 'active';
  if current_membership is not null then
    delete from household_members where id = current_membership.id;
    if current_membership.role = 'owner' and not exists (select 1 from household_members where household_id = current_membership.household_id) then
      delete from households where id = current_membership.household_id;
    end if;
  end if;
  insert into household_members (household_id, user_id, role, status, invited_by, joined_at)
  values (inv.household_id, current_user_id, 'member', 'active', inv.invited_by, now());
  update household_invitations set accepted_at = now() where id = inv.id;
  if member_id is not null then
    update family_members set auth_user_id = current_user_id, is_full_user = true
    where id = member_id and user_id = inv.invited_by and auth_user_id is null;
  else
    update family_members set auth_user_id = current_user_id, is_full_user = true
    where user_id = inv.invited_by and auth_user_id is null and is_full_user = false
      and lower(name) = split_part((select email from auth.users where id = current_user_id), '@', 1);
  end if;
  return jsonb_build_object('household_id', inv.household_id, 'status', 'joined');
end $$;

-- The join page needs the household name, the inviter's name, and the unlinked adult rows — by token, before membership.
create or replace function public.invitation_preview(invitation_token uuid)
returns jsonb language sql security definer set search_path = public stable as $$
  select jsonb_build_object(
    'household_name', h.name,
    'inviter_name', coalesce((select fm.name from family_members fm where fm.user_id = i.invited_by and fm.is_full_user and fm.auth_user_id is null limit 1), 'Your partner'),
    'candidates', coalesce((select jsonb_agg(jsonb_build_object('id', fm.id, 'name', fm.name)) from family_members fm
        where fm.user_id = i.invited_by and fm.auth_user_id is null and not fm.is_full_user and coalesce(fm.role_label,'') in ('parent','adult')), '[]'::jsonb)
  )
  from household_invitations i join households h on h.id = i.household_id
  where i.token = invitation_token and i.accepted_at is null and i.expires_at > now();
$$;
grant execute on function public.invitation_preview(uuid) to anon, authenticated;
notify pgrst, 'reload schema';
```
- [ ] **Step 1: Failing tests** — `JoinHousehold` renders "Alex invited you to the Chen Household" and radio chips "Edith" / "I'm someone new" from a mocked `invitation_preview`; Join calls `accept_household_invitation` with `member_id: 'e'` when Edith is chosen. `useHouseholdInvitations.createInvitation` calls `setup_household` when `get_user_household_id` returns null, then retries.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** — `getInvitationPreview(token)` via `supabase.rpc('invitation_preview')`; the page shows the sentence + chooser when `candidates.length > 0`; `acceptInvitation(token, memberId?)`. `createInvitation`: `if (!householdId) { await supabase.rpc('setup_household', { p_name: null }); ({ data: householdId } = await supabase.rpc('get_user_household_id')) }`.
- [ ] **Step 4: Run** → PASS. **Step 5: Commit** — `git add -A && git commit -m "feat(household): the join page asks which member you are; invites create the household on demand (migration)"`

---

### Task 12: Suite, lint, hand-over

- [ ] `npx vitest run`, `npm run lint`, `npx tsc -p tsconfig.app.json --noEmit` → all clean.
- [ ] Write the hand-over list of migrations for Scott (three files, apply in the SQL editor in this order): `2026-09-06_goals_scope_and_area_optional.sql`, `2026-09-06_signup_gate_waitlist.sql`, `2026-09-06_accept_invitation_member.sql`.
- [ ] Rebase on `origin/main`; push the branch. Do not push to `main` until Scott confirms the migrations are applied.
