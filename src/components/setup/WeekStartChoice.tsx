import { useId } from 'react'
import type { WeekStart } from '@/lib/cadence/config'

const WEEK_RUNS: Record<WeekStart, string> = {0:'Sunday–Saturday',1:'Monday–Sunday',6:'Saturday–Friday'}
const choices = [{day:0,label:'Sunday'},{day:1,label:'Monday'},{day:6,label:'Saturday'}] as const

export function WeekStartChoice({value,onChange,disabled=false,inherited=false}:{value:WeekStart;onChange:(day:WeekStart)=>void;disabled?:boolean;inherited?:boolean}) {
  const id=useId()
  return <fieldset disabled={disabled||inherited} aria-describedby={`${id}-description`} className="space-y-2">
    <legend className="text-sm font-medium text-neutral-700">Week starts on</legend>
    <div className="flex flex-wrap gap-2">
      {choices.map(({day,label})=><label key={day} className={disabled||inherited?'cursor-default':'cursor-pointer'}>
        <input className="sr-only peer" type="radio" name={id} value={day} checked={value===day} onChange={()=>onChange(day)}/>
        <span className={`inline-flex min-h-11 items-center rounded-lg border px-4 py-2 text-sm peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary-500 ${value===day?'border-primary-600 bg-primary-50 text-primary-800':'border-neutral-200 bg-white text-neutral-700'} ${disabled?'opacity-60':''}`}>{label}</span>
      </label>)}
    </div>
    <p id={`${id}-description`} className="text-sm text-neutral-500">Weeks run {WEEK_RUNS[value]} for everyone in your household.{inherited?' This is set by your household’s owner.':''}</p>
  </fieldset>
}
