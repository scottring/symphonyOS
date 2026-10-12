// Year (2026-10-12): "What do I want to accomplish this year?" — the year's
// goals as one collection, last year beside it as optional review material,
// and an optional look-back-and-plan session. Harness as ConstellationPage.test.tsx,
// with filters that really filter, so lists and counts are checked together.
import {render,screen,fireEvent,waitFor,within,cleanup} from '@testing-library/react'
import {MemoryRouter,Routes,Route,useLocation} from 'react-router-dom'
import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest'
import {ConstellationPage} from './ConstellationPage'

const api=vi.hoisted(()=>({addGoal:vi.fn(),updateGoal:vi.fn(),deleteGoal:vi.fn(),addTask:vi.fn(),updateTask:vi.fn(),refetch:vi.fn(),pushTask:vi.fn(),setBucket:vi.fn(),updateTasksBulk:vi.fn(),toggleTask:vi.fn(),deleteTask:vi.fn(),keepForward:vi.fn(),dropCommitment:vi.fn(),tasks:[] as any[],goals:[] as any[]}))
const activity=vi.hoisted(()=>({calls:[] as {label:string;ok:boolean;opts:any}[],proposals:[] as any[],setProposalState:vi.fn(),removeProposal:vi.fn()}))
// What the person may see: contexts hidden by the area filter, and the person the people filter narrows to.
const filters=vi.hoisted(()=>({hidden:new Set<string>(),person:null as string|null}))
const planning=vi.hoisted(()=>({tokens:[] as string[],saved:null as any,mine:null as any,error:null as string|null,save:vi.fn(),reload:vi.fn()}))
vi.mock('@/contexts/GoalsContext',()=>({GoalsProvider:({children}:any)=>children,useGoalsContext:()=>({goals:api.goals,loading:false,...api})}))
vi.mock('@/contexts/CanvasActivityContext',()=>({
 useCanvasActivity:()=>({proposals:activity.proposals,setProposalState:activity.setProposalState,removeProposal:activity.removeProposal,
  run:async(label:string,cmd:()=>Promise<unknown>,opts:any)=>{let ok=false;try{ok=(await cmd())!==false}catch{ok=false};activity.calls.push({label,ok,opts});return ok}}),
 useArrived:()=>false,
}))
vi.mock('@/contexts/AssistantLaunchContext',()=>({useAssistantLauncher:()=>({openAssistant:vi.fn()})}))
vi.mock('@/hooks/useSupabaseTasks',()=>({useSupabaseTasks:()=>({tasks:api.tasks,loading:false,error:null,...api})}))
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>({user:{id:'me'}})}))
vi.mock('@/hooks/usePlanningSession',()=>({
 yearToken:(y:number)=>String(y),
 usePlanningSession:(_h:string,token:string)=>{planning.tokens.push(token);return {saved:planning.saved,mine:planning.mine,loading:false,loadedToken:token,error:planning.error,reload:planning.reload,save:planning.save}},
}))
vi.mock('@/hooks/useDomain',()=>({useDomain:()=>({layers:[],soleDomain:'personal'})}))
vi.mock('@/hooks/useAssigneeFilter',()=>({useAssigneeFilter:()=>[[]]}))
vi.mock('@/hooks/useFamilyMembers',()=>({useFamilyMembers:()=>({getCurrentUserMember:()=>null})}))
vi.mock('@/hooks/useHouseholdSeasons',()=>({useHouseholdSeasons:()=>({seasons:[{name:'Spring',month:3,day:1},{name:'Summer',month:6,day:1},{name:'Fall',month:9,day:1},{name:'Winter',month:12,day:1}]})}))
vi.mock('@/lib/today/domainFilter',()=>({
 filterTasksForLayers:(t:any[])=>t.filter((x)=>!filters.hidden.has(x.context)),
 matchesLayers:(c:string|null)=>!filters.hidden.has(c ?? ''),
}))
vi.mock('@/lib/planning/peopleLens',()=>({planPeopleLens:()=>({keep:(x:any)=>!filters.person||(x.assignedToAll??[]).includes(filters.person),scopeId:null})}))
vi.mock('../v2/AddArea',()=>({useAddArea:()=>({area:'personal',picker:null})}))
vi.mock('@/lib/planning/periodPage',async(importOriginal)=>({...await importOriginal<any>(),selectPeriodTasks:(tasks:any[],level:string)=>tasks.filter(t=>t.bucket===(level==='season'?'quarter':'month'))}))
vi.mock('@/lib/placement/model',async(importOriginal)=>({...await importOriginal<any>(),committedTo:(t:any)=>t.bucket==='week'?{}:undefined}))
vi.mock('@/components/domain/DomainGate',()=>({useDomainGate:()=>({requireDomain:vi.fn().mockResolvedValue('personal')})}))

