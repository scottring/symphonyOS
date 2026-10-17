import { beforeEach,describe,it,expect,vi } from 'vitest'
import { render,screen,waitFor } from '@/test/test-utils'
import type { User } from '@supabase/supabase-js'
import type { SetupContext } from '@/lib/onboarding'
import { newOnboardingProgress } from '@/lib/onboardingProgress'
const h=vi.hoisted(()=>({send:vi.fn(),save:vi.fn(),options:null as any}))
vi.mock('@/hooks/useSymphonyAssistant',()=>({useSymphonyAssistant:(options:unknown)=>{h.options=options;return {messages:[],sessions:[],loading:false,error:null,sendMessage:h.send,loadSession:vi.fn(),retryLast:vi.fn()}}}))
vi.mock('@/lib/onboardingStory',async original=>({...await original<typeof import('@/lib/onboardingStory')>(),saveRoutineStory:h.save}))
import { RoutineStory } from './RoutineStory'
const context:SetupContext={household:null,members:[{id:'sam',name:'Sam',user_id:'u',auth_user_id:null,is_full_user:true}],routines:[],progress:newOnboardingProgress(),established:false}
const card={key:'card1',title:'Your routines',ops:[{key:'dog',op:'routine_add',title:'Walk the dog',days:['mon','tue','wed','thu','fri'],time:'07:00',assignees:['sam'],context:'family'}]}
beforeEach(()=>{vi.clearAllMocks();localStorage.clear();h.save.mockResolvedValue([{id:'saved'}]);h.send.mockImplementation(async()=>h.options.turnObserver.changeSet(card))})
describe('routine story conversation',()=>{
  it('takes the story, revises the same draft, and writes only on Save',async()=>{
    const onSaved=vi.fn().mockResolvedValue(undefined)
    const {user}=render(<RoutineStory user={{id:'u'} as User} context={context} onSaved={onSaved} onWorking={vi.fn()}/>)
    expect(h.options.surface).toBe('onboarding')
    await user.type(screen.getByLabelText('Message Symphony'),'Sam walks the dog on weekday mornings at seven.')
    await user.click(screen.getByRole('button',{name:'Send message'}))
    await screen.findByRole('region',{name:'Routine draft'})
    expect(h.save).not.toHaveBeenCalled()
    expect(screen.getByText('Show in Today and Week when due')).toBeInTheDocument()
    h.send.mockImplementationOnce(async()=>h.options.turnObserver.changeSet({...card,ops:[{...card.ops[0],days:['tue','thu'],time:'07:30',showOnTimeline:false}]}))
    await user.type(screen.getByLabelText('Message Symphony'),'Actually Tuesdays and Thursdays at 7:30, but keep it off Today and Week.')
    await user.click(screen.getByRole('button',{name:'Send message'}))
    expect(screen.getAllByText('Walk the dog',{exact:true})).toHaveLength(1)
    expect(h.save).not.toHaveBeenCalled()
    expect(screen.getByText('Hidden from Today and Week · Kept in Routines')).toBeInTheDocument()
    await user.click(screen.getByRole('button',{name:'Save routine'}))
    await screen.findByText(/Your routine is saved/)
    expect(h.save.mock.calls[0][1].ops[0]).toMatchObject({days:['tue','thu'],time:'07:30',showOnTimeline:false})
    expect(onSaved).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('region',{name:'Routine draft'})).not.toBeInTheDocument()
    expect(h.options.turnObserver.changeCard().state).toBe('approved')
  })
  it('keeps a failed save available with the same identity after reload',async()=>{
    h.save.mockRejectedValueOnce(new Error('Connection dropped'))
    const onSaved=vi.fn().mockResolvedValue(undefined)
    const props={user:{id:'u'} as User,context,onSaved,onWorking:vi.fn()}
    const {user,unmount}=render(<RoutineStory {...props}/>)
    await user.type(screen.getByLabelText('Message Symphony'),'Weekday dog walk at seven.')
    await user.click(screen.getByRole('button',{name:'Send message'}))
    await user.click(await screen.findByRole('button',{name:'Save routine'}))
    expect(await screen.findByRole('alert')).toHaveTextContent('couldn’t confirm all the saves')
    expect(onSaved).not.toHaveBeenCalled()
    unmount();render(<RoutineStory {...props}/>)
    await user.click(screen.getByRole('button',{name:'Save routine'}))
    await waitFor(()=>expect(onSaved).toHaveBeenCalledTimes(1))
    expect(h.save.mock.calls[0][1]).toEqual(h.save.mock.calls[1][1])
  })
  it('reviews an existing routine’s display without claiming to replace its schedule or owner',async()=>{
    const choice={key:'display',title:'Your choices',ops:[{key:'hide',op:'routine_change',title:'Walk the dog',routineId:'r1',seen:'2026-10-15T15:00:00Z',showOnTimeline:false}]}
    h.send.mockImplementationOnce(async()=>h.options.turnObserver.changeSet(choice))
    const {user}=render(<RoutineStory user={{id:'u'} as User} context={context} onSaved={vi.fn()} onWorking={vi.fn()}/>)
    await user.type(screen.getByLabelText('Message Symphony'),'Keep the dog walk off Today and Week.')
    await user.click(screen.getByRole('button',{name:'Send message'}))
    expect(screen.getByRole('heading',{name:'Your routine choices'})).toBeInTheDocument()
    expect(screen.getByText('Existing routine · Display change only')).toBeInTheDocument()
    expect(screen.queryByText(/No one assigned/)).not.toBeInTheDocument()
    expect(h.save).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button',{name:'Save routine'}))
    await waitFor(()=>expect(h.save).toHaveBeenCalledWith('u',choice,context.members))
  })
})
