import type {useWorkspaceVoice} from '@/hooks/useWorkspaceVoice'
/** Tap to talk: Talk opens the mic for your turn, Done sends it. */
export function WorkspaceVoiceControls({voice}:{voice:ReturnType<typeof useWorkspaceVoice>}){
 const listening=voice.status==='live'&&voice.turn==='listening'
 return <section className="workspace-voice" aria-label="Voice conversation"><div>
 {voice.active?<>
  {voice.status==='live'&&(listening?<button onClick={voice.done}>Done</button>:<button onClick={voice.talk}>Talk</button>)}
  <button onClick={voice.stop}>End voice</button>
 </>:<button onClick={()=>void voice.start()}>Talk with Symphony</button>}
 <span role="status">{voice.status==='connecting'?'Connecting…':listening?'Listening — take your time. Tap Done when you’re finished.':voice.status==='live'?'Tap Talk to say more':''}</span></div>
 {voice.error&&<p role="alert">{voice.error}</p>}
 {voice.active&&<div className="workspace-voice-transcript">{voice.heard&&<p><small>You</small>{voice.heard}</p>}{voice.reply&&<p><small>Symphony</small>{voice.reply}</p>}</div>}
 </section>
}
