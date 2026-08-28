// src/components/wall-v2/wallParity.test.ts
//
// Characterization tests for Task 8a's carve-out of "the wall adopts the
// resolver": the four changes that do NOT depend on the hide-from-timeline
// flag's data audit (see task-8-brief.md's blocked Step 4, and
// task-8a-report.md for the carve-out this task actually implemented).
//
// useWallData.ts itself is OUT OF SCOPE for this file (see Task 8b's report
// for the resolver-adoption tests). As of Task 8b it calls resolveRoutine for
// rungs 1/2/4, with two TEMPORARY overrides at that one call site
// (show_on_timeline: true and parent_routine_id: null — see
// routineVisibilityCoverage.test.ts's ALLOWED entry for both). These tests
// exercise wallV2Adapter.ts and wallLanes.ts.
//
// IMPORTANT — this file alone is not the live coverage for change 2 or
// change 4. The tap-lookup path (adaptTimelineSections/dedupeRoutines) tested
// below is real but is only HALF of change 2: the live board draws through
// wallGantt.ts's itemsFor, which needed its own, separate fix (see
// wallGantt.test.ts's "a Step never draws a bar or a chip" and "multi-owner
// attribution" describe blocks — that file is the real coverage for the live
// wall). Likewise, change 4's `adaptPersonLane`/`adaptLanes` assertions below
// exercise a path with no production caller today (see the comment on that
// test) — wallGantt.ts's boardOwnersOf is the one multi-owner path that is
// actually live.
//
// Each "is absent" assertion below is paired with a positive control in the
// same test — proof the render path is live, not merely that the day was
// empty.

import { describe, it, expect } from 'vitest';
import { adaptTimelineSections, adaptGlanceForMember } from './wallV2Adapter';
import { ownersOf, adaptPersonLane } from './wallLanes';
import { routineToTimelineItem } from '@/types/timeline';
import { createMockRoutine } from '@/test/mocks/factories';
import { emptySections } from '@/lib/today/types';
import type { WallDayData } from '@/hooks/useWallData';
import type { TimelineItem } from '@/types/timeline';
import type { FamilyMember } from '@/types/family';
import type { DaySection } from '@/lib/timeUtils';

// Monday, matching the routineVisibility.fixtures.ts CORPUS_DATE weekday —
// not load-bearing here (adaptTimelineSections does no recurrence matching
// of its own), just keeps the fixture dates sane at a glance.
const NOW = new Date(2026, 7, 24, 7, 0, 0);

function dayWith(items: Partial<Record<DaySection, TimelineItem[]>>): WallDayData {
  return {
    date: NOW,
    isToday: true,
    items: { ...emptySections<TimelineItem>(), ...items },
    birthdays: [],
    milestones: [],
  };
}

const SCOTT: FamilyMember = { id: 'scott', name: 'Scott', initials: 'SK', color: 'blue' } as FamilyMember;
const IRIS: FamilyMember = { id: 'iris', name: 'Iris', initials: 'IK', color: 'purple' } as FamilyMember;

