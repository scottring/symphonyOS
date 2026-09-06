import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Loader2, Smartphone } from 'lucide-react'
import { usePaperHandoff } from '@/hooks/usePaperHandoff'
import { handoffUrl } from '@/lib/paperHandoff'

interface PhoneHandoffPanelProps {
  id: string
  /** Fires once, with the uploaded page's storage path. */
  onReceived: (storagePath: string) => void
  onBack: () => void
}

/**
 * The desktop half of "Use your phone": a QR code the phone scans, and a
 * waiting state that resolves when the phone's upload lands.
 */
export function PhoneHandoffPanel({ id, onReceived, onBack }: PhoneHandoffPanelProps) {
  const url = handoffUrl(window.location.origin, id)
  const { status, storagePath } = usePaperHandoff(id)
  const [qr, setQr] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' })
      .then((svg) => { if (live) setQr(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`) })
      .catch(() => { if (live) setQr(null) })
    return () => { live = false }
  }, [url])

  useEffect(() => {
    if (status === 'received' && storagePath) onReceived(storagePath)
  }, [status, storagePath, onReceived])

  return (
    <div className="px-6 py-6 flex flex-col items-center gap-4 text-center">
      {qr ? (
        <img src={qr} alt="QR code to open this page on your phone" className="w-52 h-52 rounded-lg bg-white p-2" />
      ) : (
        <div className="w-52 h-52 rounded-lg bg-white/10" aria-hidden />
      )}
      <div className="space-y-1">
        <p className="text-sm text-white inline-flex items-center gap-2">
          <Smartphone className="w-4 h-4" /> Point your phone&rsquo;s camera at the code
        </p>
        <p className="text-xs text-neutral-400 max-w-xs leading-relaxed">
          Take the photo there, signed in as you. It appears here as soon as it&rsquo;s sent.
        </p>
      </div>
      <p className="text-xs text-neutral-300 inline-flex items-center gap-2" role="status">
        {status === 'expired' ? (
          'This code has expired — go back and try again.'
        ) : (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Waiting for your phone…
          </>
        )}
      </p>
      <button
        type="button"
        onClick={onBack}
        className="text-xs text-neutral-400 hover:text-white transition-colors"
      >
        Back
      </button>
    </div>
  )
}
