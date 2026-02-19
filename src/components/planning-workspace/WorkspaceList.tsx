import { useState } from 'react'
import type { ResearchWorkspace } from '@/types/planning'

interface WorkspaceListProps {
  workspaces: ResearchWorkspace[]
  loading: boolean
  resourceCounts: Record<string, number>
  onSelectWorkspace: (id: string) => void
  onCreateWorkspace: (name: string, description?: string) => Promise<ResearchWorkspace | null>
}

export function WorkspaceList({
  workspaces,
  loading,
  resourceCounts,
  onSelectWorkspace,
  onCreateWorkspace,
}: WorkspaceListProps) {
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [saving, setSaving] = useState(false)

  const handleCreate = async () => {
    if (!newName.trim() || saving) return
    setSaving(true)
    const ws = await onCreateWorkspace(newName.trim(), newDesc.trim() || undefined)
    setSaving(false)
    if (ws) {
      setNewName('')
      setNewDesc('')
      setCreating(false)
      onSelectWorkspace(ws.id)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <h3 className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-3">Research Workspaces</h3>
        <button
          onClick={() => setCreating(true)}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-primary-600 bg-primary-50 hover:bg-primary-100 border border-primary-200/60 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New Workspace
        </button>
      </div>

      {/* Create workspace inline form */}
      {creating && (
        <div className="mx-4 mb-3 p-3 rounded-xl border border-primary-200 bg-primary-50/50 space-y-2">
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="e.g. Screen Time, Bedtime Routine"
            className="w-full px-3 py-2 rounded-lg bg-white border border-neutral-200 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-300/50"
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
          />
          <input
            type="text"
            value={newDesc}
            onChange={e => setNewDesc(e.target.value)}
            placeholder="What rules will this research inform? (optional)"
            className="w-full px-3 py-1.5 rounded-lg bg-white border border-neutral-200 text-xs placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-300/50"
          />
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={!newName.trim() || saving}
              className="px-3 py-1.5 rounded-lg bg-primary-600 text-white text-xs font-medium hover:bg-primary-700 transition-colors disabled:opacity-50"
            >
              {saving ? 'Creating...' : 'Create'}
            </button>
            <button
              onClick={() => { setCreating(false); setNewName(''); setNewDesc('') }}
              className="px-3 py-1.5 rounded-lg text-xs text-neutral-500 hover:bg-neutral-100 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Workspace list */}
      <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-0.5">
        {loading ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-neutral-400">Loading...</p>
          </div>
        ) : workspaces.length === 0 && !creating ? (
          <div className="px-4 py-12 text-center">
            <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-neutral-100 flex items-center justify-center">
              <svg className="w-6 h-6 text-neutral-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
              </svg>
            </div>
            <p className="text-sm text-neutral-500 mb-1">No workspaces yet</p>
            <p className="text-xs text-neutral-400">
              Create a workspace for each topic you're researching — like "Screen Time" or "Bedtime Routine"
            </p>
          </div>
        ) : (
          workspaces.map(ws => {
            const count = resourceCounts[ws.id] || 0
            return (
              <button
                key={ws.id}
                onClick={() => onSelectWorkspace(ws.id)}
                className="w-full text-left p-3 rounded-xl border border-transparent hover:bg-neutral-50 transition-all duration-150"
              >
                <div className="flex items-start gap-2.5">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    ws.status === 'synthesized'
                      ? 'bg-green-100 text-green-600'
                      : 'bg-amber-100 text-amber-600'
                  }`}>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      {ws.status === 'synthesized' ? (
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      ) : (
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                      )}
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium text-neutral-700 truncate">{ws.name}</h4>
                    {ws.description && (
                      <p className="text-xs text-neutral-400 mt-0.5 line-clamp-1">{ws.description}</p>
                    )}
                    <p className="text-[11px] text-neutral-400 mt-1">
                      {count} source{count !== 1 ? 's' : ''}
                      {ws.status === 'synthesized' && (
                        <span className="text-green-500 ml-1.5">&#183; Synthesized</span>
                      )}
                    </p>
                  </div>
                  <svg className="w-4 h-4 text-neutral-300 mt-1 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </div>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
