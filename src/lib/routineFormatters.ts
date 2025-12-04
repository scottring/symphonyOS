/**
 * Format a routine for display when no raw_input exists (legacy routines)
 * Returns simple text description
 */
export function formatLegacyRoutine(
  name: string,
  recurrenceType: string,
  days?: string[],
  timeOfDay?: string | null
): string {
  let recurrenceText = ''

  switch (recurrenceType) {
    case 'daily':
      recurrenceText = 'every day'
      break
    case 'weekly': {
      if (!days || days.length === 0) {
        recurrenceText = 'weekly'
      } else if (days.length === 5 && !days.includes('sat') && !days.includes('sun')) {
        recurrenceText = 'weekdays'
      } else if (days.length === 2 && days.includes('sat') && days.includes('sun')) {
        recurrenceText = 'weekends'
      } else {
        const dayMap: Record<string, string> = {
          sun: 'Sun', mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat'
        }
        recurrenceText = 'every ' + days.map(d => dayMap[d] || d).join(', ')
      }
      break
    }
    case 'monthly':
      recurrenceText = 'monthly'
      break
    default:
      recurrenceText = ''
  }

  let timeText = ''
  if (timeOfDay) {
    const [hours, minutes] = timeOfDay.split(':').map(Number)
    const h12 = hours % 12 || 12
    const meridiem = hours >= 12 ? 'pm' : 'am'
    timeText = minutes === 0 ? `at ${h12}${meridiem}` : `at ${h12}:${minutes.toString().padStart(2, '0')}${meridiem}`
  }

  return [name, recurrenceText, timeText].filter(Boolean).join(' ')
}
