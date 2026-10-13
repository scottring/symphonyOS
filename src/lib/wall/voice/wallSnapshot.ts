// What the kitchen wall knows right now, as plain lines — the only thing a
// spoken question is answered from (the wall-ask function). PURE.
//
// Everything here is already on the wall's shared screen (family context,
// household scope, privacy-filtered rows), so answering from it says nothing
// a person standing in the kitchen could not read. Nothing is fetched for it.

export interface SnapshotRow { time: string; end?: string | null; title: string; who: string[]; past?: boolean }
export interface SnapshotKid {
  name: string
  special?: string | null
  tomorrowSpecial?: string | null
  pickup?: { time: string; who: string | null } | null
  needed?: { title: string; tomorrow: boolean }[]
  homework?: { title: string; due: string | null; late: boolean }[]
  afterSchool?: { title: string; time: string | null; done: boolean }[]
}
export interface WallSnapshotInput {
  now: Date
  weather?: { temp: number; condition: string } | null
  today: SnapshotRow[]
  tomorrow?: SnapshotRow[]
  kids?: SnapshotKid[]
  dinnerTonight?: { title: string; at?: string | null } | null
  dinnerTomorrow?: string | null
  comingUp?: { dayLabel: string; summary: string }[]
  scratchpad?: { text: string; kind: 'note' | 'talk' }[]
  groceries?: string[] | null
}

const MAX = 6000

const rowLine = (r: SnapshotRow) =>
  `- ${r.time}${r.end ? `–${r.end}` : ''} ${r.title}${r.who.length ? ` (${r.who.join(', ')})` : ''}${r.past ? ' [done/past]' : ''}`

export function wallSnapshot(s: WallSnapshotInput): string {
  const day = s.now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  const time = s.now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const out: string[] = [`Now: ${day}, ${time}.`]
  if (s.weather) out.push(`Weather: ${Math.round(s.weather.temp)}°, ${s.weather.condition}.`)

  out.push('', 'Today:', ...(s.today.length ? s.today.map(rowLine) : ['- nothing scheduled']))
  if (s.dinnerTonight) out.push(`Dinner tonight: ${s.dinnerTonight.title}${s.dinnerTonight.at ? ` at ${s.dinnerTonight.at}` : ''}.`)
  else out.push('Dinner tonight: nothing planned.')

  for (const k of s.kids ?? []) {
    const bits: string[] = []
    if (k.special) bits.push(`special today: ${k.special}`)
    if (k.tomorrowSpecial) bits.push(`special tomorrow: ${k.tomorrowSpecial}`)
    if (k.pickup) bits.push(`pickup at ${k.pickup.time}${k.pickup.who ? ` by ${k.pickup.who}` : ', nobody has claimed it yet'}`)
    const needToday = (k.needed ?? []).filter((n) => !n.tomorrow).map((n) => n.title)
    const needTomorrow = (k.needed ?? []).filter((n) => n.tomorrow).map((n) => n.title)
    if (needToday.length) bits.push(`needs today: ${needToday.join(', ')}`)
    if (needTomorrow.length) bits.push(`needs tomorrow: ${needTomorrow.join(', ')}`)
    const hw = (k.homework ?? []).map((h) => `${h.title}${h.late ? ' (late)' : h.due ? ` (due ${h.due})` : ''}`)
    if (hw.length) bits.push(`homework: ${hw.join('; ')}`)
    const after = (k.afterSchool ?? []).map((a) => `${a.time ? `${a.time} ` : ''}${a.title}${a.done ? ' (done)' : ''}`)
    if (after.length) bits.push(`after school: ${after.join('; ')}`)
    out.push(`${k.name}: ${bits.length ? bits.join(' · ') : 'nothing special listed'}.`)
  }

  if (s.tomorrow) out.push('', 'Tomorrow:', ...(s.tomorrow.length ? s.tomorrow.map(rowLine) : ['- nothing scheduled']))
  if (s.dinnerTomorrow) out.push(`Dinner tomorrow: ${s.dinnerTomorrow}.`)
  if (s.comingUp?.length) out.push('', 'Coming up:', ...s.comingUp.map((c) => `- ${c.dayLabel}: ${c.summary}`))
  if (s.scratchpad?.length) out.push('', 'Scratchpad (notes and things to talk about):', ...s.scratchpad.map((n) => `- ${n.kind === 'talk' ? 'talk about: ' : ''}${n.text}`))
  if (s.groceries) out.push('', `Grocery list: ${s.groceries.length ? s.groceries.join(', ') : 'empty'}.`)

  const text = out.join('\n')
  return text.length > MAX ? `${text.slice(0, MAX - 1)}…` : text
}
