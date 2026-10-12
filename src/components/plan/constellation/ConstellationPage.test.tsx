import {render,screen,fireEvent,waitFor,within} from '@testing-library/react'
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

const GOALS=[{id:'g',name:'Together',year:2026,status:'active',context:'personal'},{id:'other',name:'Health',year:2026,status:'active',context:'personal'}]
function Where(){const l=useLocation();return <output data-testid="where">{l.pathname+l.search}</output>}
function open(url='/year?view=constellation&start=2026-10-09'){
 render(<MemoryRouter initialEntries={[url]}><Routes>
  {['/year','/season','/month'].map(p=><Route key={p} path={p} element={<><ConstellationPage/><Where/></>}/>)}
  <Route path="/week" element={<><p>Week page</p><Where/></>}/>
 </Routes></MemoryRouter>)
}
const season=(focus='')=>open('/season?view=constellation&horizon=1&start=2026-10-09'+focus)
const month=(focus='')=>open('/month?view=constellation&horizon=2&start=2026-10-09'+focus)
const group=(name:string)=>screen.getByRole('region',{name})
const monthList=(name='October goals')=>screen.getByRole('list',{name})
// Empty parents fold only once the period holds something.
const showEmpty=()=>{const fold=screen.queryByRole('button',{name:/with nothing in/});if(fold)fireEvent.click(fold)}
const lastRun=()=>activity.calls[activity.calls.length-1]
beforeEach(()=>{
 vi.clearAllMocks();api.tasks=[];api.goals=GOALS.map(g=>({...g}));activity.calls=[];activity.proposals=[]
 localStorage.clear()
 HTMLElement.prototype.scrollIntoView=vi.fn()
 api.updateTask.mockResolvedValue(true);api.addTask.mockResolvedValue('new');api.addGoal.mockResolvedValue({id:'new'});api.updateGoal.mockResolvedValue(true)
})

describe('horizon stepper and URL',()=>{
 it('opens the horizon its route names, with the period and its dates',()=>{
  month()
  expect(screen.getByRole('button',{name:'Month'})).toHaveAttribute('aria-current','step')
  expect(screen.getByRole('heading',{level:1})).toHaveTextContent('October 2026')
  expect(screen.getByText('Oct 1 – 31')).toBeInTheDocument()
  open('/season?view=constellation&start=2026-10-09')
  expect(screen.getAllByRole('heading',{level:1})[1]).toHaveTextContent('Fall 2026')
  expect(screen.getByText('Sep 1 – Nov 30')).toBeInTheDocument()
 })
 it('switches horizon in the URL, steps periods, and links on to Week',()=>{
  open()
  expect(screen.getByRole('button',{name:'Year'})).toHaveAttribute('aria-current','step')
  fireEvent.click(screen.getByRole('button',{name:'Season'}))
  expect(screen.getByTestId('where').textContent).toContain('horizon=1')
  expect(screen.getByRole('button',{name:'Season'})).toHaveAttribute('aria-current','step')
  fireEvent.click(screen.getByRole('button',{name:'Next season'}))
  expect(screen.getByTestId('where').textContent).toContain('start=2026-12-01')
  expect(screen.getByRole('heading',{level:1})).toHaveTextContent('Winter')
  expect(screen.getByRole('link',{name:'Week →'})).toHaveAttribute('href',expect.stringContaining('/week?view=alongside'))
 })
 it('hands the week horizon over to the Week page',()=>{
  open('/year?view=constellation&start=2026-10-09&horizon=3&focus=3:w')
  expect(screen.getByText('Week page')).toBeInTheDocument()
  expect(screen.getByTestId('where').textContent).toMatch(/^\/week\?view=alongside&date=2026-10-09/)
 })
 it('shows a conversation-saved item in the season collection and refreshes on later saves',()=>{
  api.tasks=[{id:'s',title:'Autumn outings',bucket:'quarter',goalId:'g'}]
  open('/year?view=constellation&start=2026-10-09&horizon=1&focus=1:s')
  const row=within(screen.getByRole('list',{name:'Fall goals'})).getByText('Autumn outings').closest('li')!
  expect(within(row).getByText('Saved')).toBeInTheDocument()
  // Every year goal stays a card; nothing folds away (2026-10-12).
  expect(screen.queryByRole('button',{name:/with nothing in/})).toBeNull()
  fireEvent(window,new Event('symphony-plan-updated'))
  expect(api.refetch).toHaveBeenCalledTimes(1)
 })
 it('opens a horizon-wide planning conversation and offers the next horizon',()=>{
  api.tasks=[{id:'s',title:'Autumn outings',bucket:'quarter',goalId:'g'}]
  season()
  fireEvent.click(screen.getByRole('button',{name:/^Plan (this season|Fall 2026) with me$/}))
  const message=launcher.openAssistant.mock.calls[0][0].message
  expect(message).toContain('Fall 2026 across my year goals, one at a time')
  // It asks; it never supplies (Scott, 2026-10-11).
  expect(message).toContain("don't suggest season goals of your own")
  expect(screen.getAllByRole('link',{name:'Plan a month from these goals →'})[0]).toHaveAttribute('href',expect.stringContaining('/month?view=constellation&horizon=2'))
 })
})

