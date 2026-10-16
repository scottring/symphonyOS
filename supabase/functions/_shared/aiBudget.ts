// Text-only beta funding. Uncertain requests retain their hold; clients never
// supply usage to the ledger. Audio, images, PDFs and provider-hosted paid tools
// require their own bounded funding policy before this helper admits them.
type RpcDb = { rpc(name:string,args:Record<string,unknown>):PromiseLike<{data:unknown;error:unknown}> }
export type BudgetControl = { userId:string; db:RpcDb }
export function textBudget(init?:RequestInit):{input:number;output:number;model:string}|null {
  if(typeof init?.body!=='string') return null
  try {
    const body=JSON.parse(init.body)
    if(typeof body.model!=='string' || body.stream===true) return null
    const serialized=JSON.stringify(body)
    if(/"type"\s*:\s*"(?:image|image_url|input_image|document|input_audio|web_search[^" ]*|computer[^" ]*|bash[^" ]*|code_interpreter)[^"]*"/.test(serialized)) return null
    const output=body.max_tokens??body.max_output_tokens??body.max_completion_tokens??(body.model.startsWith('text-embedding-')?0:null)
    if(!Number.isSafeInteger(output)||output<0||output>1_000_000) return null
    // UTF-8 bytes exceed text token count; include protocol/schema overhead.
    const input=new TextEncoder().encode(serialized).length+4096
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
