import {render,screen,fireEvent,waitFor,within,cleanup,createEvent,act} from '@testing-library/react'
import {MemoryRouter,Routes,Route,useLocation} from 'react-router-dom'
import {afterEach,beforeEach,describe,it,expect,onTestFinished,vi} from 'vitest'
import {ConstellationPage} from './ConstellationPage'
import {ConversationWalkContext} from '@/components/canvas/conversationWalk'
import {GuidedSessionProvider,useGuidedSession} from '@/contexts/GuidedSessionContext'
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
vi.mock('@/hooks/useRoutines',()=>({useRoutines:()=>({getRoutinesForDate:()=>[]})}))
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
const notesStore=vi.hoisted(()=>({notes:{} as Record<string,unknown>,patches:[] as {p:Record<string,unknown>;defaults?:Record<string,unknown>}[]}))
vi.mock('@/hooks/usePlanningNotes',async()=>{const {useState,useCallback}=await import('react');return{usePlanningNotes:()=>{
 const [notes,setNotes]=useState(notesStore.notes)
 const patch=useCallback(async(p:Record<string,unknown>,defaults?:Record<string,unknown>)=>{notesStore.patches.push({p,defaults});notesStore.notes={...defaults,...notesStore.notes,...p};setNotes(notesStore.notes);return true},[])
 return{notes,loading:false,error:null,patch,reload:()=>undefined}}}})
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
 vi.clearAllMocks();cal.events=[];filters.sole='personal';addArea.real=false;notesStore.notes={};notesStore.patches=[];shell.reg=null;review.seen=[];review.prevReviewed=null;plan.n=0;plan.seen=[];plan.next=null;plan.nextLoading=false;filters.on=false;api.tasks=[];lifeAreas.list=[];api.goals=GOALS.map(g=>({...g}));activity.calls=[];activity.proposals=[];activity.changeSet=null
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
const ROW_VERB=/^(This week|Done|Later|Let go|Off |Back to|Delete|Someday|November|October|Fall|Next )/

