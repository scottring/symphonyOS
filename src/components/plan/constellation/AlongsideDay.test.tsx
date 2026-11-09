import {createEvent,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {DndContext} from '@dnd-kit/core'
import {TodayDayScale} from '@/components/schedule/TodayDayScale'
import {PLAN_MIME} from '@/lib/planning/planDrag'
import {MemoryRouter} from 'react-router-dom'
import {vi,it,expect,beforeEach,onTestFinished} from 'vitest'
import {AlongsideDay} from './AlongsideDay'
import {useAlongsideWorkspace} from './AlongsideContext'
import {useEffect} from 'react'
import type {Task} from '@/types/task'
vi.mock('@/hooks/useDomain',()=>({useDomain:()=>({layers:[]})}))
vi.mock('@/hooks/useAssigneeFilter',()=>({useAssigneeFilter:()=>[[]]}))
vi.mock('@/hooks/useFamilyMembers',()=>({useFamilyMembers:()=>({getCurrentUserMember:()=>null,members:[{id:'iris',name:'Iris',initials:'IR',color:'purple'},{id:'scott',name:'Scott',initials:'SK',color:'blue'}]})}))
vi.mock('@/lib/today/domainFilter',()=>({filterTasksForLayers:(t:Task[])=>t}))
vi.mock('@/lib/planning/peopleLens',()=>({planPeopleLens:()=>({keep:()=>true,scopeId:null})}))
vi.mock('@/lib/planning/weekList',async(orig)=>({...await orig<object>(),// A let-go item is on no week's list (letGo ends its commitments).
 weekListTasks:(t:Task[])=>t.filter((x)=>!x.dismissedAt)}))
vi.mock('@/hooks/useTravelTime',()=>({useTravelTime:()=>null}))
// Fri Oct 9, 2026, in the Sunday-start week Oct 4 – Oct 10.
const date=new Date(2026,9,9)
const task={id:'same-id',title:'Choose picnic spot',createdAt:date,completed:false,sourceId:'month'} as Task
// Reduced motion: the fold jumps to its state, so a tap opens it at once.
beforeEach(()=>{
 localStorage.clear()
 window.matchMedia=vi.fn().mockImplementation((q:string)=>({matches:q.includes('prefers-reduced-motion'),media:q,addEventListener:()=>{},removeEventListener:()=>{}}))
})
const unfold=()=>fireEvent.click(screen.getByRole('button',{name:/Unfold to read$/}))

// Paper-style horizons (Scott, 2026-11-04: "add today with the + on the week
// sheet"): Today's This week column is the week folded beside the day, as on
// every other horizon. Its rows keep their + and their drag onto the day.
it('folds the week beside the day: an edge with the week’s dates and open count, no This week column',()=>{
 const placed={id:'placed',title:'Pack the basket',createdAt:date,completed:false,scheduledFor:date,isAllDay:true} as Task
 const done={id:'done',title:'Pick a date',createdAt:date,completed:true} as Task
 const {container}=render(<MemoryRouter><AlongsideDay tasks={[task,placed,done]} date={date} update={vi.fn()} loading={false} error={false} retry={()=>{}}><p>The day</p></AlongsideDay></MemoryRouter>)
 expect(screen.getByRole('button',{name:'Oct 4 – Oct 10, 1 open. Unfold to read'})).toBeInTheDocument()
 expect(container.querySelector('.paper-fold[data-horizon="day"] > article.paper-fold-current')).toContainElement(screen.getByText('The day'))
 expect(container.querySelector('#ad-week, aside.ad-week')).toBeNull()
 expect(screen.queryByRole('heading',{name:'This week'})).toBeNull()
 expect(screen.queryByRole('button',{name:/this week$/i})).toBeNull()
})

it('unfolded, lists the week’s no-day tasks only, counts the done, and reads the foot',()=>{
 // As the Week page reads it on Friday morning: a day still ahead is a day.
 vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date(2026,9,9,9));onTestFinished(()=>{vi.useRealTimers()})
 const onDay={id:'placed',title:'Pack the basket',createdAt:date,completed:false,scheduledFor:date,isAllDay:true} as Task
 const elsewhere={id:'else',title:'Buy a blanket',createdAt:date,completed:false,scheduledFor:new Date(2026,9,10),isAllDay:true} as Task
 const done={id:'done',title:'Pick a date',createdAt:date,completed:true} as Task
 render(<MemoryRouter><AlongsideDay tasks={[task,onDay,elsewhere,done]} date={date} update={vi.fn()} loading={false} error={false} retry={()=>{}}>Today</AlongsideDay></MemoryRouter>)
 unfold()
 const list=(document.querySelector('.vt-sheet-week .above-sheet-list') as HTMLElement)
 expect(within(list).getAllByRole('listitem').map((li)=>li.querySelector('.above-sheet-row-title')?.textContent)).toEqual(['Choose picnic spot'])
 expect(screen.getByText('Week · Oct 4 – Oct 10')).toBeInTheDocument()
 expect(screen.getByRole('heading',{name:'This week'})).toBeInTheDocument()
 // A day later this week is on the sheet too, under it, with its +.
 expect(within(screen.getByRole('list',{name:'Later this week'})).getByText('Buy a blanket')).toBeInTheDocument()
 expect(screen.getByText('1 done')).toBeInTheDocument()
 expect(screen.getByText('Pick three to five for today.')).toBeInTheDocument()
 expect(localStorage.getItem('symphony-fold:day')).toBe('open')
 expect(screen.getByRole('region',{name:'Oct 4 – Oct 10, to pick from'})).toBeInTheDocument()
})

