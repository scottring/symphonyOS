import { useState, useCallback } from 'react'
import type { KioskCard } from '@/hooks/useKioskCards'

interface WallAgentCardsProps {
  cards: KioskCard[]
  onDismiss: (cardId: string) => void
}

interface FlightData {
  airline: string
  price: number
  stops: number
  duration_min: number
  layover_min?: number
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
  const url = flight.booking_url || searchUrl || 'https://www.google.com/travel/flights'
  window.open(url, '_blank')
}

// ════════════════════════════════════════════════════════════════
// Flight deal card
// ════════════════════════════════════════════════════════════════

function FlightDealCard({ card, onDismiss }: { card: KioskCard; onDismiss: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const body = card.body as {
    flights?: FlightData[]
    preferences?: string
    searches_run?: number
    total_found?: number
    budget?: number
    passengers?: number
    search_url?: string
  }

  const flights = (body.flights || []) as FlightData[]
  const cheapest = flights[0]

  const handleTap = useCallback(() => {
    setExpanded(prev => !prev)
  }, [])

  const handleBookClick = useCallback((e: React.MouseEvent, flight: FlightData) => {
    e.stopPropagation()
    openBooking(flight, body.search_url)
  }, [body.search_url])

  if (!cheapest && !body.preferences) return null

  // No results card
  if (!cheapest) {
    return (
      <div className="flex items-center gap-4">
        <div className="text-[2.2rem] flex-shrink-0">✈️</div>
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-red-400 font-black uppercase tracking-widest text-[0.6rem] mb-0.5">
            No Matches
          </span>
          <span className="text-white/60 text-[0.9rem] leading-tight">
            {body.preferences}
          </span>
        </div>
        <button
          onClick={onDismiss}
          className="text-white/20 hover:text-white/50 text-[1rem] p-1"
        >
          ✕
        </button>
      </div>
    )
  }

  const underBudget = body.budget ? cheapest.price <= body.budget : false

  return (
    <div
      className="relative cursor-pointer transition-all duration-300"
      onClick={handleTap}
    >
      {/* Compact view */}
      <div className="flex items-center gap-4">
        <div className="text-[2.2rem] flex-shrink-0">✈️</div>
        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`${underBudget ? 'text-[#6DC4A7]' : 'text-amber-400'} font-black uppercase tracking-widest text-[0.6rem]`}>
              {underBudget ? 'Under Budget' : 'Flight Deal'}
            </span>
            {body.total_found !== undefined && (
              <span className="text-white/20 text-[0.55rem] font-bold">
                {body.total_found} found · {body.searches_run} searches
              </span>
            )}
          </div>
          <span className="text-white font-bold text-[1.1rem] truncate leading-tight">
            {card.title}
          </span>
          <span className="text-white/40 text-[0.8rem] truncate">
            {cheapest.airline} · {cheapest.stops === 0 ? 'Nonstop' : `${cheapest.stops} stop${cheapest.stops > 1 ? 's' : ''}`} · {formatDuration(cheapest.duration_min)} · {cheapest.outbound_date}–{cheapest.return_date}
          </span>
        </div>

        {/* Book button for cheapest */}
        <button
          onClick={(e) => handleBookClick(e, cheapest)}
          className="px-3 py-1.5 rounded-lg bg-[#6DC4A7]/20 text-[#6DC4A7] font-black text-[0.7rem] uppercase tracking-widest
                     hover:bg-[#6DC4A7]/30 transition-colors flex-shrink-0 border border-[#6DC4A7]/30"
        >
          Book
        </button>

        <button
          onClick={(e) => { e.stopPropagation(); onDismiss() }}
          className="text-white/20 hover:text-white/50 text-[1rem] p-1"
        >
          ✕
        </button>
      </div>

      {/* Expanded: show all flights with individual book buttons */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-white/10 space-y-1.5">
          {body.preferences && (
            <div className="text-white/30 text-[0.7rem] italic mb-2">{body.preferences}</div>
          )}
          {flights.slice(0, 6).map((f, i) => (
            <div
              key={i}
              className="flex items-center text-[0.85rem] gap-3 px-2 py-1.5 rounded-lg hover:bg-white/[0.06] cursor-pointer"
              onClick={(e) => handleBookClick(e, f)}
            >
              <span className="text-white/50 w-14 flex-shrink-0">{f.route}</span>
              <span className="text-white/60 flex-1 truncate">{f.airline}</span>
              <span className="text-white/40 w-12 text-center">
                {f.stops === 0 ? 'Non' : `${f.stops}st`}
              </span>
              <span className="text-white/40 w-12 text-center">{formatDuration(f.duration_min)}</span>
              <span className="text-white/40 w-24 text-center text-[0.75rem]">{f.outbound_date}</span>
              <span className={`font-bold w-12 text-right ${body.budget && f.price <= body.budget ? 'text-[#6DC4A7]' : 'text-white'}`}>
                ${f.price}
              </span>
              <span className="text-[#6DC4A7] text-[0.65rem] font-black uppercase tracking-widest w-10 text-right flex-shrink-0">
                Book
              </span>
            </div>
          ))}

          {/* Fallback: Google Flights link */}
          {body.search_url && (
            <div className="text-center pt-2">
              <button
                onClick={(e) => { e.stopPropagation(); window.open(body.search_url, '_blank') }}
                className="text-white/30 hover:text-white/50 text-[0.65rem] font-bold uppercase tracking-widest
                           underline underline-offset-2 decoration-white/20"
              >
                View all on Google Flights
              </button>
            </div>
          )}

          <div className="text-center pt-0.5">
            <span className="text-white/15 text-[0.6rem] font-bold uppercase tracking-widest">
              Tap header to collapse
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// Generic card fallback
// ════════════════════════════════════════════════════════════════

function GenericCard({ card, onDismiss }: { card: KioskCard; onDismiss: () => void }) {
  return (
    <div className="flex items-center gap-4">
      <div className="text-[2.2rem] flex-shrink-0">{card.icon || '💡'}</div>
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-amber-400 font-black uppercase tracking-widest text-[0.6rem] mb-0.5">
          {card.card_type.replace(/_/g, ' ')}
        </span>
        <span className="text-white font-bold text-[1.1rem] truncate leading-tight">
          {card.title}
        </span>
        {card.subtitle && (
          <span className="text-white/40 text-[0.8rem] truncate">{card.subtitle}</span>
        )}
      </div>
      <button
        onClick={onDismiss}
        className="text-white/20 hover:text-white/50 text-[1rem] p-1"
      >
        ✕
      </button>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ════════════════════════════════════════════════════════════════

export function WallAgentCards({ cards, onDismiss }: WallAgentCardsProps) {
  if (!cards.length) return null

  return (
    <>
      {cards.map(card => {
        const dismiss = () => onDismiss(card.id)
        switch (card.card_type) {
          case 'flight_deal':
            return <FlightDealCard key={card.id} card={card} onDismiss={dismiss} />
          default:
            return <GenericCard key={card.id} card={card} onDismiss={dismiss} />
        }
      })}
    </>
  )
}
