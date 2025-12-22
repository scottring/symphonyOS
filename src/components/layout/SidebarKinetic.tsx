import symphonyLogo from '@/assets/symphony-logo.jpg'
import { PinnedSection } from '@/components/pins'
import type { PinnedItem } from '@/types/pin'
import type { PinnableEntityType } from '@/types/pin'
import type { Task } from '@/types/task'
import type { Project } from '@/types/project'
import type { Contact } from '@/types/contact'
import type { Routine } from '@/types/routine'
import { Home, FolderKanban, RefreshCw, Clock, FileText, Search, Settings, LogOut, ChevronLeft, ChevronRight } from 'lucide-react'

// Feature flags for in-progress features
const FEATURES = {
  notes: true,
  lists: false,
}

export type ViewType = 'home' | 'projects' | 'routines' | 'lists' | 'notes' | 'history' | 'task-detail' | 'contact-detail' | 'settings' | 'packing-templates'

interface EntityData {
  tasks: Task[]
  projects: Project[]
  contacts: Contact[]
  routines: Routine[]
  lists: Array<{ id: string; name: string }>
}

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
  userEmail?: string
  onSignOut?: () => void
  activeView: ViewType
  onViewChange: (view: ViewType) => void
  onOpenSearch?: () => void
  pins?: PinnedItem[]
  entities?: EntityData
  onPinNavigate?: (entityType: PinnableEntityType, entityId: string) => void
  onPinMarkAccessed?: (entityType: PinnableEntityType, entityId: string) => void
  onPinRefreshStale?: (id: string) => void
}

export function SidebarKinetic({
  collapsed,
  onToggle,
  userEmail,
  onSignOut,
  activeView,
  onViewChange,
  onOpenSearch,
  pins = [],
  entities,
  onPinNavigate,
  onPinMarkAccessed,
  onPinRefreshStale,
}: SidebarProps) {
  return (
    <aside
      className={`
        h-full glass
        flex flex-col
        transition-all duration-300 ease-out
        border-r border-slate-700/50
        ${collapsed ? 'w-20' : 'w-72'}
      `}
    >
      {/* Header with animated logo */}
      <div className="p-5 flex items-center justify-between">
        <div className={`flex items-center gap-3 ${collapsed ? 'justify-center w-full' : ''}`}>
          <div className="relative group">
            <div className="absolute inset-0 bg-gradient-primary rounded-xl opacity-20 blur-lg group-hover:opacity-40 transition-opacity"></div>
            <img
              src={symphonyLogo}
              alt="Symphony"
              className="w-10 h-10 rounded-xl object-cover relative z-10 ring-2 ring-electric-500/30 group-hover:ring-electric-400/50 transition-all"
            />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="font-display text-xl font-semibold text-gradient leading-tight">
                Symphony
              </span>
              <span className="text-[10px] font-mono text-slate-400 tracking-wider uppercase">
                Kinetic OS
              </span>
            </div>
          )}
        </div>
        {!collapsed && (
          <button
            onClick={onToggle}
            className="btn-icon group"
            aria-label="Collapse sidebar"
          >
            <ChevronLeft className="w-5 h-5 group-hover:scale-110 transition-transform" />
          </button>
        )}
      </div>

      {/* Expand button when collapsed */}
      {collapsed && (
        <button
          onClick={onToggle}
          className="mx-auto mb-4 btn-icon group"
          aria-label="Expand sidebar"
        >
          <ChevronRight className="w-5 h-5 group-hover:scale-110 transition-transform" />
        </button>
      )}

      {/* Quick Action: Search */}
      {onOpenSearch && (
        <div className="px-4 mb-2">
          <button
            onClick={onOpenSearch}
            className={`
              w-full flex items-center gap-3 px-4 py-3 rounded-xl
              glass-card group
              ${collapsed ? 'justify-center' : ''}
            `}
          >
            <Search className="w-5 h-5 text-cyan-400 group-hover:text-cyan-300 transition-colors" />
            {!collapsed && (
              <>
                <span className="flex-1 text-left text-sm font-medium text-slate-200">
                  Search
                </span>
                <kbd className="hidden lg:inline px-2 py-1 text-xs font-mono text-slate-400 bg-slate-800/50 rounded border border-slate-700/50">
                  ⌘J
                </kbd>
              </>
            )}
          </button>
        </div>
      )}

      {/* Pinned Section */}
      {pins.length > 0 && entities && onPinNavigate && onPinMarkAccessed && onPinRefreshStale && (
        <div className="px-4 mb-4">
          <PinnedSection
            pins={pins}
            entities={entities}
            collapsed={collapsed}
            onNavigate={onPinNavigate}
            onMarkAccessed={onPinMarkAccessed}
            onRefreshStale={onPinRefreshStale}
          />
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 px-4 space-y-1.5 overflow-y-auto">
        <NavButton
          icon={Home}
          label="Home"
          active={activeView === 'home'}
          collapsed={collapsed}
          onClick={() => onViewChange('home')}
          gradient="from-electric-500 to-electric-600"
        />

        <NavButton
          icon={FolderKanban}
          label="Projects"
          active={activeView === 'projects'}
          collapsed={collapsed}
          onClick={() => onViewChange('projects')}
          gradient="from-cyan-500 to-electric-500"
        />

        <NavButton
          icon={RefreshCw}
          label="Routines"
          active={activeView === 'routines'}
          collapsed={collapsed}
          onClick={() => onViewChange('routines')}
          gradient="from-magenta-500 to-electric-600"
        />

        <NavButton
          icon={Clock}
          label="History"
          active={activeView === 'history'}
          collapsed={collapsed}
          onClick={() => onViewChange('history')}
          gradient="from-amber-500 to-magenta-500"
        />

        {FEATURES.notes && (
          <NavButton
            icon={FileText}
            label="Notes"
            active={activeView === 'notes'}
            collapsed={collapsed}
            onClick={() => onViewChange('notes')}
            gradient="from-cyan-400 to-cyan-600"
            badge="New"
          />
        )}
      </nav>

      {/* User section */}
      {(userEmail || onSignOut) && (
        <div className={`p-4 border-t border-slate-700/50 space-y-2 ${collapsed ? 'text-center' : ''}`}>
          {!collapsed && userEmail && (
            <div className="px-3 py-2 rounded-lg bg-slate-800/30 border border-slate-700/30">
              <p className="text-xs font-mono text-slate-400 truncate">{userEmail}</p>
            </div>
          )}

          <button
            onClick={() => onViewChange('settings')}
            className={`
              flex items-center gap-3 px-4 py-3 rounded-xl w-full
              text-sm font-medium transition-all
              ${activeView === 'settings'
                ? 'glass-card text-slate-200'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
              }
              ${collapsed ? 'justify-center' : ''}
            `}
          >
            <Settings className={`w-5 h-5 ${activeView === 'settings' ? 'text-electric-400' : ''}`} />
            {!collapsed && <span>Settings</span>}
          </button>

          {onSignOut && (
            <button
              onClick={onSignOut}
              className={`
                flex items-center gap-3 px-4 py-3 rounded-xl w-full
                text-sm font-medium text-slate-400 hover:text-danger-400 hover:bg-slate-800/30
                transition-all
                ${collapsed ? 'justify-center' : ''}
              `}
            >
              <LogOut className="w-5 h-5" />
              {!collapsed && <span>Sign out</span>}
            </button>
          )}
        </div>
      )}
    </aside>
  )
}

