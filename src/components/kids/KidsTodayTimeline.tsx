import { useState, useEffect, useMemo, useCallback } from 'react'
import './kids-timeline.css'

// Types
interface KidsTimelineItem {
  id: string
  type: 'task' | 'event' | 'routine'
  title: string
  icon: string
  startTime: Date | null
  endTime?: Date | null
  completed: boolean
  allDay?: boolean
  category?: 'chore' | 'homework' | 'activity' | 'meal' | 'bedtime' | 'fun'
  points?: number
}

interface KidsTodayTimelineProps {
  items?: KidsTimelineItem[]
  childName?: string
  avatar?: string
  date?: Date
  onToggleComplete?: (id: string) => void
  onSelectItem?: (id: string) => void
  onBack?: () => void
}

// Sample data for demo
const SAMPLE_ITEMS: KidsTimelineItem[] = [
  { id: '1', type: 'routine', title: 'Wake up & stretch', icon: '🌅', startTime: new Date(new Date().setHours(7, 0, 0, 0)), completed: true, category: 'bedtime', points: 5 },
  { id: '2', type: 'task', title: 'Brush teeth', icon: '🪥', startTime: new Date(new Date().setHours(7, 15, 0, 0)), completed: true, category: 'chore', points: 5 },
  { id: '3', type: 'task', title: 'Make my bed', icon: '🛏️', startTime: new Date(new Date().setHours(7, 30, 0, 0)), completed: true, category: 'chore', points: 10 },
  { id: '4', type: 'event', title: 'Breakfast time!', icon: '🥣', startTime: new Date(new Date().setHours(8, 0, 0, 0)), endTime: new Date(new Date().setHours(8, 30, 0, 0)), completed: true, category: 'meal' },
  { id: '5', type: 'event', title: 'School', icon: '🏫', startTime: new Date(new Date().setHours(9, 0, 0, 0)), endTime: new Date(new Date().setHours(15, 0, 0, 0)), completed: false, category: 'activity' },
  { id: '6', type: 'task', title: 'Homework time', icon: '📚', startTime: new Date(new Date().setHours(15, 30, 0, 0)), completed: false, category: 'homework', points: 20 },
  { id: '7', type: 'task', title: 'Feed the dog', icon: '🐕', startTime: new Date(new Date().setHours(16, 0, 0, 0)), completed: false, category: 'chore', points: 10 },
  { id: '8', type: 'event', title: 'Soccer practice', icon: '⚽', startTime: new Date(new Date().setHours(17, 0, 0, 0)), endTime: new Date(new Date().setHours(18, 0, 0, 0)), completed: false, category: 'activity' },
  { id: '9', type: 'event', title: 'Dinner with family', icon: '🍝', startTime: new Date(new Date().setHours(18, 30, 0, 0)), endTime: new Date(new Date().setHours(19, 0, 0, 0)), completed: false, category: 'meal' },
  { id: '10', type: 'task', title: 'Take a bath', icon: '🛁', startTime: new Date(new Date().setHours(19, 30, 0, 0)), completed: false, category: 'chore', points: 5 },
  { id: '11', type: 'routine', title: 'Brush teeth (night)', icon: '🦷', startTime: new Date(new Date().setHours(20, 0, 0, 0)), completed: false, category: 'bedtime', points: 5 },
  { id: '12', type: 'task', title: 'Read a story', icon: '📖', startTime: new Date(new Date().setHours(20, 15, 0, 0)), completed: false, category: 'fun', points: 15 },
  { id: '13', type: 'routine', title: 'Bedtime! 💤', icon: '🌙', startTime: new Date(new Date().setHours(20, 30, 0, 0)), completed: false, category: 'bedtime', points: 10 },
]

// Time section definitions
type TimeSection = 'morning' | 'afternoon' | 'evening'

const TIME_SECTIONS: { id: TimeSection; label: string; icon: string; emoji: string; startHour: number; endHour: number; color: string }[] = [
  { id: 'morning', label: 'Morning', icon: '🌅', emoji: '☀️', startHour: 5, endHour: 12, color: '#FFD93D' },
  { id: 'afternoon', label: 'Afternoon', icon: '🌤️', emoji: '🌞', startHour: 12, endHour: 17, color: '#FF9F43' },
  { id: 'evening', label: 'Evening', icon: '🌙', emoji: '🌟', startHour: 17, endHour: 24, color: '#6C5CE7' },
]

