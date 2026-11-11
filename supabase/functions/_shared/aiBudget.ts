// Beta funding: text, Anthropic image blocks at their ceiling, PDF documents
// at a per-page ceiling, Anthropic's web search / web fetch at their declared
// per-request caps, streamed replies that report their usage, and the two
// audio models whose cost the caller states (speech per character, realtime
// per minute) within fixed caps. Uncertain requests retain their hold; clients
// never supply usage to the ledger. Other vendors' image formats, Files API
// documents, audio sent as input and other provider-hosted paid tools
// (computer use, bash, code execution) require their own bounded funding
// policy before this helper admits them.
import { pdfPageCount } from './pdfPages.ts'

type RpcDb = { rpc(name:string,args:Record<string,unknown>):PromiseLike<{data:unknown;error:unknown}> }
export type BudgetControl = { userId:string; db:RpcDb }
/** Most visual tokens one image can cost on any current Claude model. */
const IMAGE_TOKEN_CEILING=4_784
/** UTF-8 bytes per token that ordinary text and IDs stay above. */
const BYTES_PER_TOKEN_BOUND=2
/** Input tokens held for one search's results (dynamic filtering trims them;
 *  the settlement charges what actually came back). */
const SEARCH_RESULT_TOKENS=10_000
/** Hard caps a declared web tool may ask for before it is unbounded. */
const MAX_WEB_USES=10, MAX_FETCH_TOKENS=50_000
/** Input price, cents per million tokens, for the models that carry web tools. */
const INPUT_CENTS_PER_MILLION:Record<string,number>={'claude-sonnet-4-6':300,'claude-sonnet-5-5':200,'claude-opus-5-5':400,'claude-haiku-4-5':100}
/** Claude models whose context window is under 1M tokens. Every other Claude
 *  model is held at 1M, which is never less than its real window. */
const SMALL_CONTEXT:Record<string,number>={'claude-haiku-4-5':200_000}
/** Anthropic reads each PDF page twice: its extracted text ("typically
 *  1,500–3,000 tokens" a page, docs "PDF support", checked 2026-11-11) and an
 *  image of the page, priced like any image. Each page is held at 4,000 text
 *  tokens — a third above the documented top of the range, for dense pages —
 *  plus the image ceiling. A 10-page PDF on Sonnet holds about 33¢ and
 *  settles at what the reply reports. */
export const PDF_PAGE_TOKENS=4_000+IMAGE_TOKEN_CEILING
/** The largest PDF read to count its pages (the provider's own request cap
 *  for inline documents). */
export const MAX_PDF_BYTES=32*1024*1024
/** Audio whose reply carries no usage: the caller states the cost unit, the
 *  price row (ai_model_prices) prices it, and these caps bound it. Speech:
 *  characters spoken, at most the 4,096 the provider accepts in one request.
 *  Realtime: minutes, at most the five a voice session is offered
 *  (x-voice-max-seconds: 300, workspace-voice). */
const STATED_AUDIO:Record<string,{unit:'characters'|'minutes';max:number}>={
  'gpt-4o-mini-tts':{unit:'characters',max:4_096},
  'gpt-realtime':{unit:'minutes',max:5},
  'gpt-realtime-2.1':{unit:'minutes',max:5},
}

/** What a request may cost, as reserve_ai_budget prices it. */
export interface RequestBudget {
  model:string
  input:number
  output:number
  /** Realtime minutes (priced per minute); 0 for token-priced requests. */
  minutes:number
  /** What a held input token can cost at most: 1 with no prompt caching, 1.25
   *  with five-minute cache writes, 2 when a one-hour write is asked for. */
  inputMultiplier:number
  /** A streamed reply: usage is read from its events as it passes. */
  stream:boolean
  /** No usage comes back: the stated amount is what is charged. */
  stated:boolean
}
/** A PDF still to be measured: inline (base64) or at a URL. */
export type PdfSource = {data:string}|{url:string}

/** Web search bills $10 per 1,000 searches (pricing page, checked 2026-10-15).
 *  The ledger prices tokens, so the 1¢ fee is carried as the input tokens that
 *  cost 1¢ on this model — at $1/M (10,000) when the model is not listed. */
export function searchFeeTokens(model:string):number {
  return Math.ceil(1_000_000/(INPUT_CENTS_PER_MILLION[model]??100))
}
/** Tokens to hold for the server-side web tools a request declares, or null
 *  when a declared paid tool has no bound. */
function webToolTokens(tools:unknown,model:string):number|null {
  if(tools===undefined) return 0
  if(!Array.isArray(tools)) return null
  let tokens=0
  for(const t of tools) {
    const type=typeof (t as {type?:unknown})?.type==='string' ? (t as {type:string}).type : ''
    const uses=(t as {max_uses?:unknown}).max_uses
    const bounded=Number.isSafeInteger(uses) && (uses as number)>=1 && (uses as number)<=MAX_WEB_USES
    if(/^web_search_/.test(type)) { if(!bounded) return null; tokens+=(uses as number)*(SEARCH_RESULT_TOKENS+searchFeeTokens(model)) }
    else if(/^web_fetch_/.test(type)) {
      const cap=(t as {max_content_tokens?:unknown}).max_content_tokens
      if(!bounded || !Number.isSafeInteger(cap) || (cap as number)<1 || (cap as number)>MAX_FETCH_TOKENS) return null
      tokens+=(uses as number)*((cap as number)+1_000)
    }
    else if(/^(computer|bash|code_execution|code_interpreter|text_editor|memory)/.test(type)) return null
  }
  return tokens
}