it('"+" places the existing action without replacing its parent link; failed saves can retry',async()=>{
 const update=vi.fn().mockResolvedValue(false)
 render(<MemoryRouter><AlongsideDay tasks={[task]} date={date} update={update} loading={false} error={false} retry={()=>{}}><p>Existing calendar and routines</p></AlongsideDay></MemoryRouter>)
 unfold()
 fireEvent.click(screen.getByRole('button',{name:'Plan Choose picnic spot for Friday'}))
 await screen.findByText(/Could not place this action/)
 expect(update).toHaveBeenCalledWith('same-id',{isAllDay:true,scheduledFor:date,bucket:'timed'})
 expect(update.mock.calls[0][1]).not.toHaveProperty('sourceId')
 update.mockResolvedValue(true);fireEvent.click(screen.getByRole('button',{name:'Plan Choose picnic spot for Friday'}))
 await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent('Planned “Choose picnic spot”'))
 expect(screen.getByText('Existing calendar and routines')).toBeVisible()
})

it('a row drags onto the day with the same payload, and the day places it; unrelated drops are ignored',async()=>{
 const update=vi.fn().mockResolvedValue(true)
 render(<MemoryRouter><AlongsideDay tasks={[task]} date={date} update={update} loading={false} error={false} retry={()=>{}}><p>Day drop area</p></AlongsideDay></MemoryRouter>)
 unfold()
 const set:Record<string,string>={}
 const row=screen.getByText('Choose picnic spot').closest('li')!
 expect(row).toHaveAttribute('draggable','true')
 fireEvent.dragStart(row,{dataTransfer:{setData:(k:string,v:string)=>{set[k]=v},effectAllowed:''}})
 // Its own payload only: the day's hours do not read it, so it lands with no
 // time (Scott, 2026-11-07).
 expect(set['application/x-symphony-week-action']).toBe('same-id')
 expect(set[PLAN_MIME]).toBeUndefined()
 const target=screen.getByText('Day drop area')
 fireEvent.drop(target,{dataTransfer:{getData:()=>''}})
 expect(update).not.toHaveBeenCalled()
 fireEvent.drop(target,{dataTransfer:{getData:(type:string)=>type==='application/x-symphony-week-action'?'same-id':''}})
 await waitFor(()=>expect(update).toHaveBeenCalledWith('same-id',{isAllDay:true,scheduledFor:date,bucket:'timed'}))
})

