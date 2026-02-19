import { useState, useMemo } from 'react'
import type { PlanningResource, PlanningResourceType, CreatePlanningResourceInput, UpdatePlanningResourceInput, ResearchWorkspace } from '@/types/planning'
import type { FamilyRule } from '@/types/playbook'
import { supabase } from '@/lib/supabase'
import { ResourceCard } from './ResourceCard'
import { ResourceDetail } from './ResourceDetail'
import { AddResourceModal } from './AddResourceModal'

interface SuggestedRule {
  rule: string
  appliesTo: string[]
  rationale: string
  enforcementTip: string
}

interface WorkspaceViewProps {
  workspace: ResearchWorkspace
  resources: PlanningResource[]
  loading: boolean
  onBack: () => void
  onAddResource: (input: CreatePlanningResourceInput) => Promise<PlanningResource | null>
  onUpdateResource: (id: string, updates: UpdatePlanningResourceInput) => Promise<void>
  onDeleteResource: (id: string) => Promise<void>
  onUploadFile: (resourceId: string, file: File) => Promise<string | null>
  onGetSignedUrl: (filePath: string) => Promise<string | null>
  onAddRule: (input: { rule: string; appliesTo?: string[]; rationale?: string; enforcementTip?: string; status?: string }) => Promise<FamilyRule | null>
  onMarkSynthesized: (workspaceId: string) => Promise<void>
  onDeleteWorkspace: (id: string) => Promise<void>
}

