import { getDailySoccerTip, getCategoryLabel, getCategoryColor } from './soccerTips'
import type { SoccerTip } from './soccerTips'

interface WallSoccerTipOverlayProps {
  onClose: () => void
}

// Professional instructional diagrams per category
function SoccerDiagram({ category, color }: { category: SoccerTip['category']; color: string }) {
  const dim = 'rgba(255,255,255,0.08)'
  const mid = 'rgba(255,255,255,0.2)'
  const bright = color

  switch (category) {
    case 'dribbling':
      // Cone weave diagram with ball path
      return (
        <svg viewBox="0 0 400 400" className="w-full h-full">
          {/* Ground */}
          <rect x="40" y="340" width="320" height="2" rx="1" fill={dim} />
          {/* Cones */}
          {[100, 170, 240, 310].map((x, i) => (
            <g key={i}>
              <polygon points={`${x},340 ${x - 12},310 ${x + 12},310`} fill={i % 2 === 0 ? '#F9C35C40' : '#F26E6340'} stroke={i % 2 === 0 ? '#F9C35C' : '#F26E63'} strokeWidth="1.5" />
              <ellipse cx={x} cy="342" rx="14" ry="3" fill={dim} />
            </g>
          ))}
          {/* Weaving ball path */}
          <path
            d="M60,330 C80,330 90,280 100,280 S120,330 135,330 S150,280 170,280 S190,330 205,330 S220,280 240,280 S260,330 275,330 S290,280 310,280 S330,330 350,330"
            fill="none" stroke={bright} strokeWidth="2.5" strokeDasharray="8 4" opacity="0.7"
          />
          {/* Ball positions */}
          {[60, 135, 205, 275, 350].map((x, i) => (
            <circle key={i} cx={x} cy="330" r="8" fill="white" opacity={0.3 + i * 0.15} />
          ))}
          {/* Direction arrow */}
          <polygon points="355,325 365,330 355,335" fill={bright} opacity="0.8" />
          {/* Label */}
          <text x="200" y="60" fill={mid} fontSize="14" fontWeight="800" textAnchor="middle" letterSpacing="4">WEAVE THROUGH CONES</text>
          {/* Feet indicators */}
          <text x="80" y="370" fill={bright} fontSize="10" fontWeight="700" opacity="0.5">L</text>
          <text x="155" y="370" fill={bright} fontSize="10" fontWeight="700" opacity="0.5">R</text>
          <text x="225" y="370" fill={bright} fontSize="10" fontWeight="700" opacity="0.5">L</text>
          <text x="295" y="370" fill={bright} fontSize="10" fontWeight="700" opacity="0.5">R</text>
          {/* Touch markers — inside/outside foot */}
          <text x="200" y="90" fill="rgba(255,255,255,0.12)" fontSize="11" fontWeight="700" textAnchor="middle">INSIDE → OUTSIDE → INSIDE → OUTSIDE</text>
          {/* Small ball icon */}
          <circle cx="60" cy="330" r="10" fill="white" opacity="0.9" />
          <path d="M60 323 L64 327 L62 333 L58 333 L56 327 Z" fill="rgba(0,0,0,0.12)" />
        </svg>
      )

    case 'passing':
      // Two-player passing diagram with trajectory
      return (
        <svg viewBox="0 0 400 400" className="w-full h-full">
          {/* Field patch */}
          <rect x="30" y="180" width="340" height="140" rx="8" fill="rgba(109,196,167,0.04)" stroke="rgba(109,196,167,0.1)" strokeWidth="1" />
          {/* Player A position */}
          <circle cx="80" cy="250" r="22" fill={`${bright}20`} stroke={bright} strokeWidth="2" />
          <text x="80" y="255" fill={bright} fontSize="13" fontWeight="800" textAnchor="middle">A</text>
          {/* Player B position */}
          <circle cx="320" cy="250" r="22" fill={`${bright}20`} stroke={bright} strokeWidth="2" />
          <text x="320" y="255" fill={bright} fontSize="13" fontWeight="800" textAnchor="middle">B</text>
          {/* Pass line */}
          <line x1="105" y1="250" x2="295" y2="250" stroke={bright} strokeWidth="2" strokeDasharray="10 5" opacity="0.6" />
          {/* Arrow */}
          <polygon points="295,244 305,250 295,256" fill={bright} opacity="0.8" />
          {/* Ball */}
          <circle cx="190" cy="250" r="10" fill="white" opacity="0.9" />
          <path d="M190 243 L194 247 L192 253 L188 253 L186 247 Z" fill="rgba(0,0,0,0.12)" />
          {/* Plant foot indicator */}
          <line x1="80" y1="280" x2="130" y2="300" stroke={bright} strokeWidth="1.5" strokeDasharray="3 3" opacity="0.4" />
          <text x="135" y="305" fill={bright} fontSize="10" fontWeight="700" opacity="0.5">PLANT FOOT POINTS AT TARGET</text>
          {/* 10ft marker */}
          <line x1="80" y1="200" x2="320" y2="200" stroke={mid} strokeWidth="1" />
          <text x="200" y="195" fill={mid} fontSize="10" fontWeight="700" textAnchor="middle">10 – 15 FEET</text>
          {/* Labels */}
          <text x="200" y="60" fill={mid} fontSize="14" fontWeight="800" textAnchor="middle" letterSpacing="4">INSIDE-FOOT PASS</text>
          {/* Foot angle detail */}
          <path d="M70 290 Q80 285 90 290" fill="none" stroke={bright} strokeWidth="1.5" opacity="0.3" />
          <text x="80" y="300" fill={bright} fontSize="8" fontWeight="700" textAnchor="middle" opacity="0.4">90°</text>
        </svg>
      )

    case 'shooting':
      // Goal with target zones
      return (
        <svg viewBox="0 0 400 400" className="w-full h-full">
          {/* Goal frame */}
          <rect x="60" y="80" width="280" height="180" rx="4" fill="none" stroke={mid} strokeWidth="3" />
          {/* Net lines */}
          {[0, 1, 2, 3, 4, 5, 6].map(i => (
            <line key={`v${i}`} x1={60 + i * 46.7} y1="80" x2={60 + i * 46.7} y2="260" stroke={dim} strokeWidth="0.5" />
          ))}
          {[0, 1, 2, 3].map(i => (
            <line key={`h${i}`} x1="60" y1={80 + i * 60} x2="340" y2={80 + i * 60} stroke={dim} strokeWidth="0.5" />
          ))}
          {/* Target zones — corners highlighted */}
          <rect x="62" y="200" width="70" height="58" rx="4" fill={`${bright}15`} stroke={bright} strokeWidth="1.5" strokeDasharray="4 3" />
          <rect x="268" y="200" width="70" height="58" rx="4" fill={`${bright}15`} stroke={bright} strokeWidth="1.5" strokeDasharray="4 3" />
          <rect x="62" y="82" width="70" height="58" rx="4" fill="rgba(249,195,92,0.08)" stroke="#F9C35C" strokeWidth="1" strokeDasharray="4 3" opacity="0.5" />
          <rect x="268" y="82" width="70" height="58" rx="4" fill="rgba(249,195,92,0.08)" stroke="#F9C35C" strokeWidth="1" strokeDasharray="4 3" opacity="0.5" />
          {/* Zone labels */}
          <text x="97" y="235" fill={bright} fontSize="10" fontWeight="800" textAnchor="middle" opacity="0.7">BEST</text>
          <text x="303" y="235" fill={bright} fontSize="10" fontWeight="800" textAnchor="middle" opacity="0.7">BEST</text>
          <text x="97" y="115" fill="#F9C35C" fontSize="9" fontWeight="700" textAnchor="middle" opacity="0.5">GOOD</text>
          <text x="303" y="115" fill="#F9C35C" fontSize="9" fontWeight="700" textAnchor="middle" opacity="0.5">GOOD</text>
          {/* Center — avoid zone */}
          <text x="200" y="175" fill="rgba(242,110,99,0.4)" fontSize="9" fontWeight="700" textAnchor="middle">AVOID</text>
          {/* Shooter position */}
          <circle cx="200" cy="340" r="6" fill={bright} opacity="0.5" />
          {/* Shot trajectory */}
          <line x1="200" y1="334" x2="97" y2="230" stroke={bright} strokeWidth="1.5" strokeDasharray="6 4" opacity="0.4" />
          <polygon points="100,225 92,232 102,234" fill={bright} opacity="0.5" />
          {/* Labels */}
          <text x="200" y="40" fill={mid} fontSize="14" fontWeight="800" textAnchor="middle" letterSpacing="4">AIM FOR THE CORNERS</text>
          <text x="200" y="370" fill={mid} fontSize="10" fontWeight="700" textAnchor="middle">SHOOTER</text>
        </svg>
      )

    case 'defense':
      // Defensive stance and positioning
      return (
        <svg viewBox="0 0 400 400" className="w-full h-full">
          {/* Field area */}
          <rect x="50" y="80" width="300" height="260" rx="8" fill="rgba(109,196,167,0.03)" stroke={dim} strokeWidth="1" />
          {/* Goal to protect */}
          <rect x="140" y="340" width="120" height="6" rx="3" fill={mid} />
          <text x="200" y="368" fill={mid} fontSize="9" fontWeight="700" textAnchor="middle">GOAL</text>
          {/* Defender position */}
          <circle cx="200" cy="260" r="20" fill={`${bright}20`} stroke={bright} strokeWidth="2" />
          <text x="200" y="265" fill={bright} fontSize="11" fontWeight="800" textAnchor="middle">DEF</text>
          {/* Attacker position */}
          <circle cx="200" cy="150" r="18" fill="rgba(242,110,99,0.15)" stroke="#F26E63" strokeWidth="1.5" />
          <text x="200" y="155" fill="#F26E63" fontSize="10" fontWeight="700" textAnchor="middle">ATK</text>
          {/* Stay between attacker and goal — line */}
          <line x1="200" y1="170" x2="200" y2="240" stroke={bright} strokeWidth="1.5" strokeDasharray="4 4" opacity="0.4" />
          {/* Defensive zone arc */}
          <path d="M160 260 Q200 220 240 260" fill="none" stroke={bright} strokeWidth="1.5" strokeDasharray="5 3" opacity="0.4" />
          <text x="200" y="240" fill={bright} fontSize="8" fontWeight="700" textAnchor="middle" opacity="0.5">JOCKEY ZONE</text>
          {/* Stance indicators */}
          <circle cx="188" cy="285" r="4" fill={bright} opacity="0.3" />
          <circle cx="212" cy="285" r="4" fill={bright} opacity="0.3" />
          <text x="200" y="305" fill={bright} fontSize="8" fontWeight="700" textAnchor="middle" opacity="0.5">FEET SHOULDER-WIDTH</text>
          {/* Labels */}
          <text x="200" y="40" fill={mid} fontSize="14" fontWeight="800" textAnchor="middle" letterSpacing="4">STAY BETWEEN BALL & GOAL</text>
          {/* Side shuffle arrows */}
          <path d="M155 260 L140 260" stroke={bright} strokeWidth="1.5" opacity="0.3" />
          <polygon points="140,256 133,260 140,264" fill={bright} opacity="0.3" />
          <path d="M245 260 L260 260" stroke={bright} strokeWidth="1.5" opacity="0.3" />
          <polygon points="260,256 267,260 260,264" fill={bright} opacity="0.3" />
        </svg>
      )

    case 'first-touch':
      // Ball reception — cushion diagram
      return (
        <svg viewBox="0 0 400 400" className="w-full h-full">
          {/* Incoming ball trajectory */}
          <line x1="60" y1="100" x2="190" y2="240" stroke={mid} strokeWidth="1.5" strokeDasharray="8 4" />
          <polygon points="186,234 196,242 190,246" fill={mid} />
          {/* Ball at arrival */}
          <circle cx="200" cy="250" r="12" fill="white" opacity="0.8" />
          <path d="M200 241 L205 246 L203 253 L197 253 L195 246 Z" fill="rgba(0,0,0,0.1)" />
          {/* Foot receiving */}
          <ellipse cx="200" cy="280" rx="30" ry="12" fill={`${bright}20`} stroke={bright} strokeWidth="2" />
          <text x="200" y="284" fill={bright} fontSize="8" fontWeight="800" textAnchor="middle">FOOT</text>
          {/* Cushion arrow — foot pulls back */}
          <path d="M200 295 L200 320" stroke={bright} strokeWidth="2" opacity="0.5" />
          <polygon points="195,318 200,328 205,318" fill={bright} opacity="0.5" />
          <text x="200" y="345" fill={bright} fontSize="9" fontWeight="700" textAnchor="middle" opacity="0.6">PULL BACK TO CUSHION</text>
          {/* Dead ball result */}
          <circle cx="200" cy="280" r="10" fill="white" opacity="0.2" strokeDasharray="3 2" stroke={bright} strokeWidth="1" />
          {/* Pressure indicator */}
          <circle cx="320" cy="250" r="16" fill="rgba(242,110,99,0.1)" stroke="#F26E63" strokeWidth="1" strokeDasharray="3 3" />
          <text x="320" y="254" fill="#F26E63" fontSize="8" fontWeight="700" textAnchor="middle" opacity="0.5">DEF</text>
          {/* Touch direction — away from pressure */}
          <path d="M195 275 L140 290" stroke={bright} strokeWidth="1.5" strokeDasharray="5 3" opacity="0.4" />
          <polygon points="143,285 135,292 143,295" fill={bright} opacity="0.4" />
          <text x="110" y="310" fill={bright} fontSize="9" fontWeight="700" textAnchor="middle" opacity="0.5">AWAY FROM PRESSURE</text>
          {/* Labels */}
          <text x="200" y="50" fill={mid} fontSize="14" fontWeight="800" textAnchor="middle" letterSpacing="4">CUSHION THE BALL</text>
          <text x="80" y="95" fill={mid} fontSize="9" fontWeight="700">INCOMING PASS</text>
        </svg>
      )

    case 'teamwork':
      // Triangle passing pattern
      return (
        <svg viewBox="0 0 400 400" className="w-full h-full">
          {/* Field */}
          <rect x="40" y="80" width="320" height="260" rx="8" fill="rgba(109,196,167,0.03)" stroke={dim} strokeWidth="1" />
          {/* Three players in triangle */}
          <circle cx="200" cy="120" r="20" fill={`${bright}20`} stroke={bright} strokeWidth="2" />
          <text x="200" y="125" fill={bright} fontSize="10" fontWeight="800" textAnchor="middle">1</text>
          <circle cx="100" cy="300" r="20" fill={`${bright}20`} stroke={bright} strokeWidth="2" />
          <text x="100" y="305" fill={bright} fontSize="10" fontWeight="800" textAnchor="middle">2</text>
          <circle cx="300" cy="300" r="20" fill={`${bright}20`} stroke={bright} strokeWidth="2" />
          <text x="300" y="305" fill={bright} fontSize="10" fontWeight="800" textAnchor="middle">3</text>
          {/* Pass lines */}
          <line x1="190" y1="138" x2="112" y2="283" stroke={bright} strokeWidth="1.5" strokeDasharray="8 4" opacity="0.5" />
          <line x1="120" y1="295" x2="280" y2="295" stroke={bright} strokeWidth="1.5" strokeDasharray="8 4" opacity="0.5" />
          <line x1="288" y1="283" x2="210" y2="138" stroke={bright} strokeWidth="1.5" strokeDasharray="8 4" opacity="0.5" />
          {/* Arrows on pass lines */}
          <polygon points="118,278 108,288 120,287" fill={bright} opacity="0.5" />
          <polygon points="275,290 285,298 278,300" fill={bright} opacity="0.5" />
          <polygon points="215,143 205,133 208,145" fill={bright} opacity="0.5" />
          {/* Movement arrows */}
          <path d="M200 145 Q230 180 250 160" fill="none" stroke="#F9C35C" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.4" />
          <text x="260" y="158" fill="#F9C35C" fontSize="8" fontWeight="700" opacity="0.5">MOVE!</text>
          {/* Labels */}
          <text x="200" y="40" fill={mid} fontSize="14" fontWeight="800" textAnchor="middle" letterSpacing="4">PASS & MOVE</text>
          <text x="200" y="380" fill={mid} fontSize="9" fontWeight="700" textAnchor="middle">KEEP THE TRIANGLE SHAPE</text>
        </svg>
      )

    case 'fitness':
      // Ladder drill / footwork pattern
      return (
        <svg viewBox="0 0 400 400" className="w-full h-full">
          {/* Agility ladder */}
          <line x1="150" y1="40" x2="150" y2="380" stroke={mid} strokeWidth="2" />
          <line x1="250" y1="40" x2="250" y2="380" stroke={mid} strokeWidth="2" />
          {[60, 100, 140, 180, 220, 260, 300, 340].map((y, i) => (
            <line key={i} x1="150" y1={y} x2="250" y2={y} stroke={mid} strokeWidth="1.5" />
          ))}
          {/* Foot placement pattern — quick feet */}
          {[70, 110, 150, 190, 230, 270, 310].map((y, i) => (
            <g key={i}>
              <ellipse cx={180} cy={y + 10} rx="10" ry="6" fill={bright} opacity={0.2 + (i * 0.08)} />
              <ellipse cx={220} cy={y + 18} rx="10" ry="6" fill={bright} opacity={0.2 + (i * 0.08)} />
            </g>
          ))}
          {/* Direction arrow */}
          <path d="M200 380 L200 395" stroke={bright} strokeWidth="2" opacity="0.5" />
          <polygon points="195,393 200,403 205,393" fill={bright} opacity="0.5" />
          {/* Speed lines */}
          <line x1="130" y1="350" x2="130" y2="320" stroke={bright} strokeWidth="1" opacity="0.2" />
          <line x1="270" y1="350" x2="270" y2="320" stroke={bright} strokeWidth="1" opacity="0.2" />
          {/* Labels */}
          <text x="90" y="200" fill={bright} fontSize="9" fontWeight="800" textAnchor="middle" transform="rotate(-90, 90, 200)" letterSpacing="3" opacity="0.5">QUICK FEET</text>
          <text x="200" y="25" fill={mid} fontSize="14" fontWeight="800" textAnchor="middle" letterSpacing="4">LADDER DRILL</text>
        </svg>
      )

    case 'goalkeeping':
      // Ready position + diving angles
      return (
        <svg viewBox="0 0 400 400" className="w-full h-full">
          {/* Goal frame */}
          <rect x="60" y="100" width="280" height="160" rx="4" fill="none" stroke={mid} strokeWidth="2.5" />
          {/* Keeper position */}
          <circle cx="200" cy="260" r="16" fill={`${bright}25`} stroke={bright} strokeWidth="2" />
          <text x="200" y="264" fill={bright} fontSize="9" fontWeight="800" textAnchor="middle">GK</text>
          {/* Diving range arcs */}
          <path d="M120 260 Q200 200 280 260" fill="none" stroke={bright} strokeWidth="1.5" strokeDasharray="6 3" opacity="0.3" />
          {/* Left dive */}
          <path d="M200 260 L90 210" stroke={bright} strokeWidth="1.5" strokeDasharray="4 3" opacity="0.4" />
          <polygon points="94,205 86,212 96,214" fill={bright} opacity="0.4" />
          {/* Right dive */}
          <path d="M200 260 L310 210" stroke={bright} strokeWidth="1.5" strokeDasharray="4 3" opacity="0.4" />
          <polygon points="306,205 314,212 304,214" fill={bright} opacity="0.4" />
          {/* Ready stance feet */}
          <ellipse cx="190" cy="280" rx="8" ry="4" fill={bright} opacity="0.3" />
          <ellipse cx="210" cy="280" rx="8" ry="4" fill={bright} opacity="0.3" />
          <text x="200" y="300" fill={bright} fontSize="8" fontWeight="700" textAnchor="middle" opacity="0.5">SHOULDER WIDTH</text>
          {/* Labels */}
          <text x="200" y="50" fill={mid} fontSize="14" fontWeight="800" textAnchor="middle" letterSpacing="4">READY POSITION</text>
          <text x="200" y="340" fill={mid} fontSize="9" fontWeight="700" textAnchor="middle">KNEES BENT · ON YOUR TOES · HANDS UP</text>
        </svg>
      )

    case 'mindset':
    case 'heading':
    default:
      // Mental focus — target/bullseye visualization
      return (
        <svg viewBox="0 0 400 400" className="w-full h-full">
          {/* Concentric circles — focus rings */}
          {[140, 110, 80, 50, 20].map((r, i) => (
            <circle key={i} cx="200" cy="200" r={r} fill="none" stroke={bright} strokeWidth={i === 4 ? 2 : 1} opacity={0.08 + i * 0.06} />
          ))}
          {/* Center dot */}
          <circle cx="200" cy="200" r="8" fill={bright} opacity="0.6" />
          {/* Focus labels around the rings */}
          <text x="200" y="90" fill={bright} fontSize="9" fontWeight="700" textAnchor="middle" opacity="0.4">VISUALIZE</text>
          <text x="200" y="130" fill={bright} fontSize="9" fontWeight="700" textAnchor="middle" opacity="0.5">FOCUS</text>
          <text x="200" y="170" fill={bright} fontSize="10" fontWeight="800" textAnchor="middle" opacity="0.6">BELIEVE</text>
          <text x="200" y="208" fill="white" fontSize="12" fontWeight="900" textAnchor="middle" opacity="0.9">YOU</text>
          {/* Radiating lines */}
          {[0, 45, 90, 135, 180, 225, 270, 315].map(angle => {
            const rad = (angle * Math.PI) / 180
            const x1 = 200 + Math.cos(rad) * 160
            const y1 = 200 + Math.sin(rad) * 160
            const x2 = 200 + Math.cos(rad) * 180
            const y2 = 200 + Math.sin(rad) * 180
            return <line key={angle} x1={x1} y1={y1} x2={x2} y2={y2} stroke={bright} strokeWidth="1" opacity="0.15" />
          })}
          {/* Labels */}
          <text x="200" y="30" fill={mid} fontSize="14" fontWeight="800" textAnchor="middle" letterSpacing="4">MENTAL GAME</text>
          <text x="200" y="380" fill={mid} fontSize="9" fontWeight="700" textAnchor="middle">YOUR MIND IS YOUR STRONGEST MUSCLE</text>
        </svg>
      )
  }
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
      {/* LEFT HALF: Instructional Diagram */}
      <div className="w-1/2 flex items-center justify-center relative overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Subtle radial glow */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
          style={{ width: 400, height: 400, background: `radial-gradient(circle, ${categoryColor}10 0%, transparent 70%)` }}
        />
        <div className="relative z-10 px-12" style={{ width: 400, height: 400 }}>
          <SoccerDiagram category={tip.category} color={categoryColor} />
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
          style={{ background: `${categoryColor}10`, border: `2px solid ${categoryColor}25` }}
        >
          <div className="font-black text-[0.75rem] uppercase tracking-[0.25em] mb-2.5 flex items-center gap-2" style={{ color: categoryColor }}>
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

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/15 text-[0.75rem] font-bold uppercase tracking-[0.3em]">
        Tap anywhere to close
      </div>
    </div>
  )
}
