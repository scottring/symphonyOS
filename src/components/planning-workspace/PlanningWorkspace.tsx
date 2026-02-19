import { useState, useMemo } from 'react'
import { useMobile } from '@/hooks/useMobile'
import type { PlanningResource, CreatePlanningResourceInput, UpdatePlanningResourceInput, ResearchWorkspace, CreateWorkspaceInput, UpdateWorkspaceInput } from '@/types/planning'
import type { PlaybookBlock, CreateBlockInput, UpdateBlockInput, FamilyRule } from '@/types/playbook'
import type { BlockFeedbackSummary, WeeklyStats as WeeklyStatsType } from '@/hooks/useWeeklyFeedback'
import type { AIPlaybookResult } from '@/hooks/useAIPlaybookSuggestions'
import { WorkspaceList } from './WorkspaceList'
import { WorkspaceView } from './WorkspaceView'
import { DraftRulesList } from './DraftRulesList'
import { WeeklyReviewTab } from './WeeklyReviewTab'

interface PlanningWorkspaceProps {
  // Resources
  resources: PlanningResource[]
  loading: boolean
  onAddResource: (input: CreatePlanningResourceInput) => Promise<PlanningResource | null>
  onUpdateResource: (id: string, updates: UpdatePlanningResourceInput) => Promise<void>
  onDeleteResource: (id: string) => Promise<void>
  onUploadFile: (resourceId: string, file: File) => Promise<string | null>
  onGetSignedUrl: (filePath: string) => Promise<string | null>
  // Workspaces
  workspaces: ResearchWorkspace[]
  workspacesLoading: boolean
  onCreateWorkspace: (input: CreateWorkspaceInput) => Promise<ResearchWorkspace | null>
  onUpdateWorkspace: (id: string, updates: UpdateWorkspaceInput) => Promise<void>
  onDeleteWorkspace: (id: string) => Promise<void>
  onMarkWorkspaceSynthesized: (id: string) => Promise<void>
  // Rules
  rules: FamilyRule[]
  onAddRule: (input: { rule: string; appliesTo?: string[]; rationale?: string; enforcementTip?: string; status?: string }) => Promise<FamilyRule | null>
  onUpdateRule: (id: string, updates: Partial<Pick<FamilyRule, 'rule' | 'appliesTo' | 'status' | 'rationale' | 'enforcementTip'>>) => void
  onDeleteRule: (id: string) => void
  onViewPublishedRules?: () => void
  // Weekly Review (optional — only present when playbook data is available)
  weeklyReview?: {
    blockSummaries: BlockFeedbackSummary[]
    overallStats: WeeklyStatsType
    flaggedBlocks: BlockFeedbackSummary[]
    feedbackLoading: boolean
    weekOf: string
    onWeekChange: (weekOf: string) => void
    blocks: PlaybookBlock[]
    onAddBlock: (input: CreateBlockInput) => Promise<PlaybookBlock | null>
    onUpdateBlock: (id: string, updates: UpdateBlockInput) => Promise<void>
    onDeleteBlock: (id: string) => Promise<void>
    onReorderBlocks: (blockIds: string[]) => Promise<void>
    // AI suggestions
    aiResult: AIPlaybookResult | null
    aiLoading: boolean
    aiError: string | null
    onGenerateAI: (weekOf: string) => void
    onAcceptSuggestion: (index: number) => void
    onRejectSuggestion: (index: number) => void
  }
  onBack?: () => void
  initialTab?: 'research' | 'rules' | 'weekly-review'
}

type MobileTab = 'research' | 'rules' | 'review'
type DesktopRightPanel = 'rules' | 'review'

