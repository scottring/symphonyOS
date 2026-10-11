import {render,screen,fireEvent,waitFor,within} from '@testing-library/react'
import {MemoryRouter,Routes,Route,useLocation} from 'react-router-dom'
import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest'
import {ConstellationPage} from './ConstellationPage'
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
// Empty parents fold only once the period holds something.
const showEmpty=()=>{const fold=screen.queryByRole('button',{name:/with nothing in/});if(fold)fireEvent.click(fold)}
const lastRun=()=>activity.calls[activity.calls.length-1]
beforeEach(()=>{
 vi.clearAllMocks();api.tasks=[];api.goals=GOALS.map(g=>({...g}));activity.calls=[];activity.proposals=[]
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
 it('shows a conversation-saved item in its group and refreshes on later saves',()=>{
  api.tasks=[{id:'s',title:'Autumn outings',bucket:'quarter',goalId:'g'}]
  open('/year?view=constellation&start=2026-10-09&horizon=1&focus=1:s')
  const row=within(group('Under Together')).getByText('Autumn outings').closest('li')!
  expect(within(row).getByText('Saved')).toBeInTheDocument()
  expect(screen.getByRole('button',{name:/1 yearly intention with nothing in Fall/})).toBeInTheDocument()
  fireEvent(window,new Event('symphony-plan-updated'))
  expect(api.refetch).toHaveBeenCalledTimes(1)
 })
 it('opens a horizon-wide planning conversation and offers the next horizon',()=>{
  api.tasks=[{id:'s',title:'Autumn outings',bucket:'quarter',goalId:'g'}]
  season()
  fireEvent.click(screen.getByRole('button',{name:'Plan Fall 2026 with Symphony'}))
  expect(launcher.openAssistant).toHaveBeenCalledWith(expect.objectContaining({message:expect.stringContaining('Fall 2026 across all my yearly intentions, one at a time')}))
  fireEvent.click(screen.getByRole('button',{name:'Next: Month →'}))
  expect(screen.getByRole('button',{name:'Month'})).toHaveAttribute('aria-current','step')
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
  expect(screen.queryByRole('button',{name:'This season'})).not.toBeInTheDocument()
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
  expect(within(group('Under Together')).getByRole('button',{name:'Add a seasonal goal under Together'})).toBeInTheDocument()
  expect(screen.queryByText(/Everything for Fall is under/)).not.toBeInTheDocument()
  expect(screen.getByText('Seasonal goals that aren’t under a yearly intention go here.')).toBeInTheDocument()
 })
 it('with no intentions for the year, the season offers goals on their own or intentions first',()=>{
  api.goals=[]
  season()
  expect(group('Fall seasonal goals')).toHaveTextContent('No yearly intentions for 2026 yet.')
  fireEvent.click(screen.getByRole('button',{name:'add yearly intentions first'}))
  expect(screen.getByRole('button',{name:'Year'})).toHaveAttribute('aria-current','step')
 })
})

