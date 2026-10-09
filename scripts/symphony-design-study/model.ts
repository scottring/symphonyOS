export const horizons = ['Year', 'Season', 'Month', 'Week', 'Today'] as const
export type Horizon = typeof horizons[number]
export type Item = { id: string; title: string; horizon: Horizon; parent?: string; done?: boolean }
export const labels: Record<Horizon, string> = {Year:'2026',Season:'Fall 2026',Month:'October',Week:'October 10–16',Today:'Monday, October 12'}
export const initialItems: Item[] = [
 {id:'y1',horizon:'Year',title:'Feel healthy and strong'},
 {id:'y2',horizon:'Year',title:'Make time for each other'},
 {id:'y3',horizon:'Year',title:'Do work that matters'},
 {id:'y4',horizon:'Year',title:'Make our home easier to live in'},
 {id:'s1',horizon:'Season',parent:'y1',title:'Find a training rhythm that fits my life'},
 {id:'s2',horizon:'Season',parent:'y2',title:'Enjoy more unhurried family time'},
 {id:'s3',horizon:'Season',parent:'y3',title:'Explore a meaningful next chapter'},
 {id:'s4',horizon:'Season',parent:'y4',title:'Make space before winter'},
 {id:'m1',horizon:'Month',parent:'s1',title:'Get my training plan ready to follow'},
 {id:'m2',horizon:'Month',parent:'s2',title:'Plan a family picnic'},
 {id:'m3',horizon:'Month',parent:'s3',title:'Have two conversations about meaningful work'},
 {id:'m4',horizon:'Month',parent:'s4',title:'Clear the shed before the first frost'},
 {id:'w1',horizon:'Week',parent:'m1',title:'Book a training consultation'},
 {id:'w2',horizon:'Week',parent:'m2',title:'Choose a picnic day together'},
 {id:'w3',horizon:'Week',parent:'m4',title:'Set aside an hour for the shed'},
]
export function broader(horizon: Horizon): Horizon | undefined {return horizons[horizons.indexOf(horizon)-1]}
export function contextFor(item: Item, items: Item[]): string | undefined {return items.find(i=>i.id===item.parent)?.title}
