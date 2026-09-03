// src/components/wall-v2/wallEventAttribution.ts
//
// Works out WHOSE a calendar event is, so the wall's person lanes have anything
// to show. Nothing upstream does this: `eventToTimelineItem` sets no
// `assignedTo` at all, and `useWallData` never supplies the `eventNotesMap`
// that `grouping.ts` would use to patch one in. Tasks and routines carry an
// assignee; events — which are most of what "where does this person need to
// be" actually means — carried none.
//
// Attribution runs in three layers, cheapest and most certain first:
//
//   1. An explicit assignment already on the item wins. Free, and it would be
//      perverse to ignore an answer someone typed in by hand.
//   2. Calendar ownership. A personal calendar's events belong to its owner.
//   3. A household first name in the title. Families write "Ella piano" and
//      "Kaleb dentist", and for the kids — who have no calendars of their own —
//      this is the only signal there is.
//
// Anything on a shared calendar that matches nobody is HOUSEHOLD, not nothing:
// "Dinner at Grandma's" and "Trash day" are real commitments and must not
// silently vanish because they don't name a person.

import type { FamilyMember } from '@/types/family';

/** Sentinel member id for the shared household lane. Not a real family_members row. */
export const HOUSEHOLD_ID = '__household__';

/**
 * Calendars whose events never belong on a kitchen wall.
 *
 * Deliberately short. Work calendars were briefly in here and are NOT any more
 * (Scott, 2026-08-20): with only the shared calendar feeding it, the wall read
 * as sparse, and a parent's working day is genuinely part of "where is everyone
 * today". Work events now land in Scott's lane like anything else of his.
 *
 * What remains is duplication and noise, not privacy: national holidays, the
 * Symphony dev-test calendar, and the meal calendar the dinner card already
 * renders.
 */
export const EXCLUDED_CALENDAR_IDS = new Set([
  'en.usa#holiday@group.v.calendar.google.com',
  '38c2e0ff8268cc36fbc9b0d3b8829935269341aeed25428b42899fefaf1e75b7@group.calendar.google.com',
  // The meal calendar already drives the dinner card; a second rendering in a
  // lane would be the same duplication the lanes were built to remove.
  '0470dab98aa3026c64e2e4573c6e0541c5e75db530994667b0ab2b78173fe666@group.calendar.google.com',
]);

/**
 * Personal calendars, mapped to the member they belong to.
 *
 * Household-specific config. It lives in code because this is a single-family
 * app and a settings surface for it would be more machinery than the problem
 * deserves — but it IS config, so it belongs in one obvious place rather than
 * scattered through the data layer.
 *
 * Iris has no entry because her personal calendar is not shared into this
 * Google account. Until it is, her lane draws only from name matches on the
 * shared calendar and from tasks assigned to her. Adding her is one line here.
 */
const SCOTT = '4fd6259b-2246-4304-96c3-d93a12fd43ae';

export const CALENDAR_OWNER: Record<string, string> = {
  'smkaufman@gmail.com': SCOTT,                                        // personal
  'scott.kaufman@stacksdata.com': SCOTT,                               // work — primary
  'o77ugme9pkoqpf30tng6a2rk6c@group.calendar.google.com': SCOTT,       // work — schedule/meetings
  'qp7j77662gcnat8hqn6gt512ms@group.calendar.google.com': SCOTT,       // work — G Suite
  // Named for Scott's personal address, so it goes to his lane rather than
  // falling through to the household lane and mixing his events into
  // everyone's. If something unexpected starts showing up under his name,
  // this line is the first suspect.
  'ifgsv9b9e40qndf103nb0ishc0@group.calendar.google.com': SCOTT,
};

/** Read whichever casing the event arrived in. */
function calendarIdOf(e: { calendar_id?: string; calendarId?: string }): string | null {
  return e.calendar_id ?? e.calendarId ?? null;
}

