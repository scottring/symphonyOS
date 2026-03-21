import { useState, useEffect, useCallback } from 'react'
import type { TimelineItem } from '@/types/timeline'

interface WallItemDetailProps {
  item: TimelineItem
  onClose: () => void
}

function formatDetailTime(item: TimelineItem): string | null {
  if (!item.startTime) return null
  const start = new Date(item.startTime)
  const opts: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' }
  let str = start.toLocaleTimeString('en-US', opts)
  if (item.endTime) {
    const end = new Date(item.endTime)
    str += ` – ${end.toLocaleTimeString('en-US', opts)}`
  }
  return str
}

function formatDetailDate(item: TimelineItem): string | null {
  if (!item.startTime) return null
  const d = new Date(item.startTime)
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

function getTypeLabel(item: TimelineItem): string {
  switch (item.type) {
    case 'task': return item.category || 'Task'
    case 'event': return 'Event'
    case 'routine': return 'Routine'
    case 'playbook': return 'Playbook'
    default: return 'Item'
  }
}

function getTypeColor(item: TimelineItem): string {
  switch (item.type) {
    case 'task': return '#F9C35C'
    case 'event': return '#6DC4A7'
    case 'routine': return '#F26E63'
    case 'playbook': return '#A78BFA'
    default: return '#9CA3AF'
  }
}

export function WallItemDetail({ item, onClose }: WallItemDetailProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 30)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  const handleClose = useCallback(() => {
    setVisible(false)
    setTimeout(onClose, 200)
  }, [onClose])

  const timeStr = formatDetailTime(item)
  const dateStr = formatDetailDate(item)
  const typeLabel = getTypeLabel(item)
  const typeColor = getTypeColor(item)

  const hasDetails = item.notes || (item.links && item.links.length > 0) || item.phoneNumber || item.location || item.googleDescription

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center transition-all duration-200 ${visible ? 'bg-black/60 backdrop-blur-sm' : 'bg-transparent'}`}
      onClick={handleClose}
    >
      <div
        className={`w-[700px] max-h-[600px] bg-[#1e1e1e] border border-white/[0.12] rounded-[1.5rem] shadow-2xl overflow-hidden transition-all duration-200 ${visible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-8 pt-7 pb-5 border-b border-white/[0.08]">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              {/* Type badge */}
              <span
                className="inline-block text-[0.65rem] font-black uppercase tracking-widest px-2.5 py-1 rounded-full mb-3"
                style={{ backgroundColor: typeColor + '22', color: typeColor }}
              >
                {typeLabel}
              </span>

              {/* Title */}
              <h2 className="text-[1.6rem] font-black text-white leading-tight">
                {item.title}
              </h2>

              {/* Time & Date */}
              {(timeStr || dateStr) && (
                <div className="flex items-center gap-3 mt-2">
                  {dateStr && (
                    <span className="text-[0.9rem] font-bold text-white/50">{dateStr}</span>
                  )}
                  {timeStr && (
                    <span className="text-[0.9rem] font-bold text-white/70">{timeStr}</span>
                  )}
                </div>
              )}
            </div>

            {/* Close button */}
            <button
              onClick={handleClose}
              className="w-10 h-10 rounded-full bg-white/[0.08] hover:bg-white/[0.15] flex items-center justify-center transition-colors flex-shrink-0 ml-4"
            >
              <span className="text-white/60 text-[1.2rem] leading-none">✕</span>
            </button>
          </div>
        </div>

        {/* Content */}
        <div
          className="px-8 py-6 overflow-y-auto"
          style={{ maxHeight: 400, scrollbarWidth: 'none' }}
        >
          {!hasDetails && (
            <div className="text-white/30 text-[1rem] italic">No additional details</div>
          )}

          {/* Location */}
          {item.location && (
            <div className="mb-5">
              <div className="text-[0.7rem] font-black text-white/40 uppercase tracking-widest mb-1.5">Location</div>
              <div className="flex items-center gap-2">
                <span className="text-[1.1rem]">📍</span>
                <span className="text-[1rem] font-bold text-white/80">{item.location}</span>
              </div>
            </div>
          )}

          {/* Phone */}
          {item.phoneNumber && (
            <div className="mb-5">
              <div className="text-[0.7rem] font-black text-white/40 uppercase tracking-widest mb-1.5">Phone</div>
              <a
                href={`tel:${item.phoneNumber}`}
                className="flex items-center gap-2 text-[1rem] font-bold text-[#6DC4A7] hover:text-[#8DD8BD] transition-colors"
              >
                <span className="text-[1.1rem]">📞</span>
                {item.phoneNumber}
              </a>
            </div>
          )}

          {/* Notes */}
          {item.notes && (
            <div className="mb-5">
              <div className="text-[0.7rem] font-black text-white/40 uppercase tracking-widest mb-1.5">Notes</div>
              <p className="text-[0.95rem] text-white/70 leading-relaxed whitespace-pre-wrap">
                {item.notes}
              </p>
            </div>
          )}

          {/* Google Calendar description */}
          {item.googleDescription && !item.notes && (
            <div className="mb-5">
              <div className="text-[0.7rem] font-black text-white/40 uppercase tracking-widest mb-1.5">Details</div>
              <p className="text-[0.95rem] text-white/70 leading-relaxed whitespace-pre-wrap">
                {item.googleDescription}
              </p>
            </div>
          )}

          {/* Links */}
          {item.links && item.links.length > 0 && (
            <div className="mb-5">
              <div className="text-[0.7rem] font-black text-white/40 uppercase tracking-widest mb-1.5">Links</div>
              <div className="flex flex-col gap-2">
                {item.links.map((link, i) => (
                  <a
                    key={i}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] transition-colors"
                  >
                    <span className="text-[0.9rem]">🔗</span>
                    <span className="text-[0.9rem] font-bold text-[#6DC4A7] truncate">
                      {link.title || link.url}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Calendar source */}
          {item.calendarName && (
            <div className="mt-4 pt-4 border-t border-white/[0.06]">
              <span className="text-[0.75rem] font-bold text-white/25 uppercase tracking-wider">
                Calendar: {item.calendarName}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