// Category styles
const CATEGORY_STYLES: Record<string, { bg: string; border: string; glow: string }> = {
  chore: { bg: 'linear-gradient(135deg, #E8FFF4 0%, #D4FFED 100%)', border: '#1DD1A1', glow: 'rgba(29, 209, 161, 0.3)' },
  homework: { bg: 'linear-gradient(135deg, #E8F4FF 0%, #D4ECFF 100%)', border: '#54A0FF', glow: 'rgba(84, 160, 255, 0.3)' },
  activity: { bg: 'linear-gradient(135deg, #FFF4E8 0%, #FFE8D4 100%)', border: '#FF9F43', glow: 'rgba(255, 159, 67, 0.3)' },
  meal: { bg: 'linear-gradient(135deg, #FFE8EE 0%, #FFD4E0 100%)', border: '#FF6B9D', glow: 'rgba(255, 107, 157, 0.3)' },
  bedtime: { bg: 'linear-gradient(135deg, #F3E8FF 0%, #E8D4FF 100%)', border: '#A55EEA', glow: 'rgba(165, 94, 234, 0.3)' },
  fun: { bg: 'linear-gradient(135deg, #FFECD2 0%, #FCB69F 100%)', border: '#FF6B6B', glow: 'rgba(255, 107, 107, 0.3)' },
}

