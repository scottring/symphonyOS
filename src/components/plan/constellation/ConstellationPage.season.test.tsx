// Season: "What do I want to accomplish this season?" (2026-10-12). The same
// harness as ConstellationPage.test.tsx, plus the session plumbing (signed-in
// person, planned record) and period-aware period selection, so the season
// before and the season on screen hold different goals.
import {render,screen,fireEvent,waitFor,within} from '@testing-library/react'
import {MemoryRouter,Routes,Route,useLocation} from 'react-router-dom'
import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest'
import {ConstellationPage} from './ConstellationPage'

const api=vi.hoisted(()=>({addGoal:vi.fn(),updateGoal:vi.fn(),deleteGoal:vi.fn(),addTask:vi.fn(),updateTask:vi.fn(),refetch:vi.fn(),pushTask:vi.fn(),setBucket:vi.fn(),updateTasksBulk:vi.fn(),toggleTask:vi.fn(),deleteTask:vi.fn(),keepForward:vi.fn(),dropCommitment:vi.fn(),tasks:[] as any[],goals:[] as any[]}))
const activity=vi.hoisted(()=>({calls:[] as {label:string;ok:boolean;opts:any}[],proposals:[] as any[],setProposalState:vi.fn(),removeProposal:vi.fn()}))
const launcher=vi.hoisted(()=>({openAssistant:vi.fn()}))
const env=vi.hoisted(()=>({userId:'me',seasons:null as any,planned:null as null|{at:Date;authorId:string;notes:any},save:vi.fn()}))
const FOUR=[{name:'Spring',month:3,day:1},{name:'Summer',month:6,day:1},{name:'Fall',month:9,day:1},{name:'Winter',month:12,day:1}]
// A household's own seasons, not the calendar's.
const OWN=[{name:'Thaw',month:2,day:20},{name:'Bloom',month:5,day:10},{name:'Harvest',month:8,day:15},{name:'Hearth',month:11,day:1}]

vi.mock('@/contexts/GoalsContext',()=>({GoalsProvider:({children}:any)=>children,useGoalsContext:()=>({goals:api.goals,loading:false,...api})}))
vi.mock('@/contexts/CanvasActivityContext',()=>({
 useCanvasActivity:()=>({proposals:activity.proposals,setProposalState:activity.setProposalState,removeProposal:activity.removeProposal,
  run:async(label:string,cmd:()=>Promise<unknown>,opts:any)=>{let ok=false;try{ok=(await cmd())!==false}catch{ok=false};activity.calls.push({label,ok,opts});return ok}}),
 useArrived:()=>false,
}))
vi.mock('@/contexts/AssistantLaunchContext',()=>({useAssistantLauncher:()=>launcher}))
vi.mock('@/hooks/useSupabaseTasks',()=>({useSupabaseTasks:()=>({tasks:api.tasks,loading:false,error:null,...api})}))
vi.mock('@/hooks/useDomain',()=>({useDomain:()=>({layers:[],soleDomain:'personal'})}))
vi.mock('@/hooks/useAssigneeFilter',()=>({useAssigneeFilter:()=>[[]]}))
vi.mock('@/hooks/useFamilyMembers',()=>({useFamilyMembers:()=>({getCurrentUserMember:()=>null})}))
vi.mock('@/hooks/useHouseholdSeasons',()=>({useHouseholdSeasons:()=>({seasons:env.seasons})}))
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>({user:env.userId?{id:env.userId}:null})}))
vi.mock('@/hooks/usePlanningSession',async(importOriginal)=>({...await importOriginal<any>(),
 usePlanningSession:(_h:string,token:string)=>({saved:token?env.planned:null,mine:null,loading:false,loadedToken:token||null,error:null,reload:()=>{},save:env.save})}))
// Privacy and area filtering: a row marked `hidden` is one this reader may not see.
vi.mock('@/lib/today/domainFilter',()=>({filterTasksForLayers:(t:any[])=>t.filter(x=>!x.hidden),matchesLayers:(ctx:any)=>ctx!=='hidden'}))
vi.mock('@/lib/planning/peopleLens',()=>({planPeopleLens:()=>({keep:()=>true,scopeId:null})}))
vi.mock('../v2/AddArea',()=>({useAddArea:()=>({area:'personal',picker:null})}))
// A row is on the seasons its `on` list names (season starts), else on the current one.
const ymd=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
vi.mock('@/lib/planning/periodPage',async(importOriginal)=>({...await importOriginal<any>(),
 selectPeriodTasks:(tasks:any[],level:string,start:Date,isCurrent:boolean)=>tasks.filter(t=>t.bucket===(level==='season'?'quarter':'month')&&(t.on?t.on.includes(ymd(start)):isCurrent))}))
