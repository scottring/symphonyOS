import {render,screen,fireEvent,waitFor,within,cleanup} from '@testing-library/react'
import {MemoryRouter,Routes,Route,useLocation} from 'react-router-dom'
import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest'
import {ConstellationPage} from './ConstellationPage'
import {ConversationWalkContext} from '@/components/canvas/conversationWalk'
const api=vi.hoisted(()=>({addGoal:vi.fn(),updateGoal:vi.fn(),deleteGoal:vi.fn(),addTask:vi.fn(),updateTask:vi.fn(),refetch:vi.fn(),pushTask:vi.fn(),setBucket:vi.fn(),updateTasksBulk:vi.fn(),toggleTask:vi.fn(),deleteTask:vi.fn(),keepForward:vi.fn(),dropCommitment:vi.fn(),tasks:[] as any[],goals:[] as any[]}))
const activity=vi.hoisted(()=>({calls:[] as {label:string;ok:boolean;opts:any}[],proposals:[] as any[],changeSet:null as any,setProposalState:vi.fn(),removeProposal:vi.fn()}))
const launcher=vi.hoisted(()=>({openAssistant:vi.fn()}))
const selection=vi.hoisted(()=>({setSelection:vi.fn()}))
vi.mock('@/contexts/GoalsContext',()=>({GoalsProvider:({children}:any)=>children,useGoalsContext:()=>({goals:api.goals,loading:false,...api})}))
vi.mock('@/contexts/CanvasActivityContext',()=>({
 useCanvasActivity:()=>({proposals:activity.proposals,changeSet:activity.changeSet,setProposalState:activity.setProposalState,removeProposal:activity.removeProposal,
  run:async(label:string,cmd:()=>Promise<unknown>,opts:any)=>{let ok=false;try{ok=(await cmd())!==false}catch{ok=false};activity.calls.push({label,ok,opts});return ok}}),
 useArrived:()=>false,
}))
vi.mock('@/contexts/AssistantLaunchContext',()=>({useAssistantLauncher:()=>launcher}))
vi.mock('@/shell/providers/SelectionProvider',()=>({useSelectionOptional:()=>selection}))
vi.mock('@/hooks/useSupabaseTasks',()=>({useSupabaseTasks:()=>({tasks:api.tasks,loading:false,error:null,...api})}))
vi.mock('@/hooks/useDomain',()=>({useDomain:()=>({layers:[],soleDomain:'personal'})}))
vi.mock('@/hooks/useAssigneeFilter',()=>({useAssigneeFilter:()=>[[]]}))
vi.mock('@/hooks/useFamilyMembers',()=>({useFamilyMembers:()=>({getCurrentUserMember:()=>null,members:[{auth_user_id:'u2',name:'Iris'}]})}))
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>({user:{id:'u1'}})}))
const review=vi.hoisted(()=>({reviewed:null as any,mine:null as any,finish:vi.fn(async()=>true),token:'' as string,horizon:'' as string}))
const plan=vi.hoisted(()=>({saved:null as any,save:vi.fn(async()=>true)}))
vi.mock('@/hooks/usePlanningSession',async(importOriginal)=>({...await importOriginal<any>(),usePlanningSession:()=>({saved:plan.saved,mine:null,loading:false,loadedToken:'',error:null,reload:vi.fn(),save:plan.save})}))
vi.mock('@/hooks/usePeriodReview',()=>({usePeriodReview:(horizon:string,token:string)=>{review.horizon=horizon;review.token=token;return{reviewed:review.reviewed,mine:review.mine,loading:false,error:null,reload:vi.fn(),finish:review.finish}}}))
// This file's committedTo stub says nothing about status; the review reads it from the fixture.
vi.mock('@/lib/planning/periodReview',async(importOriginal)=>({...await importOriginal<any>(),taskReviewState:(t:any)=>t.completed?'done':t.carried?'moved':'open',movedOn:(t:any)=>t.carried&&!t.completed?{to:t.carriedTo}:null}))
vi.mock('@/hooks/useHouseholdSeasons',()=>({useHouseholdSeasons:()=>({seasons:[{name:'Spring',month:3,day:1},{name:'Summer',month:6,day:1},{name:'Fall',month:9,day:1},{name:'Winter',month:12,day:1}]})}))
vi.mock('@/lib/today/domainFilter',()=>({filterTasksForLayers:(t:any)=>t,matchesLayers:()=>true}))
vi.mock('@/lib/planning/peopleLens',()=>({planPeopleLens:()=>({keep:()=>true,scopeId:null})}))
vi.mock('../v2/AddArea',()=>({useAddArea:()=>({area:'personal',picker:null})}))
vi.mock('@/lib/planning/periodPage',async(importOriginal)=>({...await importOriginal<any>(),selectPeriodTasks:(tasks:any[],level:string,start:Date)=>tasks.filter(t=>t.bucket===(level==='season'?'quarter':'month')&&(!t.monthStart||+t.monthStart===+start))}))
vi.mock('@/lib/placement/model',async(importOriginal)=>({...await importOriginal<any>(),committedTo:(t:any)=>t.bucket==='week'?{}:undefined}))
vi.mock('@/components/domain/DomainGate',()=>({useDomainGate:()=>({requireDomain:vi.fn().mockResolvedValue('personal')})}))

// Year, Season and Month, one page shape (2026-10-13): the period's goals as
// one plain list, the level above folded into one line, an optional "For"
// while writing, and names (never counts) for what is under a goal.

