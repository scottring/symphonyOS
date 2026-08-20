import { describe, it, expect } from 'vitest';
import {
  attributeEvent, matchesName, HOUSEHOLD_ID, EXCLUDED_CALENDAR_IDS, CALENDAR_OWNER,
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
  it('keeps work off the wall entirely', () => {
    expect(attributeEvent(ev('Quarterly review', WORK_CAL), MEMBERS)).toEqual([]);
  });

  it('excludes every configured work calendar, not just the primary', () => {
    for (const id of ['o77ugme9pkoqpf30tng6a2rk6c@group.calendar.google.com',
                      'qp7j77662gcnat8hqn6gt512ms@group.calendar.google.com']) {
      expect(EXCLUDED_CALENDAR_IDS.has(id)).toBe(true);
      expect(attributeEvent(ev('Standup', id), MEMBERS)).toEqual([]);
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
    // …but never resurrects an event from an excluded calendar by accident:
    // an explicit assignee is a deliberate human act, so it wins outright.
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