describe('wall parity — the four in-scope changes', () => {
  it('collection steps stop rendering as loose rows', () => {
    const parent = createMockRoutine({ name: 'Camp Mornings', context: 'family' });
    const step = createMockRoutine({
      name: 'Brush teeth', context: 'family', parent_routine_id: parent.id,
    });
    // Positive control: a sibling routine with no parent, same section, same
    // call — proves the section actually renders items via this path, so the
    // step's absence below isn't just an empty day.
    const sibling = createMockRoutine({ name: 'Read for 20 minutes', context: 'family' });

    const day = dayWith({
      morning: [routineToTimelineItem(step, NOW), routineToTimelineItem(sibling, NOW)],
    });
    const sections = adaptTimelineSections(day, [], NOW, null, false, []);
    const titles = sections.flatMap((s) => s.events.map((e) => e.title));

    expect(titles).toContain('Read for 20 minutes'); // positive control: the path is live
    expect(titles).not.toContain('Brush teeth'); // the step: swallowed by the adapter
  });

  it('pinned and dosed routines survive "hide daily routines" (the pin escape the wall never had)', () => {
    const plainDaily = createMockRoutine({
      name: 'Make bed', context: 'family', recurrence_pattern: { type: 'daily' },
    });
    const pinnedDaily = createMockRoutine({
      name: 'PT stretches', context: 'family', recurrence_pattern: { type: 'daily' }, pin_to_timeline: true,
    });
    const dosedDaily = createMockRoutine({
      name: 'Take medication', context: 'family', recurrence_pattern: { type: 'daily' },
      times_per_day: ['08:00', '20:00'],
    });

    const day = dayWith({
      morning: [
        routineToTimelineItem(plainDaily, NOW),
        routineToTimelineItem(pinnedDaily, NOW),
        routineToTimelineItem(dosedDaily, NOW),
      ],
    });
    const sections = adaptTimelineSections(day, [], NOW, null, true, []); // hideDailyRoutines: true
    const titles = sections.flatMap((s) => s.events.map((e) => e.title));

    expect(titles).not.toContain('Make bed'); // negative control: swept, no escape — proves the sweep itself is live
    expect(titles).toContain('PT stretches'); // pin escape (new)
    expect(titles).toContain('Take medication'); // dose escape (new)
  });

  it('canHeadline is pref-aware: an everyday routine headlines only when hide-daily is off', () => {
    const daily = createMockRoutine({
      name: 'Tidy room', context: 'family', assigned_to: 'scott',
      recurrence_pattern: { type: 'daily' },
    });
    const item = routineToTimelineItem(daily, NOW); // time_of_day defaults to 09:00, after NOW (07:00)

    const day = dayWith({ morning: [item] });
    expect(adaptGlanceForMember(SCOTT, day, NOW, true)).toBeNull(); // hide-daily on: still swept
    expect(adaptGlanceForMember(SCOTT, day, NOW, false)?.primary).toBe('Tidy room'); // hide-daily off: now allowed
  });

  it("a multi-owner routine reaches ownersOf, and every owner's lane/glance IF those surfaces are ever wired up", () => {
    // NOT the live coverage for change 4 — see wallGantt.test.ts's
    // "multi-owner attribution" tests for the path that actually ships today
    // (boardOwnersOf -> ownersOf). adaptPersonLane/adaptLanes here has no
    // production caller (see the comment on adaptLanes in wallLanes.ts), and
    // adaptGlanceForMember's one call site, WallV2FamilyStrip, is currently
    // unmounted (see the comment at the top of that file). Both are kept
    // because they are correct and will matter the moment either surface is
    // wired back up — but neither is proof of anything on the wall today.
    const shared = createMockRoutine({
      name: 'Walk the dog', context: 'family',
      assigned_to: 'scott', assigned_to_all: ['scott', 'iris'],
      recurrence_pattern: { type: 'weekly', days: ['mon'] },
    });
    const item = routineToTimelineItem(shared, NOW);
    expect(item.owners).toEqual(['scott', 'iris']); // routineToTimelineItem -> routineOwners populates it

    // ownersOf itself IS live — wallGantt.ts's boardOwnersOf calls it
    // directly, which is what the wallGantt.test.ts tests exercise.
    expect(ownersOf(item, [SCOTT, IRIS])).toEqual(['scott', 'iris']);

    // Dead path (no production caller today): both members' lanes still pick
    // up the same routine correctly. Before this task, item.assignedTo alone
    // ('scott') could only ever satisfy one lane — this is the positive
    // control proving Iris's lane isn't a fluke, for whenever lanes ship.
    const day = dayWith({ morning: [item] });
    const scottLane = adaptPersonLane(SCOTT, [day], NOW, [SCOTT, IRIS]);
    const irisLane = adaptPersonLane(IRIS, [day], NOW, [SCOTT, IRIS]);
    expect(scottLane.label).toBe('Walk the dog');
    expect(irisLane.label).toBe('Walk the dog');

    // Dead path (WallV2FamilyStrip is currently unmounted): the glance card,
    // for both owners.
    expect(adaptGlanceForMember(SCOTT, day, NOW, false)?.primary).toBe('Walk the dog');
    expect(adaptGlanceForMember(IRIS, day, NOW, false)?.primary).toBe('Walk the dog');
  });
});
