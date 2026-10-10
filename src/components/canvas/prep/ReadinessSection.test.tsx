import {describe,it,expect,vi,beforeEach} from 'vitest'
import {render,screen,fireEvent,within,waitFor} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {ReadinessSection,ASK_WHAT_I_NEED} from './ReadinessSection'
import type {Task} from '@/types/task'
import type {Contact} from '@/types/contact'
const launcher=vi.hoisted(()=>({openAssistant:vi.fn()}))
const files=vi.hoisted(()=>({list:vi.fn()}))
vi.mock('@/contexts/AssistantLaunchContext',()=>({useAssistantLauncher:()=>launcher}))
vi.mock('@/lib/taskAttachments',()=>({listAttachments:files.list}))
const t=(id:string,rest:Partial<Task>={})=>({id,title:id,...rest} as Task)
const cami={id:'cami',name:'Cami',phone:'(413) 555-0142',email:'cami@school.org'} as Contact
function show(task:Task,extra:{allTasks?:Task[];contacts?:Contact[]}={}){
 const handlers={onToggleStep:vi.fn(),onOpenTask:vi.fn(),onDirections:vi.fn(),onAdd:vi.fn()}
 render(<MemoryRouter><ReadinessSection task={task} allTasks={extra.allTasks??[task]} contacts={extra.contacts??[]} files={[]} {...handlers}/></MemoryRouter>)
 return handlers
}
beforeEach(()=>{vi.clearAllMocks();files.list.mockResolvedValue([])})

describe('What you’ll need',()=>{
 it('a bare task shows only the add chips, which open the existing editors',()=>{
  const h=show(t('bare'))
  expect(screen.queryByRole('list')).not.toBeInTheDocument()
  const chips=within(screen.getByRole('group',{name:'Add what you’ll need'})).getAllByRole('button').map(b=>b.textContent)
  expect(chips).toEqual(['+ Contact','+ Link','+ Place','+ Note','+ Supplies or steps','+ File'])
  fireEvent.click(screen.getByRole('button',{name:'+ Supplies or steps'}))
  expect(h.onAdd).toHaveBeenCalledWith('subtask')
 })
 it('“Call Cami” carries the contact with Call, Message and Email, plus its questions',()=>{
  show(t('call',{title:'Call Cami',contactId:'cami',notes:'Pickup time?\nCarpool on Fridays?\nForms due?'}),{contacts:[cami]})
  expect(screen.getByRole('link',{name:'Call Cami'})).toHaveAttribute('href','tel:4135550142')
  expect(screen.getByRole('link',{name:'Message Cami'})).toHaveAttribute('href','sms:4135550142')
  expect(screen.getByRole('link',{name:'Email Cami'})).toHaveAttribute('href','mailto:cami@school.org')
  expect(screen.getByText(/Pickup time\?/)).toBeInTheDocument()
  expect(screen.queryByText(/Forms due/)).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'More'}))
  expect(screen.getByText(/Forms due/)).toBeInTheDocument()
  expect(screen.queryByRole('button',{name:'+ Contact'})).not.toBeInTheDocument()
  expect(screen.queryByRole('button',{name:'+ Note'})).not.toBeInTheDocument()
  expect(screen.getByRole('button',{name:'+ Link'})).toBeInTheDocument()
 })
 it('lists place, links and steps with their tools, and hides kinds the task lacks',()=>{
  const h=show(t('go',{location:'12 Elm St',links:[{url:'https://www.example.org/list'}],subtasks:[t('s1',{title:'Glue sticks'}),t('s2',{title:'Folders',completed:true})]}))
  fireEvent.click(screen.getByRole('button',{name:'Directions'}));expect(h.onDirections).toHaveBeenCalled()
  expect(screen.getByRole('link',{name:'Open example.org'})).toHaveAttribute('target','_blank')
  expect(screen.getByText('1 of 2')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('checkbox',{name:'Glue sticks'}));expect(h.onToggleStep).toHaveBeenCalledWith('s1')
  expect(screen.queryByText(/Call/)).not.toBeInTheDocument()
 })
 it('shows what the plan above carries, read-only, with a way to open it',async()=>{
  files.list.mockImplementation(async(_type:string,id:string)=>id==='month'?[{id:'f1',fileName:'list.pdf',url:'https://files.test/list.pdf',documentLabel:null}]:[])
  const month=t('month',{title:'Classroom ready',links:[{url:'https://supplies.test',title:'Supply list'}]})
  const week=t('week',{title:'Shop for class supplies',sourceId:'month'})
  const h=show(week,{allTasks:[week,month]})
  const from=screen.getByRole('group',{name:'From Classroom ready'})
  expect(within(from).getByRole('link',{name:'Open Supply list'})).toHaveAttribute('href','https://supplies.test')
  await waitFor(()=>expect(within(from).getByRole('link',{name:'Open list.pdf'})).toBeInTheDocument())
  fireEvent.click(within(from).getByRole('button',{name:'Classroom ready'}))
  expect(h.onOpenTask).toHaveBeenCalledWith('month')
  expect(week.links).toBeUndefined()
 })
 it('asks Symphony what this task will need',()=>{
  show(t('x'))
  fireEvent.click(screen.getByRole('button',{name:'Ask what I’ll need'}))
  expect(launcher.openAssistant).toHaveBeenCalledWith({message:ASK_WHAT_I_NEED,autoSend:true})
 })
})