describe('where you are, and somewhere to add (Scott, 2026-10-11)',()=>{
 beforeEach(()=>{vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date(2026,9,11,9))})
 afterEach(()=>{vi.useRealTimers()})
 it('Season from this year opens this season, not the one holding a remembered Jan 1',()=>{
  open('/year?view=constellation&start=2026-01-01&horizon=0')
  fireEvent.click(screen.getByRole('button',{name:'Season'}))
  expect(screen.getByTestId('where').textContent).not.toContain('start=')
  expect(screen.getByRole('heading',{level:1})).toHaveTextContent('Fall 2026')
  expect(screen.queryByRole('button',{name:'Back to this season'})).not.toBeInTheDocument()
 })
 it('a past period keeps its place when the horizon changes',()=>{
  open('/season?view=constellation&start=2025-09-01&horizon=1')
  expect(screen.getByRole('heading',{level:1})).toHaveTextContent('Fall 2025')
  fireEvent.click(screen.getByRole('button',{name:'Month'}))
  expect(screen.getByRole('heading',{level:1})).toHaveTextContent('September 2025')
 })
 it('an empty season shows each intention ready to add under, and says nothing untrue',()=>{
  season()
  expect(screen.queryByRole('button',{name:/with nothing in/})).not.toBeInTheDocument()
  expect(within(group('Under Together')).getByRole('button',{name:'Add a Fall goal under Together'})).toBeInTheDocument()
  expect(within(group('Under Together')).getByText('Nothing for Fall yet')).toBeInTheDocument()
  expect(screen.queryByText(/Everything for Fall is under/)).not.toBeInTheDocument()
  expect(screen.getByText('Nothing for Fall yet. Add one from a 2026 goal, or one of its own below.')).toBeInTheDocument()
 })
 it('with no intentions for the year, the season offers goals on their own or intentions first',()=>{
  api.goals=[]
  season()
  expect(screen.getByRole('button',{name:'Add a Fall goal of its own'})).toBeInTheDocument()
  expect(screen.getByText(/No 2026 goals yet\./)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'Add 2026 goals'}))
  expect(screen.getByRole('button',{name:'Year'})).toHaveAttribute('aria-current','step')
 })
})