// Task 4 (Scott, 2026-11-04): what an earlier day of this week left open is
// back on the sheet, first, marked faintly with its day; + plans it.
it('an open task from earlier this week is first on the sheet, marked with its day; + plans it for the day; done ones stay off',async()=>{
 vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date(2026,9,9,9));onTestFinished(()=>{vi.useRealTimers()})
 const wed={id:'wed',title:'Call the vet',createdAt:date,completed:false,bucket:'timed',scheduledFor:new Date(2026,9,7),isAllDay:true} as Task
 const wedDone={...wed,id:'wed-done',title:'Mail the form',completed:true} as Task
 const letGo={...wed,id:'gone',title:'Let go',dismissedAt:new Date(2026,9,7,20)} as Task
 const update=vi.fn().mockResolvedValue(true)
 render(<MemoryRouter><AlongsideDay tasks={[task,wed,wedDone,letGo]} date={date} update={update} loading={false} error={false} retry={()=>{}}>Today</AlongsideDay></MemoryRouter>)
 expect(screen.getByRole('button',{name:'Oct 4 – Oct 10, 2 open. Unfold to read'})).toBeInTheDocument()
 unfold()
 const rows=within((document.querySelector('.vt-sheet-week .above-sheet-list') as HTMLElement)).getAllByRole('listitem')
 expect(rows.map((li)=>li.querySelector('.above-sheet-row-title')?.textContent)).toEqual(['Call the vet','Choose picnic spot'])
 expect(rows[0].querySelector('.above-sheet-row-mark')).toHaveTextContent('Wed')
 expect(rows[0]).toHaveAttribute('data-guide-anchor','leftovers')
 expect(rows[1].querySelector('.above-sheet-row-mark')).toBeNull()
 fireEvent.click(screen.getByRole('button',{name:'Plan Call the vet for today'}))
 await waitFor(()=>expect(update).toHaveBeenCalledWith('wed',expect.objectContaining({scheduledFor:date,isAllDay:true,bucket:'timed'})))
})

it('a title tap opens the action’s details without scheduling it',()=>{
 const update=vi.fn(),onSelect=vi.fn()
 render(<MemoryRouter><AlongsideDay tasks={[task]} date={date} update={update} onSelect={onSelect} loading={false} error={false} retry={()=>{}}>Today</AlongsideDay></MemoryRouter>)
 unfold()
 fireEvent.click(screen.getByRole('button',{name:'Choose picnic spot'}))
 expect(onSelect).toHaveBeenCalledWith('same-id')
 expect(update).not.toHaveBeenCalled()
})

// A session on the page (walk, 2026-11-01): the week steps aside and the day
// under it is never remounted.
it('a session stows the fold and keeps the day mounted',()=>{
 const view=(stepAside:boolean)=><MemoryRouter><AlongsideDay tasks={[task]} date={date} update={vi.fn()} loading={false} error={false} retry={()=>{}} stepAside={stepAside}><input aria-label="Day field" /></AlongsideDay></MemoryRouter>
 const {rerender}=render(view(false))
 const field=screen.getByRole('textbox',{name:'Day field'})
 expect(screen.getByRole('button',{name:/Unfold to read$/})).toBeInTheDocument()
 rerender(view(true))
 expect(screen.queryByRole('button',{name:/Unfold to read$/})).toBeNull()
 expect(screen.getByRole('textbox',{name:'Day field'})).toBe(field)
})

it('the Week page’s workspace has no fold of its own',()=>{
 render(<MemoryRouter><AlongsideDay tasks={[task]} date={date} update={vi.fn()} loading={false} error={false} retry={()=>{}} weekView><p>Week</p></AlongsideDay></MemoryRouter>)
 expect(screen.getByText('Week')).toBeInTheDocument()
 expect(document.querySelector('.paper-fold')).toBeNull()
})

// The guide's Today step (restored, Task 5c): Today asks the workspace to
// open the week beside the day for the step, without remembering it.
it('the day can drive the week open for a while; letting go returns it to what was remembered',()=>{
 function Day({open}:{open?:boolean}){const ws=useAlongsideWorkspace();useEffect(()=>{ws?.driveWeek(open)},[ws,open]);return <p>The day</p>}
 const view=(open?:boolean)=><MemoryRouter><AlongsideDay tasks={[task]} date={date} update={vi.fn()} loading={false} error={false} retry={()=>{}}><Day open={open}/></AlongsideDay></MemoryRouter>
 const {rerender}=render(view())
 expect(screen.getByRole('button',{name:/Unfold to read$/})).toHaveAttribute('aria-expanded','false')
 rerender(view(true))
 expect(screen.getByRole('button',{name:'Fold Oct 4 – Oct 10 away'})).toHaveAttribute('aria-expanded','true')
 expect(localStorage.getItem('symphony-fold:day')).toBeNull()
 rerender(view(undefined))
 expect(screen.getByRole('button',{name:/Unfold to read$/})).toHaveAttribute('aria-expanded','false')
})

