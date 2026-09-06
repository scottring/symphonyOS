import { useCallback, useEffect, useRef, useState } from 'react'
import { X, Camera, ImageUp, RotateCw } from 'lucide-react'
import { PAGE_ALTITUDES, type PageAltitude } from '@/lib/planParse'

type Rotation = 0 | 90 | 180 | 270

/** Some cameras deliver rotated frames (upside-down USB mounts, Continuity
 *  Camera in odd orientations). Remember the correction per device. */
function loadRotation(deviceId: string | null): Rotation {
  if (!deviceId) return 0
  try {
    const v = Number(localStorage.getItem(`symphony.camera.rotation.${deviceId}`))
    return v === 90 || v === 180 || v === 270 ? (v as Rotation) : 0
  } catch { return 0 }
}

function saveRotation(deviceId: string | null, rotation: Rotation) {
  if (!deviceId) return
  try { localStorage.setItem(`symphony.camera.rotation.${deviceId}`, String(rotation)) } catch { /* ignore */ }
}

/** A rotation was only ever saved after a stream actually started on this
 *  machine — its presence means "this desktop has used the camera before,"
 *  worth auto-starting for again. */
function hasUsedCameraBefore(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      if (localStorage.key(i)?.startsWith('symphony.camera.rotation.')) return true
    }
  } catch { /* ignore */ }
  return false
}

/** No touch surface at all — a laptop/desktop, where "point the camera at
 *  the page" is an awkward ask and a file (photo already on disk, a scan) is
 *  the natural first move. */
function isDesktop(): boolean {
  return !('ontouchstart' in window) && !navigator.maxTouchPoints
}

interface CameraCaptureModalProps {
  /** Called with the captured JPEG. The modal closes itself afterwards. */
  onCapture: (blob: Blob) => void
  /** Fallback: user opted to pick a file instead (camera denied/unavailable). */
  onPickFile: () => void
  onClose: () => void
  /** Plan-from-paper: which page is being snapped. When given, a chip row
   *  under the title lets the user say so before the shutter — one tap, no
   *  extra step. Absent for plain photo capture. */
  altitude?: PageAltitude
  onAltitudeChange?: (altitude: PageAltitude) => void
}

/**
 * Live camera capture for photo-first capture on web/desktop. On a Mac with an
 * iPhone nearby, Continuity Camera exposes the phone as a system camera device
 * ("iPhone Camera") — selecting it makes the phone the desktop's camera. On
 * mobile web this is simply the device camera.
 */
