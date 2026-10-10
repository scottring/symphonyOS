import {render,screen,fireEvent,waitFor} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {beforeEach,describe,it,expect,vi} from 'vitest'
import {ConstellationPage} from './ConstellationPage'
const api=vi.hoisted(()=>({addGoal:vi.fn(),updateGoal:vi.fn(),addTask:vi.fn(),updateTask:vi.fn(),refetch:vi.fn(),pushTask:vi.fn(),setBucket:vi.fn(),updateTasksBulk:vi.fn(),toggleTask:vi.fn(),deleteTask:vi.fn(),keepForward:vi.fn(),dropCommitment:vi.fn(),tasks:[] as any[]}))
vi.mock('@/contexts/GoalsContext',()=>({GoalsProvider:({children}:any)=>children,useGoalsContext:()=>({goals:[{id:'g',name:'Together',year:2026,status:'active',context:'personal'},{id:'other',name:'Health',year:2026,status:'active',context:'personal'}],loading:false,...api})}))
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
function open(){render(<MemoryRouter initialEntries={['/year?view=constellation&start=2026-10-09']}><ConstellationPage/></MemoryRouter>)}
beforeEach(()=>{vi.clearAllMocks();api.tasks=[];HTMLElement.prototype.scrollIntoView=vi.fn();HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')};HTMLDialogElement.prototype.close=function(){this.removeAttribute('open')}})
describe('connected Constellation saves',()=>{
 it('retains wording on failed create and locks period while composing',async()=>{
 api.addGoal.mockResolvedValue(null);open();fireEvent.click(screen.getByText('+ Add an independent yearly intention'))
 fireEvent.change(screen.getByLabelText('Wording'),{target:{value:'A meaningful year'}})
 expect(screen.getByLabelText('Planning date')).toBeDisabled()
 fireEvent.click(screen.getByRole('button',{name:'Save',exact:true}))
 await screen.findByText('Could not save. Your wording is still here; try again.')
 expect(screen.getByLabelText('Wording')).toHaveValue('A meaningful year')
 api.addGoal.mockResolvedValue({id:'new'});fireEvent.click(screen.getByRole('button',{name:'Save',exact:true}))
 await waitFor(()=>expect(screen.queryByLabelText('Wording')).not.toBeInTheDocument())
 expect(api.addGoal).toHaveBeenLastCalledWith(null,'A meaningful year','personal',expect.objectContaining({year:2026,id:expect.any(String)}))
 })
 it('creates seasonal child in one write with annual link and context',async()=>{
 api.addTask.mockResolvedValue('new');open();fireEvent.click(screen.getByRole('button',{name:/Together/,pressed:false}))
 fireEvent.click(screen.getByText('+ Add a seasonal goal'));fireEvent.change(screen.getByLabelText('Wording'),{target:{value:'Unhurried weekends'}})
 fireEvent.click(screen.getByRole('button',{name:'Save',exact:true}));await screen.findByText('Saved to your plan.')
 expect(api.addTask).toHaveBeenCalledWith('Unhurried weekends',undefined,undefined,undefined,expect.objectContaining({bucket:'quarter',goalId:'g',context:'personal',seasonStart:new Date(2026,8,1)}))
 })
})

it('selects the saved intention from the conversation and refreshes later saves',()=>{
 HTMLElement.prototype.scrollIntoView=vi.fn()
 render(<MemoryRouter initialEntries={['/year?view=constellation&start=2026-10-09&focus=0:g']}><ConstellationPage/></MemoryRouter>)
 expect(screen.getByRole('button',{name:/Together Saved to your plan/,pressed:true})).toBeInTheDocument()
 expect(screen.getByRole('region',{name:'Selected plan item'})).toHaveTextContent('Together')
 fireEvent(window,new Event('symphony-plan-updated'))
 expect(api.refetch).toHaveBeenCalledTimes(1)
})

it('focuses a clicked branch and restores unrelated plans without changing data',()=>{
 open()
 fireEvent.click(screen.getByRole('button',{name:/Together/,pressed:false}))
 expect(screen.queryByRole('button',{name:/Health/,pressed:false})).not.toBeInTheDocument()
 expect(screen.getByText(/1 hidden/)).toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'Show all plans'}))
 expect(screen.getByRole('button',{name:/Health/,pressed:false})).toBeInTheDocument()
 expect(api.updateTask).not.toHaveBeenCalled()
 expect(api.updateGoal).not.toHaveBeenCalled()
})


