// An exact clock must belong to this routine, not merely occur somewhere in a
// multi-routine story. Flexible cues stay in notes and never become a clock.
const words=(text:string)=>text.toLowerCase().match(/[a-z]+/g)??[]
const ignored=new Set(['the','a','an','to','at','on','for','my','our','i','we','me','you','and','routine','daily','weekly','every','morning','evening'])
function anchors(title:string){return words(title).filter(w=>!ignored.has(w)&&w.length>2).map(w=>w.replace(/(?:ing|s)$/,''))}
function clocks(text:string):string[]{
 const out:string[]=[]
 for(const m of text.matchAll(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\b/gi)){
  if(!m[2]&&!m[3])continue
  let h=Number(m[1]);const minute=Number(m[2]??0),period=m[3]?.toLowerCase()
  if(minute>59||h>23)continue
  if(period){if(h>12||h<1)continue;h=h%12+(period.startsWith('p')?12:0)}
  out.push(`${String(h).padStart(2,'0')}:${String(minute).padStart(2,'0')}`)
 }
 return out
}
export function routineTimeEvidenceError(rawOps:unknown,ops:readonly {op:string;title:string;time?:string}[],messages:readonly {role:string;content:unknown}[]):string|null {
 const userText=messages.filter(m=>m.role==='user'&&typeof m.content==='string').map(m=>String(m.content).toLowerCase().replace(/\s+/g,' '))
 const raw=Array.isArray(rawOps)?rawOps:[]
 for(let i=0;i<ops.length;i++){
  const op=ops[i];if(op.op!=='routine_add'||!op.time)continue
  const source=typeof raw[i]?.time_source==='string'?raw[i].time_source.toLowerCase().replace(/\s+/g,' ').trim():''
  const titleWords=anchors(op.title)
  // A quote is one short clause about THIS routine. It must be verbatim user
  // evidence and cannot combine separate sentences/activities to borrow a time.
  const sourceWords=anchors(source)
  const otherRoutine=ops.some((other,j)=>j!==i&&anchors(other.title).some(w=>sourceWords.includes(w)&&!titleWords.includes(w)))
  const ownMention=titleWords.some(w=>sourceWords.includes(w))
  if(!source||source.length>180||!userText.some(t=>t.includes(source))||!clocks(source).includes(op.time)||otherRoutine||(!ownMention&&ops.length>1))
   return `The exact time ${op.time} for "${op.title}" is not supported by a short verbatim clause about that routine. Do not borrow another activity's clock. Supply time_source quoting the person's clock for this routine, or leave time unset and keep flexible timing in note. Keep all other draft items and display choices.`
 }
 return null
}