vi.mock('@/lib/placement/model',async(importOriginal)=>({...await importOriginal<any>(),committedTo:(t:any)=>t.bucket==='week'?{}:undefined}))
vi.mock('@/components/domain/DomainGate',()=>({useDomainGate:()=>({requireDomain:vi.fn().mockResolvedValue('personal')})}))

const GOALS=[{id:'g',name:'Together',year:2026,status:'active',context:'personal'},{id:'other',name:'Health',year:2026,status:'active',context:'personal'}]
const SUMMER=new Date(2026,5,1),FALL=new Date(2026,8,1)
const summerGoal=(id:string,title:string,extra:any={})=>({id,title,bucket:'quarter',on:['2026-06-01'],commitments:[{level:'season',periodStart:SUMMER,status:'open'}],...extra})
function Where(){const l=useLocation();return <output data-testid="where">{l.pathname+l.search}</output>}
const tree=(url:string)=><MemoryRouter initialEntries={[url]}><Routes>
 {['/year','/season','/month'].map(p=><Route key={p} path={p} element={<><ConstellationPage/><Where/></>}/>)}
 <Route path="/week" element={<p>Week page</p>}/>
</Routes></MemoryRouter>
const open=(url='/season?view=constellation&horizon=1&start=2026-10-09')=>render(tree(url))
const season=(extra='')=>open('/season?view=constellation&horizon=1&start=2026-10-09'+extra)
const list=(name='Fall goals')=>screen.getByRole('list',{name})
const titles=(name='Fall goals')=>within(list(name)).queryAllByRole('listitem').map(li=>li.querySelector('.plan-item-title')?.textContent)
const card=(title:string)=>screen.getByRole('region',{name:`Under ${title}`})
const source=()=>document.getElementById('plan-season-source')!
const bar=()=>screen.getByRole('region',{name:/^Planning /})
const lastRun=()=>activity.calls[activity.calls.length-1]
const stepNames=()=>within(bar()).getAllByRole('button').filter(b=>b.querySelector('b')).map(b=>b.textContent)
const stepBtn=(text:string)=>within(bar()).getAllByRole('button').find(b=>b.textContent===text)!
const currentStep=()=>within(bar()).getAllByRole('button').find(b=>b.getAttribute('aria-current')==='step')?.textContent

beforeEach(()=>{
 vi.clearAllMocks();vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date(2026,9,11,9))
 api.tasks=[];api.goals=GOALS.map(g=>({...g}));activity.calls=[];activity.proposals=[]
 env.userId='me';env.seasons=FOUR;env.planned=null;env.save.mockResolvedValue(true)
 localStorage.clear()
 HTMLElement.prototype.scrollIntoView=vi.fn()
 api.updateTask.mockImplementation(async(id:string,patch:any)=>{api.tasks=api.tasks.map(t=>t.id===id?{...t,...patch}:t);return true})
 api.addTask.mockResolvedValue('new');api.addGoal.mockResolvedValue({id:'new'});api.updateGoal.mockResolvedValue(true);api.toggleTask.mockResolvedValue(true)
})
afterEach(()=>{vi.useRealTimers()})

