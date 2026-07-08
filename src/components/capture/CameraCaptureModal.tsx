import { useCallback, useEffect, useRef, useState } from 'react'
import { X, Camera, ImageUp } from 'lucide-react'

interface CameraCaptureModalProps {
  /** Called with the captured JPEG. The modal closes itself afterwards. */
  onCapture: (blob: Blob) => void
  /** Fallback: user opted to pick a file instead (camera denied/unavailable). */
  onPickFile: () => void
  onClose: () => void
}

/**
 * Live camera capture for photo-first capture on web/desktop. On a Mac with an
 * iPhone nearby, Continuity Camera exposes the phone as a system camera device
 * ("iPhone Camera") — selecting it makes the phone the desktop's camera. On
 * mobile web this is simply the device camera.
 */
export function CameraCaptureModal({ onCapture, onPickFile, onClose }: CameraCaptureModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [deviceId, setDeviceId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

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
    void startStream(deviceId)
    return stopStream
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restart only when the chosen device changes
  }, [deviceId])

  const snap = useCallback(() => {
    const video = videoRef.current
    if (!video || !ready) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')?.drawImage(video, 0, 0)
    canvas.toBlob(
      (blob) => {
        stopStream()
        if (blob) onCapture(blob)
        else setError('Could not capture the frame')
      },
      'image/jpeg',
      0.85,
    )
  }, [ready, onCapture, stopStream])

  const close = useCallback(() => { stopStream(); onClose() }, [stopStream, onClose])

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4" onClick={close}>
      <div
        className="bg-neutral-900 rounded-2xl overflow-hidden shadow-2xl w-full max-w-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3">
          <h3 className="text-sm font-medium text-white">Snap a photo</h3>
          <button type="button" onClick={close} aria-label="Close camera" className="p-1.5 rounded-lg text-neutral-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error ? (
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
            <video ref={videoRef} playsInline muted className="w-full max-h-[60vh] bg-black object-contain" />
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
