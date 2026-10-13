import {render,screen,fireEvent,waitFor,within,cleanup} from '@testing-library/react'
import {MemoryRouter,Routes,Route,useLocation} from 'react-router-dom'
import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest'
import {ConstellationPage} from './ConstellationPage'
import {ConversationWalkContext} from '@/components/canvas/conversationWalk'
const api=vi.hoisted(()=>({addGoal:vi.fn(),updateGoal:vi.fn(),deleteGoal:vi.fn(),addTask:vi.fn(),updateTask:vi.fn(),refetch:vi.fn(),pushTask:vi.fn(),setBucket:vi.fn(),updateTasksBulk:vi.fn(),toggleTask:vi.fn(),deleteTask:vi.fn(),keepForward:vi.fn(),dropCommitment:vi.fn(),tasks:[] as any[],goals:[] as any[]}))
const activity=vi.hoisted(()=>({calls:[] as {label:string;ok:boolean;opts:any}[],proposals:[] as any[],setProposalState:vi.fn(),removeProposal:vi.fn()}))
const launcher=vi.hoisted(()=>({openAssistant:vi.fn()}))
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
vi.mock('@/hooks/useHouseholdSeasons',()=>({useHouseholdSeasons:()=>({seasons:[{name:'Spring',month:3,day:1},{name:'Summer',month:6,day:1},{name:'Fall',month:9,day:1},{name:'Winter',month:12,day:1}]})}))
vi.mock('@/lib/today/domainFilter',()=>({filterTasksForLayers:(t:any)=>t,matchesLayers:()=>true}))
vi.mock('@/lib/planning/peopleLens',()=>({planPeopleLens:()=>({keep:()=>true,scopeId:null})}))
vi.mock('../v2/AddArea',()=>({useAddArea:()=>({area:'personal',picker:null})}))
vi.mock('@/lib/planning/periodPage',async(importOriginal)=>({...await importOriginal<any>(),selectPeriodTasks:(tasks:any[],level:string)=>tasks.filter(t=>t.bucket===(level==='season'?'quarter':'month'))}))
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
 vi.clearAllMocks();api.tasks=[];api.goals=GOALS.map(g=>({...g}));activity.calls=[];activity.proposals=[]
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