describe('grouped under parent',()=>{
 it('at Year the year goals are the items, and a new one keeps its wording when the save fails',async()=>{
  api.addGoal.mockResolvedValueOnce(null);open()
  expect(within(screen.getByRole('list',{name:'2026 goals'})).getByText('Together')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'Add a 2026 goal'}))
  fireEvent.change(screen.getByLabelText('New 2026 goal'),{target:{value:'A meaningful year'}})
  fireEvent.click(screen.getByRole('button',{name:'Add'}))
  await screen.findByText(/Your wording is still here/)
  expect(screen.getByLabelText('New 2026 goal')).toHaveValue('A meaningful year')
  fireEvent.click(screen.getByRole('button',{name:'Add'}))
  await waitFor(()=>expect(screen.queryByLabelText('New 2026 goal')).not.toBeInTheDocument())
  expect(api.addGoal).toHaveBeenLastCalledWith(null,'A meaningful year','personal',expect.objectContaining({year:2026,id:expect.any(String)}))
  expect(lastRun().opts.ids).toEqual([api.addGoal.mock.calls[1][3].id])
 })
 it('at Season lists every season goal in one collection, naming its year goal, beside the year goal cards',()=>{
  api.tasks=[{id:'a',title:'Unhurried weekends',bucket:'quarter',goalId:'g'},{id:'b',title:'Autumn outings',bucket:'quarter',goalId:'g'},{id:'c',title:'Fix the gate',bucket:'quarter'},{id:'m',title:'Picnic',bucket:'month',sourceId:'b'}]
  season()
  const list=screen.getByRole('list',{name:'Fall goals'})
  expect(within(list).getAllByRole('listitem').map(li=>li.querySelector('.plan-item-title')?.textContent)).toEqual(['Unhurried weekends','Autumn outings','Fix the gate'])
  expect(within(list).getByText('Autumn outings').closest('li')).toHaveTextContent('2026 goal Together')
  expect(within(list).getByText('Fix the gate').closest('li')!.querySelector('.plan-item-parent')).toBeNull()
  expect(within(list).getByText('Autumn outings').closest('li')!.querySelector('.plan-count')).toHaveTextContent('1 month goal')
  // Every year goal is a card, empty ones included, with its open count.
  expect(within(group('Under Together')).getByText('2 Fall goals')).toBeInTheDocument()
  expect(within(group('Under Health')).getByText('Nothing for Fall yet')).toBeInTheDocument()
  expect(screen.getAllByText('Unhurried weekends')).toHaveLength(1)
 })
 it('at Month lists every month goal in one collection, naming its season goal, beside the season goal cards',()=>{
  api.tasks=[{id:'s',title:'Autumn outings',bucket:'quarter',goalId:'g'},{id:'m',title:'Picnic',bucket:'month',sourceId:'s'},{id:'x',title:'Taxes',bucket:'month'}]
  month()
  const list=monthList()
  expect(within(list).getByText('Picnic').closest('li')).toHaveTextContent('Fall goal Autumn outings')
  expect(within(list).getByText('Taxes').closest('li')!.querySelector('.plan-item-parent')).toBeNull()
  const outings=group('Under Autumn outings')
  expect(within(outings).getByText('Together')).toHaveClass('plan-group-crumb')
  expect(within(outings).getByText('1 October goal')).toBeInTheDocument()
  // One record, one card: the season card counts it, the collection holds it.
  expect(screen.getAllByText('Picnic')).toHaveLength(1)
 })
 it('adds from an empty year goal card as a linked child in one write',async()=>{
  season()
  fireEvent.click(within(group('Under Health')).getByRole('button',{name:'Add a Fall goal under Health'}))
  fireEvent.change(screen.getByLabelText('New Fall goal under Health'),{target:{value:'Walk daily'}})
  fireEvent.submit(screen.getByLabelText('New Fall goal under Health').closest('form')!)
  await waitFor(()=>expect(api.addTask).toHaveBeenCalledTimes(1))
  expect(api.addTask).toHaveBeenCalledWith('Walk daily',undefined,undefined,undefined,expect.objectContaining({bucket:'quarter',goalId:'other',context:'personal',seasonStart:new Date(2026,8,1)}))
 })
 it('adds a month goal from a season goal (it carries the intention) and one of its own',async()=>{
  api.tasks=[{id:'s',title:'Autumn outings',bucket:'quarter',goalId:'g'}]
  month()
  fireEvent.click(screen.getByRole('button',{name:'Add an October goal under Autumn outings'}))
  // Adding from a season goal selects it, so the new goal lights up beside it.
  expect(screen.getByTestId('where').textContent).toContain('focus=1%3As')
  fireEvent.change(screen.getByLabelText('New October goal under Autumn outings'),{target:{value:'Picnic'}})
  fireEvent.click(screen.getByRole('button',{name:'Add'}))
  await waitFor(()=>expect(api.addTask).toHaveBeenCalledWith('Picnic',undefined,undefined,undefined,expect.objectContaining({bucket:'month',sourceId:'s',goalId:'g',monthStart:new Date(2026,9,1)})))
  await waitFor(()=>expect(screen.queryByLabelText('New October goal under Autumn outings')).not.toBeInTheDocument())
  fireEvent.click(screen.getByRole('button',{name:'Add an October goal of its own'}))
  fireEvent.change(screen.getByLabelText('New October goal'),{target:{value:'Taxes'}})
  fireEvent.click(screen.getByRole('button',{name:'Add'}))
  await waitFor(()=>expect(api.addTask).toHaveBeenLastCalledWith('Taxes',undefined,undefined,undefined,expect.not.objectContaining({sourceId:expect.anything()})))
  expect(api.addTask).toHaveBeenLastCalledWith('Taxes',undefined,undefined,undefined,expect.objectContaining({bucket:'month',context:'personal'}))
 })
})

describe('focus',()=>{
 it('on Season selecting a year goal highlights its season goals, hides nothing, and Esc clears',()=>{
  api.tasks=[{id:'a',title:'Unhurried weekends',bucket:'quarter',goalId:'g'},{id:'h',title:'Run a 10k',bucket:'quarter',goalId:'other'}]
  season()
  fireEvent.click(screen.getByRole('button',{name:'Together'}))
  expect(screen.getByTestId('where').textContent).toContain('focus=0%3Ag')
  expect(screen.getByRole('button',{name:'Together'})).toHaveAttribute('aria-pressed','true')
  expect(screen.getByText('Unhurried weekends',{selector:'.plan-item-title'}).closest('li')).toHaveClass('is-related')
  expect(screen.getByText('Run a 10k').closest('li')).not.toHaveClass('is-related')
  fireEvent.keyDown(window,{key:'Escape'})
  expect(screen.getByTestId('where').textContent).not.toContain('focus=')
  expect(api.updateTask).not.toHaveBeenCalled()
 })
 it('on Month a grandparent focus highlights its month goals and hides nothing',()=>{
  api.tasks=[{id:'s',title:'Autumn outings',bucket:'quarter',goalId:'g'},{id:'t',title:'Strength',bucket:'quarter',goalId:'other'},
   {id:'m',title:'Picnic',bucket:'month',sourceId:'s'},{id:'n',title:'Lift twice a week',bucket:'month',sourceId:'t'}]
  month('&focus=0:g')
  expect(group('Under Autumn outings')).toBeInTheDocument()
  expect(group('Under Strength')).toBeInTheDocument()
  expect(within(monthList()).getByText('Picnic').closest('li')).toHaveClass('is-related')
  expect(within(monthList()).getByText('Lift twice a week').closest('li')).not.toHaveClass('is-related')
  expect(screen.getByRole('button',{name:'Add an October goal under Autumn outings'})).toBeEnabled()
 })
})

