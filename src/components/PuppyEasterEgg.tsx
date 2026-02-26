import { useState, useEffect, useCallback } from 'react'

const MIN_INTERVAL = 15 * 60 * 1000
const MAX_INTERVAL = 20 * 60 * 1000

export function PuppyEasterEgg() {
  const [isRunning, setIsRunning] = useState(false)
  const [position, setPosition] = useState(-250)
  const [isLooking, setIsLooking] = useState(false)
  const [direction, setDirection] = useState<1 | -1>(1)

  const triggerPuppy = useCallback(() => {
    const startRight = Math.random() > 0.5
    const startPos = startRight ? window.innerWidth + 250 : -250
    setDirection(startRight ? -1 : 1)
    setPosition(startPos)
    setIsRunning(true)
    setIsLooking(false)
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
    const lookTimers: NodeJS.Timeout[] = []

    const runLoop = () => {
      moveInterval = setInterval(() => {
        setPosition(prev => {
          const newPos = prev + (4 * direction)
          if ((direction === 1 && newPos > window.innerWidth + 250) ||
            (direction === -1 && newPos < -250)) {
            setIsRunning(false)
            clearInterval(moveInterval)
          }
          return newPos
        })
      }, 30)

      const nextStop = Math.random() * 3000 + 2500
      actionTimeout = setTimeout(() => {
        clearInterval(moveInterval)
        setIsLooking(true)

        lookTimers.push(setTimeout(() => {
          setIsLooking(false)
          runLoop()
        }, 2500))
      }, nextStop)
    }

    runLoop()

    return () => {
      clearInterval(moveInterval)
      clearTimeout(actionTimeout)
      lookTimers.forEach(clearTimeout)
    }
  }, [isRunning, direction])

  if (!isRunning) return null

  // Sprite: 744x150, 4 frames @ 186px each
  const FRAME_W = 186
  const TOTAL_W = 744
  const FRAME_H = 150

  return (
    <div
      className="absolute z-[100] pointer-events-none"
      style={{
        bottom: 0,
        left: 0,
        transform: `translateX(${position}px) scaleX(${direction === 1 ? 1 : -1})`,
      }}
    >
      <div
        className="drop-shadow-[0_10px_10px_rgba(0,0,0,0.5)] origin-bottom"
        style={{
          width: `${FRAME_W}px`,
          height: `${FRAME_H}px`,
          backgroundImage: 'url(/puppy_sprite.png)',
          backgroundSize: `${TOTAL_W}px ${FRAME_H}px`,
          backgroundPosition: isLooking ? '0px 0px' : undefined,
          animation: isLooking ? 'none' : 'puppy-sprite-walk 0.6s steps(4) infinite',
        }}
      />
      <style dangerouslySetInnerHTML={{
        __html: `
        @keyframes puppy-sprite-walk {
           from { background-position: 0px 0px; }
           to { background-position: -${TOTAL_W}px 0px; }
        }
      `}} />
    </div>
  )
}

