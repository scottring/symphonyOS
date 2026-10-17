import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import type { User } from '@supabase/supabase-js'
import { Check, ArrowRight } from 'lucide-react'
import { FirstRunSetup } from './FirstRunSetup'
import { RoutineStory } from './RoutineStory'
import { ActivityStory } from './ActivityStory'
import { DeviceSetup } from './DeviceSetup'
import { EverydayGuide } from './EverydayGuide'
import type { ActivityReceipt } from '@/lib/activityStory'
import { HorizonVideoButton, type HorizonVideoId } from './HorizonVideo'
import { loadOnboarding, saveOnboardingProgress, saveOnboardingWeekStart, type SetupContext } from '@/lib/onboarding'
import { isWeekStart, type WeekStart } from '@/lib/cadence/config'
import { WeekStartChoice } from './WeekStartChoice'
import { canFinishOnboarding, newOnboardingProgress, onboardingOpenLabel, onboardingStage, type OnboardingProgress, type SetupStep } from '@/lib/onboardingProgress'
import { markFirstRunDoneLocally } from '@/lib/firstRun'
import { FIRST_WEEK_HIDE_KEY } from '@/lib/firstWeek'
import '@/styles/onboarding.css'

const milestones = ['Your household','Your routines','Your first activities','Your devices','Ready to begin']
const horizons = [
  ['Year','Your broader direction','What would you like this year to add up to?'],
  ['Season','A few areas of focus','What goals will you progress this quarter?'],
  ['Month','Nearer goals','What would you like to move forward this month?'],
  ['Week','This week’s attention','Which activities belong in this week?'],
  ['Today','Today’s actions','What will you give attention to today?'],
]
interface Props { user: User; onDone?: () => void }