const goal=(id:string,name:string,year:number,more:any={})=>({id,name,year,status:'active',context:'personal',areaId:'area-1',...more})
const GOALS=()=>[goal('a','Together',2026),goal('b','Health',2026),goal('d','Finished the shed',2026,{status:'completed'}),
 goal('p1','Learn Spanish',2025),goal('p2','Run a half marathon',2025),goal('p3','Old idea',2025,{status:'archived'})]

function Where(){const l=useLocation();return <output data-testid="where">{l.pathname+l.search}</output>}
function open(url='/year?view=constellation&start=2026-10-09'){
 return render(<MemoryRouter initialEntries={[url]}><Routes>
  {['/year','/season','/month'].map(p=><Route key={p} path={p} element={<><ConstellationPage/><Where/></>}/>)}
 </Routes></MemoryRouter>)
}
const yearList=(y=2026)=>screen.getByRole('list',{name:`${y} goals`})
const titles=(y=2026)=>within(yearList(y)).queryAllByRole('listitem').map(li=>li.querySelector('.plan-item-title')?.textContent)
const lastYear=(y=2025)=>screen.queryByRole('list',{name:`${y} goals`})
const card=(name:string,y=2025)=>screen.getByRole('region',{name:`${y}: ${name}`})
const lastRun=()=>activity.calls[activity.calls.length-1]
const stepButton=(label:string)=>screen.getAllByRole('button').find(b=>b.textContent===label.replace(' ',' ')&&b.closest('.pv2-steps'))!
const bar=()=>screen.queryByRole('region',{name:'Planning 2026'})

beforeEach(()=>{
 vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date(2026,9,11,9))
 vi.clearAllMocks();api.tasks=[];api.goals=GOALS();activity.calls=[];activity.proposals=[]
 filters.hidden=new Set();filters.person=null
 planning.tokens=[];planning.saved=null;planning.mine=null;planning.error=null
 localStorage.clear()
 HTMLElement.prototype.scrollIntoView=vi.fn()
 api.addGoal.mockResolvedValue({id:'new'});api.updateGoal.mockResolvedValue(true);api.deleteGoal.mockResolvedValue(undefined)
 planning.save.mockResolvedValue(true)
})
afterEach(()=>{vi.useRealTimers()})

describe('the year’s goals are the page',()=>{
 it('lists every year goal with last year shown or hidden, and hiding writes nothing',()=>{
  open()
  expect(screen.getByRole('heading',{name:'What do you want to accomplish in 2026?'})).toBeInTheDocument()
  expect(titles()).toEqual(['Together','Health'])
  // No invented parent: a year goal names nothing above it.
  expect(yearList().querySelector('.plan-item-parent')).toBeNull()
  // Last year's open and done goals are there for review; an archived one is not.
  expect(within(lastYear()!).getAllByRole('heading',{level:3}).map(h=>h.textContent)).toEqual(['Learn Spanish','Run a half marathon'])
  fireEvent.click(screen.getByRole('button',{name:'Hide 2025 goals'}))
  expect(lastYear()).toBeNull()
  expect(screen.getByRole('button',{name:'Show 2025 goals'})).toHaveAttribute('aria-expanded','false')
  expect(titles()).toEqual(['Together','Health'])
  expect(localStorage.getItem('symphony.year.lastYearShown')).toBe('0')
  fireEvent.click(screen.getByRole('button',{name:'Show 2025 goals'}))
  expect(lastYear()).not.toBeNull()
  expect(titles()).toEqual(['Together','Health'])
  fireEvent.click(screen.getByRole('button',{name:'Show done (1)'}))
  expect(titles()).toEqual(['Together','Health','Finished the shed'])
  expect(api.addGoal).not.toHaveBeenCalled();expect(api.updateGoal).not.toHaveBeenCalled()
 })
 it('remembers hidden last year for this viewer',()=>{
  localStorage.setItem('symphony.year.lastYearShown','0')
  open()
  expect(lastYear()).toBeNull()
  expect(titles()).toEqual(['Together','Health'])
 })
 it('an empty year says so and still offers a goal of its own; Season only once something is planned',()=>{
  api.goals=[]
  open()
  expect(screen.getByText('Nothing for 2026 yet.')).toBeInTheDocument()
  expect(screen.getByText('Nothing was written for 2025.')).toBeInTheDocument()
  expect(screen.queryByRole('link',{name:'Plan a season from these goals →'})).toBeNull()
  expect(screen.getByRole('button',{name:'Add a 2026 goal'})).toBeEnabled()
 })
})

