import { getDailyRunningTip, getRunningCategoryLabel, getRunningCategoryColor } from './runningTips'
import type { RunningTip } from './runningTips'

interface WallRunningTipOverlayProps {
  onClose: () => void
}

// Animated SVG runner with highlighted body part based on tip focus
function RunnerGraphic({ focus, color }: { focus: RunningTip['diagramFocus']; color: string }) {
  const highlightColor = color
  const baseColor = 'rgba(255,255,255,0.25)'

  const headColor = focus === 'head' || focus === 'full' ? highlightColor : baseColor
  const armColor = focus === 'arms' || focus === 'full' ? highlightColor : baseColor
  const torsoColor = focus === 'torso' || focus === 'full' ? highlightColor : baseColor
  const legColor = focus === 'legs' || focus === 'full' ? highlightColor : baseColor
  const footColor = focus === 'feet' || focus === 'full' ? highlightColor : baseColor

  return (
    <svg viewBox="0 0 400 500" className="w-full h-full" style={{ maxHeight: '70vh' }}>
      <defs>
        {/* Glow filter for highlighted parts */}
        <filter id="glow">
          <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>

        {/* Pulse animation */}
        <style>{`
          @keyframes runBounce {
            0%, 100% { transform: translateY(0px); }
            50% { transform: translateY(-8px); }
          }
          @keyframes armSwingFront {
            0%, 100% { transform: rotate(-25deg); }
            50% { transform: rotate(25deg); }
          }
          @keyframes armSwingBack {
            0%, 100% { transform: rotate(25deg); }
            50% { transform: rotate(-25deg); }
          }
          @keyframes legSwingFront {
            0%, 100% { transform: rotate(-30deg); }
            50% { transform: rotate(30deg); }
          }
          @keyframes legSwingBack {
            0%, 100% { transform: rotate(30deg); }
            50% { transform: rotate(-30deg); }
          }
          @keyframes highlightPulse {
            0%, 100% { opacity: 0.8; }
            50% { opacity: 1; }
          }
          .runner-body { animation: runBounce 0.6s ease-in-out infinite; }
          .arm-front { animation: armSwingFront 0.6s ease-in-out infinite; transform-origin: 200px 185px; }
          .arm-back { animation: armSwingBack 0.6s ease-in-out infinite; transform-origin: 200px 185px; }
          .leg-front { animation: legSwingFront 0.6s ease-in-out infinite; transform-origin: 200px 300px; }
          .leg-back { animation: legSwingBack 0.6s ease-in-out infinite; transform-origin: 200px 300px; }
          .highlight { animation: highlightPulse 1.5s ease-in-out infinite; filter: url(#glow); }
        `}</style>
      </defs>

      <g className="runner-body">
        {/* Head */}
        <circle
          cx="200" cy="110" r="38"
          fill={headColor}
          stroke={focus === 'head' ? highlightColor : 'rgba(255,255,255,0.1)'}
          strokeWidth={focus === 'head' ? 3 : 1}
          className={focus === 'head' ? 'highlight' : ''}
        />
        {/* Eyes */}
        <circle cx="188" cy="105" r="4" fill={focus === 'head' ? '#1a1a2e' : 'rgba(255,255,255,0.4)'} />
        <circle cx="212" cy="105" r="4" fill={focus === 'head' ? '#1a1a2e' : 'rgba(255,255,255,0.4)'} />
        {/* Smile */}
        <path d="M188 118 Q200 130 212 118" fill="none" stroke={focus === 'head' ? '#1a1a2e' : 'rgba(255,255,255,0.3)'} strokeWidth="2.5" strokeLinecap="round" />

        {/* Torso */}
        <rect
          x="175" y="148" width="50" height="75" rx="12"
          fill={torsoColor}
          stroke={focus === 'torso' ? highlightColor : 'rgba(255,255,255,0.1)'}
          strokeWidth={focus === 'torso' ? 3 : 1}
          className={focus === 'torso' ? 'highlight' : ''}
        />
        {/* Shirt detail */}
        <line x1="200" y1="155" x2="200" y2="190" stroke={focus === 'torso' ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.08)'} strokeWidth="1" />
      </g>

      {/* Front Arm */}
      <g className="arm-front">
        <line
          x1="200" y1="185" x2="160" y2="250"
          stroke={armColor}
          strokeWidth="18"
          strokeLinecap="round"
          className={focus === 'arms' ? 'highlight' : ''}
        />
        {/* Hand */}
        <circle cx="160" cy="250" r="9" fill={armColor} className={focus === 'arms' ? 'highlight' : ''} />
      </g>

      {/* Back Arm */}
      <g className="arm-back">
        <line
          x1="200" y1="185" x2="245" y2="255"
          stroke={armColor}
          strokeWidth="18"
          strokeLinecap="round"
          opacity="0.6"
          className={focus === 'arms' ? 'highlight' : ''}
        />
        <circle cx="245" cy="255" r="9" fill={armColor} opacity="0.6" className={focus === 'arms' ? 'highlight' : ''} />
      </g>

      {/* Front Leg */}
      <g className="leg-front">
        {/* Upper leg */}
        <line
          x1="200" y1="300" x2="160" y2="375"
          stroke={legColor}
          strokeWidth="20"
          strokeLinecap="round"
          className={focus === 'legs' ? 'highlight' : ''}
        />
        {/* Lower leg */}
        <line
          x1="160" y1="375" x2="145" y2="445"
          stroke={legColor}
          strokeWidth="16"
          strokeLinecap="round"
          className={focus === 'legs' || focus === 'feet' ? 'highlight' : ''}
        />
        {/* Shoe */}
        <ellipse
          cx="135" cy="450" rx="22" ry="10"
          fill={footColor}
          stroke={focus === 'feet' ? highlightColor : 'rgba(255,255,255,0.1)'}
          strokeWidth={focus === 'feet' ? 2 : 0}
          className={focus === 'feet' ? 'highlight' : ''}
        />
      </g>

      {/* Back Leg */}
      <g className="leg-back">
        <line
          x1="200" y1="300" x2="240" y2="370"
          stroke={legColor}
          strokeWidth="20"
          strokeLinecap="round"
          opacity="0.6"
          className={focus === 'legs' ? 'highlight' : ''}
        />
        <line
          x1="240" y1="370" x2="255" y2="440"
          stroke={legColor}
          strokeWidth="16"
          strokeLinecap="round"
          opacity="0.6"
          className={focus === 'legs' || focus === 'feet' ? 'highlight' : ''}
        />
        <ellipse
          cx="265" cy="445" rx="22" ry="10"
          fill={footColor}
          opacity="0.6"
          className={focus === 'feet' ? 'highlight' : ''}
        />
      </g>

      {/* Focus label callout */}
      {focus !== 'full' && (
        <g>
          {focus === 'head' && (
            <>
              <line x1="240" y1="100" x2="300" y2="80" stroke={highlightColor} strokeWidth="1.5" strokeDasharray="4 4" opacity="0.6" />
              <text x="305" y="85" fill={highlightColor} fontSize="14" fontWeight="800" textAnchor="start" opacity="0.8">FOCUS HERE</text>
            </>
          )}
          {focus === 'arms' && (
            <>
              <line x1="155" y1="230" x2="95" y2="210" stroke={highlightColor} strokeWidth="1.5" strokeDasharray="4 4" opacity="0.6" />
              <text x="90" y="205" fill={highlightColor} fontSize="14" fontWeight="800" textAnchor="end" opacity="0.8">FOCUS HERE</text>
            </>
          )}
          {focus === 'torso' && (
            <>
              <line x1="230" y1="185" x2="300" y2="175" stroke={highlightColor} strokeWidth="1.5" strokeDasharray="4 4" opacity="0.6" />
              <text x="305" y="180" fill={highlightColor} fontSize="14" fontWeight="800" textAnchor="start" opacity="0.8">FOCUS HERE</text>
            </>
          )}
          {focus === 'legs' && (
            <>
              <line x1="155" y1="375" x2="95" y2="365" stroke={highlightColor} strokeWidth="1.5" strokeDasharray="4 4" opacity="0.6" />
              <text x="90" y="370" fill={highlightColor} fontSize="14" fontWeight="800" textAnchor="end" opacity="0.8">FOCUS HERE</text>
            </>
          )}
          {focus === 'feet' && (
            <>
              <line x1="135" y1="445" x2="75" y2="460" stroke={highlightColor} strokeWidth="1.5" strokeDasharray="4 4" opacity="0.6" />
              <text x="70" y="465" fill={highlightColor} fontSize="14" fontWeight="800" textAnchor="end" opacity="0.8">FOCUS HERE</text>
            </>
          )}
        </g>
      )}

      {/* Ground line */}
      <line x1="60" y1="465" x2="340" y2="465" stroke="rgba(255,255,255,0.06)" strokeWidth="2" />
    </svg>
  )
}