describe('Move under…',()=>{
 it('moves a month goal to another season goal, keeping its year goal and clearing the old legacy link; Undo restores',async()=>{
  api.tasks=[{id:'s1',title:'Autumn outings',bucket:'quarter',goalId:'g'},{id:'s2',title:'Strength',bucket:'quarter',goalId:'other'},{id:'m',title:'Picnic',bucket:'month',sourceId:'s1',goalTaskId:'s1',goalId:'g'}]
  month()
  fireEvent.click(screen.getByRole('button',{name:'Actions for Picnic'}));fireEvent.click(screen.getByText('Move under…'))
  const menu=screen.getByRole('menu',{name:'Move Picnic under a season goal'})
  expect(within(menu).getByRole('menuitemradio',{name:'Autumn outings'})).toHaveAttribute('aria-checked','true')
  fireEvent.click(within(menu).getByRole('menuitemradio',{name:'Strength'}))
  await waitFor(()=>expect(api.updateTask).toHaveBeenCalledTimes(1))
  expect(api.updateTask.mock.calls[0]).toStrictEqual(['m',{sourceId:'s2',goalTaskId:undefined,goalId:'other'}])
  expect(lastRun().label).toBe('Move “Picnic” under “Strength”')
  await waitFor(()=>expect(row('Picnic')).toHaveClass('is-linked'))
  await lastRun().opts.undo()
  expect(api.updateTask).toHaveBeenLastCalledWith('m',{sourceId:'s1',goalTaskId:'s1',goalId:'g'})
 })
 it('unlinks every field that shows the parent, and the goal stays in the list',async()=>{
  api.tasks=[{id:'s1',title:'Autumn outings',bucket:'quarter'},{id:'m',title:'Picnic',bucket:'month',sourceId:'s1',supportsGoalTaskId:'s1'}]
  month()
  fireEvent.click(screen.getByRole('button',{name:'Actions for Picnic'}));fireEvent.click(screen.getByText('Move under…'))
  fireEvent.click(screen.getByRole('menuitemradio',{name:'No parent (Unlinked)'}))
  await waitFor(()=>expect(api.updateTask).toHaveBeenCalledTimes(1))
  expect(api.updateTask.mock.calls[0][1]).toStrictEqual({sourceId:undefined,supportsGoalTaskId:undefined})
  expect(lastRun().label).toBe('Unlink “Picnic”')
  expect(titles('October goals')).toEqual(['Picnic'])
 })
 it('links a season goal to a year goal; a failed save offers Retry and no Undo',async()=>{
  api.tasks=[{id:'s',title:'Autumn outings',bucket:'quarter'}];api.updateTask.mockResolvedValueOnce(false)
  season()
  fireEvent.click(screen.getByRole('button',{name:'Actions for Autumn outings'}));fireEvent.click(screen.getByText('Move under…'))
  fireEvent.click(screen.getByRole('menuitemradio',{name:'Together'}))
  await waitFor(()=>expect(api.updateTask).toHaveBeenCalledWith('s',{goalId:'g'}))
  expect(lastRun().ok).toBe(false)
  lastRun().opts.retry()
  await waitFor(()=>expect(api.updateTask).toHaveBeenCalledTimes(2))
  expect(lastRun().ok).toBe(true)
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

describe('done items, triage and the way on',()=>{
 it('hides completed goals until asked, without a count',()=>{
  api.tasks=[{id:'s',title:'Finished season',bucket:'quarter',completed:true},{id:'m',title:'Still open',bucket:'month',sourceId:'s'},{id:'d',title:'Done milestone',bucket:'month',completed:true}]
  month()
  expect(titles('October goals')).toEqual(['Still open'])
  expect(row('Still open')).toHaveTextContent('For Finished season')
  fireEvent.click(screen.getByRole('button',{name:'Show done'}))
  expect(titles('October goals')).toEqual(['Still open','Done milestone'])
  expect(row('Done milestone')).toHaveTextContent('Done')
  fireEvent.click(screen.getByRole('button',{name:'Hide done'}))
  expect(screen.queryByText('Done milestone')).not.toBeInTheDocument()
 })
 it('carries forward and removes only the viewed period through the shared writers',async()=>{
  api.tasks=[{id:'m',title:'Picnic',bucket:'month',context:'personal'}]
  api.keepForward.mockResolvedValue(undefined);api.dropCommitment.mockResolvedValue(true);month()
  fireEvent.click(screen.getByRole('button',{name:'Actions for Picnic'}))
  fireEvent.click(screen.getByText('Carry to next month'))
  await waitFor(()=>expect(api.keepForward).toHaveBeenCalledWith('m',{monthStart:new Date(2026,10,1)},new Date(2026,9,1)))
  expect(lastRun().ok).toBe(false)
  fireEvent.click(screen.getByRole('button',{name:'Actions for Picnic'}))
  fireEvent.click(screen.getByText('Remove from this month'))
  await waitFor(()=>expect(api.dropCommitment).toHaveBeenCalledWith('m','month',new Date(2026,9,1)))
  expect(lastRun().ok).toBe(true)
 })
 it('triages year goals through their status, with Undo restoring it',async()=>{
  open()
  fireEvent.click(screen.getByRole('button',{name:'Actions for Together'}))
  expect(screen.queryByText('Someday')).not.toBeInTheDocument()
  fireEvent.click(screen.getByText('Archive goal'))
  await waitFor(()=>expect(api.updateGoal).toHaveBeenCalledWith('g',{status:'archived'}))
  await lastRun().opts.undo()
  expect(api.updateGoal).toHaveBeenLastCalledWith('g',{status:'active'})
 })
 it('edits wording in place with Undo',async()=>{
  api.tasks=[{id:'m',title:'Picnic',bucket:'month'}];month()
  fireEvent.click(screen.getByRole('button',{name:'Actions for Picnic'}));fireEvent.click(screen.getByText('Edit wording'))
  const field=screen.getByLabelText('Wording for Picnic');expect(field).toHaveValue('Picnic')
  fireEvent.change(field,{target:{value:'Park picnic'}});fireEvent.click(screen.getByRole('button',{name:'Save'}))
  await waitFor(()=>expect(api.updateTask).toHaveBeenCalledWith('m',{title:'Park picnic'}))
  await lastRun().opts.undo()
  expect(api.updateTask).toHaveBeenLastCalledWith('m',{title:'Picnic'})
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

describe('prepared to act on plan rows',()=>{
 it('marks what an item carries and summarises it, with the plan above, when opened',()=>{
  api.tasks=[{id:'s',title:'Back to school',bucket:'quarter',links:[{url:'https://supplies.test'}]},{id:'m',title:'Call Cami',bucket:'month',sourceId:'s',contactId:'cami',subtasks:[{id:'q1',title:'Pickup?'},{id:'q2',title:'Forms?',completed:true}]}]
  month()
  const r=row('Call Cami')
  expect(within(r).getByRole('img',{name:'Has contact, steps 1 of 2'})).toBeInTheDocument()
  fireEvent.click(within(r).getByRole('button',{name:'Call Cami'}))
  expect(within(r).getByText('From Back to school: 1 link')).toBeInTheDocument()
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
