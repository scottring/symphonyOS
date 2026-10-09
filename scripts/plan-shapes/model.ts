export type Node={id:string;parent:string|null;level:number;text:string;color:string}
export const initial:Node[]=[
{id:'family',parent:null,level:0,text:'Make time together',color:'#ca8469'},
{id:'health',parent:null,level:0,text:'Feel stronger',color:'#729877'},
{id:'work',parent:null,level:0,text:'Do meaningful work',color:'#758fa8'},
{id:'weekends',parent:'family',level:1,text:'More unhurried weekends',color:'#ca8469'},
{id:'evenings',parent:'family',level:1,text:'Make everyday evenings count',color:'#ca8469'},
{id:'rhythm',parent:'health',level:1,text:'Find a training rhythm that fits',color:'#729877'},
{id:'chapter',parent:'work',level:1,text:'Explore the next chapter',color:'#758fa8'},
{id:'picnic',parent:'weekends',level:2,text:'Plan a family picnic',color:'#ca8469'},
{id:'movies',parent:'weekends',level:2,text:'Plan a movie night',color:'#ca8469'},
{id:'baseball',parent:'weekends',level:2,text:'Plan an outing to a baseball game',color:'#ca8469'},
{id:'dinner',parent:'evenings',level:2,text:'Choose an evening to cook together',color:'#ca8469'},
{id:'setup',parent:'rhythm',level:2,text:'Get my training setup ready',color:'#729877'},
{id:'conversations',parent:'chapter',level:2,text:'Have two conversations',color:'#758fa8'},
{id:'date',parent:'picnic',level:3,text:'Choose a picnic day',color:'#ca8469'},
{id:'place',parent:'picnic',level:3,text:'Choose a picnic spot',color:'#ca8469'},
{id:'film',parent:'movies',level:3,text:'Ask everyone for a film choice',color:'#ca8469'},
{id:'fixtures',parent:'baseball',level:3,text:'Check the home-game schedule',color:'#ca8469'},
{id:'weather',parent:'date',level:4,text:'Check the weekend weather',color:'#ca8469'}]
export function add(nodes:Node[],node:Node):Node[]{
 if(nodes.some(n=>n.id===node.id)||!node.text.trim()||node.level<0||node.level>4)return nodes
 const parent=nodes.find(n=>n.id===node.parent)
 if(node.parent!==null&&(!parent||parent.level!==node.level-1))return nodes
 if(node.level===0&&node.parent!==null)return nodes
 return [...nodes,{...node,text:node.text.trim(),color:parent?.color||node.color}]
}
export function descendants(nodes:Node[],id:string):Node[]{return nodes.filter(n=>n.parent===id).flatMap(n=>[n,...descendants(nodes,n.id)])}