/**
 * Whole-word, case-insensitive first-name match.
 *
 * Word-bounded so "Ella" doesn't fire on "Stella" or "umbrella" — the failure
 * mode that would put someone else's appointment in a kid's lane, which is
 * worse than showing nothing.
 */
export function matchesName(title: string, name: string): boolean {
  const first = name.trim().split(/\s+/)[0];
  if (!first) return false;
  const escaped = first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(title);
}

/**
 * Every member an event belongs to.
 *
 * Returns a list because "Ella and Kaleb dentist" is genuinely both kids' —
 * each lane should show it. Returns [HOUSEHOLD_ID] for a shared-calendar event
 * that names nobody, and [] for an event that should not reach the wall.
 */
export function attributeEvent(
  event: { title: string; calendar_id?: string; calendarId?: string },
  members: FamilyMember[],
  explicitAssignee?: string | null,
): string[] {
  if (explicitAssignee) return [explicitAssignee];

  const calId = calendarIdOf(event);
  if (calId && EXCLUDED_CALENDAR_IDS.has(calId)) return [];

  if (calId && CALENDAR_OWNER[calId]) return [CALENDAR_OWNER[calId]];

  // A handoff names the kids but is not theirs: "Walk Ella & Kaleb to school"
  // is a parent's fifteen minutes. Unassigned, it belongs to the house — and
  // is the open question the wall asks in the evening (see wallQuestions).
  // A rotation ("Pickup · Ella: bus · Kaleb: aftercare") names the verb too,
  // but a per-person segment means it is telling each kid THEIR answer — that
  // is theirs, split downstream by titleForMember, not a question for an adult.
  if (isHandoffEvent(event.title ?? '') && !hasPerPersonSegments(event.title ?? '', members)) return [HOUSEHOLD_ID];

  const named = members
    .filter((m) => matchesName(event.title ?? '', m.name))
    .map((m) => m.id);
  if (named.length > 0) return named;

  return [HOUSEHOLD_ID];
}

/** The synthetic member the household lane renders from. */
export function householdMember(): FamilyMember {
  return { id: HOUSEHOLD_ID, name: 'Everyone', initials: 'ALL' } as FamilyMember;
}

/**
 * Separators a family actually types between one person's part and the next.
 *
 * A comma is deliberately absent: "Ella: PE, Art" is one person with two
 * specials, and splitting there would hand Ella "PE" and lose the rest.
 */
const SEGMENT_SPLIT = /\s*[·|;]\s*/;

/**
 * The part of an event title that belongs to ONE member.
 *
 * A family keeps a rotation on a single calendar row — "Specials — Ella:
 * Visual Art · Kaleb: PE" — because that is one thing to maintain instead of
 * ten recurring series. `attributeEvent` already puts that event in both kids'
 * rows, which is right; what was wrong is that both rows then rendered the
 * SAME string, truncated to "Specials — El…", so neither kid learned what
 * their own day held. Splitting the line per person is what puts a special on
 * an individual timeline rather than beside it.
 *
 * The rule is narrow on purpose: only a word-bounded `Name:` segment counts.
 * Anything else — "School — Ella & Kaleb", "Ella piano", "Dinner: pizza" —
 * comes back untouched, because a title that isn't addressed to one person is
 * genuinely shared and must keep its words.
 */
export function titleForMember(title: string, name: string): string {
  const first = name.trim().split(/\s+/)[0];
  if (!first || !title) return title;
  const escaped = first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // The kind prefix ("Specials — ") rides in front of the first segment's
  // name, so allow anything ahead of the word-bounded name. Word-bounded for
  // the same reason `matchesName` is: "Stella: Art" must not answer for Ella.
  const segment = new RegExp(`^.*?\\b${escaped}\\s*:\\s*(.+)$`, 'i');
  for (const part of title.split(SEGMENT_SPLIT)) {
    const value = part.match(segment)?.[1].trim();
    if (value) return value;
  }
  return title;
}

