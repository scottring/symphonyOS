// Pure validation shared by the planning tools and their regression tests.
export function planningRow(input:Record<string,unknown>) {
 const title=typeof input.title==='string'?input.title.trim():''
 const level=input.level
 if(!title||title.length>500||!['year','season','month','week'].includes(String(level)))throw new Error('A title and valid planning level are required')
 if(!['personal','work','family'].includes(String(input.context)))throw new Error('Choose the life area before saving')
 const period=String(input.period_start??'')
 const date=new Date(`${period}T12:00:00Z`)
 if(!/^\d{4}-\d{2}-\d{2}$/.test(period)||Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==period)throw new Error('A valid period start date is required')
 if(level==='year')return {table:'goals',row:{name:title,year:date.getUTCFullYear(),area_id:null,status:'active',context:input.context}}
 const column=level==='season'?'season_start':level==='month'?'month_start':'week_start'
 return {table:'tasks',row:{title,bucket:level==='season'?'quarter':level,context:input.context,completed:false,[column]:period}}
}

export function validatePlanningParent(input:Record<string,unknown>,parent:Record<string,unknown>,levels:string[]=[]) {
 if(parent.context!==input.context)throw new Error('Parent belongs to a different life area; clarify the intended connection')
 if(input.level==='season') {
  if(parent.year!==Number(String(input.period_start).slice(0,4)))throw new Error('Choose an intention for this year')
 } else {
  const expected=input.level==='month'?'season':'month'
  const bucket=expected==='season'?'quarter':'month'
  if(parent.bucket!==bucket&&!levels.includes(expected))throw new Error('Choose a parent from the preceding planning horizon')
 }
}

/** Match the household's dated week instead of assuming an ISO Monday. */
export function planningWeekStart(date:string,startsOn:number):string {
 if(![0,1,6].includes(startsOn))throw new Error('Invalid household week start')
 const day=new Date(`${date}T12:00:00Z`)
 day.setUTCDate(day.getUTCDate()-(day.getUTCDay()-startsOn+7)%7)
 return day.toISOString().slice(0,10)
}