export function CameraCaptureModal({ onCapture, onPickFile, onClose, altitude, onAltitudeChange }: CameraCaptureModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [deviceId, setDeviceId] = useState<string | null>(null)
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null)
  const [rotation, setRotation] = useState<Rotation>(0)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  // Desktop, first time: lead with "choose a file" instead of asking for
  // camera permission the visitor probably doesn't want to grant to point a
  // webcam at a piece of paper. A remembered rotation means this machine has
  // used the camera before — keep auto-starting for it, as always.
  const [showPicker, setShowPicker] = useState(() => isDesktop() && !hasUsedCameraBefore())

  const cycleRotation = useCallback(() => {
    setRotation((prev) => {
      const next = (((prev + 90) % 360) as Rotation)
      saveRotation(activeDeviceId, next)
      return next
    })
  }, [activeDeviceId])

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  const startStream = useCallback(async (id: string | null) => {
    stopStream()
    setReady(false)
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: id ? { deviceId: { exact: id } } : { facingMode: 'environment' },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      const currentId = stream.getVideoTracks()[0]?.getSettings().deviceId ?? null
      setActiveDeviceId(currentId)
      setRotation(loadRotation(currentId))
      setReady(true)

      // Labels are only populated after permission is granted.
      const all = await navigator.mediaDevices.enumerateDevices()
      const cams = all.filter((d) => d.kind === 'videoinput')
      setDevices(cams)
      // Prefer the iPhone (Continuity Camera) on first start.
      if (!id) {
        const iphone = cams.find((d) => /iphone/i.test(d.label))
        const current = stream.getVideoTracks()[0]?.getSettings().deviceId
        if (iphone && iphone.deviceId !== current) {
          setDeviceId(iphone.deviceId)
          return // effect below restarts with the iPhone
        }
      }
    } catch (e) {
      const name = e instanceof Error ? e.name : ''
      // Our own restart (device switch, unmount mid-request) aborts the
      // in-flight getUserMedia call — not a real failure, nothing to show.
      if (name === 'AbortError') return
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setError(
          'Camera access is blocked for Symphony. In Chrome, click the icon left of the address bar → Site settings → Camera → Allow, then reload. In the Mac app, allow Symphony under System Settings → Privacy & Security → Camera.',
        )
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        setError('No camera found. On a Mac, an unlocked iPhone nearby (same Apple ID, Wi-Fi and Bluetooth on) appears as a camera automatically.')
      } else {
        setError(e instanceof Error ? e.message : String(e))
      }
    }
  }, [stopStream])

  useEffect(() => {
    if (showPicker) return
    void startStream(deviceId)
    return stopStream
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restart only when the chosen device (or leaving the picker) changes
  }, [deviceId, showPicker])

  const useCamera = useCallback(() => setShowPicker(false), [])

  const snap = useCallback(() => {
    const video = videoRef.current
    if (!video || !ready) return
    const w = video.videoWidth
    const h = video.videoHeight
    const canvas = document.createElement('canvas')
    const sideways = rotation === 90 || rotation === 270
    canvas.width = sideways ? h : w
    canvas.height = sideways ? w : h
    const ctx = canvas.getContext('2d')
    if (ctx) {
      // Bake the user's rotation correction into the captured frame.
      ctx.translate(canvas.width / 2, canvas.height / 2)
      ctx.rotate((rotation * Math.PI) / 180)
      ctx.drawImage(video, -w / 2, -h / 2)
    }
    canvas.toBlob(
      (blob) => {
        stopStream()
        if (blob) onCapture(blob)
        else setError('Could not capture the frame')
      },
      'image/jpeg',
      0.85,
    )
  }, [ready, rotation, onCapture, stopStream])

  const close = useCallback(() => { stopStream(); onClose() }, [stopStream, onClose])

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4" onClick={close}>
      <div
        className="bg-neutral-900 rounded-2xl overflow-hidden shadow-2xl w-full max-w-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3">
          <h3 className="text-sm font-medium text-white">{altitude ? 'Snap your page' : 'Snap a photo'}</h3>
          <button type="button" onClick={close} aria-label="Close camera" className="p-1.5 rounded-lg text-neutral-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        {altitude && onAltitudeChange && (
          <div role="radiogroup" aria-label="Which page is this" className="flex items-center gap-1.5 px-4 pb-3">
            {PAGE_ALTITUDES.map((a) => {
              const on = a.id === altitude
              return (
                <button
                  key={a.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  title={a.hint}
                  onClick={() => onAltitudeChange(a.id)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${on ? 'bg-white text-neutral-900' : 'bg-white/10 text-neutral-300 hover:bg-white/20'}`}
                >
                  {a.label}
                </button>
              )
            })}
          </div>
        )}

        {showPicker ? (
          <div className="px-6 py-10 text-center space-y-4">
            <p className="text-sm text-neutral-300 leading-relaxed">
              Pick a photo or PDF of the page, or use a camera instead.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => { stopStream(); onPickFile() }}
                className="btn-primary px-4 py-2 rounded-lg text-sm inline-flex items-center gap-2"
              >
                <ImageUp className="w-4 h-4" /> Choose a file
              </button>
              <button
                type="button"
                onClick={useCamera}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 text-white text-sm hover:bg-white/20 transition-colors"
              >
                <Camera className="w-4 h-4" /> Use camera
              </button>
            </div>
          </div>
        ) : error ? (
          <div className="px-6 py-10 text-center space-y-4">
            <p className="text-sm text-neutral-300 text-left leading-relaxed">
              {error}
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => void startStream(deviceId)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-neutral-900 text-sm font-medium hover:bg-neutral-200 transition-colors"
              >
                <Camera className="w-4 h-4" /> Try again
              </button>
              <button
                type="button"
                onClick={() => { stopStream(); onPickFile() }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 text-white text-sm hover:bg-white/20 transition-colors"
              >
                <ImageUp className="w-4 h-4" /> Choose an image instead
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid place-items-center bg-black max-h-[60vh] overflow-hidden">
              <video
                ref={videoRef}
                playsInline
                muted
                className="w-full max-h-[60vh] object-contain"
                style={rotation ? { transform: `rotate(${rotation}deg)` } : undefined}
              />
            </div>
            <div className="flex items-center gap-3 px-4 py-3">
              {devices.length > 1 && (
                <select
                  value={deviceId ?? streamRef.current?.getVideoTracks()[0]?.getSettings().deviceId ?? ''}
                  onChange={(e) => setDeviceId(e.target.value)}
                  aria-label="Camera"
                  className="flex-1 min-w-0 text-xs bg-white/10 text-white rounded-lg px-2 py-1.5 focus:outline-none"
                >
                  {devices.map((d, i) => (
                    <option key={d.deviceId} value={d.deviceId} className="text-neutral-900">
                      {d.label || `Camera ${i + 1}`}
                    </option>
                  ))}
                </select>
              )}
              <button
                type="button"
                onClick={() => { stopStream(); onPickFile() }}
                className="text-xs text-neutral-400 hover:text-white transition-colors shrink-0"
              >
                choose a file
              </button>
              <button
                type="button"
                onClick={cycleRotation}
                aria-label="Rotate image"
                title="Image sideways or upside down? Rotate it — remembered for this camera"
                className="shrink-0 p-2 rounded-lg text-neutral-300 hover:text-white hover:bg-white/10 transition-colors"
              >
                <RotateCw className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={snap}
                disabled={!ready}
                aria-label="Take photo"
                className="ml-auto shrink-0 w-12 h-12 rounded-full bg-white grid place-items-center hover:bg-neutral-200 disabled:opacity-50 transition-colors"
              >
                <Camera className="w-5 h-5 text-neutral-900" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
