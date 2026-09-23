import { useEffect, useRef, type ComponentType } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
// MoreSheet — Mobile slide-up menu for secondary nav items
// Opens from the "More" tab in the bottom nav. Same destinations as the
// desktop More menu (moreDestinations.ts), plus Settings, which desktop keeps
// in its account menu.
import {
  Archive, BookOpen, Compass, FileText, History, Home, ListChecks, MessageCircle,
  Settings, Sparkles, StickyNote, UtensilsCrossed, Users,
} from 'lucide-react'
import { MORE_GROUPS, isDestinationActive } from './moreDestinations'

interface MoreSheetProps {
  isOpen: boolean
  onClose: () => void
  /** Unread Discussions — shown as the badge on that row. */
  discussionsUnread?: number
  /** Open the assistant (phones have no AI pane beside the page). */
  onAskSymphony?: () => void
}

const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  Someday: Archive,
  Meals: UtensilsCrossed,
  'Meal shelf': BookOpen,
  Lists: ListChecks,
  House: Home,
  Discussions: MessageCircle,
  Contacts: Users,
  Documents: FileText,
  Notes: StickyNote,
  History,
  'Getting started': Compass,
  Settings,
}

const GROUPS = MORE_GROUPS.map(([group, items]) => [
  group,
  group === 'Reference' ? [...items, { label: 'Settings', route: '/settings' }] : items,
] as const)

export function MoreSheet({ isOpen, onClose, discussionsUnread, onAskSymphony }: MoreSheetProps) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const sheet = useRef<HTMLDivElement>(null)

  // A modal sheet: focus moves in on open and Escape closes it.
  useEffect(() => {
    if (!isOpen) return
    sheet.current?.querySelector<HTMLElement>('button')?.focus()
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  }, [isOpen, onClose])

  const go = (route: string) => {
    navigate(route)
    onClose()
  }

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Sheet */}
      <div
        ref={sheet}
        role="dialog"
        aria-modal="true"
        aria-label="More destinations"
        inert={!isOpen}
        aria-hidden={!isOpen}
        className={`fixed bottom-0 left-0 right-0 z-50 max-h-[85vh] overflow-y-auto bg-bg-elevated rounded-t-2xl
          transform transition-transform duration-300 ease-out
          ${isOpen ? 'translate-y-0' : 'translate-y-full'}
        `}
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 rounded-full bg-neutral-300" />
        </div>

        {onAskSymphony && (
          <div className="px-4 pb-2">
            <button
              type="button"
              onClick={onAskSymphony}
              className="flex w-full items-center gap-3 rounded-xl border border-neutral-200 px-4 py-3 text-left text-neutral-800 hover:bg-neutral-50"
            >
              <Sparkles className="h-5 w-5 text-primary-600" aria-hidden="true" />
              <span className="text-[15px] font-medium">Ask Symphony</span>
            </button>
          </div>
        )}

        {GROUPS.map(([group, items]) => (
          <section key={group} aria-labelledby={`more-sheet-${group}`} className="px-4 pb-2">
            <h3 id={`more-sheet-${group}`} className="px-2 pt-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
              {group}
            </h3>
            <div className="grid grid-cols-3 gap-1">
              {items.map(({ label, route }) => {
                const Icon = ICONS[label] ?? Compass
                const active = isDestinationActive(route, pathname)
                const badge = label === 'Discussions' ? discussionsUnread : undefined
                return (
                  <button
                    key={route}
                    type="button"
                    onClick={() => go(route)}
                    aria-current={active ? 'page' : undefined}
                    aria-label={badge ? `${label}, ${badge} unread` : undefined}
                    className={`relative flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl transition-colors
                      ${active ? 'bg-primary-50 text-primary-700' : 'text-neutral-600 hover:bg-neutral-100'}
                    `}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="text-xs font-medium">{label}</span>
                    {badge ? (
                      <span className="absolute top-2 right-2 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-primary-500 text-white text-[10px] font-semibold leading-none">
                        {badge > 99 ? '99+' : badge}
                      </span>
                    ) : null}
                  </button>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </>
  )
}
