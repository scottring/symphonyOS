// EditableDomainView — Editable forms for each manual domain type
// Handles string arrays, object arrays (values, rituals, assignments), and simple strings

import { useState, useCallback } from 'react'
import { formatLabel } from './DomainDataView'
import type { DomainId } from '@/types/manual'
import type {
  Value, Ritual, RoleAssignment, DecisionArea,
} from '@/types/manual'

interface EditableDomainViewProps {
  domainId: DomainId
  data: Record<string, unknown>
  onSave: (data: Record<string, unknown>) => Promise<void>
  onCancel: () => void
}

// ==================== Helpers ====================

function generateId() {
  return crypto.randomUUID()
}

// ==================== String Array Editor ====================

function StringArrayField({ label, items, onChange }: {
  label: string
  items: string[]
  onChange: (items: string[]) => void
}) {
  const [draft, setDraft] = useState('')

  const add = () => {
    if (!draft.trim()) return
    onChange([...items, draft.trim()])
    setDraft('')
  }

  const remove = (index: number) => {
    onChange(items.filter((_, i) => i !== index))
  }

  const update = (index: number, value: string) => {
    onChange(items.map((item, i) => i === index ? value : item))
  }

  return (
    <div>
      <h4 className="text-xs font-medium text-stone-500 mb-2">{label}</h4>
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="text"
              value={item}
              onChange={e => update(i, e.target.value)}
              className="flex-1 text-sm px-3 py-1.5 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-400"
            />
            <button
              onClick={() => remove(i)}
              className="text-stone-400 hover:text-red-500 shrink-0"
            >
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        ))}
      </div>
      <div className="flex gap-2 mt-2">
        <input
          type="text"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), add())}
          placeholder={`Add ${label.toLowerCase()}...`}
          className="flex-1 text-sm px-3 py-1.5 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-400"
        />
        <button
          onClick={add}
          disabled={!draft.trim()}
          className="text-xs px-3 py-1.5 bg-stone-100 text-stone-600 rounded-lg hover:bg-stone-200 disabled:opacity-30"
        >
          Add
        </button>
      </div>
    </div>
  )
}

// ==================== Simple String Editor ====================

function StringField({ label, value, onChange }: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div>
      <h4 className="text-xs font-medium text-stone-500 mb-2">{label}</h4>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={3}
        className="w-full text-sm px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-400 resize-none"
      />
    </div>
  )
}

// ==================== Value Editor ====================