export function OnboardingFlow({user,onDone}: Props) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [context,setContext] = useState<SetupContext | null>(null)
  const [progress,setProgress] = useState<OnboardingProgress>(newOnboardingProgress)
  const [weekStartsOn,setWeekStartsOn]=useState<WeekStart>(0)
  const [loading,setLoading] = useState(true)
  const [attempt,setAttempt] = useState(0)
  const [busy,setBusy] = useState(false)
  const locked = useRef(false)
  const [error,setError] = useState<string | null>(null)
  const goalJourney = params.get('journey') === 'goals'
  const heading = useRef<HTMLHeadingElement>(null)
  const page = useRef<HTMLElement>(null)
  const stage = onboardingStage(progress.step)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    loadOnboarding(user.id).then(data => {
      if (cancelled) return
      setContext(data)
      setWeekStartsOn(isWeekStart(data.household?.week_starts_on)?data.household.week_starts_on:0)
      const p = {...data.progress}
      if (params.get('journey') === 'goals' && data.household) {
        p.step = 'horizons'
      }
      if (params.get('journey') === 'devices' && data.household) p.step = 'devices'
      if (params.get('journey') === 'guide' && data.household) p.step = 'ready'
      setProgress(p); setError(null); setLoading(false)
    }).catch(err => { if (!cancelled) {setError(err instanceof Error ? err.message : 'Could not load your setup.');setLoading(false)} })
    return () => {cancelled=true}
  }, [user.id,attempt,params])
  useEffect(() => {
    if (!loading) {
      if(params.get('journey')==='guide'&&progress.step==='ready') {
        const guide=document.getElementById('everyday-guidance')
        guide?.scrollIntoView?.({block:'start',behavior:'instant'});guide?.querySelector('h2')?.focus({preventScroll:true});return
      }
      page.current?.scrollIntoView?.({block:'start',behavior:'instant'})
      heading.current?.focus({preventScroll:true})
    }
  }, [progress.step,loading,params])

  async function persist(patch: Partial<OnboardingProgress>) {
    const next = {...progress,...patch}
    await saveOnboardingProgress(user.id,next)
    setProgress(next)
    return next
  }
  async function run(action: () => Promise<unknown>) {
    if (locked.current) return
    locked.current=true;setBusy(true);setError(null)
    try {await action()} catch (err) {setError(err instanceof Error ? err.message : 'We could not confirm that. Please try again.')} finally {locked.current=false;setBusy(false)}
  }
  function leave(route: string) {
    markFirstRunDoneLocally(user.id)
    try {localStorage.setItem(FIRST_WEEK_HIDE_KEY(user.id),new Date().toISOString())} catch { /* Getting started is always in navigation */ }
    onDone?.()
    navigate(route)
  }
  async function pause(route='/today') {
    await persist({paused:true})
    leave(route)
  }
  async function finish() {
    await persist(canFinishOnboarding(progress)?{finished:true,paused:false,step:'ready'}:{paused:true})
    leave(`/${progress.destination}${progress.destinationStart?`?${progress.destination==='today'?'date':'start'}=${progress.destinationStart}`:''}`)
  }
  async function householdSaved() {
    const fresh = await loadOnboarding(user.id)
    if (!fresh.household || !fresh.members.length) throw new Error('Could not confirm the household and people. Please try again.')
    await persist({household:'done',paused:false})
    setContext(fresh)
    setWeekStartsOn(isWeekStart(fresh.household.week_starts_on)?fresh.household.week_starts_on:0)
  }
  async function continueFromHousehold() {
    if(context?.household?.owner_id===user.id&&weekStartsOn!==context.household.week_starts_on){
      await saveOnboardingWeekStart(weekStartsOn)
      const fresh=await loadOnboarding(user.id)
      if(fresh.household?.week_starts_on!==weekStartsOn)throw new Error('Your week start could not be confirmed. Please try again.')
      setContext(fresh)
    }
    await persist({household:'done',step:'routines',paused:false})
  }
  async function routinesSaved() {
    const fresh = await loadOnboarding(user.id)
    setContext(fresh)
    await persist({routines:'done',paused:false})
  }
  async function activitiesSaved(items:ActivityReceipt[]) {
    await persist({activity:'done',destination:items[0].destination,destinationStart:items[0].start,paused:false})
  }
  function visit(step: SetupStep) { void run(() => persist({step})) }

  const completed = [progress.household==='done',progress.routines==='done',progress.activity==='done'&&progress.horizonsSeen,progress.devices==='done',progress.finished]
  const deferred = [false,progress.routines==='later',progress.activity==='later',progress.devices==='later',false]
  const suggestedSteps: SetupStep[] = ['household','routines','horizons','devices','ready']
  const existingHousehold = !!context?.household && (context.established || progress.household==='done')
  const invitee = !!context?.household && context.household.owner_id !== user.id
  const focusTitle = ({household:'A place for your household',routines:'What does a typical week look like?',horizons:'Five horizons. Start wherever it helps.',activity:'Let’s give your intentions a place',devices:'Symphony, where you need it',ready:'You’re ready to begin'})[progress.step]
  return <main ref={page} className="onboarding-page">
    <div className="onboarding-wrap">
      <header className="onboarding-header">
        <Link to="/" className="onboarding-brand" aria-label="Symphony home"><img src="/symphony-logo.png" alt="" />Symphony</Link>
        <span>Getting started</span>
      </header>
      <p className="onboarding-destination">Bring your people, routines and intentions into one place.</p>
      <nav aria-label="Setup progress" className="onboarding-progress">
        {milestones.map((name,i) => <button key={name} type="button" aria-current={stage===i?'step':undefined}
          disabled={busy||loading||(!completed[i]&&!deferred[i]&&i>stage)}
          onClick={() => visit(suggestedSteps[i])}>
          <span className={`onboarding-track ${completed[i]?'is-done':''}`} aria-hidden="true"><span /></span>
          <span className="onboarding-milestone">{completed[i]&&<Check size={15} aria-hidden="true" />}{name}</span>
          <span className="onboarding-step-status">{stage===i?'Here now':completed[i]?'In place':deferred[i]?'For later':''}</span>
        </button>)}
      </nav>
      {loading ? <p role="status">Finding your place…</p> : !context ? <section><p role="alert">{error}</p><button className="btn-primary" onClick={() => setAttempt(n=>n+1)}>Try again</button></section> : <>
        <section className="onboarding-content" aria-busy={busy}>
          <h1 ref={heading} tabIndex={-1}>{focusTitle}</h1>
          {error&&<div role="alert" className="onboarding-error">{error}</div>}

          {progress.step==='household' && <>
            {existingHousehold ? <>
              <p>{invitee?'You’re joining':'Your household is'} <strong>{context.household?.name}</strong>.</p>
              <p>{context.members.map(m=>m.name).join(', ')}. Household activities can be seen by household members; personal captures stay yours.</p>
              <div className="onboarding-note">
                <WeekStartChoice value={weekStartsOn} onChange={setWeekStartsOn} disabled={busy} inherited={invitee}/>
                {!invitee&&weekStartsOn!==context.household?.week_starts_on&&<p className="onboarding-muted">This choice saves when you continue. Any existing weekly plans follow the new week; activities with a date keep that date.</p>}
              </div>
              <p className="onboarding-muted">Times use this device: {Intl.DateTimeFormat().resolvedOptions().timeZone}.</p>
              <div className="onboarding-note"><strong>Bring your calendar when you’re ready.</strong><p>Choose which calendars Symphony uses in Calendar settings. Until connected, Symphony does not know those appointments. Review existing appointments before adding them again as routines.</p>
                <button disabled={busy} className="onboarding-link" onClick={() => void run(async()=>{await persist({household:'done',paused:true});leave('/settings?tab=calendar')})}>Open Calendar settings</button>
                <span className="onboarding-muted"> · Optional; return here from Getting started.</span>
              </div>
              <button className="btn-primary" disabled={busy} onClick={() => void run(continueFromHousehold)}>{!invitee&&weekStartsOn!==context.household?.week_starts_on?'Save and continue to routines':'Continue to routines'} <ArrowRight size={16} /></button>
            </> : <FirstRunSetup user={user} embedded onDone={householdSaved} />}
          </>}

          {progress.step==='routines' && <>
            <RoutineStory user={user} context={context} onSaved={routinesSaved} onWorking={setBusy}/>
            {context.routines.length>0 && progress.routines!=='done'&&<button className="onboarding-link" disabled={busy} onClick={() => void run(()=>persist({routines:'done'}))}>These routines are a good start</button>}
            <div className="onboarding-actions">
              {progress.routines==='done'?<button disabled={busy} className="onboarding-link" onClick={()=>visit('horizons')}>See how planning fits together <ArrowRight size={16}/></button>:<button disabled={busy} className="onboarding-link" onClick={()=>void run(()=>persist({routines:'later',step:'horizons'}))}>I’ll come back to this</button>}
            </div>
          </>}

          {progress.step==='horizons' && <>
            <p>Symphony helps you structure your own intentions. The horizons let you move between the bigger picture and everyday life.</p>
            <ol className="onboarding-horizons">{horizons.map(([name,purpose,prompt])=><li key={name}><strong>{name}</strong><div><span>{purpose}</span><p>{prompt}</p></div><HorizonVideoButton horizon={name.toLowerCase() as HorizonVideoId}/></li>)}</ol>
            <p>A yearly goal can hold smaller quarterly and monthly goals. You choose activities that move them forward in Week and Today; the bigger goals stay in place.</p>
            <p>Routines and everyday tasks belong here too, with or without a bigger goal. Start anywhere and make connections when they help.</p>
            <button disabled={busy} className="btn-primary" onClick={()=>void run(()=>persist({horizonsSeen:true,step:'activity'}))}>Choose where to start <ArrowRight size={16}/></button>
          </>}

          {progress.step==='activity' && <>
            <ActivityStory key={goalJourney?'goals':'activities'} user={user} context={context} goalJourney={goalJourney} onSaved={activitiesSaved} onWorking={setBusy}/>
            <div className="onboarding-actions">
              {progress.activity==='done'?<button disabled={busy} className="btn-primary" onClick={()=>visit('devices')}>Continue to devices <ArrowRight size={16}/></button>:<button className="onboarding-link" disabled={busy} onClick={()=>void run(()=>persist({activity:'later',step:'devices',destination:'week'}))}>Explore first; add something later</button>}
            </div>
          </>}

          {progress.step==='devices' && <>
            <DeviceSetup/>
            <div className="onboarding-actions routine-story-actions">
              <button disabled={busy} className="btn-primary" onClick={()=>void run(()=>persist({devices:'done',step:'ready'}))}>I have what I need · review my setup <ArrowRight size={16}/></button>
              <button disabled={busy} className="onboarding-link" onClick={()=>void run(()=>persist({devices:'later',step:'ready'}))}>This browser is enough for now</button>
            </div>
          </>}

          {progress.step==='ready' && <>
            <p>You have a starting point. Add more as life happens.</p>
            <div className="onboarding-summary"><h2>Ready now</h2><ul>
              <li>Your household: {context.household?.name}</li>
              {progress.routines==='done'&&<li>Your routines are in place.</li>}
              {progress.horizonsSeen&&<li>You’ve met the five planning horizons.</li>}
              {progress.activity==='done'&&<li>Your first intentions are saved. Your conversation has the item-by-item destinations.</li>}
            </ul>
            {progress.devices==='done'&&<li>You’ve reviewed how to use Symphony on your devices.</li>}
            {(progress.routines==='later'||progress.activity==='later'||progress.devices!=='done')&&<><h2>For later</h2><ul>
              {progress.routines==='later'&&<li><button className="onboarding-link" disabled={busy} onClick={()=>visit('routines')}>Set up your routines</button></li>}
              {progress.devices!=='done'&&<li><button className="onboarding-link" disabled={busy} onClick={()=>visit('devices')}>Set up another device or a shared display</button></li>}
              {progress.activity==='later'&&<li><button className="onboarding-link" disabled={busy} onClick={()=>visit('activity')}>Capture something or start with a goal</button></li>}
            </ul></>}
            </div>
            <div className="onboarding-note"><h2>Bring the rest in when it helps</h2><p><Link className="onboarding-link" to="/settings?tab=calendar">Connect and choose calendars</Link> · <Link className="onboarding-link" to="/settings?tab=general#school-information">Bring in school emails</Link> · <Link className="onboarding-link" to="/settings?tab=general">Invite another adult</Link></p><p>School emails become suggestions you review before saving. Each adult signs in to their own account. This walkthrough does not connect a calendar, forward email or invite anyone automatically.</p></div>
            <EverydayGuide/>
            <p>Getting started stays in More and Help. You can return for routines or the goal walkthrough whenever it’s useful.</p>
            <button className="btn-primary" disabled={busy} onClick={()=>void run(finish)}>{busy?'Saving your progress…':onboardingOpenLabel(progress)} <ArrowRight size={16}/></button>
          </>}
        </section>
        <footer className="onboarding-footer">
          {stage>0&&<button className="onboarding-link" disabled={busy} onClick={()=>visit(progress.step==='activity'?'horizons':progress.step==='ready'?'devices':progress.step==='devices'?'activity':progress.step==='horizons'?'routines':'household')}>Back</button>}
          {progress.household==='done'&&<button className="onboarding-link" disabled={busy} onClick={()=>void run(()=>pause())}>Save my place and finish later</button>}
          <span role="status">{busy?'One moment…':'You can pick this up again whenever you like.'}</span>
        </footer>
      </>}
    </div>
  </main>
}