describe('grouped under parent',()=>{
 it('at Year the intentions are the items, and a new one keeps its wording when the save fails',async()=>{
  api.addGoal.mockResolvedValueOnce(null);open()
  expect(within(group('Yearly intentions')).getByText('Together')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'Add a yearly intention'}))
  fireEvent.change(screen.getByLabelText('New yearly intention'),{target:{value:'A meaningful year'}})
  fireEvent.click(screen.getByRole('button',{name:'Add'}))
  await screen.findByText(/Your wording is still here/)
  expect(screen.getByLabelText('New yearly intention')).toHaveValue('A meaningful year')
  fireEvent.click(screen.getByRole('button',{name:'Add'}))
  await waitFor(()=>expect(screen.queryByLabelText('New yearly intention')).not.toBeInTheDocument())
  expect(api.addGoal).toHaveBeenLastCalledWith(null,'A meaningful year','personal',expect.objectContaining({year:2026,id:expect.any(String)}))
  expect(lastRun().opts.ids).toEqual([api.addGoal.mock.calls[1][3].id])
 })
 it('at Season groups goals under each intention once, empty intentions calm, Unlinked last',()=>{
  api.tasks=[{id:'a',title:'Unhurried weekends',bucket:'quarter',goalId:'g'},{id:'b',title:'Autumn outings',bucket:'quarter',goalId:'g'},{id:'c',title:'Fix the gate',bucket:'quarter'},{id:'m',title:'Picnic',bucket:'month',sourceId:'b'}]
  season()
  const together=group('Under Together')
  expect(within(together).getAllByRole('listitem').map(li=>li.querySelector('.plan-item-title')?.textContent)).toEqual(['Unhurried weekends','Autumn outings'])
  expect(screen.getAllByText('Together')).toHaveLength(1)
  expect(within(together).getByLabelText('1 monthly milestone below')).toHaveTextContent('1')
  const regions=screen.getAllByRole('region').map(r=>r.getAttribute('aria-label'))
  expect(regions).toEqual(['Under Together','Not under a yearly intention'])
  expect(within(group('Not under a yearly intention')).getByText('Fix the gate')).toBeInTheDocument()
  // An intention holding nothing this season folds into one line until asked for.
  expect(screen.queryByRole('region',{name:'Under Health'})).not.toBeInTheDocument()
  showEmpty()
  expect(within(group('Under Health')).getByText('Nothing for Fall yet.')).toBeInTheDocument()
 })
 it('at Month groups milestones under seasonal goals with the intention as a crumb',()=>{
  api.tasks=[{id:'s',title:'Autumn outings',bucket:'quarter',goalId:'g'},{id:'m',title:'Picnic',bucket:'month',sourceId:'s'},{id:'x',title:'Taxes',bucket:'month'}]
  month()
  const outings=group('Under Autumn outings')
  expect(within(outings).getByText('Picnic')).toBeInTheDocument()
  expect(within(outings).getByText('Together')).toHaveClass('plan-group-crumb')
  expect(within(group('Not under a fall goal')).getByText('Taxes')).toBeInTheDocument()
 })
 it('adds from an empty group as a linked child in one write',async()=>{
  season();showEmpty()
  fireEvent.click(within(group('Under Health')).getByRole('button',{name:'Add a seasonal goal under Health'}))
  fireEvent.change(screen.getByLabelText('New seasonal goal under Health'),{target:{value:'Walk daily'}})
  fireEvent.submit(screen.getByLabelText('New seasonal goal under Health').closest('form')!)
  await waitFor(()=>expect(api.addTask).toHaveBeenCalledTimes(1))
  expect(api.addTask).toHaveBeenCalledWith('Walk daily',undefined,undefined,undefined,expect.objectContaining({bucket:'quarter',goalId:'other',context:'personal',seasonStart:new Date(2026,8,1)}))
 })
 it('adds an independent item from Unlinked and a month child carries its intention',async()=>{
  api.tasks=[{id:'s',title:'Autumn outings',bucket:'quarter',goalId:'g'}]
  month();showEmpty()
  fireEvent.click(screen.getByRole('button',{name:'Add a monthly milestone under Autumn outings'}))
  fireEvent.change(screen.getByLabelText('New monthly milestone under Autumn outings'),{target:{value:'Picnic'}})
  fireEvent.click(screen.getByRole('button',{name:'Add'}))
  await waitFor(()=>expect(api.addTask).toHaveBeenCalledWith('Picnic',undefined,undefined,undefined,expect.objectContaining({bucket:'month',sourceId:'s',goalId:'g',monthStart:new Date(2026,9,1)})))
  fireEvent.click(screen.getByRole('button',{name:'Add an independent monthly milestone'}))
  fireEvent.change(screen.getByLabelText('New monthly milestone'),{target:{value:'Taxes'}})
  fireEvent.click(screen.getByRole('button',{name:'Add'}))
  await waitFor(()=>expect(api.addTask).toHaveBeenLastCalledWith('Taxes',undefined,undefined,undefined,expect.not.objectContaining({sourceId:expect.anything()})))
 })
})

describe('focus',()=>{
 it('narrows to a group, folds the others in place, and Esc or Show all returns',()=>{
  api.tasks=[{id:'a',title:'Unhurried weekends',bucket:'quarter',goalId:'g'},{id:'h',title:'Run a 10k',bucket:'quarter',goalId:'other'}]
  season()
  fireEvent.click(screen.getByRole('button',{name:'Focus on Together'}))
  expect(screen.getByTestId('where').textContent).toContain('focus=0%3Ag')
  expect(screen.getByRole('button',{name:'Focus on Together'})).toHaveAttribute('aria-pressed','true')
  expect(screen.queryByText('Run a 10k')).not.toBeInTheDocument()
  expect(screen.getByRole('button',{name:'Focus on Health'})).toHaveClass('is-quiet')
  fireEvent.keyDown(window,{key:'Escape'})
  expect(screen.getByText('Run a 10k')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'Focus on Health'}))
  expect(screen.queryByText('Unhurried weekends')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'Show all · Esc'}))
  expect(screen.getByText('Unhurried weekends')).toBeInTheDocument()
  expect(api.updateTask).not.toHaveBeenCalled()
 })
 it('keeps add available while focused, and a grandparent focus narrows to its groups',()=>{
  api.tasks=[{id:'s',title:'Autumn outings',bucket:'quarter',goalId:'g'},{id:'t',title:'Strength',bucket:'quarter',goalId:'other'}]
  month('&focus=0:g')
  expect(group('Under Autumn outings')).toBeInTheDocument()
  expect(screen.queryByRole('region',{name:'Under Strength'})).not.toBeInTheDocument()
  expect(screen.getByRole('button',{name:'Add a monthly milestone under Autumn outings'})).toBeEnabled()
 })
})