// Navigation Button Component with kinetic effects
interface NavButtonProps {
  icon: React.ComponentType<{ className?: string }>
  label: string
  active: boolean
  collapsed: boolean
  onClick: () => void
  gradient: string
  badge?: string
}

function NavButton({ icon: Icon, label, active, collapsed, onClick, gradient, badge }: NavButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`
        relative w-full flex items-center gap-3 px-4 py-3.5 rounded-xl
        transition-all duration-200 group
        ${active
          ? 'glass-card text-slate-100'
          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
        }
        ${collapsed ? 'justify-center' : ''}
      `}
    >
      {/* Active indicator */}
      {active && !collapsed && (
        <div className={`absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-r-full bg-linear-to-b ${gradient}`} />
      )}

      {/* Icon with gradient on active */}
      <div className="relative">
        <Icon className={`w-5 h-5 relative z-10 transition-transform group-hover:scale-110 ${
          active ? `text-transparent bg-linear-to-br ${gradient} bg-clip-text` : ''
        }`} />
        {active && (
          <div className={`absolute inset-0 bg-linear-to-br ${gradient} opacity-20 blur-md`} />
        )}
      </div>

      {!collapsed && (
        <>
          <span className="flex-1 text-left text-sm font-medium">
            {label}
          </span>
          {badge && (
            <span className="px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase rounded-full bg-gradient-accent text-white">
              {badge}
            </span>
          )}
        </>
      )}

      {/* Hover glow effect */}
      {!active && (
        <div className={`absolute inset-0 bg-linear-to-br ${gradient} opacity-0 group-hover:opacity-5 rounded-xl transition-opacity`} />
      )}
    </button>
  )
}
