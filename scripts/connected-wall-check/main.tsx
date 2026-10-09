import React from 'react'
import {createRoot} from 'react-dom/client'
import {ConnectedWall} from '../../src/components/wall-v2/moments/ConnectedWall'
import type {WallMomentsProps} from '../../src/components/wall-v2/moments/WallMoments'
import type {FamilyMember} from '../../src/types/family'
import '../../src/index.css'
const members=[{id:'a',name:'Taylor',initials:'T'},{id:'b',name:'Sam',initials:'S'}] as FamilyMember[]
function Check(){
 const [dark,setDark]=React.useState(true)
 const [moment,setMoment]=React.useState<WallMomentsProps['moment']>('dinner')
 const [have,setHave]=React.useState(new Set<number>())
 const [done,setDone]=React.useState(false)
 const [message,setMessage]=React.useState('')
 const props:WallMomentsProps={
  moment,dateLabel:'Friday, October 9',clock:'5:30 PM',weather:null,members,kids:[members[1]],
  actions:<><button onClick={()=>setMessage('Phone action received')}>kidsPhone</button><button onClick={()=>setMessage('Groceries action received')}>Groceries</button><button onClick={()=>setMessage('Recipes action received')}>Recipes</button></>,
  today:Array.from({length:7},(_,i)=>({id:String(i),kind:'event',time:`${i+9}:00`,end:null,title:['School drop-off','A walk outside','Lunch with Jordan','Pick up library books','Soccer practice','Dinner at home','Read together'][i],sub:null,owners:['b'],past:i<4,now:i===4})),
  specials:[],comingUp:[{dateKey:'2026-10-10',dayLabel:'Sat',summary:'Family picnic at the park'}],kidsNow:[],focusRows:[],handoffs:[],nextMeal:null,
  dinner:{title:'Lemon & herb pasta',imageUrl:null,minutes:25,cue:'Dinner at 6:30',ingredients:['Pasta','Lemon','Fresh parsley','Olive oil','Parmesan','Black pepper'],hasRecipe:true,scale:1,onScale:n=>setMessage(`Scale ${n}`),onCook:()=>setMessage('Recipe action received'),have,onToggleHave:i=>setHave(prev=>{const next=new Set(prev);if(next.has(i))next.delete(i);else next.add(i);return next}),onAddMissing:()=>setMessage('Shopping action received')},
  scratchpad:{rows:[{key:'one',text:'Remember the picnic blanket',sub:'Taylor · Today',icon:'note',authorId:'a'}],onOpen:()=>setMessage('Note action received')},question:{text:'What would you like to do this weekend?',isHandoff:false},checklists:[{member:members[1],list:{title:'Evening',rows:[{entityType:'routine',id:'r',title:'Pack tomorrow’s bag',done,timeOfDay:null,target:null}]}}],
  onTapRow:id=>setMessage(`Open ${id}`),onClaim:()=>{},onTapQuestion:()=>setMessage('Question action received'),onTick:()=>setDone(v=>!v),onOpenKid:()=>setMessage('Child day action received'),
 }
 return <div className={dark ? 'dark' : ''} style={{background:dark?'#262019':'#F8F3E9',color:dark?'#EFE7D8':'#3D362C'}}><div style={{height:40,display:'flex',gap:20,padding:8}}>TEST DATA · no saves <button onClick={()=>setDark(v=>!v)}>{dark?'Light view':'Dark view'}</button><select aria-label="Moment" value={moment} onChange={e=>setMoment(e.target.value as typeof moment)}>{['morning','after','dinner','evening'].map(m=><option key={m}>{m}</option>)}</select><span role="status">{message}</span></div><div style={{height:'calc(100dvh - 40px)'}}><ConnectedWall {...props} isDark={dark}/></div></div>
}
createRoot(document.getElementById('root')!).render(<Check/> )