// Task 5c (Scott, 2026-11-04: "yes, add the calendar fold on the right"):
// this period's calendar lies folded at the sheet's right edge, for reading.
// Events are added the usual way, never from the sheet.
const calSheet=()=>document.querySelector<HTMLElement>('.paper-fold-slot--calendar .paper-fold-front')!
const CAL_FOOT='For reading. Add events the usual way.'
describe('this period’s calendar, folded on the right',()=>{
 it('Month: “November calendar”; unfolding it shows the month’s events, five weeks from its first',async()=>{
  cal.events=[{id:'e1',title:'Thanksgiving',start_time:'2026-11-26',end_time:'2026-11-27',all_day:true},
   {id:'e2',title:'Dentist',start_time:'2026-11-10T15:00:00',end_time:'2026-11-10T16:00:00',all_day:false}]
  open(NOV)
  expect(calSheet()).toHaveAttribute('inert')
  fireEvent.keyDown(screen.getByRole('button',{name:'November calendar. Unfold to read'}),{key:'Enter'})
  const sheet=await screen.findByRole('region',{name:'November calendar, for reading'})
  expect(within(sheet).getByRole('heading',{name:'November'})).toBeInTheDocument()
  const weeks=within(within(sheet).getByRole('list',{name:'The next weeks'})).getAllByRole('listitem',{name:/^Week of/})
  expect(weeks).toHaveLength(5)
  expect(weeks[0]).toHaveAccessibleName(/^Week of (Oct|Nov) /)
  expect(within(sheet).getAllByText('Thanksgiving').length).toBeGreaterThan(0)
  expect(within(sheet).getAllByText('Dentist').length).toBeGreaterThan(0)
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
  expect(within(row('Pick dates')).getAllByRole('button').map(b=>b.textContent)).toEqual(['Pick dates'])
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
  expect(within(form).getByRole('button',{name:'Set context'})).toHaveAttribute('title','Space: Work')
  await writeOn('Write an October goal','Quarterly numbers')
  expect(api.addTask).toHaveBeenCalledWith('Quarterly numbers',undefined,undefined,undefined,expect.objectContaining({bucket:'month',context:'work'}))
 })
 it('rows say nothing about what is above or below them, on Month, Season and Year',()=>{
  at(new Date(2026,9,20,9)); onTestFinished(()=>{vi.useRealTimers()})
  api.tasks=[{id:'s',title:'Autumn outings',bucket:'quarter',goalId:'g'},{id:'m',title:'Picnic',bucket:'month',sourceId:'s',
   subtasks:[{id:'st',title:'Inventory everything',parentTaskId:'m',bucket:'week'}]},{id:'w',title:'Book the shelter',bucket:'week',sourceId:'m'}]
  month()
  expect(row('Picnic')).not.toHaveTextContent(/For |This week|Week of/)
  expect(within(row('Picnic')).getAllByRole('button').map(b=>b.textContent)).toEqual(['Picnic'])
  cleanup();season()
  expect(row('Autumn outings')).not.toHaveTextContent(/For |October/)
  expect(within(row('Autumn outings')).getAllByRole('button').map(b=>b.textContent)).toEqual(['Autumn outings'])
  cleanup();open()
  // No "Fall" tag on a year goal with Fall goals under it, and no verbs.
  expect(row('Together')).not.toHaveTextContent(/Fall/)
  expect(within(row('Together')).getAllByRole('button').map(b=>b.textContent)).toEqual(['Together'])
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

// The strip keeps only the routines at the page's pace (Month and Year); the
// sheet above took its first tab, and Season runs no routines of its own.
describe('the strip: routines only',()=>{
 it('Month and Year: a Routines strip with no other tab; Season: no strip',()=>{
  api.tasks=[{id:'s',title:'Autumn outings',bucket:'quarter'}]
  month()
  const strip=screen.getByRole('complementary',{name:'Routines strip'})
  expect(within(strip).queryAllByRole('tab')).toHaveLength(0)
  expect(within(strip).getByText('Routines')).toBeInTheDocument()
  expect(within(strip).queryByText('Autumn outings')).toBeNull()
  expect(screen.queryByRole('complementary',{name:/Fall/})).toBeNull()
  cleanup();open()
  expect(within(screen.getByRole('complementary',{name:'Routines strip'})).queryAllByRole('tab')).toHaveLength(0)
  cleanup();season()
  expect(screen.queryByRole('complementary')).toBeNull()
  expect(document.querySelector('.hs-rail')).toBeNull()
 })
 it('folds to a rail and stays folded for this viewer',()=>{
  month()
  fireEvent.click(within(screen.getByRole('complementary',{name:'Routines strip'})).getByRole('button',{name:'Hide routines strip'}))
  expect(screen.queryByRole('complementary',{name:'Routines strip'})).toBeNull()
  expect(localStorage.getItem('symphony-strip-open:month')).toBe('0')
  cleanup()
  month()
  expect(screen.queryByRole('complementary',{name:'Routines strip'})).toBeNull()
  fireEvent.click(screen.getByRole('button',{name:'Show routines strip'}))
  expect(screen.getByRole('complementary',{name:'Routines strip'})).toBeInTheDocument()
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
  expect(menu()).toEqual(['Plan November early','Show done','Start with a goal · guided introduction','Paper sounds','How this page works'])
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
   expect(stepNow()).toBe('Look back at last month')
   const look=within(screen.getByRole('article',{name:'Looking back at October'}))
   fireEvent.change(look.getByRole('textbox',{name:'What went well'}),{target:{value:'Cabin booked'}})
   await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Save notes'}))})
   expect(review.finish).toHaveBeenCalledWith({wentWell:'Cabin booked',didnt:''})
  }finally{vi.useRealTimers()}
 })
 it('Review October opens on the look back even when the session was left further on',()=>{
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date(2026,9,30,12))
  try{
   atStep('by-area')
   month()
   fireEvent.click(screen.getByRole('button',{name:'Review October'}))
   expect(stepNow()).toBe('Look back at last month')
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
   expect(screen.getByText('Reviewed Oct 31')).toBeInTheDocument()
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
  expect(stepNow()).toBe('Look back at last month')
  await next(4)
  expect(stepNow()).toBe('Maintenance and fun')
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
  expect(seen).toEqual(['Fresh start','Look back at last month','Read the season list','Next 4–5 weeks','The month by area','Maintenance and fun'])
  expect(coach().getByRole('button',{name:'Done planning October'})).toBeInTheDocument()
  expect(chip()).toBe('Planning October · 6 of 6✕')
  // The page's own list, without its strip.
  expect(titles('October goals')).toEqual(['Hike Bear Mountain'])
  expect(screen.queryByRole('region',{name:'Fall strip'})).toBeNull()
  expect(document.querySelector('.hs-layout')).toBeNull()
  expect(guidePanel().getByText('Maintenance and fun')).toBeInTheDocument()
  expect(shell.reg).toMatchObject({level:'month',token:'2026-10',threadKey:'monthly:2026-10'})
  expect(shell.reg?.sessionContext.guide.aboveLines).toEqual([{id:'s',title:'Get outside'}])
 })
 it('Next 4–5 weeks opens the calendar and the tooltip points at it; Stop planning gives the folds back as they were left',async()=>{
  at(new Date(2026,9,17,12)); onTestFinished(()=>{vi.useRealTimers()})
  localStorage.setItem('symphony-fold:month','open')
  month('&plan=1')
  expect(aboveOpen()).toBe(true)
  await next(3)
  expect(stepNow()).toBe('Next 4–5 weeks')
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
  expect(stepNow()).toBe('Look back at last month')
  // This page stays November's; the sheet beside it is October, looking back.
  expect(titles('November goals')).toEqual(['Book flights'])
  expect(aboveOpen()).toBe(true)
  const october=within(screen.getByRole('region',{name:'October 2026, looking back'}))
  expect(october.getByRole('article',{name:'Looking back at October'})).toBeInTheDocument()
  expect(within(october.getByRole('list',{name:'Open from October'})).getAllByRole('listitem').map((li)=>li.getAttribute('aria-label'))).toEqual(['Hike Bear Mountain'])
  // The only sheet beside you that takes a choice: exactly these four.
  expect(within(october.getByRole('listitem',{name:'Hike Bear Mountain'})).getAllByRole('button').map((b)=>b.textContent)).toEqual(['Done','To November','Someday','Let go'])
  expect(october.getByText('Only here, while planning, does the sheet beside you take a choice. To and Someday act on October only. Let go takes it off every list.')).toBeInTheDocument()
  expect(document.querySelector('.ribbon-card')).toBeNull()
  expect(shell.reg).toMatchObject({level:'month',token:'2026-11',stepId:'look-back'})
  await act(async()=>{fireEvent.click(coach().getByRole('button',{name:'Next'}))})
  expect(screen.queryByRole('region',{name:'October 2026, looking back'})).toBeNull()
  expect(within(screen.getByRole('region',{name:'Fall 2026, for reading'})).getByText('Get outside')).toBeInTheDocument()
  expect(screen.getByRole('region',{name:'Planning November'})).toBeInTheDocument()
  expect(shell.reg).toMatchObject({token:'2026-11',threadKey:'monthly:2026-11'})
 })
 // Task 2 (planning as tooltips): this step's editor drew in the ribbon's drop card,
 // which is gone; it comes back as a permanent section on the page. Re-point this
 // test there.
 it.skip('Fresh start changes the app’s scenery and keeps it as the month’s',async()=>{
  at(new Date(2026,9,17,12)); onTestFinished(()=>{vi.useRealTimers()})
  month('&plan=1')
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:/Densely Urban/}))})
  expect(place.setPlace).toHaveBeenCalledWith('urban')
  expect(notesStore.patches.some((x)=>x.p.scenery==='urban')).toBe(true)
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
 // Task 2 (planning as tooltips): this step's editor drew in the ribbon's drop card,
 // which is gone; it comes back as a permanent section on the page. Re-point this
 // test there.
 it.skip('Maintenance and fun: the monthly routines and the month’s fun lines; a fun line is added from what is typed',async()=>{
  at(new Date(2026,9,17,12)); onTestFinished(()=>{vi.useRealTimers()})
  api.tasks=[{id:'f',title:'Ice skating downtown',bucket:'month',monthStart:OCT,isFun:true},{id:'w',title:'File the taxes',bucket:'month',monthStart:OCT}]
  atStep('upkeep-fun')
  month('&plan=1')
  expect(within(screen.getByRole('list',{name:'Fun in October'})).getAllByRole('listitem').map((li)=>li.textContent)).toEqual(['Ice skating downtown'])
  expect(screen.getByText('No monthly routines.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'+ Add something fun'}))
  const field=screen.getByRole('textbox',{name:'Something fun in October'})
  fireEvent.change(field,{target:{value:'Corn maze'}})
  await act(async()=>{fireEvent.submit(field.closest('form')!)})
  expect(api.addTask).toHaveBeenCalledWith('Corn maze',undefined,undefined,undefined,expect.objectContaining({bucket:'month',monthStart:OCT,isFun:true}))
 })
 it('Stop planning writes nothing and keeps where the session is',async()=>{
  at(new Date(2026,9,17,12)); onTestFinished(()=>{vi.useRealTimers()})
  atStep('next-weeks')
  month('&plan=1')
  stop()
  expect(screen.getByTestId('where').textContent).not.toContain('plan=1')
  expect(notesStore.patches).toHaveLength(0)
  expect(plan.save).not.toHaveBeenCalled()
  expect(document.querySelector('.hs-layout')).not.toBeNull()
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
  expect(stepNow()).toBe('Look back at last season')
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
  expect(stepNow()).toBe('Choose from the year')
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
 // Task 2 (planning as tooltips): this step's editor drew in the ribbon's drop card,
 // which is gone; it comes back as a permanent section on the page. Re-point this
 // test there.
 it.skip('Choose from the year: the year beside Fall to read, its goals with nothing to press; Someday (not what was let go) can be put on Fall; neither marks Fall planned',async()=>{
  inSession()
  api.tasks=[{id:'s',title:'Unhurried weekends',bucket:'quarter',goalId:'g'},{id:'sd',title:'Learn to sail',bucket:'someday'},
   {id:'lg',title:'Buy a boat',bucket:'someday',dismissedAt:new Date(2026,9,1)}]
  api.keepForward.mockResolvedValue('sd')
  atStep('from-year')
  season('&plan=1')
  expect(aboveOpen()).toBe(true)
  const card=within(screen.getByRole('region',{name:'Choose from the year'}))
  const year=within(card.getByRole('list',{name:'2026 goals'}))
  expect(year.getAllByRole('listitem').map((li)=>li.getAttribute('aria-label'))).toEqual(['Together','Health'])
  expect(year.queryAllByRole('button')).toHaveLength(0)
  expect(card.queryByText(/On Fall/)).toBeNull()
  fireEvent.click(card.getByRole('button',{name:'Someday · 1'}))
  expect(card.queryByText('Buy a boat')).toBeNull()
  await act(async()=>{fireEvent.click(card.getByRole('button',{name:'Fall: Learn to sail'}))})
  expect(api.keepForward).toHaveBeenCalledWith('sd',{seasonStart:FALL})
  expect(api.addTask).not.toHaveBeenCalled()
  expect(plannedMarks()).toHaveLength(0)
 })
 // Task 2 (planning as tooltips): this step's editor drew in the ribbon's drop card,
 // which is gone; it comes back as a permanent section on the page. Re-point this
 // test there.
 it.skip('Choose from the year reads the year the season is named for, however it was opened (walk 2026-11-02)',()=>{
  at(new Date(2027,0,15,12)); onTestFinished(()=>{vi.useRealTimers()})
  api.goals=[{id:'g26',name:'Calmer mornings',year:2026,status:'active',context:'personal'},{id:'g27',name:'Learn Spanish',year:2027,status:'active',context:'personal'}]
  for(const start of ['2026-12-01','2027-01-15']){
   atStep('from-year')
   open(`/season?view=constellation&horizon=1&start=${start}&plan=1`)
   const year=within(screen.getByRole('list',{name:'2026 goals'}))
   expect(year.getByRole('listitem',{name:'Calmer mornings'})).toBeInTheDocument()
   expect(year.queryByRole('listitem',{name:'Learn Spanish'})).toBeNull()
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
 // Task 2 (planning as tooltips): this step's editor drew in the ribbon's drop card,
 // which is gone; it comes back as a permanent section on the page. Re-point this
 // test there.
 it.skip('Energy check saves the season’s energy note',async()=>{
  inSession()
  atStep('energy')
  season('&plan=1')
  await act(async()=>{fireEvent.click(screen.getByRole('radio',{name:'Medium'}))})
  expect(notesStore.patches.map((x)=>x.p)).toContainEqual({energy:{level:'medium'}})
  expect(screen.getByRole('radio',{name:'Medium'})).toBeChecked()
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
 // Task 2 (planning as tooltips): this step's editor drew in the ribbon's drop card,
 // which is gone; it comes back as a permanent section on the page. Re-point this
 // test there.
 it.skip('Ideal week: blocks typed here save into the season’s notes, a goal block naming one of Fall’s open goals',async()=>{
  inSession()
  api.tasks=[{id:'s',title:'Unhurried weekends',bucket:'quarter',goalId:'g'},{id:'d',title:'Paint the porch',bucket:'quarter',completed:true,completedAt:new Date(2026,9,9)}]
  atStep('ideal-week')
  season('&plan=1')
  expect(screen.getByText(/of 168h left/)).toBeInTheDocument()
  expect(within(screen.getByLabelText('Goal for new block')).getAllByRole('option').map((o)=>o.textContent)).toEqual(['Not a goal','Unhurried weekends'])
  fireEvent.change(screen.getByLabelText('Label for new block'),{target:{value:'Long walks'}})
  fireEvent.change(screen.getByLabelText('Hours for new block'),{target:{value:'4h'}})
  fireEvent.change(screen.getByLabelText('Goal for new block'),{target:{value:'s'}})
  await act(async()=>{fireEvent.blur(screen.getByLabelText('Goal for new block'))})
  const saved=notesStore.patches.map((x)=>x.p.idealWeek).filter(Boolean)
  expect(saved).toEqual([{blocks:[expect.objectContaining({label:'Long walks',hours:4,goalId:'s'})]}])
  expect(screen.getByLabelText('Label for Long walks')).toBeInTheDocument()
 })
 // Task 2 (planning as tooltips): this step's editor drew in the ribbon's drop card,
 // which is gone; it comes back as a permanent section on the page. Re-point this
 // test there.
 it.skip('Wild cards: the cards turned on are kept in the season’s notes; no lines are written for them',async()=>{
  inSession()
  atStep('wild-cards')
  season('&plan=1')
  await act(async()=>{fireEvent.click(screen.getByRole('checkbox',{name:'Travel'}))})
  await act(async()=>{fireEvent.click(screen.getByRole('checkbox',{name:'Money'}))})
  expect(notesStore.patches.map((x)=>x.p.wildCards).filter(Boolean)).toEqual([['travel'],['money','travel']])
  expect(api.addTask).not.toHaveBeenCalled()
 })
 it('the everyday Season page shows the ideal week once it has blocks',()=>{
  inSession()
  api.tasks=[{id:'s',title:'Unhurried weekends',bucket:'quarter',goalId:'g'}]
  season()
  expect(screen.queryByRole('region',{name:'Ideal week'})).toBeNull()
  cleanup()
  notesStore.notes={idealWeek:{blocks:[{id:'b1',label:'Sleep',hours:56},{id:'b2',label:'Long walks',hours:4,goalId:'s'}]}}
  season()
  const iw=within(screen.getByRole('region',{name:'Ideal week'}))
  expect(iw.getByText(/Unhurried weekends/)).toBeInTheDocument()
  expect(iw.getByText('108h')).toBeInTheDocument()
  expect(iw.queryByRole('textbox')).toBeNull()
 })
})

describe('planning a year: the guided session (spec 2026-11-01)',()=>{
 // 2026, planned on Oct 17; the year before is 2025. Seasons here: Spring
 // Mar 1, Summer Jun 1, Fall Sep 1, Winter Dec 1 — the next one is Winter.
 const plannedMarks=()=>notesStore.patches.filter((x)=>(x.p.guide as any)?.plannedAt)
 const inSession=()=>{at(new Date(2026,9,17,12)); onTestFinished(()=>{vi.useRealTimers()})}
 const year=()=>open('/year?view=constellation&start=2026-10-09&plan=1')
 const everyday=()=>open('/year?view=constellation&start=2026-10-09')
 it('the everyday Year page shows the vision and the landscape only once saved; Edit opens the session on that step',()=>{
  inSession()
  everyday()
  expect(screen.queryByRole('region',{name:'Vision'})).toBeNull()
  expect(screen.queryByRole('region',{name:'Landscape'})).toBeNull()
  cleanup()
  notesStore.notes={vision:{tenYears:'A slow morning by the lake'},landscape:[{month:3,text:'a\nb\nc'}]}
  everyday()
  const vision=within(screen.getByRole('region',{name:'Vision'}))
  expect(vision.getByText('A slow morning by the lake')).toBeInTheDocument()
  expect(vision.queryByRole('textbox')).toBeNull()
  const land=within(screen.getByRole('region',{name:'Landscape'}))
  expect(land.getByText('Crowded')).toBeInTheDocument()
  expect(vision.getByRole('link',{name:'Edit'}).getAttribute('href')).toMatch(/plan=1&step=vision/)
  fireEvent.click(land.getByRole('link',{name:'Edit'}))
  expect(screen.getByRole('region',{name:'Planning 2026'})).toBeInTheDocument()
  expect(stepNow()).toBe('Map the 12 months')
 })
 it('seven steps, one tooltip each; the look back turns the sheet beside 2026 to 2025',()=>{
  inSession()
  year()
  expect(coach().getByText('Step 1 of 7')).toBeInTheDocument()
  expect(stepNow()).toBe('Look back at last year')
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
  // Its editor has no card in the session (Task 2 gives it the Year page).
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
 // Task 2 (planning as tooltips): this step's editor drew in the ribbon's drop card,
 // which is gone; it comes back as a permanent section on the page. Re-point this
 // test there.
 it.skip('Picture 5–10 years out saves the vision into the year’s notes, in Scott’s words',async()=>{
  inSession()
  atStep('vision')
  year()
  const day=screen.getByRole('textbox',{name:'An ordinary day ten years from now'})
  expect(day).toHaveValue('')
  fireEvent.change(day,{target:{value:'Coffee on the porch, then the workshop'}})
  await act(async()=>{fireEvent.blur(day)})
  expect(notesStore.patches.map((x)=>x.p)).toContainEqual({vision:{tenYears:'Coffee on the porch, then the workshop'}})
  expect(screen.getByRole('textbox',{name:'What would make 2026 a success'})).toHaveValue('')
 })
 // Task 2 (planning as tooltips): this step's editor drew in the ribbon's drop card,
 // which is gone; it comes back as a permanent section on the page. Re-point this
 // test there.
 it.skip('Map the 12 months saves each month’s lines, and marks a month crowded',async()=>{
  inSession()
  atStep('landscape')
  year()
  const july=screen.getByRole('textbox',{name:'July'})
  fireEvent.change(july,{target:{value:'Beach week\nCamp\nWedding'}})
  await act(async()=>{fireEvent.blur(july)})
  expect(notesStore.patches.map((x)=>x.p)).toContainEqual({landscape:[{month:7,text:'Beach week\nCamp\nWedding'}]})
  expect(within(screen.getByRole('listitem',{name:'July'})).getByText('Crowded')).toBeInTheDocument()
 })
 // Task 2 (planning as tooltips): this step's editor drew in the ribbon's drop card,
 // which is gone; it comes back as a permanent section on the page. Re-point this
 // test there.
 it.skip('Choose life areas: the areas editor, writing through the life areas’ own writers',async()=>{
  inSession()
  lifeAreas.list=[{id:'h',name:'Health',context:'personal',mine:true,sortOrder:0}]
  atStep('areas')
  year()
  expect(screen.getByText(/3 to 8 is typical/)).toBeInTheDocument()
  fireEvent.change(screen.getByRole('textbox',{name:'New area'}),{target:{value:'Money'}})
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Add'}))})
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
 // Task 2 (planning as tooltips): this step's editor drew in the ribbon's drop card,
 // which is gone; it comes back as a permanent section on the page. Re-point this
 // test there.
 it.skip('Refine: goals that overlap, with Keep both, Let go of one, Someday — nothing merges on its own',async()=>{
  inSession()
  api.goals=[...GOALS.map(g=>({...g})),{id:'r1',name:'Family trip to Maine',year:2026,status:'active',context:'personal'},{id:'r2',name:'Maine family trip',year:2026,status:'active',context:'personal'}]
  atStep('refine')
  year()
  const pair=()=>within(screen.getByRole('listitem',{name:'Family trip to Maine and Maine family trip'}))
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
  expect(screen.getByText('Nothing on the list looks alike.')).toBeInTheDocument()
  expect(api.updateGoal.mock.calls.length+api.addTask.mock.calls.length).toBe(writes)
  expect(notesStore.patches.map((x)=>x.p)).toContainEqual({keptPairs:[['r1','r2']]})
  expect(api.deleteGoal).not.toHaveBeenCalled()
  expect(plannedMarks()).toHaveLength(0)
 })
 // Task 2 (planning as tooltips): this step's editor drew in the ribbon's drop card,
 // which is gone; it comes back as a permanent section on the page. Re-point this
 // test there.
 it.skip('Refine: a pair kept in an earlier session does not come back',()=>{
  inSession()
  api.goals=[...GOALS.map(g=>({...g})),{id:'r1',name:'Family trip to Maine',year:2026,status:'active',context:'personal'},{id:'r2',name:'Maine family trip',year:2026,status:'active',context:'personal'}]
  notesStore.notes={guide:{current:'refine',done:[],skipped:[]},keptPairs:[['r1','r2']]}
  year()
  expect(screen.queryByRole('listitem',{name:'Family trip to Maine and Maine family trip'})).toBeNull()
  expect(screen.getByText('Nothing on the list looks alike.')).toBeInTheDocument()
 })
 // Task 2 (planning as tooltips): this step's editor drew in the ribbon's drop card,
 // which is gone; it comes back as a permanent section on the page. Re-point this
 // test there.
 it.skip('Share and book: Scott’s own Work and Personal goals can go to Family after a confirm on the page; the season session is booked on the day he picks',async()=>{
  inSession()
  api.goals=[...GOALS.map(g=>({...g})),{id:'w',name:'Ship the site',year:2026,status:'active',context:'work',userId:'u1'},
   {id:'f',name:'Family trip',year:2026,status:'active',context:'family'},{id:'p2',name:'Iris’s own',year:2026,status:'active',context:'personal',userId:'u2'},
   {id:'x',name:'Finished',year:2026,status:'completed',context:'personal'}]
  atStep('share-book')
  year()
  const goals=within(screen.getByRole('list',{name:'Work and Personal goals'}))
  expect(goals.getAllByRole('listitem').map((li)=>li.getAttribute('aria-label'))).toEqual(['Together','Health','Ship the site'])
  fireEvent.click(goals.getByRole('button',{name:'Share with the family: Together'}))
  expect(api.updateGoal).not.toHaveBeenCalled()
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(goals.getByText('Everyone in the family will see it. Its steps stay yours.')).toBeInTheDocument()
  await act(async()=>{fireEvent.click(goals.getByRole('button',{name:'Share it'}))})
  expect(api.updateGoal).toHaveBeenCalledWith('g',{context:'family'})
  expect(lastRun().label).toBe('Share “Together” with the family')
  await act(async()=>{await lastRun().opts.undo()})
  expect(api.updateGoal).toHaveBeenLastCalledWith('g',{context:'personal'})
  // The season session: nothing but the title is filled in.
  const date=screen.getByLabelText('First season session')
  expect(date).toHaveValue('')
  expect(screen.getByText('Adds “Plan Winter” to that day, for you.')).toBeInTheDocument()
  expect(api.addTask).not.toHaveBeenCalled()
  fireEvent.change(date,{target:{value:'2026-12-05'}})
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Book it'}))})
  expect(api.addTask).toHaveBeenCalledWith('Plan Winter',undefined,undefined,new Date(2026,11,5),expect.objectContaining({isAllDay:true,context:'personal',id:expect.any(String)}))
  expect(lastRun().label).toBe('Add “Plan Winter” to Sat, Dec 5')
  expect(lastRun().opts.undo).toEqual(expect.any(Function))
  expect(plannedMarks()).toHaveLength(0)
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
  expect(within(row('Picnic')).getAllByRole('button').map(b=>b.textContent)).toEqual(['Picnic'])
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

