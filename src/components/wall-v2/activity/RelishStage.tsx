// Relish at the kitchen table (Scott, 2026-11-19: "can we have a Relish
// section of the kiosk, with dinnertime activities and conversation
// starters?"). Relish in the wall's bar, after Dinner.
//
//   lead   Tonight's question: one conversation starter, the same for
//          everyone all day; Another walks on. Kids at the table (the
//          default) or Just grown-ups picks which prompts.
//   side   Dinnertime activities: eight table games as cards. A card opens
//          the game's steps large, in place, with All games to go back.
//
// Nobody touches the wall while the family talks, so the stage holds itself
// open (stageHoldsOpen) and goes back on its own after RELISH_STAGE_MAX_MS
// untouched, so it never sits there overnight.
//
// Presentation only: the prompts and games are bundled (lib/wall/relish);
// nothing here reads or writes.

import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ChevronRight, Shuffle } from 'lucide-react'
import type { RelishAudience } from '@/lib/wall/relish/dinnerPrompts'
import { RELISH_GAMES, type RelishGame } from '@/lib/wall/relish/games'
import { localDayNumber, tonightsPrompt } from '@/lib/wall/relish/tonight'

export const RELISH_STAGE_MAX_MS = 60 * 60_000

const AUDIENCES: { id: RelishAudience; label: string }[] = [
  { id: 'kid', label: 'Kids at the table' },
  { id: 'adult', label: 'Just grown-ups' },
]

function GameView({ game, day, onBack }: { game: RelishGame; day: number; onBack: () => void }) {
  const deck = game.deck
  // A deck starts on the day's own card, so the first Would-you-rather
  // isn't always the same one.
  const [at, setAt] = useState(() => (deck ? day % deck.items.length : 0))
  return (
    <div className="kr-game">
      <div className="kr-game-head">
        <button type="button" className="kw-btn is-quiet" onClick={onBack}><ArrowLeft aria-hidden="true" />All games</button>
        <h3>{game.name}</h3>
      </div>
      <ol className="kr-steps">
        {game.steps.map((s) => <li key={s}>{s}</li>)}
      </ol>
      {deck && (
        <div className={`kr-deck is-${deck.show}`}>
          <p className="kw-eyebrow is-sym">{deck.label}</p>
          {deck.show === 'one' ? (
            <div className="kr-deck-row">
              <p className="kr-deck-card" aria-live="polite">{deck.items[at]}</p>
              {deck.next && deck.items.length > 1 && (
                <button type="button" className="kw-btn is-quiet" onClick={() => setAt((at + 1) % deck.items.length)}>
                  {deck.next}<ChevronRight aria-hidden="true" />
                </button>
              )}
            </div>
          ) : (
            <ul className="kr-joys">{deck.items.map((j) => <li key={j}>{j}</li>)}</ul>
          )}
        </div>
      )}
    </div>
  )
}

export function RelishStage({ now, onClose }: { now: Date; onClose?: () => void }) {
  const [audience, setAudience] = useState<RelishAudience>('kid')
  // Another's taps, kept with the day they were made on: a new day starts
  // again from its own pick.
  const [another, setAnother] = useState({ day: -1, step: 0 })
  const [openId, setOpenId] = useState<string | null>(null)
  const [touch, setTouch] = useState(0)
  const day = localDayNumber(now)
  const step = another.day === day ? another.step : 0
  const prompt = useMemo(() => tonightsPrompt(now, audience, step), [now, audience, step])
  const game = RELISH_GAMES.find((g) => g.id === openId) ?? null

  useEffect(() => {
    if (!onClose) return
    const id = setTimeout(onClose, RELISH_STAGE_MAX_MS)
    return () => clearTimeout(id)
  }, [onClose, touch])

  return (
    <div className="kr-stage" onPointerDown={() => setTouch((t) => t + 1)}>
      <section className="kr-tonight" aria-label="Tonight’s question">
        <p className="kw-eyebrow is-sym"><span className="kr-mark">Relish</span> · Tonight’s question</p>
        <div className="kr-who" role="group" aria-label="Who’s at the table">
          {AUDIENCES.map((a) => (
            <button key={a.id} type="button" aria-pressed={audience === a.id} onClick={() => { setAudience(a.id); setAnother({ day, step: 0 }) }}>
              {a.label}
            </button>
          ))}
        </div>
        <p className={`kr-q ${prompt && prompt.text.length > 90 ? 'is-long' : ''}`} aria-live="polite">{prompt?.text}</p>
        <div className="kw-acts">
          <button type="button" className="kw-btn is-quiet" onClick={() => setAnother({ day, step: step + 1 })}><Shuffle aria-hidden="true" />Another</button>
        </div>
      </section>
      <div className="kw-vr" aria-hidden="true" />
      <section className="kr-games" aria-label="Dinnertime activities">
        {game ? <GameView key={game.id} game={game} day={day} onBack={() => setOpenId(null)} /> : (
          <>
            <p className="kw-eyebrow">Dinnertime activities</p>
            <ul className="kr-grid">
              {RELISH_GAMES.map((g) => (
                <li key={g.id}>
                  <button type="button" className="kr-card" onClick={() => setOpenId(g.id)}>
                    <h3>{g.name}</h3>
                    <p>{g.hook}</p>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  )
}
