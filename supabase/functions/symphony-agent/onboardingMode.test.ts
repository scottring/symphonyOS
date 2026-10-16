import { describe,it,expect } from 'vitest'
import { ONBOARDING_TOOLS,onboardingCardAllowed } from './onboardingMode'
import { parseSurface,toolsForSurface,toolAllowed,systemForSurface } from './wallMode'
describe('story-based setup uses the existing agent without write tools',()=>{
  it('accepts the surface and exposes only roster, routines and draft preparation',()=>{
    expect(parseSurface('onboarding')).toEqual({surface:'onboarding'})
    const names=[...ONBOARDING_TOOLS,'symphony_create_routine','symphony_update_routine','symphony_create_task','web_search','symphony_add_to_scratchpad']
    expect(toolsForSurface(names.map(name=>({name})),'onboarding').map(t=>t.name)).toEqual([...ONBOARDING_TOOLS])
    for(const name of names.filter(n=>!ONBOARDING_TOOLS.has(n))) expect(toolAllowed(name,'onboarding')).toBe(false)
  })
  it('rejects mixed cards and keeps the household story separate from one-off scheduling',()=>{
    expect(onboardingCardAllowed([{op:'routine_add'}])).toBe(true)
    expect(onboardingCardAllowed([{op:'routine_add'},{op:'add'}])).toBe(false)
    expect(onboardingCardAllowed([{op:'routine_change'}])).toBe(false)
    expect(onboardingCardAllowed([{op:'routine_change',showOnTimeline:false}])).toBe(true)
    expect(onboardingCardAllowed([{op:'routine_add'},{op:'routine_change',showOnTimeline:true}])).toBe(true)
    expect(onboardingCardAllowed([{op:'routine_change',showOnTimeline:false,days:['tue']}])).toBe(false)
    expect(onboardingCardAllowed([{op:'routine_change',showOnTimeline:false,clearTime:true}])).toBe(false)
    expect(onboardingCardAllowed([])).toBe(false)
    const prompt=systemForSurface('Base Symphony personality','onboarding')
    expect(prompt).toContain('Base Symphony personality')
    expect(prompt).toContain('one-off')
    expect(prompt).toContain('monthly or alternating-week')
    expect(prompt).toContain('at most ONE')
  })
})
