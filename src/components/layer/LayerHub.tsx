import { useMemo } from 'react'
import { scoreToColor } from '@/config/layers'
import type { LayerHubConfig } from '@/config/layers'
import type { DomainAssessment } from '@/types/layer'
import type { FamilyRule } from '@/types/playbook'
import type { ResearchWorkspace } from '@/types/planning'
import type { PlaybookBlock } from '@/types/playbook'

interface LayerHubProps {
  config: LayerHubConfig
  assessments: DomainAssessment[]
  assessmentsLoading: boolean
  rules: FamilyRule[]
  workspaces: ResearchWorkspace[]
  blocks: PlaybookBlock[]
  onBack: () => void
  onOpenRules: () => void
  onOpenResearch: () => void
  onOpenWeeklyReview: () => void
  onOpenPlaybook: () => void
  onOpenAssessment: () => void
  onOpenDomain: (domainSlug: string) => void
}

export function LayerHub({
  config,
  assessments,
  assessmentsLoading,
  rules,
  workspaces,
  blocks,
  onBack,
  onOpenRules,
  onOpenResearch,
  onOpenWeeklyReview,
  onOpenPlaybook,
  onOpenAssessment,
  onOpenDomain,
}: LayerHubProps) {
  const assessedCount = assessments.length
  const totalDomains = config.domains.length

  // Build score map for quick lookup
  const scoreMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const a of assessments) {
      map.set(a.domainSlug, a.harmonyScore)
    }
    return map
  }, [assessments])

  const activeRulesCount = rules.filter(r => r.status === 'active').length
  const activeWorkspacesCount = workspaces.filter(w => w.status === 'active').length

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-2xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <button
            onClick={onBack}
            className="p-2 -ml-2 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>
          </button>
          <div>
            <h1 className="font-display text-2xl font-semibold text-neutral-800">{config.name}</h1>
            <p className="text-sm text-neutral-500">{config.tagline}</p>
          </div>
        </div>

        {/* ── BASELINE ───────────────────────────────────────── */}
        <section className="mt-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
              Baseline
            </h2>
            <span className="text-xs text-neutral-400">
              {assessedCount}/{totalDomains} assessed
            </span>
          </div>

          {assessmentsLoading ? (
            <div className="flex gap-3 overflow-x-auto pb-2">
              {config.domains.map(d => (
                <div key={d.slug} className="w-20 h-24 rounded-xl bg-neutral-100 animate-pulse shrink-0" />
              ))}
            </div>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
              {config.domains.map(domain => {
                const score = scoreMap.get(domain.slug) ?? null
                const colors = scoreToColor(score)
                return (
                  <button
                    key={domain.slug}
                    onClick={() => score !== null ? onOpenDomain(domain.slug) : onOpenAssessment()}
                    className={`
                      shrink-0 w-20 rounded-xl border p-3 text-center transition-all
                      hover:shadow-sm hover:scale-[1.02] active:scale-[0.98]
                      ${colors.bg} ${colors.border}
                    `}
                  >
                    <p className="text-[11px] font-medium text-neutral-600 truncate mb-1.5">
                      {domain.name.split(' ')[0]}
                    </p>
                    <p className={`text-xl font-bold ${colors.text}`}>
                      {score !== null ? score : '--'}
                    </p>
                  </button>
                )
              })}
            </div>
          )}

          {assessedCount < totalDomains && (
            <button
              onClick={onOpenAssessment}
              className={`
                mt-3 w-full py-2.5 rounded-lg text-sm font-medium transition-colors
                ${config.bgColor} ${config.color} hover:opacity-80
              `}
            >
              {assessedCount === 0 ? 'Start Assessment' : 'Complete Assessment'} →
            </button>
          )}
        </section>

        {/* ── QUICK NAV ──────────────────────────────────────── */}
        <section className="mt-10">
          <h2 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-4">
            Quick Nav
          </h2>

          <div className="grid grid-cols-2 gap-3">
            <NavCard
              title={config.rulesLabel}
              subtitle={`${activeRulesCount} active`}
              icon={
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              }
              onClick={onOpenRules}
            />
            <NavCard
              title="Weekly Review"
              subtitle="Feedback & planning"
              icon={
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                </svg>
              }
              onClick={onOpenWeeklyReview}
            />
            <NavCard
              title="Research"
              subtitle={`${activeWorkspacesCount} workspace${activeWorkspacesCount !== 1 ? 's' : ''}`}
              icon={
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z" />
                </svg>
              }
              onClick={onOpenResearch}
            />
            <NavCard
              title="Playbook"
              subtitle={`${blocks.length} block${blocks.length !== 1 ? 's' : ''}`}
              icon={
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
              }
              onClick={onOpenPlaybook}
            />
          </div>
        </section>
      </div>
    </div>
  )
}

// ── NavCard ──────────────────────────────────────────────────────────

function NavCard({ title, subtitle, icon, onClick }: {
  title: string
  subtitle: string
  icon: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="
        text-left p-4 bg-white rounded-xl border border-neutral-150
        hover:border-primary-200 hover:shadow-sm transition-all
        group
      "
    >
      <div className="text-neutral-400 group-hover:text-primary-600 transition-colors mb-2">
        {icon}
      </div>
      <p className="text-sm font-semibold text-neutral-800">{title}</p>
      <p className="text-xs text-neutral-400 mt-0.5">{subtitle}</p>
    </button>
  )
}