/** The most an input token can cost relative to its base rate, from the
 *  request's own cache markers. Until 2026-11-11 the reservation always held
 *  2x — the one-hour write rate — though every cached caller asks for
 *  five-minute writes (1.25x): a cached assistant turn held 2x its input and,
 *  on 2026-10-31, was refused with 73¢ of a $3 day still unspent. */
function inputMultiplierOf(body:string):number {
  if(!/"cache_control"/.test(body)) return 1
  return /"ttl"\s*:\s*"1h"/.test(body) ? 2 : 1.25
}

function contextWindow(model:string):number|null {
  return model.startsWith('claude-') ? SMALL_CONTEXT[model]??1_000_000 : null
}
/** Most PDF pages one request may carry: 600, or 100 below a 1M window. */
function pdfPageLimit(model:string):number {
  return (contextWindow(model)??0)>=1_000_000 ? 600 : 100
}

/** The request's text, images and web tools priced, with any PDFs still to
 *  measure; null when the request cannot be bounded. */
export function textBudget(init?:RequestInit):(RequestBudget&{documents:PdfSource[];web:number})|null {
  if(typeof init?.body!=='string') return null
  try {
    const body=JSON.parse(init.body)
    if(typeof body.model!=='string') return null
    // A stream is funded like any request (the same max_tokens bound); its
    // usage arrives in its events. Anthropic always reports it; OpenAI only
    // when asked to.
    const stream=body.stream===true
    if(stream && !body.model.startsWith('claude-') && body.stream_options?.include_usage!==true) return null
    // An Anthropic image is downscaled to at most 4,784 visual tokens on every
    // current model (high-resolution tier, Claude 4.7+; the standard tier caps
    // at 1,568 — docs "Resolution and token cost", checked 2026-10-30). That
    // bound is model-independent, so each image is funded at it and its
    // base64 payload is not counted as text.
    let images=0, unpriceable=false
    const documents:PdfSource[]=[]
    const serialized=JSON.stringify(body,(key,value)=>{
      if(key==='tools') return value===undefined ? value : '[tools]'
      if(value && typeof value==='object') {
        const type=(value as {type?:unknown}).type
        if(type==='image') { images++; return '[image]' }
        // A server tool's result already in the conversation — a page read
        // earlier this turn (which may hold a PDF document block), or the code
        // run that filters search results — is plain input text by now: kept
        // at its full size, but not mistaken for a new document or tool.
        if(typeof type==='string' && type!=='tool_result' && /_tool_result$/.test(type)) return JSON.stringify(value)
        if(type==='document') {
          const source=(value as {source?:{type?:unknown;media_type?:unknown;data?:unknown;url?:unknown}}).source
          // A PDF is measured by its pages (PDF_PAGE_TOKENS), not its bytes.
          if(source?.type==='base64' && source.media_type==='application/pdf' && typeof source.data==='string') { documents.push({data:source.data}); return '[document]' }
          if(source?.type==='url' && typeof source.url==='string') { documents.push({url:source.url}); return '[document]' }
          // Plain-text and content documents are input text at their size.
          if(source?.type==='text' || source?.type==='content') return JSON.stringify(value)
          // A Files API reference (or anything else) has no size to read.
          unpriceable=true
          return '[document]'
        }
      }
      return value
    })
    if(unpriceable) return null
    if(/"type"\s*:\s*"(?:image|image_url|input_image|document|input_audio|computer[^" ]*|bash[^" ]*|code_interpreter)[^"]*"/.test(serialized)) return null
    const web=webToolTokens(body.tools,body.model)
    if(web===null) return null
    const toolText=body.tools===undefined ? 0 : new TextEncoder().encode(JSON.stringify(body.tools)).length
    const output=body.max_tokens??body.max_output_tokens??body.max_completion_tokens??(body.model.startsWith('text-embedding-')?0:null)
    if(!Number.isSafeInteger(output)||output<0||output>1_000_000) return null
    // Text runs about 3–4 UTF-8 bytes per token, and IDs and other dense
    // strings nearer 2, so half the byte count still bounds the tokens.
    // Holding one token per byte (until 2026-10-31) held about eight times a
    // cached chat's cost and refused replies with a quarter of the day's
    // allowance still unspent. Plus protocol/schema overhead.
    const textTokens=Math.ceil((new TextEncoder().encode(serialized).length+toolText)/BYTES_PER_TOKEN_BOUND)
    const input=textTokens+4096+images*IMAGE_TOKEN_CEILING+web
    return input<=4_000_000?{input,output,model:body.model,minutes:0,inputMultiplier:inputMultiplierOf(init.body),stream,stated:false,documents,web}:null
  } catch {return null}
}

