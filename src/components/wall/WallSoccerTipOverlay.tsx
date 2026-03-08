import { getDailySoccerTip, getCategoryLabel, getCategoryColor } from './soccerTips'
import type { SoccerTip } from './soccerTips'

interface WallSoccerTipOverlayProps {
  onClose: () => void
}

// Animated SVG of a boy kicking/passing a soccer ball
function SoccerPlayerGraphic({ category, color }: { category: SoccerTip['category']; color: string }) {
  const highlightColor = color
  const baseColor = 'rgba(255,255,255,0.25)'

  // Highlight body part based on category
  const isDribble = category === 'dribbling'
  const isPassing = category === 'passing'
  const isShooting = category === 'shooting'
  const isDefense = category === 'defense'
  const isTouch = category === 'first-touch'
  const isTeamwork = category === 'teamwork'
  const isMindset = category === 'mindset'
  const isGoalkeeping = category === 'goalkeeping'

  const legFocus = isDribble || isPassing || isShooting || isTouch
  const armFocus = isGoalkeeping
  const bodyFocus = isDefense || isTeamwork || isMindset

  const legColor = legFocus ? highlightColor : baseColor
  const armColor = armFocus ? highlightColor : baseColor
  const torsoColor = bodyFocus ? highlightColor : baseColor
  const headColor = isMindset ? highlightColor : baseColor

  return (
    <svg viewBox="0 0 400 500" className="w-full h-full" style={{ maxHeight: '70vh' }}>
      <defs>
        <filter id="soccerGlow">
          <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
        <style>{`
          @keyframes kickBounce {
            0%, 100% { transform: translateY(0px); }
            50% { transform: translateY(-6px); }
          }
          @keyframes kickLeg {
            0%, 60% { transform: rotate(0deg); }
            75% { transform: rotate(-35deg); }
            90% { transform: rotate(40deg); }
            100% { transform: rotate(0deg); }
          }
          @keyframes plantLeg {
            0%, 100% { transform: rotate(0deg); }
            50% { transform: rotate(-5deg); }
          }
          @keyframes ballRoll {
            0%, 70% { transform: translate(0, 0); opacity: 1; }
            85% { transform: translate(80px, -30px); opacity: 0.8; }
            100% { transform: translate(0, 0); opacity: 1; }
          }
          @keyframes armBalance {
            0%, 100% { transform: rotate(0deg); }
            50% { transform: rotate(-15deg); }
          }
          @keyframes soccerHighlight {
            0%, 100% { opacity: 0.8; }
            50% { opacity: 1; }
          }
          .soccer-body { animation: kickBounce 2s ease-in-out infinite; }
          .kick-leg { animation: kickLeg 2s ease-in-out infinite; transform-origin: 195px 300px; }
          .plant-leg { animation: plantLeg 2s ease-in-out infinite; transform-origin: 205px 300px; }
          .soccer-ball { animation: ballRoll 2s ease-in-out infinite; }
          .balance-arm { animation: armBalance 2s ease-in-out infinite; transform-origin: 200px 185px; }
          .soccer-highlight { animation: soccerHighlight 1.5s ease-in-out infinite; filter: url(#soccerGlow); }
        `}</style>
      </defs>

      <g className="soccer-body">
        {/* Head */}
        <circle
          cx="200" cy="110" r="38"
          fill={headColor}
          stroke={isMindset ? highlightColor : 'rgba(255,255,255,0.1)'}
          strokeWidth={isMindset ? 3 : 1}
          className={isMindset ? 'soccer-highlight' : ''}
        />
        {/* Eyes — looking at ball */}
        <circle cx="212" cy="105" r="4" fill={isMindset ? '#1a1a2e' : 'rgba(255,255,255,0.4)'} />
        <circle cx="192" cy="108" r="3.5" fill={isMindset ? '#1a1a2e' : 'rgba(255,255,255,0.35)'} />
        {/* Determined expression */}
        <path d="M190 120 Q200 126 212 120" fill="none" stroke={isMindset ? '#1a1a2e' : 'rgba(255,255,255,0.3)'} strokeWidth="2.5" strokeLinecap="round" />

        {/* Torso — jersey */}
        <rect
          x="175" y="148" width="50" height="75" rx="12"
          fill={torsoColor}
          stroke={bodyFocus ? highlightColor : 'rgba(255,255,255,0.1)'}
          strokeWidth={bodyFocus ? 3 : 1}
          className={bodyFocus ? 'soccer-highlight' : ''}
        />
        {/* Jersey number */}
        <text x="200" y="195" fill={bodyFocus ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.12)'} fontSize="22" fontWeight="900" textAnchor="middle">10</text>
      </g>

      {/* Balance arm */}
      <g className="balance-arm">
        <line
          x1="200" y1="185" x2="250" y2="230"
          stroke={armColor}
          strokeWidth="16"
          strokeLinecap="round"
          className={armFocus ? 'soccer-highlight' : ''}
        />
        <circle cx="250" cy="230" r="8" fill={armColor} className={armFocus ? 'soccer-highlight' : ''} />
      </g>

      {/* Other arm */}
      <g className="soccer-body">
        <line
          x1="200" y1="185" x2="155" y2="240"
          stroke={armColor}
          strokeWidth="16"
          strokeLinecap="round"
          opacity="0.7"
        />
        <circle cx="155" cy="240" r="8" fill={armColor} opacity="0.7" />
      </g>

      {/* Plant leg (left, slightly bent) */}
      <g className="plant-leg">
        <line
          x1="205" y1="300" x2="220" y2="380"
          stroke={legFocus ? highlightColor : baseColor}
          strokeWidth="20"
          strokeLinecap="round"
          opacity="0.7"
        />
        <line
          x1="220" y1="380" x2="225" y2="445"
          stroke={legFocus ? highlightColor : baseColor}
          strokeWidth="16"
          strokeLinecap="round"
          opacity="0.7"
        />
        {/* Cleat */}
        <ellipse cx="215" cy="450" rx="22" ry="10" fill={legFocus ? highlightColor : baseColor} opacity="0.7" />
      </g>

      {/* Kicking leg (right, animated) */}
      <g className="kick-leg">
        <line
          x1="195" y1="300" x2="165" y2="375"
          stroke={legColor}
          strokeWidth="20"
          strokeLinecap="round"
          className={legFocus ? 'soccer-highlight' : ''}
        />
        <line
          x1="165" y1="375" x2="140" y2="440"
          stroke={legColor}
          strokeWidth="16"
          strokeLinecap="round"
          className={legFocus ? 'soccer-highlight' : ''}
        />
        {/* Cleat */}
        <ellipse
          cx="130" cy="445" rx="22" ry="10"
          fill={legColor}
          className={legFocus ? 'soccer-highlight' : ''}
        />
      </g>

      {/* Soccer Ball */}
      <g className="soccer-ball">
        <circle cx="120" cy="435" r="18" fill="white" opacity="0.9" />
        {/* Ball pentagon pattern */}
        <path d="M120 421 L127 427 L124 436 L116 436 L113 427 Z" fill="rgba(0,0,0,0.15)" />
        <path d="M120 449 L127 443 L124 436 L116 436 L113 443 Z" fill="rgba(0,0,0,0.1)" />
      </g>

      {/* Category-specific callout */}
      {legFocus && (
        <g>
          <line x1="130" y1="400" x2="75" y2="380" stroke={highlightColor} strokeWidth="1.5" strokeDasharray="4 4" opacity="0.5" />
          <text x="70" y="375" fill={highlightColor} fontSize="13" fontWeight="800" textAnchor="end" opacity="0.7">
            {isDribble ? 'CONTROL' : isPassing ? 'PLANT FOOT' : isShooting ? 'STRIKE' : 'TOUCH'}
          </text>
        </g>
      )}

      {/* Ground line */}
      <line x1="60" y1="465" x2="340" y2="465" stroke="rgba(255,255,255,0.06)" strokeWidth="2" />

      {/* Grass tufts */}
      <path d="M80 465 Q85 455 90 465" fill="none" stroke="rgba(109,196,167,0.15)" strokeWidth="1.5" />
      <path d="M180 465 Q185 457 190 465" fill="none" stroke="rgba(109,196,167,0.15)" strokeWidth="1.5" />
      <path d="M280 465 Q285 458 290 465" fill="none" stroke="rgba(109,196,167,0.15)" strokeWidth="1.5" />
    </svg>
  )
}