describe('writing the year in your own words',()=>{
 it('adds a goal for the year on screen in one write, and closes the line',async()=>{
  open()
  fireEvent.click(screen.getByRole('button',{name:'Add a 2026 goal'}))
  fireEvent.change(screen.getByLabelText('New 2026 goal'),{target:{value:'A calmer house'}})
  fireEvent.click(screen.getByRole('button',{name:'Add'}))
  await waitFor(()=>expect(screen.queryByLabelText('New 2026 goal')).not.toBeInTheDocument())
  expect(api.addGoal).toHaveBeenCalledTimes(1)
  expect(api.addGoal).toHaveBeenCalledWith(null,'A calmer house','personal',expect.objectContaining({year:2026,id:expect.any(String)}))
  expect(lastRun()).toMatchObject({label:'Add “A calmer house”',ok:true})
  await lastRun().opts.undo()
  expect(api.deleteGoal).toHaveBeenCalledWith(api.addGoal.mock.calls[0][3].id)
 })
 it('a failed save says it didn’t save and keeps the wording; empty text is never saved',async()=>{
  api.addGoal.mockResolvedValueOnce(null)
  open()
  fireEvent.click(screen.getByRole('button',{name:'Add a 2026 goal'}))
  const field=screen.getByLabelText('New 2026 goal')
  fireEvent.change(field,{target:{value:'   '}})
  expect(screen.getByRole('button',{name:'Add'})).toBeDisabled()
  fireEvent.submit(field.closest('form')!)
  expect(api.addGoal).not.toHaveBeenCalled()
  fireEvent.change(field,{target:{value:'A calmer house'}})
  fireEvent.click(screen.getByRole('button',{name:'Add'}))
  await screen.findByText(/Didn’t save\. Your wording is still here/)
  expect(screen.getByLabelText('New 2026 goal')).toHaveValue('A calmer house')
  expect(lastRun()).toMatchObject({ok:false})
  expect(typeof lastRun().opts.retry).toBe('function')
 })
 it('edits a goal’s wording in place, with Undo',async()=>{
  open()
  fireEvent.click(screen.getByRole('button',{name:'Actions for Together'}));fireEvent.click(screen.getByText('Edit wording'))
  const field=screen.getByLabelText('Wording for Together');expect(field).toHaveValue('Together')
  fireEvent.change(field,{target:{value:'Together, more often'}});fireEvent.click(screen.getByRole('button',{name:'Save'}))
  await waitFor(()=>expect(api.updateGoal).toHaveBeenCalledWith('a',{name:'Together, more often'}))
  await lastRun().opts.undo()
  expect(api.updateGoal).toHaveBeenLastCalledWith('a',{name:'Together'})
 })
 it('keeps a suggested year goal through the one create path',async()=>{
  activity.proposals=[{key:'p',title:'Visit Mom more',level:0,state:'proposed'}]
  open()
  expect(within(yearList()).getByText('Visit Mom more')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'Keep Visit Mom more'}))
  await waitFor(()=>expect(activity.removeProposal).toHaveBeenCalledWith('p'))
  expect(api.addGoal).toHaveBeenCalledWith(null,'Visit Mom more','personal',expect.objectContaining({year:2026}))
 })
})

