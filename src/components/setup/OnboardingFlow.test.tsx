import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import { render } from '@/test/test-utils'
import type { User } from '@supabase/supabase-js'
import { newOnboardingProgress, type OnboardingProgress } from '@/lib/onboardingProgress'
import type { SetupContext } from '@/lib/onboarding'
const h=vi.hoisted(()=>({load:vi.fn(),progress:vi.fn(),routine:vi.fn(),item:vi.fn(),week:vi.fn()}))
vi.mock('@/lib/onboarding',()=>({loadOnboarding:h.load,saveOnboardingProgress:h.progress,saveOnboardingRoutine:h.routine,saveOnboardingItem:h.item,saveOnboardingWeekStart:h.week}))
vi.mock('@/lib/firstRun',()=>({markFirstRunDoneLocally:vi.fn()}))
vi.mock('./FirstRunSetup',()=>({FirstRunSetup:()=> <div>Household form</div>}))
vi.mock('./ActivityStory',()=>({ActivityStory:({onSaved,goalJourney}:{onSaved:(items:unknown[])=>Promise<void>;goalJourney:boolean})=><div><textarea aria-label="Message Symphony"/><button onClick={()=>void onSaved([{id:'first',title:goalJourney?'Learn to swim':'Buy a bench',destination:goalJourney?'year':'inbox',where:'Inbox'}])}>Save story draft</button></div>}))
vi.mock('./DeviceSetup',()=>({DeviceSetup:()=> <div>Optional device setup</div>}))
vi.mock('./RoutineStory',()=>({RoutineStory:({onSaved}:{onSaved:()=>Promise<void>})=><div><textarea aria-label="Message Symphony"/><button onClick={()=>void onSaved()}>Save example routines</button></div>}))
import { OnboardingFlow } from './OnboardingFlow'
const user={id:'u1',email:'synthetic@example.com'} as User
let context:SetupContext
beforeEach(()=>{
  vi.clearAllMocks();localStorage.clear();window.history.replaceState(null,'','/getting-started')
  context={household:{id:'hh',owner_id:'u1',name:'Test household',week_starts_on:1,seasons:null},members:[{id:'me',name:'Jess',user_id:'u1',auth_user_id:null,is_full_user:true}],routines:[],progress:{...newOnboardingProgress(),household:'done',step:'routines'},established:true}
  h.load.mockImplementation(async()=>structuredClone(context))
  h.progress.mockImplementation(async(_id:string,p:OnboardingProgress)=>{context.progress=structuredClone(p)})
  h.routine.mockImplementation(async(_id:string,input:{name:string;recurrence:unknown;time:string})=>{const r={id:'r',name:input.name,recurrence_pattern:input.recurrence,time_of_day:input.time};context.routines=[r as never];return r})
  h.item.mockResolvedValue({id:'t',title:'Buy a bench',destination:'inbox'})
  h.week.mockImplementation(async(day:number)=>{context.household!.week_starts_on=day})
})
describe('guided onboarding',()=>{
  it('offers the owner a week-start choice and confirms it before continuing to routines',async()=>{
    context.progress={...newOnboardingProgress(),household:'done'}
    const {user:u}=render(<OnboardingFlow user={user}/>)
    await u.click(await screen.findByRole('radio',{name:'Saturday'}))
    expect(h.week).not.toHaveBeenCalled()
    await u.click(screen.getByRole('button',{name:/Save and continue to routines/}))
    await screen.findByRole('heading',{name:'What does a typical week look like?'})
    expect(h.week).toHaveBeenCalledWith(6)
    expect(context.household!.week_starts_on).toBe(6)
    await u.click(screen.getByRole('button',{name:'Back',exact:true}))
    expect(await screen.findByRole('radio',{name:'Saturday'})).toBeChecked()
  })
  it('keeps a failed week-start save on the household step with the selection available to retry',async()=>{
    context.progress={...newOnboardingProgress(),household:'done'}
    h.week.mockRejectedValueOnce(new Error('Week change unavailable'))
    const {user:u}=render(<OnboardingFlow user={user}/>)
    await u.click(await screen.findByRole('radio',{name:'Saturday'}))
    await u.click(screen.getByRole('button',{name:/Save and continue to routines/}))
    expect(await screen.findByRole('alert')).toHaveTextContent('Week change unavailable')
    expect(context.progress.step).toBe('household')
    expect(screen.getByRole('radio',{name:'Saturday'})).toBeChecked()
    expect(h.progress).not.toHaveBeenCalled()
  })
  it('saves a routine, introduces every horizon, captures an undated activity and finishes honestly',async()=>{
    const {user:u}=render(<OnboardingFlow user={user}/>)
    await screen.findByRole('heading',{name:'What does a typical week look like?'})
    await u.click(screen.getByRole('button',{name:'Save example routines'}))
    await u.click(await screen.findByRole('button',{name:/See how planning fits together/}))
    await screen.findByRole('heading',{name:/Five horizons/})
    for(const name of ['Year','Season','Month','Week','Today']) expect(screen.getByText(name,{exact:true})).toBeInTheDocument()
    for(const name of ['Year','Season','Month','Week','Today']) expect(screen.getByRole('button',{name:new RegExp(`Watch the ${name} example`)})).toBeInTheDocument()
    expect(screen.queryByRole('button',{name:'Save activity'})).not.toBeInTheDocument()
    await u.click(screen.getByRole('button',{name:/Choose where to start/}))
    expect(screen.getByLabelText('Message Symphony')).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    await u.click(screen.getByRole('button',{name:'Save story draft'}))
    await u.click(await screen.findByRole('button',{name:/Continue to devices/}))
    await u.click(await screen.findByRole('button',{name:'This browser is enough for now'}))
    await screen.findByRole('heading',{name:'You’re ready to begin'})
    expect(context.progress.finished).toBe(false)
    await u.click(screen.getByRole('button',{name:/Open my Inbox/}))
    await waitFor(()=>expect(context.progress.finished).toBe(true))
    expect(window.location.pathname).toBe('/inbox')
  })
  it('starts with a story instead of routine fields or numbered stages',async()=>{
    render(<OnboardingFlow user={user}/>)
    await screen.findByLabelText('Message Symphony')
    expect(screen.queryByLabelText('Routine name')).not.toBeInTheDocument()
    expect(screen.queryByText(/Stage \d of/)).not.toBeInTheDocument()
    expect(h.progress).not.toHaveBeenCalled()
  })
  it('keeps deferred steps visible, including at the finish',async()=>{
    const {user:u}=render(<OnboardingFlow user={user}/>)
    await u.click(await screen.findByRole('button',{name:'I’ll come back to this'}))
    await screen.findByRole('heading',{name:/Five horizons/})
    const nav=screen.getByRole('navigation',{name:'Setup progress'})
    expect(within(nav).getByRole('button',{name:/Your routines/})).toHaveTextContent('For later')
    await u.click(screen.getByRole('button',{name:/Choose where to start/}))
    await u.click(screen.getByRole('button',{name:'Explore first; add something later'}))
    await u.click(await screen.findByRole('button',{name:'This browser is enough for now'}))
    await screen.findByRole('heading',{name:'For later'})
    expect(screen.getByRole('button',{name:'Set up your routines'})).toBeInTheDocument()
    await u.click(screen.getByRole('button',{name:/Open my week/}))
    await waitFor(()=>expect(context.progress.finished).toBe(true))
    expect(context.progress).toMatchObject({routines:'later',activity:'later',horizonsSeen:true})
    expect(h.routine).not.toHaveBeenCalled();expect(h.item).not.toHaveBeenCalled()
  })
  it('resumes a saved step and keeps an invited adult in the existing household',async()=>{
    context.household!.owner_id='organizer'
    context.progress={...newOnboardingProgress()}
    context.routines=[{id:'r',name:'School pickup',recurrence_pattern:{type:'weekly',days:['mon']},time_of_day:'15:00',assigned_to:'me'}]
    const {user:u,unmount}=render(<OnboardingFlow user={user}/>)
    await screen.findByText('Test household',{exact:true})
    expect(screen.queryByText('Household form')).not.toBeInTheDocument()
    expect(screen.getByRole('radio',{name:'Monday'})).toBeChecked()
    for(const choice of screen.getAllByRole('radio'))expect(choice).toBeDisabled()
    await u.click(screen.getByRole('button',{name:/Continue to routines/}))
    await u.click(await screen.findByRole('button',{name:'These routines are a good start'}))
    await u.click(await screen.findByRole('button',{name:/See how planning fits together/}))
    await screen.findByRole('heading',{name:/Five horizons/})
    unmount();render(<OnboardingFlow user={user}/>)
    expect(await screen.findByRole('heading',{name:/Five horizons/})).toBeInTheDocument()
    expect(h.routine).not.toHaveBeenCalled()
    expect(h.week).not.toHaveBeenCalled()
  })
  it('holds the current step when progress persistence fails',async()=>{
    h.progress.mockRejectedValueOnce(new Error('Progress unavailable'))
    const {user:u}=render(<OnboardingFlow user={user}/>)
    await u.click(await screen.findByRole('button',{name:'I’ll come back to this'}))
    expect(await screen.findByRole('alert')).toHaveTextContent('Progress unavailable')
    expect(screen.getByRole('heading',{name:'What does a typical week look like?'})).toBeInTheDocument()
  })
  it('offers the later goal journey after completing an activity without replacing that activity',async()=>{
    window.history.replaceState(null,'','/getting-started?journey=goals')
    localStorage.setItem('symphony.setup.draft.u1',JSON.stringify({title:'Return library books',kind:'task',place:'week'}))
    context.progress={...newOnboardingProgress(),household:'done',routines:'done',activity:'done',horizonsSeen:true,finished:true,step:'ready',destination:'inbox'}
    h.item.mockResolvedValue({id:'g',title:'Learn to swim',destination:'year'})
    const {user:u}=render(<OnboardingFlow user={user}/>)
    await screen.findByRole('heading',{name:/Five horizons/})
    await u.click(screen.getByRole('button',{name:/Choose where to start/}))
    expect(screen.getByLabelText('Message Symphony')).toHaveValue('')
    await u.click(screen.getByRole('button',{name:'Save story draft'}))
    await waitFor(()=>expect(context.progress.destination).toBe('year'))
    expect(JSON.parse(localStorage.getItem('symphony.setup.draft.u1')!).title).toBe('Return library books')
    expect(context.progress.destination).toBe('year')
  })
})