/** Pages of a PDF source; null when they cannot be counted, 'unreadable'
 *  when the file itself cannot be had. URLs are fetched only from this
 *  project's own storage (where the app's attachments live). */
export async function pdfSourcePages(source:PdfSource,transport:typeof fetch=fetch):Promise<number|null|'unreadable'> {
  let bytes:Uint8Array
  if('data' in source) {
    if(source.data.length>Math.ceil(MAX_PDF_BYTES/3)*4) return 'unreadable'
    try { bytes=Uint8Array.from(atob(source.data),c=>c.charCodeAt(0)) } catch { return 'unreadable' }
  } else {
    const base=(globalThis as unknown as {Deno?:{env:{get(n:string):string|undefined}}}).Deno?.env.get('SUPABASE_URL')
    let url:URL
    try { url=new URL(source.url) } catch { return 'unreadable' }
    if(!base || url.origin!==new URL(base).origin || !url.pathname.startsWith('/storage/v1/object/')) return 'unreadable'
    try {
      const response=await transport(url.toString(),{signal:AbortSignal.timeout(15_000)})
      if(!response.ok||!response.body) return 'unreadable'
      if(Number(response.headers.get('content-length')??0)>MAX_PDF_BYTES) { await response.body.cancel().catch(()=>{}); return 'unreadable' }
      const reader=response.body.getReader(), parts:Uint8Array[]=[]
      let size=0
      for(;;) {
        const {value,done}=await reader.read()
        if(done) break
        size+=value.length
        if(size>MAX_PDF_BYTES) { await reader.cancel().catch(()=>{}); return 'unreadable' }
        parts.push(value)
      }
      bytes=new Uint8Array(size)
      let at=0
      for(const p of parts) { bytes.set(p,at); at+=p.length }
    } catch { return 'unreadable' }
  }
  return pdfPageCount(bytes)
}

/** The whole request priced, PDFs included; null when it cannot be bounded.
 *  A PDF whose pages cannot be counted is held at the most pages the provider
 *  accepts; one that cannot be read at all is refused. Input never exceeds
 *  the model's context window (a longer request is rejected, not billed),
 *  plus what declared web tools bring in. */
export async function requestBudget(init:RequestInit|undefined,pagesOf:(source:PdfSource)=>Promise<number|null|'unreadable'>=s=>pdfSourcePages(s)):Promise<RequestBudget|null> {
  const text=textBudget(init)
  if(!text) return null
  const {documents,web,...budget}=text
  if(!documents.length) return budget
  const limit=pdfPageLimit(budget.model)
  let pages=0
  for(const source of documents) {
    const counted=await pagesOf(source)
    if(counted==='unreadable') return null
    pages+=Math.min(counted??limit,limit)
  }
  let base=budget.input-web+pages*PDF_PAGE_TOKENS
  const window=contextWindow(budget.model)
  if(window!==null) base=Math.min(base,window)
  const input=base+web
  return input<=4_000_000 ? {...budget,input} : null
}

/** A caller's stated audio cost, checked against its model's unit and cap;
 *  null when the model or amount is not one this guard funds. */
export function statedBudget(estimate:{model:string;minutes?:number;inputTokens?:number;outputTokens?:number},init?:RequestInit):RequestBudget|null {
  const rule=STATED_AUDIO[estimate.model]
  if(!rule || (estimate.outputTokens??0)!==0) return null
  // A JSON body naming another model is not what was priced.
  if(typeof init?.body==='string') {
    try { const named=JSON.parse(init.body)?.model; if(typeof named==='string' && named!==estimate.model) return null } catch { return null }
  }
  const base={model:estimate.model,output:0,inputMultiplier:1,stream:false,stated:true}
  if(rule.unit==='characters') {
    const chars=estimate.inputTokens
    if(!Number.isSafeInteger(chars) || (chars as number)<1 || (chars as number)>rule.max || estimate.minutes) return null
    return {...base,input:chars as number,minutes:0}
  }
  const minutes=estimate.minutes
  if(typeof minutes!=='number' || !Number.isFinite(minutes) || minutes<=0 || minutes>rule.max || estimate.inputTokens) return null
  return {...base,input:0,minutes}
}

export async function serviceBudgetControl(userDb:{auth?:{getUser():PromiseLike<{data:{user:{id:string}|null};error?:unknown}>}},userId?:string):Promise<BudgetControl> {
  const env=(globalThis as unknown as {Deno?:{env:{get(n:string):string|undefined}}}).Deno?.env
  const url=env?.get('SUPABASE_URL'),key=env?.get('SUPABASE_SERVICE_ROLE_KEY')
  const id=userId??(await userDb.auth?.getUser())?.data.user?.id
  if(!url||!key||!id) throw new Error('Budget authority unavailable')
  return {userId:id,db:{async rpc(name,args){
    const response=await fetch(`${url}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(15_000)})
    // The status lets the caller tell a function the database does not have
    // yet (404, before a migration) from a failed call.
    return response.ok?{data:await response.json(),error:null}:{data:null,error:{status:response.status}}
  }}}
}