it('links an existing milestone and preserves selection on failed save',async()=>{
 api.tasks=[{id:'s',title:'Autumn outings',bucket:'quarter'},{id:'m',title:'Picnic',bucket:'month'}]
 api.updateTask.mockResolvedValue(false)
 open();fireEvent.click(screen.getByRole('button',{name:/Picnic Independent/,pressed:false}))
 fireEvent.click(screen.getByRole('button',{name:'Link or change parent'}))
 fireEvent.change(screen.getByRole('combobox'),{target:{value:'1:s'}})
 fireEvent.click(screen.getByRole('button',{name:'Save',exact:true}))
 await screen.findByText('Could not save. Your wording is still here; try again.')
 expect(screen.getByRole('combobox')).toHaveValue('1:s')
 expect(api.updateTask).toHaveBeenLastCalledWith('m',{sourceId:'s'})
 api.updateTask.mockResolvedValue(true)
 fireEvent.click(screen.getByRole('button',{name:'Save',exact:true}))
 await waitFor(()=>expect(screen.queryByRole('combobox')).not.toBeInTheDocument())
 expect(api.addTask).not.toHaveBeenCalled()
})

it('removes a weekly parent including duplicated legacy fallback links',async()=>{
 api.tasks=[{id:'m',title:'Picnic',bucket:'month'},{id:'w',title:'Pack basket',bucket:'week',sourceId:'m',goalTaskId:'m'}]
 api.updateTask.mockResolvedValue(true)
 open();fireEvent.click(screen.getByRole('button',{name:/Pack basket/,pressed:false}))
 fireEvent.click(screen.getByRole('button',{name:'Link or change parent'}))
 fireEvent.change(screen.getByRole('combobox'),{target:{value:''}})
 fireEvent.click(screen.getByRole('button',{name:'Save',exact:true}))
 await screen.findByText('Saved to your plan.')
 expect(api.updateTask).toHaveBeenCalledWith('w',{sourceId:undefined,goalTaskId:undefined})
})

it('links an existing season goal to a yearly intention',async()=>{
 api.tasks=[{id:'s',title:'Autumn outings',bucket:'quarter'}];api.updateTask.mockResolvedValue(true)
 open();fireEvent.click(screen.getByRole('button',{name:/Autumn outings/,pressed:false}))
 fireEvent.click(screen.getByRole('button',{name:'Link or change parent'}))
 fireEvent.change(screen.getByRole('combobox'),{target:{value:'0:g'}})
 fireEvent.click(screen.getByRole('button',{name:'Save',exact:true}))
 await screen.findByText('Saved to your plan.')
 expect(api.updateTask).toHaveBeenCalledWith('s',{goalId:'g'})
})


