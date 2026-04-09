import { useState, useEffect, useRef, useCallback } from 'react'

// ============================================================================
// WallCameraView — inline camera thumbnail with tap-to-expand
// Lives in the bottom widget strip as a small live feed; tapping opens a
// fullscreen overlay. No floating PiP.
// ============================================================================

export function WallCameraView() {
  const inlineVideoRef = useRef<HTMLVideoElement>(null)
  const expandedVideoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [streamActive, setStreamActive] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      if (inlineVideoRef.current) {
        inlineVideoRef.current.srcObject = stream
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

  // Attach the shared stream to the expanded video element whenever it mounts
  useEffect(() => {
    if (expanded && expandedVideoRef.current && streamRef.current) {
      expandedVideoRef.current.srcObject = streamRef.current
    }
  }, [expanded, streamActive])

  // Error state — inline label
  if (error) {
    return (
      <div className="h-full w-full flex items-center justify-center gap-2 px-2">
        <span className="text-[1.25rem] opacity-60">📷</span>
        <span className="text-white/30 font-black text-[0.55rem] uppercase tracking-wider leading-tight">
          {error}
        </span>
      </div>
    )
  }

  return (
    <>
      {/* Inline thumbnail — lives in parent flow */}
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="relative h-full w-full rounded-xl overflow-hidden bg-black/40 cursor-pointer border border-white/10 hover:border-white/20 transition-all"
        style={{ touchAction: 'manipulation' }}
        aria-label="Expand camera"
      >
        <video
          ref={inlineVideoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
          style={{ transform: 'scaleX(-1)' }}
        />
        {streamActive && (
          <div className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-sm flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-white/70 font-black text-[0.5rem] uppercase tracking-widest">
              Live
            </span>
          </div>
        )}
      </button>

      {/* Fullscreen expansion */}
      {expanded && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
          onClick={() => setExpanded(false)}
        >
          <video
            ref={expandedVideoRef}
            autoPlay
            playsInline
            muted
            className="max-w-full max-h-full object-contain"
            style={{ transform: 'scaleX(-1)' }}
          />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setExpanded(false)
            }}
            className="absolute top-8 right-8 w-14 h-14 rounded-2xl bg-black/50 backdrop-blur-md border border-white/20 flex items-center justify-center text-white/70 hover:text-white hover:bg-black/70 transition-all text-[1.5rem]"
            aria-label="Close camera"
          >
            ✕
          </button>
        </div>
      )}
    </>
  )
}
