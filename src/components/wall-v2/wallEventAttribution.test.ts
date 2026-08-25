import { describe, it, expect } from 'vitest';
import {
  attributeEvent, matchesName, titleForMember, HOUSEHOLD_ID, EXCLUDED_CALENDAR_IDS, CALENDAR_OWNER,
} from './wallEventAttribution';
import type { FamilyMember } from '@/types/family';

const SCOTT_ID = '4fd6259b-2246-4304-96c3-d93a12fd43ae';
const m = (id: string, name: string) => ({ id, name, initials: 'XX' }) as FamilyMember;

const MEMBERS = [
  m(SCOTT_ID, 'Scott'),
  m('iris', 'Iris'),
  m('ella', 'Ella'),
  m('kaleb', 'Kaleb'),
];

const FAMILY_CAL = '968af23c5d1acee7a12984884621b46e0ce34fe003438217a5cb6ffcfb26cd2b@group.calendar.google.com';
const SPORTS_CAL = 'j8nsego93j9jlum1p9mmv15ms60rjbq7@import.calendar.google.com';
const WORK_CAL = 'scott.kaufman@stacksdata.com';

const ev = (title: string, calendar_id?: string) => ({ title, calendar_id });

describe('matchesName', () => {
  it('matches a first name case-insensitively', () => {
    expect(matchesName('ella piano', 'Ella')).toBe(true);
    expect(matchesName('Piano — ELLA', 'Ella')).toBe(true);
  });

  // The failure that matters: a substring hit puts someone else's appointment
  // in a kid's lane, which is worse than an empty lane.
  it('does not match inside a longer word', () => {
    expect(matchesName('Stella vet appointment', 'Ella')).toBe(false);
    expect(matchesName('buy an umbrella', 'Ella')).toBe(false);
  });

  it('matches on the first name only, given a full name', () => {
    expect(matchesName('Kaleb dentist', 'Kaleb Kaufman')).toBe(true);
  });
});

describe('attributeEvent', () => {
  // Work is ON the wall by Scott's call — a parent's working day is part of
  // "where is everyone today", and without it the wall read as sparse.
  it("puts work events in Scott's lane, not nobody's", () => {
    expect(attributeEvent(ev('Quarterly review', WORK_CAL), MEMBERS)).toEqual([SCOTT_ID]);
  });

  it('attributes every work calendar to Scott, not just the primary', () => {
    for (const id of ['o77ugme9pkoqpf30tng6a2rk6c@group.calendar.google.com',
                      'qp7j77662gcnat8hqn6gt512ms@group.calendar.google.com']) {
      expect(EXCLUDED_CALENDAR_IDS.has(id)).toBe(false);
      expect(attributeEvent(ev('Standup', id), MEMBERS)).toEqual([SCOTT_ID]);
    }
  });

  // Work must not leak into the household lane — that would put a sales call
  // in front of the whole family as a shared commitment.
  it('never routes a work event to the household lane', () => {
    expect(attributeEvent(ev('Standup', WORK_CAL), MEMBERS)).not.toContain(HOUSEHOLD_ID);
  });

  it('still excludes noise and the meal calendar', () => {
    for (const id of ['en.usa#holiday@group.v.calendar.google.com',
                      '0470dab98aa3026c64e2e4573c6e0541c5e75db530994667b0ab2b78173fe666@group.calendar.google.com']) {
      expect(attributeEvent(ev('Anything', id), MEMBERS)).toEqual([]);
    }
  });

  it("attributes a personal calendar's events to its owner regardless of title", () => {
    expect(attributeEvent(ev('Haircut', 'smkaufman@gmail.com'), MEMBERS)).toEqual([SCOTT_ID]);
    expect(CALENDAR_OWNER['smkaufman@gmail.com']).toBe(SCOTT_ID);
  });

  it('attributes a shared-calendar event by the name in its title', () => {
    expect(attributeEvent(ev('Ella piano', FAMILY_CAL), MEMBERS)).toEqual(['ella']);
  });

  // Kids have no calendars, so SportsEngine is a real source for them — but
  // only when the title names them.
  it('attributes sports events by name too', () => {
    expect(attributeEvent(ev('Kaleb soccer vs Ridgefield', SPORTS_CAL), MEMBERS)).toEqual(['kaleb']);
  });

  it('gives an event naming two kids to both lanes', () => {
    expect(attributeEvent(ev('Ella and Kaleb dentist', FAMILY_CAL), MEMBERS))
      .toEqual(['ella', 'kaleb']);
  });

  // The content-loss case: a real commitment that names nobody must not vanish
  // just because the layout is person-shaped.
  it('sends an unattributed shared event to the household lane', () => {
    expect(attributeEvent(ev("Dinner at Grandma's", FAMILY_CAL), MEMBERS)).toEqual([HOUSEHOLD_ID]);
    expect(attributeEvent(ev('Trash day', FAMILY_CAL), MEMBERS)).toEqual([HOUSEHOLD_ID]);
  });

  it('lets an explicit assignment beat both calendar and title', () => {
    expect(attributeEvent(ev('Ella piano', FAMILY_CAL), MEMBERS, 'iris')).toEqual(['iris']);
    // A work event handed to someone else follows the assignment, not the
    // calendar's owner — an explicit assignee is a deliberate human act.
    expect(attributeEvent(ev('Offsite', WORK_CAL), MEMBERS, 'iris')).toEqual(['iris']);
  });

  it('reads camelCase calendarId as well as snake_case', () => {
    expect(attributeEvent({ title: 'Haircut', calendarId: 'smkaufman@gmail.com' }, MEMBERS))
      .toEqual([SCOTT_ID]);
  });

  it('falls back to household when the calendar is unknown and nobody is named', () => {
    expect(attributeEvent(ev('Book club', 'someone-elses-cal'), MEMBERS)).toEqual([HOUSEHOLD_ID]);
  });
});

