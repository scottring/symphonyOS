import type { SemanticToken } from '@/lib/parseRoutine'

interface SemanticRoutineProps {
  tokens: SemanticToken[]
  size?: 'sm' | 'md'
}

/**
 * Displays a routine as semantic tokens with color-coded styling
 */
export function SemanticRoutine({ tokens, size = 'md' }: SemanticRoutineProps) {
  const textSize = size === 'sm' ? 'text-sm' : 'text-base'
  const badgeSize = size === 'sm' ? 'text-xs px-1 py-0.5' : 'text-xs px-1.5 py-0.5'

  return (
    <span className={`inline-flex flex-wrap items-center gap-1 ${textSize}`}>
      {tokens.map((token, index) => (
        <TokenDisplay key={index} token={token} badgeSize={badgeSize} />
      ))}
    </span>
  )
}

interface TokenDisplayProps {
  token: SemanticToken
  badgeSize: string
}

function TokenDisplay({ token, badgeSize }: TokenDisplayProps) {
  switch (token.type) {
    case 'person':
      return (
        <span className="font-semibold text-blue-700">
          {token.text}
        </span>
      )

    case 'action':
      return (
        <span className="text-neutral-700">
          {token.text}
        </span>
      )

    case 'day-pattern':
      return (
        <span className={`${badgeSize} rounded bg-amber-100 text-amber-800 font-medium`}>
          {token.text}
        </span>
      )

    case 'time-of-day':
      return (
        <span className={`${badgeSize} rounded bg-purple-100 text-purple-800 font-medium`}>
          {token.text}
        </span>
      )

    case 'time':
      return (
        <span className="font-mono text-neutral-600">
          {token.text}
        </span>
      )

    case 'plain':
      return (
        <span className="text-neutral-500">
          {token.text}
        </span>
      )

    default:
      return (
        <span className="text-neutral-600">
          {token.text}
        </span>
      )
  }
}

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