describe('season goals under a year goal: the same filtered records',()=>{
 it('counts and names a goal’s season goals across the year, under the same filters as the list',()=>{
  api.tasks=[
   {id:'s1',title:'Spring outings',bucket:'quarter',goalId:'a',context:'personal',seasonStart:new Date(2026,2,1)},
   {id:'s2',title:'Autumn picnics',bucket:'quarter',goalId:'a',context:'personal',seasonStart:new Date(2026,8,1)},
   {id:'s3',title:'Team offsite',bucket:'quarter',goalId:'a',context:'work',seasonStart:new Date(2026,8,1)},
   {id:'s4',title:'Booked the cabin',bucket:'quarter',goalId:'a',context:'personal',completed:true},
   {id:'s5',title:'Someone else’s',bucket:'quarter',goalId:'zz',context:'personal'},
  ]
  filters.hidden=new Set(['work'])
  open()
  const together=within(yearList()).getByText('Together').closest('li')!
  expect(within(together).getByLabelText('2 season goals below')).toHaveTextContent('2 season goals')
  fireEvent.click(within(together).getByRole('button',{name:'Together'}))
  expect(together).toHaveTextContent('Season goals: Spring outings (Spring) · Autumn picnics (Fall)')
  expect(together).not.toHaveTextContent('Team offsite')
  expect(within(yearList()).getByText('Health').closest('li')!.querySelector('.plan-count')).toBeNull()
  // One record each: nothing from a season is copied into the year's list.
  expect(titles()).toEqual(['Together','Health'])
  fireEvent.click(within(together).getByRole('button',{name:'See its season goals →'}))
  expect(screen.getByTestId('where').textContent).toContain('horizon=1')
  expect(screen.getByTestId('where').textContent).toContain('focus=0%3Aa')
 })
 it('last year’s goals follow the same area and people filters',()=>{
  api.goals=[...GOALS(),goal('pw','Ship the report',2025,{context:'work'}),goal('pk','Kids’ swim lessons',2025,{assignedToAll:['kid']}),goal('pm','Mine',2025,{assignedToAll:['me-member']})]
  filters.hidden=new Set(['work'])
  open()
  const names=()=>within(lastYear()!).getAllByRole('heading',{level:3}).map(h=>h.textContent)
  expect(names()).toEqual(['Learn Spanish','Run a half marathon','Kids’ swim lessons','Mine'])
  cleanup()
  filters.person='me-member'
  api.goals=[...api.goals.map((g:any)=>g.year===2026?{...g,assignedToAll:['me-member']}:g)]
  open()
  expect(names()).toEqual(['Mine'])
  expect(titles()).toEqual(['Together','Health'])
 })
})

describe('last year: decisions that keep history',()=>{
 it('renewing writes a NEW goal for this year in your words; last year’s goal keeps its year and status',async()=>{
  const view=open()
  fireEvent.click(screen.getByRole('button',{name:'Renew Learn Spanish for 2026'}))
  const field=screen.getByLabelText('Renew Learn Spanish for 2026')
  expect(field).toHaveValue('Learn Spanish')
  fireEvent.change(field,{target:{value:'Hold a conversation in Spanish'}})
  fireEvent.click(screen.getByRole('button',{name:'Add to 2026'}))
  await waitFor(()=>expect(api.addGoal).toHaveBeenCalledTimes(1))
  const [area,name,context,extra]=api.addGoal.mock.calls[0]
  expect([area,name,context]).toEqual(['area-1','Hold a conversation in Spanish','personal'])
  expect(extra).toMatchObject({year:2026,carriedFrom:'p1',id:expect.any(String)})
  expect(api.updateGoal).not.toHaveBeenCalled()
  expect(lastRun()).toMatchObject({label:'Renew “Learn Spanish” for 2026',ok:true})
  // The goals reload with the new one: in this year's list, and named on last year's card.
  api.goals=[...api.goals,goal(extra.id,'Hold a conversation in Spanish',2026,{carriedFrom:'p1'})]
  view.rerender(<MemoryRouter initialEntries={['/year?view=constellation&start=2026-10-09']}><Routes><Route path="/year" element={<ConstellationPage/>}/></Routes></MemoryRouter>)
  expect(titles()).toEqual(['Together','Health','Hold a conversation in Spanish'])
  expect(card('Learn Spanish')).toHaveTextContent('Renewed for 2026 as “Hold a conversation in Spanish”')
  expect(api.goals.find((g:any)=>g.id==='p1')).toMatchObject({year:2025,status:'active'})
  expect(within(card('Learn Spanish')).queryByRole('button',{name:'Renew Learn Spanish for 2026'})).toBeNull()
  // Undo removes the new goal only.
  await lastRun().opts.undo()
  expect(api.deleteGoal).toHaveBeenCalledWith(extra.id)
 })
 it('a failed renewal keeps the wording and offers Retry',async()=>{
  api.addGoal.mockResolvedValueOnce(null)
  open()
  fireEvent.click(screen.getByRole('button',{name:'Renew Learn Spanish for 2026'}))
  fireEvent.click(screen.getByRole('button',{name:'Add to 2026'}))
  await screen.findByText(/Didn’t save/)
  expect(screen.getByLabelText('Renew Learn Spanish for 2026')).toHaveValue('Learn Spanish')
  expect(lastRun().ok).toBe(false)
  lastRun().opts.retry()
  await waitFor(()=>expect(api.addGoal).toHaveBeenCalledTimes(2))
  // The retry is the same goal (same id), not a second one.
  expect(api.addGoal.mock.calls[1][3].id).toBe(api.addGoal.mock.calls[0][3].id)
 })
 it('marking last year’s goal done is explicit and undoable; a done goal can be reopened',async()=>{
  api.goals=GOALS().map((g)=>g.id==='p2'?{...g,status:'completed'}:g)
  open()
  expect(card('Run a half marathon')).toHaveTextContent('Done in 2025')
  fireEvent.click(screen.getByRole('button',{name:'Mark Learn Spanish done in 2025'}))
  await waitFor(()=>expect(api.updateGoal).toHaveBeenCalledWith('p1',{status:'completed'}))
  expect(lastRun().label).toBe('Mark “Learn Spanish” done in 2025')
  await lastRun().opts.undo()
  expect(api.updateGoal).toHaveBeenLastCalledWith('p1',{status:'active'})
  fireEvent.click(screen.getByRole('button',{name:'Reopen Run a half marathon in 2025'}))
  await waitFor(()=>expect(api.updateGoal).toHaveBeenLastCalledWith('p2',{status:'active'}))
  // Its year never changes.
  expect(api.updateGoal.mock.calls.every(([,patch])=>!('year' in patch))).toBe(true)
 })
})

