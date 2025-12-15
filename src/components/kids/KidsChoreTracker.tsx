import { useState, useEffect, useCallback, useMemo } from 'react'
import './kids-tracker.css'

// Fun character avatars for kids
const AVATARS = [
  { id: 'bear', emoji: '🐻', name: 'Teddy', color: '#8B4513' },
  { id: 'bunny', emoji: '🐰', name: 'Hoppy', color: '#FFB6C1' },
  { id: 'fox', emoji: '🦊', name: 'Rusty', color: '#FF6B35' },
  { id: 'owl', emoji: '🦉', name: 'Hootie', color: '#6B4423' },
  { id: 'panda', emoji: '🐼', name: 'Bamboo', color: '#2D2D2D' },
  { id: 'unicorn', emoji: '🦄', name: 'Sparkle', color: '#E066FF' },
]

// Chore categories with fun icons
const CHORE_CATEGORIES = [
  { id: 'bedroom', icon: '🛏️', label: 'Bedroom', color: '#7B68EE' },
  { id: 'bathroom', icon: '🚿', label: 'Bathroom', color: '#00CED1' },
  { id: 'kitchen', icon: '🍽️', label: 'Kitchen', color: '#FF6347' },
  { id: 'outdoor', icon: '🌳', label: 'Outside', color: '#32CD32' },
  { id: 'pets', icon: '🐕', label: 'Pets', color: '#DEB887' },
  { id: 'homework', icon: '📚', label: 'Learning', color: '#4169E1' },
]

// Sample chores with point values
const DEFAULT_CHORES: Chore[] = [
  { id: '1', title: 'Make my bed', category: 'bedroom', points: 5, icon: '🛏️', completed: false },
  { id: '2', title: 'Put toys away', category: 'bedroom', points: 10, icon: '🧸', completed: false },
  { id: '3', title: 'Brush teeth', category: 'bathroom', points: 5, icon: '🪥', completed: false },
  { id: '4', title: 'Help set the table', category: 'kitchen', points: 10, icon: '🍴', completed: false },
  { id: '5', title: 'Feed the fish', category: 'pets', points: 5, icon: '🐠', completed: false },
  { id: '6', title: 'Water plants', category: 'outdoor', points: 10, icon: '🌱', completed: false },
  { id: '7', title: 'Read for 15 minutes', category: 'homework', points: 15, icon: '📖', completed: false },
  { id: '8', title: 'Put dirty clothes in hamper', category: 'bedroom', points: 5, icon: '👕', completed: false },
]

// Rewards with point thresholds
const REWARDS = [
  { id: '1', title: 'Extra Screen Time', points: 25, icon: '📱', unlocked: false },
  { id: '2', title: 'Choose Dinner', points: 50, icon: '🍕', unlocked: false },
  { id: '3', title: 'Movie Night Pick', points: 75, icon: '🎬', unlocked: false },
  { id: '4', title: 'Trip to the Park', points: 100, icon: '🎢', unlocked: false },
  { id: '5', title: 'Special Treat', points: 150, icon: '🍦', unlocked: false },
]

interface Chore {
  id: string
  title: string
  category: string
  points: number
  icon: string
  completed: boolean
}

interface KidsChoreTrackerProps {
  childName?: string
  selectedAvatar?: string
  onBack?: () => void
}