const GOALS=[{id:'g',name:'Together',year:2026,status:'active',context:'personal'},{id:'other',name:'Health',year:2026,status:'active',context:'personal'}]
function Where(){const l=useLocation();return <output data-testid="where">{l.pathname+l.search}</output>}
function open(url='/year?view=constellation&start=2026-10-09'){
 render(<MemoryRouter initialEntries={[url]}><Routes>
  {['/year','/season','/month'].map(p=><Route key={p} path={p} element={<><ConstellationPage/><Where/></>}/>)}
  <Route path="/week" element={<><p>Week page</p><Where/></>}/>
 </Routes></MemoryRouter>)
}
const season=(extra='')=>open('/season?view=constellation&horizon=1&start=2026-10-09'+extra)
const month=(extra='')=>open('/month?view=constellation&horizon=2&start=2026-10-09'+extra)
const list=(name:string)=>screen.getByRole('list',{name})
const titles=(name:string)=>within(list(name)).getAllByRole('listitem').map(li=>li.querySelector('.plan-item-title')?.textContent)
const row=(title:string)=>screen.getByText(title,{selector:'.plan-item-title'}).closest('li')!
const lastRun=()=>activity.calls[activity.calls.length-1]
beforeEach(()=>{
 vi.clearAllMocks();api.tasks=[];api.goals=GOALS.map(g=>({...g}));activity.calls=[];activity.proposals=[];activity.changeSet=null
 localStorage.clear()
 HTMLElement.prototype.scrollIntoView=vi.fn()
 api.updateTask.mockResolvedValue(true);api.addTask.mockResolvedValue('new');api.addGoal.mockResolvedValue({id:'new'});api.updateGoal.mockResolvedValue(true)
})

describe('where you are',()=>{
 it('opens the horizon its URL names, with the period and its dates, and no horizon tabs of its own',()=>{
  month()
  expect(screen.getByRole('heading',{level:1})).toHaveTextContent('October 2026')
  expect(screen.getByText('Oct 1 – 31')).toBeInTheDocument()
  // The top bar names the horizon now (Today · Week · Month · Season · Year).
  expect(screen.queryByRole('navigation',{name:'Planning horizon'})).toBeNull()
  expect(screen.queryByRole('link',{name:'Week →'})).toBeNull()
  open('/year?view=constellation&horizon=1&start=2026-10-09')
  expect(screen.getAllByRole('heading',{level:1})[1]).toHaveTextContent('Fall 2026')
  expect(screen.getByText('Sep 1 – Nov 30')).toBeInTheDocument()
 })
 it('steps periods with the arrows and offers the way back',()=>{
  season()
  fireEvent.click(screen.getByRole('button',{name:'Next season'}))
  expect(screen.getByTestId('where').textContent).toContain('start=2026-12-01')
  expect(screen.getByRole('heading',{level:1})).toHaveTextContent('Winter')
  fireEvent.click(screen.getByRole('button',{name:'Back to this season'}))
  expect(screen.getByTestId('where').textContent).not.toContain('start=')
 })
 it('hands the week horizon over to the Week page',()=>{
  open('/year?view=constellation&start=2026-10-09&horizon=3&focus=3:w')
  expect(screen.getByText('Week page')).toBeInTheDocument()
  expect(screen.getByTestId('where').textContent).toMatch(/^\/week\?view=alongside&date=2026-10-09/)
 })
 it('marks a conversation-saved item and refreshes on later saves',()=>{
  api.tasks=[{id:'s',title:'Autumn outings',bucket:'quarter',goalId:'g'}]
  season('&focus=1:s')
  expect(within(row('Autumn outings')).getByText('Saved')).toBeInTheDocument()
  fireEvent(window,new Event('symphony-plan-updated'))
  expect(api.refetch).toHaveBeenCalledTimes(1)
 })
 it('shows no list, and no empty-plan message, while the plans load',()=>{
  ;(api as any).loading=true
  try{
   season()
   expect(screen.getByText('Loading your plans…')).toBeInTheDocument()
   expect(screen.queryByText(/Nothing for/)).toBeNull()
   expect(screen.queryByRole('list',{name:'Fall goals'})).toBeNull()
  }finally{delete (api as any).loading}
 })
})

describe('one plain list',()=>{
 it('Season lists every season goal once, linked or not, with no cards and no counts',()=>{
  api.tasks=[{id:'a',title:'Unhurried weekends',bucket:'quarter',goalId:'g'},{id:'c',title:'Fix the gate',bucket:'quarter'},
   {id:'m',title:'Picnic',bucket:'month',sourceId:'a'},{id:'n',title:'Leaf pile',bucket:'month',sourceId:'a'}]
  season()
  expect(titles('Fall goals')).toEqual(['Unhurried weekends','Fix the gate'])
  expect(screen.queryAllByRole('region').filter(r=>/^Under /.test(r.getAttribute('aria-label')??''))).toHaveLength(0)
  // Linked: what it is for, and what is under it one horizon down, by name.
  expect(row('Unhurried weekends')).toHaveTextContent('For Together')
  expect(row('Unhurried weekends')).toHaveTextContent('October: Picnic · Leaf pile')
  // On its own: nothing more is said.
  expect(row('Fix the gate').querySelector('.plan-item-parent')).toBeNull()
  expect(row('Fix the gate').querySelector('.plan-item-below')).toBeNull()
  expect(screen.queryByText(/\d+ month goals?/)).toBeNull()
 })
 it('Month names the season goal it is for and its tasks this week',()=>{
  api.tasks=[{id:'s',title:'Autumn outings',bucket:'quarter',goalId:'g'},{id:'m',title:'Picnic',bucket:'month',sourceId:'s'},{id:'x',title:'Taxes',bucket:'month'},
   {id:'w',title:'Book the shelter',bucket:'week',sourceId:'m'}]
  month()
  expect(titles('October goals')).toEqual(['Picnic','Taxes'])
  expect(row('Picnic')).toHaveTextContent('For Autumn outings')
  expect(row('Picnic').querySelector('.plan-item-below')).toHaveTextContent(/^(This week|Week of Oct \d+): Book the shelter$/)
  expect(row('Taxes').querySelector('.plan-item-parent')).toBeNull()
 })
 it('Year lists the year goals and names the season goals under them',()=>{
  api.tasks=[{id:'s',title:'Autumn outings',bucket:'quarter',goalId:'g'}]
  open()
  expect(titles('2026 goals')).toEqual(['Together','Health'])
  expect(row('Together')).toHaveTextContent('Fall: Autumn outings')
  expect(row('Health').querySelector('.plan-item-below')).toBeNull()
 })
 it('an empty period says so plainly',()=>{
  month()
  expect(screen.getByText('Nothing for October yet.')).toBeInTheDocument()
  expect(screen.queryByRole('link',{name:/^Go to/})).toBeNull()
 })
})

