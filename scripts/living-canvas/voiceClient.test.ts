import {afterEach,describe,it,expect,vi} from 'vitest'
import {CanvasVoice} from './voiceClient'
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers()})
describe('voice lifecycle',()=>{
 it('stops a microphone granted after the person cancelled',async()=>{
  let resolve!:(s:unknown)=>void
  const stop=vi.fn();const status=vi.fn()
  vi.stubGlobal('navigator',{mediaDevices:{getUserMedia:()=>new Promise(r=>{resolve=r})}})
  const voice=new CanvasVoice({status,reply:vi.fn(),scene:vi.fn()})
  const pending=voice.start();voice.stop();resolve({getTracks:()=>[{stop}]});await pending
  expect(stop).toHaveBeenCalledOnce();expect(status).toHaveBeenCalledTimes(1)
 })
 it('reports denial without starting a network session',async()=>{
  const status=vi.fn(),fetch=vi.fn()
  vi.stubGlobal('navigator',{mediaDevices:{getUserMedia:()=>Promise.reject(new Error('Microphone denied'))}});vi.stubGlobal('fetch',fetch)
  await new CanvasVoice({status,reply:vi.fn(),scene:vi.fn()}).start()
  expect(status).toHaveBeenLastCalledWith('Microphone denied');expect(fetch).not.toHaveBeenCalled()
 })
 it('times out a pending permission request and releases a late stream',async()=>{
  vi.useFakeTimers();let resolve!:(s:unknown)=>void;const stop=vi.fn(),status=vi.fn()
  vi.stubGlobal('navigator',{mediaDevices:{getUserMedia:()=>new Promise(r=>{resolve=r})}})
  const pending=new CanvasVoice({status,reply:vi.fn(),scene:vi.fn()}).start()
  vi.advanceTimersByTime(30000);expect(status).toHaveBeenLastCalledWith('Voice connection timed out. Try again.')
  resolve({getTracks:()=>[{stop}]});await pending;expect(stop).toHaveBeenCalledOnce()
 })
})