export function KidsChoreTracker({
  childName = 'Star Helper',
  selectedAvatar = 'bear',
  onBack
}: KidsChoreTrackerProps) {
  const [chores, setChores] = useState<Chore[]>(DEFAULT_CHORES)
  const [totalPoints, setTotalPoints] = useState(0)
  const [streak] = useState(3) // Days in a row - would be updated from backend
  const [showConfetti, setShowConfetti] = useState(false)
  const [celebrationEmoji, setCelebrationEmoji] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [showRewards, setShowRewards] = useState(false)

  const avatar = AVATARS.find(a => a.id === selectedAvatar) || AVATARS[0]

  // Pre-generate random values for confetti animation (stable across renders)
  const confettiStyles = useMemo(() =>
    [...Array(20)].map((_, i) => ({
      left: `${(i * 5 + (i * 17) % 100)}%`,
      animationDelay: `${(i * 0.025)}s`,
      backgroundColor: ['#FF6B6B', '#4ECDC4', '#FFE66D', '#95E1D3', '#F38181'][i % 5]
    })), []
  )

  // Calculate completed chores
  const completedCount = chores.filter(c => c.completed).length
  const totalChores = chores.length
  const progressPercent = (completedCount / totalChores) * 100

  // Filter chores by category
  const filteredChores = selectedCategory
    ? chores.filter(c => c.category === selectedCategory)
    : chores

  // Trigger celebration animation
  const triggerCelebration = useCallback((emoji: string) => {
    setCelebrationEmoji(emoji)
    setShowConfetti(true)
    setTimeout(() => {
      setShowConfetti(false)
      setCelebrationEmoji('')
    }, 1500)
  }, [])

  // Toggle chore completion
  const toggleChore = useCallback((choreId: string) => {
    setChores(prev => {
      const updated = prev.map(c => {
        if (c.id === choreId) {
          const newCompleted = !c.completed
          if (newCompleted) {
            // Add points when completing
            setTotalPoints(p => p + c.points)
            // Show celebration
            triggerCelebration(c.icon)
          } else {
            // Remove points when uncompleting
            setTotalPoints(p => Math.max(0, p - c.points))
          }
          return { ...c, completed: newCompleted }
        }
        return c
      })
      return updated
    })
  }, [triggerCelebration])

  // Check if all chores are done
  useEffect(() => {
    if (completedCount === totalChores && totalChores > 0) {
      // All done celebration!
      setTimeout(() => {
        triggerCelebration('🎉')
      }, 500)
    }
  }, [completedCount, totalChores, triggerCelebration])

  return (
    <div className="kids-tracker">
      {/* Fun animated background */}
      <div className="kids-bg">
        <div className="floating-shape shape-1">⭐</div>
        <div className="floating-shape shape-2">🌈</div>
        <div className="floating-shape shape-3">☁️</div>
        <div className="floating-shape shape-4">🌟</div>
        <div className="floating-shape shape-5">✨</div>
        <div className="floating-shape shape-6">🎈</div>
      </div>

      {/* Confetti celebration overlay */}
      {showConfetti && (
        <div className="confetti-container">
          {confettiStyles.map((style, i) => (
            <div
              key={i}
              className="confetti-piece"
              style={style}
            />
          ))}
          {celebrationEmoji && (
            <div className="celebration-emoji">{celebrationEmoji}</div>
          )}
        </div>
      )}

      {/* Header section */}
      <header className="kids-header">
        {onBack && (
          <button onClick={onBack} className="back-btn">
            <span>←</span>
          </button>
        )}

        <div className="avatar-section">
          <div className="avatar-bubble" style={{ borderColor: avatar.color }}>
            <span className="avatar-emoji">{avatar.emoji}</span>
          </div>
          <div className="greeting">
            <h1 className="child-name">Hi, {childName}!</h1>
            <p className="subtitle">Let's get stuff done! 💪</p>
          </div>
        </div>

        <div className="stats-row">
          {/* Points counter */}
          <div className="stat-card points-card">
            <div className="stat-icon">⭐</div>
            <div className="stat-value">{totalPoints}</div>
            <div className="stat-label">Stars</div>
          </div>

          {/* Streak counter */}
          <div className="stat-card streak-card">
            <div className="stat-icon">🔥</div>
            <div className="stat-value">{streak}</div>
            <div className="stat-label">Day Streak</div>
          </div>

          {/* Progress */}
          <div className="stat-card progress-card">
            <div className="stat-icon">✅</div>
            <div className="stat-value">{completedCount}/{totalChores}</div>
            <div className="stat-label">Done</div>
          </div>
        </div>

        {/* Big progress bar */}
        <div className="progress-section">
          <div className="progress-bar-kids">
            <div
              className="progress-fill"
              style={{ width: `${progressPercent}%` }}
            >
              {progressPercent > 10 && (
                <div className="progress-rocket">🚀</div>
              )}
            </div>
          </div>
          {progressPercent === 100 && (
            <div className="all-done-badge">
              🏆 All Done! You're a Superstar! 🌟
            </div>
          )}
        </div>
      </header>

      {/* Category filters */}
      <nav className="category-nav">
        <button
          className={`category-btn ${selectedCategory === null ? 'active' : ''}`}
          onClick={() => setSelectedCategory(null)}
        >
          <span className="category-icon">🏠</span>
          <span className="category-label">All</span>
        </button>
        {CHORE_CATEGORIES.map(cat => (
          <button
            key={cat.id}
            className={`category-btn ${selectedCategory === cat.id ? 'active' : ''}`}
            onClick={() => setSelectedCategory(cat.id)}
            style={{ '--cat-color': cat.color } as React.CSSProperties}
          >
            <span className="category-icon">{cat.icon}</span>
            <span className="category-label">{cat.label}</span>
          </button>
        ))}
      </nav>

      {/* Chores list */}
      <main className="chores-container">
        <div className="chores-grid">
          {filteredChores.map((chore, index) => (
            <div
              key={chore.id}
              className={`chore-card ${chore.completed ? 'completed' : ''}`}
              onClick={() => toggleChore(chore.id)}
              style={{ animationDelay: `${index * 0.05}s` }}
            >
              <div className="chore-icon-wrapper">
                <span className="chore-icon">{chore.icon}</span>
                {chore.completed && (
                  <div className="check-badge">✓</div>
                )}
              </div>
              <h3 className="chore-title">{chore.title}</h3>
              <div className="chore-points">
                <span className="star-icon">⭐</span>
                <span className="points-value">{chore.points}</span>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Rewards button */}
      <button
        className="rewards-toggle"
        onClick={() => setShowRewards(true)}
      >
        <span className="rewards-icon">🎁</span>
        <span>Rewards</span>
      </button>

      {/* Rewards modal */}
      {showRewards && (
        <div className="rewards-modal-overlay" onClick={() => setShowRewards(false)}>
          <div className="rewards-modal" onClick={e => e.stopPropagation()}>
            <button className="close-modal" onClick={() => setShowRewards(false)}>✕</button>
            <h2 className="rewards-title">
              <span>🎁</span> My Rewards <span>🎁</span>
            </h2>
            <p className="rewards-subtitle">You have {totalPoints} ⭐ to spend!</p>

            <div className="rewards-list">
              {REWARDS.map(reward => {
                const canUnlock = totalPoints >= reward.points
                return (
                  <div
                    key={reward.id}
                    className={`reward-card ${canUnlock ? 'unlockable' : 'locked'}`}
                  >
                    <div className="reward-icon">{reward.icon}</div>
                    <div className="reward-info">
                      <h4 className="reward-name">{reward.title}</h4>
                      <div className="reward-cost">
                        <span>⭐</span> {reward.points} stars
                      </div>
                    </div>
                    {canUnlock ? (
                      <button className="claim-btn">Claim!</button>
                    ) : (
                      <div className="locked-badge">🔒</div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Bottom nav for tablet */}
      <nav className="bottom-nav">
        <button className="nav-item active">
          <span className="nav-icon">📋</span>
          <span className="nav-label">Tasks</span>
        </button>
        <button className="nav-item">
          <span className="nav-icon">📅</span>
          <span className="nav-label">Week</span>
        </button>
        <button className="nav-item">
          <span className="nav-icon">🏆</span>
          <span className="nav-label">Awards</span>
        </button>
        <button className="nav-item">
          <span className="nav-icon">👤</span>
          <span className="nav-label">Me</span>
        </button>
      </nav>
    </div>
  )
}

export default KidsChoreTracker
