// src/components/learn/LearnVideoChip.tsx
//
// A small play button beside the page's "?" (Scott, 2026-10-17: just the
// play button, next to the help), for the short guide that belongs to this
// page (learnVideos.ts); its name and length are its label and tooltip.
// Playing it marks it seen, and the page moves on to its next guide or shows
// none. The shell says which page is showing; outside the shell nothing
// renders.

import { createContext, useContext, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Play, X } from 'lucide-react'
import { useDialogFocus } from '@/hooks/useDialogFocus'
import { markSeen, readSeen, videoForPage, videoSrc, type LearnVideo } from '@/lib/learn/learnVideos'

/** The page the shell is showing (workspaceContext's `page`). */
export const LearnPageContext = createContext<string | null>(null)

export function LearnVideoChip() {
  const page = useContext(LearnPageContext)
  const [seen, setSeen] = useState(readSeen)
  const [playing, setPlaying] = useState<LearnVideo | null>(null)
  const video = videoForPage(page, seen)

  const finish = (id: string) => {
    markSeen(id)
    setSeen((prev) => new Set(prev).add(id))
  }

  return (
    <>
      {video && (
        <button type="button" className="learn-cue" data-testid="learn-cue" onClick={() => { setPlaying(video); finish(video.id) }}
          aria-label={`Watch: ${video.title} (${video.seconds}s)`} title={`Watch: ${video.title} · ${video.seconds}s`}>
          <Play className="h-3 w-3" aria-hidden="true" />
        </button>
      )}
      {playing && <LearnVideoDialog video={playing} onClose={() => setPlaying(null)} />}
    </>
  )
}

/** The guide, playing; also opened from the Week page's ⋯ menu (WeekMenu). */
export function LearnVideoDialog({ video, onClose }: { video: LearnVideo; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useDialogFocus(true, ref, onClose)
  return createPortal(
    <>
      <div className="fixed inset-0 z-[70] bg-black/50" onClick={onClose} />
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="learn-video-title" className="learn-dialog">
        <div className="learn-dialog-head">
          <h2 id="learn-video-title" className="font-display text-lg text-neutral-900">{video.title}</h2>
          <button type="button" className="learn-cue-dismiss" aria-label="Close" onClick={onClose}>
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <video controls autoPlay playsInline poster={videoSrc(video.id, 'poster')} aria-label={video.title}>
          <source src={videoSrc(video.id, 'mp4')} type="video/mp4" />
          <track kind="captions" src={videoSrc(video.id, 'vtt')} srcLang="en" label="English" default />
        </video>
        <p className="learn-dialog-foot"><a href={`/learn/#${video.id}`}>All guides</a></p>
      </div>
    </>,
    document.body,
  )
}
