import { useState } from 'react'
import type { Routine } from '@/types/actionable'
import type { TendFinding } from './tendHeuristics'

const DOMAINS = ['work', 'family', 'personal'] as const

function LookalikeRow({ finding, onMerge }: {
  finding: Extract<TendFinding, { kind: 'lookalike' }>
  onMerge: (survivorId: string, loserIds: string[]) => void
}) {
  const [picking, setPicking] = useState(false)
  const [survivor, setSurvivor] = useState<string | null>(null)
  return (
    <div className="rounded-lg bg-emerald-900/40 px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm min-w-0 truncate">{finding.names.join(' / ')} — same job?</span>
        <button onClick={() => setPicking(v => !v)}
          className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold hover:bg-emerald-500 transition-colors flex-shrink-0">
          Merge
        </button>
      </div>
      {picking && (
        <div className="mt-2 flex flex-col gap-1">
          {finding.ids.map((id, i) => (
            <label key={id} className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="radio" name={`survivor-${finding.ids[0]}`} aria-label={finding.names[i]}
                     checked={survivor === id} onChange={() => setSurvivor(id)} />
              {finding.names[i]}
            </label>
          ))}
          <button
            disabled={!survivor || !finding.ids.includes(survivor)}
            onClick={() => survivor && finding.ids.includes(survivor) && onMerge(survivor, finding.ids.filter(id => id !== survivor))}
            className="mt-1 self-start rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold
                       disabled:opacity-40 hover:bg-emerald-500 transition-colors"
          >
            Keep this one, remove {finding.ids.length - 1}
          </button>
        </div>
      )}
    </div>
  )
}

function StampRow({ finding, routines, onStampDomain }: {
  finding: Extract<TendFinding, { kind: 'missing-domain' }>
  routines: Routine[]
  onStampDomain: (id: string, context: 'work' | 'family' | 'personal') => void
}) {
  const [reviewing, setReviewing] = useState(false)
  const current = finding.ids
    .map(id => routines.find(r => r.id === id))
    .find((r): r is Routine => !!r && r.context == null)
  return (
    <div className="rounded-lg bg-emerald-900/40 px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm">{finding.ids.length} routines have no domain — stamp them?</span>
        {!reviewing && (
          <button onClick={() => setReviewing(true)}
            className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold hover:bg-emerald-500 transition-colors">
            Review
          </button>
        )}
      </div>
      {reviewing && current && (
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="text-sm font-medium min-w-0 truncate">{current.name}</span>
          <span className="flex gap-1 flex-shrink-0">
            {DOMAINS.map(d => (
              <button key={d}
                onClick={() => onStampDomain(current.id, d)}
                className="rounded-md bg-emerald-700 px-2 py-1 text-xs capitalize hover:bg-emerald-600 transition-colors">
                {d}
              </button>
            ))}
          </span>
        </div>
      )}
      {reviewing && !current && <p className="mt-2 text-xs text-emerald-300">All stamped.</p>}
    </div>
  )
}

function UnfinishedRow({ finding, onRename, onLetGo }: {
  finding: Extract<TendFinding, { kind: 'unfinished-name' }>
  onRename: (id: string, name: string) => void
  onLetGo: (id: string) => void
}) {
  const [name, setName] = useState(finding.name)
  const [confirming, setConfirming] = useState(false)
  return (
    <div className="rounded-lg bg-emerald-900/40 px-3 py-2 flex items-center gap-2">
      <input value={name} onChange={e => setName(e.target.value)}
             onKeyDown={e => { if (e.key === 'Enter' && name.trim()) onRename(finding.id, name.trim()) }}
             className="min-w-0 flex-1 rounded-md bg-emerald-950/50 px-2 py-1 text-sm focus:outline-none
                        focus:ring-1 focus:ring-emerald-400" />
      <button
        onClick={() => (confirming ? onLetGo(finding.id) : setConfirming(true))}
        className="rounded-md bg-emerald-700 px-2.5 py-1 text-xs hover:bg-red-800 transition-colors flex-shrink-0"
      >
        {confirming ? 'Sure? Remove' : 'Let go'}
      </button>
    </div>
  )
}

export function TendCard({ findings, routines, onMerge, onStampDomain, onRename, onLetGo }: {
  findings: TendFinding[]
  routines: Routine[]
  onMerge: (survivorId: string, loserIds: string[]) => void
  onStampDomain: (id: string, context: 'work' | 'family' | 'personal') => void
  onRename: (id: string, name: string) => void
  onLetGo: (id: string) => void
}) {
  if (findings.length === 0) return null
  const shown = findings.slice(0, 3)
  return (
    <section className="mb-6 rounded-2xl bg-[#33413a] p-4 text-emerald-50">
      <div className="flex items-center justify-between mb-2.5">
        <h2 className="font-display font-semibold">Worth tending</h2>
        <span className="rounded-full bg-emerald-800/70 px-2.5 py-0.5 text-[11px]">
          {findings.length} suggestion{findings.length === 1 ? '' : 's'}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {shown.map(f => {
          if (f.kind === 'lookalike') return <LookalikeRow key={'l-' + f.ids.join('.')} finding={f} onMerge={onMerge} />
          if (f.kind === 'missing-domain') return <StampRow key="missing-domain" finding={f} routines={routines} onStampDomain={onStampDomain} />
          return <UnfinishedRow key={'u-' + f.id} finding={f} onRename={onRename} onLetGo={onLetGo} />
        })}
      </div>
    </section>
  )
}
