interface CompleteStepProps {
  onComplete: () => void
}

export function CompleteStep({ onComplete }: CompleteStepProps) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
      {/* Success icon */}
      <div className="w-20 h-20 rounded-full bg-primary-100 flex items-center justify-center mb-8">
        <svg
          className="w-10 h-10 text-primary-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 13l4 4L19 7"
          />
        </svg>
      </div>

      {/* Headline */}
      <h1 className="font-display text-4xl md:text-5xl font-semibold text-neutral-800 text-center mb-4">
        You're all set.
      </h1>

      {/* Subtitle */}
      <p className="text-lg text-neutral-500 text-center max-w-md mb-8">
        Your brain is empty. Symphony holds it all.
      </p>

      {/* Final tip */}
      <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-6 max-w-md mb-8">
        <p className="text-neutral-600 text-center">
          <span className="font-medium">One last thing:</span> at the end of each day,
          take 2 minutes to triage your inbox. That's the habit that makes this work.
        </p>
      </div>

      {/* Primary CTA */}
      <button
        onClick={onComplete}
        className="btn-primary px-8 py-3 text-lg font-medium mb-6"
      >
        Go to Today
      </button>

      {/* Optional calendar connect */}
      <div className="text-center">
        <p className="text-sm text-neutral-400 mb-2">Optional:</p>
        <button className="text-primary-600 hover:text-primary-700 text-sm underline">
          Connect Google Calendar
        </button>
        <p className="text-xs text-neutral-400 mt-1">
          See your events alongside your tasks
        </p>
      </div>
    </div>
  )
}
