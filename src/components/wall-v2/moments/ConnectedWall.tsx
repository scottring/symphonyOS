import { ArrowRight, MessageCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { WallDinnerPreparation, WallMomentContent, type WallMomentsProps } from './WallMoments'
import { useTint } from './tint'
import { usePlaceOrDefault } from '@/hooks/usePlace'
import { useSceneryPreferences } from '@/hooks/useSceneryPreferences'
import { sceneryArt } from '@/components/place/panoramas'
import './connected-wall.css'

/** Presentation only: the live wall owns permissions, fetching and every mutation. */
export function ConnectedWall(p: WallMomentsProps & { isDark?: boolean }) {
  const [screen, setScreen] = useState<'home' | 'notes' | 'meal'>('home')
  const [page, setPage] = useState(0)
  const heading = useRef<HTMLHeadingElement>(null)
  const mounted = useRef(false)
  const tint = useTint(p.members)
  const place = usePlaceOrDefault()
  const scenery = useSceneryPreferences()
  const art = sceneryArt(scenery.sceneryStyle, place, p.isDark && scenery.lightingChoice === 'auto' ? 'nighttime' : scenery.sceneryLighting)
  const pages = Math.max(1, Math.ceil(p.today.length / 3))
  const currentPage = Math.min(page, pages - 1)
  useEffect(() => {
    if (mounted.current) heading.current?.focus()
    mounted.current = true
  }, [screen])
  const W = p.weather
  return <div className="connected-wall">
    <header className="cw-header">
      <span className="cw-brand"><img src="/symphony-logo.png" alt=""/>SYMPHONY <span>OUR HOME</span> {p.freshness}</span>
      <nav className="cw-tools" aria-label="Household tools">{p.actions}<button onClick={() => setScreen(screen === 'home' ? 'notes' : 'home')}>{screen === 'home' ? 'Notes & coming up' : 'Back to Today'}</button></nav>
    </header>
    <div className="cw-heading"><div><p className="cw-date">{p.dateLabel}</p><h1 ref={heading} tabIndex={-1}>{screen === 'home' ? 'Today at home' : screen === 'meal' ? 'Dinner tonight' : 'Notes & coming up'}</h1></div><div className="cw-clock">{W && <span title={W.condition}><W.icon aria-hidden="true" size={32}/>{Math.round(W.temp)}°</span>}<div>{p.clock}<small>Shared household view</small></div></div></div>
    {screen === 'home' ? <>
      <div className="cw-main">
        <section className="cw-schedule" aria-label="Today">
          <h2>Today</h2>
          <div className="cw-specials">{p.specials.find(s => s.isToday)?.cells.filter(c => c.text).map(c => <span key={c.memberId}>{p.kids.find(k => k.id === c.memberId)?.name} · {c.text}</span>)}</div>
          {p.today.length === 0 && <p>Nothing scheduled today.</p>}
          <ul>{p.today.slice(currentPage * 3, currentPage * 3 + 3).map(row => <li key={row.id}><button className={row.past ? 'cw-past' : ''} onClick={() => p.onTapRow(row.id)}><time>{row.time}<small>{row.end}</small></time><span><strong>{row.title}</strong>{row.sub && <small>{row.sub}</small>}<small>{row.owners.map(id => p.members.find(m => m.id === id)?.name).filter(Boolean).join(' · ')}</small></span></button></li>)}</ul>
          {pages > 1 && <nav className="cw-paging" aria-label="Schedule pages"><button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Earlier</button><span>{currentPage + 1} / {pages}</span><button disabled={currentPage === pages - 1} onClick={() => setPage(currentPage + 1)}>Later</button></nav>}
          {p.question && <div className="cw-question"><MessageCircle aria-hidden="true"/><div>{p.question.text}<small>{p.question.isHandoff ? 'Who’s on?' : 'Question of the day'}</small></div><button onClick={p.onTapQuestion}>Open <ArrowRight size={18}/></button></div>}
        </section>
        <section className="cw-moment" aria-label="Now">{p.moment === 'dinner' && p.dinner ? <div className="cw-dinner-summary">{p.dinner.imageUrl ? <img className="cw-food-image" src={p.dinner.imageUrl} alt=""/> : <div className="cw-food-art" aria-hidden="true"><span>✳</span><span>◒</span><span>✳</span></div>}<small>Dinner tonight</small><h2>{p.dinner.title}</h2><p>{p.dinner.cue}{p.dinner.minutes ? ` · ${p.dinner.minutes} min` : ''}</p><div>{p.dinner.hasRecipe && <button onClick={p.dinner.onCook}>Cook from the recipe →</button>}<button onClick={()=>setScreen('meal')}>Ingredients & portions</button></div></div> : <WallMomentContent {...p} t={tint} />}</section>
      </div>
      <section className="cw-family" aria-label="Family routines">{p.checklists.map(({member,list,live},index) => <button className="cw-family-tile" key={member.id} onClick={() => p.onOpenKid(member)}><span className={`cw-avatar tone-${index % 2}`}>{member.name.slice(0,1)}</span><span><strong>{member.name}</strong><small>{live ?? (list?.rows.filter(row=>!row.done).slice(0,2).map(row=>row.title).join(' · ') || list?.title || 'Open day')}</small></span><ArrowRight aria-hidden="true"/></button>)}<button className="cw-family-tile" onClick={()=>setScreen('notes')}><MessageCircle aria-hidden="true"/><span><strong>Coming up</strong><small>{p.comingUp[0]?.summary ?? 'Notes & family plans'}</small></span><ArrowRight aria-hidden="true"/></button></section>
    </> : screen === 'meal' ? <section className="cw-moment cw-meal-expanded" aria-label="Dinner preparation">{p.dinner ? <WallDinnerPreparation d={p.dinner}/> : <p>No dinner selected.</p>}</section> : <div className="cw-notes">
      <section><h2>Notes</h2><button onClick={() => p.scratchpad.onOpen(null)}>Add a note</button>{p.scratchpad.rows.map(note => <button key={note.key} className="cw-note" onClick={() => p.scratchpad.onOpen(note.key)}>{note.text}<small>{note.sub}</small></button>)}</section>
      <section><h2>Coming up</h2>{p.comingUp.length === 0 && <p>Nothing coming up.</p>}{p.comingUp.map(row => <p key={row.dateKey}><strong>{row.dayLabel}</strong> {row.summary}</p>)}</section>
    </div>}
    {scenery.showScenery && <footer className="cw-scenery" aria-hidden="true"><img src={art.src} alt="" /></footer>}
  </div>
}
