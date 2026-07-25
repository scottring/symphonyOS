# Legacy `/wall` removal — report

Branch: `chore/remove-legacy-wall` (off `origin/main` @ `203a0fa1`)
Commits:
1. `f38c9ebf` — chore(wall): unregister /wall route and delete src/apps/wall
2. `10d190ca` — chore(wall): delete orphaned components/wall/ tree

## Orphan-tracing method

1. Wrote a small import-graph builder (`graph.mjs`) that walks every `.ts`/`.tsx`/`.js`/`.jsx`
   file under `src/`, extracts `import`/`export ... from`/dynamic `import()`/`require()`
   specifiers via regex, and resolves relative and `@/` paths to absolute file paths
   (with extension and `index.*` resolution) to build a directed file-import graph.
2. Computed **`liveReachable`**: BFS from `src/main.tsx`, with the two `src/apps/wall/*`
   files excluded as nodes — i.e. "everything the app needs once the `/wall` route and
   its registration are gone." This automatically included `wall-v2`, `/morning`,
   `/bedtime`, and any `components/wall/*` file those surfaces still import.
3. Computed **`wallReachable`**: BFS from `src/apps/wall/WallApp.tsx` and
   `src/apps/wall/index.ts` over the *full, unmodified* graph.
4. **`orphansProd = wallReachable − liveReachable`** — 40 files (2 in `apps/wall`,
   35 in `components/wall`, 3 in `src/hooks`: `useEmailActionItems`, `useKioskCards`,
   `usePrefersReducedMotion` — all three imported only by `WallCalendar.tsx` /
   `WallAgentCards.tsx` / `WallNowCard.tsx`, verified by grep).
5. **The trap**: some `components/wall/*` files aren't imported by *any* production
   code at all — not even by `WallCalendar` — only by their own test file, or by
   nothing (dead code referenced only in comments, e.g. a leftover
   `WallMicButton`/`WallItem` mention in a `WallCalendar.tsx` comment that isn't a real
   import). These don't show up in a BFS from `WallApp.tsx` because nothing reaches
   them. So separately: for every `.tsx`/`.ts` file physically under `components/wall/`
   that is **not** in `liveReachable`, treat it as an orphan too. This surfaced 30 more
   files (`WallItem`, `WallSwimlane`, `WallMicButton`, `WallRoomsView`, `roomConfig.ts`,
   `alienJokes.ts`, `now/WallNowView`, etc.) — spot-checked several with `grep -rl` to
   confirm zero real (non-comment, non-test) importers anywhere in `src/`.
6. **Test files**: for every orphan production file, searched the whole repo (not just
   `components/wall/`) for test files importing it — this caught
   `src/hooks/usePrefersReducedMotion.test.ts`, which lives outside `components/wall/`
   entirely. Cross-checked in the other direction too: for each test file physically
   inside `apps/wall/`/`components/wall/`, resolved what it actually imports and
   classified it as keep/delete based on its subject, not its location. This correctly
   kept `WallDiscussionOverlay.test.tsx`, `today/tomorrowPreview.test.ts`, and
   `wallDinnerMealPlan.test.ts` (which — despite its name — tests `WallDinnerWidget.tsx`,
   a MUST-KEEP file) even though they live in the same directory as deleted files.
7. Cross-checked the whole thing against `npx tsc -b` (see below) as the final
   ground-truth signal.

## Deleted (96 files)