function dragConnect(from:string,to:string){
 const target=screen.getByRole('button',{name:to,exact:true}).closest('[data-plan-key]')!
 Object.defineProperty(document,'elementFromPoint',{configurable:true,value:()=>target})
 const port=screen.getByRole('button',{name:'Connect '+from,exact:true})
 fireEvent.pointerDown(port,{button:0,pointerId:1,clientX:10,clientY:10})
 fireEvent.pointerMove(window,{pointerId:1,clientX:150,clientY:100})
 fireEvent.pointerUp(window,{pointerId:1,clientX:150,clientY:100})
}
it('drag saves one link and Undo restores just the previous parent',async()=>{
 // jsdom needs pointer coordinates for real drag handlers.
 vi.stubGlobal('PointerEvent',MouseEvent)
 api.tasks=[{id:'s',title:'Autumn outings',bucket:'quarter'},{id:'m',title:'Picnic',bucket:'month',sourceId:'old'}]
 api.updateTask.mockImplementation(async(id,patch)=>{Object.assign(api.tasks.find(t=>t.id===id),patch);return true})
 open();dragConnect('Picnic','Autumn outings Independent seasonal goal')
 await screen.findByText('Connected “Picnic” to “Autumn outings”.')
 expect(api.updateTask).toHaveBeenCalledTimes(1)
 expect(api.updateTask).toHaveBeenLastCalledWith('m',{sourceId:'s'})
 fireEvent.click(screen.getByRole('button',{name:'Undo connection'}))
 await screen.findByText('Connection restored.')
 expect(api.updateTask).toHaveBeenLastCalledWith('m',{sourceId:'old'})
 vi.unstubAllGlobals()
})
it('failed drag saves do not offer Undo, and Escape cancels without writing',async()=>{
 vi.stubGlobal('PointerEvent',MouseEvent)
 api.tasks=[{id:'s',title:'Autumn outings',bucket:'quarter'},{id:'m',title:'Picnic',bucket:'month'}]
 api.updateTask.mockResolvedValue(false)
 open();dragConnect('Picnic','Autumn outings Independent seasonal goal')
 await screen.findByText('Could not save the connection. Try dragging again.')
 expect(screen.queryByRole('button',{name:'Undo connection'})).not.toBeInTheDocument()
 api.updateTask.mockClear()
 fireEvent.pointerDown(screen.getByRole('button',{name:'Connect Picnic'}),{button:0,pointerId:1,clientX:10,clientY:10})
 fireEvent.keyDown(window,{key:'Escape'})
 fireEvent.pointerUp(window,{pointerId:1,clientX:150,clientY:100})
 expect(api.updateTask).not.toHaveBeenCalled()
 vi.unstubAllGlobals()
})

it('temporarily reveals eligible parents from a focused branch and cancels cleanly',()=>{
 vi.stubGlobal('PointerEvent',MouseEvent)
 api.tasks=[{id:'s',title:'Autumn outings',bucket:'quarter',goalId:'g'}]
 open();fireEvent.click(screen.getByRole('button',{name:/Autumn outings Together/,pressed:false}))
 expect(screen.queryByRole('button',{name:/Health/,pressed:false})).not.toBeInTheDocument()
 fireEvent.pointerDown(screen.getByRole('button',{name:'Connect Autumn outings'}),{button:0,pointerId:1,clientX:10,clientY:10})
 expect(screen.getByRole('button',{name:/Health/,pressed:false})).toBeInTheDocument()
 fireEvent.keyDown(window,{key:'Escape'})
 expect(screen.queryByRole('button',{name:/Health/,pressed:false})).not.toBeInTheDocument()
 expect(api.updateTask).not.toHaveBeenCalled()
 vi.unstubAllGlobals()
})

