export type PlanScene = 'year' | 'season' | 'month' | 'week' | 'today' | 'summary'
export type Scene = 'welcome' | PlanScene | 'dinner' | 'cooking'
export const sequence: PlanScene[] = ['year', 'season', 'month', 'week', 'today', 'summary']
export type Thread = { id: string; area: string; year: string; season: string; month: string; week: string; color: string }
export const threads: Thread[] = [
 { id:'health', area:'Health', year:'Feel healthier and stronger', season:'Find a training rhythm that fits', month:'Get a training plan ready to follow', week:'Book a training consultation', color:'sage' },
 { id:'family', area:'Family', year:'Make time for each other', season:'Enjoy more unhurried time together', month:'Plan a family picnic', week:'Choose a picnic day together', color:'clay' },
 { id:'work', area:'Work', year:'Do work that matters', season:'Explore a meaningful next chapter', month:'Have two conversations about work', week:'Arrange the first conversation', color:'blue' },
 { id:'home', area:'Home', year:'Make our home easier to live in', season:'Make space before winter', month:'Clear the shed before the first frost', week:'Set aside an hour for the shed', color:'ochre' },
]
export type Plan = { threads: Thread[]; today: string[]; other: { id:string; title:string; period:PlanScene }[] }
export type State = { scene: Scene; returnTo: PlanScene; draft: Plan; saved: Plan|null; checkedIngredients: string[]; done: string[]; reply: string; heard: string; revision:number }
export const responses: Record<Scene,string> = {
 welcome:'What would you like to make room for?',
 year:'Here are four things that matter in this example. Let’s look at the whole year together. What would you change?',
 season:'Keeping all four intentions in view, what would meaningful progress look like this Fall? These are possibilities, not commitments yet.',
 month:'Now let’s make October manageable. Here’s what each seasonal direction could become this month. Leave room for everyday life, too.',
 week:'What can you actually do this week? Your monthly plans stay connected as we turn them into concrete actions.',
 today:'You don’t have to do it all today. Choose what fits. Everything else can stay in this week’s plan.',
 summary:'Here’s the thread from what matters to what happens next. Take a look before saving this sample plan.',
 dinner:'Tonight’s example is tomato pasta and salad. About thirty minutes. Your planning conversation is still here whenever you want it.',
 cooking:'Let’s bring the recipe forward. Ingredients on the left, steps on the right. Check things off as you go.',
}
export const initialState: State = {scene:'welcome',returnTo:'year',draft:{threads,today:['health'],other:[]},saved:null,checkedIngredients:[],done:[],reply:responses.welcome,heard:'',revision:0}
export type Action = {type:'say';text:string}|{type:'edit';id:string;field:'year'|'season'|'month'|'week';value:string}|{type:'selectToday';id:string}|{type:'ingredient';name:string}|{type:'save'}|{type:'add';title:string;period:PlanScene}|{type:'complete';id:string}
export function interpret(text:string): Scene|'back'|'save'|'unknown' {
 const s=text.toLowerCase().replace(/[’']/g,'').trim()
 if (/back to.*plan|return to.*plan|back to.*conversation|where were we/.test(s)) return 'back'
 if (/save.*plan|keep this plan/.test(s)) return 'save'
 if (/show.*recipe|lets cook|start cooking|ingredients|how.*cook/.test(s)) return 'cooking'
 if (/dinner|eat tonight|tonights meal/.test(s)) return 'dinner'
 if (/finish|review.*plan|looks good|show.*whole plan/.test(s)) return 'summary'
 if (/today|just.*day/.test(s)) return 'today'
 if (/week/.test(s)) return 'week'
 if (/month|october/.test(s)) return 'month'
 if (/season|fall/.test(s)) return 'season'
 if (/year|big picture/.test(s)) return 'year'
 return 'unknown'
}
export function reducer(state:State,action:Action):State {
 switch(action.type){
 case 'say': {const intent=interpret(action.text);if(intent==='unknown')return {...state,heard:action.text,reply:'This is a scripted rehearsal, so I can’t interpret that freely yet. Try a suggested phrase below, or edit any item directly.'};if(intent==='save')return {...state,heard:action.text,reply:'Use “Save sample plan” to confirm. Looking at an idea does not save it.'};const scene=intent==='back'?state.returnTo:intent;return {...state,scene,heard:action.text,reply:responses[scene],returnTo:sequence.includes(scene as PlanScene)?scene as PlanScene:state.returnTo}}
 case 'edit': return {...state,revision:state.revision+1,draft:{...state.draft,threads:state.draft.threads.map(t=>t.id===action.id?{...t,[action.field]:action.value}:t)},reply:'Updated in your draft. The connection to the rest of your plan stays intact.'}
 case 'selectToday': return {...state,revision:state.revision+1,draft:{...state.draft,today:state.draft.today.includes(action.id)?state.draft.today.filter(id=>id!==action.id):[...state.draft.today,action.id]}}
 case 'add':if(action.period==='year')return {...state,revision:state.revision+1,draft:{...state.draft,threads:[...state.draft.threads,{id:`intention-${state.revision}`,area:'Your intention',year:action.title,season:'',month:'',week:'',color:'sage'}]},reply:'Your new intention is in the draft. It will stay with the others as we look at each period.'};return {...state,revision:state.revision+1,draft:{...state.draft,other:[...state.draft.other,{id:`other-${state.revision}`,title:action.title,period:action.period}]},reply:'Added independently to your draft. It does not need a bigger goal to belong here.'}
 case 'save':return {...state,saved:structuredClone(state.draft),reply:'Your sample plan is saved for this rehearsal. Nothing was added to your real account.'}
 case 'ingredient':return {...state,checkedIngredients:state.checkedIngredients.includes(action.name)?state.checkedIngredients.filter(n=>n!==action.name):[...state.checkedIngredients,action.name]}
 case 'complete':return {...state,done:state.done.includes(action.id)?state.done.filter(id=>id!==action.id):[...state.done,action.id]}
 }
}
export const sceneLibrary:Record<Scene,{eyebrow:string;title:string;kind:string;chips:string[]}>={
 welcome:{eyebrow:'A LITTLE ROOM TO THINK',title:'Start with what’s on your mind.',kind:'invitation',chips:['Let’s plan the year','Help me plan this week','What’s for dinner?']},
 year:{eyebrow:'2026 · THE WHOLE PICTURE',title:'What matters to you.',kind:'intention-field',chips:['Let’s look at the season','What’s for dinner?']},
 season:{eyebrow:'FALL · OCTOBER TO DECEMBER',title:'A season of possibility.',kind:'milestone-groups',chips:['Let’s shape October','Back to the year','What’s for dinner?']},
 month:{eyebrow:'OCTOBER · MAKING ROOM',title:'A little more concrete.',kind:'connected-plans',chips:['What can I do this week?','Back to the season','What’s for dinner?']},
 week:{eyebrow:'OCTOBER 10–16 · A WORKABLE WEEK',title:'From intention to action.',kind:'action-clusters',chips:['What fits today?','Back to the month','What’s for dinner?']},
 today:{eyebrow:'MONDAY, OCTOBER 12 · SAMPLE DAY',title:'Enough for today.',kind:'day-composition',chips:['Let’s review the plan','Back to this week','What’s for dinner?']},
 summary:{eyebrow:'YOUR DRAFT · YEAR TO TODAY',title:'One connected plan.',kind:'plan-thread',chips:['Back to this week','What’s for dinner?']},
 dinner:{eyebrow:'AT THE TABLE · SHARED HOUSEHOLD',title:'Something good for tonight.',kind:'meal-focus',chips:['Show me the recipe','Back to my planning conversation']},
 cooking:{eyebrow:'TOMATO PASTA & SALAD · SERVES FOUR',title:'Let’s cook.',kind:'cooking-focus',chips:['Back to my planning conversation','What’s for dinner?']},
}
