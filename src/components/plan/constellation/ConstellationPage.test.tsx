import {render,screen,fireEvent,waitFor,within,cleanup,createEvent,act} from '@testing-library/react'
import {MemoryRouter,Routes,Route,useLocation} from 'react-router-dom'
import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest'
import {ConstellationPage} from './ConstellationPage'
import {ConversationWalkContext} from '@/components/canvas/conversationWalk'
const api=vi.hoisted(()=>({addGoal:vi.fn(),updateGoal:vi.fn(),deleteGoal:vi.fn(),addTask:vi.fn(),updateTask:vi.fn(),refetch:vi.fn(),pushTask:vi.fn(),setBucket:vi.fn(),updateTasksBulk:vi.fn(),toggleTask:vi.fn(),deleteTask:vi.fn(),keepForward:vi.fn(),dropCommitment:vi.fn(),updateTaskOrders:vi.fn(),redraw:(()=>{}) as ()=>void,tasks:[] as any[],goals:[] as any[]}))
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
// The page's own task list: a write that changes it (an optimistic order) redraws it, as the hook does.
vi.mock('@/hooks/useSupabaseTasks',async()=>{const {useReducer}=await import('react');return{useSupabaseTasks:()=>{const [,redraw]=useReducer((n:number)=>n+1,0);api.redraw=redraw;return{tasks:api.tasks,loading:false,error:null,...api}}}})
// The area and people filters: pass-through, unless a test turns them on
// (privacy), when the real rules run with the layers and people it names.
const filters=vi.hoisted(()=>({on:false,layers:new Set<string>(),people:[] as string[]}))
vi.mock('@/hooks/useDomain',()=>({useDomain:()=>({layers:filters.on?filters.layers:[],soleDomain:'personal'})}))
vi.mock('@/hooks/useAssigneeFilter',()=>({useAssigneeFilter:()=>[filters.on?filters.people:[]]}))
vi.mock('@/hooks/useFamilyMembers',()=>({useFamilyMembers:()=>({getCurrentUserMember:()=>null,members:[{auth_user_id:'u2',name:'Iris'}]})}))
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>({user:{id:'u1'}})}))
const review=vi.hoisted(()=>({reviewed:null as any,prevReviewed:null as any,loading:false,prevLoading:false,mine:null as any,finish:vi.fn(async()=>true),seen:[] as string[]}))
// The page reads two plan records: the period on screen's (saved, loading),
// then the next one's (next, nextLoading).
const plan=vi.hoisted(()=>({saved:null as any,loading:false,next:null as any,nextLoading:false,n:0,seen:[] as string[],save:vi.fn(async()=>true)}))
vi.mock('@/hooks/usePlanningSession',async(importOriginal)=>({...await importOriginal<any>(),usePlanningSession:(horizon:string,token:string)=>{
 const first=plan.n++%2===0;plan.seen.push(`${horizon}:${token}`)
 return{saved:first?plan.saved:plan.next,mine:null,loading:first?plan.loading:plan.nextLoading,loadedToken:'',error:null,reload:vi.fn(),save:plan.save}}}))
// The page reads two: the period on screen's, then the one before's (its own Review, or last period's).
vi.mock('@/hooks/usePeriodReview',()=>({usePeriodReview:(horizon:string,token:string)=>{const first=!review.seen.length||review.seen.length%2===0;review.seen.push(`${horizon}:${token}`);return{reviewed:first?review.reviewed:review.prevReviewed,mine:review.mine,loading:first?review.loading:review.prevLoading,error:null,reload:vi.fn(),finish:review.finish}}}))
// This file's committedTo stub says nothing about status; the review reads it from the fixture.
vi.mock('@/lib/planning/periodReview',async(importOriginal)=>({...await importOriginal<any>(),taskReviewState:(t:any)=>t.completed?'done':t.carried?'moved':'open',movedOn:(t:any)=>t.carried&&!t.completed?{to:t.carriedTo}:null}))
vi.mock('@/hooks/useHouseholdSeasons',()=>({useHouseholdSeasons:()=>({seasons:[{name:'Spring',month:3,day:1},{name:'Summer',month:6,day:1},{name:'Fall',month:9,day:1},{name:'Winter',month:12,day:1}]})}))
vi.mock('@/lib/today/domainFilter',async(importOriginal)=>{const real=await importOriginal<any>();return{...real,
 filterTasksForLayers:(t:any,l:any)=>filters.on?real.filterTasksForLayers(t,l):t,matchesLayers:(c:any,l:any)=>filters.on?real.matchesLayers(c,l):true}})
vi.mock('@/lib/planning/peopleLens',async(importOriginal)=>{const real=await importOriginal<any>();return{
 planPeopleLens:(s:any,me:any)=>filters.on?real.planPeopleLens(s,me):{keep:()=>true,scopeId:null}}})
vi.mock('../v2/AddArea',()=>({useAddArea:()=>({area:'personal',picker:null})}))
vi.mock('@/lib/planning/periodPage',async(importOriginal)=>({...await importOriginal<any>(),selectPeriodTasks:(tasks:any[],level:string,start:Date)=>tasks.filter(t=>t.bucket===(level==='season'?'quarter':'month')&&(!t.monthStart||+t.monthStart===+start))}))
vi.mock('@/lib/placement/model',async(importOriginal)=>({...await importOriginal<any>(),committedTo:(t:any)=>t.bucket==='week'?{}:undefined}))
const toast=vi.hoisted(()=>({showToast:vi.fn()}))
vi.mock('@/hooks/useToast',async(importOriginal)=>({...await importOriginal<any>(),showToast:toast.showToast}))
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
  <Route path="/getting-started" element={<Where/>}/>
 </Routes></MemoryRouter>)
}
const season=(extra='')=>open('/season?view=constellation&horizon=1&start=2026-10-09'+extra)
const month=(extra='')=>open('/month?view=constellation&horizon=2&start=2026-10-09'+extra)
const list=(name:string)=>screen.getByRole('list',{name})
const titles=(name:string)=>within(list(name)).getAllByRole('listitem').map(li=>li.querySelector('.plan-item-title')?.textContent)
const row=(title:string)=>screen.getByText(title,{selector:'.plan-item-title'}).closest('li')!
const lastRun=()=>activity.calls[activity.calls.length-1]
/** A row's tag for where it stands one horizon down (reviewed design, 2026-10-20). */
const tag=(title:string)=>row(title).querySelector('.plan-tag-below')
// The header (calm pass, 2026-10-18): title row, fact line, one primary, ⋯.
const head=()=>document.querySelector<HTMLElement>('header.plan-head')!
const facts=()=>document.querySelector('.plan-facts')?.textContent??null
const primaries=()=>Array.from(head().querySelectorAll('.plan-primary')).map(b=>b.textContent)
const MENU=['Year options','Season options','Month options']
const menuLabel=()=>MENU.find(l=>within(head()).queryByRole('button',{name:l}))!
/** Opens the header's ⋯ and returns what it offers, in order. */
const menu=()=>{
 const label=menuLabel()
 if(!screen.queryByRole('menu',{name:label}))fireEvent.click(within(head()).getByRole('button',{name:label}))
 return Array.from(screen.getByRole('menu',{name:label}).querySelectorAll('[role^="menuitem"]')).map(b=>b.textContent)
}
const choose=(name:string)=>{menu();fireEvent.click(screen.getByRole(/^Show done$/.test(name)?'menuitemcheckbox':'menuitem',{name}))}
const at=(d:Date)=>{vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(d)}
/** Planning opens on Looking back (the period before's review); this moves past it to Choose. */
const pastLookingBack=async()=>{fireEvent.click(screen.getByRole('button',{name:/^On to /}));await screen.findByRole('radiogroup',{name:'View'})}
const REVIEWED={wentWell:'',didnt:'',at:new Date(2026,9,2),authorId:'u1'}
beforeEach(()=>{
 vi.clearAllMocks();review.seen=[];review.prevReviewed=null;plan.n=0;plan.seen=[];plan.next=null;plan.nextLoading=false;filters.on=false;api.tasks=[];api.goals=GOALS.map(g=>({...g}));activity.calls=[];activity.proposals=[];activity.changeSet=null
 localStorage.clear()
 HTMLElement.prototype.scrollIntoView=vi.fn()
 api.updateTask.mockResolvedValue(true);api.addTask.mockResolvedValue('new');api.addGoal.mockResolvedValue({id:'new'});api.updateGoal.mockResolvedValue(true)
})