describe('Season: one complete collection with the year goals beside it',()=>{
 const mixed=()=>{api.tasks=[{id:'a',title:'Unhurried weekends',bucket:'quarter',goalId:'g'},{id:'b',title:'Autumn outings',bucket:'quarter',goalId:'g'},{id:'c',title:'Fix the gate',bucket:'quarter'},{id:'r',title:'Run a 10k',bucket:'quarter',goalId:'other'}]}
 it('asks what the season is for, for the season and year on screen',()=>{
  season()
  expect(screen.getByRole('heading',{level:1})).toHaveTextContent('Fall 2026')
  expect(screen.getByRole('heading',{name:'What do you want to accomplish in Fall?'})).toBeInTheDocument()
  expect(screen.getByText('Build your season from your 2026 goals, and add anything else that matters.')).toBeInTheDocument()
  expect(screen.getByRole('heading',{name:'2026 goals'})).toBeInTheDocument()
  // The horizon switch still goes back to Year; the arrows still step seasons.
  expect(screen.getByRole('button',{name:'Year'})).toBeInTheDocument()
  expect(screen.getByRole('button',{name:'Season'})).toHaveAttribute('aria-current','step')
  expect(screen.getByRole('button',{name:'Previous season'})).toBeInTheDocument()
 })
 it('keeps every season goal, linked or on its own, with the year goals shown or hidden, without writing',()=>{
  mixed();season()
  const all=['Unhurried weekends','Autumn outings','Fix the gate','Run a 10k']
  expect(titles()).toEqual(all)
  expect(within(list()).getByText('Unhurried weekends').closest('li')).toHaveTextContent('2026 goal Together')
  expect(within(list()).getByText('Fix the gate').closest('li')!.querySelector('.plan-item-parent')).toBeNull()
  expect(within(card('Together')).getByText('2 Fall goals')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'Hide 2026 goals'}))
  expect(source()).not.toBeVisible()
  expect(titles()).toEqual(all)
  fireEvent.click(screen.getByRole('button',{name:'Show 2026 goals'}))
  expect(source()).toBeVisible()
  expect(titles()).toEqual(all)
  expect(api.updateTask).not.toHaveBeenCalled();expect(api.addTask).not.toHaveBeenCalled()
 })
 it('remembers hidden year goals for this viewer, apart from Month’s season goals',()=>{
  season()
  fireEvent.click(screen.getByRole('button',{name:'Hide 2026 goals'}))
  expect(localStorage.getItem('symphony.season.yearGoalsShown')).toBe('0')
  expect(localStorage.getItem('symphony.month.seasonGoalsShown')).toBeNull()
 })
 it('selecting a year goal highlights and previews its season goals, hides none, and Esc clears',()=>{
  mixed();season()
  fireEvent.click(within(card('Together')).getByRole('button',{name:'Together'}))
  expect(screen.getByTestId('where').textContent).toContain('focus=0%3Ag')
  expect(titles()).toEqual(['Unhurried weekends','Autumn outings','Fix the gate','Run a 10k'])
  expect(within(list()).getByText('Autumn outings').closest('li')).toHaveClass('is-related')
  expect(within(list()).getByText('Fix the gate').closest('li')).not.toHaveClass('is-related')
  expect(within(list()).getByText('Run a 10k').closest('li')).not.toHaveClass('is-related')
  // The preview is the same records, listed in the card.
  expect(within(screen.getByRole('list',{name:'Fall goals under Together'})).getAllByRole('listitem').map(li=>li.textContent)).toEqual(['Unhurried weekends','Autumn outings'])
  expect(screen.getByText(/^Highlighting/)).toHaveTextContent('Highlighting 2 Fall goals for Together')
  fireEvent.keyDown(window,{key:'Escape'})
  expect(screen.getByTestId('where').textContent).not.toContain('focus=')
  expect(within(list()).getByText('Autumn outings').closest('li')).not.toHaveClass('is-related')
 })
 it('a goal arriving from Year’s “See its season goals” opens with its year goal selected',()=>{
  mixed();season('&focus=0:other')
  expect(within(list()).getByText('Run a 10k').closest('li')).toHaveClass('is-related')
  expect(titles()).toHaveLength(4)
 })
 it('adds a season goal under a year goal in one write, and a failed save keeps the wording',async()=>{
  api.addTask.mockResolvedValueOnce(undefined)
  season()
  fireEvent.click(screen.getByRole('button',{name:'Add a Fall goal under Health'}))
  expect(screen.getByTestId('where').textContent).toContain('focus=0%3Aother')
  fireEvent.change(screen.getByLabelText('New Fall goal under Health'),{target:{value:'Walk daily'}})
  fireEvent.click(screen.getByRole('button',{name:'Add'}))
  await screen.findByText(/Didn’t save\. Your wording is still here/)
  expect(screen.getByLabelText('New Fall goal under Health')).toHaveValue('Walk daily')
  expect(lastRun().ok).toBe(false)
  expect(typeof lastRun().opts.retry).toBe('function')
  fireEvent.click(screen.getByRole('button',{name:'Add'}))
  await waitFor(()=>expect(screen.queryByLabelText('New Fall goal under Health')).not.toBeInTheDocument())
  expect(api.addTask).toHaveBeenCalledTimes(2)
  expect(api.addTask).toHaveBeenLastCalledWith('Walk daily',undefined,undefined,undefined,expect.objectContaining({bucket:'quarter',goalId:'other',seasonStart:FALL,context:'personal'}))
  expect(lastRun()).toMatchObject({label:'Add “Walk daily” under “Health”',ok:true})
 })
 it('adds a season goal of its own, and an empty one is never saved',async()=>{
  season()
  expect(screen.getByText('Nothing for Fall yet. Add one from a 2026 goal, or one of its own below.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'Add a Fall goal of its own'}))
  fireEvent.change(screen.getByLabelText('New Fall goal'),{target:{value:'   '}})
  expect(screen.getByRole('button',{name:'Add'})).toBeDisabled()
  fireEvent.change(screen.getByLabelText('New Fall goal'),{target:{value:'Fix the gate'}})
  fireEvent.click(screen.getByRole('button',{name:'Add'}))
  await waitFor(()=>expect(api.addTask).toHaveBeenCalledTimes(1))
  expect(api.addTask.mock.calls[0][4]).toMatchObject({bucket:'quarter',seasonStart:FALL,context:'personal'})
  expect(api.addTask.mock.calls[0][4].goalId).toBeUndefined()
 })
 it('links and unlinks with Move under, keeping one record and updating its label and the card',async()=>{
  api.tasks=[{id:'s',title:'Fix the gate',bucket:'quarter'}]
  const {rerender}=season()
  expect(within(card('Together')).getByText('Nothing for Fall yet')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'Actions for Fix the gate'}));fireEvent.click(screen.getByText('Move under…'))
  fireEvent.click(screen.getByRole('menuitemradio',{name:'Together'}))
  await waitFor(()=>expect(api.updateTask).toHaveBeenCalledWith('s',{goalId:'g'}))
  await waitFor(()=>expect(within(list()).getByText('Fix the gate').closest('li')).toHaveTextContent('2026 goal Together'))
  expect(within(list()).getByText('Fix the gate').closest('li')).toHaveClass('is-linked')
  expect(card('Together')).toHaveClass('is-linked')
  expect(within(card('Together')).getByText('1 Fall goal')).toBeInTheDocument()
  expect(screen.getAllByText('Fix the gate')).toHaveLength(1)
  // Undo restores the link it replaced.
  expect(lastRun().label).toBe('Move “Fix the gate” under “Together”')
  // Selecting the card previews the same record (one row in the list, one line in the card).
  fireEvent.click(within(card('Together')).getByRole('button',{name:'Together'}))
  expect(within(screen.getByRole('list',{name:'Fall goals under Together'})).getByText('Fix the gate')).toBeInTheDocument()
  expect(titles()).toEqual(['Fix the gate'])
  // Unlink: still in the collection, no label, the card empties.
  fireEvent.click(screen.getByRole('button',{name:'Actions for Fix the gate'}));fireEvent.click(screen.getByText('Move under…'))
  fireEvent.click(screen.getByRole('menuitemradio',{name:/No parent/}))
  await waitFor(()=>expect(api.updateTask).toHaveBeenLastCalledWith('s',{goalId:undefined}))
  rerender(tree('/season?view=constellation&horizon=1&start=2026-10-09'))
  await waitFor(()=>expect(within(list()).getByText('Fix the gate').closest('li')!.querySelector('.plan-item-parent')).toBeNull())
  expect(titles()).toEqual(['Fix the gate'])
  expect(within(card('Together')).getByText('Nothing for Fall yet')).toBeInTheDocument()
  await lastRun().opts.undo()
  expect(api.updateTask).toHaveBeenLastCalledWith('s',{goalId:'g'})
 })
 it('drag onto a year goal links it',async()=>{
  api.tasks=[{id:'s',title:'Fix the gate',bucket:'quarter'}]
  season()
  fireEvent.dragStart(screen.getByText('Fix the gate').closest('li')!,{dataTransfer:{setData:vi.fn(),effectAllowed:''}})
  expect(card('Health')).toHaveClass('is-drop-ok')
  fireEvent.dragOver(card('Health'));fireEvent.drop(card('Health'))
  await waitFor(()=>expect(api.updateTask).toHaveBeenCalledWith('s',{goalId:'other'}))
 })
 it('completes and edits a goal without a session, through the activity',async()=>{
  api.tasks=[{id:'s',title:'Fix the gate',bucket:'quarter',goalId:'g'}]
  season()
  fireEvent.click(screen.getByRole('button',{name:'Actions for Fix the gate'}));fireEvent.click(screen.getByText('Edit wording'))
  fireEvent.change(screen.getByLabelText('Wording for Fix the gate'),{target:{value:'Fix the side gate'}})
  fireEvent.click(screen.getByRole('button',{name:'Save'}))
  await waitFor(()=>expect(api.updateTask).toHaveBeenCalledWith('s',{title:'Fix the side gate'}))
  expect(typeof lastRun().opts.undo).toBe('function')
 })
 it('counts and previews only what this reader may see, the same records as the list',()=>{
  api.goals=[...GOALS,{id:'secret',name:'Private year goal',year:2026,status:'active',context:'hidden'}]
  api.tasks=[{id:'a',title:'Unhurried weekends',bucket:'quarter',goalId:'g'},{id:'x',title:'Their surprise',bucket:'quarter',goalId:'g',hidden:true}]
  season('&focus=0:g')
  expect(titles()).toEqual(['Unhurried weekends'])
  expect(within(card('Together')).getByText('1 Fall goal')).toBeInTheDocument()
  expect(within(screen.getByRole('list',{name:'Fall goals under Together'})).getAllByRole('listitem')).toHaveLength(1)
  expect(screen.queryByText('Their surprise')).toBeNull()
  expect(screen.queryByText('Private year goal')).toBeNull()
  expect(screen.getByText(/^Highlighting/)).toHaveTextContent('Highlighting 1 Fall goal for Together')
 })
 it('with no year goals, offers goals of their own or year goals first',()=>{
  api.goals=[]
  season()
  expect(screen.getByText(/No 2026 goals yet\./)).toBeInTheDocument()
  expect(screen.getByRole('button',{name:'Add a Fall goal of its own'})).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'Add 2026 goals'}))
  expect(screen.getByRole('button',{name:'Year'})).toHaveAttribute('aria-current','step')
 })
 it('a half-written goal under a year goal survives hiding and showing the year goals',()=>{
  season()
  fireEvent.click(screen.getByRole('button',{name:'Add a Fall goal under Together'}))
  fireEvent.change(screen.getByLabelText('New Fall goal under Together'),{target:{value:'Weekly date'}})
  fireEvent.click(screen.getByRole('button',{name:'Hide 2026 goals'}))
  fireEvent.click(screen.getByRole('button',{name:'Show 2026 goals'}))
  expect(screen.getByLabelText('New Fall goal under Together')).toHaveValue('Weekly date')
 })
 it('names the season from the household’s own seasons, not the calendar’s',async()=>{
  env.seasons=OWN
  api.tasks=[summerGoal('p1','Plant the beds',{on:['2026-05-10'],commitments:[{level:'season',periodStart:new Date(2026,4,10),status:'open'}]})]
  season()
  expect(screen.getByRole('heading',{level:1})).toHaveTextContent('Harvest 2026')
  expect(screen.getByRole('heading',{name:'What do you want to accomplish in Harvest?'})).toBeInTheDocument()
  expect(screen.getByRole('button',{name:'Add a Harvest goal under Together'})).toBeInTheDocument()
  expect(screen.queryByText(/Fall/)).toBeNull()
  fireEvent.click(screen.getByRole('button',{name:'Plan Harvest'}))
  expect(stepNames()).toEqual(['1Look back at Bloom','2Your 2026 goals','3Write Harvest'])
  fireEvent.click(screen.getByRole('button',{name:'Carry to Harvest'}))
  await waitFor(()=>expect(api.keepForward).toHaveBeenCalledWith('p1',{seasonStart:new Date(2026,7,15)},new Date(2026,4,10)))
  fireEvent.click(screen.getByRole('button',{name:'Add a Harvest goal of its own'}))
  fireEvent.change(screen.getByLabelText('New Harvest goal'),{target:{value:'Can tomatoes'}})
  fireEvent.click(screen.getByRole('button',{name:'Add'}))
  await waitFor(()=>expect(api.addTask).toHaveBeenCalledWith('Can tomatoes',undefined,undefined,undefined,expect.objectContaining({seasonStart:new Date(2026,7,15)})))
 })
 it('goes on to plan a month from these goals, for the season on screen',()=>{
  api.tasks=[{id:'s',title:'Fix the gate',bucket:'quarter'}]
  const {unmount}=season()
  expect(screen.getByRole('link',{name:'Plan a month from these goals →'})).toHaveAttribute('href','/month?view=constellation&horizon=2')
  unmount()
  api.tasks=[{id:'s',title:'Ski trip',bucket:'quarter',on:['2026-12-01']}]
  open('/season?view=constellation&horizon=1&start=2026-12-01')
  const href=screen.getByRole('link',{name:'Plan a month from these goals →'}).getAttribute('href')!
  expect(href).toMatch(/^\/month\?/)
  const p=new URLSearchParams(href.split('?')[1])
  expect(p.get('horizon')).toBe('2');expect(p.get('start')).toBe('2026-12-01')
 })
 it('keeps suggestions on the board: a suggested goal keeps through the one create path, a suggested link moves the existing goal',async()=>{
  api.tasks=[{id:'s',title:'Fix the gate',bucket:'quarter'}]
  activity.proposals=[{key:'p1',title:'Visit Mom',level:1,parentId:'g',state:'proposed'},{key:'p2',title:'Fix the gate',level:1,parentId:'other',itemId:'s',state:'proposed'},{key:'p3',title:'Not now',level:2,state:'proposed'}]
  season()
  expect(within(list()).getByText('Visit Mom').closest('li')).toHaveTextContent('2026 goal Together')
  expect(screen.queryByText('Not now')).toBeNull()
  fireEvent.click(screen.getByRole('button',{name:'Keep Visit Mom'}))
  await waitFor(()=>expect(activity.removeProposal).toHaveBeenCalledWith('p1'))
  expect(api.addTask).toHaveBeenCalledWith('Visit Mom',undefined,undefined,undefined,expect.objectContaining({bucket:'quarter',goalId:'g'}))
  fireEvent.click(screen.getByRole('button',{name:'Link Fix the gate'}))
  await waitFor(()=>expect(api.updateTask).toHaveBeenCalledWith('s',{goalId:'other'}))
  expect(api.addTask).toHaveBeenCalledTimes(1)
 })
})

