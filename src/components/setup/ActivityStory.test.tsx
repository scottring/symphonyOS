import {beforeEach,describe,it,expect,vi} from 'vitest'
import {render,screen,waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type {User} from '@supabase/supabase-js'
import {newOnboardingProgress} from '@/lib/onboardingProgress'
import type {SetupContext} from '@/lib/onboarding'
const h=vi.hoisted(()=>({options:null as any,save:vi.fn(),send:vi.fn(),historyLoading:false,historyError:null as string|null,reload:vi.fn()}))
vi.mock('@/hooks/useSymphonyAssistant',()=>({useSymphonyAssistant:(options:unknown)=>{h.options=options;return {messages:[],sessions:[],sessionsLoading:h.historyLoading,sessionsError:h.historyError,reloadSessions:h.reload,loading:false,error:null,sendMessage:h.send,loadSession:vi.fn()}}}))
vi.mock('@/lib/activityStory',async importOriginal=>({...await importOriginal<typeof import('@/lib/activityStory')>(),saveActivityStory:h.save}))
import {ActivityStory} from './ActivityStory'
const context:SetupContext={household:null,members:[],routines:[],progress:newOnboardingProgress(),established:false}
const card={key:'card',title:'First activities',ops:[{key:'bike',op:'add',title:'Bike errand',capturePlacement:'day',date:'2026-10-16',time:'15:00'},{key:'idea',op:'add',title:'A white bench',capturePlacement:'inbox'}]}
const result=[{id:'bike',title:'Bike errand',destination:'today',where:'Fri · 15:00'},{id:'idea',title:'A white bench',destination:'inbox',where:'Inbox'}]
beforeEach(()=>{vi.clearAllMocks();localStorage.clear();h.historyLoading=false;h.historyError=null;h.save.mockResolvedValue(result);h.send.mockImplementation(async()=>h.options.turnObserver.changeSet(card))})
describe('conversational first activities',()=>{
  it('does not start a disconnected conversation while its history is restoring or unavailable',async()=>{
    h.historyLoading=true
    const props={user:{id:'u'} as User,context,onSaved:vi.fn(),onWorking:vi.fn()}
    const view=render(<ActivityStory {...props}/>)
    expect(screen.getByLabelText('Message Symphony')).toBeDisabled()
    h.historyLoading=false;h.historyError='Your earlier conversation could not be loaded.'
    view.rerender(<ActivityStory {...props}/>)
    expect(screen.getByLabelText('Message Symphony')).toBeDisabled()
    await userEvent.setup().click(screen.getByRole('button',{name:'Restore conversation again'}))
    expect(h.reload).toHaveBeenCalledTimes(1);expect(h.send).not.toHaveBeenCalled()
  })
  it('corrects a draft without writing, then confirms save and progress',async()=>{
    const u=userEvent.setup(),saved=vi.fn().mockResolvedValue(undefined)
    render(<ActivityStory user={{id:'u'} as User} context={context} onSaved={saved} onWorking={vi.fn()}/>)
    await u.type(screen.getByLabelText('Message Symphony'),'Bike tomorrow at three, and a bench idea for later.')
    await u.click(screen.getByRole('button',{name:'Send message'}))
    expect(h.save).not.toHaveBeenCalled();expect(h.options.surface).toBe('onboarding_activity')
    h.send.mockImplementationOnce(async()=>h.options.turnObserver.changeSet({...card,key:'revised',ops:[{...card.ops[0],time:'16:00'},card.ops[1]]}))
    await u.type(screen.getByLabelText('Message Symphony'),'Actually four.')
    await u.click(screen.getByRole('button',{name:'Send message'}))
    expect(screen.getAllByText('Bike errand')).toHaveLength(1)
    expect(h.options.turnObserver.changeCard().draft.ops[1].capturePlacement).toBe('inbox')
    await u.click(screen.getByRole('button',{name:'Save these 2 items'}))
    await waitFor(()=>expect(saved).toHaveBeenCalledWith(result))
    expect(h.save.mock.calls[0][1].ops[0].time).toBe('16:00')
    expect(h.options.turnObserver.changeCard().state).toBe('approved')
  })
  it('freezes an uncertain save across reload and retries the exact identities',async()=>{
    h.save.mockRejectedValueOnce(new Error('Network lost'))
    const u=userEvent.setup(),saved=vi.fn().mockResolvedValue(undefined),props={user:{id:'u'} as User,context,onSaved:saved,onWorking:vi.fn()}
    const view=render(<ActivityStory {...props}/>)
    await u.type(screen.getByLabelText('Message Symphony'),'First story')
    await u.click(screen.getByRole('button',{name:'Send message'}))
    await u.click(screen.getByRole('button',{name:'Save these 2 items'}))
    expect(await screen.findByRole('alert')).toHaveTextContent('Network lost')
    expect(screen.getByLabelText('Message Symphony')).toBeDisabled()
    expect(screen.getByRole('button',{name:'Leave this draft'})).toBeDisabled()
    expect(saved).not.toHaveBeenCalled()
    view.unmount();render(<ActivityStory {...props}/>)
    await u.click(screen.getByRole('button',{name:'Retry save'}))
    await waitFor(()=>expect(saved).toHaveBeenCalledTimes(1))
    expect(h.save.mock.calls[0][1]).toEqual(h.save.mock.calls[1][1])
  })
  it('keeps legacy unfinished words without sending them automatically',()=>{
    localStorage.setItem('symphony.setup.draft.u',JSON.stringify({title:'Return books'}))
    render(<ActivityStory user={{id:'u'} as User} context={context} onSaved={vi.fn()} onWorking={vi.fn()}/>)
    expect(screen.getByLabelText('Message Symphony')).toHaveValue('Return books');expect(h.send).not.toHaveBeenCalled()
  })
})
