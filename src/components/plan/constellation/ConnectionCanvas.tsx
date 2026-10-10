import {useEffect,useLayoutEffect,useRef,useState,type ReactNode,type PointerEvent as ReactPointerEvent} from 'react'
import type {PlanNode} from './model'
import {branchKeys} from './model'
import {connectionPair} from './connections'

type Point={x:number;y:number}
type Drag={key:string;point:Point;origin:Point;pointerId:number;moved:boolean}
export function ConnectionCanvas({nodes,selected,disabled,onConnect,onPick,children}:{
 nodes:PlanNode[];selected:string|null;disabled:boolean;
 onConnect:(a:string,b:string)=>void;onPick:(node:PlanNode)=>void;
 children:(controls:{dragKey:string|null;targetKey:string|null;valid:(key:string)=>boolean;port:(node:PlanNode)=>ReactNode})=>ReactNode
}){
 const root=useRef<HTMLDivElement>(null),dragRef=useRef<Drag|null>(null)
 const [drag,setDrag]=useState<Drag|null>(null),[target,setTarget]=useState<string|null>(null),[lines,setLines]=useState<string[]>([])
 const latest=useRef({nodes,disabled,onConnect,onPick});latest.current={nodes,disabled,onConnect,onPick}
 const cancel=()=>{dragRef.current=null;setDrag(null);setTarget(null)}
 useEffect(()=>{
  const move=(e:PointerEvent)=>{
   const d=dragRef.current;if(!d||e.pointerId!==d.pointerId)return
   e.preventDefault()
   const hit=document.elementFromPoint(e.clientX,e.clientY)
   const region=hit?.closest<HTMLElement>('.hz-column-body')
   if(region){const r=region.getBoundingClientRect();if(e.clientY<r.top+35)region.scrollBy(0,-18);else if(e.clientY>r.bottom-35)region.scrollBy(0,18)}
   const key=hit?.closest<HTMLElement>('[data-plan-key]')?.dataset.planKey??null
   const source=Array.from(root.current?.querySelectorAll<HTMLElement>('[data-plan-key]')??[]).find(el=>el.dataset.planKey===d.key)?.querySelector('.hz-port')?.getBoundingClientRect()
   const origin=source?{x:source.left+source.width/2,y:source.top+source.height/2}:d.origin
   const next={...d,origin,point:{x:e.clientX,y:e.clientY},moved:d.moved||Math.hypot(e.clientX-d.origin.x,e.clientY-d.origin.y)>5}
   dragRef.current=next;setDrag(next)
   setTarget(key&&connectionPair(latest.current.nodes,d.key,key)?key:null)
  }
  const up=(e:PointerEvent)=>{
   const d=dragRef.current;if(!d||e.pointerId!==d.pointerId)return
   const key=document.elementFromPoint(e.clientX,e.clientY)?.closest<HTMLElement>('[data-plan-key]')?.dataset.planKey
   cancel()
   if(latest.current.disabled)return
   if(d.moved&&key&&connectionPair(latest.current.nodes,d.key,key))latest.current.onConnect(d.key,key)
   else if(!d.moved){const node=latest.current.nodes.find(n=>n.key===d.key);if(node)latest.current.onPick(node)}
  }
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape')cancel()}
  window.addEventListener('pointermove',move,{passive:false});window.addEventListener('pointerup',up)
  window.addEventListener('pointercancel',cancel);window.addEventListener('keydown',key);window.addEventListener('blur',cancel)
  return()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',cancel);window.removeEventListener('keydown',key);window.removeEventListener('blur',cancel)}
 },[])
 useEffect(()=>{if(disabled||(drag&&!nodes.some(n=>n.key===drag.key)))cancel()},[disabled,nodes.map(n=>n.key).join('|')])
 useLayoutEffect(()=>{
  const measure=()=>{
   if(drag){setLines([]);return}
   const related=branchKeys(nodes,selected)
   const elements=new Map(Array.from(root.current?.querySelectorAll<HTMLElement>('[data-plan-key]')??[]).map(el=>[el.dataset.planKey,el]))
   const rect=(key:string)=>{
    const el=elements.get(key);if(!el)return null
    const r=el.getBoundingClientRect(),clip=el.closest('.hz-column-body')?.getBoundingClientRect()
    const y=r.top+r.height/2
    return clip&&y>=Math.max(clip.top,0)&&y<=Math.min(clip.bottom,window.innerHeight)?r:null
   }
   const paths:string[]=[]
   for(const n of nodes){if(!n.parent||!related.has(n.key)||!related.has(n.parent))continue
    const a=rect(n.parent),b=rect(n.key);if(!a||!b)continue
    const x1=a.right-14,y1=a.top+a.height/2,x2=b.left,y2=b.top+b.height/2
    paths.push(`M ${x1} ${y1} C ${x1+28} ${y1}, ${x2-28} ${y2}, ${x2} ${y2}`)
   }
   setLines(paths)
  }
  measure()
  const observer=new ResizeObserver(measure);if(root.current)observer.observe(root.current);if(root.current?.parentElement)observer.observe(root.current.parentElement)
  let frame=requestAnimationFrame(()=>{measure();frame=requestAnimationFrame(measure)})
  window.addEventListener('scroll',measure,true);window.addEventListener('resize',measure)
  return()=>{cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('scroll',measure,true);window.removeEventListener('resize',measure)}
 },[nodes.map(n=>n.key+':'+n.parent).join('|'),selected,!!drag])
 const start=(e:ReactPointerEvent,node:PlanNode)=>{
  if(disabled||e.button!==0)return
  e.preventDefault();e.stopPropagation()
  const r=e.currentTarget.getBoundingClientRect()
  const d={key:node.key,point:{x:e.clientX,y:e.clientY},origin:{x:r.left+r.width/2,y:r.top+r.height/2},pointerId:e.pointerId,moved:false}
  dragRef.current=d;setDrag(d)
 }
 return <div ref={root} className={drag?'hz-connections is-linking':'hz-connections'}>
 {children({dragKey:drag?.key??null,targetKey:target,valid:key=>!!drag&&!!connectionPair(nodes,drag.key,key),port:node=><button type="button" className="hz-port" aria-label={`Connect ${node.title}`} title="Drag to a card in the next or previous horizon" disabled={disabled} onPointerDown={e=>start(e,node)} onClick={e=>{e.stopPropagation();if(e.detail===0)onPick(node)}}><span aria-hidden="true">○</span></button>})}
 <svg className="hz-wires" aria-hidden="true">{lines.map((d,i)=><path key={i} d={d}/>)}{drag&&<path className={target?'hz-wire-ready':'hz-wire-draft'} d={`M ${drag.origin.x} ${drag.origin.y} Q ${(drag.origin.x+drag.point.x)/2} ${drag.origin.y}, ${drag.point.x} ${drag.point.y}`}/>}</svg>
 {drag&&<div className="hz-link-hint" role="status">Drag to a highlighted card to connect. Escape to cancel.</div>}
 </div>
}
