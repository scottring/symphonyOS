interface PlanningIntroProps {
  onContinue: () => void
}

export function PlanningIntro({ onContinue }: PlanningIntroProps) {
  return (
    <div className="min-h-screen flex flex-col items-center px-6 py-12 pt-24">
      <div className="w-full max-w-lg">
        {/* Header */}
        <h1 className="font-display text-3xl md:text-4xl font-semibold text-neutral-800 text-center mb-4">
          Plan Your Day
        </h1>
        <p className="text-lg text-neutral-500 text-center mb-8">
          Drag and drop tasks onto your calendar.
        </p>

        {/* Visual representation - Planning grid mockup */}
        <div className="bg-white rounded-2xl border border-neutral-100 shadow-lg overflow-hidden mb-8">
          {/* Header */}
          <div className="px-4 py-3 border-b border-neutral-100 bg-neutral-50">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-neutral-600">Planning Mode</span>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-primary-500" />
                <span className="text-xs text-neutral-500">Interactive</span>
              </div>
            </div>
          </div>

          {/* Grid mockup */}
          <div className="p-4">
            <div className="flex gap-4">
              {/* Time column */}
              <div className="w-12 shrink-0 space-y-6 text-xs text-neutral-400">
                <div>9am</div>
                <div>10am</div>
                <div>11am</div>
                <div>12pm</div>
              </div>

              {/* Day column with items */}
              <div className="flex-1 space-y-2">
                {/* Calendar event */}
                <div className="bg-blue-100 border-l-4 border-blue-500 rounded-r-lg p-2 mb-4">
                  <div className="text-sm font-medium text-blue-800">Team standup</div>
                  <div className="text-xs text-blue-600">9:00 - 9:30</div>
                </div>

                {/* Dropped task */}
                <div className="bg-primary-50 border border-primary-200 rounded-lg p-2 relative">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded border-2 border-primary-400" />
                    <span className="text-sm text-neutral-700">Review proposal</span>
                  </div>
                  {/* Drag handle indicator */}
                  <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-2 h-6 bg-primary-300 rounded-full opacity-50" />
                </div>

                {/* Empty slot */}
                <div className="h-10 border border-dashed border-neutral-200 rounded-lg flex items-center justify-center">
                  <span className="text-xs text-neutral-400">Drop task here</span>
                </div>

                {/* Routine */}
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">🔄</span>
                    <span className="text-sm text-neutral-700">Lunch break</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Task drawer mockup */}
          <div className="border-t border-neutral-100 bg-neutral-50 p-4">
            <div className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">
              Unscheduled Tasks
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              <div className="shrink-0 bg-white border border-neutral-200 rounded-lg px-3 py-2 text-sm text-neutral-700 shadow-sm">
                Call dentist
              </div>
              <div className="shrink-0 bg-white border border-neutral-200 rounded-lg px-3 py-2 text-sm text-neutral-700 shadow-sm">
                Buy groceries
              </div>
              <div className="shrink-0 bg-white border border-neutral-200 rounded-lg px-3 py-2 text-sm text-neutral-400">
                + more
              </div>
            </div>
          </div>
        </div>

        {/* Key features */}
        <div className="space-y-3 mb-8">
          <div className="flex items-center gap-3 p-3 bg-neutral-50 rounded-lg">
            <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-neutral-800">Drag to schedule</p>
              <p className="text-xs text-neutral-500">Drop tasks onto time slots</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 bg-neutral-50 rounded-lg">
            <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-neutral-800">Resize for duration</p>
              <p className="text-xs text-neutral-500">Drag edges to set how long</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 bg-neutral-50 rounded-lg">
            <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-neutral-800">See your whole day</p>
              <p className="text-xs text-neutral-500">Events, routines, and tasks together</p>
            </div>
          </div>
        </div>

        {/* How to access */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-8">
          <p className="text-sm text-amber-800">
            <span className="font-semibold">🎯 Pro tip:</span> Open Planning mode from the Today view.
            Perfect for morning planning or the night before.
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