export function PlanningWorkspace({
  resources,
  loading,
  onAddResource,
  onUpdateResource,
  onDeleteResource,
  onUploadFile,
  onGetSignedUrl,
  workspaces,
  workspacesLoading,
  onCreateWorkspace,
  onDeleteWorkspace,
  onMarkWorkspaceSynthesized,
  rules,
  onAddRule,
  onUpdateRule,
  onDeleteRule,
  onViewPublishedRules,
  weeklyReview,
  onBack,
  initialTab,
}: PlanningWorkspaceProps) {
  const isMobile = useMobile()
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null)
  const [mobileTab, setMobileTab] = useState<MobileTab>(
    initialTab === 'weekly-review' ? 'review' : initialTab === 'rules' ? 'rules' : 'research'
  )
  const [desktopRightPanel, setDesktopRightPanel] = useState<DesktopRightPanel>(
    initialTab === 'weekly-review' ? 'review' : 'rules'
  )

  const selectedWorkspace = useMemo(() => {
    if (!selectedWorkspaceId) return null
    return workspaces.find(w => w.id === selectedWorkspaceId) ?? null
  }, [selectedWorkspaceId, workspaces])

  // Resource counts per workspace
  const resourceCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const r of resources) {
      if (r.workspaceId) {
        counts[r.workspaceId] = (counts[r.workspaceId] || 0) + 1
      }
    }
    return counts
  }, [resources])

  const draftRules = useMemo(() => rules.filter(r => r.status === 'draft'), [rules])
  const publishedCount = useMemo(() => rules.filter(r => r.status === 'active').length, [rules])

  const handleCreateWorkspace = async (name: string, description?: string) => {
    return onCreateWorkspace({ name, description })
  }

  const handleDeleteWorkspace = async (id: string) => {
    await onDeleteWorkspace(id)
    if (selectedWorkspaceId === id) setSelectedWorkspaceId(null)
  }

  // Research tab content (shared between mobile and desktop)
  const researchContent = selectedWorkspace ? (
    <WorkspaceView
      workspace={selectedWorkspace}
      resources={resources}
      loading={loading}
      onBack={() => setSelectedWorkspaceId(null)}
      onAddResource={onAddResource}
      onUpdateResource={onUpdateResource}
      onDeleteResource={onDeleteResource}
      onUploadFile={onUploadFile}
      onGetSignedUrl={onGetSignedUrl}
      onAddRule={onAddRule}
      onMarkSynthesized={onMarkWorkspaceSynthesized}
      onDeleteWorkspace={handleDeleteWorkspace}
    />
  ) : (
    <WorkspaceList
      workspaces={workspaces}
      loading={workspacesLoading}
      resourceCounts={resourceCounts}
      onSelectWorkspace={setSelectedWorkspaceId}
      onCreateWorkspace={handleCreateWorkspace}
    />
  )

  // Mobile layout: tabbed
  if (isMobile) {
    return (
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="px-4 pt-4 pb-2 flex items-center gap-3">
          {onBack && (
            <button onClick={onBack} className="p-2 -ml-2 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors">
              <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
              </svg>
            </button>
          )}
          <h1 className="font-display text-2xl font-semibold text-neutral-800">Planning</h1>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mx-4 mb-2 p-1 bg-neutral-100 rounded-lg">
          <button
            onClick={() => setMobileTab('research')}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
              mobileTab === 'research' ? 'bg-white text-neutral-800 shadow-sm' : 'text-neutral-500'
            }`}
          >
            Research
          </button>
          <button
            onClick={() => setMobileTab('rules')}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
              mobileTab === 'rules' ? 'bg-white text-neutral-800 shadow-sm' : 'text-neutral-500'
            }`}
          >
            Rules {draftRules.length > 0 && `(${draftRules.length})`}
          </button>
          {weeklyReview && (
            <button
              onClick={() => setMobileTab('review')}
              className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
                mobileTab === 'review' ? 'bg-white text-neutral-800 shadow-sm' : 'text-neutral-500'
              }`}
            >
              Review
              {weeklyReview.flaggedBlocks.length > 0 && (
                <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-100 text-red-600 text-[9px] font-bold">
                  {weeklyReview.flaggedBlocks.length}
                </span>
              )}
            </button>
          )}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-hidden">
          {mobileTab === 'research' ? (
            researchContent
          ) : mobileTab === 'rules' ? (
            <DraftRulesList
              draftRules={draftRules}
              publishedCount={publishedCount}
              onAddRule={onAddRule}
              onUpdateRule={onUpdateRule}
              onDeleteRule={onDeleteRule}
              onViewPublished={onViewPublishedRules}
            />
          ) : weeklyReview ? (
            <WeeklyReviewTab
              blockSummaries={weeklyReview.blockSummaries}
              overallStats={weeklyReview.overallStats}
              flaggedBlocks={weeklyReview.flaggedBlocks}
              feedbackLoading={weeklyReview.feedbackLoading}
              weekOf={weeklyReview.weekOf}
              onWeekChange={weeklyReview.onWeekChange}
              blocks={weeklyReview.blocks}
              onAddBlock={weeklyReview.onAddBlock}
              onUpdateBlock={weeklyReview.onUpdateBlock}
              onDeleteBlock={weeklyReview.onDeleteBlock}
              onReorderBlocks={weeklyReview.onReorderBlocks}
              rules={rules}
              aiResult={weeklyReview.aiResult}
              aiLoading={weeklyReview.aiLoading}
              aiError={weeklyReview.aiError}
              onGenerateAI={weeklyReview.onGenerateAI}
              onAcceptSuggestion={weeklyReview.onAcceptSuggestion}
              onRejectSuggestion={weeklyReview.onRejectSuggestion}
            />
          ) : null}
        </div>
      </div>
    )
  }

  // Desktop layout: two columns
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 flex items-center gap-3 shrink-0">
        {onBack && (
          <button onClick={onBack} className="p-2 -ml-2 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors">
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>
          </button>
        )}
        <div>
          <h1 className="font-display text-2xl font-semibold text-neutral-800">Planning Workspace</h1>
          <p className="text-sm text-neutral-500 mt-0.5">Research, draft rules, review your week</p>
        </div>
      </div>

      {/* Two-column content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Workspace navigation + resources */}
        <div className="w-[360px] border-r border-neutral-200/60 flex flex-col shrink-0">
          {researchContent}
        </div>

        {/* Right: Rules or Weekly Review */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Right panel toggle */}
          {weeklyReview && (
            <div className="flex gap-1 mx-4 mt-3 mb-1 p-1 bg-neutral-100 rounded-lg shrink-0">
              <button
                onClick={() => setDesktopRightPanel('rules')}
                className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  desktopRightPanel === 'rules' ? 'bg-white text-neutral-800 shadow-sm' : 'text-neutral-500'
                }`}
              >
                Rules {draftRules.length > 0 && `(${draftRules.length})`}
              </button>
              <button
                onClick={() => setDesktopRightPanel('review')}
                className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  desktopRightPanel === 'review' ? 'bg-white text-neutral-800 shadow-sm' : 'text-neutral-500'
                }`}
              >
                Weekly Review
                {weeklyReview.flaggedBlocks.length > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-100 text-red-600 text-[9px] font-bold">
                    {weeklyReview.flaggedBlocks.length}
                  </span>
                )}
              </button>
            </div>
          )}

          {desktopRightPanel === 'review' && weeklyReview ? (
            <div className="flex-1 overflow-auto">
              <WeeklyReviewTab
                blockSummaries={weeklyReview.blockSummaries}
                overallStats={weeklyReview.overallStats}
                flaggedBlocks={weeklyReview.flaggedBlocks}
                feedbackLoading={weeklyReview.feedbackLoading}
                weekOf={weeklyReview.weekOf}
                onWeekChange={weeklyReview.onWeekChange}
                blocks={weeklyReview.blocks}
                onAddBlock={weeklyReview.onAddBlock}
                onUpdateBlock={weeklyReview.onUpdateBlock}
                onDeleteBlock={weeklyReview.onDeleteBlock}
                onReorderBlocks={weeklyReview.onReorderBlocks}
                rules={rules}
                aiResult={weeklyReview.aiResult}
                aiLoading={weeklyReview.aiLoading}
                aiError={weeklyReview.aiError}
                onGenerateAI={weeklyReview.onGenerateAI}
                onAcceptSuggestion={weeklyReview.onAcceptSuggestion}
                onRejectSuggestion={weeklyReview.onRejectSuggestion}
              />
            </div>
          ) : (
            <div className="flex-1 overflow-auto">
              <DraftRulesList
                draftRules={draftRules}
                publishedCount={publishedCount}
                onAddRule={onAddRule}
                onUpdateRule={onUpdateRule}
                onDeleteRule={onDeleteRule}
                onViewPublished={onViewPublishedRules}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
