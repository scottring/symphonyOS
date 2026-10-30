// Beta funding: text, Anthropic image blocks at their ceiling, and Anthropic's
// web search / web fetch at their declared per-request caps. Uncertain requests
// retain their hold; clients never supply usage to the ledger. Audio, PDFs sent
// as input, other vendors' image formats and other provider-hosted paid tools
// (computer use, bash, code execution) require their own bounded funding
// policy before this helper admits them.
type RpcDb = { rpc(name:string,args:Record<string,unknown>):PromiseLike<{data:unknown;error:unknown}> }
export type BudgetControl = { userId:string; db:RpcDb }
/** Most visual tokens one image can cost on any current Claude model. */
const IMAGE_TOKEN_CEILING=4_784
/** Input tokens held for one search's results (dynamic filtering trims them;
 *  the settlement charges what actually came back). */
const SEARCH_RESULT_TOKENS=10_000
/** Hard caps a declared web tool may ask for before it is unbounded. */
const MAX_WEB_USES=10, MAX_FETCH_TOKENS=50_000
/** Input price, cents per million tokens, for the models that carry web tools. */
const INPUT_CENTS_PER_MILLION:Record<string,number>={'claude-sonnet-4-6':300,'claude-opus-5-5':400,'claude-haiku-4-5':100}
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
export function textBudget(init?:RequestInit):{input:number;output:number;model:string}|null {
  if(typeof init?.body!=='string') return null
  try {
    const body=JSON.parse(init.body)
    if(typeof body.model!=='string' || body.stream===true) return null
    // An Anthropic image is downscaled to at most 4,784 visual tokens on every
    // current model (high-resolution tier, Claude 4.7+; the standard tier caps
    // at 1,568 — docs "Resolution and token cost", checked 2026-10-30). That
    // bound is model-independent, so each image is funded at it and its
    // base64 payload is not counted as text.
    let images=0
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
      }
      return value
    })
    if(/"type"\s*:\s*"(?:image|image_url|input_image|document|input_audio|computer[^" ]*|bash[^" ]*|code_interpreter)[^"]*"/.test(serialized)) return null
    const web=webToolTokens(body.tools,body.model)
    if(web===null) return null
    const toolText=body.tools===undefined ? 0 : new TextEncoder().encode(JSON.stringify(body.tools)).length
    const output=body.max_tokens??body.max_output_tokens??body.max_completion_tokens??(body.model.startsWith('text-embedding-')?0:null)
    if(!Number.isSafeInteger(output)||output<0||output>1_000_000) return null
    // UTF-8 bytes exceed text token count; include protocol/schema overhead.
    const input=new TextEncoder().encode(serialized).length+toolText+4096+images*IMAGE_TOKEN_CEILING+web
    return input<=4_000_000?{input,output,model:body.model}:null
  } catch {return null}
}
export async function serviceBudgetControl(userDb:{auth?:{getUser():PromiseLike<{data:{user:{id:string}|null};error?:unknown}>}},userId?:string):Promise<BudgetControl> {
  const env=(globalThis as unknown as {Deno?:{env:{get(n:string):string|undefined}}}).Deno?.env
  const url=env?.get('SUPABASE_URL'),key=env?.get('SUPABASE_SERVICE_ROLE_KEY')
  const id=userId??(await userDb.auth?.getUser())?.data.user?.id
  if(!url||!key||!id) throw new Error('Budget authority unavailable')
  return {userId:id,db:{async rpc(name,args){
    const response=await fetch(`${url}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(15_000)})
    return response.ok?{data:await response.json(),error:null}:{data:null,error:true}
  }}}
}
