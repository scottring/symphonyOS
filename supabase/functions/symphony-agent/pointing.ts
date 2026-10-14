// The page follows the conversation (Scott, 2026-10-14): while Symphony talks
// about days or tasks, the page lights them up. Pointing changes no data.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const realDate = (v: unknown) => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  const d = new Date(`${v}T12:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : null
}

export function pointAt(input: Record<string, unknown>): { dates: string[]; taskIds: string[] } | { error: string } {
  if (input.clear === true) return { dates: [], taskIds: [] }
  const dates = [...new Set((Array.isArray(input.dates) ? input.dates : []).map(realDate).filter((d): d is string => !!d))].slice(0, 7)
  const taskIds = [...new Set((Array.isArray(input.task_ids) ? input.task_ids : []).filter((t): t is string => typeof t === 'string' && UUID_RE.test(t)))].slice(0, 12)
  if (!dates.length && !taskIds.length) return { error: 'Point at real YYYY-MM-DD dates or task ids' }
  return { dates, taskIds }
}

export const POINT_TOOL = {
  name: 'symphony_point',
  description: 'Light up the days and/or tasks you are talking about on the page the person is looking at, so the page follows the conversation. Call it right before you ask about or describe specific days or tasks ("Baseball and the dentist are both Sunday at 10:30"). Changes no data. The highlight stays until you point again or the next turn starts; pass clear: true to remove it.',
  input_schema: {
    type: 'object',
    properties: {
      dates: { type: 'array', items: { type: 'string' }, description: 'YYYY-MM-DD days to light up (at most 7)' },
      task_ids: { type: 'array', items: { type: 'string' }, description: 'Task ids to light up (at most 12), e.g. from symphony_read_week' },
      clear: { type: 'boolean' },
    },
  },
}