describe('where you are',()=>{
 it('opens the horizon its URL names, with the period, and no horizon tabs of its own',()=>{
  month()
  expect(screen.getByRole('heading',{level:1})).toHaveTextContent('October 2026')
  // Calm pass: a month's dates go without saying; a season's are its fact line.
  expect(screen.queryByText('Oct 1 – 31')).toBeNull()
  // The top bar names the horizon now (Today · Week · Month · Season · Year).
  expect(screen.queryByRole('navigation',{name:'Planning horizon'})).toBeNull()
  expect(screen.queryByRole('link',{name:'Week →'})).toBeNull()
  open('/year?view=constellation&horizon=1&start=2026-10-09')
  expect(screen.getAllByRole('heading',{level:1})[1]).toHaveTextContent('Fall 2026')
  expect(document.querySelectorAll('.plan-facts')[1]).toHaveTextContent(/^Sep 1 – Nov 30/)
 })
 it('steps periods with the arrows and offers the way back in ⋯',()=>{
  season()
  expect(menu()).not.toContain('Back to this season')
  fireEvent.click(screen.getByRole('button',{name:'Next season'}))
  expect(screen.getByTestId('where').textContent).toContain('start=2026-12-01')
  expect(screen.getByRole('heading',{level:1})).toHaveTextContent('Winter')
  expect(screen.queryByRole('button',{name:'Back to this season'})).toBeNull()
  choose('Back to this season')
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
  // Linked: what it is for, and one tag for what is under it in October (named on hover).
  expect(row('Unhurried weekends')).toHaveTextContent('For Together')
  expect(tag('Unhurried weekends')).toHaveTextContent(/^October · 2$/)
  expect(tag('Unhurried weekends')).toHaveAttribute('title','Picnic · Leaf pile')
  // On its own: nothing more is said.
  expect(row('Fix the gate').querySelector('.plan-item-parent')).toBeNull()
  expect(tag('Fix the gate')).toBeNull()
  expect(screen.queryByText(/\d+ month goals?/)).toBeNull()
 })
 it('Month names the season goal it is for and tags what it has this week',()=>{
  api.tasks=[{id:'s',title:'Autumn outings',bucket:'quarter',goalId:'g'},{id:'m',title:'Picnic',bucket:'month',sourceId:'s'},{id:'x',title:'Taxes',bucket:'month'},
   {id:'w',title:'Book the shelter',bucket:'week',sourceId:'m'}]
  month()
  expect(titles('October goals')).toEqual(['Picnic','Taxes'])
  expect(row('Picnic')).toHaveTextContent('For Autumn outings')
  expect(tag('Picnic')).toHaveTextContent(/^(This week|Week of Oct \d+)$/)
  expect(tag('Picnic')).toHaveAttribute('title','Book the shelter')
  expect(tag('Taxes')).toBeNull()
  expect(row('Taxes').querySelector('.plan-item-parent')).toBeNull()
 })
 // Spec 2026-10-19: a step written as a subtask, once on this week, is named
 // with the rest (this file's committedTo stub puts a 'week' row on this week).
 it('Month counts a line’s subtask step that is on this week',()=>{
  api.tasks=[{id:'m',title:'Organize documents',bucket:'month',subtasks:[{id:'st',title:'Inventory everything',parentTaskId:'m',bucket:'week'},{id:'st2',title:'Scan it all',parentTaskId:'m',bucket:'month'}]}]
  month()
  expect(tag('Organize documents')).toHaveAttribute('title','Inventory everything')
 })
 it('Year lists the year goals and tags the season that holds some under them',()=>{
  api.tasks=[{id:'s',title:'Autumn outings',bucket:'quarter',goalId:'g'}]
  open()
  expect(titles('2026 goals')).toEqual(['Together','Health'])
  expect(tag('Together')).toHaveTextContent(/^Fall$/)
  expect(tag('Health')).toBeNull()
 })
 it('an empty period says so plainly',()=>{
  month()
  expect(screen.getByText('Nothing for October yet.')).toBeInTheDocument()
  expect(screen.queryByRole('link',{name:/^Go to/})).toBeNull()
 })
})