export function WorkspaceView({
  workspace,
  resources,
  loading,
  onBack,
  onAddResource,
  onUpdateResource,
  onDeleteResource,
  onUploadFile,
  onGetSignedUrl,
  onAddRule,
  onMarkSynthesized,
  onDeleteWorkspace,
}: WorkspaceViewProps) {
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null)
  const [addMode, setAddMode] = useState<PlanningResourceType | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Synthesis state
  const [suggestedRules, setSuggestedRules] = useState<SuggestedRule[]>([])
  const [aiSummary, setAiSummary] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [acceptedIndices, setAcceptedIndices] = useState<Set<number>>(new Set())

  const workspaceResources = useMemo(
    () => resources.filter(r => r.workspaceId === workspace.id),
    [resources, workspace.id]
  )

  const selectedResource = useMemo(
    () => selectedResourceId ? workspaceResources.find(r => r.id === selectedResourceId) ?? null : null,
    [selectedResourceId, workspaceResources]
  )

  const sourcesWithContent = useMemo(
    () => workspaceResources.filter(r => r.content?.trim()),
    [workspaceResources]
  )

  const handleAddResource = async (input: CreatePlanningResourceInput) => {
    return onAddResource({ ...input, workspaceId: workspace.id })
  }

  const handleDeleteResource = async (id: string) => {
    await onDeleteResource(id)
    if (selectedResourceId === id) setSelectedResourceId(null)
  }

  const handleOpenFile = async (filePath: string) => {
    const url = await onGetSignedUrl(filePath)
    if (url) window.open(url, '_blank')
  }

  const handleSynthesize = async () => {
    if (aiLoading || sourcesWithContent.length === 0) return

    setAiLoading(true)
    setAiError(null)
    setSuggestedRules([])
    setAcceptedIndices(new Set())

    try {
      const response = await supabase.functions.invoke('suggest-rules-from-research', {
        body: { workspaceId: workspace.id, workspaceName: workspace.name },
      })

      if (response.error) {
        throw new Error(response.error.message || 'Failed to synthesize')
      }

      const data = response.data as { suggestedRules: SuggestedRule[]; summary: string }
      setSuggestedRules(data.suggestedRules || [])
      setAiSummary(data.summary || '')
      await onMarkSynthesized(workspace.id)
    } catch (err) {
      console.error('Synthesis error:', err)
      setAiError(err instanceof Error ? err.message : 'Failed to synthesize rules')
    } finally {
      setAiLoading(false)
    }
  }

  const handleAcceptRule = async (index: number) => {
    if (acceptedIndices.has(index)) return
    const rule = suggestedRules[index]
    await onAddRule({
      rule: rule.rule,
      appliesTo: rule.appliesTo,
      rationale: rule.rationale,
      enforcementTip: rule.enforcementTip,
      status: 'draft',
    })
    setAcceptedIndices(prev => new Set([...prev, index]))
  }

  const handleDeleteWorkspace = async () => {
    await onDeleteWorkspace(workspace.id)
    onBack()
  }

  // If a resource is selected, show its detail
  if (selectedResource) {
    return (
      <div className="h-full flex flex-col">
        <button
          onClick={() => setSelectedResourceId(null)}
          className="px-4 py-2 text-xs text-primary-600 font-medium text-left shrink-0"
        >
          &larr; Back to {workspace.name}
        </button>
        <div className="flex-1 overflow-auto">
          <ResourceDetail
            resource={selectedResource}
            onUpdate={onUpdateResource}
            onDelete={handleDeleteResource}
            onOpenFile={handleOpenFile}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 pt-4 pb-2 shrink-0">
        <button
          onClick={onBack}
          className="text-xs text-primary-600 font-medium mb-2 flex items-center gap-1"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          All Workspaces
        </button>
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-neutral-800">{workspace.name}</h2>
            {workspace.description && (
              <p className="text-xs text-neutral-400 mt-0.5">{workspace.description}</p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {confirmDelete ? (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-red-500">Delete?</span>
                <button
                  onClick={handleDeleteWorkspace}
                  className="px-2 py-1 rounded-md bg-red-500 text-white text-[11px] font-medium hover:bg-red-600 transition-colors"
                >
                  Yes
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="px-2 py-1 rounded-md text-[11px] text-neutral-500 hover:bg-neutral-100 transition-colors"
                >
                  No
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="p-1.5 rounded-lg text-neutral-300 hover:text-red-500 hover:bg-red-50 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Add resource buttons */}
      <div className="px-4 pb-3 shrink-0">
        <div className="flex gap-1.5">
          <button
            onClick={() => setAddMode('paste')}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-neutral-600 bg-neutral-100 hover:bg-neutral-200 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            Paste
          </button>
          <button
            onClick={() => setAddMode('upload')}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-neutral-600 bg-neutral-100 hover:bg-neutral-200 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Upload
          </button>
          <button
            onClick={() => setAddMode('note')}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-neutral-600 bg-neutral-100 hover:bg-neutral-200 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Note
          </button>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {/* Resource list */}
        {loading ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-neutral-400">Loading...</p>
          </div>
        ) : workspaceResources.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <div className="w-10 h-10 mx-auto mb-2 rounded-xl bg-neutral-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-neutral-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
              </svg>
            </div>
            <p className="text-sm text-neutral-500 mb-1">Add research sources</p>
            <p className="text-xs text-neutral-400">
              Paste articles, upload PDFs, or add notes about {workspace.name.toLowerCase()}
            </p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {workspaceResources.map(resource => (
              <ResourceCard
                key={resource.id}
                resource={resource}
                isSelected={false}
                onSelect={() => setSelectedResourceId(resource.id)}
              />
            ))}
          </div>
        )}

        {/* Synthesize section */}
        {workspaceResources.length > 0 && (
          <div className="mx-2 mt-4 pt-4 border-t border-neutral-100">
            <button
              onClick={handleSynthesize}
              disabled={aiLoading || sourcesWithContent.length === 0}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-sm font-medium text-amber-700 hover:bg-amber-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {aiLoading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="32" strokeLinecap="round" />
                  </svg>
                  Synthesizing {sourcesWithContent.length} source{sourcesWithContent.length !== 1 ? 's' : ''}...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  Synthesize into Rules ({sourcesWithContent.length} source{sourcesWithContent.length !== 1 ? 's' : ''})
                </>
              )}
            </button>

            {sourcesWithContent.length === 0 && workspaceResources.length > 0 && (
              <p className="mt-2 text-xs text-neutral-400 text-center">
                Add text content to your sources to enable synthesis
              </p>
            )}

            {aiError && (
              <p className="mt-2 text-xs text-red-500 text-center">{aiError}</p>
            )}

            {/* AI Summary */}
            {aiSummary && (
              <div className="mt-3 px-3 py-2.5 rounded-xl bg-amber-50/50 border border-amber-100">
                <p className="text-xs text-neutral-600 leading-relaxed">{aiSummary}</p>
              </div>
            )}

            {/* Suggested Rules */}
            {suggestedRules.length > 0 && (
              <div className="mt-3 space-y-2.5">
                <h4 className="text-xs font-medium text-neutral-500 uppercase tracking-wider px-1">
                  Suggested Rules
                </h4>
                {suggestedRules.map((rule, index) => {
                  const accepted = acceptedIndices.has(index)
                  return (
                    <div
                      key={index}
                      className={`rounded-xl border p-3 transition-all ${
                        accepted
                          ? 'border-green-200 bg-green-50/40'
                          : 'border-amber-200 bg-amber-50/30'
                      }`}
                    >
                      <p className="text-sm font-medium text-neutral-800">{rule.rule}</p>
                      {rule.appliesTo.length > 0 && (
                        <div className="flex gap-1 mt-1.5">
                          {rule.appliesTo.map(who => (
                            <span key={who} className="px-1.5 py-0.5 rounded-md bg-neutral-100 text-[10px] font-medium text-neutral-500">
                              {who}
                            </span>
                          ))}
                        </div>
                      )}
                      {rule.rationale && (
                        <p className="mt-1.5 text-xs text-neutral-500 leading-relaxed">{rule.rationale}</p>
                      )}
                      {rule.enforcementTip && (
                        <p className="mt-1 text-xs text-amber-600 leading-relaxed">
                          <span className="font-medium">Tip:</span> {rule.enforcementTip}
                        </p>
                      )}
                      <div className="mt-2 flex gap-2">
                        {accepted ? (
                          <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                            Added as draft
                          </span>
                        ) : (
                          <button
                            onClick={() => handleAcceptRule(index)}
                            className="px-2.5 py-1 rounded-lg bg-amber-500 text-white text-xs font-medium hover:bg-amber-600 transition-colors"
                          >
                            Add as draft rule
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add resource modal */}
      {addMode && (
        <AddResourceModal
          mode={addMode}
          onAdd={handleAddResource}
          onUploadFile={onUploadFile}
          onClose={() => setAddMode(null)}
        />
      )}
    </div>
  )
}