it('offers triage without changing branch focus and reports failed carry-forward',async()=>{
 api.tasks=[{id:'m',title:'Picnic',bucket:'month',context:'personal'}]
 api.keepForward.mockResolvedValue(undefined);open()
 fireEvent.click(screen.getByRole('button',{name:'Triage Picnic'}))
 expect(screen.getByRole('button',{name:/Health/,pressed:false})).toBeInTheDocument()
 fireEvent.click(screen.getByText('Carry to next month'))
 await screen.findByText('No change was saved. You can try again.')
 expect(api.keepForward).toHaveBeenCalledWith('m',{monthStart:new Date(2026,10,1)},new Date(2026,9,1))
})
it('removes only the viewed period and can reopen completed cards',async()=>{
 api.tasks=[{id:'m',title:'Picnic',bucket:'month',context:'personal',completed:true}]
 api.dropCommitment.mockResolvedValue(true);api.toggleTask.mockResolvedValue(true);open()
 fireEvent.click(screen.getByRole('checkbox',{name:/Show completed/}))
 fireEvent.click(screen.getByRole('button',{name:'Triage Picnic'}))
 fireEvent.click(screen.getByText('Reopen'));await screen.findByText('Reopened.')
 expect(api.toggleTask).toHaveBeenCalledWith('m')
 fireEvent.click(screen.getByRole('button',{name:'Triage Picnic'}))
 fireEvent.click(screen.getByText('Remove from this month'));await screen.findByText('Removed from this month.')
 expect(api.dropCommitment).toHaveBeenCalledWith('m','month',new Date(2026,9,1))
})
it('triages intentions through their own status rather than task scheduling',async()=>{
 api.updateGoal.mockResolvedValue(true);open()
 fireEvent.click(screen.getByRole('button',{name:'Triage Together'}))
 expect(screen.queryByText('Someday')).not.toBeInTheDocument()
 fireEvent.click(screen.getByText('Archive intention'));await screen.findByText('Intention archived.')
 expect(api.updateGoal).toHaveBeenCalledWith('g',{status:'archived'})
})
it('uses the shared scheduling action and does not claim success after failure',async()=>{
 api.tasks=[{id:'m',title:'Picnic',bucket:'month',context:'personal'}]
 api.setBucket.mockResolvedValue(false);open()
 fireEvent.click(screen.getByRole('button',{name:'Triage Picnic'}))
 fireEvent.click(screen.getByRole('button',{name:'Someday'}))
 await screen.findByText('No change was saved. You can try again.')
 expect(api.setBucket).toHaveBeenCalledWith('m','someday',undefined,undefined)
})

it('hides completed cards by default while retaining open children and their context',()=>{
 api.tasks=[{id:'s',title:'Finished season',bucket:'quarter',completed:true},{id:'m',title:'Still open',bucket:'month',sourceId:'s'}]
 open()
 expect(screen.queryByRole('button',{name:'Triage Finished season'})).not.toBeInTheDocument()
 expect(screen.getByRole('button',{name:/Still open Finished season/})).toBeInTheDocument()
 fireEvent.click(screen.getByRole('checkbox',{name:/Show completed/}))
 expect(screen.getByRole('button',{name:'Triage Finished season'})).toBeInTheDocument()
 fireEvent.click(screen.getByRole('checkbox',{name:/Show completed/}))
 expect(screen.queryByRole('button',{name:'Triage Finished season'})).not.toBeInTheDocument()
})
it('keeps add controls available while focused and creates a child from its card',()=>{
 open();fireEvent.click(screen.getByRole('button',{name:/Together/,pressed:false}))
 expect(screen.getByRole('button',{name:'+ Add an independent monthly milestone'})).toBeEnabled()
 fireEvent.click(screen.getByRole('button',{name:'Add seasonal goal under Together'}))
 expect(screen.getByRole('dialog')).toHaveTextContent('Under Together')
})
it('exposes direct edit and removal without selecting the branch',async()=>{
 api.tasks=[{id:'m',title:'Picnic',bucket:'month',context:'personal'}]
 api.dropCommitment.mockResolvedValue(false)
 const confirm=vi.spyOn(window,'confirm').mockReturnValue(true)
 open();fireEvent.click(screen.getByRole('button',{name:'Edit Picnic'}))
 expect(screen.getByLabelText('Wording')).toHaveValue('Picnic')
 fireEvent.click(screen.getByRole('button',{name:'Cancel'}))
 fireEvent.click(screen.getByRole('button',{name:'Remove Picnic'}))
 await screen.findByText('No change was saved. You can try again.')
 expect(api.dropCommitment).toHaveBeenCalledWith('m','month',new Date(2026,9,1))
 expect(screen.getByRole('button',{name:'Edit Picnic'})).toBeInTheDocument()
 confirm.mockRestore()
})
