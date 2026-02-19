import { useState } from 'react'
import type { FamilyRule } from '@/types/playbook'

interface DraftRuleCardProps {
  rule: FamilyRule
  onPublish: () => void
  onUpdate: (updates: Partial<Pick<FamilyRule, 'rule' | 'appliesTo' | 'rationale' | 'enforcementTip'>>) => void
  onDelete: () => void
}

const WHO_COLORS: Record<string, string> = {
  kaleb: 'bg-blue-100 text-blue-700',
  ella: 'bg-purple-100 text-purple-700',
  everyone: 'bg-neutral-100 text-neutral-600',
}

export function DraftRuleCard({ rule, onPublish, onUpdate, onDelete }: DraftRuleCardProps) {
  const [editing, setEditing] = useState(false)
  const [editRule, setEditRule] = useState(rule.rule)
  const [editAppliesTo, setEditAppliesTo] = useState(rule.appliesTo.join(', '))
  const [editRationale, setEditRationale] = useState(rule.rationale || '')
  const [editEnforcementTip, setEditEnforcementTip] = useState(rule.enforcementTip || '')

  const handleSave = () => {
    if (!editRule.trim()) return
    onUpdate({
      rule: editRule.trim(),
      appliesTo: editAppliesTo.trim() ? editAppliesTo.split(',').map(s => s.trim().toLowerCase()) : ['everyone'],
      rationale: editRationale.trim() || undefined,
      enforcementTip: editEnforcementTip.trim() || undefined,
    })
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50/30 p-4 space-y-2.5">
        <input
          type="text"
          value={editRule}
          onChange={e => setEditRule(e.target.value)}
          placeholder="The rule"
          className="w-full px-3 py-2 rounded-lg bg-white border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300/50"
          autoFocus
        />
        <input
          type="text"
          value={editAppliesTo}
          onChange={e => setEditAppliesTo(e.target.value)}
          placeholder="Applies to (e.g., Kaleb, Ella)"
          className="w-full px-3 py-1.5 rounded-lg bg-white border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300/50"
        />
        <textarea
          value={editEnforcementTip}
          onChange={e => setEditEnforcementTip(e.target.value)}
          placeholder="How to enforce lovingly"
          rows={2}
          className="w-full px-3 py-1.5 rounded-lg bg-white border border-neutral-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-300/50"
        />
        <input
          type="text"
          value={editRationale}
          onChange={e => setEditRationale(e.target.value)}
          placeholder="Why this rule exists"
          className="w-full px-3 py-1.5 rounded-lg bg-white border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300/50"
        />
        <div className="flex gap-2">
          <button onClick={handleSave} className="px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-medium hover:bg-amber-600 transition-colors">
            Save
          </button>
          <button onClick={() => setEditing(false)} className="px-3 py-1.5 rounded-lg text-neutral-500 text-xs hover:bg-neutral-100 transition-colors">
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-neutral-200/60 bg-white p-4">
      <div className="flex items-start gap-3">
        {/* Draft badge */}
        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700 shrink-0 mt-0.5">
          Draft
        </span>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-neutral-800">{rule.rule}</h4>

          {/* Applies to pills */}
          <div className="flex flex-wrap gap-1 mt-1">
            {rule.appliesTo.map(who => (
              <span
                key={who}
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${WHO_COLORS[who] || 'bg-neutral-100 text-neutral-600'}`}
              >
                {who}
              </span>
            ))}
          </div>

          {/* Enforcement tip */}
          {rule.enforcementTip && (
            <div className="mt-2 px-2.5 py-2 rounded-lg bg-sage-50/80 border border-sage-100/60">
              <div className="flex items-start gap-1.5">
                <svg className="w-3.5 h-3.5 text-sage-500 mt-0.5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14c.015-.34.208-.646.477-.859a4 4 0 10-4.954 0c.27.213.462.519.476.859h4.002z" />
                </svg>
                <p className="text-[11px] text-sage-700 leading-relaxed">{rule.enforcementTip}</p>
              </div>
            </div>
          )}

          {/* Rationale */}
          {rule.rationale && (
            <p className="text-[11px] text-neutral-400 italic mt-1.5">Why: {rule.rationale}</p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-neutral-100">
        <button
          onClick={onPublish}
          className="px-3 py-1.5 rounded-lg bg-sage-500 text-white text-xs font-medium hover:bg-sage-600 transition-colors"
        >
          Publish
        </button>
        <button
          onClick={() => setEditing(true)}
          className="px-3 py-1.5 rounded-lg text-xs text-neutral-500 hover:bg-neutral-100 transition-colors"
        >
          Edit
        </button>
        <button
          onClick={onDelete}
          className="px-3 py-1.5 rounded-lg text-xs text-red-500 hover:bg-red-50 transition-colors ml-auto"
        >
          Delete
        </button>
      </div>
    </div>
  )
}
