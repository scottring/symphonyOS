import { useState, useEffect, useCallback } from 'react'

const MIN_INTERVAL = 30 * 60 * 1000
const MAX_INTERVAL = 90 * 60 * 1000

// ─── Animated SVG Puppy ───
// Golden retriever-ish pup with articulated legs, wagging tail, floppy ears

function PuppySVG({ isLooking, headTilt }: { isLooking: boolean; headTilt: number }) {
  return (
    <svg
      width="120"
      height="90"
      viewBox="0 0 120 90"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="drop-shadow-lg"
    >
      {/* Tail */}
      <g
        className={isLooking ? 'animate-[tailWagSlow_0.6s_ease-in-out_infinite]' : 'animate-[tailWag_0.25s_ease-in-out_infinite]'}
        style={{ transformOrigin: '20px 35px' }}
      >
        <path
          d="M20 35 C12 20, 5 18, 3 25"
          stroke="#D4923A"
          strokeWidth="5"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M4 25 C2 20, 1 15, 5 12"
          stroke="#E8A84C"
          strokeWidth="4"
          strokeLinecap="round"
          fill="none"
        />
      </g>

      {/* Body */}
      <ellipse cx="52" cy="40" rx="28" ry="18" fill="#D4923A" />
      <ellipse cx="52" cy="38" rx="24" ry="14" fill="#E8A84C" />
      {/* Belly highlight */}
      <ellipse cx="55" cy="46" rx="18" ry="8" fill="#F0C070" opacity="0.6" />

      {/* Back legs */}
      <g className={isLooking ? '' : 'animate-[backLegsRun_0.25s_ease-in-out_infinite]'} style={{ transformOrigin: '35px 52px' }}>
        <rect x="30" y="50" width="7" height="22" rx="3.5" fill="#C4832A" />
        <rect x="38" y="50" width="7" height="22" rx="3.5" fill="#D4923A" />
        {/* Back paws */}
        <ellipse cx="33" cy="73" rx="5" ry="3" fill="#C4832A" />
        <ellipse cx="41" cy="73" rx="5" ry="3" fill="#D4923A" />
      </g>

      {/* Front legs */}
      <g className={isLooking ? '' : 'animate-[frontLegsRun_0.25s_ease-in-out_infinite]'} style={{ transformOrigin: '68px 52px' }}>
        <rect x="63" y="50" width="7" height="24" rx="3.5" fill="#C4832A" />
        <rect x="71" y="50" width="7" height="24" rx="3.5" fill="#D4923A" />
        {/* Front paws */}
        <ellipse cx="66" cy="75" rx="5" ry="3" fill="#C4832A" />
        <ellipse cx="74" cy="75" rx="5" ry="3" fill="#D4923A" />
      </g>

      {/* Head group (tilts when looking) */}
      <g
        style={{
          transformOrigin: '82px 32px',
          transform: isLooking ? `rotate(${headTilt}deg)` : 'rotate(0deg)',
          transition: 'transform 0.3s ease-in-out',
        }}
      >
        {/* Neck */}
        <ellipse cx="75" cy="36" rx="10" ry="12" fill="#D4923A" />

        {/* Head */}
        <ellipse cx="90" cy="28" rx="16" ry="14" fill="#E8A84C" />

        {/* Ear left (floppy) */}
        <g className={isLooking ? 'animate-[earPerk_0.4s_ease-in-out_infinite_alternate]' : 'animate-[earFlop_0.25s_ease-in-out_infinite]'} style={{ transformOrigin: '82px 20px' }}>
          <ellipse cx="80" cy="18" rx="6" ry="10" fill="#C4832A" transform="rotate(-15, 80, 18)" />
        </g>

        {/* Ear right (floppy) */}
        <g className={isLooking ? 'animate-[earPerk_0.4s_ease-in-out_infinite_alternate-reverse]' : 'animate-[earFlop_0.25s_ease-in-out_infinite_reverse]'} style={{ transformOrigin: '98px 20px' }}>
          <ellipse cx="100" cy="18" rx="6" ry="10" fill="#C4832A" transform="rotate(15, 100, 18)" />
        </g>

        {/* Face */}
        {/* Snout */}
        <ellipse cx="102" cy="32" rx="10" ry="8" fill="#F0C070" />
        {/* Nose */}
        <ellipse cx="108" cy="30" rx="3.5" ry="2.5" fill="#3D2B1F" />
        {/* Nose shine */}
        <ellipse cx="109" cy="29" rx="1.2" ry="0.8" fill="#6B5040" />

        {/* Eyes */}
        {isLooking ? (
          <>
            {/* Looking at camera — big round eyes */}
            <circle cx="87" cy="25" r="3.5" fill="#3D2B1F" />
            <circle cx="97" cy="25" r="3.5" fill="#3D2B1F" />
            {/* Eye shine */}
            <circle cx="88" cy="24" r="1.2" fill="white" />
            <circle cx="98" cy="24" r="1.2" fill="white" />
            {/* Eyebrows (curious) */}
            <path d="M83 21 Q87 18, 91 21" stroke="#C4832A" strokeWidth="1.5" fill="none" />
            <path d="M93 21 Q97 18, 101 21" stroke="#C4832A" strokeWidth="1.5" fill="none" />
          </>
        ) : (
          <>
            {/* Running — squinty happy eyes */}
            <path d="M85 25 Q88 22, 91 25" stroke="#3D2B1F" strokeWidth="2" strokeLinecap="round" fill="none" />
            <path d="M95 25 Q98 22, 101 25" stroke="#3D2B1F" strokeWidth="2" strokeLinecap="round" fill="none" />
          </>
        )}

        {/* Tongue (hanging out when running) */}
        {!isLooking && (
          <g className="animate-[tongueFlap_0.5s_ease-in-out_infinite]" style={{ transformOrigin: '105px 34px' }}>
            <path
              d="M105 34 Q107 40, 104 44 Q101 42, 103 38"
              fill="#F27080"
            />
          </g>
        )}

        {/* Mouth (cute smile when looking) */}
        {isLooking && (
          <path d="M100 34 Q104 38, 108 34" stroke="#3D2B1F" strokeWidth="1.2" strokeLinecap="round" fill="none" />
        )}
      </g>

      {/* Body bounce when running */}
      {!isLooking && (
        <g className="animate-[bodyBounce_0.25s_ease-in-out_infinite]" style={{ transformOrigin: '52px 40px' }}>
          {/* Motion lines */}
          <line x1="15" y1="30" x2="8" y2="28" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.3" />
          <line x1="15" y1="38" x2="6" y2="38" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.25" />
          <line x1="15" y1="46" x2="8" y2="48" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.2" />
        </g>
      )}
    </svg>
  )
}