export function WallRunningTipOverlay({ onClose }: WallRunningTipOverlayProps) {
  const tip = getDailyRunningTip()
  const categoryColor = getRunningCategoryColor(tip.category)
  const categoryLabel = getRunningCategoryLabel(tip.category)

  return (
    <div
      className="fixed inset-0 z-[100] flex"
      style={{ background: 'linear-gradient(135deg, #0a1628 0%, #1a0a28 50%, #0d1f3c 100%)' }}
      onClick={onClose}
    >
      {/* LEFT HALF: Animated Runner */}
      <div className="w-1/2 flex items-center justify-center relative overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Radial glow behind runner */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
          style={{
            width: 350,
            height: 350,
            background: `radial-gradient(circle, ${categoryColor}20 0%, transparent 70%)`,
          }}
        />

        {/* Speed lines */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="absolute h-[2px] rounded-full"
              style={{
                width: 40 + Math.random() * 60,
                top: `${20 + i * 12}%`,
                right: `${55 + Math.random() * 15}%`,
                background: `linear-gradient(to left, ${categoryColor}30, transparent)`,
                animation: `speedLine ${1 + Math.random() * 0.5}s ease-in-out infinite`,
                animationDelay: `${i * 0.15}s`,
              }}
            />
          ))}
          <style>{`
            @keyframes speedLine {
              0%, 100% { opacity: 0; transform: translateX(0); }
              50% { opacity: 1; transform: translateX(-20px); }
            }
          `}</style>
        </div>

        <div className="relative z-10" style={{ width: 320, height: 420 }}>
          <RunnerGraphic focus={tip.diagramFocus} color={categoryColor} />
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
          🏃 {categoryLabel}
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
            <span>🏃‍♂️</span> Try This Drill
          </div>
          <p className="text-white/65 text-[1.15rem] leading-relaxed font-medium">
            {tip.drill}
          </p>
        </div>

        {/* Daily tip label */}
        <div className="mt-8 text-white/15 text-[0.75rem] font-bold uppercase tracking-[0.3em]">
          Running Tip of the Day
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

      {/* Tap to close hint */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/15 text-[0.75rem] font-bold uppercase tracking-[0.3em]">
        Tap anywhere to close
      </div>
    </div>
  )
}
