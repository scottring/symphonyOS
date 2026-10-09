import {createClient} from 'https://esm.sh/@supabase/supabase-js@2'
import {handleWorkspaceVoice} from './handler.ts'
Deno.serve(req=>handleWorkspaceVoice(req,{
 env:key=>Deno.env.get(key),
 fetch,
 reserve:async authorization=>{
  const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:authorization}}})
  const {data,error}=await db.rpc('reserve_workspace_voice_start')
  if(error)throw new Error('Voice quota unavailable')
  return data===true
 },
 userId:async authorization=>{
  const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:authorization}}})
  const {data:{user},error}=await db.auth.getUser()
  return error?null:user?.id??null
 },
}))
