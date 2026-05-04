import { useNavigate } from 'react-router-dom'
import { useMemo } from 'react'
import { MorningLaunchView } from '@/components/wall/contexts/MorningLaunchView'
import { useWallData } from '@/hooks/useWallData'

export function MorningPage() {
  const navigate = useNavigate()
  const { days, familyMembers, calendarEvents, overdueTasks, loading } = useWallData()

  const data = useMemo(() => ({
    now: new Date(),
    days,
    familyMembers,
    calendarEvents,
    overdueTasks,
    todayChores: [],
    todayTasks: [],
  }), [days, familyMembers, calendarEvents, overdueTasks])

  return (
    <div className="fixed inset-0 bg-[#0a0e1a] text-white flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
        <button
          onClick={() => navigate('/')}
          className="text-white/60 hover:text-white/90 font-bold text-sm uppercase tracking-wider"
        >
          ← Back
        </button>
        <h1 className="text-white font-black text-lg uppercase tracking-widest">
          Morning Launch
        </h1>
        <div className="w-16" />
      </div>
      <div className="flex-1 px-8 py-6 overflow-hidden">
        {loading ? (
          <div className="h-full flex items-center justify-center text-white/40">Loading…</div>
        ) : (
          <MorningLaunchView data={data} onDismiss={() => navigate('/')} />
        )}
      </div>
    </div>
  )
}