// Format time for kids (simple format)
function formatTimeForKids(date: Date): string {
  const hours = date.getHours()
  const minutes = date.getMinutes()
  const ampm = hours >= 12 ? 'PM' : 'AM'
  const displayHours = hours % 12 || 12
  if (minutes === 0) {
    return `${displayHours} ${ampm}`
  }
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${ampm}`
}

// Get greeting based on time of day
function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

// Get the current time section
function getCurrentSection(): TimeSection {
  const hour = new Date().getHours()
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  return 'evening'
}

export function KidsTodayTimeline({
  items = SAMPLE_ITEMS,
  childName = 'Superstar',
  avatar = '🦊',
  date = new Date(),
  onToggleComplete,
  onSelectItem,
  onBack,
}: KidsTodayTimelineProps) {
  const [localItems, setLocalItems] = useState(items)
  const [showConfetti, setShowConfetti] = useState(false)
  const [celebrationEmoji, setCelebrationEmoji] = useState('')
  const [currentTime, setCurrentTime] = useState(new Date())

  // Update current time every minute
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 60000)
    return () => clearInterval(interval)
  }, [])

  // Group items by time section
  const groupedItems = useMemo(() => {
    const groups: Record<TimeSection, KidsTimelineItem[]> = {
      morning: [],
      afternoon: [],
      evening: [],
    }

    localItems.forEach(item => {
      if (!item.startTime) return
      const hour = item.startTime.getHours()

      if (hour >= 5 && hour < 12) {
        groups.morning.push(item)
      } else if (hour >= 12 && hour < 17) {
        groups.afternoon.push(item)
      } else {
        groups.evening.push(item)
      }
    })

    // Sort each group by start time
    Object.keys(groups).forEach(key => {
      groups[key as TimeSection].sort((a, b) => {
        if (!a.startTime || !b.startTime) return 0
        return a.startTime.getTime() - b.startTime.getTime()
      })
    })

    return groups
  }, [localItems])

  // Calculate progress
  const completedCount = localItems.filter(i => i.completed).length
  const totalCount = localItems.length
  const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0
  const totalPoints = localItems.filter(i => i.completed).reduce((sum, i) => sum + (i.points || 0), 0)

  // Trigger celebration
  const triggerCelebration = useCallback((emoji: string) => {
    setCelebrationEmoji(emoji)
    setShowConfetti(true)
    setTimeout(() => {
      setShowConfetti(false)
      setCelebrationEmoji('')
    }, 1500)
  }, [])

  // Handle toggle complete
  const handleToggle = useCallback((id: string) => {
    setLocalItems(prev => {
      const updated = prev.map(item => {
        if (item.id === id) {
          const newCompleted = !item.completed
          if (newCompleted) {
            triggerCelebration(item.icon)
          }
          return { ...item, completed: newCompleted }
        }
        return item
      })
      return updated
    })
    onToggleComplete?.(id)
  }, [onToggleComplete, triggerCelebration])

  // Check for all done celebration
  useEffect(() => {
    if (completedCount === totalCount && totalCount > 0) {
      setTimeout(() => triggerCelebration('🎉'), 500)
    }
  }, [completedCount, totalCount, triggerCelebration])

  // Format date for header
  const dateString = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  const isToday = date.toDateString() === new Date().toDateString()

  return (
    <div className="kids-timeline">
      {/* Animated background */}
      <div className="kids-timeline-bg">
        <div className="floating-cloud cloud-1">☁️</div>
        <div className="floating-cloud cloud-2">☁️</div>
        <div className="floating-cloud cloud-3">⭐</div>
        <div className="time-indicator-bg" />
      </div>

      {/* Confetti */}
      {showConfetti && (
        <div className="confetti-overlay">
          {[...Array(15)].map((_, i) => (
            <div
              key={i}
              className="confetti-star"
              style={{
                left: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 0.3}s`,
              }}
            >
              ⭐
            </div>
          ))}
          {celebrationEmoji && (
            <div className="celebration-emoji-big">{celebrationEmoji}</div>
          )}
        </div>
      )}

      {/* Header */}
      <header className="timeline-header">
        {onBack && (
          <button onClick={onBack} className="timeline-back-btn">
            ← Back
          </button>
        )}

        <div className="timeline-greeting">
          <div className="timeline-avatar">{avatar}</div>
          <div>
            <h1 className="timeline-title">{getGreeting()}, {childName}!</h1>
            <p className="timeline-date">
              {isToday ? "Here's your day" : dateString} 📅
            </p>
          </div>
        </div>

        {/* Progress summary */}
        <div className="timeline-progress-row">
          <div className="timeline-stat">
            <span className="stat-emoji">✅</span>
            <span className="stat-number">{completedCount}/{totalCount}</span>
            <span className="stat-text">Done</span>
          </div>
          <div className="timeline-stat">
            <span className="stat-emoji">⭐</span>
            <span className="stat-number">{totalPoints}</span>
            <span className="stat-text">Stars</span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="timeline-progress-bar">
          <div
            className="timeline-progress-fill"
            style={{ width: `${progressPercent}%` }}
          >
            {progressPercent > 5 && <span className="progress-emoji">🚀</span>}
          </div>
        </div>
        {progressPercent === 100 && (
          <div className="all-done-message">
            🏆 Amazing job! You finished everything! 🌟
          </div>
        )}
      </header>

      {/* Timeline content */}
      <main className="timeline-content">
        {TIME_SECTIONS.map(section => {
          const sectionItems = groupedItems[section.id]
          if (sectionItems.length === 0) return null

          const isCurrentSection = getCurrentSection() === section.id && isToday

          return (
            <div
              key={section.id}
              className={`time-section ${isCurrentSection ? 'current-section' : ''}`}
            >
              {/* Section header */}
              <div className="section-header">
                <div
                  className="section-icon-bubble"
                  style={{ backgroundColor: section.color }}
                >
                  <span>{section.emoji}</span>
                </div>
                <h2 className="section-title">{section.label}</h2>
                <div className="section-line" style={{ backgroundColor: section.color }} />
                {isCurrentSection && (
                  <span className="now-badge">NOW</span>
                )}
              </div>

              {/* Items */}
              <div className="section-items">
                {sectionItems.map((item, index) => {
                  const categoryStyle = CATEGORY_STYLES[item.category || 'chore']
                  const isNow = isToday && item.startTime && !item.completed &&
                    currentTime >= item.startTime &&
                    (!item.endTime || currentTime <= item.endTime)

                  return (
                    <div
                      key={item.id}
                      className={`timeline-card ${item.completed ? 'completed' : ''} ${isNow ? 'happening-now' : ''}`}
                      style={{
                        animationDelay: `${index * 0.05}s`,
                        background: categoryStyle.bg,
                        borderColor: categoryStyle.border,
                        '--glow-color': categoryStyle.glow,
                      } as React.CSSProperties}
                      onClick={() => onSelectItem?.(item.id)}
                    >
                      {/* Time badge */}
                      <div className="card-time">
                        {item.startTime && formatTimeForKids(item.startTime)}
                        {item.endTime && ` - ${formatTimeForKids(item.endTime)}`}
                      </div>

                      {/* Main content */}
                      <div className="card-main">
                        {/* Checkbox/completion */}
                        <button
                          className={`card-checkbox ${item.completed ? 'checked' : ''} ${item.type === 'routine' ? 'routine-style' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleToggle(item.id)
                          }}
                        >
                          {item.completed ? '✓' : ''}
                        </button>

                        {/* Icon */}
                        <div className={`card-icon ${item.completed ? 'completed-icon' : ''}`}>
                          {item.icon}
                        </div>

                        {/* Title */}
                        <div className="card-title-area">
                          <h3 className={`card-title ${item.completed ? 'completed-title' : ''}`}>
                            {item.title}
                          </h3>
                          {item.type === 'event' && (
                            <span className="event-badge">Event</span>
                          )}
                          {item.type === 'routine' && (
                            <span className="routine-badge">Routine</span>
                          )}
                        </div>

                        {/* Points */}
                        {item.points && (
                          <div className={`card-points ${item.completed ? 'earned' : ''}`}>
                            <span>⭐</span>
                            <span>{item.points}</span>
                          </div>
                        )}
                      </div>

                      {/* Now indicator */}
                      {isNow && (
                        <div className="now-indicator">
                          <span className="now-pulse" />
                          <span className="now-text">Happening now!</span>
                        </div>
                      )}

                      {/* Completion celebration */}
                      {item.completed && (
                        <div className="completion-stars">
                          <span className="star star-1">✨</span>
                          <span className="star star-2">⭐</span>
                          <span className="star star-3">✨</span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}

        {/* Empty state */}
        {totalCount === 0 && (
          <div className="empty-state">
            <div className="empty-emoji">🎈</div>
            <h3>No activities today!</h3>
            <p>Enjoy your free day!</p>
          </div>
        )}
      </main>

      {/* Bottom decoration */}
      <div className="timeline-footer">
        <div className="footer-grass">
          <span>🌱</span>
          <span>🌸</span>
          <span>🌱</span>
          <span>🌼</span>
          <span>🌱</span>
        </div>
      </div>
    </div>
  )
}

export default KidsTodayTimeline
