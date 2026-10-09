import {render,screen,fireEvent,waitFor} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {beforeEach,describe,it,expect,vi} from 'vitest'
import {ConstellationPage} from './ConstellationPage'
const api=vi.hoisted(()=>({addGoal:vi.fn(),updateGoal:vi.fn(),addTask:vi.fn(),updateTask:vi.fn(),refetch:vi.fn()}))
vi.mock('@/contexts/GoalsContext',()=>({GoalsProvider:({children}:any)=>children,useGoalsContext:()=>({goals:[{id:'g',name:'Together',year:2026,status:'active',context:'personal'}],loading:false,...api})}))
vi.mock('@/hooks/useSupabaseTasks',()=>({useSupabaseTasks:()=>({tasks:[],loading:false,error:null,...api})}))
vi.mock('@/hooks/useDomain',()=>({useDomain:()=>({layers:[],soleDomain:'personal'})}))
vi.mock('@/hooks/useAssigneeFilter',()=>({useAssigneeFilter:()=>[[]]}))
vi.mock('@/hooks/useFamilyMembers',()=>({useFamilyMembers:()=>({getCurrentUserMember:()=>null})}))
vi.mock('@/hooks/useHouseholdSeasons',()=>({useHouseholdSeasons:()=>({seasons:[{name:'Spring',month:3,day:1},{name:'Summer',month:6,day:1},{name:'Fall',month:9,day:1},{name:'Winter',month:12,day:1}]})}))
vi.mock('@/lib/today/domainFilter',()=>({filterTasksForLayers:(t:any)=>t,matchesLayers:()=>true}))
vi.mock('@/lib/planning/peopleLens',()=>({planPeopleLens:()=>({keep:()=>true,scopeId:null})}))
vi.mock('../v2/AddArea',()=>({useAddArea:()=>({area:'personal',picker:null})}))
function open(){render(<MemoryRouter initialEntries={['/year?view=constellation&start=2026-10-09']}><ConstellationPage/></MemoryRouter>)}
beforeEach(()=>{vi.clearAllMocks();HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')};HTMLDialogElement.prototype.close=function(){this.removeAttribute('open')}})
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