describe('Move under…',()=>{
 it('moves a milestone to another seasonal goal, keeping its intention and clearing the old legacy link; Undo restores',async()=>{
  api.tasks=[{id:'s1',title:'Autumn outings',bucket:'quarter',goalId:'g'},{id:'s2',title:'Strength',bucket:'quarter',goalId:'other'},{id:'m',title:'Picnic',bucket:'month',sourceId:'s1',goalTaskId:'s1',goalId:'g'}]
  month()
  fireEvent.click(screen.getByRole('button',{name:'Actions for Picnic'}));fireEvent.click(screen.getByText('Move under…'))
  const menu=screen.getByRole('menu',{name:'Move Picnic under a seasonal goal'})
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
 it('links a seasonal goal to an intention; a failed save offers Retry and no Undo',async()=>{
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

describe('calm order',()=>{
 it('lists the fullest goals first and folds the empty ones with their names',()=>{
  api.tasks=[{id:'s1',title:'Yard',bucket:'quarter'},{id:'s2',title:'Money',bucket:'quarter'},{id:'s3',title:'Rooms',bucket:'quarter'},
   {id:'m1',title:'Budget',bucket:'month',sourceId:'s2'},{id:'m2',title:'Trim plants',bucket:'month',sourceId:'s1'},{id:'m3',title:'Chairs',bucket:'month',sourceId:'s1'}]
  month()
  expect(screen.getAllByRole('region').map(r=>r.getAttribute('aria-label'))).toEqual(['Under Yard','Under Money','Not under a fall goal'])
  const fold=screen.getByRole('button',{name:/with nothing in/})
  expect(fold).toHaveTextContent('1 fall goal with nothing in October')
  expect(fold).toHaveTextContent('Rooms')
  expect(fold).toHaveAttribute('aria-expanded','false')
 })
 it('asks Symphony where unparented items go, and a kept suggestion links the existing item',async()=>{
  api.tasks=[{id:'s1',title:'Yard',bucket:'quarter'},{id:'m',title:'Trim plants',bucket:'month'}]
  activity.proposals=[{key:'k',title:'Trim the plants (model wording)',level:2,parentId:'s1',itemId:'m',state:'proposed'}]
  month()
  fireEvent.click(screen.getByRole('button',{name:'Suggest where these go'}))
  expect(launcher.openAssistant).toHaveBeenCalledWith(expect.objectContaining({message:expect.stringContaining('Which fall goal does each'),autoSend:true}))
  const yard=group('Under Yard')
  expect(within(yard).getByText('Belongs here?')).toBeInTheDocument()
  fireEvent.click(within(yard).getByRole('button',{name:'Link Trim plants'}))
  await waitFor(()=>expect(activity.removeProposal).toHaveBeenCalledWith('k'))
  expect(api.updateTask).toHaveBeenCalledWith('m',{sourceId:'s1'})
  expect(api.addTask).not.toHaveBeenCalled()
 })
})

describe('proposals',()=>{
 it('shows suggestions in their parent group or Unlinked, keeps through the create path, and leaves out without writing',async()=>{
  activity.proposals=[{key:'p1',title:'Visit Mom',level:1,parentId:'g',state:'proposed',reason:'You mentioned it'},{key:'p2',title:'Garden',level:1,state:'proposed'},{key:'p3',title:'Not now',level:2,state:'proposed'}]
  season()
  expect(within(group('Under Together')).getByText('Visit Mom').closest('.canvas-item')).toHaveClass('is-proposed')
  expect(within(group('Not under a yearly intention')).getByText('Garden')).toBeInTheDocument()
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
  expect(within(group('Under Finished season')).getByText('Still open')).toBeInTheDocument()
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
  fireEvent.click(screen.getByText('Archive intention'))
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
