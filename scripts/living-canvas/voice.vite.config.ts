import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import {canvasTool,voiceInstructions} from './voiceContract'
/** Explicit, loopback-only development server. Never part of production build. */
export default defineConfig({optimizeDeps:{entries:['scripts/living-canvas/index.html']},plugins:[react(),{name:'local-canvas-voice',configureServer(server){
 let lastStart=0
 server.middlewares.use('/canvas-voice/session',async(req,res)=>{
  const origin=req.headers.origin
  if(req.method!=='POST'||origin!=='http://127.0.0.1:5257'||req.headers.host!=='127.0.0.1:5257'){res.writeHead(403).end();return}
  const key=process.env.OPENAI_API_KEY
  if(!key){res.writeHead(503).end('voice_unconfigured');return}
  if(Date.now()-lastStart<30000){res.writeHead(429).end();return}
  if(req.headers['content-type']!=='application/sdp'){res.writeHead(415).end();return}
  let body=''
  try{
   for await(const chunk of req){body+=chunk;if(body.length>65536){res.writeHead(413).end();return}}
   if(!body.startsWith('v=0')){res.writeHead(400).end();return}
   lastStart=Date.now()
   const form=new FormData();form.set('sdp',body);form.set('session',JSON.stringify({type:'realtime',model:'gpt-realtime',instructions:voiceInstructions,tools:[canvasTool],audio:{output:{voice:'marin'},input:{turn_detection:{type:'semantic_vad',interrupt_response:true}}}}))
   const upstream=await fetch('https://api.openai.com/v1/realtime/calls',{method:'POST',headers:{Authorization:`Bearer ${key}`},body:form,signal:AbortSignal.timeout(20000)})
   if(!upstream.ok){res.writeHead(502).end('voice_unavailable');return}
   res.writeHead(200,{'Content-Type':'application/sdp','Cache-Control':'no-store'}).end(await upstream.text())
  }catch{res.writeHead(502).end('voice_unavailable')}
 })}}],server:{host:'127.0.0.1',port:5257,strictPort:true},define:{'import.meta.env.VITE_CANVAS_VOICE':'"1"'}})
