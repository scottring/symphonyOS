import { getDailyRunningTip, getRunningCategoryLabel, getRunningCategoryColor } from './runningTips'
import type { RunningTip } from './runningTips'

interface WallRunningTipOverlayProps {
  onClose: () => void
}

// Professional instructional diagrams per running category
function RunningDiagram({ category, color }: { category: RunningTip['category']; color: string }) {
  const dim = 'rgba(255,255,255,0.08)'
  const mid = 'rgba(255,255,255,0.2)'
  const bright = color

  switch (category) {
    case 'form':
      // Posture alignment diagram — vertical line with checkpoints
      return (
        <svg viewBox="0 0 400 400" className="w-full h-full">
          {/* Vertical alignment line */}
          <line x1="200" y1="50" x2="200" y2="370" stroke={bright} strokeWidth="2" strokeDasharray="8 4" opacity="0.3" />
          {/* Posture checkpoints */}
          {/* Head */}
          <circle cx="200" cy="80" r="24" fill="none" stroke={bright} strokeWidth="2" opacity="0.5" />
          <line x1="200" y1="60" x2="200" y2="45" stroke={bright} strokeWidth="1.5" opacity="0.4" />
          <polygon points="195,47 200,38 205,47" fill={bright} opacity="0.4" />
          <text x="260" y="85" fill={bright} fontSize="10" fontWeight="700" opacity="0.6">EYES FORWARD</text>
          <line x1="226" y1="80" x2="255" y2="80" stroke={bright} strokeWidth="1" strokeDasharray="3 2" opacity="0.3" />
          {/* Shoulders */}
          <line x1="160" y1="130" x2="240" y2="130" stroke={bright} strokeWidth="2" opacity="0.4" />
          <text x="130" y="125" fill={bright} fontSize="10" fontWeight="700" textAnchor="end" opacity="0.6">RELAXED</text>
          <text x="130" y="137" fill={bright} fontSize="10" fontWeight="700" textAnchor="end" opacity="0.6">SHOULDERS</text>
          <line x1="135" y1="130" x2="158" y2="130" stroke={bright} strokeWidth="1" strokeDasharray="3 2" opacity="0.3" />
          {/* Torso */}
          <rect x="180" y="135" width="40" height="70" rx="6" fill="none" stroke={bright} strokeWidth="1.5" opacity="0.3" />
          <text x="260" y="170" fill={bright} fontSize="10" fontWeight="700" opacity="0.6">CHEST UP</text>
          <text x="260" y="182" fill={bright} fontSize="10" fontWeight="700" opacity="0.6">CORE ENGAGED</text>
          <line x1="222" y1="170" x2="255" y2="170" stroke={bright} strokeWidth="1" strokeDasharray="3 2" opacity="0.3" />
          {/* Hips */}
          <ellipse cx="200" cy="215" rx="25" ry="8" fill="none" stroke={bright} strokeWidth="1.5" opacity="0.3" />
          <text x="130" y="218" fill={bright} fontSize="10" fontWeight="700" textAnchor="end" opacity="0.6">HIPS LEVEL</text>
          <line x1="135" y1="215" x2="173" y2="215" stroke={bright} strokeWidth="1" strokeDasharray="3 2" opacity="0.3" />
          {/* Legs */}
          <line x1="190" y1="225" x2="175" y2="300" stroke={bright} strokeWidth="2" opacity="0.3" />
          <line x1="210" y1="225" x2="225" y2="300" stroke={bright} strokeWidth="2" opacity="0.3" />
          {/* Feet */}
          <ellipse cx="170" cy="310" rx="16" ry="6" fill={bright} opacity="0.15" />
          <ellipse cx="230" cy="310" rx="16" ry="6" fill={bright} opacity="0.15" />
          <text x="260" y="310" fill={bright} fontSize="10" fontWeight="700" opacity="0.6">LAND SOFTLY</text>
          {/* Slight forward lean arrow */}
          <path d="M200 50 Q210 45 215 55" fill="none" stroke="#F9C35C" strokeWidth="1.5" opacity="0.4" />
          <text x="230" y="52" fill="#F9C35C" fontSize="8" fontWeight="700" opacity="0.5">SLIGHT LEAN</text>
          {/* Labels */}
          <text x="200" y="25" fill={mid} fontSize="14" fontWeight="800" textAnchor="middle" letterSpacing="4">PERFECT POSTURE</text>
          <text x="200" y="385" fill={mid} fontSize="9" fontWeight="700" textAnchor="middle">TALL · RELAXED · ALIGNED</text>
          {/* Ground */}
          <line x1="100" y1="320" x2="300" y2="320" stroke={dim} strokeWidth="2" />
        </svg>
      )

    case 'arms':
      // Arm swing mechanics — 90° angle, front-to-back path
      return (
        <svg viewBox="0 0 400 400" className="w-full h-full">
          {/* Torso silhouette — simple */}
          <rect x="175" y="100" width="50" height="80" rx="8" fill={dim} />
          <circle cx="200" cy="80" r="20" fill={dim} />
          {/* Right arm — correct 90° */}
          <line x1="225" y1="120" x2="260" y2="160" stroke={bright} strokeWidth="3" opacity="0.7" />
          <line x1="260" y1="160" x2="245" y2="100" stroke={bright} strokeWidth="3" opacity="0.7" />
          {/* 90° angle arc */}
          <path d="M250 148 Q260 140 255 130" fill="none" stroke={bright} strokeWidth="1.5" opacity="0.5" />
          <text x="275" y="145" fill={bright} fontSize="11" fontWeight="800" opacity="0.7">90°</text>
          {/* Swing path arrows */}
          <path d="M245 90 Q270 60 280 90" fill="none" stroke={bright} strokeWidth="1.5" strokeDasharray="5 3" opacity="0.4" />
          <polygon points="278,85 284,93 276,94" fill={bright} opacity="0.4" />
          <text x="290" y="80" fill={bright} fontSize="9" fontWeight="700" opacity="0.5">CHIN</text>
          <path d="M260 170 Q270 200 260 220" fill="none" stroke={bright} strokeWidth="1.5" strokeDasharray="5 3" opacity="0.4" />
          <polygon points="255,218 262,226 266,216" fill={bright} opacity="0.4" />
          <text x="280" y="220" fill={bright} fontSize="9" fontWeight="700" opacity="0.5">HIP</text>
          {/* Left arm — back position (faded) */}
          <line x1="175" y1="120" x2="140" y2="170" stroke={mid} strokeWidth="2.5" opacity="0.4" />
          <line x1="140" y1="170" x2="155" y2="220" stroke={mid} strokeWidth="2.5" opacity="0.4" />
          {/* Forward/back label */}
          <text x="200" y="270" fill={bright} fontSize="11" fontWeight="700" textAnchor="middle" opacity="0.5">↕ FORWARD & BACK</text>
          <text x="200" y="290" fill="#F26E63" fontSize="10" fontWeight="700" textAnchor="middle" opacity="0.5">✕ NOT ACROSS BODY</text>
          {/* Wrong — crossed arms (X mark) */}
          <line x1="170" y1="310" x2="230" y2="340" stroke="#F26E63" strokeWidth="1" opacity="0.2" />
          <line x1="230" y1="310" x2="170" y2="340" stroke="#F26E63" strokeWidth="1" opacity="0.2" />
          {/* Labels */}
          <text x="200" y="30" fill={mid} fontSize="14" fontWeight="800" textAnchor="middle" letterSpacing="4">ARM SWING</text>
          <text x="200" y="380" fill={mid} fontSize="9" fontWeight="700" textAnchor="middle">CHIN TO HIP · RELAXED HANDS · 90° BEND</text>
        </svg>
      )

    case 'feet':
      // Foot strike zones + cadence
      return (
        <svg viewBox="0 0 400 400" className="w-full h-full">
          {/* Large foot outline */}
          <ellipse cx="200" cy="200" rx="60" ry="120" fill={dim} stroke={mid} strokeWidth="1.5" transform="rotate(-5, 200, 200)" />
          {/* Toe area */}
          <ellipse cx="195" cy="100" rx="40" ry="30" fill="none" stroke={mid} strokeWidth="1" strokeDasharray="3 3" />
          <text x="195" y="95" fill={mid} fontSize="8" fontWeight="700" textAnchor="middle">TOE</text>
          <text x="195" y="107" fill="#F26E63" fontSize="7" fontWeight="700" textAnchor="middle" opacity="0.5">✕ NOT HERE</text>
          {/* Midfoot — target zone */}
          <ellipse cx="200" cy="185" rx="35" ry="25" fill={`${bright}15`} stroke={bright} strokeWidth="2" />
          <text x="200" y="182" fill={bright} fontSize="10" fontWeight="800" textAnchor="middle">MIDFOOT</text>
          <text x="200" y="196" fill={bright} fontSize="9" fontWeight="700" textAnchor="middle" opacity="0.7">✓ LAND HERE</text>
          {/* Heel area */}
          <ellipse cx="205" cy="295" rx="35" ry="28" fill="none" stroke={mid} strokeWidth="1" strokeDasharray="3 3" />
          <text x="205" y="290" fill={mid} fontSize="8" fontWeight="700" textAnchor="middle">HEEL</text>
          <text x="205" y="302" fill="#F26E63" fontSize="7" fontWeight="700" textAnchor="middle" opacity="0.5">✕ BRAKING</text>
          {/* Impact arrow */}
          <line x1="300" y1="140" x2="240" y2="180" stroke={bright} strokeWidth="1.5" strokeDasharray="5 3" opacity="0.4" />
          <polygon points="244,175 236,182 246,184" fill={bright} opacity="0.4" />
          <text x="310" y="135" fill={bright} fontSize="9" fontWeight="700" opacity="0.5">GROUND</text>
          <text x="310" y="147" fill={bright} fontSize="9" fontWeight="700" opacity="0.5">CONTACT</text>
          {/* Labels */}
          <text x="200" y="30" fill={mid} fontSize="14" fontWeight="800" textAnchor="middle" letterSpacing="4">FOOT STRIKE</text>
          <text x="200" y="380" fill={mid} fontSize="9" fontWeight="700" textAnchor="middle">QUICK · LIGHT · MIDFOOT</text>
        </svg>
      )

    case 'breathing':
      // Breathing rhythm pattern — in/out with step counts
      return (
        <svg viewBox="0 0 400 400" className="w-full h-full">
          {/* Breathing wave */}
          <path
            d="M40,200 Q80,120 120,120 Q160,120 160,200 Q160,260 200,260 Q240,260 240,200 Q240,120 280,120 Q320,120 320,200 Q320,260 360,260"
            fill="none" stroke={bright} strokeWidth="2.5" opacity="0.5"
          />
          {/* IN labels on peaks */}
          <text x="120" y="105" fill={bright} fontSize="12" fontWeight="800" textAnchor="middle" opacity="0.7">IN</text>
          <text x="280" y="105" fill={bright} fontSize="12" fontWeight="800" textAnchor="middle" opacity="0.7">IN</text>
          {/* OUT labels on troughs */}
          <text x="200" y="285" fill="#F9C35C" fontSize="12" fontWeight="800" textAnchor="middle" opacity="0.7">OUT</text>
          <text x="360" y="285" fill="#F9C35C" fontSize="12" fontWeight="800" textAnchor="middle" opacity="0.7">OUT</text>
          {/* Step count markers */}
          {/* IN: 3 steps */}
          <g opacity="0.4">
            <circle cx="80" cy="155" r="4" fill={bright} />
            <circle cx="105" cy="125" r="4" fill={bright} />
            <circle cx="135" cy="125" r="4" fill={bright} />
            <text x="107" y="155" fill={bright} fontSize="8" fontWeight="700" textAnchor="middle">3 STEPS</text>
          </g>
          {/* OUT: 2 steps */}
          <g opacity="0.4">
            <circle cx="170" cy="235" r="4" fill="#F9C35C" />
            <circle cx="195" cy="258" r="4" fill="#F9C35C" />
            <text x="182" y="250" fill="#F9C35C" fontSize="8" fontWeight="700" textAnchor="middle">2 STEPS</text>
          </g>
          {/* Belly breathing indicator */}
          <ellipse cx="200" cy="340" rx="50" ry="25" fill="none" stroke={bright} strokeWidth="1.5" strokeDasharray="4 3" opacity="0.3" />
          <text x="200" y="345" fill={bright} fontSize="9" fontWeight="700" textAnchor="middle" opacity="0.5">BREATHE INTO BELLY</text>
          {/* Expand arrows */}
          <path d="M150 340 L135 340" stroke={bright} strokeWidth="1" opacity="0.3" />
          <path d="M250 340 L265 340" stroke={bright} strokeWidth="1" opacity="0.3" />
          {/* Labels */}
          <text x="200" y="35" fill={mid} fontSize="14" fontWeight="800" textAnchor="middle" letterSpacing="4">BREATHING RHYTHM</text>
          <text x="200" y="395" fill={mid} fontSize="9" fontWeight="700" textAnchor="middle">IN-2-3 · OUT-2 · IN-2-3 · OUT-2</text>
        </svg>
      )

    case 'speed':
      // Speed progression — build-up run zones
      return (
        <svg viewBox="0 0 400 400" className="w-full h-full">
          {/* Track lane */}
          <rect x="40" y="170" width="320" height="60" rx="6" fill={dim} />
          {/* Zone 1: Jog */}
          <rect x="40" y="170" width="100" height="60" rx="6" fill="rgba(109,196,167,0.08)" stroke="rgba(109,196,167,0.2)" strokeWidth="1" />
          <text x="90" y="205" fill="#6DC4A7" fontSize="11" fontWeight="800" textAnchor="middle">JOG</text>
          <text x="90" y="220" fill="#6DC4A7" fontSize="8" fontWeight="700" textAnchor="middle" opacity="0.5">60%</text>
          {/* Zone 2: Stride */}
          <rect x="140" y="170" width="100" height="60" fill={`${bright}10`} stroke={`${bright}30`} strokeWidth="1" />
          <text x="190" y="205" fill={bright} fontSize="11" fontWeight="800" textAnchor="middle">STRIDE</text>
          <text x="190" y="220" fill={bright} fontSize="8" fontWeight="700" textAnchor="middle" opacity="0.5">80%</text>
          {/* Zone 3: Sprint */}
          <rect x="240" y="170" width="120" height="60" rx="6" fill="rgba(242,110,99,0.1)" stroke="rgba(242,110,99,0.3)" strokeWidth="1" />
          <text x="300" y="205" fill="#F26E63" fontSize="11" fontWeight="800" textAnchor="middle">SPRINT</text>
          <text x="300" y="220" fill="#F26E63" fontSize="8" fontWeight="700" textAnchor="middle" opacity="0.5">100%</text>
          {/* Speed arrow */}
          <line x1="50" y1="150" x2="350" y2="150" stroke={bright} strokeWidth="1.5" opacity="0.3" />
          <polygon points="348,145 358,150 348,155" fill={bright} opacity="0.4" />
          <text x="200" y="145" fill={mid} fontSize="9" fontWeight="700" textAnchor="middle">INCREASING SPEED →</text>
          {/* Distance markers */}
          <text x="40" y="260" fill={mid} fontSize="9" fontWeight="700">0m</text>
          <text x="140" y="260" fill={mid} fontSize="9" fontWeight="700" textAnchor="middle">30m</text>
          <text x="240" y="260" fill={mid} fontSize="9" fontWeight="700" textAnchor="middle">60m</text>
          <text x="360" y="260" fill={mid} fontSize="9" fontWeight="700" textAnchor="end">100m</text>
          {/* Footprint trail — getting longer */}
          {[55, 75, 95, 115, 140, 165, 192, 222, 252, 287, 325].map((x, i) => (
            <ellipse key={i} cx={x} cy="240" rx={4 + i * 0.3} ry="2" fill={bright} opacity={0.15 + i * 0.05} />
          ))}
          {/* Labels */}
          <text x="200" y="50" fill={mid} fontSize="14" fontWeight="800" textAnchor="middle" letterSpacing="4">BUILD-UP RUN</text>
          <text x="200" y="340" fill={mid} fontSize="9" fontWeight="700" textAnchor="middle">START SLOW → FINISH FAST</text>
        </svg>
      )

    case 'endurance':
      // Walk-run intervals timeline
      return (
        <svg viewBox="0 0 400 400" className="w-full h-full">
          {/* Timeline bar */}
          <rect x="40" y="185" width="320" height="30" rx="6" fill={dim} />
          {/* Run intervals */}
          {[40, 140, 240].map((x, i) => (
            <rect key={i} x={x} y="185" width="60" height="30" rx={i === 0 ? 6 : 0} fill={`${bright}20`} stroke={bright} strokeWidth="1" />
          ))}
          {/* Walk intervals */}
          {[100, 200, 300].map((x, i) => (
            <rect key={i} x={x} y="185" width="40" height="30" fill="rgba(249,195,92,0.1)" stroke="#F9C35C" strokeWidth="1" />
          ))}
          {/* Labels on intervals */}
          <text x="70" y="205" fill={bright} fontSize="9" fontWeight="800" textAnchor="middle">RUN</text>
          <text x="120" y="205" fill="#F9C35C" fontSize="8" fontWeight="700" textAnchor="middle">WALK</text>
          <text x="170" y="205" fill={bright} fontSize="9" fontWeight="800" textAnchor="middle">RUN</text>
          <text x="220" y="205" fill="#F9C35C" fontSize="8" fontWeight="700" textAnchor="middle">WALK</text>
          <text x="270" y="205" fill={bright} fontSize="9" fontWeight="800" textAnchor="middle">RUN</text>
          <text x="340" y="205" fill="#F9C35C" fontSize="8" fontWeight="700" textAnchor="middle">WALK</text>
          {/* Time markers */}
          <text x="70" y="235" fill={bright} fontSize="8" fontWeight="700" textAnchor="middle" opacity="0.5">1 MIN</text>
          <text x="120" y="235" fill="#F9C35C" fontSize="7" fontWeight="700" textAnchor="middle" opacity="0.5">30s</text>
          <text x="170" y="235" fill={bright} fontSize="8" fontWeight="700" textAnchor="middle" opacity="0.5">1 MIN</text>
          {/* Effort curve */}
          <path
            d="M40,155 L60,130 L100,130 L105,155 L140,155 L160,130 L200,130 L205,155 L240,155 L260,130 L300,130 L305,155 L340,155 L360,155"
            fill="none" stroke={bright} strokeWidth="1.5" opacity="0.3"
          />
          <text x="30" y="130" fill={bright} fontSize="8" fontWeight="700" opacity="0.4">EFFORT</text>
          {/* Progress arrow */}
          <text x="200" y="290" fill={mid} fontSize="10" fontWeight="700" textAnchor="middle">WEEK 1 → WEEK 4</text>
          {/* Week progression */}
          <g transform="translate(0, 310)">
            <text x="80" y="0" fill={mid} fontSize="8" fontWeight="700" textAnchor="middle">WK 1: RUN 1 / WALK 1</text>
            <text x="80" y="14" fill={mid} fontSize="8" fontWeight="700" textAnchor="middle">WK 2: RUN 1.5 / WALK 0.5</text>
            <text x="280" y="0" fill={bright} fontSize="8" fontWeight="700" textAnchor="middle" opacity="0.6">WK 3: RUN 2 / WALK 0.5</text>
            <text x="280" y="14" fill={bright} fontSize="8" fontWeight="700" textAnchor="middle" opacity="0.6">WK 4: RUN 3 / WALK 0.5</text>
          </g>
          {/* Labels */}
          <text x="200" y="50" fill={mid} fontSize="14" fontWeight="800" textAnchor="middle" letterSpacing="4">RUN / WALK INTERVALS</text>
        </svg>
      )

    case 'warmup':
      // Dynamic warmup sequence
      return (
        <svg viewBox="0 0 400 400" className="w-full h-full">
          {/* Sequence circles */}
          {[
            { x: 100, y: 100, label: 'LEG\nSWINGS', sub: '10×', color: bright },
            { x: 280, y: 100, label: 'ARM\nCIRCLES', sub: '10×', color: '#F9C35C' },
            { x: 100, y: 250, label: 'HIGH\nKNEES', sub: '10×', color: '#F26E63' },
            { x: 280, y: 250, label: 'BUTT\nKICKS', sub: '10×', color: '#A78BFA' },
          ].map((item, i) => (
            <g key={i}>
              <circle cx={item.x} cy={item.y} r="55" fill={`${item.color}10`} stroke={`${item.color}40`} strokeWidth="2" />
              <text x={item.x} y={item.y - 8} fill={item.color} fontSize="10" fontWeight="800" textAnchor="middle" opacity="0.8">
                {item.label.split('\n').map((line, j) => (
                  <tspan key={j} x={item.x} dy={j === 0 ? 0 : 13}>{line}</tspan>
                ))}
              </text>
              <text x={item.x} y={item.y + 25} fill={item.color} fontSize="11" fontWeight="700" textAnchor="middle" opacity="0.5">{item.sub}</text>
              {/* Step number */}
              <circle cx={item.x - 40} cy={item.y - 40} r="12" fill={item.color} opacity="0.3" />
              <text x={item.x - 40} y={item.y - 36} fill="white" fontSize="10" fontWeight="900" textAnchor="middle">{i + 1}</text>
            </g>
          ))}
          {/* Flow arrows */}
          <path d="M158 100 L220 100" stroke={mid} strokeWidth="1.5" strokeDasharray="4 3" />
          <polygon points="218,95 228,100 218,105" fill={mid} />
          <path d="M280 158 L280 192" stroke={mid} strokeWidth="1.5" strokeDasharray="4 3" />
          <polygon points="275,190 280,200 285,190" fill={mid} />
          <path d="M220 250 L158 250" stroke={mid} strokeWidth="1.5" strokeDasharray="4 3" />
          <polygon points="160,245 150,250 160,255" fill={mid} />
          {/* Then run! */}
          <text x="100" y="340" fill={bright} fontSize="12" fontWeight="800" textAnchor="middle" opacity="0.6">→ THEN RUN!</text>
          {/* Labels */}
          <text x="200" y="30" fill={mid} fontSize="14" fontWeight="800" textAnchor="middle" letterSpacing="4">WARM-UP SEQUENCE</text>
          <text x="200" y="390" fill={mid} fontSize="9" fontWeight="700" textAnchor="middle">2 MINUTES · BEFORE EVERY RUN</text>
        </svg>
      )

    case 'cooldown':
      // Stretch positions
      return (
        <svg viewBox="0 0 400 400" className="w-full h-full">
          {/* Four stretch cards */}
          {[
            { x: 60, y: 80, label: 'QUAD\nSTRETCH', time: '20s each leg', color: bright },
            { x: 220, y: 80, label: 'CALF\nSTRETCH', time: '20s each leg', color: '#5BA4E6' },
            { x: 60, y: 230, label: 'HAMSTRING\nSTRETCH', time: '20s each leg', color: '#F9C35C' },
            { x: 220, y: 230, label: 'BUTTERFLY\nSTRETCH', time: '30s', color: '#EC4899' },
          ].map((item, i) => (
            <g key={i}>
              <rect x={item.x} y={item.y} width="140" height="110" rx="10" fill={`${item.color}08`} stroke={`${item.color}25`} strokeWidth="1.5" />
              <text x={item.x + 70} y={item.y + 40} fill={item.color} fontSize="11" fontWeight="800" textAnchor="middle" opacity="0.7">
                {item.label.split('\n').map((line, j) => (
                  <tspan key={j} x={item.x + 70} dy={j === 0 ? 0 : 14}>{line}</tspan>
                ))}
              </text>
              <text x={item.x + 70} y={item.y + 80} fill={item.color} fontSize="9" fontWeight="700" textAnchor="middle" opacity="0.4">{item.time}</text>
              {/* Hold icon */}
              <text x={item.x + 70} y={item.y + 98} fill={item.color} fontSize="8" fontWeight="700" textAnchor="middle" opacity="0.3">HOLD · DON'T BOUNCE</text>
            </g>
          ))}
          {/* Walk first note */}
          <text x="200" y="375" fill={bright} fontSize="10" fontWeight="700" textAnchor="middle" opacity="0.5">WALK 3 MIN FIRST → THEN STRETCH</text>
          {/* Labels */}
          <text x="200" y="40" fill={mid} fontSize="14" fontWeight="800" textAnchor="middle" letterSpacing="4">COOL-DOWN STRETCHES</text>
        </svg>
      )

    case 'mindset':
      // Goal setting / progress visual
      return (
        <svg viewBox="0 0 400 400" className="w-full h-full">
          {/* Progress path — mountain climb */}
          <path d="M40,350 L120,280 L160,300 L220,180 L280,220 L320,120 L370,60" fill="none" stroke={bright} strokeWidth="2.5" opacity="0.4" />
          {/* Milestone dots */}
          {[
            { x: 40, y: 350, label: 'START' },
            { x: 120, y: 280, label: '1 MIN' },
            { x: 220, y: 180, label: '3 MIN' },
            { x: 320, y: 120, label: '5 MIN' },
            { x: 370, y: 60, label: 'GOAL!' },
          ].map((pt, i) => (
            <g key={i}>
              <circle cx={pt.x} cy={pt.y} r={i === 4 ? 10 : 6} fill={i === 4 ? bright : `${bright}50`} />
              <text x={pt.x} y={pt.y - 15} fill={i === 4 ? bright : mid} fontSize={i === 4 ? 11 : 9} fontWeight="800" textAnchor="middle" opacity={i === 4 ? 0.8 : 0.5}>
                {pt.label}
              </text>
            </g>
          ))}
          {/* Star at the top */}
          <text x="370" y="40" fill={bright} fontSize="20" textAnchor="middle">⭐</text>
          {/* Setback dip label */}
          <text x="160" y="318" fill="#F9C35C" fontSize="8" fontWeight="700" textAnchor="middle" opacity="0.4">SETBACKS ARE OK!</text>
          {/* Labels */}
          <text x="200" y="30" fill={mid} fontSize="14" fontWeight="800" textAnchor="middle" letterSpacing="4">YOUR RUNNING JOURNEY</text>
          <text x="200" y="395" fill={mid} fontSize="9" fontWeight="700" textAnchor="middle">EVERY RUN MAKES YOU STRONGER</text>
        </svg>
      )

    case 'fun':
    default:
      // Fartlek / fun run route map
      return (
        <svg viewBox="0 0 400 400" className="w-full h-full">
          {/* Winding trail path */}
          <path
            d="M60,350 Q60,300 100,280 Q160,250 140,200 Q120,150 180,130 Q240,110 260,160 Q280,210 330,190 Q380,170 360,120 Q340,70 280,60"
            fill="none" stroke={bright} strokeWidth="3" opacity="0.4" strokeLinecap="round"
          />
          {/* Sprint zones (red) */}
          <circle cx="100" cy="280" r="18" fill="rgba(242,110,99,0.1)" stroke="#F26E63" strokeWidth="1.5" strokeDasharray="4 3" />
          <text x="100" y="284" fill="#F26E63" fontSize="7" fontWeight="800" textAnchor="middle">SPRINT</text>
          <circle cx="260" cy="160" r="18" fill="rgba(242,110,99,0.1)" stroke="#F26E63" strokeWidth="1.5" strokeDasharray="4 3" />
          <text x="260" y="164" fill="#F26E63" fontSize="7" fontWeight="800" textAnchor="middle">SPRINT</text>
          {/* Jog zones (green) */}
          <circle cx="180" cy="130" r="16" fill={`${bright}10`} stroke={bright} strokeWidth="1" strokeDasharray="4 3" />
          <text x="180" y="134" fill={bright} fontSize="7" fontWeight="700" textAnchor="middle">JOG</text>
          <circle cx="330" cy="190" r="16" fill={`${bright}10`} stroke={bright} strokeWidth="1" strokeDasharray="4 3" />
          <text x="330" y="194" fill={bright} fontSize="7" fontWeight="700" textAnchor="middle">JOG</text>
          {/* Landmarks */}
          <text x="60" y="345" fill={mid} fontSize="16">🏠</text>
          <text x="55" y="365" fill={mid} fontSize="8" fontWeight="700">START</text>
          <text x="130" y="190" fill={mid} fontSize="14">🌳</text>
          <text x="360" y="110" fill={mid} fontSize="14">📫</text>
          <text x="272" y="52" fill={mid} fontSize="16">🏁</text>
          {/* Labels */}
          <text x="200" y="30" fill={mid} fontSize="14" fontWeight="800" textAnchor="middle" letterSpacing="4">FARTLEK RUN</text>
          <text x="200" y="395" fill={mid} fontSize="9" fontWeight="700" textAnchor="middle">SPRINT TO LANDMARKS · JOG BETWEEN · HAVE FUN!</text>
        </svg>
      )
  }
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
      {/* LEFT HALF: Instructional Diagram */}
      <div className="w-1/2 flex items-center justify-center relative overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
          style={{ width: 400, height: 400, background: `radial-gradient(circle, ${categoryColor}10 0%, transparent 70%)` }}
        />
        <div className="relative z-10 px-12" style={{ width: 400, height: 400 }}>
          <RunningDiagram category={tip.category} color={categoryColor} />
        </div>
      </div>

      {/* RIGHT HALF: Instruction */}
      <div className="w-1/2 flex flex-col justify-center px-14 pr-20 relative" onClick={(e) => e.stopPropagation()}>
        <div
          className="px-5 py-1.5 rounded-full font-black text-[0.85rem] uppercase tracking-[0.3em] mb-6 w-fit"
          style={{ background: `${categoryColor}20`, color: categoryColor, border: `2px solid ${categoryColor}35` }}
        >
          🏃 {categoryLabel}
        </div>

        <h1 className="font-display text-white text-[3.5rem] leading-[1.1] font-bold mb-5 tracking-tight">
          {tip.title}
        </h1>

        <div className="w-20 h-1 rounded-full mb-6" style={{ background: categoryColor }} />

        <p className="text-white/75 text-[1.4rem] leading-relaxed mb-8 font-medium">
          {tip.tip}
        </p>

        <div
          className="rounded-2xl px-7 py-5"
          style={{ background: `${categoryColor}10`, border: `2px solid ${categoryColor}25` }}
        >
          <div className="font-black text-[0.75rem] uppercase tracking-[0.25em] mb-2.5 flex items-center gap-2" style={{ color: categoryColor }}>
            <span>🏃‍♂️</span> Try This Drill
          </div>
          <p className="text-white/65 text-[1.15rem] leading-relaxed font-medium">
            {tip.drill}
          </p>
        </div>

        <div className="mt-8 text-white/15 text-[0.75rem] font-bold uppercase tracking-[0.3em]">
          Running Tip of the Day
        </div>
      </div>

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
