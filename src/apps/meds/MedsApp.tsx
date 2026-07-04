import { useState } from 'react'
import { Pill, Clock, ListChecks } from 'lucide-react'
import { useMedications } from '@/hooks/useMedications'
import { useMedicationLogs } from '@/hooks/useMedicationLogs'
import { TodayStrip } from './components/TodayStrip'
import { TimingView } from './components/TimingView'
import { MedManageList } from './components/MedManageList'

type Tab = 'today' | 'timing' | 'manage'

export function MedsApp() {
  const [tab, setTab] = useState<Tab>('today')
  const { medications, loading, addMedication, updateMedication, deleteMedication } = useMedications()
  const { logs, logDose, updateLog, deleteLog } = useMedicationLogs({ sinceDays: 30 })

  const tabs: { id: Tab; label: string; icon: typeof Pill }[] = [
    { id: 'today', label: 'Today', icon: Pill },
    { id: 'timing', label: 'Timing', icon: Clock },
    { id: 'manage', label: 'Manage', icon: ListChecks },
  ]

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-3xl font-display mb-4">Medications</h1>
      <div className="flex gap-2 mb-6">
        {tabs.map((t) => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm ${
                tab === t.id ? 'btn-primary' : 'card'
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          )
        })}
      </div>

      {loading ? (
        <p className="text-neutral-500">Loading…</p>
      ) : tab === 'today' ? (
        <TodayStrip medications={medications} logs={logs} onLogDose={logDose} />
      ) : tab === 'timing' ? (
        <TimingView medications={medications} logs={logs} />
      ) : (
        <MedManageList
          medications={medications}
          logs={logs}
          onAdd={addMedication}
          onUpdate={updateMedication}
          onDelete={deleteMedication}
          onLogDose={logDose}
          onUpdateLog={updateLog}
          onDeleteLog={deleteLog}
        />
      )}
    </div>
  )
}