/**
 * A rotation title with its KIND prefix dropped: "Specials — Ella: Music ·
 * Kaleb: Library" becomes "Ella: Music · Kaleb: Library".
 *
 * For places that show the whole line rather than one person's half — the
 * wall's look-ahead card, which is ~36 characters wide. There the prefix cost
 * eleven of them and said what the rest of the line already makes obvious,
 * pushing the day's second item off the edge. Same convention `titleForMember`
 * reads: a household first name followed by a colon. A title with no such
 * segment ("School — Ella & Kaleb", "Iris call week") is left alone.
 */
export function withoutKindPrefix(title: string, members: FamilyMember[]): string {
  let earliest = -1;
  for (const m of members) {
    const first = m.name.trim().split(/\s+/)[0];
    if (!first) continue;
    const escaped = first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const at = title.search(new RegExp(`\\b${escaped}\\s*:`, 'i'));
    if (at >= 0 && (earliest < 0 || at < earliest)) earliest = at;
  }
  return earliest > 0 ? title.slice(earliest) : title;
}

/**
 * Verbs that make an event a HANDOFF — something an adult does to or for the
 * kids it names. Walk, pick up, drop off, take, drive, bring, collect. The
 * title starts with the verb ("Walk Ella & Kaleb to school", "Pick up Ella &
 * Kaleb from FFG"), which is how a family actually writes these. Deliberately
 * not "Grampappa picks up Ella & Kaleb": that already says who, and stays the
 * kids' own line ("who picks me up") rather than a question for the board.
 */
const HANDOFF_VERBS: { re: RegExp; doing: string }[] = [
  { re: /^walk\b/i, doing: 'walking' },
  { re: /^pick[ -]?up\b/i, doing: 'picking up' },
  { re: /^drop[ -]?off\b/i, doing: 'dropping off' },
  { re: /^take\b/i, doing: 'taking' },
  { re: /^drive\b/i, doing: 'driving' },
  { re: /^bring\b/i, doing: 'bringing' },
  { re: /^collect\b/i, doing: 'collecting' },
];

/** True when the title carries a word-bounded `Name:` segment for any member. */
export function hasPerPersonSegments(title: string, members: FamilyMember[]): boolean {
  return members.some((m) => {
    const first = m.name.trim().split(/\s+/)[0];
    if (!first) return false;
    const escaped = first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${escaped}\\s*:`, 'i').test(title);
  });
}

export function isHandoffEvent(title: string): boolean {
  const t = title.trim();
  return HANDOFF_VERBS.some((v) => v.re.test(t));
}

/**
 * The question a handoff poses when nobody has claimed it:
 * "Walk Ella & Kaleb to school" → "Who's walking Ella & Kaleb to school?"
 * Null for a title that is not a handoff.
 */
export function handoffQuestion(title: string): string | null {
  const t = title.trim();
  for (const v of HANDOFF_VERBS) {
    const m = t.match(v.re);
    if (!m) continue;
    const rest = t.slice(m[0].length).trim();
    return rest ? `Who's ${v.doing} ${rest}?` : `Who's ${v.doing}?`;
  }
  return null;
}

/**
 * A title with a trailing member list dropped: "School — Ella & Kaleb" on
 * Ella's own row is just "School". The row already says whose it is, and on
 * a stay that runs seven hours the names are the widest part of the label.
 * Only a tail made ENTIRELY of household first names comes off; "Dinner —
 * Grandma & Kaleb" keeps its words because Grandma is not on the roster.
 */
export function withoutMemberList(title: string, members: FamilyMember[]): string {
  const m = title.match(/^(.*?)\s*(?:—|–|-|\()\s*([^—–(]+?)\)?\s*$/);
  if (!m || !m[1].trim()) return title;
  const firsts = new Set(members.map((x) => x.name.trim().split(/\s+/)[0].toLowerCase()).filter(Boolean));
  const names = m[2].split(/\s*(?:&|,|\band\b|\+)\s*/).map((n) => n.trim()).filter(Boolean);
  if (names.length === 0 || !names.every((n) => firsts.has(n.toLowerCase()))) return title;
  return m[1].trim();
}