describe('the level above, folded to one line',()=>{
 it('Month: the season goals open in place and fold again, without writing',()=>{
  api.tasks=[{id:'s',title:'Autumn outings',bucket:'quarter'},{id:'t',title:'Strength',bucket:'quarter'},{id:'m',title:'Picnic',bucket:'month'}]
  month()
  const line=screen.getByRole('button',{name:/Fall goals.*the season October serves/})
  expect(line).toHaveAttribute('aria-expanded','false')
  expect(screen.queryByRole('list',{name:'Fall goals'})).toBeNull()
  fireEvent.click(line)
  expect(within(list('Fall goals')).getAllByRole('listitem').map(li=>li.textContent)).toEqual(['Autumn outings','Strength'])
  fireEvent.click(line)
  expect(screen.queryByRole('list',{name:'Fall goals'})).toBeNull()
  expect(api.updateTask).not.toHaveBeenCalled()
 })
 it('the toggle names the list it opens, and the open list carries its own Hide',()=>{
  api.tasks=[{id:'s',title:'Autumn outings',bucket:'quarter'},{id:'m',title:'Picnic',bucket:'month'}]
  month()
  const line=screen.getByRole('button',{name:/Fall goals.*the season October serves/})
  expect(line).toHaveTextContent(/Show Fall list$/)
  fireEvent.click(line)
  expect(line).toHaveTextContent(/Hide Fall list$/)
  const panel=screen.getByRole('complementary',{name:'Fall goals'})
  fireEvent.click(within(panel).getByRole('button',{name:'Hide Fall list'}))
  expect(screen.queryByRole('complementary',{name:'Fall goals'})).toBeNull()
  expect(line).toHaveAttribute('aria-expanded','false')
  cleanup()
  season()
  expect(screen.getByRole('button',{name:/2026 goals/})).toHaveTextContent(/Show 2026 list$/)
  cleanup()
  open()
  expect(screen.getByRole('button',{name:/2025 goals/})).toHaveTextContent(/Show 2025 list$/)
 })
 it('opens beside the list, and stays open for this viewer next time',()=>{
  api.tasks=[{id:'s',title:'Autumn outings',bucket:'quarter'},{id:'m',title:'Picnic',bucket:'month'}]
  month()
  fireEvent.click(screen.getByRole('button',{name:/Fall goals.*the season October serves/}))
  expect(screen.getByRole('complementary',{name:'Fall goals'})).toContainElement(list('Fall goals'))
  expect(localStorage.getItem('symphony.plan.aboveOpen')).toBe('1')
  cleanup()
  month()
  expect(screen.getByRole('button',{name:/Fall goals.*the season October serves/})).toHaveAttribute('aria-expanded','true')
  expect(within(list('Fall goals')).getByText('Autumn outings')).toBeInTheDocument()
  expect(titles('October goals')).toEqual(['Picnic'])
 })
 it('Season: the year goals',()=>{
  season()
  fireEvent.click(screen.getByRole('button',{name:/2026 goals.*the year Fall serves/}))
  expect(within(list('2026 goals')).getAllByRole('listitem').map(li=>li.textContent)).toEqual(['Together','Health'])
 })
 it('Year: last year, for reference, and says when nothing was written',()=>{
  open()
  fireEvent.click(screen.getByRole('button',{name:/2025 goals.*last year, for reference/}))
  expect(screen.getByText('Nothing was written for 2025.')).toBeInTheDocument()
 })
})

