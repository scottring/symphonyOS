import {useEffect, useRef, useState} from 'react'
import {createPortal} from 'react-dom'
import {Film, X} from 'lucide-react'
import examples from '@/lib/onboarding/horizonExamples.json'
import videos from '@/lib/onboarding/horizonVideos.json'

export type HorizonVideoId = keyof typeof videos
const duration = (seconds:number) => `${Math.floor(Math.round(seconds)/60)}:${String(Math.round(seconds)%60).padStart(2,'0')}`

/** Optional, static teaching media. Watching never advances setup or writes plan data. */
export function HorizonVideoButton({horizon}:{horizon:HorizonVideoId}) {
  const [open,setOpen]=useState(false)
  const clip=videos[horizon]
  return <>
    <button type="button" className="horizon-film-button" onClick={()=>setOpen(true)}
      aria-label={`Watch the ${clip.name} example (${duration(clip.seconds)})`}
      title={`Watch an example · ${duration(clip.seconds)}`}>
      <Film size={20} strokeWidth={1.7} aria-hidden="true"/>
    </button>
    {open&&<HorizonVideo horizon={horizon} onClose={()=>setOpen(false)}/>}
  </>
}

function HorizonVideo({horizon,onClose}:{horizon:HorizonVideoId;onClose:()=>void}) {
  const clip=videos[horizon]
  const example=examples.find(e=>e.id===horizon)!
  const dialog=useRef<HTMLDialogElement>(null)
  const video=useRef<HTMLVideoElement>(null)
  const [failed,setFailed]=useState(false)
  const [reducedMotion]=useState(()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false)
  useEffect(()=>{
    const previousFocus=document.activeElement instanceof HTMLElement?document.activeElement:null
    const modal=dialog.current
    const media=video.current
    modal?.showModal()
    return ()=>{media?.pause();modal?.close();previousFocus?.focus()}
  },[])
  return createPortal(<dialog ref={dialog} className="horizon-video-dialog" aria-labelledby={`horizon-video-title-${horizon}`}
    onCancel={event=>{event.preventDefault();onClose()}}
    onClick={event=>{if(event.target===event.currentTarget)onClose()}}>
    <div className="horizon-video-content">
      <header className="horizon-video-heading">
        <div><h2 id={`horizon-video-title-${horizon}`}>{clip.name}: an example</h2><p>{example.title} · {duration(clip.seconds)}</p></div>
        <button type="button" className="horizon-video-close" onClick={onClose} aria-label="Close video"><X size={22} aria-hidden="true"/></button>
      </header>
      <video ref={video} controls playsInline preload="metadata" autoPlay={!reducedMotion} poster={clip.poster}
        aria-label={`${clip.name} animated example`} onError={()=>setFailed(true)}>
        <source src={clip.video} type="video/mp4"/>
        <track kind="captions" src={clip.captions} srcLang="en" label="English" default/>
        Your browser cannot play this video. You can read the transcript below.
      </video>
      <div className="horizon-video-notes">
        {failed&&<p role="alert">The video couldn’t load. You can read the example below or close it and try again.</p>}
        <p>Illustrative example, narrated with Symphony’s AI voice. Nothing here is added to your plans.</p>
        <details open={failed||undefined}><summary>Read the transcript</summary>
          {example.narration.map((paragraph,i)=><p key={i}>{paragraph}</p>)}
        </details>
      </div>
    </div>
  </dialog>,document.body)
}
