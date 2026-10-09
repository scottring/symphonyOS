import {useEffect,useRef,useState} from 'react'
import {ArrowLeft,ArrowRight,BookOpen,Phone,ShoppingBasket,Sun,MessageCircle} from 'lucide-react'
import './kiosk.css'

/** Household wall surface restored from the earlier design study; fictional data only. */
export function Kiosk(){
 const [screen,setScreen]=useState('Home'),[checked,setChecked]=useState<Record<string,boolean>>({})
 const title=useRef<HTMLHeadingElement>(null)
 const first=useRef(true)
 useEffect(()=>{if(first.current){first.current=false;return}title.current?.focus()},[screen])
 const toggle=(key:string)=>setChecked(v=>({...v,[key]:!v[key]}))
 const check=(label:string)=><label className="wk-check" key={label}><input type="checkbox" checked={!!checked[label]} onChange={()=>toggle(label)}/>{label}</label>
 return <section className="wk">
  <header className="wk-header"><div className="brand"><img src="/symphony-logo.png" alt="" width="40" height="40"/>SYMPHONY <small>OUR HOME</small></div><nav aria-label="Household tools"><button onClick={()=>setScreen('kidsPhone')}><Phone size={20}/>kidsPhone</button><button onClick={()=>setScreen('Groceries')}><ShoppingBasket size={20}/>Groceries</button><button onClick={()=>setScreen('Recipes')}><BookOpen size={20}/>Recipes</button></nav></header>
  {screen==='Home'?<div className="wk-home"><div className="wk-heading"><div><p className="eyebrow">MONDAY, OCTOBER 12 · SAMPLE DAY</p><h1 ref={title} tabIndex={-1}>Today at home</h1></div><div className="wk-weather"><Sun size={32}/><strong>64°</strong><span>4:45 PM<small>Shared household view</small></span></div></div>
  <div className="wk-main"><section className="wk-moment"><h2>The rest of today</h2>{[['5:15','Home from swimming','Sam & Jordan'],['6:30','Dinner','Everyone'],['7:15','Reading','Sam & Riley']].map(([time,title,who])=><div className="wk-event" key={time}><time>{time}</time><div>{title}<small>{who}</small></div></div>)}<div className="wk-question"><MessageCircle/><div>Which day works for our picnic?<small>From October’s family plan</small></div><button onClick={()=>setScreen('Family planning')}>Choose</button></div></section>
  <button className="wk-dinner" onClick={()=>setScreen('Recipes')}><span className="eyebrow">DINNER · 6:30 PM</span><div className="food-art large"><span>✳</span><span>◒</span><span>✳</span></div><h2>Tomato pasta & salad</h2><p>30 minutes · serves 4</p><span>Open recipe <ArrowRight size={20}/></span></button></div>
  <div className="wk-bottom">{['Sam','Riley'].map((name,i)=><button key={name} onClick={()=>setScreen(name)}><span className={'wk-avatar tone-'+i}>{name[0]}</span><div>{name}<small>{i?'Homework · reading':'Reading · pack swim bag'}</small></div><ArrowRight/></button>)}<button onClick={()=>setScreen('Family planning')}><MessageCircle/><div>Plan tomorrow<small>Family conversation</small></div></button></div></div>
  :<div className="wk-takeover"><button onClick={()=>setScreen('Home')}><ArrowLeft/>Back to home</button><h1 ref={title} tabIndex={-1}>{screen==='Recipes'?'Tomato pasta & salad':screen}</h1>
  {screen==='Recipes'?<><p>30 minutes · serves 4 · sample recipe</p><div className="wk-cooking"><section><h2>Ingredients</h2>{['Pasta','Cherry tomatoes','Olive oil','Basil','Salad leaves'].map(check)}</section><section><h2>Method</h2><ol><li>Cook the pasta according to the packet.</li><li>Warm the tomatoes in olive oil until softened.</li><li>Toss with pasta and basil. Serve with dressed leaves.</li></ol></section></div><button onClick={()=>{setChecked(v=>('Need basil' in v?v:{...v,'Need basil':false}));setScreen('Groceries')}}>Add basil to groceries</button></>
  :screen==='Groceries'?<section>{['Milk','Bread',...('Need basil' in checked?['Need basil']:[])].map(check)}</section>
  :screen==='Sam'||screen==='Riley'?<section><p>Today’s routine</p>{(screen==='Sam'?['Sam: reading','Sam: pack swim bag']:['Riley: homework','Riley: reading']).map(check)}</section>
  :screen==='kidsPhone'?<p>The connected household phone belongs here. This preview does not place calls.</p>
  :<><p>Which day works for our picnic?</p><p>Conversation preview only. Live voice and saving to the family plan are not connected in this study.</p></>}
  </div>}
 </section>
}
