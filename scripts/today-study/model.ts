export type Task={id:string;title:string;parent?:string;date:string|null;done:boolean}
export const dates=['2026-10-12','2026-10-13','2026-10-14']
export const sample:Task[]=[{id:'a',title:'Book a training consultation',parent:'Get a training plan ready',date:null,done:false},{id:'b',title:'Choose a picnic day together',parent:'Make time for each other',date:null,done:false},{id:'c',title:'Clear one shelf in the shed',parent:'Make space before winter',date:null,done:false},{id:'d',title:'Prepare questions for Alex',parent:'Explore meaningful work',date:dates[0],done:false}]
export type Action={type:'schedule';id:string;date:string|null}|{type:'complete';id:string}|{type:'add';task:Task}
export function update(tasks:Task[],action:Action):Task[]{
 if(action.type==='add')return tasks.some(t=>t.id===action.task.id)?tasks:[...tasks,action.task]
 if(action.type==='schedule'&&action.date!==null&&!dates.includes(action.date))return tasks
 return tasks.map(t=>t.id!==action.id?t:action.type==='complete'?{...t,done:!t.done}:{...t,date:action.date})
}
