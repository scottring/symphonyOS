import {render,screen,fireEvent,waitFor,within,cleanup,createEvent,act} from '@testing-library/react'
import {MemoryRouter,Routes,Route,useLocation} from 'react-router-dom'
import {afterEach,beforeEach,describe,it,expect,onTestFinished,vi} from 'vitest'
import {ConstellationPage} from './ConstellationPage'
import {ConversationWalkContext} from '@/components/canvas/conversationWalk'
import {GuidedSessionProvider,useGuidedSession} from '@/contexts/GuidedSessionContext'
import {stepsFor} from '@/lib/guide/steps'
const api=vi.hoisted(()=>({addGoal:vi.fn(),updateGoal:vi.fn(),deleteGoal:vi.fn(),addTask:vi.fn(),updateTask:vi.fn(),refetch:vi.fn(),pushTask:vi.fn(),setBucket:vi.fn(),updateTasksBulk:vi.fn(),toggleTask:vi.fn(),deleteTask:vi.fn(),keepForward:vi.fn(),dropCommitment:vi.fn(),updateTaskOrders:vi.fn(),redraw:(()=>{}) as ()=>void,tasks:[] as any[],goals:[] as any[]}))
const activity=vi.hoisted(()=>({calls:[] as {label:string;ok:boolean;opts:any}[],proposals:[] as any[],changeSet:null as any,setProposalState:vi.fn(),removeProposal:vi.fn()}))
const lifeAreas=vi.hoisted(()=>({list:[] as any[],add:vi.fn(async()=>null),rename:vi.fn(async()=>true),setContext:vi.fn(async()=>true),remove:vi.fn(async()=>true)}))
const launcher=vi.hoisted(()=>({openAssistant:vi.fn()}))
const selection=vi.hoisted(()=>({setSelection:vi.fn()}))
vi.mock('@/hooks/useLifeAreas',()=>({useLifeAreas:()=>({areas:lifeAreas.list,loading:false,add:lifeAreas.add,rename:lifeAreas.rename,setContext:lifeAreas.setContext,remove:lifeAreas.remove})}))
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
const filters=vi.hoisted(()=>({on:false,layers:new Set<string>(),people:[] as string[],sole:'personal' as string|null}))
vi.mock('@/hooks/useDomain',()=>({useDomain:()=>({layers:filters.on?filters.layers:[],soleDomain:filters.sole})}))
vi.mock('@/hooks/useAssigneeFilter',()=>({useAssigneeFilter:()=>[filters.on?filters.people:[]]}))
vi.mock('@/hooks/useFamilyMembers',()=>({useFamilyMembers:()=>({getCurrentUserMember:()=>null,members:[{auth_user_id:'u2',name:'Iris'}]})}))
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>({user:{id:'u1'}})}))
// The routines on each day (none, unless a test gives some).
const routines=vi.hoisted(()=>({forDate:(_d:Date)=>[] as any[]}))
vi.mock('@/hooks/useRoutines',()=>({useRoutines:()=>({getRoutinesForDate:(d:Date)=>routines.forDate(d)})}))
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
// The space a new line is written in: 'personal' with no picker, unless a
// test asks for the real one (the write line's space).
const addArea=vi.hoisted(()=>({real:false}))
vi.mock('../v2/AddArea',async(importOriginal)=>{const real=await importOriginal<typeof import('../v2/AddArea')>();return{useAddArea:()=>addArea.real?real.useAddArea():{area:'personal',picker:null}}})
vi.mock('@/lib/planning/periodPage',async(importOriginal)=>({...await importOriginal<any>(),selectPeriodTasks:(tasks:any[],level:string,start:Date)=>tasks.filter(t=>t.bucket===(level==='season'?'quarter':'month')&&(!t.monthStart||+t.monthStart===+start))}))
vi.mock('@/lib/placement/model',async(importOriginal)=>({...await importOriginal<any>(),committedTo:(t:any)=>t.bucket==='week'?{}:undefined}))
const toast=vi.hoisted(()=>({showToast:vi.fn()}))
vi.mock('@/hooks/useToast',async(importOriginal)=>({...await importOriginal<any>(),showToast:toast.showToast}))
vi.mock('@/components/domain/DomainGate',()=>({useDomainGate:()=>({requireDomain:vi.fn().mockResolvedValue('personal')})}))
// The guided session's notes row (usePlanningNotes), in memory: where the
// session is, and what patch merged into it.
// A test may give each period its own row (byToken: Fall's and Winter's
// notes apart, as the real rows are), or make the read load or fail.
const notesStore=vi.hoisted(()=>({notes:{} as Record<string,unknown>,patches:[] as {p:Record<string,unknown>;defaults?:Record<string,unknown>;token?:string}[],
 byToken:null as null|Record<string,Record<string,unknown>>,loading:false,error:null as string|null}))
vi.mock('@/hooks/usePlanningNotes',async()=>{const {useState,useCallback}=await import('react');return{usePlanningNotes:(_h:string,token:string)=>{
 const read=()=>notesStore.byToken?(notesStore.byToken[token]??{}):notesStore.notes
 const [state,setState]=useState({token,notes:read()})
 if(state.token!==token)setState({token,notes:read()})
 const patch=useCallback(async(p:Record<string,unknown>,defaults?:Record<string,unknown>)=>{
  notesStore.patches.push({p,defaults,token})
  if(notesStore.byToken){notesStore.byToken[token]={...defaults,...notesStore.byToken[token],...p};setState({token,notes:notesStore.byToken[token]})}
  else{notesStore.notes={...defaults,...notesStore.notes,...p};setState({token,notes:notesStore.notes})}
  return true},[token])
 return{notes:state.notes,loading:notesStore.loading,error:notesStore.error,patch,reload:()=>undefined}}}})
/** Open the guided session on this step (where it was left). */
const atStep=(current:string)=>{notesStore.notes={guide:{current,done:[],skipped:[]}}}
const place=vi.hoisted(()=>({setPlace:vi.fn()}))
vi.mock('@/hooks/usePlace',async(importOriginal)=>({...await importOriginal<any>(),usePlace:()=>({place:'cabin',setPlace:place.setPlace})}))
// The calendar's events (the month's fold and the session's steps read the same).
const cal=vi.hoisted(()=>({events:[] as any[]}))
vi.mock('@/hooks/useDayLoadEvents',()=>({useDayLoadEvents:()=>({events:cal.events,available:true,loading:false,failed:false,range:{start:0,end:Number.MAX_SAFE_INTEGER}})}))
vi.mock('@/hooks/useSeasonEvents',()=>({useSeasonEvents:()=>({events:cal.events,available:true,loading:false,failed:false,range:{start:0,end:Number.MAX_SAFE_INTEGER}})}))

// Year, Season and Month, one page shape (2026-10-13): the period's goals as
// one plain list, written in its own words (paper-style, 2026-11-04), with the
// level above folded beside it for reading.

