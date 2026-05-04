import { useMemo } from 'react'
import { BedtimeView } from '@/components/wall/contexts/BedtimeView'
import { useWallData } from '@/hooks/useWallData'

export function BedtimePage() {
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
    <div className="h-full bg-[#0a0e1a] text-white rounded-2xl overflow-hidden">
      <div className="px-6 py-4 border-b border-white/8 flex items-center justify-between">
        <h1 className="text-white font-black text-lg uppercase tracking-widest">
          🌙 Bedtime
        </h1>
      </div>
      <div className="px-8 py-6 h-[calc(100%-69px)]">
        {loading ? (
          <div className="h-full flex items-center justify-center text-white/40">Loading…</div>
        ) : (
          <BedtimeView data={data} onDismiss={() => {}} />
        )}
      </div>
    </div>
  )
}
