import type {useWorkspaceVoice} from '@/hooks/useWorkspaceVoice'
export function WorkspaceVoiceControls({voice}:{voice:ReturnType<typeof useWorkspaceVoice>}){
 return <section className="workspace-voice" aria-label="Voice conversation"><div>
 {voice.active?<><button onClick={voice.stop}>End voice</button>{voice.status!=='connecting'&&<button aria-pressed={voice.status==='muted'} onClick={voice.mute}>{voice.status==='muted'?'Unmute':'Mute'}</button>}</>:<button onClick={()=>void voice.start()}>Talk with Symphony</button>}
 <span role="status">{voice.status==='connecting'?'Connecting…':voice.status==='live'?'Listening':voice.status==='muted'?'Microphone muted':''}</span></div>
 {voice.error&&<p role="alert">{voice.error}</p>}
 {voice.active&&<div className="workspace-voice-transcript">{voice.heard&&<p><small>You</small>{voice.heard}</p>}{voice.reply&&<p><small>Symphony</small>{voice.reply}</p>}</div>}
 </section>
}
