import {useEffect,useState} from 'react'
import {supabase} from '@/lib/supabase'

/** Discover pilot access without opening a microphone or consuming a start. */
export function useWorkspaceVoiceAccess(accountId:string|null, enabled:boolean) {
 const [allowedAccount,setAllowedAccount]=useState<string|null>(null)
 useEffect(()=>{
  let cancelled=false
  setAllowedAccount(null)
  if(accountId&&enabled) {
   void (async()=>{
    try {
     const {data,error}=await supabase.functions.invoke('workspace-voice',{method:'GET'})
     if(import.meta.env.DEV&&error)console.warn('Workspace voice availability:',error.message)
     if(!cancelled&&!error&&data?.enabled===true)setAllowedAccount(accountId)
    } catch {/* Voice unavailable: typing remains available. */}
   })()
  }
  return ()=>{cancelled=true}
 },[accountId,enabled])
 return enabled&&!!accountId&&allowedAccount===accountId
}