describe('titleForMember', () => {
  // The real event on the shared calendar, 2026-08-25. One row holds BOTH
  // kids' rotation, so attribution hands the same string to both lanes and
  // neither kid learns what their day holds.
  const SPECIALS = 'Specials — Ella: Visual Art · Kaleb: PE';

  it("gives each member only their own half of a shared rotation", () => {
    expect(titleForMember(SPECIALS, 'Ella')).toBe('Visual Art');
    expect(titleForMember(SPECIALS, 'Kaleb')).toBe('PE');
  });

  it('leaves a genuinely shared title alone', () => {
    expect(titleForMember('School — Ella & Kaleb', 'Ella')).toBe('School — Ella & Kaleb');
    expect(titleForMember('Ella piano', 'Ella')).toBe('Ella piano');
  });

  it('leaves the title alone when this member has no segment', () => {
    expect(titleForMember(SPECIALS, 'Scott')).toBe(SPECIALS);
  });

  it('handles a single-person segment', () => {
    expect(titleForMember('Ella: dentist', 'Ella')).toBe('dentist');
  });

  // Same failure mode matchesName guards: a substring hit hands over the
  // wrong half of the line, which is worse than showing the whole thing.
  it('does not match a name inside a longer word', () => {
    expect(titleForMember('Stella: Art · Ella: PE', 'Ella')).toBe('PE');
  });

  it('reads the first name out of a full name', () => {
    expect(titleForMember(SPECIALS, 'Kaleb Kaufman')).toBe('PE');
  });

  it('is not fooled by a colon that is a clock', () => {
    expect(titleForMember('Pickup 3:30 · Ella: PE', 'Ella')).toBe('PE');
    expect(titleForMember('Dinner: pizza', 'Ella')).toBe('Dinner: pizza');
  });

  it('falls back to the whole title rather than returning nothing', () => {
    expect(titleForMember('Ella:', 'Ella')).toBe('Ella:');
    expect(titleForMember('', 'Ella')).toBe('');
  });
});