describe('the look-back-and-plan session',()=>{
 it('runs in order — look back at last year, then shape this one — with the year’s list anchored, and carries nothing on its own',async()=>{
  open()
  expect(bar()).toBeNull()
  fireEvent.click(screen.getByRole('button',{name:'Look back and plan 2026'}))
  expect(bar()).not.toBeNull()
  const steps=within(bar()!).getAllByRole('button').filter(b=>b.closest('.pv2-steps')).map(b=>b.textContent)
  expect(steps).toEqual(['1Look back at 2025','2Shape 2026'])
  expect(stepButton('1Look back at 2025')).toHaveAttribute('aria-current','step')
  expect(screen.getByRole('heading',{name:'Look back at 2025'})).toBeInTheDocument()
  expect(bar()).toHaveTextContent('0 of 2 decided')
  expect(titles()).toEqual(['Together','Health'])
  // Letting one go is a record only.
  fireEvent.click(screen.getByRole('button',{name:'Let Learn Spanish go'}))
  expect(card('Learn Spanish')).toHaveTextContent('Letting it go; it stays in 2025')
  expect(bar()).toHaveTextContent('1 of 2 decided')
  fireEvent.click(within(bar()!).getByRole('button',{name:'Next: Shape 2026 →'}))
  expect(stepButton('2Shape 2026')).toHaveAttribute('aria-current','step')
  expect(screen.getByRole('heading',{name:'From 2025'})).toBeInTheDocument()
  expect(screen.getByText(/Renewed 0 · Done 0 · Letting go 1 · Not decided 1/)).toBeInTheDocument()
  // Shaping opens the writing line in the year's own list.
  expect(screen.getByLabelText('New 2026 goal')).toBeInTheDocument()
  expect(titles()).toEqual(['Together','Health'])
  fireEvent.click(within(bar()!).getByRole('button',{name:'← Back'}))
  expect(stepButton('1Look back at 2025')).toHaveAttribute('aria-current','step')
  fireEvent.click(stepButton('2Shape 2026'))
  fireEvent.click(within(bar()!).getByRole('button',{name:'Mark 2026 planned'}))
  await waitFor(()=>expect(planning.save).toHaveBeenCalledTimes(1))
  expect(api.addGoal).not.toHaveBeenCalled();expect(api.updateGoal).not.toHaveBeenCalled()
  await waitFor(()=>expect(bar()).toBeNull())
  expect(localStorage.getItem('symphony.session.v1.me.annual.2026')).toBeNull()
 })
 it('keeps writing open in Shape: each goal lands and the line empties for the next',async()=>{
  open()
  fireEvent.click(screen.getByRole('button',{name:'Look back and plan 2026'}))
  fireEvent.click(within(bar()!).getByRole('button',{name:'Next: Shape 2026 →'}))
  fireEvent.change(screen.getByLabelText('New 2026 goal'),{target:{value:'A calmer house'}})
  fireEvent.click(screen.getByRole('button',{name:'Add'}))
  await waitFor(()=>expect(api.addGoal).toHaveBeenCalledTimes(1))
  await waitFor(()=>expect(screen.getByLabelText('New 2026 goal')).toHaveValue(''))
 })
 it('Leave for now and coming back resumes at the saved step with the unfinished goal and decisions',()=>{
  const first=open()
  fireEvent.click(screen.getByRole('button',{name:'Look back and plan 2026'}))
  fireEvent.click(screen.getByRole('button',{name:'Let Run a half marathon go'}))
  fireEvent.click(within(bar()!).getByRole('button',{name:'Next: Shape 2026 →'}))
  fireEvent.change(screen.getByLabelText('New 2026 goal'),{target:{value:'Run a marathon'}})
  fireEvent.click(within(bar()!).getByRole('button',{name:'Leave for now'}))
  expect(bar()).toBeNull()
  // Ordinary editing goes on without the session.
  expect(screen.getByRole('button',{name:'Continue planning 2026'})).toBeInTheDocument()
  first.unmount()
  open()
  expect(bar()).toBeNull()
  fireEvent.click(screen.getByRole('button',{name:'Continue planning 2026'}))
  expect(stepButton('2Shape 2026')).toHaveAttribute('aria-current','step')
  expect(screen.getByLabelText('New 2026 goal')).toHaveValue('Run a marathon')
  fireEvent.click(stepButton('1Look back at 2025'))
  expect(card('Run a half marathon')).toHaveTextContent('Letting it go')
  fireEvent.click(screen.getByRole('button',{name:'Undo letting Run a half marathon go'}))
  expect(card('Run a half marathon')).toHaveTextContent('Not decided yet')
  expect(api.addGoal).not.toHaveBeenCalled();expect(api.updateGoal).not.toHaveBeenCalled()
 })
 it('a renewal being written survives Leave and resume',()=>{
  const first=open()
  fireEvent.click(screen.getByRole('button',{name:'Look back and plan 2026'}))
  fireEvent.click(screen.getByRole('button',{name:'Renew Learn Spanish for 2026'}))
  fireEvent.change(screen.getByLabelText('Renew Learn Spanish for 2026'),{target:{value:'Spanish with the kids'}})
  fireEvent.click(within(bar()!).getByRole('button',{name:'Leave for now'}))
  first.unmount()
  open()
  fireEvent.click(screen.getByRole('button',{name:'Continue planning 2026'}))
  expect(screen.getByLabelText('Renew Learn Spanish for 2026')).toHaveValue('Spanish with the kids')
  expect(api.addGoal).not.toHaveBeenCalled()
 })
 it('each year keeps its own progress',()=>{
  open()
  fireEvent.click(screen.getByRole('button',{name:'Look back and plan 2026'}))
  fireEvent.click(within(bar()!).getByRole('button',{name:'Next: Shape 2026 →'}))
  fireEvent.click(screen.getByRole('button',{name:'Previous year'}))
  expect(screen.getByRole('heading',{level:1})).toHaveTextContent('2025')
  // 2026's session is not on 2025's page, and 2025 has none of its own.
  expect(screen.queryByRole('region',{name:/^Planning/})).toBeNull()
  fireEvent.click(screen.getByRole('button',{name:'Look back and plan 2025'}))
  expect(screen.getByRole('region',{name:'Planning 2025'})).toBeInTheDocument()
  expect(screen.getByRole('heading',{name:'Look back at 2024'})).toBeInTheDocument()
  expect(planning.tokens).toContain('2025')
  fireEvent.click(screen.getByRole('button',{name:'Next year'}))
  fireEvent.click(screen.getByRole('button',{name:'Continue planning 2026'}))
  expect(stepButton('2Shape 2026')).toHaveAttribute('aria-current','step')
 })
 it('saves the reflection notes with the plan through the planning session, and only then',async()=>{
  planning.mine={wentWell:'We travelled',didnt:''}
  open()
  fireEvent.click(screen.getByRole('button',{name:'Look back and plan 2026'}))
  const well=screen.getByLabelText('What went well in 2025?')
  expect(well).toHaveValue('We travelled')
  fireEvent.change(well,{target:{value:'We travelled, and the garden'}})
  fireEvent.change(screen.getByLabelText('What didn’t?'),{target:{value:'Too little sleep'}})
  expect(planning.save).not.toHaveBeenCalled()
  fireEvent.click(within(bar()!).getByRole('button',{name:'Next: Shape 2026 →'}))
  expect(screen.getByText('Too little sleep')).toBeInTheDocument()
  fireEvent.click(within(bar()!).getByRole('button',{name:'Mark 2026 planned'}))
  await waitFor(()=>expect(planning.save).toHaveBeenCalledWith({wentWell:'We travelled, and the garden',didnt:'Too little sleep'}))
  expect(lastRun()).toMatchObject({label:'Mark 2026 planned',ok:true})
 })
 it('a failed save keeps the session open with its notes, ready to retry',async()=>{
  planning.save.mockResolvedValueOnce(false)
  open()
  fireEvent.click(screen.getByRole('button',{name:'Look back and plan 2026'}))
  fireEvent.change(screen.getByLabelText('What went well in 2025?'),{target:{value:'Plenty'}})
  fireEvent.click(within(bar()!).getByRole('button',{name:'Next: Shape 2026 →'}))
  fireEvent.click(within(bar()!).getByRole('button',{name:'Mark 2026 planned'}))
  await waitFor(()=>expect(lastRun()).toMatchObject({label:'Mark 2026 planned',ok:false}))
  expect(bar()).not.toBeNull()
  lastRun().opts.retry()
  await waitFor(()=>expect(planning.save).toHaveBeenCalledTimes(2))
  expect(planning.save).toHaveBeenLastCalledWith({wentWell:'Plenty',didnt:''})
 })
 it('never overwrites notes it could not read',async()=>{
  planning.error='offline'
  open()
  fireEvent.click(screen.getByRole('button',{name:'Look back and plan 2026'}))
  fireEvent.click(within(bar()!).getByRole('button',{name:'Next: Shape 2026 →'}))
  fireEvent.click(within(bar()!).getByRole('button',{name:'Mark 2026 planned'}))
  await waitFor(()=>expect(lastRun()).toMatchObject({ok:false}))
  expect(planning.save).not.toHaveBeenCalled()
  expect(planning.reload).toHaveBeenCalled()
 })
})

