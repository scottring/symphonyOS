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