function ValueEditor({ items, onChange }: {
  items: Value[]
  onChange: (items: Value[]) => void
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState({ name: '', description: '' })

  const add = () => {
    if (!draft.name.trim()) return
    onChange([...items, { id: generateId(), name: draft.name.trim(), description: draft.description.trim() }])
    setDraft({ name: '', description: '' })
  }

  const remove = (id: string) => {
    onChange(items.filter(v => v.id !== id))
  }

  const update = (id: string, field: keyof Value, value: string) => {
    onChange(items.map(v => v.id === id ? { ...v, [field]: value } : v))
  }

  return (
    <div>
      <h4 className="text-xs font-medium text-stone-500 mb-2">Values</h4>
      <div className="space-y-2">
        {items.map(v => (
          <div key={v.id} className="border border-stone-200 rounded-lg p-3">
            {editingId === v.id ? (
              <div className="space-y-2">
                <input
                  type="text"
                  value={v.name}
                  onChange={e => update(v.id, 'name', e.target.value)}
                  className="w-full text-sm font-medium px-2 py-1 border border-stone-200 rounded focus:outline-none focus:ring-2 focus:ring-stone-400"
                />
                <input
                  type="text"
                  value={v.description}
                  onChange={e => update(v.id, 'description', e.target.value)}
                  className="w-full text-sm px-2 py-1 border border-stone-200 rounded focus:outline-none focus:ring-2 focus:ring-stone-400"
                />
                <button onClick={() => setEditingId(null)} className="text-xs text-stone-500 hover:text-stone-700">Done</button>
              </div>
            ) : (
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-sm font-medium text-stone-800">{v.name}</span>
                  {v.description && <span className="text-sm text-stone-400"> &mdash; {v.description}</span>}
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button onClick={() => setEditingId(v.id)} className="text-stone-400 hover:text-stone-600">
                    <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
                    </svg>
                  </button>
                  <button onClick={() => remove(v.id)} className="text-stone-400 hover:text-red-500">
                    <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-2 mt-2">
        <input
          type="text"
          value={draft.name}
          onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
          placeholder="Value name..."
          className="flex-1 text-sm px-3 py-1.5 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-400"
        />
        <input
          type="text"
          value={draft.description}
          onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
          placeholder="Description..."
          className="flex-1 text-sm px-3 py-1.5 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-400"
        />
        <button onClick={add} disabled={!draft.name.trim()} className="text-xs px-3 py-1.5 bg-stone-100 text-stone-600 rounded-lg hover:bg-stone-200 disabled:opacity-30">Add</button>
      </div>
    </div>
  )
}

// ==================== Ritual Editor ====================

function RitualEditor({ items, onChange }: {
  items: Ritual[]
  onChange: (items: Ritual[]) => void
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState({ name: '', description: '', frequency: '', meaningSource: '' })

  const add = () => {
    if (!draft.name.trim()) return
    onChange([...items, { id: generateId(), ...draft }])
    setDraft({ name: '', description: '', frequency: '', meaningSource: '' })
  }

  const remove = (id: string) => onChange(items.filter(r => r.id !== id))

  const update = (id: string, field: keyof Ritual, value: string) => {
    onChange(items.map(r => r.id === id ? { ...r, [field]: value } : r))
  }

  return (
    <div>
      <h4 className="text-xs font-medium text-stone-500 mb-2">Rituals</h4>
      <div className="space-y-2">
        {items.map(r => (
          <div key={r.id} className="border border-stone-200 rounded-lg p-3">
            {editingId === r.id ? (
              <div className="space-y-2">
                <input type="text" value={r.name} onChange={e => update(r.id, 'name', e.target.value)} placeholder="Name" className="w-full text-sm px-2 py-1 border border-stone-200 rounded focus:outline-none focus:ring-2 focus:ring-stone-400" />
                <input type="text" value={r.description} onChange={e => update(r.id, 'description', e.target.value)} placeholder="Description" className="w-full text-sm px-2 py-1 border border-stone-200 rounded focus:outline-none focus:ring-2 focus:ring-stone-400" />
                <div className="flex gap-2">
                  <input type="text" value={r.frequency} onChange={e => update(r.id, 'frequency', e.target.value)} placeholder="Frequency" className="flex-1 text-sm px-2 py-1 border border-stone-200 rounded focus:outline-none focus:ring-2 focus:ring-stone-400" />
                  <input type="text" value={r.meaningSource} onChange={e => update(r.id, 'meaningSource', e.target.value)} placeholder="Why it matters" className="flex-1 text-sm px-2 py-1 border border-stone-200 rounded focus:outline-none focus:ring-2 focus:ring-stone-400" />
                </div>
                <button onClick={() => setEditingId(null)} className="text-xs text-stone-500 hover:text-stone-700">Done</button>
              </div>
            ) : (
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-sm font-medium text-stone-800">{r.name}</span>
                  {r.frequency && <span className="text-xs text-stone-400 ml-1">({r.frequency})</span>}
                  {r.description && <span className="text-sm text-stone-400"> &mdash; {r.description}</span>}
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button onClick={() => setEditingId(r.id)} className="text-stone-400 hover:text-stone-600">
                    <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" /></svg>
                  </button>
                  <button onClick={() => remove(r.id)} className="text-stone-400 hover:text-red-500">
                    <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 mt-2">
        <input type="text" value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} placeholder="Ritual name..." className="text-sm px-3 py-1.5 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-400" />
        <input type="text" value={draft.frequency} onChange={e => setDraft(d => ({ ...d, frequency: e.target.value }))} placeholder="Frequency..." className="text-sm px-3 py-1.5 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-400" />
        <input type="text" value={draft.description} onChange={e => setDraft(d => ({ ...d, description: e.target.value }))} placeholder="Description..." className="col-span-2 text-sm px-3 py-1.5 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-400" />
        <button onClick={add} disabled={!draft.name.trim()} className="col-span-2 text-xs px-3 py-1.5 bg-stone-100 text-stone-600 rounded-lg hover:bg-stone-200 disabled:opacity-30">Add ritual</button>
      </div>
    </div>
  )
}

// ==================== Role Assignment Editor ====================

function RoleAssignmentEditor({ items, onChange }: {
  items: RoleAssignment[]
  onChange: (items: RoleAssignment[]) => void
}) {
  const [draft, setDraft] = useState({ area: '', owner: '', satisfaction: 'working' as RoleAssignment['satisfaction'] })

  const add = () => {
    if (!draft.area.trim()) return
    onChange([...items, { id: generateId(), ...draft }])
    setDraft({ area: '', owner: '', satisfaction: 'working' })
  }

  const remove = (id: string) => onChange(items.filter(r => r.id !== id))

  const update = (id: string, field: string, value: string) => {
    onChange(items.map(r => r.id === id ? { ...r, [field]: value } : r))
  }

  return (
    <div>
      <h4 className="text-xs font-medium text-stone-500 mb-2">Role Assignments</h4>
      <div className="space-y-2">
        {items.map(r => (
          <div key={r.id} className="flex items-center gap-2 border border-stone-200 rounded-lg p-2">
            <input type="text" value={r.area} onChange={e => update(r.id, 'area', e.target.value)} className="flex-1 text-sm px-2 py-1 border border-stone-200 rounded focus:outline-none focus:ring-2 focus:ring-stone-400" placeholder="Area" />
            <input type="text" value={r.owner} onChange={e => update(r.id, 'owner', e.target.value)} className="w-28 text-sm px-2 py-1 border border-stone-200 rounded focus:outline-none focus:ring-2 focus:ring-stone-400" placeholder="Owner" />
            <select value={r.satisfaction} onChange={e => update(r.id, 'satisfaction', e.target.value)} className="text-xs px-2 py-1 border border-stone-200 rounded focus:outline-none focus:ring-2 focus:ring-stone-400">
              <option value="working">Working</option>
              <option value="needs-discussion">Needs discussion</option>
              <option value="source-of-conflict">Conflict</option>
            </select>
            <button onClick={() => remove(r.id)} className="text-stone-400 hover:text-red-500 shrink-0">
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
            </button>
          </div>
        ))}
      </div>
      <div className="flex gap-2 mt-2">
        <input type="text" value={draft.area} onChange={e => setDraft(d => ({ ...d, area: e.target.value }))} placeholder="Area..." className="flex-1 text-sm px-3 py-1.5 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-400" />
        <input type="text" value={draft.owner} onChange={e => setDraft(d => ({ ...d, owner: e.target.value }))} placeholder="Owner..." className="w-28 text-sm px-3 py-1.5 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-400" />
        <button onClick={add} disabled={!draft.area.trim()} className="text-xs px-3 py-1.5 bg-stone-100 text-stone-600 rounded-lg hover:bg-stone-200 disabled:opacity-30">Add</button>
      </div>
    </div>
  )
}

// ==================== Decision Area Editor ====================

function DecisionAreaEditor({ items, onChange }: {
  items: DecisionArea[]
  onChange: (items: DecisionArea[]) => void
}) {
  const [draft, setDraft] = useState({ name: '', style: 'collaborative' as DecisionArea['style'] })

  const add = () => {
    if (!draft.name.trim()) return
    onChange([...items, { id: generateId(), ...draft }])
    setDraft({ name: '', style: 'collaborative' })
  }

  const remove = (id: string) => onChange(items.filter(d => d.id !== id))

  return (
    <div>
      <h4 className="text-xs font-medium text-stone-500 mb-2">Decision Areas</h4>
      <div className="space-y-2">
        {items.map(d => (
          <div key={d.id} className="flex items-center gap-2 border border-stone-200 rounded-lg p-2">
            <input type="text" value={d.name} onChange={e => onChange(items.map(x => x.id === d.id ? { ...x, name: e.target.value } : x))} className="flex-1 text-sm px-2 py-1 border border-stone-200 rounded focus:outline-none focus:ring-2 focus:ring-stone-400" />
            <select value={d.style} onChange={e => onChange(items.map(x => x.id === d.id ? { ...x, style: e.target.value as DecisionArea['style'] } : x))} className="text-xs px-2 py-1 border border-stone-200 rounded focus:outline-none focus:ring-2 focus:ring-stone-400">
              <option value="collaborative">Collaborative</option>
              <option value="delegated">Delegated</option>
              <option value="unclear">Unclear</option>
            </select>
            <button onClick={() => remove(d.id)} className="text-stone-400 hover:text-red-500 shrink-0">
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
            </button>
          </div>
        ))}
      </div>
      <div className="flex gap-2 mt-2">
        <input type="text" value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} placeholder="Decision area..." className="flex-1 text-sm px-3 py-1.5 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-400" />
        <button onClick={add} disabled={!draft.name.trim()} className="text-xs px-3 py-1.5 bg-stone-100 text-stone-600 rounded-lg hover:bg-stone-200 disabled:opacity-30">Add</button>
      </div>
    </div>
  )
}

// ==================== Generic Object Array Editor (spaces, systems, routines) ====================

function ObjectArrayEditor({ label, items, fields, onChange }: {
  label: string
  items: Record<string, unknown>[]
  fields: { key: string; placeholder: string; type?: 'text' | 'select'; options?: { value: string; label: string }[] }[]
  onChange: (items: Record<string, unknown>[]) => void
}) {
  const add = () => {
    const newItem: Record<string, unknown> = { id: generateId() }
    fields.forEach(f => { newItem[f.key] = '' })
    onChange([...items, newItem])
  }

  const remove = (index: number) => onChange(items.filter((_, i) => i !== index))

  const update = (index: number, key: string, value: unknown) => {
    onChange(items.map((item, i) => i === index ? { ...item, [key]: value } : item))
  }

  return (
    <div>
      <h4 className="text-xs font-medium text-stone-500 mb-2">{label}</h4>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={String(item.id || i)} className="border border-stone-200 rounded-lg p-3 space-y-2">
            {fields.map(f => (
              f.type === 'select' && f.options ? (
                <select key={f.key} value={String(item[f.key] || '')} onChange={e => update(i, f.key, e.target.value)} className="w-full text-sm px-2 py-1 border border-stone-200 rounded focus:outline-none focus:ring-2 focus:ring-stone-400">
                  {f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : (
                <input key={f.key} type="text" value={String(item[f.key] || '')} onChange={e => update(i, f.key, e.target.value)} placeholder={f.placeholder} className="w-full text-sm px-2 py-1 border border-stone-200 rounded focus:outline-none focus:ring-2 focus:ring-stone-400" />
              )
            ))}
            <button onClick={() => remove(i)} className="text-xs text-red-500 hover:text-red-600">Remove</button>
          </div>
        ))}
      </div>
      <button onClick={add} className="text-xs px-3 py-1.5 mt-2 bg-stone-100 text-stone-600 rounded-lg hover:bg-stone-200">Add {label.toLowerCase().replace(/s$/, '')}</button>
    </div>
  )
}

// ==================== Domain-Specific Editors ====================

function ValuesDomainEditor({ data, onChange }: { data: Record<string, unknown>; onChange: (d: Record<string, unknown>) => void }) {
  return (
    <div className="space-y-6">
      <ValueEditor items={(data.values as Value[]) || []} onChange={v => onChange({ ...data, values: v })} />
      <StringArrayField label="Identity Statements" items={(data.identityStatements as string[]) || []} onChange={v => onChange({ ...data, identityStatements: v })} />
      <StringArrayField label="Non-Negotiables" items={(data.nonNegotiables as string[]) || []} onChange={v => onChange({ ...data, nonNegotiables: v })} />
      <StringArrayField label="Narratives" items={(data.narratives as string[]) || []} onChange={v => onChange({ ...data, narratives: v })} />
    </div>
  )
}

function CommunicationDomainEditor({ data, onChange }: { data: Record<string, unknown>; onChange: (d: Record<string, unknown>) => void }) {
  return (
    <div className="space-y-6">
      <StringArrayField label="Strengths" items={(data.strengths as string[]) || []} onChange={v => onChange({ ...data, strengths: v })} />
      <StringArrayField label="Patterns" items={(data.patterns as string[]) || []} onChange={v => onChange({ ...data, patterns: v })} />
      <StringArrayField label="Challenges" items={(data.challenges as string[]) || []} onChange={v => onChange({ ...data, challenges: v })} />
      <StringArrayField label="Repair Strategies" items={(data.repairStrategies as string[]) || []} onChange={v => onChange({ ...data, repairStrategies: v })} />
      <StringArrayField label="Goals" items={(data.goals as string[]) || []} onChange={v => onChange({ ...data, goals: v })} />
    </div>
  )
}

function ConnectionDomainEditor({ data, onChange }: { data: Record<string, unknown>; onChange: (d: Record<string, unknown>) => void }) {
  return (
    <div className="space-y-6">
      <RitualEditor items={(data.rituals as Ritual[]) || []} onChange={v => onChange({ ...data, rituals: v })} />
      <StringArrayField label="Bonding Activities" items={(data.bondingActivities as string[]) || []} onChange={v => onChange({ ...data, bondingActivities: v })} />
      <StringArrayField label="Strengths" items={(data.strengths as string[]) || []} onChange={v => onChange({ ...data, strengths: v })} />
      <StringArrayField label="Challenges" items={(data.challenges as string[]) || []} onChange={v => onChange({ ...data, challenges: v })} />
      <StringArrayField label="Goals" items={(data.goals as string[]) || []} onChange={v => onChange({ ...data, goals: v })} />
    </div>
  )
}

function RolesDomainEditor({ data, onChange }: { data: Record<string, unknown>; onChange: (d: Record<string, unknown>) => void }) {
  return (
    <div className="space-y-6">
      <RoleAssignmentEditor items={(data.assignments as RoleAssignment[]) || []} onChange={v => onChange({ ...data, assignments: v })} />
      <DecisionAreaEditor items={(data.decisionAreas as DecisionArea[]) || []} onChange={v => onChange({ ...data, decisionAreas: v })} />
      <StringArrayField label="Pain Points" items={(data.painPoints as string[]) || []} onChange={v => onChange({ ...data, painPoints: v })} />
      <StringArrayField label="Goals" items={(data.goals as string[]) || []} onChange={v => onChange({ ...data, goals: v })} />
    </div>
  )
}

function OrganizationDomainEditor({ data, onChange }: { data: Record<string, unknown>; onChange: (d: Record<string, unknown>) => void }) {
  return (
    <div className="space-y-6">
      <ObjectArrayEditor
        label="Spaces"
        items={(data.spaces as Record<string, unknown>[]) || []}
        fields={[
          { key: 'name', placeholder: 'Space name' },
          { key: 'currentState', placeholder: 'Current state' },
          { key: 'idealState', placeholder: 'Ideal state' },
          { key: 'priority', placeholder: 'Priority', type: 'select', options: [
            { value: 'urgent', label: 'Urgent' }, { value: 'important', label: 'Important' }, { value: 'nice-to-have', label: 'Nice to have' }
          ]},
        ]}
        onChange={v => onChange({ ...data, spaces: v })}
      />
      <ObjectArrayEditor
        label="Systems"
        items={(data.systems as Record<string, unknown>[]) || []}
        fields={[
          { key: 'name', placeholder: 'System name' },
          { key: 'description', placeholder: 'Description' },
          { key: 'effectiveness', placeholder: 'Effectiveness', type: 'select', options: [
            { value: 'working', label: 'Working' }, { value: 'inconsistent', label: 'Inconsistent' }, { value: 'nonexistent', label: 'Nonexistent' }
          ]},
        ]}
        onChange={v => onChange({ ...data, systems: v })}
      />
      <ObjectArrayEditor
        label="Routines"
        items={(data.routines as Record<string, unknown>[]) || []}
        fields={[
          { key: 'name', placeholder: 'Routine name' },
          { key: 'description', placeholder: 'Description' },
          { key: 'frequency', placeholder: 'Frequency', type: 'select', options: [
            { value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }, { value: 'seasonal', label: 'Seasonal' }
          ]},
          { key: 'consistency', placeholder: 'Consistency', type: 'select', options: [
            { value: 'solid', label: 'Solid' }, { value: 'spotty', label: 'Spotty' }, { value: 'aspirational', label: 'Aspirational' }
          ]},
        ]}
        onChange={v => onChange({ ...data, routines: v })}
      />
      <StringArrayField label="Pain Points" items={(data.painPoints as string[]) || []} onChange={v => onChange({ ...data, painPoints: v })} />
      <StringArrayField label="Goals" items={(data.goals as string[]) || []} onChange={v => onChange({ ...data, goals: v })} />
    </div>
  )
}

function SimpleListDomainEditor({ data, onChange, fields }: {
  data: Record<string, unknown>
  onChange: (d: Record<string, unknown>) => void
  fields: string[]
}) {
  return (
    <div className="space-y-6">
      {fields.map(field => {
        const value = data[field]
        if (typeof value === 'string' || value === undefined || value === null) {
          return <StringField key={field} label={formatLabel(field)} value={(value as string) || ''} onChange={v => onChange({ ...data, [field]: v })} />
        }
        return <StringArrayField key={field} label={formatLabel(field)} items={(value as string[]) || []} onChange={v => onChange({ ...data, [field]: v })} />
      })}
    </div>
  )
}

// ==================== Main Component ====================

const DOMAIN_FIELDS: Record<string, string[]> = {
  adaptability: ['stressors', 'copingStrategies', 'strengths', 'challenges', 'goals'],
  problemSolving: ['decisionStyle', 'conflictPatterns', 'strengths', 'challenges', 'goals'],
  resources: ['principles', 'tensions', 'strengths', 'challenges', 'goals'],
}

export function EditableDomainView({ domainId, data, onSave, onCancel }: EditableDomainViewProps) {
  const [draft, setDraft] = useState<Record<string, unknown>>({ ...data })
  const [saving, setSaving] = useState(false)

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      await onSave(draft)
    } finally {
      setSaving(false)
    }
  }, [draft, onSave])

  const renderEditor = () => {
    switch (domainId) {
      case 'values':
        return <ValuesDomainEditor data={draft} onChange={setDraft} />
      case 'communication':
        return <CommunicationDomainEditor data={draft} onChange={setDraft} />
      case 'connection':
        return <ConnectionDomainEditor data={draft} onChange={setDraft} />
      case 'roles':
        return <RolesDomainEditor data={draft} onChange={setDraft} />
      case 'organization':
        return <OrganizationDomainEditor data={draft} onChange={setDraft} />
      case 'adaptability':
      case 'problemSolving':
      case 'resources':
        return <SimpleListDomainEditor data={draft} onChange={setDraft} fields={DOMAIN_FIELDS[domainId]} />
      default:
        return null
    }
  }

  return (
    <div className="space-y-6">
      {renderEditor()}

      <div className="flex items-center justify-end gap-3 pt-4 border-t border-stone-100">
        <button
          onClick={onCancel}
          disabled={saving}
          className="text-sm px-4 py-2 text-stone-500 hover:text-stone-700 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="text-sm px-4 py-2 bg-stone-900 text-white rounded-lg hover:bg-stone-800 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save changes'}
        </button>
      </div>
    </div>
  )
}
