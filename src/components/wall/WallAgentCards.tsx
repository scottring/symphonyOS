import { useState, useCallback } from 'react'
import type { KioskCard } from '@/hooks/useKioskCards'

interface WallAgentCardsProps {
  cards: KioskCard[]
  onDismiss: (cardId: string) => void
}

// ════════════════════════════════════════════════════════════════
// Flight deal card — shows cheapest flights in a compact format
// ════════════════════════════════════════════════════════════════

function FlightDealCard({ card, onDismiss }: { card: KioskCard; onDismiss: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const body = card.body as {
    flights?: Array<{
      airline: string
      price: number
      stops: number
      duration: string
    }>
    origin?: string
    destination?: string
    outbound_date?: string
    return_date?: string
    search_url?: string
  }

  const flights = body.flights || []
  const cheapest = flights[0]

  const handleTap = useCallback(() => {
    setExpanded(prev => !prev)
  }, [])

  if (!cheapest) return null

  return (
    <div
      className="relative cursor-pointer transition-all duration-300"
      onClick={handleTap}
    >
      {/* Compact view */}
      <div className="flex items-center gap-4">
        <div className="text-[2.2rem] flex-shrink-0">✈️</div>
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-[#6DC4A7] font-black uppercase tracking-widest text-[0.6rem] mb-0.5">
            Flight Deal
          </span>
          <span className="text-white font-bold text-[1.1rem] truncate leading-tight">
            {body.origin} → {body.destination} from ${cheapest.price}
          </span>
          <span className="text-white/40 text-[0.8rem] truncate">
            {cheapest.airline} · {cheapest.stops === 0 ? 'Nonstop' : `${cheapest.stops} stop`} · {body.outbound_date}
          </span>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDismiss() }}
          className="text-white/20 hover:text-white/50 text-[1rem] p-1"
        >
          ✕
        </button>
      </div>

      {/* Expanded: show more flights */}
      {expanded && flights.length > 1 && (
        <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
          {flights.slice(1, 5).map((f, i) => (
            <div key={i} className="flex items-center justify-between text-[0.85rem]">
              <span className="text-white/60">{f.airline}</span>
              <span className="text-white/40">
                {f.stops === 0 ? 'Nonstop' : `${f.stops} stop`}
              </span>
              <span className="text-white font-bold">${f.price}</span>
            </div>
          ))}
          <div className="text-center pt-1">
            <span className="text-[#6DC4A7]/60 text-[0.7rem] font-bold uppercase tracking-widest">
              Tap to collapse
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// Generic card fallback for future card types
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
