import { useState } from 'react'
import type { FamilyRule, Responsibility } from '@/types/playbook'

interface RulesViewProps {
  rules: FamilyRule[]
  responsibilities: Responsibility[]
  onAddRule: (input: { rule: string; appliesTo?: string[]; rationale?: string; enforcementTip?: string }) => Promise<FamilyRule | null>
  onUpdateRule: (id: string, updates: Partial<Pick<FamilyRule, 'rule' | 'appliesTo' | 'status' | 'rationale' | 'enforcementTip'>>) => void
  onDeleteRule: (id: string) => void
  onAddResponsibility: (input: { who: string; task: string; frequency?: string; ruleId?: string }) => Promise<Responsibility | null>
  getResponsibilitiesForRule: (ruleId: string) => Responsibility[]
  loading?: boolean
  onBack?: () => void
}

export function RulesView({
  rules,
  onAddRule,
  onUpdateRule,
  onDeleteRule,
  onAddResponsibility,
  getResponsibilitiesForRule,
  loading,
  onBack,
}: RulesViewProps) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [newRule, setNewRule] = useState('')
  const [newAppliesTo, setNewAppliesTo] = useState('')
  const [newRationale, setNewRationale] = useState('')
  const [newEnforcementTip, setNewEnforcementTip] = useState('')
  const [expandedRuleId, setExpandedRuleId] = useState<string | null>(null)

  // Add responsibility inline state
  const [addingResponsibilityFor, setAddingResponsibilityFor] = useState<string | null>(null)
  const [newRespWho, setNewRespWho] = useState('')
  const [newRespTask, setNewRespTask] = useState('')

  const activeRules = rules.filter(r => r.status === 'active')
  const retiredRules = rules.filter(r => r.status === 'paused' || r.status === 'retired')

  const handleAddRule = async () => {
    if (!newRule.trim()) return
    const appliesTo = newAppliesTo.trim()
      ? newAppliesTo.split(',').map(s => s.trim().toLowerCase())
      : ['everyone']

    await onAddRule({
      rule: newRule.trim(),
      appliesTo,
      rationale: newRationale.trim() || undefined,
      enforcementTip: newEnforcementTip.trim() || undefined,
    })

    setNewRule('')
    setNewAppliesTo('')
    setNewRationale('')
    setNewEnforcementTip('')
    setShowAddForm(false)
  }

  const handleAddResponsibility = async (ruleId: string) => {
    if (!newRespWho.trim() || !newRespTask.trim()) return
    await onAddResponsibility({
      who: newRespWho.trim().toLowerCase(),
      task: newRespTask.trim(),
      ruleId,
    })
    setNewRespWho('')
    setNewRespTask('')
    setAddingResponsibilityFor(null)
  }

  // Who pill colors
  const whoColors: Record<string, string> = {
    kaleb: 'bg-blue-100 text-blue-700',
    ella: 'bg-purple-100 text-purple-700',
    everyone: 'bg-neutral-100 text-neutral-600',
  }

  if (loading) {
    return (
      <div className="px-4 py-8 max-w-[680px] mx-auto">
        <div className="h-8 skeleton w-40 mb-6" />
        <div className="space-y-4">
          {[1, 2].map(i => (
            <div key={i} className="h-32 skeleton rounded-2xl" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 py-6 md:px-10 md:py-10 max-w-[680px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="p-2 -ml-2 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
              </svg>
            </button>
          )}
          <div>
            <p className="text-xs text-neutral-400 font-medium mb-0.5">Relish Family Layer</p>
            <h1 className="font-display text-3xl md:text-4xl text-neutral-900 tracking-tight">
              Family Rules
            </h1>
            <p className="text-sm text-neutral-500 mt-1">
              Coaching guidance for everyday moments
            </p>
          </div>
        </div>
      </div>

      {/* Active rules */}
      {activeRules.length === 0 && !showAddForm ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-amber-50 flex items-center justify-center">
            <svg className="w-8 h-8 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>
          <p className="text-neutral-600 font-medium mb-2">No family rules yet</p>
          <p className="text-sm text-neutral-400 mb-4">
            Add rules with coaching tips for everyday parenting moments
          </p>
          <button
            onClick={() => setShowAddForm(true)}
            className="px-4 py-2 rounded-xl bg-sage-500 text-white text-sm font-medium hover:bg-sage-600 transition-colors"
          >
            Add first rule
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {activeRules.map((rule) => {
            const ruleResps = getResponsibilitiesForRule(rule.id)
            const isExpanded = expandedRuleId === rule.id

            return (
              <div
                key={rule.id}
                className="rounded-2xl border border-neutral-200/60 bg-white overflow-hidden"
              >
                {/* Rule header */}
                <button
                  onClick={() => setExpandedRuleId(isExpanded ? null : rule.id)}
                  className="w-full text-left px-5 py-4 hover:bg-neutral-50/50 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1">
                      <h3 className="font-semibold text-neutral-800">{rule.rule}</h3>
                      {/* Applies to pills */}
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {rule.appliesTo.map(who => (
                          <span
                            key={who}
                            className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
                              whoColors[who] || 'bg-neutral-100 text-neutral-600'
                            }`}
                          >
                            {who}
                          </span>
                        ))}
                      </div>
                    </div>
                    <svg
                      className={`w-5 h-5 text-neutral-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="px-5 pb-4 space-y-3 border-t border-neutral-100">
                    {/* Enforcement tip */}
                    {rule.enforcementTip && (
                      <div className="mt-3 px-3 py-2.5 rounded-xl bg-sage-50/80 border border-sage-100/60">
                        <div className="flex items-start gap-2">
                          <svg className="w-4 h-4 text-sage-500 mt-0.5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14c.015-.34.208-.646.477-.859a4 4 0 10-4.954 0c.27.213.462.519.476.859h4.002z" />
                          </svg>
                          <p className="text-xs text-sage-700 leading-relaxed">
                            {rule.enforcementTip}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Rationale */}
                    {rule.rationale && (
                      <p className="text-xs text-neutral-500 italic mt-2">
                        Why: {rule.rationale}
                      </p>
                    )}

                    {/* Linked responsibilities */}
                    {ruleResps.length > 0 && (
                      <div className="mt-2">
                        <h4 className="text-xs font-medium text-neutral-500 mb-1.5">Responsibilities</h4>
                        <div className="space-y-1">
                          {ruleResps.map(resp => (
                            <div key={resp.id} className="flex items-center gap-2 text-sm">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                whoColors[resp.who] || 'bg-neutral-100 text-neutral-600'
                              }`}>
                                {resp.who}
                              </span>
                              <span className="text-neutral-700">{resp.task}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Add responsibility inline */}
                    {addingResponsibilityFor === rule.id ? (
                      <div className="flex items-center gap-2 mt-2">
                        <input
                          type="text"
                          value={newRespWho}
                          onChange={(e) => setNewRespWho(e.target.value)}
                          placeholder="Who"
                          className="w-20 px-2 py-1 rounded-lg border border-neutral-200 text-xs"
                          autoFocus
                        />
                        <input
                          type="text"
                          value={newRespTask}
                          onChange={(e) => setNewRespTask(e.target.value)}
                          placeholder="Task"
                          className="flex-1 px-2 py-1 rounded-lg border border-neutral-200 text-xs"
                          onKeyDown={(e) => e.key === 'Enter' && handleAddResponsibility(rule.id)}
                        />
                        <button
                          onClick={() => handleAddResponsibility(rule.id)}
                          className="px-2 py-1 rounded-lg bg-sage-100 text-sage-700 text-xs font-medium"
                        >
                          Add
                        </button>
                        <button
                          onClick={() => setAddingResponsibilityFor(null)}
                          className="text-xs text-neutral-400"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setAddingResponsibilityFor(rule.id)}
                        className="text-xs text-neutral-400 hover:text-neutral-500 mt-1"
                      >
                        + Add responsibility
                      </button>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-2 border-t border-neutral-100">
                      <button
                        onClick={() => onUpdateRule(rule.id, { status: 'paused' })}
                        className="px-3 py-1.5 rounded-lg text-xs text-neutral-500 hover:bg-neutral-100 transition-colors"
                      >
                        Pause
                      </button>
                      <button
                        onClick={() => onUpdateRule(rule.id, { status: 'retired' })}
                        className="px-3 py-1.5 rounded-lg text-xs text-neutral-500 hover:bg-neutral-100 transition-colors"
                      >
                        Retire
                      </button>
                      <button
                        onClick={() => onDeleteRule(rule.id)}
                        className="px-3 py-1.5 rounded-lg text-xs text-red-500 hover:bg-red-50 transition-colors ml-auto"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Add rule form */}
      {showAddForm && (
        <div className="mt-4 rounded-2xl border border-sage-200 bg-sage-50/30 p-5 space-y-3">
          <input
            type="text"
            value={newRule}
            onChange={(e) => setNewRule(e.target.value)}
            placeholder="The rule (e.g., 'Screens after responsibilities are done')"
            className="w-full px-3 py-2.5 rounded-xl bg-white border border-neutral-200 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-sage-300/50"
            autoFocus
          />
          <input
            type="text"
            value={newAppliesTo}
            onChange={(e) => setNewAppliesTo(e.target.value)}
            placeholder="Applies to (e.g., 'Kaleb, Ella' — leave blank for everyone)"
            className="w-full px-3 py-2 rounded-xl bg-white border border-neutral-200 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-sage-300/50"
          />
          <textarea
            value={newEnforcementTip}
            onChange={(e) => setNewEnforcementTip(e.target.value)}
            placeholder="How to enforce lovingly (coaching tip)"
            rows={2}
            className="w-full px-3 py-2 rounded-xl bg-white border border-neutral-200 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-sage-300/50 resize-none"
          />
          <input
            type="text"
            value={newRationale}
            onChange={(e) => setNewRationale(e.target.value)}
            placeholder="Why this rule exists (optional)"
            className="w-full px-3 py-2 rounded-xl bg-white border border-neutral-200 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-sage-300/50"
          />
          <div className="flex gap-2">
            <button
              onClick={handleAddRule}
              className="px-4 py-2 rounded-xl bg-sage-500 text-white text-sm font-medium hover:bg-sage-600 transition-colors"
            >
              Add rule
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2 rounded-xl text-neutral-500 text-sm hover:bg-neutral-100 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Add rule button (when rules exist) */}
      {activeRules.length > 0 && !showAddForm && (
        <button
          onClick={() => setShowAddForm(true)}
          className="mt-4 w-full py-3 rounded-xl border-2 border-dashed border-neutral-200 text-sm text-neutral-400 hover:border-neutral-300 hover:text-neutral-500 transition-colors"
        >
          + Add rule
        </button>
      )}

      {/* Retired rules (collapsed) */}
      {retiredRules.length > 0 && (
        <details className="mt-8">
          <summary className="text-xs text-neutral-400 cursor-pointer hover:text-neutral-500">
            {retiredRules.length} paused/retired rule{retiredRules.length !== 1 ? 's' : ''}
          </summary>
          <div className="mt-2 space-y-2">
            {retiredRules.map(rule => (
              <div key={rule.id} className="flex items-center gap-3 px-4 py-2 rounded-xl bg-neutral-50 border border-neutral-100">
                <span className="text-sm text-neutral-400 line-through flex-1">{rule.rule}</span>
                <span className="text-[10px] text-neutral-400 uppercase">{rule.status}</span>
                <button
                  onClick={() => onUpdateRule(rule.id, { status: 'active' })}
                  className="text-xs text-sage-600 hover:text-sage-700"
                >
                  Reactivate
                </button>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