```
src/apps/wall/WallApp.tsx
src/apps/wall/index.ts
src/components/wall/WallAgentCards.tsx
src/components/wall/WallBottomBar.tsx
src/components/wall/WallCalendar.tsx
src/components/wall/WallCameraView.tsx
src/components/wall/WallChoresWidget.tsx
src/components/wall/WallChrome.test.tsx
src/components/wall/WallChrome.tsx
src/components/wall/WallDiscussList.test.tsx
src/components/wall/WallDiscussList.tsx
src/components/wall/WallDiscussionWidget.test.tsx
src/components/wall/WallDiscussionWidget.tsx
src/components/wall/WallEmailActionCard.tsx
src/components/wall/WallEmailActions.tsx
src/components/wall/WallEmailActionsOverlay.tsx
src/components/wall/WallFamilyFilter.test.tsx
src/components/wall/WallFamilyFilter.tsx
src/components/wall/WallItem.tsx
src/components/wall/WallItemDetail.tsx
src/components/wall/WallJaxCareWidget.tsx
src/components/wall/WallJaxWidget.tsx
src/components/wall/WallLookAhead.tsx
src/components/wall/WallMicButton.tsx
src/components/wall/WallNowCard.test.tsx
src/components/wall/WallNowCard.tsx
src/components/wall/WallProgressRing.tsx
src/components/wall/WallRewardWidget.tsx
src/components/wall/WallRhythmBar.test.tsx
src/components/wall/WallRhythmBar.tsx
src/components/wall/WallRightColumn.test.tsx
src/components/wall/WallRightColumn.tsx
src/components/wall/WallRoadMap.tsx
src/components/wall/WallRoomsView.tsx
src/components/wall/WallRoutineColumn.tsx
src/components/wall/WallRunningTipOverlay.tsx
src/components/wall/WallScratchpad.tsx
src/components/wall/WallScreenTimeWidget.tsx
src/components/wall/WallScribbleWidget.tsx
src/components/wall/WallSoccerTipOverlay.tsx
src/components/wall/WallSwimlane.tsx
src/components/wall/WallTaskColumn.tsx
src/components/wall/WallTodayList.test.tsx
src/components/wall/WallTodayList.tsx
src/components/wall/WallTravelDay.tsx
src/components/wall/WeatherEffects.tsx
src/components/wall/alienJokes.ts
src/components/wall/contexts/AfterSchoolView.tsx
src/components/wall/contexts/ContextDock.tsx
src/components/wall/contexts/ContextOverlay.tsx
src/components/wall/contexts/DinnerFlowView.tsx
src/components/wall/contexts/PlaceholderContextView.tsx
src/components/wall/contexts/WeekendMorningView.tsx
src/components/wall/contexts/index.ts
src/components/wall/contexts/rules.ts
src/components/wall/contexts/useContextEngine.ts
src/components/wall/now/WallNowFocusCard.test.tsx
src/components/wall/now/WallNowFocusCard.tsx
src/components/wall/now/WallNowGrid.test.tsx
src/components/wall/now/WallNowGrid.tsx
src/components/wall/now/WallNowQuadrant.test.tsx
src/components/wall/now/WallNowQuadrant.tsx
src/components/wall/now/WallNowRail.test.tsx
src/components/wall/now/WallNowRail.tsx
src/components/wall/now/WallNowView.test.tsx
src/components/wall/now/WallNowView.tsx
src/components/wall/now/WallQuadrantExpand.test.tsx
src/components/wall/now/WallQuadrantExpand.tsx
src/components/wall/now/buildDayGrid.test.ts
src/components/wall/now/buildDayGrid.ts
src/components/wall/now/useImminentEntity.test.ts
src/components/wall/now/useImminentEntity.ts
src/components/wall/now/wallNowFade.css
src/components/wall/nowFocus.test.ts
src/components/wall/nowFocus.ts
src/components/wall/rhythm/rhythmMode.test.ts
src/components/wall/rhythm/rhythmMode.ts
src/components/wall/rhythm/useWallRhythm.test.tsx
src/components/wall/rhythm/useWallRhythm.ts
src/components/wall/roomConfig.ts
src/components/wall/runningTips.ts
src/components/wall/soccerTips.ts
src/components/wall/today/filterDailyRoutines.test.ts
src/components/wall/today/filterDailyRoutines.ts
src/components/wall/today/groupRoutineStepsByOwner.test.ts
src/components/wall/today/groupRoutineStepsByOwner.ts
src/components/wall/today/todayItem.test.ts
src/components/wall/today/todayItem.ts
src/components/wall/views/ShoppingListView.test.tsx
src/components/wall/views/ShoppingListView.tsx
src/components/wall/wallBackground.ts
src/components/wall/weatherMessages.ts
src/hooks/useEmailActionItems.ts
src/hooks/useKioskCards.ts
src/hooks/usePrefersReducedMotion.test.ts
src/hooks/usePrefersReducedMotion.ts
```

Plus, **one file outside the originally-scoped orphan tree**:

```
src/components/detail/AgentInsightsSection.tsx
```

### Why `AgentInsightsSection.tsx` was also deleted (flagged, not silently done)

It was already fully dead before this task: zero importers anywhere in `src/`
(confirmed by grep), no test file, and `DetailPanelRedesign.tsx` has a standing
comment: `// AgentInsightsSection removed — replaced by "Think Through This" guided
notes`. It is not reachable from `WallApp.tsx` and is not physically under
`components/wall/` or `apps/wall/`, so it was outside the task's stated scope.

However, it contained `import type { KioskCard } from '@/hooks/useKioskCards'` —
a pure type-only import that `tsc -b` still resolves even though nothing at runtime
reaches the file (`tsc -b` type-checks every file matched by the project's
`tsconfig`, not just files reachable from an entry point). Deleting `useKioskCards.ts`
(a true wall orphan, only used by `WallCalendar.tsx`/`WallAgentCards.tsx`) broke this
already-dead file's compile.

Given it was unambiguously dead code with no consumers and no test coverage, I
deleted it rather than editing it to route around the missing type (which would have
been "fixing" a file I was told not to rewrite, for a file nothing uses). This is the
one deviation from the letter of the task's scope — surfacing it explicitly in case
you'd rather it be reverted/kept as an untouched (still-broken) file instead.

