// Read the production token definitions without importing its page/layout rules.
// Preview selection is session-local and never writes the user's preferences.
import source from '../../src/index.css?raw'
const base=source.match(/@theme\s*\{([\s\S]*?)\n\}/)?.[1]
if(!base) throw new Error('Symphony theme definitions could not be loaded')
const places=[...source.matchAll(/:root\[data-place='([^']+)'\]\s*\{([^}]+)\}/g)]
const style=document.createElement('style')
style.dataset.workspaceTheme='true'
style.textContent=`:root {${base}}\n${places.map(m=>m[0]).join('\n')}`
document.head.append(style)
export function previewPlace(place:string){
 if(place==='cabin')delete document.documentElement.dataset.place
 else document.documentElement.dataset.place=place
}