describe('writing a goal, with an optional For',()=>{
 it('Month: one of its own takes the page area; one for a season goal is linked in the same write',async()=>{
  api.tasks=[{id:'s',title:'Autumn outings',bucket:'quarter',goalId:'g'}]
  month()
  fireEvent.click(screen.getByRole('button',{name:'Add an October goal'}))
  fireEvent.change(screen.getByLabelText('New October goal'),{target:{value:'Taxes'}})
  fireEvent.click(screen.getByRole('button',{name:'Add'}))
  await waitFor(()=>expect(api.addTask).toHaveBeenCalledTimes(1))
  expect(api.addTask).toHaveBeenLastCalledWith('Taxes',undefined,undefined,undefined,expect.objectContaining({bucket:'month',context:'personal',monthStart:new Date(2026,9,1)}))
  expect(api.addTask.mock.calls[0][4].sourceId).toBeUndefined()
  await waitFor(()=>expect(screen.queryByLabelText('New October goal')).not.toBeInTheDocument())
  fireEvent.click(screen.getByRole('button',{name:'Add an October goal'}))
  fireEvent.change(screen.getByLabelText('For a Fall goal (optional)'),{target:{value:'1:s'}})
  fireEvent.change(screen.getByLabelText('New October goal'),{target:{value:'Picnic'}})
  fireEvent.click(screen.getByRole('button',{name:'Add'}))
  await waitFor(()=>expect(api.addTask).toHaveBeenLastCalledWith('Picnic',undefined,undefined,undefined,expect.objectContaining({bucket:'month',sourceId:'s',goalId:'g'})))
  expect(lastRun().label).toBe('Add “Picnic” for “Autumn outings”')
 })
 it('Season: a goal for a year goal carries it',async()=>{
  season()
  fireEvent.click(screen.getByRole('button',{name:'Add a Fall goal'}))
  fireEvent.change(screen.getByLabelText('For a 2026 goal (optional)'),{target:{value:'0:other'}})
  fireEvent.change(screen.getByLabelText('New Fall goal'),{target:{value:'Walk daily'}})
  fireEvent.submit(screen.getByLabelText('New Fall goal').closest('form')!)
  await waitFor(()=>expect(api.addTask).toHaveBeenCalledWith('Walk daily',undefined,undefined,undefined,expect.objectContaining({bucket:'quarter',goalId:'other',context:'personal',seasonStart:new Date(2026,8,1)})))
 })
 it('Year: a new goal keeps its wording when the save fails, and has no For',async()=>{
  api.addGoal.mockResolvedValueOnce(null);open()
  fireEvent.click(screen.getByRole('button',{name:'Add a 2026 goal'}))
  expect(screen.queryByLabelText(/^For a/)).toBeNull()
  fireEvent.change(screen.getByLabelText('New 2026 goal'),{target:{value:'A meaningful year'}})
  fireEvent.click(screen.getByRole('button',{name:'Add'}))
  await screen.findByText(/Your wording is still here/)
  expect(screen.getByLabelText('New 2026 goal')).toHaveValue('A meaningful year')
  fireEvent.click(screen.getByRole('button',{name:'Add'}))
  await waitFor(()=>expect(screen.queryByLabelText('New 2026 goal')).not.toBeInTheDocument())
  expect(api.addGoal).toHaveBeenLastCalledWith(null,'A meaningful year','personal',expect.objectContaining({year:2026,id:expect.any(String)}))
  expect(lastRun().opts.ids).toEqual([api.addGoal.mock.calls[1][3].id])
 })
})

describe('proposals',()=>{
 it('shows suggestions in the list, keeps through the create path, and leaves out without writing',async()=>{
  activity.proposals=[{key:'p1',title:'Visit Mom',level:1,parentId:'g',state:'proposed',reason:'You mentioned it'},{key:'p2',title:'Garden',level:1,state:'proposed'},{key:'p3',title:'Not now',level:2,state:'proposed'}]
  season()
  const visit=within(list('Fall goals')).getByText('Visit Mom').closest('li')!
  expect(visit.querySelector('.canvas-item')).toHaveClass('is-proposed')
  expect(visit).toHaveTextContent('For Together')
  expect(within(list('Fall goals')).getByText('Garden')).toBeInTheDocument()
  expect(screen.queryByText('Not now')).not.toBeInTheDocument()
  expect(screen.getByRole('button',{name:'Keep all'})).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'Keep Visit Mom'}))
  await waitFor(()=>expect(activity.removeProposal).toHaveBeenCalledWith('p1'))
  expect(activity.setProposalState).toHaveBeenCalledWith('p1','saving')
  expect(api.addTask).toHaveBeenCalledWith('Visit Mom',undefined,undefined,undefined,expect.objectContaining({bucket:'quarter',goalId:'g'}))
  fireEvent.click(screen.getByRole('button',{name:'Leave out Garden'}))
  expect(activity.removeProposal).toHaveBeenCalledWith('p2')
  expect(api.addTask).toHaveBeenCalledTimes(1)
 })
 it('a kept suggested link moves the existing item, never a copy',async()=>{
  api.tasks=[{id:'s1',title:'Yard',bucket:'quarter'},{id:'m',title:'Trim plants',bucket:'month'}]
  activity.proposals=[{key:'k',title:'Trim the plants (model wording)',level:2,parentId:'s1',itemId:'m',state:'proposed'}]
  month()
  const suggestion=within(list('October goals')).getByText('Belongs here?').closest('li')!
  expect(suggestion).toHaveTextContent('For Yard')
  fireEvent.click(within(suggestion).getByRole('button',{name:'Link Trim plants'}))
  await waitFor(()=>expect(activity.removeProposal).toHaveBeenCalledWith('k'))
  expect(api.updateTask).toHaveBeenCalledWith('m',{sourceId:'s1'})
  expect(api.addTask).not.toHaveBeenCalled()
 })
 it('marks a failed keep and offers Retry',async()=>{
  api.addTask.mockResolvedValue(undefined)
  activity.proposals=[{key:'p1',title:'Visit Mom',level:1,parentId:'g',state:'proposed'}]
  season()
  fireEvent.click(screen.getByRole('button',{name:'Keep Visit Mom'}))
  await waitFor(()=>expect(activity.setProposalState).toHaveBeenLastCalledWith('p1','failed'))
  expect(activity.removeProposal).not.toHaveBeenCalled()
 })
})

