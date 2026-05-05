import { useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
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

  const handleClose = useCallback(() => {
    if (window.history.length > 1) navigate(-1)
    else navigate('/today')
  }, [navigate])

  return (
    <div className="h-full bg-[#0a0e1a] text-white rounded-2xl overflow-hidden">
      <div className="px-6 py-4 border-b border-white/8 flex items-center justify-between">
        <h1 className="text-white font-black text-lg uppercase tracking-widest">
          🌅 Morning Launch
        </h1>
        <button
          type="button"
          onClick={handleClose}
          aria-label="Close Morning Launch"
          className="w-9 h-9 -mr-2 flex items-center justify-center rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path fillRule="evenodd" d="M4.28 3.22a.75.75 0 00-1.06 1.06L8.94 10l-5.72 5.72a.75.75 0 101.06 1.06L10 11.06l5.72 5.72a.75.75 0 101.06-1.06L11.06 10l5.72-5.72a.75.75 0 00-1.06-1.06L10 8.94 4.28 3.22z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
      <div className="px-8 py-6 h-[calc(100%-69px)]">
        {loading ? (
          <div className="h-full flex items-center justify-center text-white/40">Loading…</div>
        ) : (
          <MorningLaunchView data={data} onDismiss={handleClose} />
        )}
      </div>
    </div>
  )
}
