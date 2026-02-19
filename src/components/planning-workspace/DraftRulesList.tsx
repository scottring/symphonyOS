import { useState } from 'react'
import type { FamilyRule } from '@/types/playbook'
import { DraftRuleCard } from './DraftRuleCard'

interface DraftRulesListProps {
  draftRules: FamilyRule[]
  publishedCount: number
  onAddRule: (input: { rule: string; appliesTo?: string[]; rationale?: string; enforcementTip?: string; status?: string }) => Promise<FamilyRule | null>
  onUpdateRule: (id: string, updates: Partial<Pick<FamilyRule, 'rule' | 'appliesTo' | 'status' | 'rationale' | 'enforcementTip'>>) => void
  onDeleteRule: (id: string) => void
  onViewPublished?: () => void
}

export function DraftRulesList({
  draftRules,
  publishedCount,
  onAddRule,
  onUpdateRule,
  onDeleteRule,
  onViewPublished,
}: DraftRulesListProps) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [newRule, setNewRule] = useState('')
  const [newAppliesTo, setNewAppliesTo] = useState('')
  const [newRationale, setNewRationale] = useState('')
  const [newEnforcementTip, setNewEnforcementTip] = useState('')
  const [saving, setSaving] = useState(false)

  const handleAdd = async () => {
    if (!newRule.trim() || saving) return
    setSaving(true)
    try {
      const appliesTo = newAppliesTo.trim()
        ? newAppliesTo.split(',').map(s => s.trim().toLowerCase())
        : ['everyone']

      await onAddRule({
        rule: newRule.trim(),
        appliesTo,
        rationale: newRationale.trim() || undefined,
        enforcementTip: newEnforcementTip.trim() || undefined,
        status: 'draft',
      })

      setNewRule('')
      setNewAppliesTo('')
      setNewRationale('')
      setNewEnforcementTip('')
      setShowAddForm(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-5 pt-5 pb-3 flex items-center justify-between">
        <h3 className="text-xs font-medium text-neutral-400 uppercase tracking-wider">Draft Rules</h3>
        {publishedCount > 0 && onViewPublished && (
          <button
            onClick={onViewPublished}
            className="text-[11px] text-primary-600 hover:text-primary-700 font-medium"
          >
            {publishedCount} published →
          </button>
        )}
      </div>

      {/* Draft rules list */}
      <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-3">
        {draftRules.length === 0 && !showAddForm && (
          <div className="text-center py-8">
            <p className="text-sm text-neutral-400 mb-3">
              No draft rules yet. Research first, then draft rules informed by what you've learned.
            </p>
          </div>
        )}

        {draftRules.map(rule => (
          <DraftRuleCard
            key={rule.id}
            rule={rule}
            onPublish={() => onUpdateRule(rule.id, { status: 'active' })}
            onUpdate={(updates) => onUpdateRule(rule.id, updates)}
            onDelete={() => onDeleteRule(rule.id)}
          />
        ))}

        {/* Add draft rule form */}
        {showAddForm && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/30 p-4 space-y-2.5">
            <input
              type="text"
              value={newRule}
              onChange={e => setNewRule(e.target.value)}
              placeholder="The rule (e.g., 'Screens after responsibilities are done')"
              className="w-full px-3 py-2.5 rounded-lg bg-white border border-neutral-200 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-amber-300/50"
              autoFocus
            />
            <input
              type="text"
              value={newAppliesTo}
              onChange={e => setNewAppliesTo(e.target.value)}
              placeholder="Applies to (e.g., 'Kaleb, Ella' — leave blank for everyone)"
              className="w-full px-3 py-1.5 rounded-lg bg-white border border-neutral-200 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-amber-300/50"
            />
            <textarea
              value={newEnforcementTip}
              onChange={e => setNewEnforcementTip(e.target.value)}
              placeholder="How to enforce lovingly (coaching tip)"
              rows={2}
              className="w-full px-3 py-1.5 rounded-lg bg-white border border-neutral-200 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-amber-300/50 resize-none"
            />
            <input
              type="text"
              value={newRationale}
              onChange={e => setNewRationale(e.target.value)}
              placeholder="Why this rule exists (optional)"
              className="w-full px-3 py-1.5 rounded-lg bg-white border border-neutral-200 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-amber-300/50"
            />
            <div className="flex gap-2">
              <button
                onClick={handleAdd}
                disabled={!newRule.trim() || saving}
                className="px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-medium hover:bg-amber-600 transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Add draft'}
              </button>
              <button
                onClick={() => setShowAddForm(false)}
                className="px-3 py-1.5 rounded-lg text-neutral-500 text-xs hover:bg-neutral-100 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Add button */}
        {!showAddForm && (
          <button
            onClick={() => setShowAddForm(true)}
            className="w-full py-2.5 rounded-xl border-2 border-dashed border-neutral-200 text-sm text-neutral-400 hover:border-neutral-300 hover:text-neutral-500 transition-colors"
          >
            + Draft new rule
          </button>
        )}
      </div>
    </div>
  )
}
