import type { Choice, ChoiceOption, FollowUp } from '@/types/choice'
import { formatCents, workLabel } from './price'

const DAY = 86400000
const shortDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
const weekday = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short' })
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export function choiceSummary(
  options: readonly ChoiceOption[],
  followUps: readonly FollowUp[],
  now: Date,
): string {
  const live = options.filter((o) => o.status !== 'ruled_out')
  const heard = options.filter((o) => o.status === 'heard_back').length
  const ruledOut = options.length - live.length
  const parts = [plural(live.length, 'option'), heard > 0 ? `${heard} heard back` : 'none heard back yet']

  const byId = new Map(options.map((o) => [o.id, o]))
  const waits = new Set<string>()
  let longest = 0
  for (const f of followUps) {
    // Waiting is a Contacted option's fact: once it has heard back (or is
    // ruled out or chosen) an open follow-up no longer counts.
    const o = byId.get(f.optionId)
    if (f.completed || o?.status !== 'contacted') continue
    const since = f.waitingSince ?? o.statusChangedAt
    waits.add(f.optionId)
    if (since) longest = Math.max(longest, Math.floor((now.getTime() - since.getTime()) / DAY))
  }
  if (waits.size > 0) parts.push(`${waits.size} waiting ${plural(longest, 'day')}`)
  if (ruledOut > 0) parts.push(`${ruledOut} ruled out`)
  return parts.join(' · ')
}

export function optionFact(
  option: ChoiceOption,
  followUp: FollowUp | undefined,
  now: Date,
): string | null {
  if (option.status !== 'contacted') return null
  const parts = [`Contacted ${shortDate(option.statusChangedAt)}`, 'no reply']
  if (followUp && !followUp.completed && followUp.scheduledFor) {
    const days = Math.round((startOfDay(followUp.scheduledFor) - startOfDay(now)) / DAY)
    parts.push(`follow-up ${days >= 0 && days <= 6 ? weekday(followUp.scheduledFor) : shortDate(followUp.scheduledFor)}`)
  }
  return parts.join(' · ')
}

export function decidedSummary(choice: Choice, options: readonly ChoiceOption[]): string {
  const chosen = options.find((o) => o.id === choice.chosenOptionId)
  const parts = [`Chose ${chosen?.name ?? 'an option'}`]
  if (choice.decidedAt) parts.push(shortDate(choice.decidedAt))
  if (choice.decidedWork.length > 0) parts.push(workLabel(choice.decidedWork, choice.work))
  if (choice.decidedAmountCents != null) parts.push(formatCents(choice.decidedAmountCents))
  return parts.join(' · ')
}
