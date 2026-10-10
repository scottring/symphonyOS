import {fireEvent,render,screen,waitFor} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {vi,it,expect} from 'vitest'
import {AlongsideDay} from './AlongsideDay'
import type {Task} from '@/types/task'
vi.mock('@/hooks/useDomain',()=>({useDomain:()=>({layers:[]})}))
vi.mock('@/hooks/useAssigneeFilter',()=>({useAssigneeFilter:()=>[[]]}))
vi.mock('@/hooks/useFamilyMembers',()=>({useFamilyMembers:()=>({getCurrentUserMember:()=>null})}))
vi.mock('@/lib/today/domainFilter',()=>({filterTasksForLayers:(t:Task[])=>t}))
vi.mock('@/lib/planning/peopleLens',()=>({planPeopleLens:()=>({keep:()=>true,scopeId:null})}))
vi.mock('@/lib/planning/weekList',()=>({weekListTasks:(t:Task[])=>t}))
const date=new Date(2026,9,9)
const task={id:'same-id',title:'Choose picnic spot',createdAt:date,completed:false,sourceId:'month'} as Task
it('places the existing action without replacing its parent link; failed saves can retry',async()=>{
 window.matchMedia=vi.fn().mockReturnValue({matches:false})
 const update=vi.fn().mockResolvedValue(false)
 render(<MemoryRouter><AlongsideDay tasks={[task]} date={date} update={update} loading={false} error={false} retry={()=>{}}><p>Existing calendar and routines</p></AlongsideDay></MemoryRouter>)
 fireEvent.click(screen.getByRole('button',{name:/^Add Choose picnic spot to/}))
 await screen.findByText(/Could not place this action/)
 expect(update).toHaveBeenCalledWith('same-id',{isAllDay:true,scheduledFor:date,bucket:'timed'})
 expect(update.mock.calls[0][1]).not.toHaveProperty('sourceId')
 update.mockResolvedValue(true);fireEvent.click(screen.getByRole('button',{name:/^Add Choose picnic spot to/}))
 await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent('Planned “Choose picnic spot”'))
 expect(screen.getByText('Existing calendar and routines')).toBeVisible()
 fireEvent.click(screen.getByRole('button',{name:'Hide this week'}))
 expect(screen.getByRole('button',{name:'Show this week'})).toHaveAttribute('aria-expanded','false')
})
it('uses the same placement for dragging and ignores unrelated drag payloads',async()=>{
 window.matchMedia=vi.fn().mockReturnValue({matches:false})
 const update=vi.fn().mockResolvedValue(true)
 render(<MemoryRouter><AlongsideDay tasks={[task]} date={date} update={update} loading={false} error={false} retry={()=>{}}><p>Day drop area</p></AlongsideDay></MemoryRouter>)
 const target=screen.getByText('Day drop area')
 fireEvent.drop(target,{dataTransfer:{getData:()=>''}})
 expect(update).not.toHaveBeenCalled()
 fireEvent.drop(target,{dataTransfer:{getData:(type:string)=>type==='application/x-symphony-week-action'?'same-id':''}})
 await waitFor(()=>expect(update).toHaveBeenCalledWith('same-id',{isAllDay:true,scheduledFor:date,bucket:'timed'}))
})

it('gives details the weekly choices space, then restores the previous choice',async()=>{
 const {SideColumn}=await import('@/shell/SideColumn')
 window.matchMedia=vi.fn().mockReturnValue({matches:false})
 const view=(selected:boolean)=><MemoryRouter><SideColumn hasSelection={selected} aiOpen={false} pane="details" onPaneChange={()=>{}} onCloseDetails={()=>{}} onCloseAi={()=>{}} ai={null}><AlongsideDay tasks={[task]} date={date} update={vi.fn()} loading={false} error={false} retry={()=>{}}>Today</AlongsideDay></SideColumn></MemoryRouter>
 const {rerender}=render(view(false))
 expect(screen.getByRole('button',{name:/^Add Choose picnic spot to/})).toBeVisible()
 rerender(view(true))
 expect(screen.queryByRole('button',{name:/^Add Choose picnic spot to/})).toBeNull()
 rerender(view(false))
 expect(screen.getByRole('button',{name:/^Add Choose picnic spot to/})).toBeVisible()
 fireEvent.click(screen.getByRole('button',{name:'Hide this week'}))
 rerender(view(true));rerender(view(false))
 expect(screen.getByRole('button',{name:'Show this week'})).toHaveAttribute('aria-expanded','false')
})

it('opens weekly action details without scheduling it',()=>{
 window.matchMedia=vi.fn().mockReturnValue({matches:false})
 const update=vi.fn(),onSelect=vi.fn()
 render(<MemoryRouter><AlongsideDay tasks={[task]} date={date} update={update} onSelect={onSelect} loading={false} error={false} retry={()=>{}}>Today</AlongsideDay></MemoryRouter>)
 fireEvent.click(screen.getByRole('button',{name:'Choose picnic spot'}))
 expect(onSelect).toHaveBeenCalledWith('same-id')
 expect(update).not.toHaveBeenCalled()
})

// Canvas design, 2026-10-10: the same compact list Today's classic column draws.
it('draws the shared compact list: on-day rows marked, done rows behind a reveal, drag payload unchanged',()=>{
 window.matchMedia=vi.fn().mockReturnValue({matches:false})
 const month={id:'month',title:'Plan the autumn picnic',createdAt:date,completed:false} as Task
 const second={id:'second',title:'Buy a blanket',createdAt:date,completed:false,sourceId:'month'} as Task
 const placed={id:'placed',title:'Pack the basket',createdAt:date,completed:false,scheduledFor:date,isAllDay:true} as Task
 const done={id:'done',title:'Pick a date',createdAt:date,completed:true} as Task
 const complete=vi.fn().mockResolvedValue(true)
 render(<MemoryRouter><AlongsideDay tasks={[month,task,second,placed,done]} date={date} update={vi.fn()} complete={complete} loading={false} error={false} retry={()=>{}}>Today</AlongsideDay></MemoryRouter>)
 const list=screen.getByRole('group',{name:'This week’s actions'})
 expect(list).toHaveClass('cw-list')
 const group=screen.getByRole('region',{name:'Plan the autumn picnic'})
 expect(group).toHaveTextContent('Choose picnic spot')
 expect(group).toHaveTextContent('Buy a blanket')
 const onDay=screen.getByText('Pack the basket').closest('li')!
 expect(onDay).toHaveClass('is-on-today')
 expect(screen.queryByRole('button',{name:/^Add Pack the basket/})).toBeNull()
 expect(screen.queryByText('Pick a date')).toBeNull()
 fireEvent.click(screen.getByRole('button',{name:'Show done'}))
 expect(screen.getByText('Pick a date')).toBeInTheDocument()
 const set:Record<string,string>={}
 fireEvent.dragStart(screen.getByText('Choose picnic spot').closest('li')!,{dataTransfer:{setData:(k:string,v:string)=>{set[k]=v},effectAllowed:''}})
 expect(set).toEqual({'application/x-symphony-week-action':'same-id'})
 fireEvent.click(screen.getByRole('button',{name:'Complete Choose picnic spot'}))
 expect(complete).toHaveBeenCalledWith('same-id')
})