describe('Move under…',()=>{
 it('moves a milestone to another season goal, keeping its intention and clearing the old legacy link; Undo restores',async()=>{
  api.tasks=[{id:'s1',title:'Autumn outings',bucket:'quarter',goalId:'g'},{id:'s2',title:'Strength',bucket:'quarter',goalId:'other'},{id:'m',title:'Picnic',bucket:'month',sourceId:'s1',goalTaskId:'s1',goalId:'g'}]
  month()
  fireEvent.click(screen.getByRole('button',{name:'Actions for Picnic'}));fireEvent.click(screen.getByText('Move under…'))
  const menu=screen.getByRole('menu',{name:'Move Picnic under a season goal'})
  expect(within(menu).getByRole('menuitemradio',{name:'Autumn outings'})).toHaveAttribute('aria-checked','true')
  fireEvent.click(within(menu).getByRole('menuitemradio',{name:'Strength'}))
  await waitFor(()=>expect(api.updateTask).toHaveBeenCalledTimes(1))
  expect(api.updateTask.mock.calls[0]).toStrictEqual(['m',{sourceId:'s2',goalTaskId:undefined,goalId:'other'}])
  expect(lastRun().label).toBe('Move “Picnic” under “Strength”')
  await lastRun().opts.undo()
  expect(api.updateTask).toHaveBeenLastCalledWith('m',{sourceId:'s1',goalTaskId:'s1',goalId:'g'})
 })
 it('unlinks every field that shows the parent',async()=>{
  api.tasks=[{id:'s1',title:'Autumn outings',bucket:'quarter'},{id:'m',title:'Picnic',bucket:'month',sourceId:'s1',supportsGoalTaskId:'s1'}]
  month()
  fireEvent.click(screen.getByRole('button',{name:'Actions for Picnic'}));fireEvent.click(screen.getByText('Move under…'))
  fireEvent.click(screen.getByRole('menuitemradio',{name:'No parent (Unlinked)'}))
  await waitFor(()=>expect(api.updateTask).toHaveBeenCalledTimes(1))
  expect(api.updateTask.mock.calls[0][1]).toStrictEqual({sourceId:undefined,supportsGoalTaskId:undefined})
  expect(lastRun().label).toBe('Unlink “Picnic”')
 })
 it('links a season goal to an intention; a failed save offers Retry and no Undo',async()=>{
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
 it('drag onto a group header moves the item there',async()=>{
  api.tasks=[{id:'s1',title:'Autumn outings',bucket:'quarter'},{id:'s2',title:'Strength',bucket:'quarter'},{id:'m',title:'Picnic',bucket:'month',sourceId:'s1'}]
  month();showEmpty()
  const row=screen.getByText('Picnic').closest('li')!
  fireEvent.dragStart(row,{dataTransfer:{setData:vi.fn(),effectAllowed:''}})
  fireEvent.dragOver(group('Under Strength'))
  fireEvent.drop(group('Under Strength'))
  await waitFor(()=>expect(api.updateTask).toHaveBeenCalledWith('m',{sourceId:'s2'}))
 })
})

describe('two labelled parts below Year',()=>{
 const heads=()=>screen.getAllByRole('heading',{level:2}).map(h=>h.textContent)
 it('Season asks what this season is for, beside the year it builds from',()=>{
  api.tasks=[{id:'a',title:'Unhurried weekends',bucket:'quarter',goalId:'g'},{id:'c',title:'Fix the gate',bucket:'quarter'}]
  season()
  expect(heads()).toEqual(['What do you want to accomplish in Fall?','2026 goals'])
  expect(screen.getByText('Build your season from your 2026 goals, and add anything else that matters.')).toBeInTheDocument()
  expect(screen.queryByRole('heading',{name:/^(Under a|Not under a) year goal$/})).toBeNull()
 })
 it('hides and shows the year goal column without touching the season collection',()=>{
  api.tasks=[{id:'a',title:'Unhurried weekends',bucket:'quarter',goalId:'g'}]
  season()
  fireEvent.click(screen.getByRole('button',{name:'Hide 2026 goals'}))
  expect(screen.getByRole('button',{name:'Show 2026 goals'})).toHaveAttribute('aria-expanded','false')
  expect(within(screen.getByRole('list',{name:'Fall goals'})).getByText('Unhurried weekends')).toBeInTheDocument()
 })
 it('Month asks what this month is for, beside the season it builds from',()=>{
  api.tasks=[{id:'s',title:'Autumn outings',bucket:'quarter',goalId:'g'},{id:'m',title:'Picnic',bucket:'month',sourceId:'s'},{id:'x',title:'Taxes',bucket:'month'}]
  month()
  expect(heads()).toEqual(['What do you want to accomplish in October?','Fall goals'])
  expect(screen.getByText('Build your month from your Fall goals, and add anything else that matters.')).toBeInTheDocument()
  expect(screen.getByRole('heading',{level:1})).toHaveTextContent('October 2026')
 })
 it('drop on a card files the item under that goal',async()=>{
  api.tasks=[{id:'a',title:'Unhurried weekends',bucket:'quarter',goalId:'g'},{id:'s',title:'Autumn outings',bucket:'quarter'}]
  season()
  fireEvent.dragStart(screen.getByText('Autumn outings').closest('li')!,{dataTransfer:{setData:vi.fn(),effectAllowed:''}})
  const target=group('Under Together')
  expect(target).toHaveClass('is-drop-ok')
  fireEvent.dragOver(target);fireEvent.drop(target)
  await waitFor(()=>expect(api.updateTask).toHaveBeenCalledWith('s',{goalId:'g'}))
 })
 it('an empty year goal card takes a drop too',async()=>{
  api.tasks=[{id:'a',title:'Unhurried weekends',bucket:'quarter',goalId:'g'},{id:'s',title:'Autumn outings',bucket:'quarter'}]
  season()
  fireEvent.dragStart(screen.getByText('Autumn outings').closest('li')!,{dataTransfer:{setData:vi.fn(),effectAllowed:''}})
  const health=group('Under Health')
  fireEvent.dragOver(health);fireEvent.drop(health)
  await waitFor(()=>expect(api.updateTask).toHaveBeenCalledWith('s',{goalId:'other'}))
 })
 it('shows no board, and no empty-plan message, while the plans load',()=>{
  ;(api as any).loading=true
  try{
   season()
   expect(screen.getByText('Loading your plans…')).toBeInTheDocument()
   expect(screen.queryByText(/yet\. Add/)).toBeNull()
   expect(screen.queryByRole('list',{name:'Season plan'})).toBeNull()
  }finally{delete (api as any).loading}
 })
 it('Year stays one list',()=>{
  open()
  expect(screen.queryByRole('heading',{name:/^Under a/})).toBeNull()
 })
 it('a season with nothing planned yet stays one list',()=>{
  season()
  expect(screen.queryByRole('heading',{name:'Under a year goal'})).toBeNull()
 })
})

describe('calm order',()=>{
 it('Month keeps every season goal as a card in its own order, empty ones included, with open counts',()=>{
  api.tasks=[{id:'s1',title:'Yard',bucket:'quarter'},{id:'s2',title:'Money',bucket:'quarter'},{id:'s3',title:'Rooms',bucket:'quarter'},
   {id:'m1',title:'Budget',bucket:'month',sourceId:'s2'},{id:'m2',title:'Trim plants',bucket:'month',sourceId:'s1'},{id:'m3',title:'Chairs',bucket:'month',sourceId:'s1'}]
  month()
  const cards=within(screen.getByRole('list',{name:'Fall goals'})).getAllByRole('region')
  expect(cards.map(r=>r.getAttribute('aria-label'))).toEqual(['Under Yard','Under Money','Under Rooms'])
  expect(cards.map(r=>r.querySelector('.plan-source-count')?.textContent)).toEqual(['2 October goals','1 October goal','Nothing for October yet'])
  expect(screen.queryByRole('button',{name:/with nothing in/})).not.toBeInTheDocument()
  expect(within(monthList()).getAllByRole('listitem').map(li=>li.querySelector('.plan-item-title')?.textContent)).toEqual(['Budget','Trim plants','Chairs'])
 })
 it('asks Symphony where unparented items go, and a kept suggestion links the existing item',async()=>{
  api.tasks=[{id:'s1',title:'Yard',bucket:'quarter'},{id:'m',title:'Trim plants',bucket:'month'}]
  activity.proposals=[{key:'k',title:'Trim the plants (model wording)',level:2,parentId:'s1',itemId:'m',state:'proposed'}]
  month()
  fireEvent.click(screen.getByRole('button',{name:'Suggest Fall goals for the ones on their own'}))
  expect(launcher.openAssistant).toHaveBeenCalledWith(expect.objectContaining({message:expect.stringContaining('Which fall goal does each'),autoSend:true}))
  // The suggestion sits in the month collection, naming the goal it would join.
  const suggestion=within(monthList()).getByText('Belongs here?').closest('li')!
  expect(suggestion).toHaveTextContent('Fall goal Yard')
  fireEvent.click(within(suggestion).getByRole('button',{name:'Link Trim plants'}))
  await waitFor(()=>expect(activity.removeProposal).toHaveBeenCalledWith('k'))
  expect(api.updateTask).toHaveBeenCalledWith('m',{sourceId:'s1'})
  expect(api.addTask).not.toHaveBeenCalled()
 })
})

describe('Month: what do I want to accomplish this month (2026-10-12)',()=>{
 const TASKS=()=>[{id:'s',title:'Autumn outings',bucket:'quarter',goalId:'g'},{id:'t',title:'Strength',bucket:'quarter'},
  {id:'m',title:'Picnic',bucket:'month',sourceId:'s'},{id:'x',title:'Taxes',bucket:'month'}]
 const titles=()=>within(monthList()).getAllByRole('listitem').map(li=>li.querySelector('.plan-item-title')?.textContent)
 it('keeps every month goal in the collection with the season goals shown or hidden, without writing',()=>{
  api.tasks=TASKS()
  month()
  expect(titles()).toEqual(['Picnic','Taxes'])
  fireEvent.click(screen.getByRole('button',{name:'Hide Fall goals'}))
  expect(screen.queryByRole('region',{name:'Under Autumn outings'})).not.toBeInTheDocument()
  expect(screen.getByRole('button',{name:'Show Fall goals'})).toHaveAttribute('aria-expanded','false')
  expect(titles()).toEqual(['Picnic','Taxes'])
  expect(within(monthList()).getByText('Picnic').closest('li')).toHaveTextContent('Fall goal Autumn outings')
  expect(localStorage.getItem('symphony.month.seasonGoalsShown')).toBe('0')
  fireEvent.click(screen.getByRole('button',{name:'Show Fall goals'}))
  expect(group('Under Autumn outings')).toBeInTheDocument()
  expect(titles()).toEqual(['Picnic','Taxes'])
  expect(api.updateTask).not.toHaveBeenCalled()
  expect(api.addTask).not.toHaveBeenCalled()
 })
 it('remembers hidden season goals for this viewer',()=>{
  localStorage.setItem('symphony.month.seasonGoalsShown','0')
  api.tasks=TASKS()
  month()
  expect(screen.getByRole('button',{name:'Show Fall goals'})).toBeInTheDocument()
  expect(titles()).toEqual(['Picnic','Taxes'])
 })
 it('hiding the season goals keeps a goal still being written under one',()=>{
  api.tasks=TASKS()
  month()
  fireEvent.click(screen.getByRole('button',{name:'Add an October goal under Strength'}))
  fireEvent.change(screen.getByLabelText('New October goal under Strength'),{target:{value:'Lift twice a week'}})
  fireEvent.click(screen.getByRole('button',{name:'Hide Fall goals'}))
  fireEvent.click(screen.getByRole('button',{name:'Show Fall goals'}))
  expect(screen.getByLabelText('New October goal under Strength')).toHaveValue('Lift twice a week')
  expect(api.addTask).not.toHaveBeenCalled()
 })
 it('selecting a season goal highlights and previews its month goals, hides none, and Esc clears',()=>{
  api.tasks=TASKS()
  month()
  const pick=screen.getByRole('button',{name:'Autumn outings'})
  fireEvent.click(pick)
  expect(screen.getByTestId('where').textContent).toContain('focus=1%3As')
  expect(pick).toHaveAttribute('aria-pressed','true')
  expect(within(monthList()).getByText('Picnic').closest('li')).toHaveClass('is-related')
  expect(within(monthList()).getByText('Taxes').closest('li')).not.toHaveClass('is-related')
  expect(titles()).toEqual(['Picnic','Taxes'])
  expect(within(screen.getByRole('list',{name:'October goals under Autumn outings'})).getByText('Picnic')).toBeInTheDocument()
  expect(screen.getByText('Highlighting 1 October goal for Autumn outings')).toHaveAttribute('role','status')
  fireEvent.keyDown(window,{key:'Escape'})
  expect(screen.getByRole('button',{name:'Autumn outings'})).toHaveAttribute('aria-pressed','false')
  expect(within(monthList()).getByText('Picnic').closest('li')).not.toHaveClass('is-related')
  expect(api.updateTask).not.toHaveBeenCalled()
 })
 it('a goal arriving from Season’s “See its month goals” opens with its season goal selected',()=>{
  api.tasks=TASKS()
  month('&focus=1:s')
  expect(screen.getByRole('button',{name:'Autumn outings'})).toHaveAttribute('aria-pressed','true')
  expect(titles()).toEqual(['Picnic','Taxes'])
 })
 it('linking a goal by dragging names its season goal on it and lights both, without a copy',async()=>{
  api.tasks=TASKS()
  month()
  fireEvent.dragStart(within(monthList()).getByText('Taxes').closest('li')!,{dataTransfer:{setData:vi.fn(),effectAllowed:''}})
  const strength=group('Under Strength')
  expect(strength).toHaveClass('is-drop-ok')
  fireEvent.dragOver(strength);fireEvent.drop(strength)
  await waitFor(()=>expect(api.updateTask).toHaveBeenCalledWith('x',{sourceId:'t'}))
  await waitFor(()=>expect(group('Under Strength')).toHaveClass('is-linked'))
  expect(within(monthList()).getByText('Taxes').closest('li')).toHaveClass('is-linked')
  // The refreshed record: same goal, now with its parent named; still one card.
  api.tasks[3]={...api.tasks[3],sourceId:'t'}
  fireEvent.click(screen.getByRole('button',{name:'Hide Fall goals'}))
  expect(within(monthList()).getByText('Taxes').closest('li')).toHaveTextContent('Fall goal Strength')
  expect(titles()).toEqual(['Picnic','Taxes'])
  expect(api.addTask).not.toHaveBeenCalled()
  expect(lastRun().label).toBe('Move “Taxes” under “Strength”')
  await lastRun().opts.undo()
  expect(api.updateTask).toHaveBeenLastCalledWith('x',{sourceId:undefined})
 })
 it('unlinking keeps the goal in the collection',async()=>{
  api.tasks=TASKS()
  month()
  fireEvent.click(screen.getByRole('button',{name:'Actions for Picnic'}));fireEvent.click(screen.getByText('Move under…'))
  fireEvent.click(screen.getByRole('menuitemradio',{name:'No parent (Unlinked)'}))
  await waitFor(()=>expect(api.updateTask).toHaveBeenCalledWith('m',{sourceId:undefined}))
  api.tasks[2]={...api.tasks[2],sourceId:undefined}
  fireEvent.click(screen.getByRole('button',{name:'Hide Fall goals'}))
  expect(titles()).toEqual(['Picnic','Taxes'])
  expect(within(monthList()).getByText('Picnic').closest('li')!.querySelector('.plan-item-parent')).toBeNull()
 })
 it('an empty month offers the season and a goal of its own, and Week only once something is planned',()=>{
  api.goals=[]
  month()
  expect(screen.getByText('Nothing for October yet.')).toBeInTheDocument()
  expect(screen.getByText(/No Fall goals yet/)).toBeInTheDocument()
  expect(screen.queryByRole('link',{name:'Plan a week from these goals →'})).toBeNull()
  expect(screen.getByRole('button',{name:'Add an October goal of its own'})).toBeEnabled()
  fireEvent.click(screen.getByRole('button',{name:'Add Fall goals'}))
  expect(screen.getByTestId('where').textContent).toContain('horizon=1')
 })
 it('goes on to plan a week from these goals, for the month on screen',()=>{
  api.tasks=TASKS()
  month()
  expect(screen.getByRole('link',{name:'Plan a week from these goals →'})).toHaveAttribute('href','/week?view=alongside&date=2026-10-09')
  fireEvent.click(screen.getByRole('button',{name:'Season'}))
  expect(screen.getByTestId('where').textContent).toContain('horizon=1')
 })
 it('names the month and its season for the period on screen',()=>{
  month()
  fireEvent.click(screen.getByRole('button',{name:'Next month'}))
  expect(screen.getByRole('heading',{name:'What do you want to accomplish in November?'})).toBeInTheDocument()
  expect(screen.getByRole('button',{name:'Add a November goal of its own'})).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'Next month'}))
  expect(screen.getByRole('heading',{name:'What do you want to accomplish in December?'})).toBeInTheDocument()
  expect(screen.getByText('Build your month from your Winter goals, and add anything else that matters.')).toBeInTheDocument()
  expect(screen.getByRole('button',{name:'Hide Winter goals'})).toBeInTheDocument()
 })
 it('shows completed goals in the collection only when asked, with counts of open goals',()=>{
  api.tasks=[...TASKS(),{id:'d',title:'Book the cabin',bucket:'month',sourceId:'s',completed:true}]
  month()
  expect(titles()).toEqual(['Picnic','Taxes'])
  expect(within(group('Under Autumn outings')).getByText('1 October goal')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'Show done (1)'}))
  expect(titles()).toEqual(['Picnic','Taxes','Book the cabin'])
  expect(within(monthList()).getByText('Book the cabin').closest('li')).toHaveTextContent('Done')
  expect(within(group('Under Autumn outings')).getByText('1 October goal')).toBeInTheDocument()
 })
})