describe('a list to look at (spec 2026-10-14, "The pages")',()=>{
 it('rows carry no ⋯ menu',()=>{
  api.tasks=[{id:'m',title:'Picnic',bucket:'month',context:'family'}]
  month()
  expect(screen.queryByRole('button',{name:'Actions for Picnic'})).toBeNull()
  open()
  expect(screen.queryByRole('button',{name:'Actions for Together'})).toBeNull()
 })
 it('a month goal triages from its row: Done, Move to November, Someday, Remove from October',async()=>{
  api.tasks=[{id:'m',title:'Picnic',bucket:'month',context:'family'}]
  api.toggleTask.mockResolvedValue(true);api.keepForward.mockResolvedValue('m');api.dropCommitment.mockResolvedValue(true);api.setBucket.mockResolvedValue(true)
  month()
  const quick=within(screen.getByRole('group',{name:'Triage Picnic'})).getAllByRole('button').map(b=>b.textContent)
  expect(quick).toEqual(['Done','Move to November','Someday','Remove from October'])
  fireEvent.click(screen.getByRole('button',{name:'Done: Picnic'}))
  await waitFor(()=>expect(api.toggleTask).toHaveBeenCalledWith('m'))
  expect(lastRun().label).toBe('Complete “Picnic”')
  await lastRun().opts.undo()
  expect(api.toggleTask).toHaveBeenCalledTimes(2)
  fireEvent.click(screen.getByRole('button',{name:'Move to November: Picnic'}))
  await waitFor(()=>expect(api.keepForward).toHaveBeenCalledWith('m',{monthStart:new Date(2026,10,1)},new Date(2026,9,1)))
  expect(lastRun().label).toBe('Move “Picnic” to November')
  expect(lastRun().opts.undo).toBeTypeOf('function')
  fireEvent.click(screen.getByRole('button',{name:'Someday: Picnic'}))
  await waitFor(()=>expect(api.setBucket).toHaveBeenCalledWith('m','someday',undefined,undefined))
  fireEvent.click(screen.getByRole('button',{name:'Remove from October: Picnic'}))
  await waitFor(()=>expect(api.dropCommitment).toHaveBeenCalledWith('m','month',new Date(2026,9,1)))
  expect(lastRun().label).toBe('Remove “Picnic” from October')
  expect(selection.setSelection).not.toHaveBeenCalled()
 })
 it('a season goal moves to the next season; a done goal has no triage',async()=>{
  api.tasks=[{id:'s',title:'Autumn outings',bucket:'quarter'},{id:'d',title:'Old one',bucket:'quarter',completed:true}]
  api.keepForward.mockResolvedValue('s')
  season()
  expect(within(screen.getByRole('group',{name:'Triage Autumn outings'})).getAllByRole('button').map(b=>b.textContent))
   .toEqual(['Done','Move to Winter','Someday','Remove from Fall'])
  fireEvent.click(screen.getByRole('button',{name:'Move to Winter: Autumn outings'}))
  await waitFor(()=>expect(api.keepForward).toHaveBeenCalledWith('s',{seasonStart:new Date(2026,11,1)},new Date(2026,8,1)))
  fireEvent.click(screen.getByRole('button',{name:/^1 done/}))
  expect(screen.queryByRole('group',{name:'Triage Old one'})).toBeNull()
 })
 it('a year goal triages from its row with Done and Archive, never Delete',async()=>{
  open()
  expect(within(screen.getByRole('group',{name:'Triage Together'})).getAllByRole('button').map(b=>b.textContent)).toEqual(['Done','Archive'])
  fireEvent.click(screen.getByRole('button',{name:'Archive: Together'}))
  await waitFor(()=>expect(api.updateGoal).toHaveBeenCalledWith('g',{status:'archived'}))
  expect(lastRun().label).toBe('Archive “Together”')
  await lastRun().opts.undo()
  expect(api.updateGoal).toHaveBeenLastCalledWith('g',{status:'active'})
  expect(api.deleteGoal).not.toHaveBeenCalled()
 })
 it('tapping a month or season goal opens its task panel, without writing',()=>{
  api.tasks=[{id:'s',title:'Autumn outings',bucket:'quarter'},{id:'m',title:'Picnic',bucket:'month'}]
  month()
  fireEvent.click(screen.getByRole('button',{name:'Picnic'}))
  expect(selection.setSelection).toHaveBeenCalledWith({kind:'task',id:'m'})
  season()
  fireEvent.click(screen.getAllByRole('button',{name:'Autumn outings'})[0])
  expect(selection.setSelection).toHaveBeenLastCalledWith({kind:'task',id:'s'})
  expect(api.updateTask).not.toHaveBeenCalled()
 })
 it('a year goal opens in place with Done and Archive, each with Undo',async()=>{
  open()
  const title=within(row('Together')).getByRole('button',{name:'Together'})
  expect(title).toHaveAttribute('aria-expanded','false')
  fireEvent.click(title)
  expect(title).toHaveAttribute('aria-expanded','true')
  expect(selection.setSelection).not.toHaveBeenCalled()
  const verbs=within(row('Together')).getAllByRole('button').map(b=>b.textContent)
  expect(verbs).toEqual(['Together','Done','Archive','Edit wording'])
  fireEvent.click(within(row('Together')).getByRole('button',{name:'Done'}))
  await waitFor(()=>expect(api.updateGoal).toHaveBeenCalledWith('g',{status:'completed'}))
  expect(lastRun().label).toBe('Complete “Together”')
  await lastRun().opts.undo()
  expect(api.updateGoal).toHaveBeenLastCalledWith('g',{status:'active'})
  fireEvent.click(within(row('Together')).getByRole('button',{name:'Archive'}))
  await waitFor(()=>expect(api.updateGoal).toHaveBeenCalledWith('g',{status:'archived'}))
 })
 it('a year goal’s wording edits in place with Undo',async()=>{
  open()
  fireEvent.click(within(row('Together')).getByRole('button',{name:'Together'}))
  fireEvent.click(screen.getByRole('button',{name:'Edit wording'}))
  const field=screen.getByLabelText('Wording for Together');expect(field).toHaveValue('Together')
  fireEvent.change(field,{target:{value:'Together, more'}});fireEvent.click(screen.getByRole('button',{name:'Save'}))
  await waitFor(()=>expect(api.updateGoal).toHaveBeenCalledWith('g',{name:'Together, more'}))
  await lastRun().opts.undo()
  expect(api.updateGoal).toHaveBeenLastCalledWith('g',{name:'Together'})
 })
 it('done goals fold into one line, open first, and open again on Show',()=>{
  api.tasks=[{id:'s',title:'Finished season',bucket:'quarter',completed:true},{id:'m',title:'Still open',bucket:'month',sourceId:'s'},
   {id:'d1',title:'Signed up for Built with Science',bucket:'month',completed:true},{id:'d2',title:'Talked with Kami',bucket:'month',completed:true},{id:'d3',title:'Third done',bucket:'month',completed:true}]
  month()
  expect(titles('October goals')).toEqual(['Still open'])
  const fold=screen.getByRole('button',{name:/^3 done · Signed up for Built with Science, Talked with Kami… Show$/})
  expect(fold).toHaveAttribute('aria-expanded','false')
  fireEvent.click(fold)
  expect(titles('October goals')).toEqual(['Still open','Signed up for Built with Science','Talked with Kami','Third done'])
  expect(row('Third done')).toHaveTextContent('Done')
  expect(fold).toHaveTextContent(/Hide$/)
  fireEvent.click(fold)
  expect(screen.queryByText('Third done')).toBeNull()
 })
 it('with only done goals, the list says nothing is open and the fold holds them',()=>{
  api.tasks=[{id:'d',title:'Done milestone',bucket:'month',completed:true}]
  month()
  expect(screen.getByText('Nothing open for October yet.')).toBeInTheDocument()
  expect(screen.getByRole('button',{name:/^1 done · Done milestone Show$/})).toBeInTheDocument()
 })
 it('keeps what an item carries on the row; the panel holds the rest',()=>{
  api.tasks=[{id:'s',title:'Back to school',bucket:'quarter',links:[{url:'https://supplies.test'}]},{id:'m',title:'Call Cami',bucket:'month',sourceId:'s',contactId:'cami',subtasks:[{id:'q1',title:'Pickup?'},{id:'q2',title:'Forms?',completed:true}]}]
  month()
  const r=row('Call Cami')
  expect(within(r).getByRole('img',{name:'Has contact, steps 1 of 2'})).toBeInTheDocument()
  fireEvent.click(within(r).getByRole('button',{name:'Call Cami'}))
  expect(selection.setSelection).toHaveBeenCalledWith({kind:'task',id:'m'})
 })
 it('goes on one horizon down, for the period on screen',()=>{
  api.tasks=[{id:'s',title:'Autumn outings',bucket:'quarter',goalId:'g'},{id:'m',title:'Picnic',bucket:'month'}]
  month()
  expect(screen.getByRole('link',{name:/^Go to (this|that) week →$/})).toHaveAttribute('href','/week?view=alongside&date=2026-10-09')
 })
 it('Season and Year go on to the month and the season',()=>{
  api.tasks=[{id:'s',title:'Autumn outings',bucket:'quarter',goalId:'g'}]
  season()
  expect(screen.getByRole('link',{name:'Go to October →'})).toHaveAttribute('href',expect.stringMatching(/^\/month\?view=constellation&horizon=2/))
  open()
  expect(screen.getAllByRole('link',{name:'Go to Fall →'})[0]).toHaveAttribute('href',expect.stringMatching(/^\/season\?view=constellation&horizon=1/))
 })
})

