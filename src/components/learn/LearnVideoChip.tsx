// src/components/learn/LearnVideoChip.tsx
//
// A quiet "Watch · 22s" under a page's title, for the short guide that
// belongs to this page (learnVideos.ts). Playing it or pressing × marks it
// seen, and the page moves on to its next guide or shows none. The shell
// says which page is showing; outside the shell nothing renders.

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
        <div className="learn-cue" data-testid="learn-cue">
          <button type="button" className="learn-cue-play" onClick={() => { setPlaying(video); finish(video.id) }}>
            <Play className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Watch: {video.title}</span>
            <span className="learn-cue-time">{video.seconds}s</span>
          </button>
          <button type="button" className="learn-cue-dismiss" aria-label={`Hide “${video.title}”`} title="Hide" onClick={() => finish(video.id)}>
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      )}
      {playing && <LearnVideoDialog video={playing} onClose={() => setPlaying(null)} />}
    </>
  )
}

function LearnVideoDialog({ video, onClose }: { video: LearnVideo; onClose: () => void }) {
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