describe('Season: an optional planning session over the same board',()=>{
 const withSummer=()=>{
  api.tasks=[
   {id:'f',title:'Unhurried weekends',bucket:'quarter',goalId:'g'},
   summerGoal('p1','Paint the porch'),summerGoal('p2','Swim lessons'),summerGoal('p3','Sort the garage'),
   summerGoal('d',"Finished already",{completed:true}),
  ]
  api.keepForward.mockImplementation(async(id:string,period:any,from:Date)=>{
   api.tasks=api.tasks.map(t=>t.id!==id?t:{...t,on:[...t.on,ymd(period.seasonStart)],commitments:[{level:'season',periodStart:from,status:'carried'},{level:'season',periodStart:period.seasonStart,status:'open'}]})
   return id
  })
 }
 it('is offered, never required: the board works without it',()=>{
  season()
  expect(screen.queryByRole('region',{name:/^Planning /})).toBeNull()
  expect(screen.getByRole('button',{name:'Plan Fall'})).toBeInTheDocument()
  expect(screen.getByRole('button',{name:'Add a Fall goal of its own'})).toBeEnabled()
 })
 it('runs in order — look back, the year goals, write — with the collection anchored and the source changing per step',()=>{
  withSummer();season()
  fireEvent.click(screen.getByRole('button',{name:'Plan Fall'}))
  expect(stepNames()).toEqual(['1Look back at Summer','2Your 2026 goals','3Write Fall'])
  expect(currentStep()).toBe('1Look back at Summer')
  expect(within(bar()).getByText(/carry it into Fall, mark it done, or leave it in Summer\. Nothing moves on its own\./)).toBeInTheDocument()
  expect(within(source()).getByRole('heading',{name:'Summer goals'})).toBeInTheDocument()
  expect(within(source()).getByRole('list',{name:'2026 goals',hidden:true})).not.toBeVisible()
  expect(titles()).toEqual(['Unhurried weekends'])
  fireEvent.click(within(bar()).getByRole('button',{name:'Next: Your 2026 goals →'}))
  expect(currentStep()).toBe('2Your 2026 goals')
  expect(within(source()).queryByRole('heading',{name:'Summer goals'})).toBeNull()
  expect(within(source()).getByRole('list',{name:'2026 goals'})).toBeVisible()
  expect(titles()).toEqual(['Unhurried weekends'])
  fireEvent.click(within(bar()).getByRole('button',{name:'Next: Write Fall →'}))
  expect(currentStep()).toBe('3Write Fall')
  expect(screen.getByLabelText('New Fall goal')).toBeInTheDocument()
  expect(within(bar()).getByRole('button',{name:'Mark Fall planned'})).toBeInTheDocument()
  // Revisit a step, by Back or by its number.
  fireEvent.click(within(bar()).getByRole('button',{name:'← Back'}))
  expect(currentStep()).toBe('2Your 2026 goals')
  fireEvent.click(stepBtn('1Look back at Summer'))
  expect(currentStep()).toBe('1Look back at Summer')
  expect(api.keepForward).not.toHaveBeenCalled()
 })
 it('a session step shows a hidden source for the visit, without changing the preference',()=>{
  withSummer();season()
  fireEvent.click(screen.getByRole('button',{name:'Hide 2026 goals'}))
  fireEvent.click(screen.getByRole('button',{name:'Plan Fall'}))
  expect(source()).toBeVisible()
  expect(localStorage.getItem('symphony.season.yearGoalsShown')).toBe('0')
 })
 it('looks back deliberately: carrying uses keepForward and Summer keeps its record; nothing carries on its own',async()=>{
  withSummer();season()
  fireEvent.click(screen.getByRole('button',{name:'Plan Fall'}))
  const past=screen.getByRole('list',{name:'Summer goals to look back at'})
  expect(within(past).getAllByRole('region').map(r=>r.getAttribute('aria-label'))).toEqual(['Paint the porch','Swim lessons','Sort the garage','Finished already'])
  expect(within(screen.getByRole('region',{name:'Finished already'})).getByText('Done')).toBeInTheDocument()
  expect(api.keepForward).not.toHaveBeenCalled();expect(api.updateTask).not.toHaveBeenCalled();expect(api.toggleTask).not.toHaveBeenCalled();expect(api.dropCommitment).not.toHaveBeenCalled()
  expect(titles()).toEqual(['Unhurried weekends'])

  fireEvent.click(within(screen.getByRole('region',{name:'Paint the porch'})).getByRole('button',{name:'Carry to Fall'}))
  await waitFor(()=>expect(api.keepForward).toHaveBeenCalledWith('p1',{seasonStart:FALL},SUMMER))
  expect(lastRun().label).toBe('Carry “Paint the porch” to Fall')
  // The same record now in Fall's collection, and still on Summer's, as carried.
  await waitFor(()=>expect(titles()).toEqual(['Unhurried weekends','Paint the porch']))
  expect(within(screen.getByRole('region',{name:'Paint the porch'})).getByText('Carried to Fall')).toBeInTheDocument()
  expect(within(screen.getByRole('region',{name:'Paint the porch'})).queryByRole('button',{name:'Carry to Fall'})).toBeNull()

  fireEvent.click(within(screen.getByRole('region',{name:'Swim lessons'})).getByRole('button',{name:'Mark done'}))
  await waitFor(()=>expect(api.toggleTask).toHaveBeenCalledWith('p2'))
  expect(typeof lastRun().opts.undo).toBe('function')

  // Leaving one in Summer writes nothing, and can be changed.
  const calls=activity.calls.length
  fireEvent.click(within(screen.getByRole('region',{name:'Sort the garage'})).getByRole('button',{name:'Leave in Summer'}))
  expect(within(screen.getByRole('region',{name:'Sort the garage'})).getByText('Left in Summer')).toBeInTheDocument()
  expect(activity.calls.length).toBe(calls)
  expect(api.dropCommitment).not.toHaveBeenCalled()
  fireEvent.click(within(screen.getByRole('region',{name:'Sort the garage'})).getByRole('button',{name:'Change'}))
  expect(within(screen.getByRole('region',{name:'Sort the garage'})).getByRole('button',{name:'Leave in Summer'})).toBeInTheDocument()
  expect(api.keepForward).toHaveBeenCalledTimes(1)
 })
 it('a carry that fails is not counted as decided and offers Retry',async()=>{
  withSummer();api.keepForward.mockResolvedValueOnce(undefined)
  season()
  fireEvent.click(screen.getByRole('button',{name:'Plan Fall'}))
  fireEvent.click(within(screen.getByRole('region',{name:'Paint the porch'})).getByRole('button',{name:'Carry to Fall'}))
  await waitFor(()=>expect(lastRun().ok).toBe(false))
  expect(within(screen.getByRole('region',{name:'Paint the porch'})).getByRole('button',{name:'Carry to Fall'})).toBeInTheDocument()
  lastRun().opts.retry()
  await waitFor(()=>expect(within(screen.getByRole('region',{name:'Paint the porch'})).getByText('Carried to Fall')).toBeInTheDocument())
 })
 it('Leave for now, then coming back, resumes at the saved step with the half-written goal',()=>{
  withSummer()
  const first=season()
  fireEvent.click(screen.getByRole('button',{name:'Plan Fall'}))
  fireEvent.click(within(screen.getByRole('region',{name:'Sort the garage'})).getByRole('button',{name:'Leave in Summer'}))
  fireEvent.click(stepBtn('3Write Fall'))
  fireEvent.change(screen.getByLabelText('New Fall goal'),{target:{value:'Call the plumber'}})
  fireEvent.click(within(bar()).getByRole('button',{name:'Leave for now'}))
  expect(screen.queryByRole('region',{name:/^Planning /})).toBeNull()
  // Kept for this person and this season, in this browser.
  expect(JSON.parse(localStorage.getItem('symphony.session.v1.me.seasonal.2026-fall')!)).toMatchObject({step:'write',drafts:{unlinked:'Call the plumber'},decisions:{p3:'left'}})
  first.unmount()

  season()
  expect(screen.queryByRole('region',{name:/^Planning /})).toBeNull()
  fireEvent.click(screen.getByRole('button',{name:'Resume planning Fall · step 3 of 3'}))
  expect(currentStep()).toBe('3Write Fall')
  expect(screen.getByLabelText('New Fall goal')).toHaveValue('Call the plumber')
  // Its look-back verdict is remembered too.
  fireEvent.click(stepBtn('1Look back at Summer'))
  expect(within(screen.getByRole('region',{name:'Sort the garage'})).getByText('Left in Summer')).toBeInTheDocument()
 })
 it('another season, or another person, has its own progress',()=>{
  withSummer()
  const first=season()
  fireEvent.click(screen.getByRole('button',{name:'Plan Fall'}))
  fireEvent.click(stepBtn('2Your 2026 goals'))
  fireEvent.click(within(bar()).getByRole('button',{name:'Leave for now'}))
  fireEvent.click(screen.getByRole('button',{name:'Next season'}))
  expect(screen.getByRole('heading',{level:1})).toHaveTextContent('Winter 2026')
  expect(screen.queryByRole('button',{name:/Resume planning/})).toBeNull()
  fireEvent.click(screen.getByRole('button',{name:'Plan Winter'}))
  expect(currentStep()).toBe('1Look back at Fall')
  first.unmount()
  env.userId='partner'
  const second=season()
  expect(screen.getByRole('button',{name:'Plan Fall'})).toBeInTheDocument()
  second.unmount()
  env.userId='me'
  season()
  expect(screen.getByRole('button',{name:'Resume planning Fall · step 2 of 3'})).toBeInTheDocument()
 })
 it('a period change mid-session closes the bar instead of showing it on the new season',()=>{
  withSummer();season()
  fireEvent.click(screen.getByRole('button',{name:'Plan Fall'}))
  fireEvent.click(screen.getByRole('button',{name:'Next season'}))
  expect(screen.queryByRole('region',{name:/^Planning /})).toBeNull()
  fireEvent.click(screen.getByRole('button',{name:'Previous season'}))
  expect(screen.getByRole('button',{name:'Resume planning Fall · step 1 of 3'})).toBeInTheDocument()
 })
 it('writing the season keeps the line open for the next goal',async()=>{
  season()
  fireEvent.click(screen.getByRole('button',{name:'Plan Fall'}))
  fireEvent.click(stepBtn('3Write Fall'))
  fireEvent.change(screen.getByLabelText('New Fall goal'),{target:{value:'Fix the gate'}})
  fireEvent.click(screen.getByRole('button',{name:'Add'}))
  await waitFor(()=>expect(api.addTask).toHaveBeenCalledTimes(1))
  await waitFor(()=>expect(screen.getByLabelText('New Fall goal')).toHaveValue(''))
 })
 it('finishing marks the season planned and shows what was chosen; a failed save keeps the session',async()=>{
  withSummer();env.save.mockResolvedValueOnce(false)
  season()
  fireEvent.click(screen.getByRole('button',{name:'Plan Fall'}))
  fireEvent.click(within(screen.getByRole('region',{name:'Paint the porch'})).getByRole('button',{name:'Carry to Fall'}))
  await waitFor(()=>expect(titles()).toContain('Paint the porch'))
  fireEvent.click(stepBtn('3Write Fall'))
  fireEvent.click(within(bar()).getByRole('button',{name:'Mark Fall planned'}))
  await waitFor(()=>expect(lastRun()).toMatchObject({label:'Mark Fall planned',ok:false}))
  expect(bar()).toBeInTheDocument()
  lastRun().opts.retry()
  await waitFor(()=>expect(screen.queryByRole('region',{name:/^Planning /})).toBeNull())
  expect(env.save).toHaveBeenCalledTimes(2)
  const done=screen.getByText('Fall is planned.').closest('[role="status"]')!
  expect(done).toHaveTextContent('2 Fall goals: 1 carried from Summer, 1 under 2026 goals, 1 on its own.')
  expect(within(done as HTMLElement).getByRole('link',{name:'Plan a month from these goals →'})).toHaveAttribute('href','/month?view=constellation&horizon=2')
  // Finished: nothing left to resume.
  expect(screen.getByRole('button',{name:'Plan Fall'})).toBeInTheDocument()
  expect(localStorage.getItem('symphony.session.v1.me.seasonal.2026-fall')).toBeNull()
 })
 it('says when the season was planned, and offers to plan it again',()=>{
  env.planned={at:new Date(2026,9,5),authorId:'me',notes:{}}
  season()
  expect(screen.getByText('Fall planned Oct 5')).toBeInTheDocument()
  expect(screen.getByRole('button',{name:'Plan Fall again'})).toBeInTheDocument()
 })
 it('the look-back shows only the season before’s goals this reader may see',()=>{
  withSummer();api.tasks=[...api.tasks,summerGoal('hid','Their surprise',{hidden:true})]
  season()
  fireEvent.click(screen.getByRole('button',{name:'Plan Fall'}))
  expect(screen.queryByText('Their surprise')).toBeNull()
  expect(within(screen.getByRole('list',{name:'Summer goals to look back at'})).getAllByRole('region')).toHaveLength(4)
 })
})
