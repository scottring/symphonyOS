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
 fireEvent.click(screen.getByRole('button',{name:/Plan for/}))
 await screen.findByText(/Could not place this action/)
 expect(update).toHaveBeenCalledWith('same-id',{isAllDay:true,scheduledFor:date,bucket:'timed'})
 expect(update.mock.calls[0][1]).not.toHaveProperty('sourceId')
 update.mockResolvedValue(true);fireEvent.click(screen.getByRole('button',{name:/Plan for/}))
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
 expect(screen.getByRole('button',{name:/Plan for/})).toBeVisible()
 rerender(view(true))
 expect(screen.queryByRole('button',{name:/Plan for/})).toBeNull()
 rerender(view(false))
 expect(screen.getByRole('button',{name:/Plan for/})).toBeVisible()
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
