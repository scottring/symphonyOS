import { useState, useEffect, useRef, useCallback } from 'react'

interface WallCameraViewProps {
  /** Start expanded instead of PiP */
  startExpanded?: boolean
}

export function WallCameraView({ startExpanded = false }: WallCameraViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [expanded, setExpanded] = useState(startExpanded)
  const [collapsed, setCollapsed] = useState(false)
  const [streamActive, setStreamActive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
        },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
      setStreamActive(true)
      setError(null)
    } catch (err) {
      console.error('[camera] Failed to access webcam:', err)
      setError('Camera unavailable')
      setStreamActive(false)
    }
  }, [])

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    setStreamActive(false)
  }, [])

  useEffect(() => {
    startCamera()
    return () => stopCamera()
  }, [startCamera, stopCamera])

  const toggleExpand = useCallback(() => {
    setExpanded(prev => !prev)
  }, [])

  // Collapsed: show just a small icon button
  if (collapsed) {
    return (
      <button
        className="fixed z-40 bottom-16 right-16 w-14 h-14 rounded-2xl bg-black/60 backdrop-blur-md
                   border border-white/15 flex items-center justify-center
                   text-white/50 hover:text-white hover:bg-black/70 transition-all shadow-2xl"
        onClick={() => setCollapsed(false)}
        style={{ touchAction: 'manipulation' }}
      >
        <span className="text-[1.4rem]">📷</span>
      </button>
    )
  }

  if (error) {
    return (
      <div
        className={`fixed z-40 rounded-2xl bg-black/80 border border-white/10 flex items-center justify-center
          ${expanded
            ? 'inset-10'
            : 'bottom-16 right-16 w-[240px] h-[180px]'
          }`}
      >
        <div className="text-center">
          <span className="text-[2rem]">📷</span>
          <p className="text-white/30 font-bold text-[0.8rem] mt-2">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Camera feed */}
      <div
        className={`fixed z-40 overflow-hidden cursor-pointer transition-all duration-300 ease-out
          ${expanded
            ? 'inset-10 rounded-3xl'
            : 'bottom-16 right-16 w-[240px] h-[180px] rounded-2xl hover:scale-105'
          }
          border border-white/15 shadow-2xl`}
        onClick={toggleExpand}
        style={{ touchAction: 'manipulation' }}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
          style={{ transform: 'scaleX(-1)' }}
        />

        {/* PiP: collapse and live label */}
        {!expanded && streamActive && (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); setCollapsed(true) }}
              className="absolute top-2 right-2 w-8 h-8 rounded-lg bg-black/60 backdrop-blur-sm
                         flex items-center justify-center text-white/50 hover:text-white
                         hover:bg-black/80 transition-all text-[0.8rem]"
            >
              ✕
            </button>
            <div className="absolute bottom-2 left-2 px-2 py-1 rounded-lg bg-black/60 backdrop-blur-sm">
              <span className="text-white/60 font-black text-[0.55rem] uppercase tracking-widest">
                Live
              </span>
            </div>
          </>
        )}

        {/* Expanded: close button */}
        {expanded && (
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(false) }}
            className="absolute top-6 right-6 w-14 h-14 rounded-2xl bg-black/50 backdrop-blur-md
                       border border-white/15 flex items-center justify-center
                       text-white/50 hover:text-white hover:bg-black/70 transition-all text-[1.5rem] z-50"
          >
            ✕
          </button>
        )}
      </div>

      {/* Expanded backdrop */}
      {expanded && (
        <div
          className="fixed inset-0 bg-black/60 z-30"
          onClick={() => setExpanded(false)}
        />
      )}
    </>
  )
}