describe('onward, and the year on screen',()=>{
 it('goes on to plan a season from these goals, for this year’s current season',()=>{
  open()
  const link=screen.getByRole('link',{name:'Plan a season from these goals →'})
  expect(link).toHaveAttribute('href','/year?view=constellation&horizon=1')
  fireEvent.click(link)
  expect(screen.getByRole('heading',{level:1})).toHaveTextContent('Fall 2026')
 })
 it('from another year, Season keeps that year',()=>{
  api.goals=[goal('q','Old plan',2025)]
  open('/year?view=constellation&start=2025-01-01')
  expect(screen.getByRole('link',{name:'Plan a season from these goals →'})).toHaveAttribute('href','/year?view=constellation&start=2025-01-01&horizon=1')
 })
 it('the year arrows change the year, its question and its last year',()=>{
  api.goals=[...GOALS(),goal('o','Paint the fence',2024)]
  open()
  fireEvent.click(screen.getByRole('button',{name:'Previous year'}))
  expect(screen.getByRole('heading',{level:1})).toHaveTextContent('2025')
  expect(screen.getByRole('heading',{name:'What do you want to accomplish in 2025?'})).toBeInTheDocument()
  expect(titles(2025)).toEqual(['Learn Spanish','Run a half marathon'])
  expect(within(lastYear(2024)!).getByText('Paint the fence')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'Next year'}))
  expect(screen.getByRole('heading',{level:1})).toHaveTextContent('2026')
  expect(titles()).toEqual(['Together','Health'])
 })
})