describe('the header sentence',()=>{
 it('says the counts and how many serve the season, from rules',()=>{
  api.tasks=[{id:'s',title:'Autumn outings',bucket:'quarter'},{id:'a',title:'Picnic',bucket:'month',sourceId:'s'},{id:'b',title:'Leaves',bucket:'month',sourceId:'s'},
   {id:'c',title:'Taxes',bucket:'month'},{id:'d',title:'Done one',bucket:'month',completed:true}]
  month()
  expect(screen.getByText('3 open, 1 done. Two serve a Fall goal.')).toHaveClass('plan-sentence')
 })
 it('an empty list says nothing',()=>{
  month()
  expect(document.querySelector('.plan-sentence')).toBeNull()
 })
})

describe('a pending change card, dashed on the list',()=>{
 const card=(ops:any[])=>{activity.changeSet={key:'k',title:'Plan November',state:'proposed',ops:ops.map((o,i)=>({key:`o${i}`,...o}))}}
 it('marks what leaves and what is done, and adds what is new, here and on the coming month beside',()=>{
  const oct=new Date(2026,9,1)
  api.tasks=[{id:'sab',title:'Plan sabbatical',bucket:'month',monthStart:oct},{id:'umb',title:'Toss umbrella',bucket:'month',monthStart:oct},{id:'hal',title:'Halloween costumes',bucket:'month',monthStart:oct}]
  card([
   {op:'plan_carry',level:'month',itemId:'sab',periodStart:'2026-10-01',periodLabel:'October',toPeriodStart:'2026-11-01',toPeriodLabel:'November',title:'Plan sabbatical'},
   {op:'plan_let_go',level:'month',itemId:'umb',periodStart:'2026-10-01',title:'Toss umbrella'},
   {op:'done',taskId:'hal',title:'Halloween costumes'},
   {op:'plan_add',level:'month',periodStart:'2026-11-01',title:'Book the cabin',parentTitle:'Plan winter vacation'},
   {op:'plan_add',level:'month',periodStart:'2026-10-01',title:'Call Mom'},
  ])
  month()
  const sab=within(list('October goals')).getByText('Plan sabbatical').closest('li')!
  expect(sab).toHaveClass('is-preview','is-leaving','is-struck')
  expect(sab).toHaveTextContent('→ November')
  expect(row('Toss umbrella')).toHaveTextContent('Let go')
  expect(row('Halloween costumes')).toHaveClass('is-proposed','is-struck')
  const here=within(list('October goals')).getByText('Call Mom').closest('li')!
  expect(here).toHaveClass('plan-preview-row','is-proposed')
  const beside=screen.getByRole('region',{name:'November, proposed'})
  const cabin=within(beside).getByText('Book the cabin').closest('li')!
  expect(cabin).toHaveClass('is-proposed')
  expect(cabin).toHaveTextContent('For Plan winter vacation')
  expect(within(beside).getByText('Plan sabbatical').closest('li')).toHaveTextContent('From October')
  expect(api.updateTask).not.toHaveBeenCalled()
 })
 it('without a card the list is plain and nothing opens beside it',()=>{
  api.tasks=[{id:'m',title:'Picnic',bucket:'month'}]
  month()
  expect(row('Picnic')).not.toHaveClass('is-preview')
  expect(screen.queryByRole('region',{name:/proposed$/})).toBeNull()
 })
 it('a year goal met',()=>{
  card([{op:'plan_done',level:'year',itemId:'g',periodStart:'2026-01-01',title:'Together'}])
  open()
  expect(row('Together')).toHaveClass('is-proposed','is-struck')
  expect(row('Together')).toHaveTextContent('Met')
 })
})

