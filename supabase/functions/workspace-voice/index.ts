import {createClient} from 'https://esm.sh/@supabase/supabase-js@2'
import {handleWorkspaceVoice} from './handler.ts'
import {guardedAiFetch} from '../_shared/aiUsage.ts'
Deno.serve(req=>handleWorkspaceVoice(req,{
 env:key=>Deno.env.get(key),
 fetch:async (input,init)=>{
  const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:req.headers.get('Authorization')??''}}})
  // A realtime call reports no usage: the five-minute admission is charged as
  // an estimate at the model's per-minute price (ai_model_prices).
  return guardedAiFetch(db,'workspace-voice',fetch,{model:Deno.env.get('WORKSPACE_VOICE_MODEL')||'gpt-realtime-2.1',minutes:5})(input,init)
 },
 reserve:async authorization=>{
  const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:authorization}}})
  const {data,error}=await db.rpc('reserve_workspace_voice_start')
  if(error)throw new Error('Voice quota unavailable')
  return data===true
 },
 vocabulary:async authorization=>{
  const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:authorization}}})
  const [members,routines]=await Promise.all([db.from('family_members').select('name').limit(20),db.from('routines').select('name').eq('visibility','active').limit(20)])
  return [...(members.data??[]),...(routines.data??[])].map(r=>String((r as {name?:unknown}).name??''))
 },
 userId:async authorization=>{
  const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:authorization}}})
  const {data:{user},error}=await db.auth.getUser()
  return error?null:user?.id??null
 },
}))
