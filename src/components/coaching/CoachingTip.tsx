import { useState } from 'react'

interface CoachingTipProps {
  message: string
  examples: string[]
  onDismiss?: () => void
}

/**
 * CoachingTip - Gentle, proactive guidance for outcome-oriented language
 * Shows when vague patterns are detected in project/task names
 */
export function CoachingTip({ message, examples, onDismiss }: CoachingTipProps) {
  const [isDismissed, setIsDismissed] = useState(false)

  if (isDismissed) return null

  const handleDismiss = () => {
    setIsDismissed(true)
    onDismiss?.()
  }

  return (
    <div className="bg-amber-50/80 border border-amber-200/60 rounded-xl p-4 backdrop-blur-sm">
      <div className="flex items-start gap-3">
        {/* Lightbulb icon */}
        <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center text-amber-600 flex-shrink-0">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-4 h-4"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14c.015-.34.208-.646.477-.859a4 4 0 10-4.954 0c.27.213.462.519.476.859h4.002z" />
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          {/* Tip message */}
          <p className="text-sm font-medium text-amber-800 mb-2">{message}</p>

          {/* Examples */}
          {examples.length > 0 && (
            <div className="space-y-1">
              {examples.map((example, index) => (
                <p key={index} className="text-xs text-amber-700 leading-relaxed">
                  {example}
                </p>
              ))}
            </div>
          )}
        </div>

        {/* Dismiss button */}
        <button
          onClick={handleDismiss}
          className="flex-shrink-0 text-amber-400 hover:text-amber-600 transition-colors p-1 -mt-1 -mr-1"
          aria-label="Dismiss tip"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-4 h-4"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>
    </div>
  )
}
