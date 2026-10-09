/** Derive canvas updates only from a successful, persisted row returned by a write. */
export function planSaved(tool: string, input: Record<string, unknown>, result: string) {
  if (!['symphony_create_plan_item', 'symphony_link_plan_item', 'symphony_update_intention', 'symphony_update_task'].includes(tool)) return null
  let row: Record<string, unknown>
  try { row = JSON.parse(result) } catch { return null }
  if (!row || typeof row.id !== 'string' || row.error) return null
  const level = tool === 'symphony_update_intention' ? 'year'
    : tool === 'symphony_create_plan_item' || tool === 'symphony_link_plan_item' ? input.level
    : row.week_start ? 'week' : row.month_start ? 'month' : row.season_start ? 'season' : null
  const index = ['year', 'season', 'month', 'week'].indexOf(String(level))
  if (index < 0) return null
  const date = level === 'year' ? `${row.year}-01-01`
    : row[level === 'season' ? 'season_start' : level === 'month' ? 'month_start' : 'week_start']
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  return { type: 'plan_saved' as const, id: row.id, level: index, date }
}
