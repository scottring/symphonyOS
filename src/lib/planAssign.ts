// src/lib/planAssign.ts
//
// Plan-from-paper: assignment is a rule, not a vibe. The model's raw
// assignee_id guess is inconsistent line to line ("Edith: sign form" landing
// on Alex, a kid's own practice landing on someone else). This module is the
// one deterministic pass every parsed line goes through afterward: a named
// adult does it; a named kid is who a line is ABOUT unless the verb is
// theirs (their own homework, practice, game). Pure — no DOM, no fetch.

export interface PlanMember {
  id: string
  name: string
  role: string | null
}

export interface AssignDecision {
  title: string
  assigneeId: string | null
  contactMemberId: string | null
}

const KID_ROLES = new Set(['child', 'kid', 'family'])
// Verbs a kid does for themselves. Everything else about a kid is an adult's errand.
const KID_OWN_VERBS = /\b(finish|do|study|practice|practise|read|reading|homework|clean|tidy|pack|soccer|piano|game|lesson|club|chores?)\b/i
const APPOINTMENT_LIKE = /\b(dentist|doctor|dr\.?|orthodont|checkup|appointment|physical|haircut|shots?)\b/i

function isKid(m: PlanMember): boolean {
  return !!m.role && KID_ROLES.has(m.role.toLowerCase())
}

const escapeName = (name: string) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Scan by FORM, not by member: every member is checked for a prefix match
 *  before any is checked for a possessive, and every member for a possessive
 *  before any is checked for a plain mention. Household member order
 *  (`display_order`) is not guaranteed to list adults before children, so a
 *  per-member loop would let an early kid's plain mention shadow a later
 *  adult's explicit "Name:" prefix in the same line. */
function nameAt(title: string, members: PlanMember[]): { member: PlanMember; form: 'prefix' | 'possessive' | 'mention' } | null {
  for (const m of members) {
    if (new RegExp(`^${escapeName(m.name)}\\s*:`, 'i').test(title)) return { member: m, form: 'prefix' }
  }
  for (const m of members) {
    if (new RegExp(`\\b${escapeName(m.name)}'s\\b`, 'i').test(title)) return { member: m, form: 'possessive' }
  }
  for (const m of members) {
    if (new RegExp(`\\b${escapeName(m.name)}\\b`, 'i').test(title)) return { member: m, form: 'mention' }
  }
  return null
}

/** The one rule: a named adult does it; a named kid is who it is ABOUT unless the verb is theirs. */
export function decideAssignment(title: string, modelAssigneeId: string | null, members: PlanMember[], isGoal: boolean): AssignDecision {
  const clean = title.trim()
  if (isGoal) return { title: clean, assigneeId: null, contactMemberId: null }
  const hit = nameAt(clean, members)
  if (!hit) {
    const model = members.find((m) => m.id === modelAssigneeId)
    // Trust the model only for an adult; a kid with no name in the line is a misread.
    return { title: clean, assigneeId: model && !isKid(model) ? model.id : null, contactMemberId: null }
  }
  const { member, form } = hit
  const rest = form === 'prefix' ? clean.replace(/^[^:]+:\s*/, '') : clean
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
  if (!isKid(member)) {
    return { title: cap(rest), assigneeId: member.id, contactMemberId: null }
  }
  // A kid: theirs if the verb is theirs; otherwise an adult's errand ABOUT them.
  if (KID_OWN_VERBS.test(rest) && !APPOINTMENT_LIKE.test(rest)) {
    return { title: cap(form === 'prefix' ? rest : clean), assigneeId: member.id, contactMemberId: null }
  }
  const spoken = form === 'prefix' ? `Take ${member.name} to ${rest.replace(/^(to|the)\s+/i, '')}` : clean
  return { title: cap(spoken), assigneeId: null, contactMemberId: member.id }
}