## Kept — MUST KEEP set + transitive deps (verified live-reachable from `wall-v2`/`/morning`/`/bedtime`)

```
src/components/wall/WallDinnerWidget.tsx
src/components/wall/WallDiscussionOverlay.tsx
src/components/wall/WallDiscussionOverlay.test.tsx
src/components/wall/WallRecipeViewer.tsx
src/components/wall/contexts/BedtimeView.tsx
src/components/wall/contexts/MorningLaunchView.tsx
src/components/wall/contexts/EmailActionStrip.tsx   (transitive dep — imported by kept contexts code)
src/components/wall/contexts/types.ts               (transitive dep — shared types for the above)
src/components/wall/today/tomorrowPreview.ts
src/components/wall/today/tomorrowPreview.test.ts
src/components/wall/wallDinnerMealPlan.test.ts       (tests WallDinnerWidget.tsx despite its filename)
```

## Uncertain / not deleted

None. Every file physically under `src/apps/wall/` and `src/components/wall/` was
confidently classified as either live-reachable (kept) or an orphan (deleted) via the
import-graph BFS plus manual grep spot-checks; no file required a judgment call to
leave in place out of uncertainty.

## Known follow-up NOT done (out of scope, flagging for visibility)

Two e2e specs reference the now-dead `/wall` route directly and will start failing
once this branch is live:
- `e2e/needs-discussion.spec.ts` — `test('the /wall route responds without crashing')`
  navigates to `/wall`.
- `e2e/home-kiosk.spec.ts` — `test('Rooms tab on the wall shows the rooms grid')`
  navigates to `/wall` and depends on `WallRoomsView.tsx` (deleted).

I did not touch `e2e/` — it wasn't in the task's file list and `npm run test:e2e`
wasn't part of the required verification — but these will need fixing/removing
separately.

Also: `src/lib/today/sectionCoverage.test.ts` has a static `ALLOWED` allow-list entry
keyed by the path `'src/components/wall/now/buildDayGrid.ts'` (the file that was the
source of the original "day-section logic duplicated in 13 places" problem this
cleanup is meant to help with). The file no longer exists, so the entry is now inert
dead config — it does not fail any assertion (the test only skips files it actually
walks on disk), so `vitest run` is unaffected. Left untouched per "careful deletion,
not a refactor," but worth pruning next time that file is touched.

## Before/after counts

| | Before | After |
|---|---|---|
| `src/` file count | 1272 | 1175 |
| Test files (vitest) | 427 | 403 |
| Tests passed | 4075 | 3941 |
| Tests skipped | 3 | 3 |
| Lint errors | 8 | 8 |

File-count delta: 1272 → 1175 = **97 files removed** (2 from commit 1, 95 from commit 2
— the 96-file orphan set minus the 1 `apps/wall` overlap counted differently... to be
precise: commit 1 removed 2 files (`apps/wall/*`), commit 2 removed 95 files — the
remaining 94 wall-orphan files plus `AgentInsightsSection.tsx`).

Test-file delta: 427 → 403 = 24 test files removed, all accounted for:
23 inside `components/wall/` + `src/hooks/usePrefersReducedMotion.test.ts`.

## Verification output

### `npx tsc -b`
Clean (no output, exit 0) — after also deleting `AgentInsightsSection.tsx` as
described above. (Before that fix, the sole error was:
`src/components/detail/AgentInsightsSection.tsx(5,32): error TS2307: Cannot find
module '@/hooks/useKioskCards' or its corresponding type declarations.`)

### `npx vitest run`
```
 Test Files  403 passed (403)
      Tests  3941 passed | 3 skipped (3944)
   Start at  17:11:27
   Duration  29.41s
```

### `npm run build`
```
✓ built in 5.41s
```
(Only pre-existing chunk-size and Sentry-auth-token warnings, unrelated to this change.)

### `npm run lint`
```
✖ 295 problems (8 errors, 287 warnings)
  0 errors and 4 warnings potentially fixable with the `--fix` option.
```
8 errors — matches the pre-existing baseline exactly, all in `supabase/functions/**`
and unrelated files, none touched by this change.

### Route/import sanity grep
```
$ grep -n "route: '/wall-v2'" src/apps/wall-v2/index.ts
7:  route: '/wall-v2',

$ grep -n "route:" src/apps/morning/index.ts
6:  route: '/morning',

$ grep -n "route:" src/apps/bedtime/index.ts
6:  route: '/bedtime',

$ grep -n "route: '/wall'" -r src
(no output — the /wall route no longer exists anywhere)

$ grep -rn "wallAppDef" src
src/apps/wall/index.ts is gone; no remaining references anywhere.
```

`src/components/wall-v2/`, `src/pages/`, and `public/wall/` were not touched
(confirmed via `git status --porcelain` on each — zero changes).