// Pre-ship follow-up: a + (or a drop on the day) that saved tells the day,
// so the Day session's Pick step counts it as a pick, as Today's own sheet does.
it('a placement that saved is heard by the day; one that failed is not',async()=>{
 const heard=vi.fn()
 function Day(){const ws=useAlongsideWorkspace();useEffect(()=>ws?.listenPlaced(heard),[ws]);return <p>The day</p>}
 const update=vi.fn().mockResolvedValue(false)
 render(<MemoryRouter><AlongsideDay tasks={[task]} date={date} update={update} loading={false} error={false} retry={()=>{}}><Day/></AlongsideDay></MemoryRouter>)
 unfold()
 fireEvent.click(screen.getByRole('button',{name:'Plan Choose picnic spot for Friday'}))
 await screen.findByText(/Could not place this action/)
 expect(heard).not.toHaveBeenCalled()
 update.mockResolvedValue(true)
 fireEvent.click(screen.getByRole('button',{name:'Plan Choose picnic spot for Friday'}))
 await waitFor(()=>expect(heard).toHaveBeenCalledTimes(1))
})

// Scott, 2026-11-07: a task gets a time only when it is certain to be done
// then. A week row dropped on the day's hours is placed for the day with no
// time, the same as anywhere else on the day (it was timed, 2026-11-04).
it('a week row dropped on the day’s hours is placed for the day with no time; the hours take no drop of it',async()=>{
 const update=vi.fn().mockResolvedValue(true),onPlanDrop=vi.fn()
 render(<MemoryRouter><AlongsideDay tasks={[task]} date={date} update={update} loading={false} error={false} retry={()=>{}}>
  <DndContext><TodayDayScale items={[]} viewedDate={date} now={null} isMobile={false} selectedItemId={null} peopleOf={()=>[]} isReadOnlyEvent={()=>false} onSelect={vi.fn()} onPlanDrop={onPlanDrop}/></DndContext>
 </AlongsideDay></MemoryRouter>)
 unfold()
 const data:Record<string,string>={}
 fireEvent.dragStart(screen.getByText('Choose picnic spot').closest('li')!,{dataTransfer:{setData:(k:string,v:string)=>{data[k]=v},effectAllowed:''}})
 const dataTransfer={types:Object.keys(data),getData:(k:string)=>data[k]??'',dropEffect:'none'}
 const track=screen.getByTestId('today-day-scale')
 track.getBoundingClientRect=()=>({top:100,left:0,right:400,bottom:800,width:400,height:700,x:0,y:100,toJSON:()=>({})})
 const drop=createEvent.drop(track,{dataTransfer})
 Object.defineProperty(drop,'clientY',{value:100+8*48})
 fireEvent(track,drop)
 expect(onPlanDrop).not.toHaveBeenCalled()
 await waitFor(()=>expect(update).toHaveBeenCalledWith('same-id',{isAllDay:true,scheduledFor:date,bucket:'timed'}))
})

it('a routine row (plan payload) dropped on the day’s hours reaches the grid’s timed placement, not the day’s untimed one',()=>{
 const update=vi.fn(),onPlanDrop=vi.fn()
 render(<MemoryRouter><AlongsideDay tasks={[]} date={date} update={update} loading={false} error={false} retry={()=>{}}>
  <DndContext><TodayDayScale items={[]} viewedDate={date} now={null} isMobile={false} selectedItemId={null} peopleOf={()=>[]} isReadOnlyEvent={()=>false} onSelect={vi.fn()} onPlanDrop={onPlanDrop}/></DndContext>
 </AlongsideDay></MemoryRouter>)
 const payload={kind:'routine',id:'r-walk',date:'2026-10-09',title:'Walk Jax'}
 const dataTransfer={types:[PLAN_MIME],getData:(k:string)=>k===PLAN_MIME?JSON.stringify(payload):'',dropEffect:'none'}
 const track=screen.getByTestId('today-day-scale')
 track.getBoundingClientRect=()=>({top:100,left:0,right:400,bottom:800,width:400,height:700,x:0,y:100,toJSON:()=>({})})
 const drop=createEvent.drop(track,{dataTransfer})
 Object.defineProperty(drop,'clientY',{value:100+8*48})
 fireEvent(track,drop)
 expect(onPlanDrop.mock.calls[0][0]).toEqual(payload)
 expect(onPlanDrop.mock.calls[0][1].getHours()).toBe(15)
 expect(update).not.toHaveBeenCalled()
})