export function PuppyEasterEgg() {
  const [isRunning, setIsRunning] = useState(false)
  const [position, setPosition] = useState(-150)
  const [isLooking, setIsLooking] = useState(false)
  const [headTilt, setHeadTilt] = useState(0)
  const [direction, setDirection] = useState<1 | -1>(1)

  const triggerPuppy = useCallback(() => {
    const startRight = Math.random() > 0.5
    const startPos = startRight ? window.innerWidth + 150 : -150
    setDirection(startRight ? -1 : 1)
    setPosition(startPos)
    setIsRunning(true)
    setIsLooking(false)
    setHeadTilt(0)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).triggerPuppy = triggerPuppy
    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).triggerPuppy
    }
  }, [triggerPuppy])

  useEffect(() => {
    let timerId: NodeJS.Timeout

    const scheduleNext = () => {
      const nextInterval = Math.random() * (MAX_INTERVAL - MIN_INTERVAL) + MIN_INTERVAL
      timerId = setTimeout(() => {
        if (!isRunning) triggerPuppy()
        scheduleNext()
      }, nextInterval)
    }

    scheduleNext()
    return () => clearTimeout(timerId)
  }, [isRunning, triggerPuppy])

  useEffect(() => {
    if (!isRunning) return

    let moveInterval: NodeJS.Timeout
    let actionTimeout: NodeJS.Timeout
    const tiltTimers: NodeJS.Timeout[] = []

    const runLoop = () => {
      moveInterval = setInterval(() => {
        setPosition(prev => {
          const newPos = prev + (6 * direction)
          if ((direction === 1 && newPos > window.innerWidth + 150) ||
            (direction === -1 && newPos < -150)) {
            setIsRunning(false)
            clearInterval(moveInterval)
          }
          return newPos
        })
      }, 30)

      const nextStop = Math.random() * 3000 + 2000
      actionTimeout = setTimeout(() => {
        clearInterval(moveInterval)
        setIsLooking(true)

        tiltTimers.push(setTimeout(() => setHeadTilt(12), 400))
        tiltTimers.push(setTimeout(() => setHeadTilt(-12), 1200))
        tiltTimers.push(setTimeout(() => setHeadTilt(8), 2000))
        tiltTimers.push(setTimeout(() => setHeadTilt(0), 2600))

        tiltTimers.push(setTimeout(() => {
          setIsLooking(false)
          runLoop()
        }, 3000))
      }, nextStop)
    }

    runLoop()

    return () => {
      clearInterval(moveInterval)
      clearTimeout(actionTimeout)
      tiltTimers.forEach(clearTimeout)
    }
  }, [isRunning, direction])

  if (!isRunning) return null

  return (
    <div
      className="fixed bottom-2 z-[100] pointer-events-none"
      style={{
        left: 0,
        transform: `translateX(${position}px) scaleX(${direction === 1 ? -1 : 1})`,
        transition: 'none',
      }}
    >
      <div
        className={isLooking ? '' : 'animate-[puppyBob_0.25s_ease-in-out_infinite]'}
      >
        <PuppySVG isLooking={isLooking} headTilt={headTilt} />
      </div>
    </div>
  )
}