describe('one conversation, at the foot (approved Season board, 2026-10-10)',()=>{
 beforeEach(()=>{vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date(2026,9,11,9))})
 afterEach(()=>{vi.useRealTimers()})
 it('hands its walk to the docked bar instead of showing its own',()=>{
  const setWalk=vi.fn()
  render(<ConversationWalkContext.Provider value={setWalk}><MemoryRouter initialEntries={['/season?view=constellation&horizon=1']}><Routes>
   <Route path="/season" element={<ConstellationPage/>}/>
  </Routes></MemoryRouter></ConversationWalkContext.Provider>)
  expect(screen.queryByRole('button',{name:/with me$/})).not.toBeInTheDocument()
  expect(setWalk).toHaveBeenLastCalledWith({label:'Plan this season with me',message:expect.stringContaining('Fall 2026 across my year goals')})
  expect(screen.getByRole('heading',{level:1})).toHaveTextContent('Fall 2026')
 })
 it('without the bar, offers the walk itself, naming a past period, and asks without supplying',()=>{
  open('/season?view=constellation&horizon=1&start=2025-10-01')
  fireEvent.click(screen.getByRole('button',{name:'Plan Fall 2025 with me'}))
  const message=launcher.openAssistant.mock.calls[0][0].message
  expect(message).toContain('Fall 2025 across my year goals, one at a time')
  expect(message).toContain("don't suggest season goals of your own")
 })
})

describe('on schedule (spec 2026-10-14, "The schedule")',()=>{
 afterEach(()=>{vi.useRealTimers()})
 const inBar=(url:string)=>{
  const setWalk=vi.fn()
  render(<ConversationWalkContext.Provider value={setWalk}><MemoryRouter initialEntries={[url]}><Routes>
   {['/year','/season','/month'].map(p=><Route key={p} path={p} element={<ConstellationPage/>}/>)}
  </Routes></MemoryRouter></ConversationWalkContext.Provider>)
  return setWalk
 }
 it('three days before November, with nothing on it yet, the bar offers Plan November',()=>{
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date(2026,9,30,9))
  expect(inBar('/month?view=constellation&horizon=2')).toHaveBeenLastCalledWith({label:'Plan November',message:'Plan November.'})
 })
 it('the coming page offers it too; another month does not',()=>{
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date(2026,9,30,9))
  expect(inBar('/month?view=constellation&horizon=2&start=2026-11-01')).toHaveBeenLastCalledWith({label:'Plan November',message:'Plan November.'})
  cleanup()
  expect(inBar('/month?view=constellation&horizon=2&start=2026-12-01')).toHaveBeenLastCalledWith({label:'Plan December 2026 with me',message:expect.any(String)})
 })
 it('once November has a list, or the talk is put off, it is the usual walk',()=>{
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date(2026,9,30,9))
  api.tasks=[{id:'n',title:'Book the cabin',bucket:'month',monthStart:new Date(2026,10,1),createdAt:new Date(2026,9,1)}]
  expect(inBar('/month?view=constellation&horizon=2')).toHaveBeenLastCalledWith({label:'Plan this month with me',message:expect.any(String)})
  cleanup();api.tasks=[]
  localStorage.setItem('symphony.planTalk.dismissed',JSON.stringify({later:{},skipped:{'month:2026-11-01':true}}))
  expect(inBar('/month?view=constellation&horizon=2')).toHaveBeenLastCalledWith({label:'Plan this month with me',message:expect.any(String)})
 })
 it('Year: from Dec 25, Plan 2027 while 2027 has no goals',()=>{
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date(2026,11,27,9))
  expect(inBar('/year?view=constellation')).toHaveBeenLastCalledWith({label:'Plan 2027',message:'Plan 2027.'})
  cleanup()
  api.goals=[...api.goals,{id:'n',name:'Run a half marathon',year:2027,status:'active',context:'personal'}]
  expect(inBar('/year?view=constellation')).toHaveBeenLastCalledWith({label:'Plan this year with me',message:expect.any(String)})
 })
 it('without the bar (phones) the page’s own walk names the talk and sends it',()=>{
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date(2026,9,30,9))
  open('/month?view=constellation&horizon=2')
  fireEvent.click(screen.getByRole('button',{name:'Plan November'}))
  expect(launcher.openAssistant).toHaveBeenCalledWith({message:'Plan November.',autoSend:true})
 })
})

