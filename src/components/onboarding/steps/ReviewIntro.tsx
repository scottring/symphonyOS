interface ReviewIntroProps {
  onContinue: () => void
}

export function ReviewIntro({ onContinue }: ReviewIntroProps) {
  return (
    <div className="min-h-screen flex flex-col items-center px-6 py-12 pt-24">
      <div className="w-full max-w-lg">
        {/* Header */}
        <h1 className="font-display text-3xl md:text-4xl font-semibold text-neutral-800 text-center mb-4">
          The Weekly Review
        </h1>
        <p className="text-lg text-neutral-500 text-center mb-8">
          The habit that keeps everything on track.
        </p>

        {/* Visual representation */}
        <div className="bg-white rounded-2xl border border-neutral-100 shadow-lg p-6 mb-8">
          {/* Review illustration */}
          <div className="flex items-center justify-center mb-6">
            <div className="w-20 h-20 rounded-full bg-amber-100 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
          </div>

          {/* What review does */}
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-primary-600 font-semibold text-sm">1</span>
              </div>
              <div>
                <p className="font-medium text-neutral-800">Catch stale tasks</p>
                <p className="text-sm text-neutral-500">Tasks scheduled for the past that weren't completed surface automatically</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-primary-600 font-semibold text-sm">2</span>
              </div>
              <div>
                <p className="font-medium text-neutral-800">Decide quickly</p>
                <p className="text-sm text-neutral-500">Reschedule, push to next week, or delete — one tap each</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-primary-600 font-semibold text-sm">3</span>
              </div>
              <div>
                <p className="font-medium text-neutral-800">Stay current</p>
                <p className="text-sm text-neutral-500">Nothing slips through the cracks when you review regularly</p>
              </div>
            </div>
          </div>
        </div>

        {/* When to review */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-8">
          <p className="text-sm text-amber-800">
            <span className="font-semibold">📅 Best practice:</span> Do a quick review Sunday evening or Monday morning.
            Takes 5 minutes, saves hours of confusion.
          </p>
        </div>

        {/* How to access */}
        <div className="bg-neutral-50 rounded-lg p-4 mb-8">
          <p className="text-sm text-neutral-600 text-center">
            Look for the <span className="font-medium">Review</span> button in your Today view when you have overdue tasks.
          </p>
        </div>

        {/* CTA */}
        <div className="flex justify-center">
          <button
            onClick={onContinue}
            className="btn-primary px-8 py-3 text-lg font-medium"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  )
}
