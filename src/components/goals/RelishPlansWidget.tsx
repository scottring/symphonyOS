import { useState, useEffect } from 'react'
import { getActiveRelishPlans, isRelishConfigured, type RelishPlan } from '@/lib/relishApi'

export function RelishPlansWidget() {
  const familyId = import.meta.env.VITE_RELISH_FAMILY_ID as string | undefined
  const [plans, setPlans] = useState<RelishPlan[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!familyId || !isRelishConfigured()) {
      setLoading(false)
      return
    }

    const fetchPlans = async () => {
      setLoading(true)
      const data = await getActiveRelishPlans(familyId)
      setPlans(data)
      setLoading(false)
    }

    fetchPlans()
  }, [familyId])

  if (!isRelishConfigured() || (!loading && plans.length === 0)) {
    return null
  }

  const getProgress = (plan: RelishPlan) => {
    if (!plan.startDate) return 0
    const start = plan.startDate.toDate()
    const now = new Date()
    const daysPassed = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
    return Math.min(Math.round((daysPassed / plan.duration) * 100), 100)
  }

  const getCurrentPhase = (plan: RelishPlan) => {
    if (!plan.startDate) return plan.phases[0]
    const start = plan.startDate.toDate()
    const now = new Date()
    const daysPassed = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
    const currentWeek = Math.min(Math.ceil(daysPassed / 7), Math.ceil(plan.duration / 7))
    return plan.phases.find(p => currentWeek >= p.weekStart && currentWeek <= p.weekEnd)
  }

  return (
    <section className="mt-10">
      {/* Section divider */}
      <div className="flex items-center gap-3 mb-6">
        <div className="h-px flex-1 bg-neutral-200" />
        <span className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
          Relish Family Plans
        </span>
        <div className="h-px flex-1 bg-neutral-200" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 border-neutral-200 border-t-primary-500 rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          {plans.map(plan => {
            const progress = getProgress(plan)
            const currentPhase = getCurrentPhase(plan)
            const milestonesAchieved = plan.milestones.filter(m => m.achieved).length

            return (
              <div
                key={plan.planId}
                className="p-5 rounded-2xl bg-white border border-neutral-100 hover:border-primary-200 hover:shadow-md transition-all duration-200"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700 text-xs font-medium">
                        Active
                      </span>
                      <span className="text-xs text-neutral-400">
                        {plan.duration} days
                      </span>
                    </div>
                    <h3 className="font-medium text-neutral-800 truncate">
                      {plan.title}
                    </h3>
                    {currentPhase && (
                      <p className="text-sm text-neutral-500 mt-0.5">
                        Phase: {currentPhase.title}
                      </p>
                    )}
                  </div>

                  {/* Milestone badge */}
                  <div className="flex-shrink-0 text-right">
                    <div className="text-xs text-neutral-400">Milestones</div>
                    <div className="text-sm font-semibold text-neutral-700 tabular-nums">
                      {milestonesAchieved}/{plan.milestones.length}
                    </div>
                  </div>
                </div>

                {/* Progress bar */}
                <div>
                  <div className="flex justify-between text-xs text-neutral-400 mb-1">
                    <span>Progress</span>
                    <span className="tabular-nums">{progress}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-neutral-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary-500 rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                {plan.targetChallenge && (
                  <p className="mt-2 text-xs text-neutral-400">
                    Target: {plan.targetChallenge}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