describe('the level above, folded to one line',()=>{
 it('Month: the season goals are shown unless hidden, and fold and open in place, without writing',()=>{
  api.tasks=[{id:'s',title:'Autumn outings',bucket:'quarter'},{id:'t',title:'Strength',bucket:'quarter'},{id:'m',title:'Picnic',bucket:'month'}]
  month()
  const line=screen.getByRole('button',{name:/Fall goals.*the season October serves/})
  expect(line).toHaveAttribute('aria-expanded','true')
  expect(within(list('Fall goals')).getAllByRole('listitem').map(li=>li.textContent)).toEqual(['Autumn outings','Strength'])
  fireEvent.click(line)
  expect(screen.queryByRole('list',{name:'Fall goals'})).toBeNull()
  fireEvent.click(line)
  expect(within(list('Fall goals')).getAllByRole('listitem').map(li=>li.textContent)).toEqual(['Autumn outings','Strength'])
  expect(api.updateTask).not.toHaveBeenCalled()
 })
 it('the toggle names the list it opens, and the open list carries its own Hide',()=>{
  api.tasks=[{id:'s',title:'Autumn outings',bucket:'quarter'},{id:'m',title:'Picnic',bucket:'month'}]
  month()
  const line=screen.getByRole('button',{name:/Fall goals.*the season October serves/})
  expect(line).toHaveTextContent(/Hide Fall list$/)
  const panel=screen.getByRole('complementary',{name:'Fall goals'})
  fireEvent.click(within(panel).getByRole('button',{name:'Hide Fall list'}))
  expect(screen.queryByRole('complementary',{name:'Fall goals'})).toBeNull()
  expect(line).toHaveAttribute('aria-expanded','false')
  expect(line).toHaveTextContent(/Show Fall list$/)
  cleanup()
  season()
  expect(screen.getByRole('button',{name:/2026 goals/})).toHaveTextContent(/Show 2026 list$/)
 })
 it('sits beside the list, and stays hidden for this viewer once hidden',()=>{
  api.tasks=[{id:'s',title:'Autumn outings',bucket:'quarter'},{id:'m',title:'Picnic',bucket:'month'}]
  month()
  expect(screen.getByRole('complementary',{name:'Fall goals'})).toContainElement(list('Fall goals'))
  expect(titles('October goals')).toEqual(['Picnic'])
  fireEvent.click(screen.getByRole('button',{name:/Fall goals.*the season October serves/}))
  expect(localStorage.getItem('symphony.plan.aboveOpen')).toBe('0')
  cleanup()
  month()
  expect(screen.getByRole('button',{name:/Fall goals.*the season October serves/})).toHaveAttribute('aria-expanded','false')
  expect(screen.queryByRole('list',{name:'Fall goals'})).toBeNull()
 })
 it('Season: the year goals',()=>{
  season()
  expect(screen.getByRole('button',{name:/2026 goals.*the year Fall serves/})).toHaveAttribute('aria-expanded','true')
  expect(within(list('2026 goals')).getAllByRole('listitem').map(li=>li.textContent)).toEqual(['Together','Health'])
 })
 it('Year is a single list: nothing beside it, and nothing to show or hide',()=>{
  api.goals=[...GOALS.map(g=>({...g})),{id:'old',name:'Learn to sail',year:2025,status:'active',context:'personal'}]
  open()
  expect(screen.queryByRole('complementary')).toBeNull()
  expect(screen.queryByRole('button',{name:/2025 goals/})).toBeNull()
  expect(screen.queryByText('Learn to sail')).toBeNull()
  expect(menu().filter(l=>/list$/.test(l??''))).toEqual([])
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
 // One word per move, as in planning (reviewed design, 2026-10-20).
 it('a month goal triages from its row: This week, Done, Later ▾ (Next month · Someday), Off October',async()=>{
  at(new Date(2026,9,20))
  try{
   api.tasks=[{id:'m',title:'Picnic',bucket:'month',context:'family'}]
   api.toggleTask.mockResolvedValue(true);api.keepForward.mockResolvedValue('m');api.dropCommitment.mockResolvedValue(true);api.setBucket.mockResolvedValue(true)
   month()
   const quick=within(screen.getByRole('group',{name:'Triage Picnic'})).getAllByRole('button').map(b=>b.textContent)
   expect(quick).toEqual(['This week','Done','Later ▾','Off October'])
   fireEvent.click(screen.getByRole('button',{name:'This week: Picnic'}))
   await waitFor(()=>expect(api.keepForward).toHaveBeenCalledWith('m',{weekStart:expect.any(Date)}))
   expect(lastRun().label).toBe('This week: “Picnic”')
   expect(lastRun().opts.undo).toBeTypeOf('function')
   fireEvent.click(screen.getByRole('button',{name:'Done: Picnic'}))
   await waitFor(()=>expect(api.toggleTask).toHaveBeenCalledWith('m'))
   expect(lastRun().label).toBe('Complete “Picnic”')
   await lastRun().opts.undo()
   expect(api.toggleTask).toHaveBeenCalledTimes(2)
   // Later opens its two choices in place; Cancel puts the verbs back.
   fireEvent.click(screen.getByRole('button',{name:'Later: Picnic'}))
   expect(within(screen.getByRole('group',{name:'Later: Picnic'})).getAllByRole('button').map(b=>b.textContent)).toEqual(['Next month','Someday','Cancel'])
   fireEvent.click(screen.getByRole('button',{name:'Next month: Picnic'}))
   await waitFor(()=>expect(api.keepForward).toHaveBeenCalledWith('m',{monthStart:new Date(2026,10,1)},new Date(2026,9,1)))
   expect(lastRun().label).toBe('Move “Picnic” to November')
   expect(lastRun().opts.undo).toBeTypeOf('function')
   fireEvent.click(screen.getByRole('button',{name:'Later: Picnic'}))
   fireEvent.click(screen.getByRole('button',{name:'Someday: Picnic'}))
   await waitFor(()=>expect(api.setBucket).toHaveBeenCalledWith('m','someday',undefined,undefined))
   // Nothing above holds it: Off October ends only this month.
   fireEvent.click(screen.getByRole('button',{name:'Off October: Picnic'}))
   await waitFor(()=>expect(api.dropCommitment).toHaveBeenCalledWith('m','month',new Date(2026,9,1)))
   expect(lastRun().label).toBe('Off October: “Picnic”')
   expect(selection.setSelection).not.toHaveBeenCalled()
  }finally{vi.useRealTimers()}
 })
 it('a month goal under a Fall goal goes Back to Fall: put on Fall first, then off October',async()=>{
  api.tasks=[{id:'s',title:'Autumn outings',bucket:'quarter'},{id:'m',title:'Picnic',bucket:'month',sourceId:'s'}]
  api.keepForward.mockResolvedValue('m');api.dropCommitment.mockResolvedValue(true)
  month()
  fireEvent.click(screen.getByRole('button',{name:'Back to Fall: Picnic'}))
  await waitFor(()=>expect(api.dropCommitment).toHaveBeenCalledWith('m','month',new Date(2026,9,1)))
  expect(api.keepForward).toHaveBeenCalledWith('m',{seasonStart:new Date(2026,8,1)})
  expect(lastRun().label).toBe('Back to Fall: “Picnic”')
  expect(screen.queryByRole('button',{name:'Off October: Picnic'})).toBeNull()
 })
 it('a season goal moves to the next season; a done goal has no triage',async()=>{
  api.tasks=[{id:'s',title:'Autumn outings',bucket:'quarter',goalId:'g'},{id:'d',title:'Old one',bucket:'quarter',completed:true}]
  api.keepForward.mockResolvedValue('s')
  season()
  expect(within(screen.getByRole('group',{name:'Triage Autumn outings'})).getAllByRole('button').map(b=>b.textContent).filter(l=>l!=='October'))
   .toEqual(['Done','Later ▾','Back to 2026'])
  fireEvent.click(screen.getByRole('button',{name:'Later: Autumn outings'}))
  fireEvent.click(screen.getByRole('button',{name:'Next season: Autumn outings'}))
  await waitFor(()=>expect(api.keepForward).toHaveBeenCalledWith('s',{seasonStart:new Date(2026,11,1)},new Date(2026,8,1)))
  fireEvent.click(screen.getByRole('button',{name:/^1 done/}))
  expect(screen.queryByRole('group',{name:'Triage Old one'})).toBeNull()
 })
 it('a season goal takes itself into this month: October',async()=>{
  at(new Date(2026,9,20))
  try{
   api.tasks=[{id:'s',title:'Autumn outings',bucket:'quarter'}]
   api.keepForward.mockResolvedValue('s')
   season()
   expect(within(screen.getByRole('group',{name:'Triage Autumn outings'})).getAllByRole('button').map(b=>b.textContent)).toEqual(['October','Done','Later ▾','Off Fall'])
   fireEvent.click(screen.getByRole('button',{name:'October: Autumn outings'}))
   await waitFor(()=>expect(api.keepForward).toHaveBeenCalledWith('s',{monthStart:new Date(2026,9,1)}))
   expect(lastRun().label).toBe('October: “Autumn outings”')
  }finally{vi.useRealTimers()}
 })
 it('a year goal triages from its row with Done and Let go, which asks once, never Delete',async()=>{
  open()
  expect(within(screen.getByRole('group',{name:'Triage Together'})).getAllByRole('button').map(b=>b.textContent)).toEqual(['Done','Let go'])
  fireEvent.click(screen.getByRole('button',{name:'Let go: Together'}))
  const ask=screen.getByRole('group',{name:'Let go? Together'})
  expect(ask).toHaveTextContent('Off every list?')
  expect(api.updateGoal).not.toHaveBeenCalled()
  // Keep changes nothing.
  fireEvent.click(within(ask).getByRole('button',{name:'Keep'}))
  expect(api.updateGoal).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button',{name:'Let go: Together'}))
  fireEvent.click(within(screen.getByRole('group',{name:'Let go? Together'})).getByRole('button',{name:'Let go: Together'}))
  await waitFor(()=>expect(api.updateGoal).toHaveBeenCalledWith('g',{status:'archived'}))
  expect(lastRun().label).toBe('Let go of “Together”')
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
 it('a year goal opens in place with Done and Let go, each with Undo',async()=>{
  open()
  const title=within(row('Together')).getByRole('button',{name:'Together'})
  expect(title).toHaveAttribute('aria-expanded','false')
  fireEvent.click(title)
  expect(title).toHaveAttribute('aria-expanded','true')
  expect(selection.setSelection).not.toHaveBeenCalled()
  const verbs=within(row('Together')).getAllByRole('button').map(b=>b.textContent)
  expect(verbs).toEqual(['Together','Done','Let go','Edit wording'])
  fireEvent.click(within(row('Together')).getByRole('button',{name:'Done'}))
  await waitFor(()=>expect(api.updateGoal).toHaveBeenCalledWith('g',{status:'completed'}))
  expect(lastRun().label).toBe('Complete “Together”')
  await lastRun().opts.undo()
  expect(api.updateGoal).toHaveBeenLastCalledWith('g',{status:'active'})
  fireEvent.click(within(row('Together')).getByRole('button',{name:'Let go'}))
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
 // The bug (2026-10-20): with start=2026-10-01 in the URL, "Go to that week"
 // went to the week of Oct 1. This month goes to this week, whatever day
 // `start` names; another month to its first week.
 it('goes on one horizon down: this week while the month is current, whatever day start names',()=>{
  at(new Date(2026,9,20,12))
  try{
   api.tasks=[{id:'s',title:'Autumn outings',bucket:'quarter',goalId:'g'},{id:'m',title:'Picnic',bucket:'month'}]
   open('/month?view=constellation&horizon=2&start=2026-10-01')
   expect(screen.getByRole('link',{name:'Go to this week →'})).toHaveAttribute('href','/week?view=alongside&date=2026-10-20')
   cleanup()
   api.tasks=[{id:'n',title:'Plan Thanksgiving',bucket:'month',monthStart:new Date(2026,10,1)}]
   open('/month?view=constellation&horizon=2&start=2026-11-01')
   expect(screen.getByRole('link',{name:'Go to that week →'})).toHaveAttribute('href',expect.stringMatching(/^\/week\?view=alongside&date=2026-(10-2\d|10-3\d|11-01)$/))
  }finally{vi.useRealTimers()}
 })
 it('Season and Year go on to the month and the season',()=>{
  api.tasks=[{id:'s',title:'Autumn outings',bucket:'quarter',goalId:'g'}]
  season()
  expect(screen.getByRole('link',{name:'Go to October →'})).toHaveAttribute('href',expect.stringMatching(/^\/month\?view=constellation&horizon=2/))
  open()
  expect(screen.getAllByRole('link',{name:'Go to Fall →'})[0]).toHaveAttribute('href',expect.stringMatching(/^\/season\?view=constellation&horizon=1/))
 })
})

describe('the fact line (calm pass, 2026-10-18)',()=>{
 afterEach(()=>{plan.saved=null})
 it('Month: {done} of {all} done, a bar · planned {date}',()=>{
  api.tasks=[{id:'s',title:'Autumn outings',bucket:'quarter'},{id:'a',title:'Picnic',bucket:'month',sourceId:'s'},{id:'b',title:'Leaves',bucket:'month',sourceId:'s'},
   {id:'c',title:'Taxes',bucket:'month'},{id:'d',title:'Done one',bucket:'month',completed:true}]
  month()
  // One count on every horizon (reviewed design, 2026-10-20): done out of
  // everything on the period, as Looking back counts it, with its bar.
  expect(facts()).toBe('1 of 4 done')
  expect(screen.getByRole('img',{name:'1 of 4 done'}).querySelector('span')).toHaveStyle({width:'25%'})
  cleanup();plan.saved={at:new Date(2026,9,3),authorId:'u1',notes:{}}
  month()
  expect(facts()).toBe('1 of 4 done · planned Oct 3')
  // No summary sentence any more.
  expect(document.querySelector('.plan-sentence')).toBeNull()
 })
 it('Season: its dates · {done} of {all} done',()=>{
  api.tasks=[{id:'a',title:'Autumn outings',bucket:'quarter'},{id:'b',title:'Strength',bucket:'quarter'},{id:'c',title:'Fix the gate',bucket:'quarter',completed:true}]
  season()
  expect(facts()).toBe('Sep 1 – Nov 30 · 1 of 3 done')
 })
 it('Year: {done} of {all} goals done',()=>{
  api.goals=[...GOALS.map(g=>({...g})),{id:'met',name:'Run a 10k',year:2026,status:'completed',context:'personal'}]
  open()
  expect(facts()).toBe('1 of 3 goals done')
  cleanup();api.goals=[GOALS[0]]
  open()
  expect(facts()).toBe('0 of 1 goal done')
 })
})

describe('the calm header (approved mockup 2026-10-18)',()=>{
 afterEach(()=>{vi.useRealTimers();review.reviewed=null;review.prevReviewed=null;review.loading=false;review.prevLoading=false;plan.saved=null;plan.loading=false;plan.next=null;plan.nextLoading=false})
 it('is the title row and fact line, then one primary button and ⋯',()=>{
  at(new Date(2026,9,17,12));review.prevReviewed=REVIEWED
  month()
  expect(within(head()).getAllByRole('button').map(b=>b.getAttribute('aria-label')??b.textContent)).toEqual(['Previous month','Next month','Plan October','Month options'])
 })
 // One button at most, only the one that's due (reviewed design, 2026-10-20).
 it('not planned yet: Plan {period}, even with last period unreviewed — its review is Plan’s first card; ⋯ holds the review too',()=>{
  at(new Date(2026,9,17,12))
  month()
  expect(primaries()).toEqual(['Plan October'])
  expect(menu()).toContain('Review September')
  expect(menu()).not.toContain('Plan October')
  fireEvent.click(within(head()).getByRole('button',{name:'Plan October'}))
  // Planning October opens on Looking back at September.
  expect(screen.getByTestId('where').textContent).toContain('plan=1')
  expect(screen.getByText('Review September · then plan October')).toBeInTheDocument()
 })
 it('Plan {period} while it is unplanned; ⋯ offers next month early',()=>{
  at(new Date(2026,9,17,12));review.prevReviewed=REVIEWED
  month()
  expect(primaries()).toEqual(['Plan October'])
  expect(menu().filter(t=>/^(Plan|Review) /.test(t??''))).toEqual(['Plan November early'])
  fireEvent.click(within(head()).getByRole('button',{name:'Plan October'}))
  expect(screen.getByTestId('where').textContent).toContain('plan=1')
 })
 it('a period over: Review {period} until reviewed, then no button',()=>{
  at(new Date(2026,9,17,12))
  open('/month?view=constellation&horizon=2&start=2025-03-09')
  expect(primaries()).toEqual(['Review March'])
  fireEvent.click(within(head()).getByRole('button',{name:'Review March'}))
  expect(screen.getByTestId('where').textContent).toContain('plan=1')
  expect(screen.getByTestId('where').textContent).toContain('start=2025-04-01')
  cleanup();review.reviewed=REVIEWED
  open('/month?view=constellation&horizon=2&start=2025-03-09')
  expect(primaries()).toEqual([])
  expect(menu()).not.toContain('Review March')
 })
 it('planned, under way: no button; planning again and next month early wait in ⋯ (Month and Season)',()=>{
  at(new Date(2026,9,17,12));review.prevReviewed=REVIEWED;plan.saved={at:new Date(2026,9,3),authorId:'u1',notes:{}}
  month()
  // October's record, then November's.
  expect(plan.seen.slice(0,2)).toEqual(['monthly:2026-10','monthly:2026-11'])
  expect(primaries()).toEqual([])
  expect(menu().filter(t=>/^(Plan|Review) /.test(t??''))).toEqual(['Plan October again','Plan November early'])
  choose('Plan November early')
  expect(screen.getByTestId('where').textContent).toContain('start=2026-11-01')
  expect(screen.getByTestId('where').textContent).toContain('plan=1')
  // November planned too: only planning October again.
  cleanup();plan.next={at:new Date(2026,9,10),authorId:'u1',notes:{}}
  month()
  expect(menu().filter(t=>/^(Plan|Review) /.test(t??''))).toEqual(['Plan October again'])
  cleanup();plan.saved=null;plan.next=null;plan.seen=[]
  season()
  expect(primaries()).toEqual(['Plan Fall'])
  cleanup();plan.saved={at:new Date(2026,8,3),authorId:'u1',notes:{}}
  season()
  expect(primaries()).toEqual([])
  expect(menu()).toContain('Plan Winter early')
 })
 it('the last days, until reviewed: Review {period}, the walk into planning the next; reviewed, no button',()=>{
  at(new Date(2026,9,29,12));plan.saved={at:new Date(2026,9,3),authorId:'u1',notes:{}}
  month()
  expect(primaries()).toEqual(['Review October'])
  expect(menu().filter(t=>/^(Plan|Review) /.test(t??''))).toEqual(['Plan October again','Plan November'])
  fireEvent.click(within(head()).getByRole('button',{name:'Review October'}))
  expect(screen.getByTestId('where').textContent).toContain('start=2026-11-01')
  cleanup();review.reviewed=REVIEWED
  month()
  expect(primaries()).toEqual([])
  // Two days earlier, October still under way: no button.
  cleanup();review.reviewed=null
  at(new Date(2026,9,27,12))
  month()
  expect(primaries()).toEqual([])
 })
 it('holds the button while the next period’s plan record loads',()=>{
  at(new Date(2026,9,17,12));review.prevReviewed=REVIEWED
  plan.nextLoading=true
  month()
  expect(primaries()).toEqual([])
  cleanup();plan.nextLoading=false
  month()
  expect(primaries()).toEqual(['Plan October'])
 })
 it('Year, Jan 1–14: Plan {year} only while that year is unplanned; from Dec 25, Plan {next} only while next year is',()=>{
  at(new Date(2027,0,5,12));review.prevReviewed=REVIEWED
  open('/year?view=constellation')
  expect(plan.seen[0]).toBe('annual:2027')
  expect(primaries()).toEqual(['Plan 2027'])
  cleanup();plan.saved={at:new Date(2027,0,3),authorId:'u1',notes:{}}
  open('/year?view=constellation')
  expect(primaries()).toEqual([])
  cleanup();plan.saved=null
  at(new Date(2026,11,27,9));review.reviewed=REVIEWED;plan.next={at:new Date(2026,11,26),authorId:'u1',notes:{}}
  open('/year?view=constellation')
  expect(primaries()).toEqual([])
 })
 it('Year is reference: no button in October; from Dec 25, Review 2026 until reviewed',()=>{
  at(new Date(2026,9,17,12))
  open()
  expect(primaries()).toEqual([])
  expect(menu()).toContain('Plan 2026')
  expect(menu()).toContain('Review 2025')
  cleanup()
  at(new Date(2026,11,27,9))
  open('/year?view=constellation')
  expect(primaries()).toEqual(['Review 2026'])
  fireEvent.click(within(head()).getByRole('button',{name:'Review 2026'}))
  expect(screen.getByTestId('where').textContent).toContain('start=2027-01-01')
  expect(screen.getByTestId('where').textContent).toContain('plan=1')
  cleanup();review.reviewed=REVIEWED
  open('/year?view=constellation')
  expect(primaries()).toEqual([])
  expect(menu()).toContain('Plan 2027')
 })
 it('holds the primary until the reviews and the plan record have loaded',()=>{
  at(new Date(2026,9,17,12))
  for(const k of ['loading','prevLoading'] as const){
   review[k]=true
   month()
   expect(primaries()).toEqual([])
   expect(menu().filter(t=>/^(Plan|Review) /.test(t??''))).toEqual([])
   cleanup();review[k]=false
  }
  plan.loading=true
  month()
  expect(primaries()).toEqual([])
  cleanup();plan.loading=false
  month()
  expect(primaries()).toEqual(['Plan October'])
 })
 it('⋯ holds the page’s choices, the way in, and its help',()=>{
  at(new Date(2026,9,17,12));review.prevReviewed=REVIEWED
  api.tasks=[{id:'s',title:'Autumn outings',bucket:'quarter'},{id:'m',title:'Picnic',bucket:'month'},{id:'d',title:'Pay taxes',bucket:'month',completed:true}]
  month()
  expect(menu()).toEqual(['Plan November early','Show done','Hide the Fall list','Start with a goal · guided introduction','Talk it through','How this page works'])
  // Show done: a tick, remembered on this device, and the list agrees.
  const done=screen.getByRole('menuitemcheckbox',{name:'Show done'})
  expect(done).toHaveAttribute('aria-checked','false')
  fireEvent.click(done)
  expect(screen.getByRole('menuitemcheckbox',{name:'Show done'})).toHaveAttribute('aria-checked','true')
  expect(titles('October goals')).toEqual(['Picnic','Pay taxes'])
  expect(localStorage.getItem('symphony-plan-done')).toBe('shown')
  // The done fold says the same.
  expect(screen.getByRole('button',{name:/1 done/})).toHaveAttribute('aria-expanded','true')
  // Hide the Fall list: the page's own toggle agrees.
  choose('Hide the Fall list')
  expect(screen.queryByRole('complementary',{name:'Fall goals'})).toBeNull()
  expect(screen.getByRole('button',{name:/Fall goals.*the season October serves/})).toHaveAttribute('aria-expanded','false')
  expect(menu()).toContain('Show the Fall list')
  choose('How this page works')
  expect(launcher.openAssistant).toHaveBeenCalledWith(expect.objectContaining({autoSend:true,stayOnPage:true}))
  choose('Start with a goal · guided introduction')
  expect(screen.getByTestId('where').textContent).toBe('/getting-started?journey=goals')
 })
 it('the removed pieces are gone from the header',()=>{
  at(new Date(2026,9,17,12));plan.saved={at:new Date(2026,9,3),authorId:'u1',notes:{}}
  api.tasks=[{id:'m',title:'Picnic',bucket:'month'}]
  open('/month?view=constellation&horizon=2&start=2026-11-09')
  expect(screen.queryByText('Nov 1 – 30')).toBeNull()
  expect(screen.queryByRole('button',{name:/I’m happy with/})).toBeNull()
  expect(screen.queryByText(/November planned/)).toBeNull()
  expect(document.querySelector('.plan-sentence')).toBeNull()
  expect(screen.queryByRole('button',{name:'Back to this month'})).toBeNull()
  expect(screen.queryByRole('link',{name:/guided introduction/})).toBeNull()
  expect(head().querySelector('.page-help')).toBeNull()
  expect(screen.queryByRole('button',{name:/with me$/})).toBeNull()
  // The date the period was planned is in the fact line instead.
  expect(facts()).toMatch(/· planned Oct 3$/)
  expect(menu()).toContain('Back to this month')
 })
 it('while reviewing or planning, the header keeps only the title and ⋯',()=>{
  at(new Date(2026,9,17,12))
  month('&review=1')
  expect(primaries()).toEqual([])
  expect(facts()).toBeNull()
  expect(menu().filter(t=>/^(Plan|Review) |guided/.test(t??''))).toEqual([])
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
  expect(menu()).not.toContain('Talk it through')
  expect(setWalk).toHaveBeenLastCalledWith({label:'Plan this season with me',message:expect.stringContaining('Fall 2026 across my year goals')})
  expect(screen.getByRole('heading',{level:1})).toHaveTextContent('Fall 2026')
 })
 it('without the bar, ⋯ offers Talk it through, naming a past period, and asks without supplying',()=>{
  open('/season?view=constellation&horizon=1&start=2025-10-01')
  choose('Talk it through')
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
 it('without the bar (phones) Talk it through sends the talk that is due',()=>{
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date(2026,9,30,9))
  open('/month?view=constellation&horizon=2')
  choose('Talk it through')
  expect(launcher.openAssistant).toHaveBeenCalledWith({message:'Plan November.',autoSend:true})
 })
})

// Reviewing is the first card of planning the period after it (spec
// 2026-10-19): Looking back — the count, What went well, What didn't — saved
// as that period's review, then the same Choose.
describe('reviewing: Looking back, then plan',()=>{
 it('Review October opens Plan November on Looking back; its notes save as the review, then Choose follows',async()=>{
  api.tasks=[{id:'a',title:'Book the cabin',bucket:'month'},{id:'b',title:'Pay taxes',bucket:'month',completed:true}]
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date(2026,9,30,12))
  try{
   month()
   fireEvent.click(screen.getByRole('button',{name:'Review October'}))
   expect(screen.getByTestId('where').textContent).toContain('plan=1')
   expect(screen.getByTestId('where').textContent).toContain('start=2026-11-01')
   const look=within(screen.getByRole('article',{name:'Looking back at October'}))
   expect(screen.getByText('Review October · then plan November')).toBeInTheDocument()
   fireEvent.change(look.getByRole('textbox',{name:'What went well'}),{target:{value:'Cabin booked'}})
   fireEvent.click(screen.getByRole('button',{name:'On to Fall goals → November'}))
   await waitFor(()=>expect(review.finish).toHaveBeenCalledWith({wentWell:'Cabin booked',didnt:''}))
   expect(await screen.findByText('Fall goals → November')).toBeInTheDocument()
  }finally{vi.useRealTimers()}
 })
 it('under way, the page offers last period’s review until it is done; a coming period offers none',()=>{
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date(2026,9,17,12))
  try{
   month()
   expect(screen.queryByRole('button',{name:'Review October'})).toBeNull()
   // Its review waits in ⋯ (Plan October, the button, opens on it too).
   choose('Review September')
   expect(screen.getByTestId('where').textContent).toContain('start=2026-10-01')
   expect(screen.getByRole('article',{name:'Looking back at September'})).toBeInTheDocument()
   cleanup();review.prevReviewed={wentWell:'',didnt:'',at:new Date(2026,9,2),authorId:'u1'}
   month()
   expect(screen.queryByRole('button',{name:/^Review /})).toBeNull()
   expect(menu()).not.toContain('Review September')
   cleanup()
   open('/month?view=constellation&horizon=2&start=2026-11-09')
   expect(screen.queryByRole('button',{name:/^Review /})).toBeNull()
  }finally{vi.useRealTimers()}
 })
 it('says who reviewed it already, and keeps what they wrote',()=>{
  review.prevReviewed={wentWell:'Cabin booked',didnt:'',at:new Date(2026,9,31),authorId:'u2'}
  review.mine={wentWell:'Cabin booked',didnt:''}
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date(2026,9,30,12))
  try{
   open('/month?view=constellation&horizon=2&start=2026-11-09&plan=1')
   expect(screen.getByText('Reviewed Oct 31 by Iris')).toBeInTheDocument()
   expect(screen.getByRole('textbox',{name:'What went well'})).toHaveValue('Cabin booked')
  }finally{vi.useRealTimers();review.prevReviewed=null;review.mine=null}
 })
 it('Year: reviewing 2026 plans 2027, where an open 2026 goal can be brought in as a copy that remembers it',async()=>{
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date(2026,11,28,12))
  try{
   open('/year?view=constellation&start=2026-10-09&review=1')
   expect(screen.getByTestId('where').textContent).toContain('start=2027-01-01')
   fireEvent.click(screen.getByRole('button',{name:'On to 2027'}))
   fireEvent.click(await screen.findByRole('button',{name:'2027: Together'}))
   await waitFor(()=>expect(api.addGoal).toHaveBeenCalledWith(null,'Together','personal',expect.objectContaining({year:2027,carriedFrom:'g'})))
  }finally{vi.useRealTimers()}
 })
})

describe('a line moved on is not open here (2026-10-17)',()=>{
 it('Month: out of the count and the verbs, folded with the done, named where it went',()=>{
  api.tasks=[{id:'s',title:'Autumn outings',bucket:'quarter',goalId:'g'},{id:'a',title:'Come up with October business plan',bucket:'month',sourceId:'s',carried:true,carriedTo:new Date(2026,10,1)},
   {id:'b',title:'Book the cabin',bucket:'month'},{id:'c',title:'Pay taxes',bucket:'month',completed:true}]
  month()
  // Still counted as on October (the "of"), not open: 1 of 3 done.
  expect(facts()).toBe('1 of 3 done')
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
 it('the plan flow marks the period planned; the header says when, not asks',async()=>{
  plan.saved=null
  month('&plan=1')
  await pastLookingBack()
  fireEvent.click(screen.getByRole('button',{name:'I’m happy with October'}))
  await waitFor(()=>expect(plan.save).toHaveBeenCalledWith({wentWell:'',didnt:''}))
  cleanup()
  plan.saved={at:new Date(2026,9,3),authorId:'u1',notes:{}}
  try{
   month()
   expect(facts()).toMatch(/planned Oct 3$/)
   expect(screen.queryByRole('button',{name:'I’m happy with October'})).toBeNull()
  }finally{plan.saved=null}
 })
 it('a period already over is reviewed, not planned',()=>{
  open('/month?view=constellation&horizon=2&start=2025-03-09')
  expect(screen.getByRole('button',{name:'Review March'})).toBeInTheDocument()
  expect(screen.queryByRole('button',{name:/I’m happy with/})).toBeNull()
 })
})


describe('planning by hand (2026-10-17)',()=>{
 const SEP=new Date(2026,8,1),OCT=new Date(2026,9,1)
 it('Month: Plan October lists Fall’s lines with their October steps, takes in September’s leftovers, adds a step under a line, then marks it planned',async()=>{
  at(new Date(2026,9,17,12));review.prevReviewed=REVIEWED
  localStorage.setItem('symphony-choose-view','all')
  try{
  api.tasks=[{id:'s',title:'Get outside',bucket:'quarter',goalId:'g'},
   {id:'old',title:'Fix the gate',bucket:'month',monthStart:SEP},{id:'gone',title:'Pay taxes',bucket:'month',monthStart:SEP,completed:true},
   {id:'a',title:'Hike Bear Mountain',bucket:'month',monthStart:OCT,sourceId:'s'}]
  api.keepForward.mockResolvedValue('old');api.dropCommitment.mockResolvedValue(true)
  month()
  fireEvent.click(screen.getByRole('button',{name:'Plan October'}))
  expect(screen.getByTestId('where').textContent).toContain('plan=1')
  expect(facts()).toBeNull()
  expect(screen.queryByRole('button',{name:'Review October'})).toBeNull()
  await pastLookingBack()
  const flow=within(screen.getByRole('region',{name:'Plan October'}))
  expect(flow.getByText('Fall goals → October')).toBeInTheDocument()
  // September's open line, with its own four verbs (the page's words: its
  // October, Later, and Off September — nothing above holds it); the done
  // one is not asked about.
  const loose=within(flow.getByRole('region',{name:'Also in October'}))
  expect(loose.getByText('Fix the gate')).toBeInTheDocument()
  expect(loose.queryByText('Pay taxes')).toBeNull()
  expect(within(loose.getByText('Fix the gate').closest('li')!).getAllByRole('button').map(b=>b.textContent)).toEqual(['October','Done','Later ▸','Off September'])
  fireEvent.click(loose.getByRole('button',{name:'October: Fix the gate'}))
  await waitFor(()=>expect(api.keepForward).toHaveBeenCalledWith('old',{monthStart:OCT},SEP))
  expect(lastRun().label).toBe('Move “Fix the gate” to October')
  // Fall's line, folded with its counts; open, its October step says so.
  const line=flow.getByRole('button',{name:/Get outside/})
  expect(line).toHaveTextContent('1 in October')
  fireEvent.click(line)
  expect(flow.getByText('Hike Bear Mountain').closest('li')).toHaveTextContent('October')
  fireEvent.click(flow.getByRole('button',{name:'Add a step in October under Get outside'}))
  const field=flow.getByRole('textbox',{name:'A step in October under Get outside'})
  fireEvent.change(field,{target:{value:'Rake leaves'}});fireEvent.submit(field.closest('form')!)
  await waitFor(()=>expect(api.addTask).toHaveBeenCalledWith('Rake leaves',undefined,undefined,undefined,expect.objectContaining({bucket:'month',monthStart:OCT,sourceId:'s'})))
  expect(lastRun().label).toBe('Add “Rake leaves” for “Get outside”')
  fireEvent.click(screen.getByRole('button',{name:'I’m happy with October'}))
  await waitFor(()=>expect(plan.save).toHaveBeenCalled())
  // Planned, the way on is the week.
  fireEvent.click(await screen.findByRole('button',{name:'Plan this week →'}))
  expect(screen.getByText('Week page')).toBeInTheDocument()
  expect(screen.getByTestId('where').textContent).toContain('plan=1')
  }finally{vi.useRealTimers();review.prevReviewed=null;localStorage.removeItem('symphony-choose-view')}
 })
 // (This file stubs taskReviewState, so every row here reads as October; which
 // label a step wears is chooseFromAbove's own test.)
 it('Month: Back to Fall ends the October commitment on the same row, under its Fall line',async()=>{
  at(new Date(2026,9,17,12))
  try{
  const FALL=new Date(2026,8,1)
  api.tasks=[{id:'s',title:'Get the house in order',bucket:'quarter',goalId:'g',commitments:[{level:'season',periodStart:FALL,status:'open'}]},
   {id:'p',title:'Paint the office',bucket:'quarter',sourceId:'s',commitments:[{level:'season',periodStart:FALL,status:'open'}]},
   {id:'o',title:'Organize documents',bucket:'month',monthStart:OCT,sourceId:'s',commitments:[{level:'season',periodStart:FALL,status:'open'},{level:'month',periodStart:OCT,status:'open'}]}]
  api.keepForward.mockResolvedValue('p');api.dropCommitment.mockResolvedValue(true)
  localStorage.setItem('symphony-choose-view','all')
  month('&plan=1')
  await pastLookingBack()
  const flow=within(screen.getByRole('region',{name:'Plan October'}))
  fireEvent.click(flow.getByRole('button',{name:/Get the house in order/}))
  expect(flow.getByRole('list',{name:'Steps of Get the house in order'})).toHaveTextContent('Paint the office')
  fireEvent.click(flow.getByRole('button',{name:'Not in October: Organize documents'}))
  await waitFor(()=>expect(api.dropCommitment).toHaveBeenCalledWith('o','month',OCT))
  // Already on Fall: nothing to put back first.
  expect(api.keepForward).not.toHaveBeenCalled()
  expect(lastRun().label).toBe('Back to Fall: “Organize documents”')
  }finally{vi.useRealTimers();localStorage.removeItem('symphony-choose-view')}
 })
 it('Year: last year’s open goals can be brought in as a copy that remembers them',async()=>{
  api.goals=[...GOALS.map(g=>({...g})),{id:'old',name:'Learn to sail',year:2025,status:'active',context:'personal'}]
  open('/year?view=constellation&start=2026-10-09&plan=1')
  await pastLookingBack()
  expect(screen.queryByRole('heading',{name:/^From /})).toBeNull()
  fireEvent.click(screen.getByRole('button',{name:'2026: Learn to sail'}))
  await waitFor(()=>expect(api.addGoal).toHaveBeenCalledWith(null,'Learn to sail','personal',expect.objectContaining({year:2026,carriedFrom:'old'})))
  expect(lastRun().label).toBe('Bring “Learn to sail” into 2026')
  fireEvent.click(screen.getByRole('button',{name:'Leave'}))
  expect(screen.getByTestId('where').textContent).not.toContain('plan=1')
 })
 it('a period already over has no Plan, even asked for',()=>{
  open('/month?view=constellation&horizon=2&start=2025-03-09&plan=1')
  expect(screen.queryByRole('button',{name:'Plan March'})).toBeNull()
  expect(screen.queryByRole('heading',{name:'Plan March'})).toBeNull()
 })
})

// The list never runs off the page (calm pass, mockup approved 2026-10-18):
// a compact card of 8 then "+N more", ordered by drag, with the level above
// beside it, quieter and read-only.
describe('the compact list, ordered by drag, and the level above beside it',()=>{
 const lines=(n:number)=>Array.from({length:n},(_,i)=>({id:`m${i+1}`,title:`Line ${i+1}`,bucket:'month'}))
 const sectionOf=(name:string)=>list(name).closest('section')!
 const dt=()=>{const data:Record<string,string>={};return{setData:(k:string,v:string)=>{data[k]=v},getData:(k:string)=>data[k]??'',types:[] as string[],effectAllowed:'',dropEffect:''}}
 // The rows stand 40px tall, one under another, from the top of the page.
 const layOut=(name:string)=>{
  const ul=list(name),rows=ul.querySelectorAll<HTMLElement>('li[data-order-id]')
  const rect=(top:number,bottom:number)=>()=>({top,bottom,left:0,right:300,width:300,height:bottom-top,x:0,y:top,toJSON:()=>({})}) as DOMRect
  rows.forEach((li,i)=>{li.getBoundingClientRect=rect(i*40,i*40+40)})
  ul.getBoundingClientRect=rect(0,rows.length*40)
 }
 const dragTo=(title:string,name:string,y:number)=>{
  layOut(name)
  const t=dt(),ul=list(name)
  fireEvent.dragStart(row(title),{dataTransfer:t})
  for(const type of ['dragOver','drop'] as const){const ev=createEvent[type](ul,{dataTransfer:t});Object.defineProperty(ev,'clientY',{value:y});fireEvent(ul,ev)}
 }
 const ABC=()=>[{id:'a',title:'Alpha',bucket:'month',sortOrder:0},{id:'b',title:'Bravo',bucket:'month',sortOrder:1000},{id:'c',title:'Charlie',bucket:'month',sortOrder:2000}]
 // The hook's optimistic order: the list changes now, the save answers later.
 const optimistic=()=>{
  const pending:((ok:boolean)=>void)[]=[]
  api.updateTaskOrders.mockImplementation((writes:{id:string;sortOrder:number|null}[])=>{
   api.tasks=api.tasks.map(t=>{const w=writes.find(x=>x.id===t.id);return w?{...t,sortOrder:w.sortOrder}:t})
   api.redraw()
   return new Promise<boolean>(r=>{pending.push(r)})
  })
  return {settle:()=>pending.splice(0).forEach(r=>r(true))}
 }

 it('19 lines: the first 8 show, then +11 more, which opens in place and folds back',()=>{
  api.tasks=lines(19)
  month()
  expect(titles('October goals')).toEqual(lines(8).map(l=>l.title))
  const more=within(sectionOf('October goals')).getByRole('button',{name:'+11 more'})
  expect(more).toHaveAttribute('aria-expanded','false')
  fireEvent.click(more)
  expect(titles('October goals')).toEqual(lines(19).map(l=>l.title))
  fireEvent.click(within(sectionOf('October goals')).getByRole('button',{name:'Show less'}))
  expect(titles('October goals')).toHaveLength(8)
  expect(within(sectionOf('October goals')).getByRole('button',{name:'+11 more'})).toBeInTheDocument()
  // The add box stays at the bottom, folded or not.
  expect(within(sectionOf('October goals')).getByRole('button',{name:'Add an October goal'})).toBeInTheDocument()
 })
 it('8 or fewer lines show whole, with nothing to open',()=>{
  api.tasks=lines(8)
  month()
  expect(titles('October goals')).toHaveLength(8)
  expect(within(sectionOf('October goals')).queryByRole('button',{name:/more$|Show less/})).toBeNull()
 })
 it('a line Symphony just saved stays in sight when the list folds',()=>{
  api.tasks=lines(12)
  month('&focus=2:m12')
  expect(titles('October goals')).toContain('Line 12')
  expect(within(sectionOf('October goals')).getByRole('button',{name:'+4 more'})).toBeInTheDocument()
 })
 it('open lines follow their order, the never-ordered after them as they came',()=>{
  api.tasks=[{id:'a',title:'Alpha',bucket:'month'},{id:'b',title:'Bravo',bucket:'month',sortOrder:1000},{id:'c',title:'Charlie',bucket:'month',sortOrder:0},{id:'d',title:'Delta',bucket:'month'}]
  month()
  expect(titles('October goals')).toEqual(['Charlie','Bravo','Alpha','Delta'])
 })
 it('a month line dropped between two others moves there at once, through the page’s own writer, with Undo',async()=>{
  api.tasks=ABC()
  const save=optimistic()
  month()
  expect(row('Charlie')).toHaveAttribute('draggable','true')
  dragTo('Charlie','October goals',45)
  expect(api.updateTaskOrders).toHaveBeenCalledWith([{id:'c',sortOrder:500}])
  // Before the save answers.
  expect(titles('October goals')).toEqual(['Alpha','Charlie','Bravo'])
  await act(async()=>{save.settle()})
  await waitFor(()=>expect(lastRun()?.label).toBe('Move “Charlie” up'))
  expect(lastRun().opts.ids).toEqual(['c'])
  await act(async()=>{const undone=lastRun().opts.undo();save.settle();await undone})
  expect(api.updateTaskOrders).toHaveBeenLastCalledWith([{id:'c',sortOrder:2000}])
  expect(titles('October goals')).toEqual(['Alpha','Bravo','Charlie'])
 })
 it('while dragging, the gap it would land in is marked',()=>{
  api.tasks=ABC()
  month()
  layOut('October goals')
  const t=dt(),ul=list('October goals')
  fireEvent.dragStart(row('Charlie'),{dataTransfer:t})
  const ev=createEvent.dragOver(ul,{dataTransfer:t});Object.defineProperty(ev,'clientY',{value:5});fireEvent(ul,ev)
  expect(row('Alpha')).toHaveClass('is-gap-above')
  fireEvent.dragEnd(row('Charlie'))
  expect(row('Alpha')).not.toHaveClass('is-gap-above')
 })
 it('a season line orders the same way',async()=>{
  api.tasks=[{id:'s',title:'Autumn outings',bucket:'quarter',sortOrder:0},{id:'t',title:'Strength',bucket:'quarter',sortOrder:1000}]
  optimistic()
  season()
  dragTo('Autumn outings','Fall goals',75)
  expect(api.updateTaskOrders).toHaveBeenCalledWith([{id:'s',sortOrder:2000}])
  expect(titles('Fall goals')).toEqual(['Strength','Autumn outings'])
 })
 it('a year goal dropped writes its sort order through updateGoal, with Undo',async()=>{
  api.goals=[{...GOALS[0],sortOrder:0},{...GOALS[1],sortOrder:1000},{id:'h',name:'Home',year:2026,status:'active',context:'personal',sortOrder:2000}]
  open()
  dragTo('Home','2026 goals',5)
  await waitFor(()=>expect(api.updateGoal).toHaveBeenCalledWith('h',{sortOrder:-1000},{quiet:true}))
  await waitFor(()=>expect(lastRun()?.label).toBe('Move “Home” up'))
  await lastRun().opts.undo()
  expect(api.updateGoal).toHaveBeenLastCalledWith('h',{sortOrder:2000},{quiet:true})
  expect(api.updateTaskOrders).not.toHaveBeenCalled()
 })
 // Goals made in one area share an order, so the first drag renumbers them.
 const tied=()=>[{...GOALS[0],sortOrder:0},{...GOALS[1],sortOrder:0},{id:'h',name:'Home',year:2026,status:'active',context:'personal',sortOrder:0}]
 it('a renumber of year goals, and its Undo, writes every goal back',async()=>{
  api.goals=tied()
  open()
  dragTo('Home','2026 goals',45)
  await waitFor(()=>expect(lastRun()?.label).toBe('Move “Home” up'))
  expect(lastRun().ok).toBe(true)
  expect(api.updateGoal.mock.calls).toEqual([['g',{sortOrder:0},{quiet:true}],['h',{sortOrder:1000},{quiet:true}],['other',{sortOrder:2000},{quiet:true}]])
  api.updateGoal.mockClear()
  expect(await lastRun().opts.undo()).toBe(true)
  expect(api.updateGoal.mock.calls).toEqual([['g',{sortOrder:0},{quiet:true}],['h',{sortOrder:0},{quiet:true}],['other',{sortOrder:0},{quiet:true}]])
 })
 it('a refused year-goal write rolls back the ones already written, says so, and the page stays',async()=>{
  api.goals=tied()
  api.updateGoal.mockImplementation(async(id:string,u:any)=>!(id==='other'&&u.sortOrder===2000))
  open()
  dragTo('Home','2026 goals',45)
  await waitFor(()=>expect(lastRun()?.label).toBe('Move “Home” up'))
  expect(lastRun().ok).toBe(false)
  // Written one at a time; the refusal stops it, and h and g go back.
  expect(api.updateGoal.mock.calls).toEqual([
   ['g',{sortOrder:0},{quiet:true}],['h',{sortOrder:1000},{quiet:true}],['other',{sortOrder:2000},{quiet:true}],
   ['h',{sortOrder:0},{quiet:true}],['g',{sortOrder:0},{quiet:true}],
  ])
  expect(toast.showToast).toHaveBeenCalledWith('Couldn’t save the new order','warning')
  expect(screen.queryByText(/Plans could not load/)).toBeNull()
  expect(titles('2026 goals')).toEqual(['Together','Health','Home'])
 })
 // The hook as written: the goals change when a write lands, and a new goal
 // without a given order takes the count of goals in its area.
 const liveGoals=()=>{
  api.updateGoal.mockImplementation(async(id:string,u:any)=>{api.goals=api.goals.map(g=>g.id===id?{...g,...u}:g);api.redraw();return true})
  api.addGoal.mockImplementation(async(_area:any,name:string,context:any,extra:any)=>{
   const g={id:extra.id,name,year:extra.year,status:'active',context,carriedFrom:extra.carriedFrom,sortOrder:extra.sortOrder??api.goals.filter(x=>!x.areaId).length}
   api.goals=[...api.goals,g];api.redraw();return g})
 }
 it('a year goal added after a reorder lands last',async()=>{
  // Made one after another, so their orders are the count at the time.
  api.goals=[{...GOALS[0],sortOrder:0},{...GOALS[1],sortOrder:1},{id:'h',name:'Home',year:2026,status:'active',context:'personal',sortOrder:2},
   {id:'p1',name:'Old one',year:2025,status:'active',context:'personal',sortOrder:3},{id:'p2',name:'Older one',year:2025,status:'active',context:'personal',sortOrder:4}]
  liveGoals()
  open()
  dragTo('Home','2026 goals',45)
  await waitFor(()=>expect(lastRun()?.label).toBe('Move “Home” up'))
  expect(titles('2026 goals')).toEqual(['Together','Home','Health'])
  fireEvent.click(screen.getByRole('button',{name:'Add a 2026 goal'}))
  fireEvent.change(screen.getByLabelText('New 2026 goal'),{target:{value:'Garden'}})
  fireEvent.click(screen.getByRole('button',{name:'Add'}))
  await waitFor(()=>expect(api.addGoal).toHaveBeenCalledWith(null,'Garden','personal',expect.objectContaining({year:2026,sortOrder:3000})))
  await waitFor(()=>expect(titles('2026 goals')).toEqual(['Together','Home','Health','Garden']))
 })
 it('a year goal carried into a year lands last there',async()=>{
  api.goals=[{...GOALS[0],sortOrder:0},{...GOALS[1],sortOrder:1000},
   {id:'n1',name:'Next one',year:2027,status:'active',context:'personal',sortOrder:0},{id:'n2',name:'Next two',year:2027,status:'active',context:'personal',sortOrder:4000},
   {id:'old',name:'Learn to sail',year:2025,status:'active',context:'personal',sortOrder:0}]
  liveGoals()
  // Into 2027, from reviewing 2026 (which plans 2027).
  open('/year?view=constellation&start=2026-10-09&review=1')
  await pastLookingBack()
  fireEvent.click(screen.getByRole('button',{name:'2027: Together'}))
  await waitFor(()=>expect(api.addGoal).toHaveBeenCalledWith(null,'Together','personal',expect.objectContaining({year:2027,carriedFrom:'g',sortOrder:5000})))
  cleanup()
  // Bring into 2026, while planning it.
  open('/year?view=constellation&start=2026-10-09&plan=1')
  await pastLookingBack()
  fireEvent.click(screen.getByRole('button',{name:'2026: Learn to sail'}))
  await waitFor(()=>expect(api.addGoal).toHaveBeenLastCalledWith(null,'Learn to sail','personal',expect.objectContaining({year:2026,carriedFrom:'old',sortOrder:2000})))
 })
 it('privacy: with the area and people filters on, a private line from another area is not listed, counted, marked or reordered',async()=>{
  // Family only, and Iris only.
  filters.on=true;filters.layers=new Set(['family']);filters.people=['m-iris']
  const iris={assignedTo:'m-iris'}
  api.tasks=[
   {id:'s',title:'Fall together',bucket:'quarter',context:'family',...iris},
   {id:'sw',title:'Ship the release',bucket:'quarter',context:'work',...iris},
   {id:'a',title:'Picnic',bucket:'month',context:'family',sortOrder:0,...iris},
   {id:'b',title:'Leaf pile',bucket:'month',context:'family',sortOrder:0,...iris},
   {id:'d',title:'Pumpkins',bucket:'month',context:'family',completed:true,...iris},
   // Private: Work, under the family season goal, open and done.
   {id:'w',title:'Board deck',bucket:'month',context:'work',sortOrder:0,sourceId:'s',...iris},
   {id:'wd',title:'Quarterly numbers',bucket:'month',context:'work',completed:true,...iris},
   // Family but someone else's: the people filter leaves it out too.
   {id:'o',title:'Bob’s errand',bucket:'month',context:'family',sortOrder:0,sourceId:'s',assignedTo:'m-bob'},
  ]
  optimistic()
  month()
  expect(titles('October goals')).toEqual(['Picnic','Leaf pile'])
  expect(screen.queryByText('Board deck')).toBeNull()
  expect(screen.queryByText('Bob’s errand')).toBeNull()
  // The counts are the lines shown.
  expect(facts()).toBe('1 of 3 done')
  expect(screen.getByRole('button',{name:/1 done/})).toHaveTextContent(/^1 done · Pumpkins/)
  // The side card: the private season goal is absent, and the family one is
  // not marked "in October" by the hidden lines under it.
  const side=within(screen.getByRole('complementary',{name:'Fall goals'}))
  expect(side.getAllByRole('listitem').map(li=>li.textContent)).toEqual(['Fall together'])
  expect(side.queryByText('in October')).toBeNull()
  // A drop that renumbers writes only the lines shown.
  dragTo('Leaf pile','October goals',5)
  await waitFor(()=>expect(api.updateTaskOrders).toHaveBeenCalled())
  const written=api.updateTaskOrders.mock.calls.flatMap((c:any[])=>c[0].map((w:any)=>w.id))
  expect(written.length).toBeGreaterThan(0)
  expect(written.every((id:string)=>['a','b'].includes(id))).toBe(true)
  // Year goals the same: a private Work goal is not listed or renumbered.
  cleanup()
  api.goals=[{id:'f1',name:'Family trips',year:2026,status:'active',context:'family',sortOrder:0,assignedToAll:['m-iris']},
   {id:'f2',name:'Family dinners',year:2026,status:'active',context:'family',sortOrder:0,assignedToAll:['m-iris']},
   {id:'wg',name:'Get promoted',year:2026,status:'active',context:'work',sortOrder:0,assignedToAll:['m-iris']}]
  open()
  expect(titles('2026 goals')).toEqual(['Family trips','Family dinners'])
  expect(facts()).toBe('0 of 2 goals done')
  dragTo('Family dinners','2026 goals',5)
  await waitFor(()=>expect(api.updateGoal).toHaveBeenCalled())
  expect(api.updateGoal.mock.calls.map((c:any[])=>c[0]).every((id:string)=>id==='f1'||id==='f2')).toBe(true)
 })
 it('a row that drags still triages from its row, and a done line does not drag',async()=>{
  api.tasks=[{id:'m',title:'Picnic',bucket:'month',context:'family'},{id:'d',title:'Pay taxes',bucket:'month',completed:true}]
  api.toggleTask.mockResolvedValue(true)
  localStorage.setItem('symphony-plan-done','shown')
  month()
  expect(row('Picnic')).toHaveAttribute('draggable','true')
  expect(row('Pay taxes')).toHaveAttribute('draggable','false')
  expect(within(screen.getByRole('group',{name:'Triage Picnic'})).getAllByRole('button').map(b=>b.textContent).filter(l=>l!=='This week')).toEqual(['Done','Later ▾','Off October'])
  fireEvent.click(screen.getByRole('button',{name:'Done: Picnic'}))
  await waitFor(()=>expect(api.toggleTask).toHaveBeenCalledWith('m'))
  expect(api.updateTaskOrders).not.toHaveBeenCalled()
 })
 describe('on touch',()=>{
  const original=window.matchMedia
  beforeEach(()=>{
   window.matchMedia=((query:string)=>({matches:query.includes('pointer: coarse'),media:query,onchange:null,addListener:()=>{},removeListener:()=>{},addEventListener:()=>{},removeEventListener:()=>{},dispatchEvent:()=>false})) as unknown as typeof window.matchMedia
   vi.useFakeTimers({toFake:['Date','setTimeout','clearTimeout']});vi.setSystemTime(new Date(2026,9,9,9))
  })
  afterEach(()=>{window.matchMedia=original;vi.useRealTimers()})
  const touch=(y:number)=>({touches:[{clientX:10,clientY:y}],changedTouches:[{clientX:10,clientY:y}]})
  it('press and hold, then drag: the line lifts and lands in the gap it is let go in',()=>{
   api.tasks=ABC()
   optimistic()
   month()
   layOut('October goals')
   const charlie=row('Charlie')
   expect(charlie).toHaveAttribute('draggable','false')
   fireEvent.touchStart(charlie,touch(85))
   act(()=>{vi.advanceTimersByTime(260)})
   fireEvent.touchMove(document,touch(45))
   expect(charlie).toHaveClass('is-lifted')
   expect(row('Bravo')).toHaveClass('is-gap-above')
   fireEvent.touchEnd(document,touch(45))
   act(()=>{vi.advanceTimersByTime(100)})
   expect(api.updateTaskOrders).toHaveBeenCalledWith([{id:'c',sortOrder:500}])
   expect(titles('October goals')).toEqual(['Alpha','Charlie','Bravo'])
  })
  it('a quick tap still opens the line, and orders nothing',()=>{
   api.tasks=ABC()
   month()
   const title=screen.getByRole('button',{name:'Alpha'})
   fireEvent.touchStart(title,touch(10))
   act(()=>{vi.advanceTimersByTime(100)})
   fireEvent.touchEnd(title,touch(10))
   fireEvent.click(title)
   act(()=>{vi.advanceTimersByTime(300)})
   expect(selection.setSelection).toHaveBeenCalledWith({kind:'task',id:'a'})
   expect(api.updateTaskOrders).not.toHaveBeenCalled()
  })
 })
 it('Month: the Fall goals beside it, 8 then +13 more, marked when October has a line under one, read-only',()=>{
  api.tasks=[...Array.from({length:21},(_,i)=>({id:`s${i+1}`,title:`Fall goal ${i+1}`,bucket:'quarter'})),{id:'m',title:'Picnic',bucket:'month',sourceId:'s2'}]
  month()
  const side=screen.getByRole('complementary',{name:'Fall goals'})
  const items=()=>within(list('Fall goals')).getAllByRole('listitem')
  expect(items()).toHaveLength(8)
  expect(items()[0].textContent).toBe('Fall goal 1')
  expect(within(items()[1]).getByText('in October')).toBeInTheDocument()
  expect(items().filter(li=>/in October/.test(li.textContent??''))).toHaveLength(1)
  fireEvent.click(within(side).getByRole('button',{name:'+13 more'}))
  expect(items()).toHaveLength(21)
  fireEvent.click(within(side).getByRole('button',{name:'Show less'}))
  expect(items()).toHaveLength(8)
  // Read-only: no triage, no drag.
  expect(within(side).queryAllByRole('group')).toHaveLength(0)
  expect(side.querySelector('[draggable="true"]')).toBeNull()
  // Phones stack it under the list: it comes after the list.
  expect(list('October goals').compareDocumentPosition(side)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
 })
 it('Season: a year goal with a Fall goal under it is marked in Fall',()=>{
  api.tasks=[{id:'s',title:'Autumn outings',bucket:'quarter',goalId:'g'}]
  season()
  const items=within(list('2026 goals')).getAllByRole('listitem')
  expect(within(items[0]).getByText('in Fall')).toBeInTheDocument()
  expect(items[1].textContent).toBe('Health')
 })
 it('the side card is hidden when this viewer hid it',()=>{
  api.tasks=[{id:'s',title:'Autumn outings',bucket:'quarter'}]
  localStorage.setItem('symphony.plan.aboveOpen','0')
  month()
  expect(screen.queryByRole('complementary',{name:'Fall goals'})).toBeNull()
 })
 it('Year: a goal tags how many Fall goals it has, Fall · 3',()=>{
  api.tasks=['a','b','c'].map(id=>({id,title:`Fall ${id}`,bucket:'quarter',goalId:'g'}))
  open()
  expect(tag('Together')).toHaveTextContent(/^Fall · 3$/)
  expect(row('Health').querySelector('.plan-item-below')).toBeNull()
 })
})
