import {parseCanvasCommand} from './voiceContract'
import type {Scene} from './model'
export type VoiceCallbacks={status:(s:string)=>void;reply:(s:string)=>void;scene:(s:Scene)=>void}
/** Local prototype only. The same-origin server holds the API key. */
export class CanvasVoice {
 private peer:RTCPeerConnection|null=null
 private stream:MediaStream|null=null
 private channel:RTCDataChannel|null=null
 private audio:HTMLAudioElement|null=null
 private generation=0
 private timer:ReturnType<typeof setTimeout>|undefined
 private abort:AbortController|null=null
 private callbacks:VoiceCallbacks
 constructor(callbacks:VoiceCallbacks){this.callbacks=callbacks}
 async start(){
  this.stop();const generation=this.generation
  this.callbacks.status('Connecting…')
  this.timer=setTimeout(()=>{this.stop();this.callbacks.status('Voice connection timed out. Try again.')},30000)
  try{
   const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}})
   if(generation!==this.generation){stream.getTracks().forEach(t=>t.stop());return}
   this.stream=stream;const peer=new RTCPeerConnection();this.peer=peer
   const audio=new Audio();audio.autoplay=true;this.audio=audio
   peer.ontrack=e=>{audio.srcObject=e.streams[0]}
   peer.onconnectionstatechange=()=>{if(peer.connectionState==='failed'||peer.connectionState==='disconnected'){this.stop();this.callbacks.status('Connection interrupted. Your sample plan is still here.')}}
   stream.getTracks().forEach(t=>peer.addTrack(t,stream))
   const channel=peer.createDataChannel('oai-events');this.channel=channel
   channel.onopen=()=>{this.callbacks.status('Voice connected');this.send({type:'response.create'})}
   channel.onmessage=e=>this.receive(e.data)
   await peer.setLocalDescription(await peer.createOffer())
   if(generation!==this.generation)return
   this.abort=new AbortController()
   const response=await fetch('/canvas-voice/session',{method:'POST',headers:{'Content-Type':'application/sdp'},body:peer.localDescription?.sdp,signal:this.abort.signal})
   if(generation!==this.generation)return
   if(!response.ok)throw new Error(response.status===503?'Voice server needs OPENAI_API_KEY configured.':'Voice connection failed. You can continue by text.')
   const sdp=await response.text();if(generation!==this.generation)return
   await peer.setRemoteDescription({type:'answer',sdp})
   if(generation!==this.generation)return
   clearTimeout(this.timer)
   this.timer=setTimeout(()=>{this.stop();this.callbacks.status('Five-minute rehearsal ended. Your sample plan is kept.')},300000)
  }catch(error){if(generation===this.generation){this.stop();this.callbacks.status(error instanceof Error?error.message:'Voice unavailable')}}
 }
 private send(event:unknown){if(this.channel?.readyState==='open')this.channel.send(JSON.stringify(event))}
 private receive(raw:string){
  let e;try{e=JSON.parse(raw)}catch{return}
  if(e.type==='response.output_audio_transcript.done'&&typeof e.transcript==='string')this.callbacks.reply(e.transcript)
  if(e.type==='error'){this.stop();this.callbacks.status('Voice reported an error. Your draft is kept.');return}
  if(e.type!=='response.function_call_arguments.done'||typeof e.call_id!=='string')return
  const scene=e.name==='show_canvas'&&typeof e.arguments==='string'?parseCanvasCommand(e.arguments):null
  if(scene)this.callbacks.scene(scene)
  this.send({type:'conversation.item.create',item:{type:'function_call_output',call_id:e.call_id,output:JSON.stringify({shown:!!scene})}})
  this.send({type:'response.create'})
 }
 stop(){this.generation++;this.abort?.abort();this.abort=null;clearTimeout(this.timer);this.timer=undefined;this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;this.channel?.close();this.channel=null;if(this.peer){this.peer.onconnectionstatechange=null;this.peer.close();this.peer=null}if(this.audio){this.audio.pause();this.audio.srcObject=null;this.audio=null}}
}