describe('the review by hand (2026-10-17)',()=>{
 it('Month: Review October lists the open lines with the row verbs; each saves through the activity',async()=>{
  api.tasks=[{id:'a',title:'Book the cabin',bucket:'month'},{id:'b',title:'Pay taxes',bucket:'month',completed:true},{id:'c',title:'Plan sabbatical',bucket:'month',carried:true}]
  api.toggleTask.mockResolvedValue(true)
  month()
  expect(review.horizon).toBe('monthly');expect(review.token).toBe('2026-10')
  fireEvent.click(screen.getByRole('button',{name:'Review October'}))
  expect(screen.getByTestId('where').textContent).toContain('review=1')
  expect(screen.queryByRole('link',{name:/guided introduction/})).toBeNull()
  expect(document.querySelector('.plan-sentence')).toBeNull()
  const open=screen.getByRole('list',{name:'Still open in October'})
  expect(within(open).getAllByRole('listitem')).toHaveLength(1)
  expect(within(open).getAllByRole('button').map(b=>b.textContent)).toEqual(['Done','Move to November','Someday','Remove from October'])
  expect(screen.getByText('Plan sabbatical').closest('li')).toHaveTextContent('Moved on')
  fireEvent.click(within(open).getByRole('button',{name:'Done: Book the cabin'}))
  await waitFor(()=>expect(lastRun().label).toBe('Complete “Book the cabin”'))
  expect(lastRun().opts.undo).toBeDefined()
  fireEvent.click(screen.getAllByRole('button',{name:'Close review'})[0])
  expect(screen.getByTestId('where').textContent).not.toContain('review=1')
  expect(screen.getByRole('list',{name:'October goals'})).toBeInTheDocument()
 })
 it('Season and Year review under their own records; a year goal can move on to next year',async()=>{
  season('&review=1')
  expect(review.horizon).toBe('seasonal');expect(review.token).toBe('2026-fall')
  expect(screen.getByRole('heading',{name:'Review Fall'})).toBeInTheDocument()
  cleanup()
  open('/year?view=constellation&start=2026-10-09&review=1')
  expect(review.horizon).toBe('annual');expect(review.token).toBe('2026')
  const open2=screen.getByRole('list',{name:'Still open in 2026'})
  expect(within(open2).getAllByRole('button',{name:/Together$/}).map(b=>b.textContent)).toEqual(['Done','Move to 2027','Archive'])
  fireEvent.click(within(open2).getByRole('button',{name:'Move to 2027: Together'}))
  await waitFor(()=>expect(api.addGoal).toHaveBeenCalledWith(null,'Together','personal',expect.objectContaining({year:2027,carriedFrom:'g'})))
  expect(lastRun().label).toBe('Move “Together” to 2027')
 })
 it('finishing says who reviewed; the onward step goes to the next period',async()=>{
  review.reviewed={wentWell:'',didnt:'',at:new Date(2026,9,31),authorId:'u2'}
  try{
   month('&review=1')
   expect(screen.getByText(/Reviewed Oct 31 by Iris/)).toBeInTheDocument()
   fireEvent.click(screen.getByRole('button',{name:'Update review'}))
   await waitFor(()=>expect(review.finish).toHaveBeenCalledWith({wentWell:'',didnt:''}))
   fireEvent.click(await screen.findByRole('button',{name:'Go to November →'}))
   expect(screen.getByTestId('where').textContent).toContain('start=2026-11-01')
   expect(screen.getByTestId('where').textContent).not.toContain('review=1')
  }finally{review.reviewed=null}
 })
})

describe('a line moved on is not open here (2026-10-17)',()=>{
 it('Month: out of the count and the verbs, folded with the done, named where it went',()=>{
  api.tasks=[{id:'s',title:'Autumn outings',bucket:'quarter',goalId:'g'},{id:'a',title:'Come up with October business plan',bucket:'month',sourceId:'s',carried:true,carriedTo:new Date(2026,10,1)},
   {id:'b',title:'Book the cabin',bucket:'month'},{id:'c',title:'Pay taxes',bucket:'month',completed:true}]
  month()
  expect(screen.getByText('1 open, 1 done, 1 moved on.')).toBeInTheDocument()
  expect(titles('October goals')).toEqual(['Book the cabin'])
  const fold=screen.getByRole('button',{name:/1 done, 1 moved on/})
  fireEvent.click(fold)
  const moved=row('Come up with October business plan')
  expect(within(moved).getByText('Moved to November')).toBeInTheDocument()
  expect(within(moved).queryByRole('group',{name:/Triage/})).toBeNull()
  // Not named under its season goal as something still moving it.
  cleanup();season()
  expect(row('Autumn outings').querySelector('.plan-item-below')).toBeNull()
 })
 it('Year: a goal carried into next year reads Moved to 2027',()=>{
  api.goals=[...GOALS.map(g=>({...g})),{id:'g27',name:'Together',year:2027,status:'active',carriedFrom:'g'}]
  open()
  expect(titles('2026 goals')).toEqual(['Health'])
  fireEvent.click(screen.getByRole('button',{name:/1 moved on/}))
  expect(within(row('Together')).getByText('Moved to 2027')).toBeInTheDocument()
 })
})

describe('I’m happy with October (2026-10-17)',()=>{
 it('the period on screen can be marked planned; once it is, the page says so',async()=>{
  plan.saved=null
  month()
  fireEvent.click(screen.getByRole('button',{name:'I’m happy with October'}))
  await waitFor(()=>expect(plan.save).toHaveBeenCalledWith({wentWell:'',didnt:''}))
  cleanup()
  plan.saved={at:new Date(2026,9,3),authorId:'u1',notes:{}}
  try{
   month()
   expect(screen.getByText(/October planned Oct 3/)).toBeInTheDocument()
   expect(screen.queryByRole('button',{name:'I’m happy with October'})).toBeNull()
  }finally{plan.saved=null}
 })
 it('a period already over is reviewed, not planned',()=>{
  open('/month?view=constellation&horizon=2&start=2025-03-09')
  expect(screen.getByRole('button',{name:'Review March'})).toBeInTheDocument()
  expect(screen.queryByRole('button',{name:/I’m happy with/})).toBeNull()
 })
})

