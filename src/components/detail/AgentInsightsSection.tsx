import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { ConceptIcon } from '@/lib/conceptIcons'
import type { KioskCard } from '@/hooks/useKioskCards'

interface AgentInsightsSectionProps {
  taskId: string
}

interface FlightData {
  airline: string
  price: number
  stops: number
  duration_min: number
  departure_time: string
  arrival_time: string
  departure_airport: string
  arrival_airport: string
  outbound_date: string
  return_date: string
  route: string
  booking_url?: string
  booking_post_data?: string
  book_with?: string
}

function formatDuration(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h}h${m}m` : `${h}h`
}

function openBooking(flight: FlightData, searchUrl?: string) {
  // booking_url is now the exact Google Flights URL from the search
  const url = flight.booking_url || searchUrl || 'https://www.google.com/travel/flights'
  window.open(url, '_blank')
}

export function AgentInsightsSection({ taskId }: AgentInsightsSectionProps) {
  const { user } = useAuth()
  const [cards, setCards] = useState<KioskCard[]>([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)

  const fetchCards = useCallback(async () => {
    if (!user) return
    const now = new Date().toISOString()
    const { data } = await supabase
      .from('kiosk_cards')
      .select('*')
      .eq('user_id', user.id)
      .eq('source_task_id', taskId)
      .eq('dismissed', false)
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .order('priority', { ascending: false })
      .limit(5)
    if (data) setCards(data as KioskCard[])
    setLoading(false)
  }, [user, taskId])

  useEffect(() => {
    fetchCards()
  }, [fetchCards])

  const runAgent = useCallback(async () => {
    setRunning(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return

      await supabase.functions.invoke('kiosk-agent', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      await fetchCards()
    } catch (err) {
      console.error('[agent] Failed:', err)
    } finally {
      setRunning(false)
    }
  }, [fetchCards])

  const dismissCard = useCallback(async (cardId: string) => {
    await supabase
      .from('kiosk_cards')
      .update({ dismissed: true })
      .eq('id', cardId)
    setCards(prev => prev.filter(c => c.id !== cardId))
  }, [])

  // Don't render if no cards and not loading
  if (!loading && cards.length === 0) {
    return (
      <div className="mx-4 mt-4">
        <button
          onClick={runAgent}
          disabled={running}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl
                     bg-primary-50 hover:bg-primary-100 text-primary-700 text-sm font-medium
                     transition-colors disabled:opacity-50"
        >
          <svg className={`w-4 h-4 ${running ? 'animate-spin' : ''}`} viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
          </svg>
          {running ? 'Finding insights...' : 'Find Agent Insights'}
        </button>
      </div>
    )
  }

  if (loading) return null

  return (
    <div className="mx-4 mt-4">
      <div className="bg-white rounded-2xl shadow-sm border border-neutral-100 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-primary-600" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
            </svg>
            <h3 className="text-sm font-medium text-neutral-700">Agent Insights</h3>
          </div>
          <button
            onClick={runAgent}
            disabled={running}
            className="p-1.5 hover:bg-neutral-100 rounded-lg transition-colors disabled:opacity-50"
            title="Refresh insights"
          >
            <svg className={`w-4 h-4 text-neutral-400 ${running ? 'animate-spin' : ''}`} viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Cards */}
        <div className="divide-y divide-neutral-50">
          {cards.map(card => {
            if (card.card_type === 'flight_deal') {
              return (
                <FlightInsightCard
                  key={card.id}
                  card={card}
                  onDismiss={() => dismissCard(card.id)}
                />
              )
            }
            return (
              <GenericInsightCard
                key={card.id}
                card={card}
                onDismiss={() => dismissCard(card.id)}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════

function FlightInsightCard({ card, onDismiss }: { card: KioskCard; onDismiss: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const body = card.body as {
    flights?: FlightData[]
    preferences?: string
    budget?: number
    search_url?: string
    total_found?: number
    searches_run?: number
  }
  const flights = (body.flights || []) as FlightData[]

  if (!flights.length) {
    return (
      <div className="px-4 py-3 flex items-center gap-3">
        <span className="text-lg">✈️</span>
        <span className="text-sm text-neutral-500">No flights matched your criteria</span>
        <button onClick={onDismiss} className="ml-auto text-neutral-300 hover:text-neutral-500 text-xs" aria-label="Dismiss"><ConceptIcon name="close" size={12} decorative /></button>
      </div>
    )
  }

  return (
    <div className="px-4 py-3">
      {/* Summary */}
      <div className="flex items-center gap-3 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <span className="text-lg flex-shrink-0">✈️</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-neutral-800">{card.title}</span>
            {body.budget && flights[0].price <= body.budget && (
              <span className="text-[0.6rem] font-bold uppercase tracking-wider text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full">
                Under budget
              </span>
            )}
          </div>
          <span className="text-xs text-neutral-500">
            {flights[0].airline} · {flights[0].departure_time}–{flights[0].arrival_time} · {formatDuration(flights[0].duration_min)} · {flights[0].stops === 0 ? 'Nonstop' : `${flights[0].stops} stop`} · {flights[0].outbound_date}–{flights[0].return_date}
          </span>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); openBooking(flights[0], body.search_url) }}
          className="px-3 py-1.5 rounded-lg bg-primary-500 text-white text-xs font-semibold
                     hover:bg-primary-600 transition-colors flex-shrink-0"
        >
          Book
        </button>
        <button onClick={(e) => { e.stopPropagation(); onDismiss() }} className="text-neutral-300 hover:text-neutral-500 text-xs p-1" aria-label="Dismiss"><ConceptIcon name="close" size={12} decorative /></button>
        <svg
          className={`w-4 h-4 text-neutral-400 transition-transform ${expanded ? '' : '-rotate-90'}`}
          viewBox="0 0 20 20" fill="currentColor"
        >
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </div>

      {/* Expanded flight list */}
      {expanded && (
        <div className="mt-3 space-y-1">
          {body.preferences && (
            <p className="text-xs text-neutral-400 italic mb-2">{body.preferences}</p>
          )}
          {flights.slice(0, 6).map((f, i) => (
            <div
              key={i}
              className="flex items-center gap-2 text-xs py-2 px-2 rounded-lg hover:bg-neutral-50 cursor-pointer"
              onClick={() => openBooking(f, body.search_url)}
            >
              <span className="text-neutral-600 w-20 flex-shrink-0 font-medium">{f.airline}</span>
              <span className="text-neutral-500 w-24 text-center font-mono text-[0.7rem]">
                {f.departure_time}–{f.arrival_time}
              </span>
              <span className="text-neutral-400 w-14 text-center">{formatDuration(f.duration_min)}</span>
              <span className="text-neutral-400 w-14 text-center">
                {f.stops === 0 ? 'Nonstop' : `${f.stops} stop`}
              </span>
              <span className="text-neutral-400 w-20 text-center text-[0.7rem]">{f.outbound_date}</span>
              <span className={`font-semibold w-12 text-right ${body.budget && f.price <= body.budget ? 'text-green-600' : 'text-neutral-800'}`}>
                ${f.price}
              </span>
              <span className="text-primary-600 font-semibold w-10 text-right text-[0.65rem]">
                Book →
              </span>
            </div>
          ))}

          {body.search_url && (
            <div className="pt-2 text-center">
              <a
                href={body.search_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary-500 hover:text-primary-600 font-medium"
              >
                View all on Google Flights →
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function GenericInsightCard({ card, onDismiss }: { card: KioskCard; onDismiss: () => void }) {
  return (
    <div className="px-4 py-3 flex items-center gap-3">
      {card.icon ? <span className="text-lg">{card.icon}</span> : <ConceptIcon name="idea" size={18} decorative />}
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-neutral-800">{card.title}</span>
        {card.subtitle && (
          <span className="block text-xs text-neutral-500">{card.subtitle}</span>
        )}
      </div>
      <button onClick={onDismiss} className="text-neutral-300 hover:text-neutral-500 text-xs p-1" aria-label="Dismiss"><ConceptIcon name="close" size={12} decorative /></button>
    </div>
  )
}
