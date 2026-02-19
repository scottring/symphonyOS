import { useMemo } from 'react'
import { getAllCoachingSections, scoreToColor } from '@/config/layers'
import type { CoachingSection } from '@/config/layers'
import type { DomainAssessment } from '@/types/layer'
import type { FamilyRule } from '@/types/playbook'
import type { ResearchWorkspace } from '@/types/planning'
import type { PlaybookBlock } from '@/types/playbook'

interface CoachingHubProps {
  assessments: DomainAssessment[]
  assessmentsLoading: boolean
  rules: FamilyRule[]
  workspaces: ResearchWorkspace[]
  blocks: PlaybookBlock[]
  onOpenRules: () => void
  onOpenResearch: () => void
  onOpenWeeklyReview: () => void
  onOpenPlaybook: () => void
  onOpenAssessment: (layerSlug: string) => void
  onOpenDomain: (layerSlug: string, domainSlug: string) => void
}

export function CoachingHub({
  assessments,
  assessmentsLoading,
  rules,
  workspaces,
  blocks,
  onOpenRules,
  onOpenResearch,
  onOpenWeeklyReview,
  onOpenPlaybook,
  onOpenAssessment,
  onOpenDomain,
}: CoachingHubProps) {
  const sections = useMemo(() => getAllCoachingSections(), [])

  // Build score map: domainSlug → score
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
        <div className="mb-8">
          <h1 className="font-display text-2xl font-semibold text-neutral-800">Coaching</h1>
          <p className="text-sm text-neutral-500 mt-1">Your personal coaching dashboard</p>
        </div>

        {/* ── BASELINE ───────────────────────────────────────── */}
        <section>
          <h2 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-5">
            Baseline
          </h2>

          <div className="space-y-6">
            {sections.map(section => (
              <SectionRow
                key={section.slug}
                section={section}
                scoreMap={scoreMap}
                loading={assessmentsLoading}
                onOpenDomain={(domainSlug) => onOpenDomain(section.slug, domainSlug)}
                onOpenAssessment={() => onOpenAssessment(section.slug)}
              />
            ))}
          </div>
        </section>

        {/* ── TOOLS ────────────────────────────────────────────── */}
        <section className="mt-10">
          <h2 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-4">
            Tools
          </h2>

          <div className="grid grid-cols-2 gap-3">
            <ToolCard
              title="Rules"
              subtitle={`${activeRulesCount} active`}
              icon={
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              }
              onClick={onOpenRules}
            />
            <ToolCard
              title="Research"
              subtitle={`${activeWorkspacesCount} workspace${activeWorkspacesCount !== 1 ? 's' : ''}`}
              icon={
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z" />
                </svg>
              }
              onClick={onOpenResearch}
            />
            <ToolCard
              title="Playbook"
              subtitle={`${blocks.length} block${blocks.length !== 1 ? 's' : ''}`}
              icon={
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
              }
              onClick={onOpenPlaybook}
            />
            <ToolCard
              title="Weekly Review"
              subtitle="Feedback & planning"
              icon={
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                </svg>
              }
              onClick={onOpenWeeklyReview}
            />
          </div>
        </section>
      </div>
    </div>
  )
}

// ── Section Row ──────────────────────────────────────────────────────

function SectionRow({
  section,
  scoreMap,
  loading,
  onOpenDomain,
  onOpenAssessment,
}: {
  section: CoachingSection
  scoreMap: Map<string, number>
  loading: boolean
  onOpenDomain: (domainSlug: string) => void
  onOpenAssessment: () => void
}) {
  const assessedCount = section.domains.filter(d => scoreMap.has(d.slug)).length

  return (
    <div>
      {/* Section header */}
      <div className="flex items-center gap-2 mb-2.5">
        <span className={`text-sm font-semibold ${section.color}`}>{section.name}</span>
        {assessedCount < section.domains.length && (
          <button
            onClick={onOpenAssessment}
            className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${section.bgColor} ${section.color} hover:opacity-80 transition-opacity`}
          >
            {assessedCount === 0 ? 'Assess' : `${assessedCount}/${section.domains.length}`}
          </button>
        )}
      </div>

      {/* Domain chips */}
      {loading ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {section.domains.map(d => (
            <div key={d.slug} className="w-20 h-16 rounded-lg bg-neutral-100 animate-pulse shrink-0" />
          ))}
        </div>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {section.domains.map(domain => {
            const score = scoreMap.get(domain.slug) ?? null
            const colors = scoreToColor(score)
            return (
              <button
                key={domain.slug}
                onClick={() => score !== null ? onOpenDomain(domain.slug) : onOpenAssessment()}
                className={`
                  shrink-0 min-w-[72px] rounded-lg border px-3 py-2 text-center transition-all
                  hover:shadow-sm hover:scale-[1.02] active:scale-[0.98]
                  ${colors.bg} ${colors.border}
                `}
              >
                <p className="text-[10px] font-medium text-neutral-500 truncate mb-0.5">
                  {domain.name.split(' ')[0]}
                </p>
                <p className={`text-lg font-bold ${colors.text}`}>
                  {score !== null ? score : '--'}
                </p>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Tool Card ────────────────────────────────────────────────────────

function ToolCard({ title, subtitle, icon, onClick }: {
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
