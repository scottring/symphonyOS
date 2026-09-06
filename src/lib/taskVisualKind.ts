import type { TaskCategory } from '@/types/task'

export type TaskVisualKind =
  | 'appointment'
  | 'activity'
  | 'meal'
  | 'shopping'
  | 'call'
  | 'form'
  | 'routine'
  | 'task'

const CALL_ANCHORED_RE = /^\s*(call|phone|text|email)\b/i
const APPOINTMENT_RE = /\b(appointment|dentist|doctor|dr\.?|therapy|checkup|visit|meeting|call with|consult)\b/i
const ERRAND_RE = /\b(dry cleaning|post office|return .* books|drop off)\b/i
const MEAL_OUT_RE = /\b(lunch|dinner|brunch|breakfast)\b.*\bat\b/i
const ACTIVITY_RE = /\b(soccer|climbing|practice|game|drop[- ]?off|lesson|class|camp|school|gym|workout)\b/i
const MEAL_RE = /\b(breakfast|lunch|dinner|meal|tacos|cook|prep|leftovers|recipe)\b/i
const SHOPPING_RE = /\b(buy|order|grocer(?:y|ies)|shopping|snacks|strawberries|hardware|pick up .+ from (?:store|market|pharmacy))\b/i
const CALL_RE = /\b(call|phone|text|email|send|follow up|reply)\b/i
const FORM_RE = /\b(form|forms|permission slip|waiver|envelope|proposal|draft|paperwork)\b/i

export function inferTaskVisualKind(input: {
  title: string
  category?: TaskCategory | null
  note?: string | null
  id?: string | null
}): TaskVisualKind {
  if (input.id?.startsWith('routine:')) return 'routine'
  if (input.category === 'event') return 'appointment'
  if (input.category === 'activity') return 'activity'
  if (input.category === 'errand') return 'shopping'
  if (input.category === 'chore') return 'task'

  const text = `${input.title} ${input.note ?? ''}`
  if (CALL_ANCHORED_RE.test(input.title)) return 'call'
  if (APPOINTMENT_RE.test(text)) return 'appointment'
  if (SHOPPING_RE.test(text)) return 'shopping'
  if (ERRAND_RE.test(text)) return 'task'
  if (MEAL_OUT_RE.test(text)) return 'appointment'
  if (MEAL_RE.test(text)) return 'meal'
  if (ACTIVITY_RE.test(text)) return 'activity'
  if (CALL_RE.test(text)) return 'call'
  if (FORM_RE.test(text)) return 'form'
  return 'task'
}

export const TASK_KIND_LABEL: Record<TaskVisualKind, string> = {
  appointment: 'Appointment',
  activity: 'Activity',
  meal: 'Meal',
  shopping: 'To buy',
  call: 'Message',
  form: 'Paperwork',
  routine: 'Routine',
  task: 'Task',
}
