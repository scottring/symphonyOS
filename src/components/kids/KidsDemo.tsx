import { useState } from 'react'
import { KidsChoreTracker } from './KidsChoreTracker'
import { KidsTodayTimeline } from './KidsTodayTimeline'

const AVATARS = [
  { id: 'bear', emoji: '🐻', name: 'Teddy' },
  { id: 'bunny', emoji: '🐰', name: 'Hoppy' },
  { id: 'fox', emoji: '🦊', name: 'Rusty' },
  { id: 'owl', emoji: '🦉', name: 'Hootie' },
  { id: 'panda', emoji: '🐼', name: 'Bamboo' },
  { id: 'unicorn', emoji: '🦄', name: 'Sparkle' },
]

type ViewMode = 'welcome' | 'chores' | 'timeline'

export function KidsDemo() {
  const [viewMode, setViewMode] = useState<ViewMode>('welcome')
  const [childName, setChildName] = useState('')
  const [selectedAvatar, setSelectedAvatar] = useState('bear')

  const avatarEmoji = AVATARS.find(a => a.id === selectedAvatar)?.emoji || '🦊'

  if (viewMode === 'chores') {
    return (
      <KidsChoreTracker
        childName={childName || 'Star Helper'}
        selectedAvatar={selectedAvatar}
        onBack={() => setViewMode('welcome')}
      />
    )
  }

  if (viewMode === 'timeline') {
    return (
      <KidsTodayTimeline
        childName={childName || 'Superstar'}
        avatar={avatarEmoji}
        onBack={() => setViewMode('welcome')}
      />
    )
  }

  return (
    <div className="kids-welcome">
      <style>{`
        .kids-welcome {
          min-height: 100vh;
          background: linear-gradient(180deg, #FFE8EE 0%, #E8F4FF 50%, #E8FFF4 100%);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 40px 24px;
          font-family: 'Nunito', sans-serif;
        }

        .welcome-title {
          font-family: 'Baloo 2', cursive;
          font-size: 3rem;
          color: #333;
          text-align: center;
          margin: 0 0 16px;
          animation: bounce-in 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .welcome-subtitle {
          font-size: 1.2rem;
          color: #666;
          text-align: center;
          margin: 0 0 40px;
        }

        .name-input {
          width: 100%;
          max-width: 320px;
          padding: 16px 24px;
          font-size: 1.3rem;
          font-family: 'Baloo 2', cursive;
          border: 3px solid #E0E0E0;
          border-radius: 20px;
          text-align: center;
          margin-bottom: 32px;
          outline: none;
          transition: border-color 0.2s ease;
        }

        .name-input:focus {
          border-color: #54A0FF;
        }

        .name-input::placeholder {
          color: #bbb;
        }

        .avatar-section-welcome {
          margin-bottom: 40px;
        }

        .avatar-label {
          font-family: 'Baloo 2', cursive;
          font-size: 1.3rem;
          color: #555;
          text-align: center;
          margin-bottom: 16px;
        }

        .avatar-grid {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 16px;
        }

        .avatar-option {
          width: 80px;
          height: 80px;
          background: white;
          border: 4px solid transparent;
          border-radius: 50%;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 2.5rem;
          transition: all 0.2s ease;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
        }

        .avatar-option:hover {
          transform: scale(1.1);
        }

        .avatar-option.selected {
          border-color: #54A0FF;
          transform: scale(1.1);
          box-shadow: 0 6px 24px rgba(84, 160, 255, 0.3);
        }

        .view-choice-section {
          margin-bottom: 20px;
        }

        .view-choice-label {
          font-family: 'Baloo 2', cursive;
          font-size: 1.3rem;
          color: #555;
          text-align: center;
          margin-bottom: 20px;
        }

        .view-buttons {
          display: flex;
          gap: 16px;
          flex-wrap: wrap;
          justify-content: center;
        }

        .view-btn {
          background: white;
          border: 3px solid #E0E0E0;
          border-radius: 24px;
          padding: 24px 32px;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          min-width: 160px;
          transition: all 0.3s ease;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
        }

        .view-btn:hover {
          transform: translateY(-4px);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
        }

        .view-btn.chores-btn:hover {
          border-color: #1DD1A1;
          background: linear-gradient(135deg, #E8FFF4 0%, #D4FFED 100%);
        }

        .view-btn.timeline-btn:hover {
          border-color: #54A0FF;
          background: linear-gradient(135deg, #E8F4FF 0%, #D4ECFF 100%);
        }

        .view-btn-icon {
          font-size: 3rem;
        }

        .view-btn-title {
          font-family: 'Baloo 2', cursive;
          font-size: 1.2rem;
          font-weight: 700;
          color: #333;
        }

        .view-btn-desc {
          font-size: 0.85rem;
          color: #888;
          text-align: center;
        }

        @keyframes bounce-in {
          0% {
            opacity: 0;
            transform: scale(0.5) translateY(40px);
          }
          100% {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }

        @media (min-width: 768px) {
          .welcome-title {
            font-size: 4rem;
          }

          .avatar-option {
            width: 100px;
            height: 100px;
            font-size: 3rem;
          }

          .view-btn {
            min-width: 200px;
            padding: 32px 40px;
          }

          .view-btn-icon {
            font-size: 4rem;
          }

          .view-btn-title {
            font-size: 1.4rem;
          }
        }
      `}</style>

      <h1 className="welcome-title">Kids Zone! 🌟</h1>
      <p className="welcome-subtitle">Let's set up your helper profile!</p>

      <input
        type="text"
        className="name-input"
        placeholder="What's your name?"
        value={childName}
        onChange={(e) => setChildName(e.target.value)}
        maxLength={20}
      />

      <div className="avatar-section-welcome">
        <p className="avatar-label">Pick your buddy!</p>
        <div className="avatar-grid">
          {AVATARS.map(avatar => (
            <button
              key={avatar.id}
              className={`avatar-option ${selectedAvatar === avatar.id ? 'selected' : ''}`}
              onClick={() => setSelectedAvatar(avatar.id)}
              title={avatar.name}
            >
              {avatar.emoji}
            </button>
          ))}
        </div>
      </div>

      <div className="view-choice-section">
        <p className="view-choice-label">What do you want to do?</p>
        <div className="view-buttons">
          <button
            className="view-btn chores-btn"
            onClick={() => setViewMode('chores')}
          >
            <span className="view-btn-icon">✅</span>
            <span className="view-btn-title">My Chores</span>
            <span className="view-btn-desc">Earn stars by completing tasks!</span>
          </button>
          <button
            className="view-btn timeline-btn"
            onClick={() => setViewMode('timeline')}
          >
            <span className="view-btn-icon">📅</span>
            <span className="view-btn-title">My Day</span>
            <span className="view-btn-desc">See what's happening today!</span>
          </button>
        </div>
      </div>
    </div>
  )
}

export default KidsDemo