export function WallSoccerTipOverlay({ onClose }: WallSoccerTipOverlayProps) {
  const tip = getDailySoccerTip()
  const categoryColor = getCategoryColor(tip.category)
  const categoryLabel = getCategoryLabel(tip.category)

  return (
    <div
      className="fixed inset-0 z-[100] flex"
      style={{ background: 'linear-gradient(135deg, #0a2818 0%, #0a1628 50%, #1a2810 100%)' }}
      onClick={onClose}
    >
      {/* LEFT HALF: Animated Soccer Player */}
      <div className="w-1/2 flex items-center justify-center relative overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Radial glow */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
          style={{
            width: 350,
            height: 350,
            background: `radial-gradient(circle, ${categoryColor}18 0%, transparent 70%)`,
          }}
        />

        {/* Field lines in background */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.03]">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white" style={{ width: 200, height: 200 }} />
        </div>

        <div className="relative z-10" style={{ width: 320, height: 420 }}>
          <SoccerPlayerGraphic category={tip.category} color={categoryColor} />
        </div>

        {/* Emoji badge */}
        <div
          className="absolute bottom-16 left-1/2 -translate-x-1/2 text-[4rem] drop-shadow-2xl"
          style={{ filter: `drop-shadow(0 0 20px ${categoryColor}50)` }}
        >
          {tip.emoji}
        </div>
      </div>

      {/* RIGHT HALF: Instruction */}
      <div className="w-1/2 flex flex-col justify-center px-14 pr-20 relative" onClick={(e) => e.stopPropagation()}>
        {/* Category badge */}
        <div
          className="px-5 py-1.5 rounded-full font-black text-[0.85rem] uppercase tracking-[0.3em] mb-6 w-fit"
          style={{ background: `${categoryColor}20`, color: categoryColor, border: `2px solid ${categoryColor}35` }}
        >
          ⚽ {categoryLabel}
        </div>

        {/* Title */}
        <h1 className="font-display text-white text-[3.5rem] leading-[1.1] font-bold mb-5 tracking-tight">
          {tip.title}
        </h1>

        {/* Divider */}
        <div className="w-20 h-1 rounded-full mb-6" style={{ background: categoryColor }} />

        {/* Tip text */}
        <p className="text-white/75 text-[1.4rem] leading-relaxed mb-8 font-medium">
          {tip.tip}
        </p>

        {/* Drill card */}
        <div
          className="rounded-2xl px-7 py-5"
          style={{
            background: `${categoryColor}10`,
            border: `2px solid ${categoryColor}25`,
          }}
        >
          <div
            className="font-black text-[0.75rem] uppercase tracking-[0.25em] mb-2.5 flex items-center gap-2"
            style={{ color: categoryColor }}
          >
            <span>⚽</span> Try This Drill
          </div>
          <p className="text-white/65 text-[1.15rem] leading-relaxed font-medium">
            {tip.drill}
          </p>
        </div>

        {/* Daily tip label */}
        <div className="mt-8 text-white/15 text-[0.75rem] font-bold uppercase tracking-[0.3em]">
          Soccer Tip of the Day
        </div>
      </div>

      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-8 right-10 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 flex items-center justify-center transition-colors z-10"
      >
        <svg className="w-6 h-6 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Tap to close */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/15 text-[0.75rem] font-bold uppercase tracking-[0.3em]">
        Tap anywhere to close
      </div>
    </div>
  )
}