const GOALS=[{id:'g',name:'Together',year:2026,status:'active',context:'personal'},{id:'other',name:'Health',year:2026,status:'active',context:'personal'}]
function Where(){const l=useLocation();return <output data-testid="where">{l.pathname+l.search}</output>}
// The shell's side, standing in: a running session's step header, shown as
// the shell shows it above the conversation.
const shell={reg:null as ReturnType<typeof useGuidedSession>}
function Shell(){const reg=useGuidedSession();shell.reg=reg;return reg?<div data-testid="guide-panel">{reg.header}</div>:null}
const guidePanel=()=>within(screen.getByTestId('guide-panel'))
function open(url='/year?view=constellation&start=2026-10-09'){
 render(<GuidedSessionProvider><MemoryRouter initialEntries={[url]}><Routes>
  {['/year','/season','/month'].map(p=><Route key={p} path={p} element={<><ConstellationPage/><Where/></>}/>)}
  <Route path="/week" element={<><p>Week page</p><Where/></>}/>
  <Route path="/getting-started" element={<Where/>}/>
 </Routes></MemoryRouter><Shell/></GuidedSessionProvider>)
}
const season=(extra='')=>open('/season?view=constellation&horizon=1&start=2026-10-09'+extra)
const month=(extra='')=>open('/month?view=constellation&horizon=2&start=2026-10-09'+extra)
const list=(name:string)=>screen.getByRole('list',{name})
const titles=(name:string)=>within(list(name)).getAllByRole('listitem').map(li=>li.querySelector('.plan-item-title')?.textContent)
const row=(title:string)=>screen.getByText(title,{selector:'.plan-item-title'}).closest('li')!
const lastRun=()=>activity.calls[activity.calls.length-1]
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
// Planning as tooltips (2026-11-04): the plan chip in the header, the
// session's one tooltip, the step it is on, and the summary line.
const chip=()=>head().querySelector('.plan-chip')?.textContent??null
const coach=()=>within(screen.getByRole('dialog',{name:'Planning guide'}))
const stepNow=()=>document.querySelector('.coach-t')?.textContent
const next=async(n=1)=>{for(let i=0;i<n;i++)await act(async()=>{fireEvent.click(coach().getByRole('button',{name:'Next'}))})}
const stop=()=>fireEvent.click(screen.getByRole('button',{name:'Stop planning'}))
const summary=()=>document.querySelector('.guide-summary-line')?.textContent??null
/** The sheet above, as a reader meets it: open (data-open) and its face. */
const aboveOpen=()=>document.querySelector('.paper-fold')?.getAttribute('data-open')==='true'
const calendarOpen=()=>document.querySelector('.paper-fold')?.getAttribute('data-calendar-open')==='true'
const REVIEWED={wentWell:'',didnt:'',at:new Date(2026,9,2),authorId:'u1'}
// The folds land at once (reduced motion), so a step's drive shows in the
// same tick; the page is a desk, not a phone.
const setupMatchMedia=window.matchMedia
beforeEach(()=>{
 window.matchMedia=((query:string)=>({matches:query.includes('prefers-reduced-motion'),media:query,onchange:null,addListener:()=>{},removeListener:()=>{},addEventListener:()=>{},removeEventListener:()=>{},dispatchEvent:()=>false})) as unknown as typeof window.matchMedia
})
afterEach(()=>{window.matchMedia=setupMatchMedia})
beforeEach(()=>{
 vi.clearAllMocks();cal.events=[];routines.forDate=()=>[];filters.sole='personal';addArea.real=false;notesStore.notes={};notesStore.patches=[];notesStore.byToken=null;notesStore.loading=false;notesStore.error=null;shell.reg=null;review.seen=[];review.prevReviewed=null;plan.n=0;plan.seen=[];plan.next=null;plan.nextLoading=false;filters.on=false;api.tasks=[];lifeAreas.list=[];api.goals=GOALS.map(g=>({...g}));activity.calls=[];activity.proposals=[];activity.changeSet=null
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
 // Scott, 2026-11-07: this period's sheet is named like the sheets beside it.
 it('names its own sheet, as the sheets folded beside it are named',()=>{
  month()
  const sheet=document.querySelector('.plan-sheet.vt-sheet-month') as HTMLElement
  expect(within(sheet).getByRole('heading',{level:2,name:'October goals'})).toBeInTheDocument()
  // On the desk the sheet carries the heading (2026-11-11): "1–31",
  // "‹ Last month ›", "October, 2026", then its list's name.
  expect(within(sheet).getByRole('heading',{level:1})).toHaveTextContent('October 2026')
  expect(sheet.querySelector('.plan-numeral')).toHaveTextContent('1–31')
  expect(document.querySelector('.vt-sheet-season .above-sheet-title')).toHaveTextContent('Fall goals')
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

// Paper-style horizons (Scott, 2026-11-04): each list stands on its own,
// written in its own words. The level above lies folded at the left edge, for
// reading only. Nothing on these pages says what an item is for or what is
// under it, and rows carry no verbs.
const NOV='/month?view=constellation&horizon=2&start=2026-11-09'
/** The sheet above (folded, so out of the accessibility tree: read from the DOM). */
const sheetAbove=()=>document.querySelector<HTMLElement>('.paper-fold-front')!
const aboveTitles=()=>Array.from(sheetAbove().querySelectorAll('.above-sheet-list li')).map(li=>li.textContent)
/** The ruled line at the end of the list, and Return on it. */
const writeOn=async(name:string,text:string)=>{
 const line=screen.getByRole('textbox',{name})
 fireEvent.change(line,{target:{value:text}})
 await act(async()=>{fireEvent.submit(line.closest('form')!)})
 return line
}
// A row's one verb is its bin (Scott, 2026-11-08); nothing else moves it.
const ROW_VERB=/^(This week|Done|Later|Let go|Off |Back to|Someday|November|October|Fall|Next )/
const verbsOf=(li:HTMLElement)=>within(li).getAllByRole('button').filter(b=>!b.classList.contains('row-delete')).map(b=>b.textContent)

// Task 5c (Scott, 2026-11-04: "yes, add the calendar fold on the right"):
// this period's calendar lies folded at the sheet's right edge, for reading.
// Events are added the usual way, never from the sheet.
const calSheet=()=>document.querySelector<HTMLElement>('.paper-fold-slot--calendar .paper-fold-front')!
const CAL_FOOT='For reading. Add events the usual way.'
describe('this period’s calendar, folded on the right',()=>{
 it('Month: “November calendar”; unfolding it shows the month’s events, five weeks from its first',async()=>{
  cal.events=[{id:'e1',title:'Thanksgiving',start_time:'2026-11-26',end_time:'2026-11-27',all_day:true},
   {id:'e2',title:'Dentist',start_time:'2026-11-10T15:00:00',end_time:'2026-11-10T16:00:00',all_day:false},
   {id:'e3',title:'Halloween',start_time:'2026-10-31',end_time:'2026-11-01',all_day:true},
   {id:'e4',title:'Race',start_time:'2026-11-07T08:00:00',end_time:'2026-11-07T09:00:00',all_day:false}]
  open(NOV)
  expect(calSheet()).toHaveAttribute('inert')
  fireEvent.keyDown(screen.getByRole('button',{name:'November calendar. Unfold to read'}),{key:'Enter'})
  const sheet=await screen.findByRole('region',{name:'November calendar, for reading'})
  expect(within(sheet).getByRole('heading',{name:'November'})).toBeInTheDocument()
  const weeks=within(within(sheet).getByRole('list',{name:'The next weeks'})).getAllByRole('listitem',{name:/^Week of/})
  expect(weeks).toHaveLength(5)
  // From the month's own first day (Scott, 2026-11-05: October leaked in).
  expect(weeks[0]).toHaveAccessibleName('Week of Nov 1')
  expect(within(sheet).queryByText('Halloween')).toBeNull()
  expect(within(sheet).getAllByText('Thanksgiving').length).toBeGreaterThan(0)
  // What claims a day's time: a weekend race, not a weekday appointment,
  // which is a dot on the grid only.
  expect(within(sheet).getAllByText('Race').length).toBeGreaterThan(0)
  expect(within(sheet).queryByText('Dentist')).toBeNull()
  expect(sheet.querySelector('td[data-day="2026-11-10"] .cal-sheet-dots')).not.toBeNull()
  expect(within(sheet).getAllByRole('columnheader').map((h) => h.textContent)).toHaveLength(7)
  expect(within(sheet).getAllByRole('columnheader').every((h) => (h.textContent ?? '').length === 2)).toBe(true)
  // The month at a glance: a grid, its days with events marked.
  expect(within(sheet).getByRole('table',{name:'November 2026'})).toBeInTheDocument()
  expect(sheet.querySelector('td[data-day="2026-11-26"] .cal-sheet-dots')).not.toBeNull()
  expect(sheet).toHaveTextContent(CAL_FOOT)
  expect(sheet.querySelectorAll('button,a,input,textarea,[draggable="true"]')).toHaveLength(0)
  expect(localStorage.getItem('symphony-fold:month:calendar')).toBe('open')
 })
 // Final review (2026-11-04): a fixed five weeks lost the end of six-row months.
 it('Month: a six-row month lists all six weeks (August 2026)',async()=>{
  open('/month?view=constellation&horizon=2&start=2026-08-04')
  fireEvent.keyDown(screen.getByRole('button',{name:'August calendar. Unfold to read'}),{key:'Enter'})
  const sheet=await screen.findByRole('region',{name:'August calendar, for reading'})
  const weeks=within(within(sheet).getByRole('list',{name:'The next weeks'})).getAllByRole('listitem',{name:/^Week of/})
  expect(weeks).toHaveLength(6)
  expect(weeks[5]).toHaveAccessibleName('Week of Aug 30')
  expect(within(sheet).getByRole('table',{name:'August 2026'}).querySelectorAll('tbody tr')).toHaveLength(6)
 })
 // Final review (2026-11-04): folded and never opened, the calendar is not
 // mounted, so it reads nothing; opened once, it stays.
 it('the calendar mounts on its first opening and stays mounted when folded again',()=>{
  open(NOV)
  expect(calSheet().querySelector('table')).toBeNull()
  const edge=screen.getByRole('button',{name:'November calendar. Unfold to read'})
  fireEvent.keyDown(edge,{key:'Enter'})
  expect(calSheet().querySelector('table')).not.toBeNull()
  fireEvent.keyDown(screen.getByRole('button',{name:'Fold November calendar away'}),{key:'Enter'})
  expect(calSheet()).toHaveAttribute('inert')
  expect(calSheet().querySelector('table')).not.toBeNull()
 })
 it('Season: “Fall calendar”, its fixed dates by month',()=>{
  season()
  // Folded and never opened, it is not drawn (nothing read).
  expect(calSheet().querySelector('ul[aria-label="The season’s fixed dates"]')).toBeNull()
  fireEvent.keyDown(screen.getByRole('button',{name:'Fall calendar. Unfold to read'}),{key:'Enter'})
  expect(calSheet().querySelector('ul[aria-label="The season’s fixed dates"]')).not.toBeNull()
  expect(calSheet()).toHaveTextContent(CAL_FOOT)
  expect(calSheet().querySelectorAll('button,a,input,textarea')).toHaveLength(0)
 })
 it('Year: “2026 calendar”: the months gone by in one row, then each month’s dates, four at most',()=>{
  at(new Date(2026,10,4,9)); onTestFinished(()=>{vi.useRealTimers()})
  const nov=(d:number,title:string)=>({id:`n${d}`,title,start_time:`2026-11-${String(d).padStart(2,'0')}`,end_time:`2026-11-${String(d+1).padStart(2,'0')}`,all_day:true})
  cal.events=[nov(6,'No school'),nov(11,'Veterans Day'),nov(14,'Recital'),nov(20,'Fair'),nov(26,'Thanksgiving'),nov(28,'Ella and Kaleb turn 9'),
   {id:'d1',title:'Winter break',start_time:'2026-12-21',end_time:'2026-12-22',all_day:true}]
  open()
  fireEvent.keyDown(screen.getByRole('button',{name:'2026 calendar. Unfold to read'}),{key:'Enter'})
  const months=calSheet().querySelector('ul[aria-label="2026, month by month"]')!
  expect(Array.from(months.children).map((li)=>li.getAttribute('aria-label'))).toEqual(['Jan – Oct · Past','November','December'])
  expect(months.children[0]).toHaveTextContent(/^Jan – Oct\s*Past$/)
  const novRow=months.querySelector('li[aria-label="November"]')!
  expect(novRow).toHaveAttribute('data-now')
  expect(Array.from(novRow.querySelectorAll('.gw-days > li:not(.gw-more)')).map((li)=>li.lastElementChild?.lastElementChild?.textContent))
   .toEqual(['No school','Veterans Day','Recital','Fair'])
  expect(novRow).toHaveTextContent('and 2 more')
  expect(novRow).not.toHaveTextContent('Thanksgiving')
  expect(months.querySelector('li[aria-label="December"]')).toHaveTextContent('Winter break')
  // No landscape written: no landscape on the sheet.
  expect(calSheet().querySelector('section[aria-label="Landscape"]')).toBeNull()
  expect(calSheet()).toHaveTextContent(CAL_FOOT)
  expect(calSheet().querySelectorAll('button,a,input,textarea')).toHaveLength(0)
 })
 it('Year: the landscape, read-only, above the calendar when the year has one',()=>{
  at(new Date(2026,10,4,9)); onTestFinished(()=>{vi.useRealTimers()})
  notesStore.notes={landscape:[{month:11,text:'Thanksgiving at the lake'},{month:12,text:'Winter vacation'}]}
  open()
  fireEvent.keyDown(screen.getByRole('button',{name:'2026 calendar. Unfold to read'}),{key:'Enter'})
  const land=calSheet().querySelector('section[aria-label="Landscape"]')!
  expect(land).not.toBeNull()
  expect(land).toHaveTextContent('Thanksgiving at the lake')
  expect(land.querySelector('a')).toBeNull()
  // The landscape first, the dates under it.
  expect(land.compareDocumentPosition(calSheet().querySelector('ul[aria-label="2026, month by month"]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(calSheet().querySelectorAll('button,a,input,textarea')).toHaveLength(0)
 })
 it('C unfolds it',()=>{
  open(NOV)
  fireEvent.keyDown(document,{key:'c'})
  return waitFor(()=>expect(document.querySelector('.paper-fold')).toHaveAttribute('data-calendar-open','true'))
 })
})

describe('a sheet: the period in its own words, the level above folded beside it',()=>{
 it('Month: Fall folded at the edge, the list on its own with no ties, no verbs, no pieces, and a line to write on',()=>{
  api.tasks=[{id:'s',title:'Plan winter vacation',bucket:'quarter'},{id:'m',title:'Pick dates',bucket:'month',sourceId:'s'}]
  open(NOV)
  expect(screen.getByRole('button',{name:'Fall 2026, 1 open. Unfold to read'})).toBeInTheDocument()
  expect(titles('November goals')).toEqual(['Pick dates'])
  expect(document.querySelector('.plan-item-parent')).toBeNull()
  expect(document.querySelector('.plan-tag-below')).toBeNull()
  expect(within(row('Pick dates')).queryAllByRole('button',{name:ROW_VERB})).toHaveLength(0)
  expect(verbsOf(row('Pick dates'))).toEqual(['Pick dates'])
  expect(screen.queryByText('+ Piece')).toBeNull()
  expect(screen.getByPlaceholderText('Write a November goal')).toBeInTheDocument()
  // The sheet above: Fall's open lines, for reading.
  expect(aboveTitles()).toEqual(['Plan winter vacation'])
  expect(sheetAbove()).toHaveTextContent('For reading. Write November in its own words.')
  expect(sheetAbove().querySelectorAll('button,a,input,[draggable="true"]')).toHaveLength(0)
 })
 it('Return on the line writes a plain November item: no parent, no sourceId, no goalTaskId',async()=>{
  api.tasks=[{id:'s',title:'Plan winter vacation',bucket:'quarter',goalId:'g'},{id:'m',title:'Pick dates',bucket:'month',sourceId:'s'}]
  open(NOV)
  const line=await writeOn('Write a November goal','Book trains')
  expect(api.addTask).toHaveBeenCalledTimes(1)
  const [title,,,,o]=api.addTask.mock.calls[0]
  expect(title).toBe('Book trains')
  expect(o).toMatchObject({bucket:'month',monthStart:new Date(2026,10,1),context:'personal'})
  expect(o.sourceId).toBeUndefined()
  expect(o.goalTaskId).toBeUndefined()
  expect(o.goalId).toBeUndefined()
  expect(lastRun().label).toBe('Add “Book trains”')
  await waitFor(()=>expect(line).toHaveValue(''))
  // Nothing written for an empty line.
  await writeOn('Write a November goal','   ')
  expect(api.addTask).toHaveBeenCalledTimes(1)
 })
 it('Season: the year folded beside it; a line written there carries no year goal',async()=>{
  api.tasks=[{id:'s',title:'Autumn outings',bucket:'quarter',goalId:'g'}]
  season()
  expect(screen.getByRole('button',{name:'2026, 2 open. Unfold to read'})).toBeInTheDocument()
  expect(aboveTitles()).toEqual(['Together','Health'])
  expect(sheetAbove()).toHaveTextContent('For reading. Write Fall in its own words.')
  await writeOn('Write a Fall goal','Walk daily')
  expect(api.addTask).toHaveBeenCalledWith('Walk daily',undefined,undefined,undefined,expect.objectContaining({bucket:'quarter',context:'personal',seasonStart:new Date(2026,8,1)}))
  expect(api.addTask.mock.calls[0][4].goalId).toBeUndefined()
 })
 it('Year: last year’s open goals folded beside it; with none open the sheet says so, with no list',()=>{
  open()
  expect(screen.getByRole('button',{name:'2025, 0 open. Unfold to read'})).toBeInTheDocument()
  expect(sheetAbove()).toHaveTextContent('Nothing left open from 2025.')
  expect(sheetAbove().querySelector('ul')).toBeNull()
  expect(sheetAbove()).toHaveTextContent('For reading. Write 2026 in its own words.')
  cleanup()
  api.goals=[...GOALS.map(g=>({...g})),{id:'old',name:'Learn to sail',year:2025,status:'active',context:'personal'},{id:'met',name:'Run a 10k',year:2025,status:'completed',context:'personal'}]
  open()
  expect(screen.getByRole('button',{name:'2025, 1 open. Unfold to read'})).toBeInTheDocument()
  expect(aboveTitles()).toEqual(['Learn to sail'])
  expect(sheetAbove()).toHaveTextContent('1 done')
  expect(sheetAbove().querySelectorAll('button')).toHaveLength(0)
 })
 it('Year: a new goal keeps its wording when the save fails',async()=>{
  api.addGoal.mockResolvedValueOnce(null);open()
  const line=await writeOn('Write a 2026 goal','A meaningful year')
  await screen.findByText(/Your wording is still here/)
  expect(line).toHaveValue('A meaningful year')
  await act(async()=>{fireEvent.submit(line.closest('form')!)})
  await waitFor(()=>expect(line).toHaveValue(''))
  expect(api.addGoal).toHaveBeenLastCalledWith(null,'A meaningful year','personal',expect.objectContaining({year:2026,id:expect.any(String)}))
  expect(lastRun().opts.ids).toEqual([api.addGoal.mock.calls[1][3].id])
 })
 it('the line reads a date in the words and lands it on that day, saying so before Return',async()=>{
  at(new Date(2026,9,20,9)); onTestFinished(()=>{vi.useRealTimers()})
  month()
  const line=screen.getByRole('textbox',{name:'Write an October goal'})
  fireEvent.change(line,{target:{value:'Book trains'}})
  expect(line.closest('form')).toHaveTextContent('Goes on October')
  fireEvent.change(line,{target:{value:'Dentist Oct 23 at 9am'}})
  expect(line.closest('form')).toHaveTextContent('Goes on Fri, Oct 23')
  await act(async()=>{fireEvent.submit(line.closest('form')!)})
  expect(api.addTask).toHaveBeenCalledTimes(1)
  const [title,,,at9,o]=api.addTask.mock.calls[0]
  expect(title).toBe('Dentist')
  expect(at9).toEqual(new Date(2026,9,23,9))
  expect(o).toMatchObject({isAllDay:false,context:'personal'})
  // A dated task, not an October item, and tied to nothing.
  expect(o.bucket).toBeUndefined()
  expect(o.monthStart).toBeUndefined()
  expect(o.sourceId).toBeUndefined()
  expect(o.goalId).toBeUndefined()
  expect(lastRun().label).toBe('Add “Dentist” to Fri, Oct 23')
  await waitFor(()=>expect(line).toHaveValue(''))
 })
 it('the line writes in the space chosen at its end, remembered on this device',async()=>{
  filters.sole=null;addArea.real=true
  localStorage.setItem('symphony-plan-v2.add-area','work')
  month()
  const form=screen.getByRole('textbox',{name:'Write an October goal'}).closest('form')!
  // The space is named on the line (Scott, 2026-11-05), not an unlabeled tag.
  expect(within(form).getByRole('button',{name:'Space: Work. Change'})).toHaveTextContent('Work')
  await writeOn('Write an October goal','Quarterly numbers')
  expect(api.addTask).toHaveBeenCalledWith('Quarterly numbers',undefined,undefined,undefined,expect.objectContaining({bucket:'month',context:'work'}))
 })
 it('rows say nothing about what is above or below them, on Month, Season and Year',()=>{
  at(new Date(2026,9,20,9)); onTestFinished(()=>{vi.useRealTimers()})
  api.tasks=[{id:'s',title:'Autumn outings',bucket:'quarter',goalId:'g'},{id:'m',title:'Picnic',bucket:'month',sourceId:'s',
   subtasks:[{id:'st',title:'Inventory everything',parentTaskId:'m',bucket:'week'}]},{id:'w',title:'Book the shelter',bucket:'week',sourceId:'m'}]
  month()
  expect(row('Picnic')).not.toHaveTextContent(/For |This week|Week of/)
  expect(verbsOf(row('Picnic'))).toEqual(['Picnic'])
  cleanup();season()
  expect(row('Autumn outings')).not.toHaveTextContent(/For |October/)
  expect(verbsOf(row('Autumn outings'))).toEqual(['Autumn outings'])
  cleanup();open()
  // No "Fall" tag on a year goal with Fall goals under it, and no verbs.
  expect(row('Together')).not.toHaveTextContent(/Fall/)
  expect(verbsOf(row('Together'))).toEqual(['Together'])
  expect(document.querySelector('.plan-item-quick')).toBeNull()
 })
 it('Month: no + Piece; a goal’s steps stay in its panel',()=>{
  api.tasks=[{id:'m',title:'Find K therapist',bucket:'month',subtasks:[{id:'p1',title:'Fill out KK assessment',parentTaskId:'m',bucket:'month'}]}]
  month()
  expect(screen.queryByText('+ Piece')).toBeNull()
  expect(screen.queryByRole('list',{name:'Pieces of Find K therapist'})).toBeNull()
  expect(screen.queryByText('Fill out KK assessment')).toBeNull()
 })
 it('Season with 30 lines shows all 30, with nothing to open',()=>{
  api.tasks=Array.from({length:30},(_,i)=>({id:`s${i+1}`,title:`Fall goal ${i+1}`,bucket:'quarter'}))
  season()
  expect(titles('Fall goals')).toHaveLength(30)
  expect(screen.queryByRole('button',{name:/^\+\d+ more$|^Show less$/})).toBeNull()
 })
 // Review focus #3: a long sheet above scrolls inside itself, not the page.
 it('a 30-line Fall beside November lies in the sheet’s own scroll box',()=>{
  api.tasks=Array.from({length:30},(_,i)=>({id:`s${i+1}`,title:`Fall goal ${i+1}`,bucket:'quarter'}))
  open(NOV)
  expect(screen.getByRole('button',{name:'Fall 2026, 30 open. Unfold to read'})).toBeInTheDocument()
  const scroll=document.querySelector('.paper-fold-scroll')!
  expect(scroll.querySelectorAll('.above-sheet-list li')).toHaveLength(30)
  expect(scroll.closest('.paper-fold-flap')).not.toBeNull()
  expect(scroll.closest('.paper-fold-current')).toBeNull()
 })
 it('an empty period says so plainly',()=>{
  month()
  expect(screen.getByText('Nothing for October yet.')).toBeInTheDocument()
  expect(screen.queryByRole('link',{name:/^Go to/})).toBeNull()
 })
})

// Routines are dated commitments (spec 2026-11-04): Month's and Year's
// routines sit on the calendar sheet with their dates, and the strip that
// held them is gone, so the spread centers on the page.
const routine=(id:string,name:string,type:string,on:(d:Date)=>boolean)=>({id,name,on,recurrence_pattern:{type},context:'personal'})
const giveRoutines=(...rs:ReturnType<typeof routine>[])=>{routines.forDate=(d:Date)=>rs.filter(r=>r.on(d))}
const readText=(li:HTMLElement)=>{const c=li.cloneNode(true) as HTMLElement;c.querySelectorAll('[aria-hidden="true"]').forEach(n=>n.remove());return c.textContent}
const ymd=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
describe('routines on the calendar sheet; no strip',()=>{
 it('Month, Season and Year: no strip beside the spread',()=>{
  for(const go of [()=>month(),()=>open(),()=>season()]){
   go()
   expect(screen.queryByRole('complementary')).toBeNull()
   expect(document.querySelector('.hs-layout, .hs-rail, .plan-with-strip')).toBeNull()
   cleanup()
  }
 })
 it('Month: the November calendar lists “Routines this month” with each date',async()=>{
  giveRoutines(
   routine('w','Wash comforters','monthly',d=>['2026-11-07','2026-11-08','2026-12-05','2026-12-06'].includes(ymd(d))),
   routine('f','Pay FFG','monthly',d=>d.getDate()===10),
   routine('b','Boxing','weekly',d=>d.getDay()===2),
  )
  open(NOV)
  fireEvent.keyDown(screen.getByRole('button',{name:'November calendar. Unfold to read'}),{key:'Enter'})
  const sheet=await screen.findByRole('region',{name:'November calendar, for reading'})
  const rs=within(sheet).getByRole('region',{name:'Routines this month'})
  expect(within(rs).getAllByRole('listitem').map(readText)).toEqual(['Wash comforters · Sat Nov 7 · Sun Nov 8','Pay FFG · Tue Nov 10'])
  // Weekly routines are the Week's.
  expect(rs).not.toHaveTextContent('Boxing')
  expect(sheet.querySelectorAll('button,a,input,textarea')).toHaveLength(0)
 })
 it('Year: “Routines this year”, its yearly routines with their dates',()=>{
  giveRoutines(routine('tx','File taxes','yearly',d=>ymd(d)==='2026-04-15'),routine('f','Pay FFG','monthly',d=>d.getDate()===10))
  open()
  fireEvent.keyDown(screen.getByRole('button',{name:'2026 calendar. Unfold to read'}),{key:'Enter'})
  const rs=within(calSheet()).getByRole('region',{name:'Routines this year'})
  expect(within(rs).getAllByRole('listitem').map(readText)).toEqual(['File taxes · Apr 15'])
 })
 it('Season: “Routines this season” only when the season has its own',()=>{
  season()
  fireEvent.keyDown(screen.getByRole('button',{name:'Fall calendar. Unfold to read'}),{key:'Enter'})
  expect(within(calSheet()).queryByRole('region',{name:/^Routines this/})).toBeNull()
  cleanup();localStorage.removeItem('symphony-fold:season:calendar')
  giveRoutines(routine('q','Change the furnace filter','quarterly',d=>ymd(d)==='2026-10-01'))
  season()
  fireEvent.keyDown(screen.getByRole('button',{name:'Fall calendar. Unfold to read'}),{key:'Enter'})
  expect(within(within(calSheet()).getByRole('region',{name:'Routines this season'})).getAllByRole('listitem').map(readText))
   .toEqual(['Change the furnace filter · Oct 1'])
 })
})

describe('proposals',()=>{
 it('shows suggestions in the list, keeps them as plain items of the period, and leaves out without writing',async()=>{
  activity.proposals=[{key:'p1',title:'Visit Mom',level:1,parentId:'g',state:'proposed',reason:'You mentioned it'},{key:'p2',title:'Garden',level:1,state:'proposed'},{key:'p3',title:'Not now',level:2,state:'proposed'}]
  season()
  const visit=within(list('Fall goals')).getByText('Visit Mom').closest('li')!
  expect(visit.querySelector('.canvas-item')).toHaveClass('is-proposed')
  // No "For …" line on the page, even where the guide named one.
  expect(visit).not.toHaveTextContent('For Together')
  expect(within(list('Fall goals')).getByText('Garden')).toBeInTheDocument()
  expect(screen.queryByText('Not now')).not.toBeInTheDocument()
  expect(screen.getByRole('button',{name:'Keep all'})).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'Keep Visit Mom'}))
  await waitFor(()=>expect(activity.removeProposal).toHaveBeenCalledWith('p1'))
  expect(activity.setProposalState).toHaveBeenCalledWith('p1','saving')
  expect(api.addTask).toHaveBeenCalledWith('Visit Mom',undefined,undefined,undefined,expect.objectContaining({bucket:'quarter',seasonStart:new Date(2026,8,1)}))
  // Kept with no tie to the year goal the guide named.
  expect(api.addTask.mock.calls[0][4].goalId).toBeUndefined()
  expect(api.addTask.mock.calls[0][4].sourceId).toBeUndefined()
  fireEvent.click(screen.getByRole('button',{name:'Leave out Garden'}))
  expect(activity.removeProposal).toHaveBeenCalledWith('p2')
  expect(api.addTask).toHaveBeenCalledTimes(1)
 })
 it('a suggestion that only links an existing item under one above is not shown',()=>{
  api.tasks=[{id:'s1',title:'Yard',bucket:'quarter'},{id:'m',title:'Trim plants',bucket:'month'}]
  activity.proposals=[{key:'k',title:'Trim the plants (model wording)',level:2,parentId:'s1',itemId:'m',state:'proposed'}]
  month()
  expect(titles('October goals')).toEqual(['Trim plants'])
  expect(screen.queryByText('Belongs here?')).toBeNull()
  expect(screen.queryByText('Trim the plants (model wording)')).toBeNull()
  expect(screen.queryByRole('button',{name:/^Link /})).toBeNull()
  expect(screen.queryByRole('button',{name:'Keep all'})).toBeNull()
  expect(api.updateTask).not.toHaveBeenCalled()
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
  const verbs=verbsOf(row('Together'))
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
  api.tasks=[{id:'s',title:'Finished season',bucket:'quarter',completed:true,completedAt:new Date(2026,9,9)},{id:'m',title:'Still open',bucket:'month',sourceId:'s'},
   {id:'d1',title:'Signed up for Built with Science',bucket:'month',completed:true,completedAt:new Date(2026,9,9)},{id:'d2',title:'Talked with Kami',bucket:'month',completed:true,completedAt:new Date(2026,9,9)},{id:'d3',title:'Third done',bucket:'month',completed:true,completedAt:new Date(2026,9,9)}]
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
  api.tasks=[{id:'d',title:'Done milestone',bucket:'month',completed:true,completedAt:new Date(2026,9,9)}]
  month()
  expect(screen.getByText('Nothing open for October yet.')).toBeInTheDocument()
  expect(screen.getByRole('button',{name:/^1 done · Done milestone Show$/})).toBeInTheDocument()
 })
 it('keeps what an item carries on the row; the panel holds the rest',()=>{
  api.tasks=[{id:'s',title:'Back to school',bucket:'quarter',links:[{url:'https://supplies.test'}]},{id:'m',title:'Call Cami',bucket:'month',sourceId:'s',contactId:'cami',subtasks:[{id:'q1',title:'Pickup?'},{id:'q2',title:'Forms?',completed:true,completedAt:new Date(2026,9,9)}]}]
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
   {id:'c',title:'Taxes',bucket:'month'},{id:'d',title:'Done one',bucket:'month',completed:true,completedAt:new Date(2026,9,9)}]
  month()
  // One count on every horizon (reviewed design, 2026-10-20): done out of
  // everything on the period, as Looking back counts it, with its bar.
  expect(facts()).toBe('1 of 4 done')
  expect(screen.getByRole('img',{name:'1 of 4 done'}).querySelector('span')).toHaveStyle({width:'25%'})
  cleanup();plan.saved={at:new Date(2026,9,3),authorId:'u1',notes:{}}
  month()
  // When it was planned is the summary line's (PeriodSummaryLine), not the count's.
  expect(facts()).toBe('1 of 4 done')
  expect(summary()).toBe('Planned Sat, Oct 3')
  // No summary sentence any more.
  expect(document.querySelector('.plan-sentence')).toBeNull()
 })
 it('Season: its dates · {done} of {all} done',()=>{
  api.tasks=[{id:'a',title:'Autumn outings',bucket:'quarter'},{id:'b',title:'Strength',bucket:'quarter'},{id:'c',title:'Fix the gate',bucket:'quarter',completed:true,completedAt:new Date(2026,9,9)}]
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
 // Planning is the plan chip, always there on a period that can be planned;
 // besides it one button at most, only the one that's due (reviewed design,
 // 2026-10-20): a review.
 it('not planned yet: the chip “Plan October”, even with last period unreviewed — its review is the session’s look back; ⋯ holds the review too',()=>{
  at(new Date(2026,9,17,12))
  month()
  expect(chip()).toBe('Plan October')
  expect(primaries()).toEqual([])
  expect(menu()).toContain('Review September')
  expect(menu()).not.toContain('Plan October')
  fireEvent.click(within(head()).getByRole('button',{name:'Plan October'}))
  // Planning October is the guided session on this page.
  expect(screen.getByTestId('where').textContent).toContain('plan=1')
  expect(stepNow()).toBe('Fresh start')
  expect(coach().getByText('Step 1 of 6')).toBeInTheDocument()
  expect(chip()).toBe('Planning October · 1 of 6✕')
 })
 it('the chip while October is unplanned; ⋯ offers next month early',()=>{
  at(new Date(2026,9,17,12));review.prevReviewed=REVIEWED
  month()
  expect(chip()).toBe('Plan October')
  expect(primaries()).toEqual([])
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
 it('planned, under way: no button; planning again is the same chip; next month early waits in ⋯ (Month and Season)',()=>{
  at(new Date(2026,9,17,12));review.prevReviewed=REVIEWED;plan.saved={at:new Date(2026,9,3),authorId:'u1',notes:{}}
  month()
  // October's record, then November's.
  expect(plan.seen.slice(0,2)).toEqual(['monthly:2026-10','monthly:2026-11'])
  expect(primaries()).toEqual([])
  expect(chip()).toBe('Plan October')
  expect(menu().filter(t=>/^(Plan|Review) /.test(t??''))).toEqual(['Plan November early'])
  choose('Plan November early')
  expect(screen.getByTestId('where').textContent).toContain('start=2026-11-01')
  expect(screen.getByTestId('where').textContent).toContain('plan=1')
  // November planned too: nothing more in ⋯.
  cleanup();plan.next={at:new Date(2026,9,10),authorId:'u1',notes:{}}
  month()
  expect(menu().filter(t=>/^(Plan|Review) /.test(t??''))).toEqual([])
  cleanup();plan.saved=null;plan.next=null;plan.seen=[]
  season()
  expect(chip()).toBe('Plan Fall')
  expect(primaries()).toEqual([])
  cleanup();plan.saved={at:new Date(2026,8,3),authorId:'u1',notes:{}}
  season()
  expect(primaries()).toEqual([])
  expect(menu()).toContain('Plan Winter early')
 })
 it('the last days, until reviewed: Review {period}, the walk into planning the next; reviewed, no button',()=>{
  at(new Date(2026,9,29,12));plan.saved={at:new Date(2026,9,3),authorId:'u1',notes:{}}
  month()
  expect(primaries()).toEqual(['Review October'])
  expect(menu().filter(t=>/^(Plan|Review) /.test(t??''))).toEqual(['Plan November'])
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
 it('holds ⋯’s offers while the next period’s plan record loads; the chip is there throughout',()=>{
  at(new Date(2026,9,17,12));review.prevReviewed=REVIEWED
  plan.nextLoading=true
  month()
  expect(chip()).toBe('Plan October')
  expect(menu().filter(t=>/^(Plan|Review) /.test(t??''))).toEqual([])
  cleanup();plan.nextLoading=false
  month()
  expect(menu().filter(t=>/^(Plan|Review) /.test(t??''))).toEqual(['Plan November early'])
 })
 it('Year: the chip plans the year on the page in January and in December alike; no Plan button',()=>{
  at(new Date(2027,0,5,12));review.prevReviewed=REVIEWED
  open('/year?view=constellation')
  expect(plan.seen[0]).toBe('annual:2027')
  expect(chip()).toBe('Plan 2027')
  expect(primaries()).toEqual([])
  cleanup();plan.saved=null
  at(new Date(2026,11,27,9));review.reviewed=REVIEWED;plan.next={at:new Date(2026,11,26),authorId:'u1',notes:{}}
  open('/year?view=constellation')
  expect(chip()).toBe('Plan 2026')
  expect(primaries()).toEqual([])
 })
 it('Year is reference: no button in October; from Dec 25, Review 2026 until reviewed',()=>{
  at(new Date(2026,9,17,12))
  open()
  expect(primaries()).toEqual([])
  expect(chip()).toBe('Plan 2026')
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
  expect(primaries()).toEqual([])
  expect(chip()).toBe('Plan October')
 })
 it('⋯ holds the page’s choices, the way in, and its help',()=>{
  at(new Date(2026,9,17,12));review.prevReviewed=REVIEWED
  api.tasks=[{id:'s',title:'Autumn outings',bucket:'quarter'},{id:'m',title:'Picnic',bucket:'month'},{id:'d',title:'Pay taxes',bucket:'month',completed:true,completedAt:new Date(2026,9,9)}]
  month()
  // No talk is due, so ⋯ offers none: planning is the Plan button's session.
  expect(menu()).toEqual(['Plan November early','Fresh start','Show done','Start with a goal · guided introduction','Paper sounds','How this page works'])
  // Show done: a tick, remembered on this device, and the list agrees.
  const done=screen.getByRole('menuitemcheckbox',{name:'Show done'})
  expect(done).toHaveAttribute('aria-checked','false')
  fireEvent.click(done)
  expect(screen.getByRole('menuitemcheckbox',{name:'Show done'})).toHaveAttribute('aria-checked','true')
  expect(titles('October goals')).toEqual(['Picnic','Pay taxes'])
  expect(localStorage.getItem('symphony-plan-done')).toBe('shown')
  // The done fold says the same.
  expect(screen.getByRole('button',{name:/1 done/})).toHaveAttribute('aria-expanded','true')
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
  // The date the period was planned is in the summary line instead.
  expect(summary()).toBe('Planned Sat, Oct 3')
  expect(menu()).toContain('Back to this month')
 })
 // Scott, 2026-11-05: while planning, the plan chip is the one count: no
 // "1 of 2 done" beside "2 of 6", no "Planned Sat, Oct 3" while planning it.
 it('while planning, the header has no other button or offer, and no fact line or planned line',()=>{
  at(new Date(2026,9,17,12)); onTestFinished(()=>{vi.useRealTimers();plan.saved=null})
  plan.saved={at:new Date(2026,9,3),authorId:'u1',notes:{}}
  api.tasks=[{id:'m',title:'Picnic',bucket:'month'},{id:'d',title:'Pay taxes',bucket:'month',completed:true,completedAt:new Date(2026,9,9)}]
  month('&plan=1')
  expect(primaries()).toEqual([])
  expect(menu().filter(t=>/^(Plan|Review) |guided/.test(t??''))).toEqual([])
  expect(screen.getByRole('dialog',{name:'Planning guide'})).toBeInTheDocument()
  expect(facts()).toBeNull()
  expect(summary()).toBeNull()
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
  // No "For …" line, even where the card names one.
  expect(cabin).not.toHaveTextContent('For Plan winter vacation')
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
 // The "Plan this season with me" walk is gone (spec 2026-11-01): planning
 // is the guided session the Plan button opens.
 it('offers no walk of its own in the docked bar, nor in ⋯ without it',()=>{
  const setWalk=vi.fn()
  render(<ConversationWalkContext.Provider value={setWalk}><MemoryRouter initialEntries={['/season?view=constellation&horizon=1']}><Routes>
   <Route path="/season" element={<ConstellationPage/>}/>
  </Routes></MemoryRouter></ConversationWalkContext.Provider>)
  expect(screen.queryByRole('button',{name:/with me$/})).not.toBeInTheDocument()
  expect(setWalk).not.toHaveBeenCalledWith(expect.objectContaining({label:expect.stringMatching(/with me$/)}))
  expect(setWalk).toHaveBeenLastCalledWith(null)
  expect(screen.getByRole('heading',{level:1})).toHaveTextContent('Fall 2026')
  cleanup()
  open('/season?view=constellation&horizon=1&start=2025-10-01')
  expect(menu()).not.toContain('Talk it through')
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
  expect(inBar('/month?view=constellation&horizon=2&start=2026-12-01')).toHaveBeenLastCalledWith(null)
 })
 it('once November has a list, or the talk is put off, the bar offers nothing',()=>{
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date(2026,9,30,9))
  api.tasks=[{id:'n',title:'Book the cabin',bucket:'month',monthStart:new Date(2026,10,1),createdAt:new Date(2026,9,1)}]
  expect(inBar('/month?view=constellation&horizon=2')).toHaveBeenLastCalledWith(null)
  cleanup();api.tasks=[]
  localStorage.setItem('symphony.planTalk.dismissed',JSON.stringify({later:{},skipped:{'month:2026-11-01':true}}))
  expect(inBar('/month?view=constellation&horizon=2')).toHaveBeenLastCalledWith(null)
 })
 it('while the session runs the talk steps aside: the session has its own conversation',()=>{
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date(2026,9,30,9))
  expect(inBar('/month?view=constellation&horizon=2&start=2026-11-01&plan=1')).toHaveBeenLastCalledWith(null)
 })
 it('Year: from Dec 25, Plan 2027 while 2027 has no goals',()=>{
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date(2026,11,27,9))
  expect(inBar('/year?view=constellation')).toHaveBeenLastCalledWith({label:'Plan 2027',message:'Plan 2027.'})
  cleanup()
  api.goals=[...api.goals,{id:'n',name:'Run a half marathon',year:2027,status:'active',context:'personal'}]
  expect(inBar('/year?view=constellation')).toHaveBeenLastCalledWith(null)
 })
 it('without the bar (phones) Talk it through sends the talk that is due',()=>{
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date(2026,9,30,9))
  open('/month?view=constellation&horizon=2')
  choose('Talk it through')
  expect(launcher.openAssistant).toHaveBeenCalledWith({message:'Plan November.',autoSend:true})
 })
})

// Reviewing is the look back of planning the period after it (spec
// 2026-11-01): Review October opens the session for November, whose look
// back saves October's review and deals what October left open.
describe('reviewing: the session’s look back',()=>{
 it('Review October opens planning November; its look back saves October’s review',async()=>{
  api.tasks=[{id:'a',title:'Book the cabin',bucket:'month'},{id:'b',title:'Pay taxes',bucket:'month',completed:true,completedAt:new Date(2026,9,9)}]
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date(2026,9,30,12))
  try{
   month()
   fireEvent.click(screen.getByRole('button',{name:'Review October'}))
   expect(screen.getByTestId('where').textContent).toContain('plan=1')
   expect(screen.getByTestId('where').textContent).toContain('start=2026-11-01')
   expect(stepNow()).toBe('Look back at October')
   const look=within(screen.getByRole('article',{name:'Looking back at October'}))
   fireEvent.change(look.getByRole('textbox',{name:'What went well'}),{target:{value:'Cabin booked'}})
   // The notes save themselves when the box is left (2026-11-05).
   await act(async()=>{fireEvent.blur(look.getByRole('textbox',{name:'What went well'}))})
   expect(review.finish).toHaveBeenCalledWith({wentWell:'Cabin booked',didnt:''})
  }finally{vi.useRealTimers()}
 })
 it('Review October opens on the look back even when the session was left further on',()=>{
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date(2026,9,30,12))
  try{
   atStep('by-area')
   month()
   fireEvent.click(screen.getByRole('button',{name:'Review October'}))
   expect(stepNow()).toBe('Look back at October')
   expect(screen.getByTestId('where').textContent).not.toContain('step=')
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
   expect(screen.getByRole('region',{name:'Planning October'})).toBeInTheDocument()
   cleanup();review.prevReviewed={wentWell:'',didnt:'',at:new Date(2026,9,2),authorId:'u1'}
   month()
   expect(screen.queryByRole('button',{name:/^Review /})).toBeNull()
   expect(menu()).not.toContain('Review September')
   cleanup()
   open('/month?view=constellation&horizon=2&start=2026-11-09')
   expect(screen.queryByRole('button',{name:/^Review /})).toBeNull()
  }finally{vi.useRealTimers()}
 })
 it('says it was reviewed already, and keeps what they wrote',()=>{
  review.prevReviewed={wentWell:'Cabin booked',didnt:'',at:new Date(2026,9,31),authorId:'u2'}
  review.mine={wentWell:'Cabin booked',didnt:''}
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date(2026,9,30,12))
  try{
   atStep('look-back')
   open('/month?view=constellation&horizon=2&start=2026-11-09&plan=1')
   expect(screen.getByText('Saved Oct 31')).toBeInTheDocument()
   expect(screen.getByRole('textbox',{name:'What went well'})).toHaveValue('Cabin booked')
  }finally{vi.useRealTimers();review.prevReviewed=null;review.mine=null}
 })
 it('Year: reviewing 2026 plans 2027, where an open 2026 goal can be carried in as a copy that remembers it',async()=>{
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date(2026,11,28,12))
  try{
   open('/year?view=constellation&start=2026-10-09&review=1')
   expect(screen.getByTestId('where').textContent).toContain('start=2027-01-01')
   const together=within(screen.getByRole('listitem',{name:'Together'}))
   await act(async()=>{fireEvent.click(together.getByRole('button',{name:'To 2027: Together'}))})
   expect(api.addGoal).toHaveBeenCalledWith(null,'Together','personal',expect.objectContaining({year:2027,carriedFrom:'g'}))
   expect(lastRun().label).toBe('Bring “Together” into 2027')
  }finally{vi.useRealTimers()}
 })
})

describe('a period’s done is what was done in it (2026-11-04)',()=>{
 it('Month: 2 open, 1 done in it, 1 done before it, 1 moved on, 1 let go: 1 of 3 done, and the fold agrees',()=>{
  at(new Date(2026,10,4,12))
  api.tasks=[{id:'o1',title:'Open one',bucket:'month'},{id:'o2',title:'Open two',bucket:'month'},
   {id:'d',title:'Done in Nov',bucket:'month',completed:true,completedAt:new Date(2026,10,3,9)},
   {id:'e',title:'Done in Oct',bucket:'month',completed:true,completedAt:new Date(2026,9,20,9)},
   {id:'m',title:'Moved to Dec',bucket:'month',carried:true,carriedTo:new Date(2026,11,1)},
   {id:'g',title:'Let go',bucket:'month',dismissedAt:new Date(2026,10,2)}]
  try{
   open('/month?view=constellation&horizon=2&start=2026-11-04')
   expect(facts()).toBe('1 of 3 done')
   expect(screen.getByRole('button',{name:/1 done, 1 done earlier, 1 moved on/})).toBeInTheDocument()
   expect(screen.queryByText('Let go')).toBeNull()
  }finally{vi.useRealTimers()}
 })
})

// Visual check on real data (2026-11-04): November read "24 of 36 done" from
// 24 legacy rows (done, bucket 'month', no month_start, no completed_at, no
// commitments). Their time is unknown: on no period's list, fold or count.
describe('an undated legacy completion is on no period (2026-11-04)',()=>{
 const legacy=(id:string,title:string,bucket:string)=>({id,title,bucket,completed:true})
 it('Month: out of the list, the fold and the count; the expanded fold lists done and done earlier',()=>{
  at(new Date(2026,10,4,12))
  api.tasks=[{id:'o1',title:'Open one',bucket:'month'},
   {id:'d',title:'Done in Nov',bucket:'month',completed:true,completedAt:new Date(2026,10,3,9)},
   {id:'e',title:'Done in Oct',bucket:'month',completed:true,completedAt:new Date(2026,9,20,9)},
   legacy('l1','fix the light in the kitchen','month'),legacy('l2','old errand','month')]
  try{
   open('/month?view=constellation&horizon=2&start=2026-11-04')
   expect(facts()).toBe('1 of 2 done')
   const fold=screen.getByRole('button',{name:/^1 done, 1 done earlier · Done in Nov, Done in Oct Show$/})
   fireEvent.click(fold)
   expect(titles('November goals')).toEqual(['Open one','Done in Nov','Done in Oct'])
   expect(row('Done in Oct')).toHaveTextContent('Done')
   expect(screen.queryByText('fix the light in the kitchen')).toBeNull()
   expect(screen.queryByText('old errand')).toBeNull()
  }finally{vi.useRealTimers()}
 })
 it('Season (bucket quarter): out of the list and the count',()=>{
  api.tasks=[{id:'s',title:'Plan winter vacation',bucket:'quarter'},{id:'sd',title:'Booked flights',bucket:'quarter',completed:true,completedAt:new Date(2026,9,9)},
   legacy('l','old season thing','quarter')]
  season()
  expect(facts()).toBe('Sep 1 – Nov 30 · 1 of 2 done')
  fireEvent.click(screen.getByRole('button',{name:/^1 done · Booked flights Show$/}))
  expect(screen.queryByText('old season thing')).toBeNull()
 })
})

describe('a line moved on is not open here (2026-10-17)',()=>{
 it('Month: out of the count and the verbs, folded with the done, named where it went',()=>{
  api.tasks=[{id:'s',title:'Autumn outings',bucket:'quarter',goalId:'g'},{id:'a',title:'Come up with October business plan',bucket:'month',sourceId:'s',carried:true,carriedTo:new Date(2026,10,1)},
   {id:'b',title:'Book the cabin',bucket:'month'},{id:'c',title:'Pay taxes',bucket:'month',completed:true,completedAt:new Date(2026,9,9)}]
  month()
  // Moved on is out of the "of" (2026-11-04): 1 of 2 done.
  expect(facts()).toBe('1 of 2 done')
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

describe('Done planning October (spec 2026-11-01)',()=>{
 it('the session’s Done marks the period planned and offers the next horizon down; the header says when, not asks',async()=>{
  // October still to come, so it is planned, not reviewed (broke on Nov 1).
  at(new Date(2026,9,17,9)); onTestFinished(()=>{vi.useRealTimers()})
  plan.saved=null
  atStep('upkeep-fun')
  month('&plan=1')
  await act(async()=>{fireEvent.click(coach().getByRole('button',{name:'Done planning October'}))})
  // September, not reviewed yet, is recorded reviewed even with nothing typed.
  expect(review.finish).toHaveBeenCalledWith({wentWell:'',didnt:''})
  expect(plan.save).toHaveBeenCalledWith({wentWell:'',didnt:''})
  // The session finished and left; the way on is this week.
  await waitFor(()=>expect(screen.getByTestId('where').textContent).not.toContain('plan=1'))
  expect((notesStore.notes.guide as any).finishedAt).toEqual(expect.any(String))
  expect(screen.getByRole('note')).toHaveTextContent('October is planned.')
  fireEvent.click(screen.getByRole('button',{name:'Plan this week →'}))
  expect(screen.getByText('Week page')).toBeInTheDocument()
  expect(screen.getByTestId('where').textContent).toContain('plan=1')
  cleanup()
  plan.saved={at:new Date(2026,9,3),authorId:'u1',notes:{}}
  try{
   month()
   expect(summary()).toBe('Planned Sat, Oct 3')
   expect(screen.queryByRole('button',{name:/Done planning/})).toBeNull()
  }finally{plan.saved=null}
 })
 // Planning as tooltips (2026-11-04): Done planning stamps the sheet and the
 // header line says when, with the review it closed.
 // Fix round 1 ruling: Done planning folds both companions and remembers
 // them folded; Leave gives back what the reader left.
 it('Done planning folds the sheet above and the calendar, and they stay folded',async()=>{
  at(new Date(2026,9,17,9)); onTestFinished(()=>{vi.useRealTimers()})
  localStorage.setItem('symphony-fold:month','open');localStorage.setItem('symphony-fold:month:calendar','open')
  atStep('upkeep-fun')
  month('&plan=1')
  await act(async()=>{fireEvent.click(coach().getByRole('button',{name:'Done planning October'}))})
  await waitFor(()=>expect(screen.getByTestId('where').textContent).not.toContain('plan=1'))
  expect(localStorage.getItem('symphony-fold:month')).toBe('folded')
  expect(localStorage.getItem('symphony-fold:month:calendar')).toBe('folded')
  expect(aboveOpen()).toBe(false)
  expect(calendarOpen()).toBe(false)
 })
 it('Done planning November stamps the sheet, and the header reads Planned … · Last month’s review',async()=>{
  at(new Date(2026,10,4,9)); onTestFinished(()=>{vi.useRealTimers();review.prevReviewed=null})
  plan.save.mockImplementation(async()=>{plan.saved={at:new Date(2026,10,4,9),authorId:'u1',notes:{}};return true})
  review.finish.mockImplementation(async()=>{review.prevReviewed={wentWell:'',didnt:'',at:new Date(2026,10,4),authorId:'u1'};return true})
  atStep('upkeep-fun')
  open('/month?view=constellation&horizon=2&start=2026-11-04&plan=1')
  expect(coach().getByRole('button',{name:'Done planning November'})).toBeInTheDocument()
  await act(async()=>{fireEvent.click(coach().getByRole('button',{name:'Done planning November'}))})
  await waitFor(()=>expect(screen.getByTestId('where').textContent).not.toContain('plan=1'))
  expect(screen.getByRole('img',{name:'Planned Nov 4'})).toBeInTheDocument()
  expect(summary()).toBe('Planned Wed, Nov 4 · Last month’s review')
  // No tooltip any more; the chip offers planning again.
  expect(screen.queryByRole('dialog',{name:'Planning guide'})).toBeNull()
  expect(chip()).toBe('Plan November')
 })
 it('Done saves look back notes typed and not yet saved; a planned mark that fails keeps the session open',async()=>{
  at(new Date(2026,9,17,9)); onTestFinished(()=>{vi.useRealTimers()})
  atStep('look-back')
  plan.save.mockResolvedValueOnce(false)
  month('&plan=1')
  fireEvent.change(screen.getByRole('textbox',{name:'What went well'}),{target:{value:'Gate fixed'}})
  await next(4)
  await act(async()=>{fireEvent.click(coach().getByRole('button',{name:'Done planning October'}))})
  expect(review.finish).toHaveBeenCalledWith({wentWell:'Gate fixed',didnt:''})
  expect(toast.showToast).toHaveBeenCalledWith('Couldn’t save that — try again.','error',5000)
  expect(screen.getByTestId('where').textContent).toContain('plan=1')
  expect((notesStore.notes.guide as any).finishedAt).toBeUndefined()
 })
 it('Review October, then Done with nothing typed: October is recorded reviewed and no longer offered',async()=>{
  at(new Date(2026,9,30,12)); onTestFinished(()=>{vi.useRealTimers();review.reviewed=null;review.prevReviewed=null})
  review.finish.mockImplementation(async()=>{review.reviewed=REVIEWED;review.prevReviewed=REVIEWED;return true})
  atStep('upkeep-fun')
  month()
  fireEvent.click(screen.getByRole('button',{name:'Review October'}))
  expect(stepNow()).toBe('Look back at October')
  await next(4)
  expect(stepNow()).toBe('Upkeep and fun')
  await act(async()=>{fireEvent.click(coach().getByRole('button',{name:'Done planning November'}))})
  expect(review.finish).toHaveBeenCalledWith({wentWell:'',didnt:''})
  cleanup()
  month()
  expect(primaries()).toEqual([])
  expect(menu()).not.toContain('Review October')
 })
 it('the period before already reviewed and nothing new typed: Done leaves its review as it was',async()=>{
  at(new Date(2026,9,17,9)); onTestFinished(()=>{vi.useRealTimers();review.prevReviewed=null;review.mine=null})
  review.prevReviewed={wentWell:'Gate fixed',didnt:'',at:new Date(2026,9,2),authorId:'u1'};review.mine={wentWell:'Gate fixed',didnt:''}
  atStep('upkeep-fun')
  month('&plan=1')
  await act(async()=>{fireEvent.click(coach().getByRole('button',{name:'Done planning October'}))})
  expect(plan.save).toHaveBeenCalled()
  expect(review.finish).not.toHaveBeenCalled()
 })
 it('a period already over is reviewed, not planned',()=>{
  open('/month?view=constellation&horizon=2&start=2025-03-09')
  expect(screen.getByRole('button',{name:'Review March'})).toBeInTheDocument()
  expect(screen.queryByRole('region',{name:/^Planning /})).toBeNull()
 })
})

describe('planning a month: the guided session (spec 2026-11-01)',()=>{
 const SEP=new Date(2026,8,1),OCT=new Date(2026,9,1)
 it('the chip in the header, “Plan October”, starts the session over the page itself, one tooltip per step; the step is in the conversation',async()=>{
  at(new Date(2026,9,17,12)); onTestFinished(()=>{vi.useRealTimers()})
  api.tasks=[{id:'s',title:'Get outside',bucket:'quarter',goalId:'g'},{id:'a',title:'Hike Bear Mountain',bucket:'month',monthStart:OCT,sourceId:'s'}]
  month()
  // No bookmark on the sheet: the chip is in the header.
  expect(document.querySelector('.ribbon-tab')).toBeNull()
  fireEvent.click(within(head()).getByRole('button',{name:'Plan October'}))
  expect(screen.getByTestId('where').textContent).toContain('plan=1')
  const seen:string[]=[]
  for(let i=0;i<6;i++){seen.push(stepNow()??'');if(i<5)await next()}
  expect(seen).toEqual(['Fresh start','Look back at September','Read Fall',"October's calendar","October's goals",'Upkeep and fun'])
  expect(coach().getByRole('button',{name:'Done planning October'})).toBeInTheDocument()
  expect(chip()).toBe('Planning October · 6 of 6✕')
  // The page's own list, without its strip.
  expect(titles('October goals')).toEqual(['Hike Bear Mountain'])
  expect(screen.queryByRole('region',{name:'Fall strip'})).toBeNull()
  expect(document.querySelector('.hs-layout')).toBeNull()
  expect(guidePanel().getByText('Upkeep and fun')).toBeInTheDocument()
  expect(shell.reg).toMatchObject({level:'month',token:'2026-10',threadKey:'monthly:2026-10'})
  expect(shell.reg?.sessionContext.guide.aboveLines).toEqual([{id:'s',title:'Get outside'}])
 })
 it('Next 4–5 weeks opens the calendar and the tooltip points at it; Stop planning gives the folds back as they were left',async()=>{
  at(new Date(2026,9,17,12)); onTestFinished(()=>{vi.useRealTimers()})
  localStorage.setItem('symphony-fold:month','open')
  month('&plan=1')
  expect(aboveOpen()).toBe(true)
  await next(3)
  expect(stepNow()).toBe("October's calendar")
  expect(screen.getByRole('dialog',{name:'Planning guide'})).toHaveAttribute('data-at','right')
  expect(calendarOpen()).toBe(true)
  expect(screen.getAllByRole('listitem',{name:/^Week of /}).length).toBeGreaterThan(0)
  // Nothing is remembered on the way.
  expect(localStorage.getItem('symphony-fold:month:calendar')).toBeNull()
  stop()
  expect(screen.queryByRole('dialog',{name:'Planning guide'})).toBeNull()
  expect(screen.getByTestId('where').textContent).not.toContain('plan=1')
  expect(calendarOpen()).toBe(false)
  expect(aboveOpen()).toBe(true)
  expect(localStorage.getItem('symphony-fold:month')).toBe('open')
 })
 it('Review October: the look back turns the sheet beside November to October’s leftovers, with their choices; the next step gives it back to Fall',async()=>{
  at(new Date(2026,9,30,12)); onTestFinished(()=>{vi.useRealTimers()})
  const NOV=new Date(2026,10,1)
  api.tasks=[{id:'s',title:'Get outside',bucket:'quarter',goalId:'g'},
   {id:'o1',title:'Hike Bear Mountain',bucket:'month',monthStart:OCT,sourceId:'s'},
   {id:'o2',title:'Pay taxes',bucket:'month',monthStart:OCT,completed:true,completedAt:new Date(2026,9,9)},
   {id:'n1',title:'Book flights',bucket:'month',monthStart:NOV}]
  month()
  fireEvent.click(screen.getByRole('button',{name:'Review October'}))
  expect(stepNow()).toBe('Look back at October')
  // This page stays November's; the sheet beside it is October, looking back.
  expect(titles('November goals')).toEqual(['Book flights'])
  expect(aboveOpen()).toBe(true)
  const october=within(screen.getByRole('region',{name:'October 2026, looking back'}))
  expect(october.getByRole('article',{name:'Looking back at October'})).toBeInTheDocument()
  expect(within(october.getByRole('list',{name:'Open from October'})).getAllByRole('listitem').map((li)=>li.getAttribute('aria-label'))).toEqual(['Hike Bear Mountain'])
  // The only sheet beside you that takes a choice: exactly these four.
  expect(within(october.getByRole('listitem',{name:'Hike Bear Mountain'})).getAllByRole('button').map((b)=>b.textContent)).toEqual(['Done','To November','Someday','Let go'])
  // What each call means is the tooltip's to say, not a foot line; the
  // heading counts what is decided (2026-11-05).
  expect(october.queryByText(/Only here, while planning/)).toBeNull()
  expect(october.getByRole('heading',{name:/Open from October · 0 of 1 decided/})).toBeInTheDocument()
  expect(document.querySelector('.ribbon-card')).toBeNull()
  expect(shell.reg).toMatchObject({level:'month',token:'2026-11',stepId:'look-back'})
  await act(async()=>{fireEvent.click(coach().getByRole('button',{name:'Next'}))})
  expect(screen.queryByRole('region',{name:'October 2026, looking back'})).toBeNull()
  expect(within(screen.getByRole('region',{name:'Fall 2026, for reading'})).getByText('Get outside')).toBeInTheDocument()
  expect(screen.getByRole('region',{name:'Planning November'})).toBeInTheDocument()
  expect(shell.reg).toMatchObject({token:'2026-11',threadKey:'monthly:2026-11'})
 })
 // Planning as tooltips (Task 2): Fresh start lives in the page's ⋯, every day.
 it('Fresh start is in the month’s ⋯ (its anchor): it changes the app’s scenery and keeps it as the month’s',async()=>{
  at(new Date(2026,9,17,12)); onTestFinished(()=>{vi.useRealTimers()})
  month('&plan=1')
  expect(stepNow()).toBe('Fresh start')
  expect(head().querySelector('[data-guide-anchor="menu"]')?.querySelector('button[aria-label="Month options"]')).not.toBeNull()
  expect(coach().getByText('Fresh start')).toBeInTheDocument()
  choose('Fresh start')
  const fresh=within(screen.getByRole('region',{name:'Fresh start'}))
  await act(async()=>{fireEvent.click(fresh.getByRole('button',{name:/Densely Urban/}))})
  expect(place.setPlace).toHaveBeenCalledWith('urban')
  expect(notesStore.patches.some((x)=>x.p.scenery==='urban')).toBe(true)
  fireEvent.click(fresh.getByRole('button',{name:'Close'}))
  expect(screen.queryByRole('region',{name:'Fresh start'})).toBeNull()
  // Every day too, outside a session; only the month has one.
  cleanup();month()
  expect(menu()).toContain('Fresh start')
  cleanup();season()
  expect(menu()).not.toContain('Fresh start')
 })
 it('Look back: September’s open lines — Done, To October, Someday, Let go — each through the page’s writers; nothing goes back to Fall',async()=>{
  at(new Date(2026,9,17,12)); onTestFinished(()=>{vi.useRealTimers()})
  api.tasks=[{id:'old',title:'Fix the gate',bucket:'month',monthStart:SEP},{id:'gone',title:'Pay taxes',bucket:'month',monthStart:SEP,completed:true,completedAt:new Date(2026,9,9)},
   {id:'later',title:'Clear the garage',bucket:'month',monthStart:SEP},{id:'never',title:'Learn the banjo',bucket:'month',monthStart:SEP}]
  api.keepForward.mockResolvedValue('x');api.dropCommitment.mockResolvedValue(true)
  atStep('look-back')
  month('&plan=1')
  const open=within(screen.getByRole('list',{name:'Open from September'}))
  expect(open.queryByText('Pay taxes')).toBeNull()
  expect(within(open.getByRole('listitem',{name:'Fix the gate'})).getAllByRole('button').map((b)=>b.textContent)).toEqual(['Done','To October','Someday','Let go'])
  await act(async()=>{fireEvent.click(open.getByRole('button',{name:'To October: Fix the gate'}))})
  expect(api.keepForward).toHaveBeenCalledWith('old',{monthStart:OCT},SEP)
  expect(lastRun().label).toBe('Move “Fix the gate” to October')
  // Someday: September only; with nothing else holding it, it waits on Someday.
  await act(async()=>{fireEvent.click(open.getByRole('button',{name:'Someday: Clear the garage'}))})
  expect(api.updateTask).toHaveBeenLastCalledWith('later',{bucket:'someday',scheduledFor:undefined})
  expect(lastRun().label).toBe('Someday: “Clear the garage”')
  // Let go: not ever.
  await act(async()=>{fireEvent.click(open.getByRole('button',{name:'Let go: Learn the banjo'}))})
  expect(api.updateTask).toHaveBeenLastCalledWith('never',{bucket:'someday',dismissedAt:expect.any(Date),focus:[]})
  expect(lastRun().label).toBe('Let go: “Learn the banjo”')
  expect(lastRun().opts.undo).toEqual(expect.any(Function))
  expect(api.dropCommitment).not.toHaveBeenCalled()
  expect(screen.queryByRole('button',{name:/^Back to /})).toBeNull()
  // Nothing on the look back marks the month planned.
  expect(notesStore.patches.some((x)=>(x.p.guide as any)?.plannedAt)).toBe(false)
 })
 it('Read the season list opens Fall beside the month, for reading, with nothing to press; no card',()=>{
  at(new Date(2026,9,17,12)); onTestFinished(()=>{vi.useRealTimers()})
  api.tasks=[{id:'s',title:'Get outside',bucket:'quarter',goalId:'g'},{id:'a',title:'Hike Bear Mountain',bucket:'month',monthStart:OCT,sourceId:'s'}]
  atStep('read-season')
  month('&plan=1')
  expect(aboveOpen()).toBe(true)
  const fall=within(screen.getByRole('region',{name:'Fall 2026, for reading'}))
  expect(fall.getByText('Get outside')).toBeInTheDocument()
  expect(fall.queryAllByRole('button')).toHaveLength(0)
  expect(document.querySelector('.ribbon-card')).toBeNull()
 })
 // Fix round 1 (Task 7): by area means by area. The period's life areas are
 // chips beside the write line; a new line is written in the one picked.
 it('The month by area: the life areas as chips beside the line; a line is written in the area picked, in its space',async()=>{
  at(new Date(2026,9,17,12)); onTestFinished(()=>{vi.useRealTimers()})
  lifeAreas.list=[{id:'h',name:'Health',context:'personal',mine:true,sortOrder:0},{id:'m',name:'Home',context:'family',mine:true,sortOrder:1}]
  atStep('by-area')
  month('&plan=1')
  const chips=within(screen.getByRole('radiogroup',{name:'Life area'}))
  expect(chips.getAllByRole('radio').map((r)=>r.textContent)).toEqual(['Health','Home'])
  fireEvent.click(chips.getByRole('radio',{name:'Home'}))
  expect(chips.getByRole('radio',{name:'Home'})).toHaveAttribute('aria-checked','true')
  await writeOn('Write an October goal for Home','Paint the fence')
  expect(api.addTask).toHaveBeenCalledWith('Paint the fence',undefined,undefined,undefined,expect.objectContaining({bucket:'month',monthStart:OCT,areaId:'m',context:'family'}))
  // Not a writing step: no chips.
  cleanup();atStep('upkeep-fun')
  month('&plan=1')
  expect(screen.queryByRole('radiogroup',{name:'Life area'})).toBeNull()
 })
 it('The month by area: a line that did not save marks nothing; a dated line that saved marks October planned',async()=>{
  at(new Date(2026,9,17,12)); onTestFinished(()=>{vi.useRealTimers()})
  atStep('by-area')
  api.addTask.mockResolvedValue(undefined)
  month('&plan=1')
  await writeOn('Write an October goal','Paint the fence')
  expect(api.addTask).toHaveBeenCalled()
  expect(notesStore.patches.filter((x)=>(x.p.guide as any)?.plannedAt)).toHaveLength(0)
  api.addTask.mockResolvedValue('new')
  await writeOn('Write an October goal','Dentist Oct 23')
  expect(api.addTask).toHaveBeenLastCalledWith('Dentist',undefined,undefined,new Date(2026,9,23),expect.objectContaining({isAllDay:true}))
  await waitFor(()=>expect(notesStore.patches.filter((x)=>(x.p.guide as any)?.plannedAt)).toHaveLength(1))
 })
 it('The month by area: Fall open beside the sheet, the pencil on the write line, the guide told the areas; the first line written marks October planned',async()=>{
  at(new Date(2026,9,17,12)); onTestFinished(()=>{vi.useRealTimers()})
  lifeAreas.list=[{id:'h',name:'Health',context:'personal',mine:true,sortOrder:0},{id:'m',name:'Home',context:'family',mine:true,sortOrder:1}]
  api.tasks=[{id:'s1',title:'Get outside',bucket:'quarter',goalId:'g',areaId:'h'}]
  atStep('by-area')
  month('&plan=1')
  expect(shell.reg?.sessionContext.guide.areas).toEqual([{id:'h',name:'Health',context:'personal'},{id:'m',name:'Home',context:'family'}])
  expect(aboveOpen()).toBe(true)
  expect(document.querySelector('.ribbon-card')).toBeNull()
  await waitFor(()=>expect(document.activeElement).toBe(screen.getByRole('textbox',{name:'Write an October goal'})))
  await writeOn('Write an October goal','Paint the fence')
  expect(api.addTask).toHaveBeenCalledWith('Paint the fence',undefined,undefined,undefined,expect.objectContaining({bucket:'month',monthStart:OCT}))
  await waitFor(()=>expect(notesStore.patches.filter((x)=>(x.p.guide as any)?.plannedAt)).toHaveLength(1))
 })
 it('under a space filter the guide is told only the areas in view (a legacy area with no space is Personal)',()=>{
  at(new Date(2026,9,17,12)); onTestFinished(()=>{vi.useRealTimers()})
  filters.on=true;filters.layers=new Set(['family'])
  lifeAreas.list=[{id:'h',name:'Health',context:'personal',mine:true,sortOrder:0},{id:'m',name:'Home',context:'family',mine:true,sortOrder:1},{id:'w',name:'Career',context:'work',mine:true,sortOrder:2},{id:'x',name:'Old area',context:null,mine:true,sortOrder:3}]
  atStep('by-area')
  month('&plan=1')
  expect(shell.reg?.sessionContext.guide.areas).toEqual([{id:'m',name:'Home',context:'family'}])
 })
 // Planning as tooltips (Task 2): Maintenance and fun is the write line,
 // asking for something fun while the step is on.
 it('Maintenance and fun: the write line asks for something fun for October; a line written then is marked fun',async()=>{
  at(new Date(2026,9,17,12)); onTestFinished(()=>{vi.useRealTimers()})
  atStep('upkeep-fun')
  month('&plan=1')
  expect(stepNow()).toBe('Upkeep and fun')
  // It opens the calendar and points at the month's routines there.
  expect(calendarOpen()).toBe(true)
  expect(calSheet().querySelector('[data-guide-anchor="routines"]')).not.toBeNull()
  expect(screen.getByRole('dialog',{name:'Planning guide'})).toHaveAttribute('data-at','routines')
  await writeOn('Something fun for October','Corn maze')
  expect(api.addTask).toHaveBeenCalledWith('Corn maze',undefined,undefined,undefined,expect.objectContaining({bucket:'month',monthStart:OCT,isFun:true}))
  expect(lastRun().label).toBe('Add “Corn maze” for fun')
  // Any other step, and every day, the line is the month's own.
  cleanup();atStep('by-area')
  month('&plan=1')
  expect(screen.queryByRole('textbox',{name:'Something fun for October'})).toBeNull()
  await writeOn('Write an October goal','Paint the fence')
  expect(api.addTask).toHaveBeenLastCalledWith('Paint the fence',undefined,undefined,undefined,expect.not.objectContaining({isFun:true}))
 })
 it('Stop planning writes nothing and keeps where the session is',async()=>{
  at(new Date(2026,9,17,12)); onTestFinished(()=>{vi.useRealTimers()})
  atStep('next-weeks')
  month('&plan=1')
  stop()
  expect(screen.getByTestId('where').textContent).not.toContain('plan=1')
  expect(notesStore.patches).toHaveLength(0)
  expect(plan.save).not.toHaveBeenCalled()
  expect(document.querySelector('.plan-horizon-body')).not.toBeNull()
 })
 it('Year: last year’s open goals can be carried in at the look back',async()=>{
  api.goals=[...GOALS.map(g=>({...g})),{id:'old',name:'Learn to sail',year:2025,status:'active',context:'personal'}]
  atStep('look-back')
  open('/year?view=constellation&start=2026-10-09&plan=1')
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'To 2026: Learn to sail'}))})
  expect(api.addGoal).toHaveBeenCalledWith(null,'Learn to sail','personal',expect.objectContaining({year:2026,carriedFrom:'old'}))
  expect(lastRun().label).toBe('Bring “Learn to sail” into 2026')
  stop()
  expect(screen.getByTestId('where').textContent).not.toContain('plan=1')
 })
 it('a period already over has no Plan, even asked for',()=>{
  open('/month?view=constellation&horizon=2&start=2025-03-09&plan=1')
  expect(screen.queryByRole('button',{name:'Plan March'})).toBeNull()
  expect(screen.queryByRole('region',{name:'Planning March'})).toBeNull()
 })
})

describe('planning a season: the guided session (spec 2026-11-01)',()=>{
 // Fall 2026 (Sep 1 – Nov 30), planned on Oct 17; the season before is Summer.
 // This file's selectPeriodTasks stub keeps a row with a monthStart only on the
 // period starting then: Summer's rows carry SUMMER so they stay off Fall.
 const SUMMER=new Date(2026,5,1),FALL=new Date(2026,8,1)
 const plannedMarks=()=>notesStore.patches.filter((x)=>(x.p.guide as any)?.plannedAt)
 const inSession=()=>{at(new Date(2026,9,17,12)); onTestFinished(()=>{vi.useRealTimers()})}
 it('seven steps, one tooltip each; the look back turns the sheet beside Fall to Summer',()=>{
  inSession()
  season('&plan=1')
  expect(coach().getByText('Step 1 of 7')).toBeInTheDocument()
  expect(stepNow()).toBe('Look back at Summer')
  expect(chip()).toBe('Planning Fall · 1 of 7✕')
  expect(screen.getByRole('region',{name:'Summer 2026, looking back'})).toBeInTheDocument()
  expect(screen.getByRole('list',{name:'Fall goals'})).toBeInTheDocument()
  expect(shell.reg).toMatchObject({level:'season',token:'2026-fall',threadKey:'seasonal:2026-fall'})
 })
 it('the look back shows Summer’s open goals beside Fall; the next step opens the year beside it',async()=>{
  inSession()
  api.tasks=[{id:'a',title:'Swim lessons',bucket:'quarter',monthStart:SUMMER},{id:'f',title:'Rake the leaves',bucket:'quarter',monthStart:FALL}]
  season('&plan=1')
  const summer=within(screen.getByRole('region',{name:'Summer 2026, looking back'}))
  expect(summer.getByRole('listitem',{name:'Swim lessons'})).toBeInTheDocument()
  expect(titles('Fall goals')).toEqual(['Rake the leaves'])
  await act(async()=>{fireEvent.click(coach().getByRole('button',{name:'Next'}))})
  expect(screen.queryByRole('region',{name:'Summer 2026, looking back'})).toBeNull()
  expect(within(screen.getByRole('region',{name:'2026, for reading'})).getByText('Together')).toBeInTheDocument()
  expect(stepNow()).toBe('Read 2026')
  expect(shell.reg).toMatchObject({token:'2026-fall',stepId:'from-year'})
 })
 it('Look back: Summer’s open goals — Done, To Fall, Someday (off Summer only), Let go (not ever) — each through the page’s writers',async()=>{
  inSession()
  api.tasks=[{id:'a',title:'Swim lessons',bucket:'quarter',monthStart:SUMMER},{id:'b',title:'Learn the banjo',bucket:'quarter',monthStart:SUMMER},
   {id:'c',title:'Run a 10k block',bucket:'quarter',monthStart:SUMMER,goalId:'g'},{id:'d',title:'Camp booked',bucket:'quarter',monthStart:SUMMER,completed:true,completedAt:new Date(2026,9,9)}]
  api.keepForward.mockResolvedValue('x');api.dropCommitment.mockResolvedValue(true)
  atStep('look-back')
  season('&plan=1')
  const open=within(screen.getByRole('list',{name:'Open from Summer'}))
  expect(open.queryByText('Camp booked')).toBeNull()
  expect(within(open.getByRole('listitem',{name:'Swim lessons'})).getAllByRole('button').map((b)=>b.textContent)).toEqual(['Done','To Fall','Someday','Let go'])
  await act(async()=>{fireEvent.click(open.getByRole('button',{name:'To Fall: Swim lessons'}))})
  expect(api.keepForward).toHaveBeenCalledWith('a',{seasonStart:FALL},SUMMER)
  await act(async()=>{fireEvent.click(open.getByRole('button',{name:'Someday: Learn the banjo'}))})
  expect(api.updateTask).toHaveBeenLastCalledWith('b',{bucket:'someday',scheduledFor:undefined})
  expect(lastRun().label).toBe('Someday: “Learn the banjo”')
  await act(async()=>{fireEvent.click(open.getByRole('button',{name:'Let go: Run a 10k block'}))})
  expect(api.updateTask).toHaveBeenLastCalledWith('c',{bucket:'someday',dismissedAt:expect.any(Date),focus:[]})
  expect(lastRun().label).toBe('Let go: “Run a 10k block”')
  expect(lastRun().opts.undo).toEqual(expect.any(Function))
  // The year goal it was for stays on the year.
  expect(api.updateGoal).not.toHaveBeenCalled()
  expect(plannedMarks()).toHaveLength(0)
 })
 // Planning as tooltips (Task 2): the year's sheet beside Fall, with a
 // Someday section while the step is on (a session-only choice, as the look back's).
 it('Choose from the year: the year beside Fall to read, its goals with nothing to press; Someday (not what was let go) can be put on Fall; neither marks Fall planned',async()=>{
  inSession()
  api.tasks=[{id:'s',title:'Unhurried weekends',bucket:'quarter',goalId:'g'},{id:'sd',title:'Learn to sail',bucket:'someday'},
   {id:'lg',title:'Buy a boat',bucket:'someday',dismissedAt:new Date(2026,9,1)}]
  api.keepForward.mockResolvedValue('sd')
  atStep('from-year')
  season('&plan=1')
  expect(aboveOpen()).toBe(true)
  const sheet=within(screen.getByRole('region',{name:'2026, for reading'}))
  const year=within(sheet.getByRole('list',{name:'2026 goals'}))
  expect(year.getAllByRole('listitem').map((li)=>li.textContent)).toEqual(['Together','Health'])
  expect(year.queryAllByRole('button')).toHaveLength(0)
  const someday=within(sheet.getByRole('list',{name:'Someday'}))
  expect(someday.getAllByRole('listitem').map((li)=>li.querySelector('.above-sheet-row-title')?.textContent)).toEqual(['Learn to sail'])
  expect(sheet.queryByText('Buy a boat')).toBeNull()
  await act(async()=>{fireEvent.click(someday.getByRole('button',{name:'To Fall: Learn to sail'}))})
  expect(api.keepForward).toHaveBeenCalledWith('sd',{seasonStart:FALL})
  expect(lastRun().label).toBe('Fall: “Learn to sail”')
  expect(api.addTask).not.toHaveBeenCalled()
  expect(plannedMarks()).toHaveLength(0)
  // Only on its step: the year's sheet is for reading otherwise.
  cleanup();atStep('by-area')
  season('&plan=1')
  expect(screen.queryByRole('list',{name:'Someday'})).toBeNull()
 })
 it('Choose from the year reads the year the season is named for, however it was opened (walk 2026-11-02)',()=>{
  at(new Date(2027,0,15,12)); onTestFinished(()=>{vi.useRealTimers()})
  api.goals=[{id:'g26',name:'Calmer mornings',year:2026,status:'active',context:'personal'},{id:'g27',name:'Learn Spanish',year:2027,status:'active',context:'personal'}]
  for(const start of ['2026-12-01','2027-01-15']){
   atStep('from-year')
   open(`/season?view=constellation&horizon=1&start=${start}&plan=1`)
   const year=within(within(screen.getByRole('region',{name:'2026, for reading'})).getByRole('list',{name:'2026 goals'}))
   expect(year.getByText('Calmer mornings')).toBeInTheDocument()
   expect(year.queryByText('Learn Spanish')).toBeNull()
   cleanup()
  }
 })
 it('Season calendar only shows, month by month from today; nothing there writes',()=>{
  inSession()
  atStep('calendar')
  season('&plan=1')
  const months=within(screen.getByRole('list',{name:'The season’s fixed dates'}))
  expect(months.getAllByRole('listitem').map((li)=>li.getAttribute('aria-label'))).toEqual(['October','November'])
  expect(months.queryAllByRole('button')).toHaveLength(0)
 })
 // Task 4 (Scott, 2026-11-04): the season's energy is asked in the Energy
 // step's tooltip, Low · Medium · High; there is no Energy chip. Once said, the
 // header line carries it, and a tap there changes it (Clear keeps the words).
 it('Energy check: the tooltip asks Low · Medium · High and saves the season’s energy with its words; the header line says it and changes it',async()=>{
  inSession()
  notesStore.notes={guide:{current:'energy',done:[],skipped:[]},energy:{level:'medium',words:'New baby'}}
  season('&plan=1')
  expect(head().querySelector('.energy-chip')).toBeNull()
  const group=within(coach().getByRole('radiogroup',{name:'Energy'}))
  expect(group.getAllByRole('radio').map((b)=>b.textContent)).toEqual(['Low','Medium','High'])
  expect(group.getByRole('radio',{name:'Medium'})).toHaveAttribute('aria-checked','true')
  await act(async()=>{fireEvent.click(group.getByRole('radio',{name:'High'}))})
  // The words already said stay with it.
  expect(notesStore.patches.map((x)=>x.p)).toContainEqual({energy:{level:'high',words:'New baby'}})
  expect(group.getByRole('radio',{name:'High'})).toHaveAttribute('aria-checked','true')
  // The header line says it, and its anchor is the Energy step's home.
  expect(summary()).toMatch(/Energy: high$/)
  expect(screen.getByRole('dialog',{name:'Planning guide'}).dataset.at).toBe('energy')
  // Its menu: Clear removes only the level.
  fireEvent.click(within(head()).getByRole('button',{name:'Energy: high'}))
  const menu=within(screen.getByRole('menu',{name:'Energy'}))
  expect([...menu.getAllByRole('menuitemradio'),menu.getByRole('menuitem')].map((b)=>b.textContent)).toEqual(['Low','Medium','High','Clear'])
  await act(async()=>{fireEvent.click(menu.getByRole('menuitem',{name:'Clear'}))})
  expect(notesStore.patches[notesStore.patches.length-1].p).toEqual({energy:{words:'New baby'}})
  expect(summary()??'').not.toMatch(/Energy/)
 })
 it('Energy check, nothing said yet: no energy on the page, and the tooltip points at the title',()=>{
  inSession()
  notesStore.notes={guide:{current:'energy',done:[],skipped:[]}}
  season('&plan=1')
  expect(within(head()).queryByRole('button',{name:/^Energy/})).toBeNull()
  expect(summary()??'').not.toMatch(/Energy/)
  expect(screen.getByRole('dialog',{name:'Planning guide'}).dataset.at).toBe('title')
  expect(coach().getByRole('radiogroup',{name:'Energy'})).toBeInTheDocument()
  // Month and Year never say it.
  cleanup();notesStore.notes={energy:{level:'low'}}
  month()
  expect(summary()??'').not.toMatch(/Energy/)
 })
 it('Season goals by area: the year open beside Fall; the first line written on the sheet marks Fall planned',async()=>{
  inSession()
  atStep('by-area')
  season('&plan=1')
  expect(aboveOpen()).toBe(true)
  expect(within(screen.getByRole('region',{name:'2026, for reading'})).getByText('Health')).toBeInTheDocument()
  await writeOn('Write a Fall goal','Sleep by eleven')
  expect(api.addTask).toHaveBeenCalledWith('Sleep by eleven',undefined,undefined,undefined,expect.objectContaining({bucket:'quarter',seasonStart:FALL}))
  await waitFor(()=>expect(plannedMarks()).toHaveLength(1))
 })
 // Planning as tooltips (Task 2): the ideal week is a section of the Season
 // page; on its step its editor is open.
 it('Ideal week: blocks typed here save into the season’s notes, a goal block naming one of Fall’s open goals',async()=>{
  inSession()
  api.tasks=[{id:'s',title:'Unhurried weekends',bucket:'quarter',goalId:'g'},{id:'d',title:'Paint the porch',bucket:'quarter',completed:true,completedAt:new Date(2026,9,9)}]
  atStep('ideal-week')
  season('&plan=1')
  const iw=within(screen.getByRole('region',{name:'Ideal week'}))
  expect(screen.getByRole('region',{name:'Ideal week'})).toHaveAttribute('data-guide-anchor','ideal-week')
  expect(iw.getByText(/of 168h left/)).toBeInTheDocument()
  expect(within(iw.getByLabelText('Goal for new block')).getAllByRole('option').map((o)=>o.textContent)).toEqual(['Not a goal','Unhurried weekends'])
  fireEvent.change(iw.getByLabelText('Label for new block'),{target:{value:'Long walks'}})
  fireEvent.change(iw.getByLabelText('Hours for new block'),{target:{value:'4h'}})
  fireEvent.change(iw.getByLabelText('Goal for new block'),{target:{value:'s'}})
  await act(async()=>{fireEvent.blur(iw.getByLabelText('Goal for new block'))})
  const saved=notesStore.patches.map((x)=>x.p.idealWeek).filter(Boolean)
  expect(saved).toEqual([{blocks:[expect.objectContaining({label:'Long walks',hours:4,goalId:'s'})]}])
  expect(iw.getByLabelText('Label for Long walks')).toBeInTheDocument()
  // Done reads it back, quietly.
  fireEvent.click(iw.getByRole('button',{name:'Done'}))
  expect(iw.queryByRole('textbox')).toBeNull()
  expect(within(iw.getByRole('list',{name:'Blocks'})).getByText(/Long walks/)).toBeInTheDocument()
 })
 // Planning as tooltips (Task 2): a quiet Wild cards section on the Season
 // page, kept in the season's notes; on its step it is open to change.
 it('Wild cards: the cards turned on are kept in the season’s notes; no lines are written for them',async()=>{
  inSession()
  atStep('wild-cards')
  season('&plan=1')
  const wc=within(screen.getByRole('region',{name:'Wild cards'}))
  expect(screen.getByRole('region',{name:'Wild cards'})).toHaveAttribute('data-guide-anchor','wild-cards')
  await act(async()=>{fireEvent.click(wc.getByRole('checkbox',{name:'Travel'}))})
  await act(async()=>{fireEvent.click(wc.getByRole('checkbox',{name:'Money'}))})
  expect(notesStore.patches.map((x)=>x.p.wildCards).filter(Boolean)).toEqual([['travel'],['money','travel']])
  expect(api.addTask).not.toHaveBeenCalled()
  fireEvent.click(wc.getByRole('button',{name:'Done'}))
  expect(wc.queryByRole('checkbox')).toBeNull()
  expect(wc.getByText('Money · Travel')).toBeInTheDocument()
 })
 // Planning as tooltips (Task 2): the ideal week is a permanent, quiet
 // section of the Season page: one faint line until it has blocks; Edit opens
 // its editor in place.
 it('the everyday Season page keeps its ideal week: a faint line when empty, the blocks once made, Edit in place',async()=>{
  inSession()
  api.tasks=[{id:'s',title:'Unhurried weekends',bucket:'quarter',goalId:'g'}]
  season()
  let iw=within(screen.getByRole('region',{name:'Ideal week'}))
  expect(iw.getByText('No ideal week for Fall yet.')).toBeInTheDocument()
  expect(iw.queryByRole('textbox')).toBeNull()
  cleanup()
  notesStore.notes={idealWeek:{blocks:[{id:'b1',label:'Sleep',hours:56},{id:'b2',label:'Long walks',hours:4,goalId:'s'}]}}
  season()
  iw=within(screen.getByRole('region',{name:'Ideal week'}))
  expect(iw.getByText(/Unhurried weekends/)).toBeInTheDocument()
  expect(iw.getByText('108h')).toBeInTheDocument()
  expect(iw.queryByRole('textbox')).toBeNull()
  expect(document.querySelector('.plan-card')).toBeNull()
  fireEvent.click(iw.getByRole('button',{name:'Edit'}))
  expect(iw.getByLabelText('Label for Long walks')).toBeInTheDocument()
 })
})

describe('planning a year: the guided session (spec 2026-11-01)',()=>{
 // 2026, planned on Oct 17; the year before is 2025. Seasons here: Spring
 // Mar 1, Summer Jun 1, Fall Sep 1, Winter Dec 1 — the next one is Winter.
 const plannedMarks=()=>notesStore.patches.filter((x)=>(x.p.guide as any)?.plannedAt)
 const inSession=()=>{at(new Date(2026,9,17,12)); onTestFinished(()=>{vi.useRealTimers()})}
 const year=()=>open('/year?view=constellation&start=2026-10-09&plan=1')
 const everyday=()=>open('/year?view=constellation&start=2026-10-09')
 // Planning as tooltips (Task 2): the vision, the landscape and the life
 // areas are permanent, quiet sections of the Year page, edited in place.
 it('the everyday Year page keeps its vision, landscape and life areas: faint lines when empty, Edit in place',async()=>{
  inSession()
  everyday()
  expect(within(screen.getByRole('region',{name:'Vision'})).getByText('No vision for 2026 yet.')).toBeInTheDocument()
  expect(within(screen.getByRole('region',{name:'Landscape'})).getByText('No months mapped yet.')).toBeInTheDocument()
  expect(within(screen.getByRole('region',{name:'Life areas'})).getByText('No life areas yet.')).toBeInTheDocument()
  expect(screen.queryByRole('textbox',{name:'An ordinary day ten years from now'})).toBeNull()
  cleanup()
  notesStore.notes={vision:{tenYears:'A slow morning by the lake'},landscape:[{month:3,text:'a\nb\nc'}]}
  lifeAreas.list=[{id:'h',name:'Health',context:'personal',mine:true,sortOrder:0},{id:'m',name:'Home',context:'family',mine:true,sortOrder:1}]
  everyday()
  const vision=within(screen.getByRole('region',{name:'Vision'}))
  expect(vision.getByText('A slow morning by the lake')).toBeInTheDocument()
  expect(vision.queryByRole('textbox')).toBeNull()
  const land=within(screen.getByRole('region',{name:'Landscape'}))
  expect(land.getByText('Crowded')).toBeInTheDocument()
  expect(within(screen.getByRole('region',{name:'Life areas'})).getByText('Health · Home')).toBeInTheDocument()
  expect(document.querySelector('.plan-card')).toBeNull()
  // Edit opens it in place: no session.
  fireEvent.click(vision.getByRole('button',{name:'Edit'}))
  const success=vision.getByRole('textbox',{name:'What would make 2026 a success'})
  fireEvent.change(success,{target:{value:'Calm'}})
  await act(async()=>{fireEvent.blur(success)})
  expect(notesStore.patches.map((x)=>x.p)).toContainEqual({vision:{tenYears:'A slow morning by the lake',success:'Calm'}})
  expect(screen.queryByRole('region',{name:'Planning 2026'})).toBeNull()
  fireEvent.click(within(screen.getByRole('region',{name:'Life areas'})).getByRole('button',{name:'Edit'}))
  expect(within(screen.getByRole('region',{name:'Life areas'})).getByRole('textbox',{name:'New area'})).toBeInTheDocument()
 })
 it('seven steps, one tooltip each; the look back turns the sheet beside 2026 to 2025',()=>{
  inSession()
  year()
  expect(coach().getByText('Step 1 of 7')).toBeInTheDocument()
  expect(stepNow()).toBe('Look back at 2025')
  expect(chip()).toBe('Planning 2026 · 1 of 7✕')
  expect(screen.getByRole('region',{name:'2025, looking back'})).toBeInTheDocument()
  expect(screen.getByRole('list',{name:'2026 goals'})).toBeInTheDocument()
  expect(shell.reg).toMatchObject({level:'year',token:'2026',threadKey:'annual:2026'})
 })
 it('the look back shows 2025’s open goals beside 2026; the next step folds it back to last year, for reading',async()=>{
  inSession()
  api.goals=[...GOALS.map(g=>({...g})),{id:'sail',name:'Learn to sail',year:2025,status:'active',context:'personal'},
   {id:'run',name:'Run a 10k',year:2025,status:'completed',context:'personal'}]
  year()
  const last=within(screen.getByRole('region',{name:'2025, looking back'}))
  expect(last.getByRole('listitem',{name:'Learn to sail'})).toBeInTheDocument()
  expect(last.queryByRole('listitem',{name:'Run a 10k'})).toBeNull()
  expect(titles('2026 goals')).toEqual(['Together','Health'])
  await act(async()=>{fireEvent.click(coach().getByRole('button',{name:'Next'}))})
  expect(screen.queryByRole('region',{name:'2025, looking back'})).toBeNull()
  expect(shell.reg).toMatchObject({token:'2026',stepId:'vision'})
  // Its editor has no card in the session: its home is the Year page's Vision.
  expect(stepNow()).toBe('Picture 5–10 years out')
  expect(screen.queryByRole('region',{name:'Picture 5–10 years out'})).toBeNull()
 })
 it('Look back: 2025’s open goals — Done, To 2026, Someday, Let go — each through the page’s writers, with Undo',async()=>{
  inSession()
  api.goals=[...GOALS.map(g=>({...g})),
   {id:'a',name:'Learn to sail',year:2025,status:'active',context:'personal'},{id:'b',name:'Write the book',year:2025,status:'active',context:'work',areaId:'h',notes:'Two pages a day'},
   {id:'c',name:'Run a marathon',year:2025,status:'active',context:'personal'},{id:'d',name:'Paint the porch',year:2025,status:'active',context:'family'},
   {id:'e',name:'Met already',year:2025,status:'completed',context:'personal'}]
  api.deleteTask.mockResolvedValue(true)
  atStep('look-back')
  year()
  const open=within(screen.getByRole('list',{name:'Open from 2025'}))
  expect(open.queryByText('Met already')).toBeNull()
  expect(within(open.getByRole('listitem',{name:'Learn to sail'})).getAllByRole('button').map((b)=>b.textContent)).toEqual(['Done','To 2026','Someday','Let go'])
  // To 2026: a copy in 2026 that remembers it.
  await act(async()=>{fireEvent.click(open.getByRole('button',{name:'To 2026: Learn to sail'}))})
  expect(api.addGoal).toHaveBeenCalledWith(null,'Learn to sail','personal',expect.objectContaining({year:2026,carriedFrom:'a'}))
  expect(lastRun().label).toBe('Bring “Learn to sail” into 2026')
  // Someday: goals have no Someday, so its words go on the Someday list and the goal is put away.
  await act(async()=>{fireEvent.click(open.getByRole('button',{name:'Someday: Write the book'}))})
  expect(api.addTask).toHaveBeenCalledWith('Write the book',undefined,undefined,undefined,expect.objectContaining({bucket:'someday',context:'work',areaId:'h',notes:'Two pages a day'}))
  expect(api.updateGoal).toHaveBeenLastCalledWith('b',{status:'archived'})
  expect(lastRun().label).toBe('Moved to Someday: “Write the book”')
  const somedayId=api.addTask.mock.calls[0][4].id
  api.updateGoal.mockClear()
  await act(async()=>{expect(await lastRun().opts.undo()).toBe(true)})
  expect(api.deleteTask).toHaveBeenCalledWith(somedayId)
  expect(api.updateGoal).toHaveBeenCalledWith('b',{status:'active'})
  // An Undo whose Someday line would not go says so, and leaves the goal put away.
  const someday=lastRun()
  api.updateGoal.mockClear();api.deleteTask.mockResolvedValueOnce(false)
  await act(async()=>{expect(await someday.opts.undo()).toBe(false)})
  expect(api.updateGoal).not.toHaveBeenCalled()
  // Let go: archived, never deleted.
  await act(async()=>{fireEvent.click(open.getByRole('button',{name:'Let go: Run a marathon'}))})
  expect(api.updateGoal).toHaveBeenLastCalledWith('c',{status:'archived'})
  expect(lastRun().label).toBe('Let go of “Run a marathon”')
  expect(lastRun().opts.undo).toEqual(expect.any(Function))
  await act(async()=>{fireEvent.click(open.getByRole('button',{name:'Done: Paint the porch'}))})
  expect(api.updateGoal).toHaveBeenLastCalledWith('d',{status:'completed'})
  expect(api.deleteGoal).not.toHaveBeenCalled()
  expect(plannedMarks()).toHaveLength(0)
 })
 it('Look back: a Someday whose goal could not be put away takes its Someday line back',async()=>{
  inSession()
  api.goals=[...GOALS.map(g=>({...g})),{id:'a',name:'Learn to sail',year:2025,status:'active',context:'personal'}]
  api.updateGoal.mockResolvedValue(false)
  atStep('look-back')
  year()
  api.deleteTask.mockResolvedValue(true)
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Someday: Learn to sail'}))})
  expect(lastRun().ok).toBe(false)
  expect(api.deleteTask).toHaveBeenCalledWith(api.addTask.mock.calls[0][4].id)
  // Taken back: nothing changed, the receipt's usual words.
  expect(lastRun().opts.failureSummary).toBeUndefined()
  // A Someday line that would not go back says so in the receipt.
  api.deleteTask.mockResolvedValue(false)
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Someday: Learn to sail'}))})
  expect(lastRun().ok).toBe(false)
  expect(lastRun().opts).toMatchObject({failureState:'partial',failureSummary:'Didn’t put “Learn to sail” away. Its line is still on Someday.'})
 })
 // Planning as tooltips (Task 2): the vision is a section of the Year page;
 // on its step its fields are open.
 it('Picture 5–10 years out saves the vision into the year’s notes, in Scott’s words',async()=>{
  inSession()
  atStep('vision')
  year()
  const vision=within(screen.getByRole('region',{name:'Vision'}))
  expect(screen.getByRole('region',{name:'Vision'})).toHaveAttribute('data-guide-anchor','vision')
  const day=vision.getByRole('textbox',{name:'An ordinary day ten years from now'})
  expect(day).toHaveValue('')
  fireEvent.change(day,{target:{value:'Coffee on the porch, then the workshop'}})
  await act(async()=>{fireEvent.blur(day)})
  expect(notesStore.patches.map((x)=>x.p)).toContainEqual({vision:{tenYears:'Coffee on the porch, then the workshop'}})
  expect(vision.getByRole('textbox',{name:'What would make 2026 a success'})).toHaveValue('')
 })
 // Planning as tooltips (Task 2): the landscape is a section of the Year
 // page; on its step its months are open.
 it('Map the 12 months saves each month’s lines, and marks a month crowded',async()=>{
  inSession()
  atStep('landscape')
  year()
  const land=within(screen.getByRole('region',{name:'Landscape'}))
  expect(screen.getByRole('region',{name:'Landscape'})).toHaveAttribute('data-guide-anchor','landscape')
  const july=land.getByRole('textbox',{name:'July'})
  fireEvent.change(july,{target:{value:'Beach week\nCamp\nWedding'}})
  await act(async()=>{fireEvent.blur(july)})
  expect(notesStore.patches.map((x)=>x.p)).toContainEqual({landscape:[{month:7,text:'Beach week\nCamp\nWedding'}]})
  expect(within(land.getByRole('listitem',{name:'July'})).getByText('Crowded')).toBeInTheDocument()
 })
 // Planning as tooltips (Task 2): the life areas are a section of the Year
 // page; on its step the areas editor is open.
 it('Choose life areas: the areas editor, writing through the life areas’ own writers',async()=>{
  inSession()
  lifeAreas.list=[{id:'h',name:'Health',context:'personal',mine:true,sortOrder:0}]
  atStep('areas')
  year()
  const areas=within(screen.getByRole('region',{name:'Life areas'}))
  expect(screen.getByRole('region',{name:'Life areas'})).toHaveAttribute('data-guide-anchor','areas')
  expect(areas.getByText(/3 to 8 is typical/)).toBeInTheDocument()
  fireEvent.change(areas.getByRole('textbox',{name:'New area'}),{target:{value:'Money'}})
  await act(async()=>{fireEvent.click(areas.getByRole('button',{name:'Add'}))})
  expect(lifeAreas.add).toHaveBeenCalledWith('Money','personal')
  expect(plannedMarks()).toHaveLength(0)
 })
 it('Brain dump: the year’s life areas as chips; a goal is written in the area picked',async()=>{
  inSession()
  lifeAreas.list=[{id:'h',name:'Health',context:'personal',mine:true,sortOrder:0},{id:'m',name:'Money',context:'work',mine:true,sortOrder:1}]
  atStep('brain-dump')
  year()
  fireEvent.click(within(screen.getByRole('radiogroup',{name:'Life area'})).getByRole('radio',{name:'Money'}))
  await writeOn('Write a 2026 goal for Money','Max the 401k')
  expect(api.addGoal).toHaveBeenCalledWith('m','Max the 401k','work',expect.objectContaining({year:2026}))
  await waitFor(()=>expect(plannedMarks()).toHaveLength(1))
 })
 it('Brain dump: last year open beside the sheet, the pencil on “Write a 2026 goal”; the first goal written marks 2026 planned',async()=>{
  inSession()
  atStep('brain-dump')
  year()
  expect(aboveOpen()).toBe(true)
  expect(document.querySelector('.ribbon-card')).toBeNull()
  await waitFor(()=>expect(document.activeElement).toBe(screen.getByRole('textbox',{name:'Write a 2026 goal'})))
  await writeOn('Write a 2026 goal','Max the 401k')
  expect(api.addGoal).toHaveBeenCalledWith(null,'Max the 401k','personal',expect.objectContaining({year:2026}))
  await waitFor(()=>expect(plannedMarks()).toHaveLength(1))
 })
 // Planning as tooltips (Task 2): on the Refine step the year's list itself
 // carries the overlapping pairs and their calls (session-only).
 it('Refine: goals that overlap, with Keep both, Let go of one, Someday — nothing merges on its own',async()=>{
  inSession()
  api.goals=[...GOALS.map(g=>({...g})),{id:'r1',name:'Family trip to Maine',year:2026,status:'active',context:'personal'},{id:'r2',name:'Maine family trip',year:2026,status:'active',context:'personal'}]
  atStep('refine')
  year()
  const sheet=()=>within(document.querySelector<HTMLElement>('.plan-sheet')!)
  const pair=()=>within(sheet().getByRole('listitem',{name:'Family trip to Maine and Maine family trip'}))
  fireEvent.click(pair().getByRole('button',{name:'Let go of one'}))
  await act(async()=>{fireEvent.click(pair().getByRole('button',{name:'Maine family trip'}))})
  expect(api.updateGoal).toHaveBeenLastCalledWith('r2',{status:'archived'})
  expect(lastRun().label).toBe('Let go of “Maine family trip”')
  fireEvent.click(pair().getByRole('button',{name:'Someday'}))
  await act(async()=>{fireEvent.click(pair().getByRole('button',{name:'Family trip to Maine'}))})
  expect(api.addTask).toHaveBeenCalledWith('Family trip to Maine',undefined,undefined,undefined,expect.objectContaining({bucket:'someday',context:'personal'}))
  expect(api.updateGoal).toHaveBeenLastCalledWith('r1',{status:'archived'})
  const writes=api.updateGoal.mock.calls.length+api.addTask.mock.calls.length
  // Keep both: no goal is written; the pair is kept in the year's notes.
  await act(async()=>{fireEvent.click(pair().getByRole('button',{name:'Keep both'}))})
  expect(sheet().getByText('Nothing on the list looks alike.')).toBeInTheDocument()
  expect(api.updateGoal.mock.calls.length+api.addTask.mock.calls.length).toBe(writes)
  expect(notesStore.patches.map((x)=>x.p)).toContainEqual({keptPairs:[['r1','r2']]})
  expect(api.deleteGoal).not.toHaveBeenCalled()
  expect(plannedMarks()).toHaveLength(0)
  // Session-only: every day the list carries no pairs.
  cleanup();everyday()
  expect(screen.queryByRole('list',{name:'May overlap'})).toBeNull()
  expect(screen.queryByText('Nothing on the list looks alike.')).toBeNull()
 })
 it('Refine: a pair kept in an earlier session does not come back',()=>{
  inSession()
  api.goals=[...GOALS.map(g=>({...g})),{id:'r1',name:'Family trip to Maine',year:2026,status:'active',context:'personal'},{id:'r2',name:'Maine family trip',year:2026,status:'active',context:'personal'}]
  notesStore.notes={guide:{current:'refine',done:[],skipped:[]},keptPairs:[['r1','r2']]}
  year()
  expect(screen.queryByRole('listitem',{name:'Family trip to Maine and Maine family trip'})).toBeNull()
  expect(screen.getByText('Nothing on the list looks alike.')).toBeInTheDocument()
 })
 // Planning as tooltips (Task 2): sharing is each goal's own space (its
 // panel); the step's tooltip carries the one action, the booking.
 it('Share and book: the tooltip books the first Winter session on the day picked (the day Winter starts unless changed); nothing is shared from the page',async()=>{
  inSession()
  api.goals=[...GOALS.map(g=>({...g})),{id:'w',name:'Ship the site',year:2026,status:'active',context:'work',userId:'u1'}]
  atStep('share-book')
  year()
  expect(screen.queryByRole('list',{name:'Work and Personal goals'})).toBeNull()
  expect(screen.queryByRole('button',{name:/^Share with the family/})).toBeNull()
  expect(coach().getByText('Share and book the next session')).toBeInTheDocument()
  // The action opens a date, the day Winter starts; nothing is booked yet.
  fireEvent.click(coach().getByRole('button',{name:'Book the first Winter session'}))
  const date=coach().getByLabelText('First Winter session')
  expect(date).toHaveValue('2026-12-01')
  expect(api.addTask).not.toHaveBeenCalled()
  fireEvent.change(date,{target:{value:'2026-11-28'}})
  await act(async()=>{fireEvent.click(coach().getByRole('button',{name:'Book it'}))})
  expect(api.addTask).toHaveBeenCalledWith('Plan Winter',undefined,undefined,new Date(2026,10,28),expect.objectContaining({isAllDay:true,context:'personal',id:expect.any(String)}))
  expect(lastRun().label).toBe('Add “Plan Winter” to Sat, Nov 28')
  expect(lastRun().opts.undo).toEqual(expect.any(Function))
  expect(coach().getByRole('status')).toHaveTextContent('Booked: Plan Winter, Sat, Nov 28')
  expect(api.updateGoal).not.toHaveBeenCalled()
  expect(plannedMarks()).toHaveLength(0)
  // Only that step carries an action.
  await act(async()=>{fireEvent.click(coach().getByRole('button',{name:'Back'}))})
  expect(coach().queryByRole('button',{name:/^Book the first/})).toBeNull()
 })
})

// The list never runs off the page (calm pass, mockup approved 2026-10-18):
// a compact card of 8 then "+N more", ordered by drag, with the level above
// beside it, quieter and read-only.
describe('the list, ordered by drag',()=>{
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

 it('every line shows: the list never folds above the week, and the line to write on stays at the bottom',()=>{
  api.tasks=lines(19)
  month('&focus=2:m12')
  expect(titles('October goals')).toEqual(lines(19).map(l=>l.title))
  expect(within(sectionOf('October goals')).queryByRole('button',{name:/more$|Show less/})).toBeNull()
  expect(within(row('Line 12')).getByText('Saved')).toBeInTheDocument()
  expect(within(sectionOf('October goals')).getByRole('textbox',{name:'Write an October goal'})).toBeInTheDocument()
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
  await writeOn('Write a 2026 goal','Garden')
  await waitFor(()=>expect(api.addGoal).toHaveBeenCalledWith(null,'Garden','personal',expect.objectContaining({year:2026,sortOrder:3000})))
  await waitFor(()=>expect(titles('2026 goals')).toEqual(['Together','Home','Health','Garden']))
 })
 it('a year goal carried into a year lands last there',async()=>{
  api.goals=[{...GOALS[0],sortOrder:0},{...GOALS[1],sortOrder:1000},
   {id:'n1',name:'Next one',year:2027,status:'active',context:'personal',sortOrder:0},{id:'n2',name:'Next two',year:2027,status:'active',context:'personal',sortOrder:4000},
   {id:'old',name:'Learn to sail',year:2025,status:'active',context:'personal',sortOrder:0}]
  liveGoals()
  // Into 2027, from reviewing 2026 (which plans 2027).
  atStep('look-back')
  open('/year?view=constellation&start=2026-10-09&review=1')
  fireEvent.click(screen.getByRole('button',{name:'To 2027: Together'}))
  await waitFor(()=>expect(api.addGoal).toHaveBeenCalledWith(null,'Together','personal',expect.objectContaining({year:2027,carriedFrom:'g',sortOrder:5000})))
  cleanup()
  // Bring into 2026, while planning it.
  atStep('look-back')
  open('/year?view=constellation&start=2026-10-09&plan=1')
  fireEvent.click(screen.getByRole('button',{name:'To 2026: Learn to sail'}))
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
   {id:'d',title:'Pumpkins',bucket:'month',context:'family',completed:true,completedAt:new Date(2026,9,9),...iris},
   // Private: Work, under the family season goal, open and done.
   {id:'w',title:'Board deck',bucket:'month',context:'work',sortOrder:0,sourceId:'s',...iris},
   {id:'wd',title:'Quarterly numbers',bucket:'month',context:'work',completed:true,completedAt:new Date(2026,9,9),...iris},
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
  // The sheet above: the private season goal is absent, and not counted on its edge.
  expect(aboveTitles()).toEqual(['Fall together'])
  expect(screen.getByRole('button',{name:'Fall 2026, 1 open. Unfold to read'})).toBeInTheDocument()
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
 it('an open row drags to order, with no verbs on it; a done line does not drag',()=>{
  api.tasks=[{id:'m',title:'Picnic',bucket:'month',context:'family'},{id:'d',title:'Pay taxes',bucket:'month',completed:true,completedAt:new Date(2026,9,9)}]
  localStorage.setItem('symphony-plan-done','shown')
  month()
  expect(row('Picnic')).toHaveAttribute('draggable','true')
  expect(row('Pay taxes')).toHaveAttribute('draggable','false')
  expect(verbsOf(row('Picnic'))).toEqual(['Picnic'])
 })
 it('a month line deletes from its row, and Undo writes it back with the same id',async()=>{
  api.tasks=[{id:'m',title:'Picnic',bucket:'month',context:'family'}]
  month()
  fireEvent.click(within(row('Picnic')).getByRole('button',{name:'Delete Picnic'}))
  await waitFor(()=>expect(api.deleteTask).toHaveBeenCalledWith('m'))
  expect(lastRun().label).toBe('Delete “Picnic”')
  await lastRun().opts.undo()
  expect(api.addTask).toHaveBeenLastCalledWith('Picnic',undefined,undefined,undefined,expect.objectContaining({id:'m',bucket:'month'}))
 })
 it('a year goal deletes by being put away, with Undo',async()=>{
  open()
  fireEvent.click(within(row('Together')).getByRole('button',{name:'Delete Together'}))
  await waitFor(()=>expect(api.updateGoal).toHaveBeenCalledWith('g',{status:'archived'}))
  expect(lastRun().label).toBe('Delete “Together”')
  await lastRun().opts.undo()
  expect(api.updateGoal).toHaveBeenLastCalledWith('g',{status:'active'})
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
 it('Month: every open Fall goal on the sheet above, plain, none draggable; Year rows carry no Fall tag',()=>{
  api.tasks=[...Array.from({length:21},(_,i)=>({id:`s${i+1}`,title:`Fall goal ${i+1}`,bucket:'quarter',goalId:'g'})),{id:'m',title:'Picnic',bucket:'month',sourceId:'s2'}]
  month()
  expect(aboveTitles()).toHaveLength(21)
  expect(sheetAbove()).not.toHaveTextContent(/on October/)
  expect(sheetAbove().querySelectorAll('[draggable="true"],button')).toHaveLength(0)
  cleanup();open()
  expect(row('Together')).not.toHaveTextContent(/Fall/)
 })
})

describe('grouped by life area',()=>{
 const A=(id:string,name:string,sortOrder:number)=>({id,name,context:'personal',mine:true,sortOrder})
 const heads=()=>Array.from(document.querySelectorAll('.plan-area-head')).map(h=>h.textContent)
 it('draws no headings when there are no life areas',()=>{
  open()
  expect(heads()).toEqual([])
  expect(titles('2026 goals')).toEqual(['Together','Health'])
 })
 it('gathers year goals under their area, No area last; an area the viewer cannot see falls under No area',()=>{
  lifeAreas.list=[A('a2','Money',1),A('a1','Family',0),A('a3','Fun',2)]
  api.goals=[{id:'g1',name:'Save',year:2026,status:'active',context:'personal',areaId:'a2'},{id:'g2',name:'Plain',year:2026,status:'active',context:'personal',areaId:''},{id:'g3',name:'Dinners',year:2026,status:'active',context:'personal',areaId:'a1'},{id:'g4',name:'Hidden one',year:2026,status:'active',context:'personal',areaId:'not-mine'}]
  open()
  expect(heads()).toEqual(['Family','Money','No area'])
  expect(titles('2026 goals')).toEqual(['Dinners','Save','Plain','Hidden one'])
 })
 it('gathers a month\'s lines by their task area',()=>{
  lifeAreas.list=[A('a1','Health',0)]
  api.tasks=[{id:'t1',title:'Loose',bucket:'month',context:'personal',areaId:null},{id:'t2',title:'Run',bucket:'month',context:'personal',areaId:'a1'}]
  month()
  expect(heads()).toEqual(['Health','No area'])
  expect(titles('October goals')).toEqual(['Run','Loose'])
 })
 it('hides the heading when No area is the only group',()=>{
  lifeAreas.list=[A('a1','Health',0)]
  api.tasks=[{id:'t1',title:'Loose',bucket:'month',context:'personal',areaId:null}]
  month()
  expect(heads()).toEqual([])
 })
 it('two areas with the same name stay separate groups',()=>{
  lifeAreas.list=[{...A('a1','Health',0),context:'work'},{...A('a2','Health',1),context:'family'}]
  api.tasks=[{id:'t1',title:'One',bucket:'month',context:'work',areaId:'a1'},{id:'t2',title:'Two',bucket:'month',context:'family',areaId:'a2'}]
  month()
  expect(heads()).toEqual(['Health','Health'])
 })
 describe('ordering by drag when grouped',()=>{
  const dt=()=>{const data:Record<string,string>={};return{setData:(k:string,v:string)=>{data[k]=v},getData:(k:string)=>data[k]??'',types:[] as string[],effectAllowed:'',dropEffect:''}}
  const drag=(title:string,y:number)=>{
   const ul=list('October goals'),rows=ul.querySelectorAll<HTMLElement>('li[data-order-id]')
   const rect=(top:number,bottom:number)=>()=>({top,bottom,left:0,right:300,width:300,height:bottom-top,x:0,y:top,toJSON:()=>({})}) as DOMRect
   rows.forEach((li,i)=>{li.getBoundingClientRect=rect(i*40,i*40+40)});ul.getBoundingClientRect=rect(0,rows.length*40)
   const t=dt()
   fireEvent.dragStart(row(title),{dataTransfer:t})
   for(const type of ['dragOver','drop'] as const){const ev=createEvent[type](ul,{dataTransfer:t});Object.defineProperty(ev,'clientY',{value:y});fireEvent(ul,ev)}
  }
  const setup=()=>{
   lifeAreas.list=[A('h','Health',0),A('f','Fun',1)]
   api.tasks=[{id:'a',title:'Alpha',bucket:'month',context:'personal',areaId:'h',sortOrder:0},{id:'b',title:'Bravo',bucket:'month',context:'personal',areaId:'h',sortOrder:1000},{id:'c',title:'Charlie',bucket:'month',context:'personal',areaId:'f',sortOrder:2000}]
   api.updateTaskOrders.mockResolvedValue(true)
   month()
  }
  it('a drop across an area boundary writes nothing',()=>{
   setup()
   drag('Alpha',100)
   drag('Charlie',10)
   expect(api.updateTaskOrders).not.toHaveBeenCalled()
  })
  it('a drop inside its own area still moves the line, writing only that area',()=>{
   setup()
   drag('Alpha',75)
   expect(api.updateTaskOrders).toHaveBeenCalledTimes(1)
   const ids=api.updateTaskOrders.mock.calls[0][0].map((w:any)=>w.id)
   expect(ids).toContain('a')
   expect(ids).not.toContain('c')
  })
 })
})

// Planning as tooltips (Task 2): every planning step has a permanent, quiet
// home on the everyday page, and its tooltip points at it. One row per step
// of Month, Season and Year: the anchor is on the page every day (not hidden),
// and in a session the step's tooltip points at it, not at the title.
describe('every step’s tooltip points at its home on the everyday page',()=>{
 const pages={month:'/month?view=constellation&horizon=2&start=2026-10-09',season:'/season?view=constellation&horizon=1&start=2026-10-09',year:'/year?view=constellation&start=2026-10-09'} as const
 const rows=(['month','season','year'] as const).flatMap((level)=>stepsFor(level).map((st)=>[level,st.id,st.at] as const))
 it.each(rows)('%s · %s → [data-guide-anchor="%s"]',(level,id,anchor)=>{
  at(new Date(2026,9,17,12)); onTestFinished(()=>{vi.useRealTimers()})
  // Energy's home is the header line, once said (Task 4).
  const said=anchor==='energy'?{energy:{level:'medium' as const}}:{}
  notesStore.notes={...said}
  open(pages[level])
  // Month's routines are on its calendar sheet, drawn once it is unfolded.
  if(anchor==='routines')fireEvent.keyDown(screen.getByRole('button',{name:/ calendar\. Unfold to read$/}),{key:'Enter'})
  const home=document.querySelector(`[data-guide-anchor="${anchor}"]`)
  expect(home).not.toBeNull()
  expect(home!.closest('[hidden]')).toBeNull()
  cleanup()
  atStep(id); notesStore.notes={...notesStore.notes,...said}
  open(pages[level]+'&plan=1')
  expect(screen.getByRole('dialog',{name:'Planning guide'}).dataset.at).toBe(anchor)
 })
})

// Fix round 1: a period's sections and chip are that period's alone, and
// nothing on them writes until its notes have loaded.
describe('the homes belong to the period on screen, once its notes are in',()=>{
 it('changing energy on Fall, then going to Winter, shows Winter’s own level and writes nothing into Winter',async()=>{
  at(new Date(2026,9,17,12)); onTestFinished(()=>{vi.useRealTimers()})
  notesStore.byToken={'2026-fall':{energy:{level:'low'}},'2026-winter':{energy:{level:'high'},wildCards:['house']}}
  season()
  fireEvent.click(within(head()).getByRole('button',{name:'Energy: low'}))
  await act(async()=>{fireEvent.click(within(screen.getByRole('menu',{name:'Energy'})).getByRole('menuitemradio',{name:'Medium'}))})
  expect(notesStore.patches).toEqual([expect.objectContaining({p:{energy:{level:'medium'}},token:'2026-fall'})])
  // An editor left open on Fall closes with it.
  fireEvent.click(within(screen.getByRole('region',{name:'Wild cards'})).getByRole('button',{name:'Edit'}))
  fireEvent.click(screen.getByRole('button',{name:'Next season'}))
  expect(screen.getByRole('heading',{level:1})).toHaveTextContent('Winter')
  expect(within(head()).getByRole('button',{name:/^Energy/})).toHaveTextContent('Energy: high')
  expect(within(screen.getByRole('region',{name:'Wild cards'})).queryByRole('checkbox')).toBeNull()
  expect(within(screen.getByRole('region',{name:'Wild cards'})).getByText('The house')).toBeInTheDocument()
  expect(notesStore.patches.filter((x)=>x.token==='2026-winter')).toEqual([])
 })
 it('the year’s sections are each year’s own',()=>{
  at(new Date(2026,9,17,12)); onTestFinished(()=>{vi.useRealTimers()})
  notesStore.byToken={'2026':{vision:{tenYears:'Lake mornings'}},'2027':{}}
  open('/year?view=constellation&start=2026-10-09')
  fireEvent.click(within(screen.getByRole('region',{name:'Vision'})).getByRole('button',{name:'Edit'}))
  fireEvent.click(screen.getByRole('button',{name:'Next year'}))
  const vision=within(screen.getByRole('region',{name:'Vision'}))
  expect(vision.queryByRole('textbox')).toBeNull()
  expect(vision.getByText('No vision for 2027 yet.')).toBeInTheDocument()
 })
 it('while the notes load: no chip and no editors, so nothing can be written',()=>{
  at(new Date(2026,9,17,12)); onTestFinished(()=>{vi.useRealTimers()})
  notesStore.loading=true
  season()
  expect(within(head()).queryByRole('button',{name:/^Energy/})).toBeNull()
  for(const name of ['Ideal week','Wild cards'])expect(within(screen.getByRole('region',{name})).queryByRole('button',{name:'Edit'})).toBeNull()
  cleanup()
  open('/year?view=constellation&start=2026-10-09')
  for(const name of ['Vision','Landscape'])expect(within(screen.getByRole('region',{name})).queryByRole('button',{name:'Edit'})).toBeNull()
  expect(notesStore.patches).toEqual([])
 })
 it('a read that failed says “Couldn’t load” faintly and offers nothing to write',()=>{
  at(new Date(2026,9,17,12)); onTestFinished(()=>{vi.useRealTimers()})
  notesStore.error='boom'
  season()
  expect(within(head()).queryByRole('button',{name:/^Energy/})).toBeNull()
  for(const name of ['Ideal week','Wild cards']){
   const sec=within(screen.getByRole('region',{name}))
   expect(sec.getByText('Couldn’t load.')).toBeInTheDocument()
   expect(sec.queryByRole('button',{name:'Edit'})).toBeNull()
  }
  cleanup()
  month()
  choose('Fresh start')
  expect(within(screen.getByRole('region',{name:'Fresh start'})).getByText('Couldn’t load.')).toBeInTheDocument()
  expect(within(screen.getByRole('region',{name:'Fresh start'})).queryByRole('button',{name:/Densely Urban/})).toBeNull()
  expect(notesStore.patches).toEqual([])
 })
 it('the quiet panels are regions, styled on the sheet (Fresh start, the refine pairs)',async()=>{
  at(new Date(2026,9,17,12)); onTestFinished(()=>{vi.useRealTimers()})
  month()
  choose('Fresh start')
  expect(screen.getByRole('region',{name:'Fresh start'})).toHaveClass('plan-fresh')
  expect(screen.queryByRole('dialog',{name:'Fresh start'})).toBeNull()
 })
})

// Every save reloads the plans (refetch), and the real hook turns `loading`
// on while it does, with the list already on screen. Only the first load
// blanks the page: a save never flashes "Loading your plans…", never
// remounts the sheet (the write line keeps its focus, ready for the next
// goal) and never resets the session's tooltip ("Booked: …" stays).
describe('a save reloads the plans behind the page',()=>{
 /** refetch as the real hook does it: loading on now, off at `finish()`. */
 const reloads=()=>{
  const pending:(()=>void)[]=[]
  api.refetch.mockImplementation(()=>new Promise<void>((res)=>{(api as any).loading=true;api.redraw();pending.push(()=>{delete (api as any).loading;api.redraw();res()})}))
  onTestFinished(()=>{api.refetch.mockReset();delete (api as any).loading})
  return{finish:()=>act(async()=>{for(const f of pending.splice(0))f()})}
 }
 const loadingShown=()=>screen.queryByText('Loading your plans…')
 it('Month: writing a goal keeps the page, the facts and the same write line, focused',async()=>{
  api.tasks=[{id:'m',title:'Pick dates',bucket:'month'}]
  const r=reloads()
  open(NOV)
  const line=screen.getByRole('textbox',{name:'Write a November goal'})
  line.focus()
  await writeOn('Write a November goal','Book trains')
  expect(api.refetch).toHaveBeenCalled()
  // Mid-reload: nothing blanks, the line is the same one, still focused.
  expect(loadingShown()).toBeNull()
  expect(document.querySelector('.plan-facts')).not.toBeNull()
  expect(screen.getByRole('textbox',{name:'Write a November goal'})).toBe(line)
  expect(document.activeElement).toBe(line)
  expect(line).toHaveValue('')
  await r.finish()
  expect(loadingShown()).toBeNull()
  expect(screen.getByRole('textbox',{name:'Write a November goal'})).toBe(line)
  expect(document.activeElement).toBe(line)
 })
 it('Season and Year: a goal written shows no loading line and keeps the line',async()=>{
  const r=reloads()
  season()
  const line=screen.getByRole('textbox',{name:'Write a Fall goal'})
  line.focus()
  await writeOn('Write a Fall goal','Walk daily')
  expect(loadingShown()).toBeNull()
  expect(document.activeElement).toBe(line)
  await r.finish()
  cleanup()
  open()
  const y=screen.getByRole('textbox',{name:'Write a 2026 goal'})
  y.focus()
  await writeOn('Write a 2026 goal','A meaningful year')
  expect(api.addGoal).toHaveBeenCalled()
  expect(loadingShown()).toBeNull()
  expect(screen.getByRole('textbox',{name:'Write a 2026 goal'})).toBe(y)
  expect(document.activeElement).toBe(y)
  await r.finish()
 })
 it('in a session: the step stays put and the write line keeps its focus',async()=>{
  at(new Date(2026,9,17,12)); onTestFinished(()=>{vi.useRealTimers()})
  const r=reloads()
  atStep('by-area')
  month('&plan=1')
  const step=stepNow()
  const line=screen.getByRole('textbox',{name:'Write an October goal'})
  await waitFor(()=>expect(document.activeElement).toBe(line))
  await writeOn('Write an October goal','Paint the fence')
  expect(loadingShown()).toBeNull()
  expect(stepNow()).toBe(step)
  expect(screen.getByRole('textbox',{name:'Write an October goal'})).toBe(line)
  expect(document.activeElement).toBe(line)
  await r.finish()
  expect(screen.getByRole('textbox',{name:'Write an October goal'})).toBe(line)
  expect(document.activeElement).toBe(line)
 })
 it('Year’s Share and book: “Booked: …” shows after booking, through the reload',async()=>{
  at(new Date(2026,9,17,12)); onTestFinished(()=>{vi.useRealTimers()})
  const r=reloads()
  atStep('share-book')
  open('/year?view=constellation&start=2026-10-09&plan=1')
  fireEvent.click(coach().getByRole('button',{name:'Book the first Winter session'}))
  fireEvent.change(coach().getByLabelText('First Winter session'),{target:{value:'2026-11-28'}})
  await act(async()=>{fireEvent.click(coach().getByRole('button',{name:'Book it'}))})
  expect(loadingShown()).toBeNull()
  expect(coach().getByRole('status')).toHaveTextContent('Booked: Plan Winter, Sat, Nov 28')
  await r.finish()
  expect(coach().getByRole('status')).toHaveTextContent('Booked: Plan Winter, Sat, Nov 28')
 })
})