// Scott, 2026-11-08: Today's week sheet reads in the Week list's priority (the
// shared sort_order), and a row dragged among the rows takes that place.
it('lists the week in the shared order, and a drag among the rows reorders it',async()=>{
 vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date(2026,9,9,9));onTestFinished(()=>{vi.useRealTimers()})
 const a={id:'a',title:'Written first',createdAt:new Date(2026,9,5),completed:false} as Task
 const b={id:'b',title:'Ordered second',createdAt:new Date(2026,9,6),completed:false,sortOrder:1000} as Task
 const c={id:'c',title:'Ordered first',createdAt:new Date(2026,9,7),completed:false,sortOrder:0} as Task
 const update=vi.fn(async()=>true)
 render(<MemoryRouter><AlongsideDay tasks={[a,b,c]} date={date} update={update} loading={false} error={false} retry={()=>{}}>Today</AlongsideDay></MemoryRouter>)
 unfold()
 const list=document.querySelector('.vt-sheet-week .above-sheet-list') as HTMLElement
 const rows=within(list).getAllByRole('listitem')
 expect(rows.map((li)=>li.querySelector('.above-sheet-row-title')?.textContent)).toEqual(['Ordered first','Ordered second','Written first'])
 // Rows are 20px tall from y=0; "Written first" let go above the first row.
 rows.forEach((li,i)=>{li.getBoundingClientRect=()=>({top:i*20,bottom:i*20+20,left:0,right:100,width:100,height:20,x:0,y:i*20,toJSON:()=>({})}) as DOMRect})
 const data:Record<string,string>={}
 const dataTransfer={setData:(k:string,v:string)=>{data[k]=v},getData:(k:string)=>data[k]??'',types:[] as string[],effectAllowed:'',dropEffect:''}
 fireEvent.dragStart(rows[2],{dataTransfer})
 const at=(ev:Event)=>{Object.defineProperty(ev,'clientY',{value:2});Object.defineProperty(ev,'dataTransfer',{value:dataTransfer});return ev}
 fireEvent(list,at(createEvent.dragOver(list)))
 fireEvent(list,at(createEvent.drop(list)))
 // Above an ordered first row: one write, a gap above it.
 await waitFor(()=>expect(update).toHaveBeenCalledWith('a',{sortOrder:-1000}))
 expect(update).toHaveBeenCalledTimes(1)
})

it('the workspace’s week sheet shows the first five tasks and folds the rest',()=>{
 const many=Array.from({length:19},(_,i)=>({id:`m${i}`,title:`Task ${i+1}`,createdAt:date,completed:false,sourceId:'month'}) as Task)
 render(<MemoryRouter><AlongsideDay tasks={many} date={date} update={vi.fn()} loading={false} error={false} retry={()=>{}}>Today</AlongsideDay></MemoryRouter>)
 unfold()
 expect(within(document.querySelector('.vt-sheet-week .above-sheet-list') as HTMLElement).getAllByRole('listitem')).toHaveLength(5)
 expect(screen.getByRole('button',{name:'14 more'})).toBeInTheDocument()
})

it('checks a week task off from the sheet, and Undo is the same toggle',async()=>{
 const complete=vi.fn(async()=>true)
 render(<MemoryRouter><AlongsideDay tasks={[task]} date={date} update={vi.fn()} complete={complete} loading={false} error={false} retry={()=>{}}>Today</AlongsideDay></MemoryRouter>)
 unfold()
 fireEvent.click(screen.getByRole('button',{name:'Mark Choose picnic spot complete'}))
 await waitFor(()=>expect(complete).toHaveBeenCalledWith('same-id'))
})

it('shows who a week task is for, and assigns from the sheet with Undo data',async()=>{
 const update=vi.fn(async()=>true)
 const assigned={...task,assignedToAll:['iris'],assignedTo:'iris'} as Task
 render(<MemoryRouter><AlongsideDay tasks={[assigned]} date={date} update={update} loading={false} error={false} retry={()=>{}}>Today</AlongsideDay></MemoryRouter>)
 unfold()
 const row=screen.getByRole('button',{name:/^Assign people to Choose picnic spot/})
 expect(row).toHaveTextContent('IR')
 fireEvent.click(row)
 fireEvent.click(screen.getByRole('menuitemcheckbox',{name:/Scott/}))
 await waitFor(()=>expect(update).toHaveBeenCalledWith('same-id',{assignedToAll:['iris','scott'],assignedTo:'iris'}))
})

it('the workspace’s week sheet lies wide enough for its checks, people and +',()=>{
 render(<MemoryRouter><AlongsideDay tasks={[task]} date={date} update={vi.fn()} loading={false} error={false} retry={()=>{}}>Today</AlongsideDay></MemoryRouter>)
 expect(document.querySelector<HTMLElement>('.paper-fold-flap')?.style.width).toBe('357px')
})