describe('proposals',()=>{
 it('shows suggestions in the season collection naming their year goal, keeps through the create path, and leaves out without writing',async()=>{
  activity.proposals=[{key:'p1',title:'Visit Mom',level:1,parentId:'g',state:'proposed',reason:'You mentioned it'},{key:'p2',title:'Garden',level:1,state:'proposed'},{key:'p3',title:'Not now',level:2,state:'proposed'}]
  season()
  const list=screen.getByRole('list',{name:'Fall goals'})
  const visit=within(list).getByText('Visit Mom').closest('li')!
  expect(visit.querySelector('.canvas-item')).toHaveClass('is-proposed')
  expect(visit).toHaveTextContent('2026 goal Together')
  expect(within(list).getByText('Garden').closest('li')!.querySelector('.plan-item-parent')).toBeNull()
  expect(screen.queryByText('Not now')).not.toBeInTheDocument()
  expect(screen.getByRole('button',{name:'Keep all (2)'})).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'Keep Visit Mom'}))
  await waitFor(()=>expect(activity.removeProposal).toHaveBeenCalledWith('p1'))
  expect(activity.setProposalState).toHaveBeenCalledWith('p1','saving')
  expect(api.addTask).toHaveBeenCalledWith('Visit Mom',undefined,undefined,undefined,expect.objectContaining({bucket:'quarter',goalId:'g'}))
  fireEvent.click(screen.getByRole('button',{name:'Leave out Garden'}))
  expect(activity.removeProposal).toHaveBeenCalledWith('p2')
  expect(api.addTask).toHaveBeenCalledTimes(1)
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

describe('done items and triage',()=>{
 it('hides completed items by default while a finished parent keeps its open children',()=>{
  api.tasks=[{id:'s',title:'Finished season',bucket:'quarter',completed:true},{id:'m',title:'Still open',bucket:'month',sourceId:'s'},{id:'d',title:'Done milestone',bucket:'month',completed:true}]
  month()
  expect(within(group('Under Finished season')).getByText('Done')).toBeInTheDocument()
  expect(within(monthList()).getByText('Still open').closest('li')).toHaveTextContent('Fall goal Finished season')
  expect(screen.queryByText('Done milestone')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'Show done (1)'}))
  expect(screen.getByText('Done milestone')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'Hide done (1)'}))
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
 it('triages intentions through their status, with Undo restoring it',async()=>{
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
})

describe('prepared to act on plan rows',()=>{
 it('marks what an item carries and summarises it, with the plan above, when opened',()=>{
  api.tasks=[{id:'s',title:'Back to school',bucket:'quarter',links:[{url:'https://supplies.test'}]},{id:'m',title:'Call Cami',bucket:'month',sourceId:'s',contactId:'cami',subtasks:[{id:'q1',title:'Pickup?'},{id:'q2',title:'Forms?',completed:true}]}]
  month()
  const row=screen.getByText('Call Cami').closest('li')!
  expect(within(row).getByRole('img',{name:'Has contact, steps 1 of 2'})).toBeInTheDocument()
  fireEvent.click(within(row).getByRole('button',{name:'Call Cami'}))
  expect(within(row).getByText('From Back to school: 1 link')).toBeInTheDocument()
 })
})

describe('one conversation, at the foot (approved Season board, 2026-10-10)',()=>{
 beforeEach(()=>{vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date(2026,9,11,9))})
 afterEach(()=>{vi.useRealTimers()})
 it('hands its walk to the docked bar instead of showing its own, and has no masthead numeral',()=>{
  const setWalk=vi.fn()
  render(<ConversationWalkContext.Provider value={setWalk}><MemoryRouter initialEntries={['/season?view=constellation&horizon=1']}><Routes>
   <Route path="/season" element={<ConstellationPage/>}/>
  </Routes></MemoryRouter></ConversationWalkContext.Provider>)
  expect(screen.queryByRole('button',{name:/with me$/})).not.toBeInTheDocument()
  expect(setWalk).toHaveBeenLastCalledWith({label:'Plan this season with me',message:expect.stringContaining('Fall 2026 across my year goals')})
  expect(screen.getByRole('heading',{level:1})).toHaveTextContent('Fall 2026')
  expect(screen.queryByText(/09\s*[–—-]\s*11/)).not.toBeInTheDocument()
  expect(screen.queryByText(/Life area for new/)).not.toBeInTheDocument()
 })
 it('names a past period in the walk and offers the way back',()=>{
  open('/season?view=constellation&horizon=1&start=2025-10-01')
  expect(screen.getByRole('button',{name:'Plan Fall 2025 with me'})).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'Back to this season'}))
  expect(screen.getByTestId('where').textContent).not.toContain('start=')
 })
})
