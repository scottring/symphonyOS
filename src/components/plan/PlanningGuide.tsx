// src/components/plan/PlanningGuide.tsx
//
// The planning guide: a short introduction and four sheets you can print, one
// per horizon. It is a permanent page, not an onboarding step — nothing here
// is a gate, and none of the four sheets is a prerequisite for another.
//
// PRINTING. The sheets must stay IN FLOW, or the browser paginates nothing:
// a printable subtree lifted out with `position: absolute` leaves the document
// no height, and everything past the first sheet of paper is silently clipped
// (measured: a 2464px week sheet printing as one page). So instead of lifting
// the guide out, the chain of ancestors between it and <body> is tagged on
// mount and the print stylesheet hides each one's OTHER children. The guide
// keeps its place in the document and runs onto as many sides as it needs.
//
// "Print this sheet" marks the other sheets `data-print="off"`, which the
// print stylesheet hides, so one sheet really does print alone at Letter and
// at A4 — see outputs/planning-guide/check-print.mjs.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Printer, ArrowUpRight } from 'lucide-react'
import { MastheadCard } from '@/components/layout/MastheadCard'
import { PAGE_COLUMN } from '@/components/layout/pageLayout'
import { GUIDE_SHEETS, type GuideBand, type GuideBlock, type GuideLevel, type GuideSheet } from '@/lib/planning/guideSheets'

type PrintTarget = GuideLevel | 'all' | null

function Ruled({ tail }: { tail?: string[] }) {
  return (
    <span className="guide-rule">
      <span className="guide-rule-line" />
      {tail?.map((t) => (
        <span key={t} className="guide-rule-tail">{t}: <span className="guide-rule-blank" /></span>
      ))}
    </span>
  )
}

function Block({ block }: { block: GuideBlock }) {
  if (block.kind === 'note') return <p className="guide-note">{block.text}</p>
  if (block.kind === 'open') {
    return (
      <div className="guide-block">
        {block.label && <p className="guide-block-label">{block.label}</p>}
        {block.hint && <p className="guide-block-hint">{block.hint}</p>}
        <div className={`guide-open guide-open-${block.height}`} aria-hidden="true" />
      </div>
    )
  }
  if (block.kind === 'fields') {
    return (
      <div className="guide-fields">
        {block.fields.map((f, i) => (
          <span key={i} className="guide-field" style={{ flexGrow: f.span ?? 1 }}>
            <span className="guide-field-label">{f.label}</span>
            <span className="guide-rule-line" />
          </span>
        ))}
      </div>
    )
  }
  return (
    <div className="guide-block">
      {block.label && <p className="guide-block-label">{block.label}</p>}
      {block.hint && <p className="guide-block-hint">{block.hint}</p>}
      <ul className="guide-lines">
        {Array.from({ length: block.count }, (_, i) => (
          <li key={i} className="guide-line">
            {/* Printed, never drawn: a second signal for a scan when the
                handwriting crosses the boundary between two areas. */}
            {block.glyph && <span className="guide-glyph" aria-hidden="true">{block.glyph}</span>}
            <Ruled tail={block.tail} />
          </li>
        ))}
      </ul>
    </div>
  )
}

/** A stable hook for the print stylesheet, so a band can be laid out in two
 *  columns on paper without the wording deciding it. */
const bandId = (title: string) => title.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '')

function Band({ band, n }: { band: GuideBand; n: number }) {
  return (
    <section className="guide-band" data-band={bandId(band.title)}>
      <h3 className="guide-band-title">
        <span className="guide-band-n">{n}</span>
        {band.title}
        {band.optional && <span className="guide-band-optional">skippable</span>}
      </h3>
      {band.lead && <p className="guide-band-lead">{band.lead}</p>}
      {band.questions && (
        <ul className="guide-questions">
          {band.questions.map((q) => <li key={q}>{q}</li>)}
        </ul>
      )}
      <div className="guide-band-body">
        {band.blocks.map((block, i) => <Block key={i} block={block} />)}
      </div>
    </section>
  )
}

function Sheet({ sheet, printOff, onPrint }: { sheet: GuideSheet; printOff: boolean; onPrint: () => void }) {
  return (
    <article id={sheet.level} className="guide-sheet" data-sheet={sheet.level} data-print={printOff ? 'off' : 'on'}>
      <header className="guide-sheet-head">
        <div className="min-w-0">
          <h2 className="guide-sheet-title">{sheet.title}</h2>
          <p className="guide-sheet-lead">{sheet.lead}</p>
          <p className="guide-sheet-time">About {sheet.minutes} minutes. Works on its own.</p>
        </div>
        <button type="button" onClick={onPrint} className="guide-print-btn guide-screen-only">
          <Printer className="h-4 w-4" aria-hidden="true" />
          Print this sheet
        </button>
      </header>
      {sheet.bands.map((band, i) => <Band key={band.title + i} band={band} n={i + 1} />)}
    </article>
  )
}

/** The class the print stylesheet uses to find the guide's way to <body>. */
export const PRINT_ANCESTOR = 'guide-print-ancestor'

export function PlanningGuide() {
  const [target, setTarget] = useState<PrintTarget>(null)
  const printable = useRef<HTMLDivElement>(null)

  // Tag every ancestor up to <body>, so the stylesheet can hide each one's
  // other children — the sidebar, the top bar, the detail pane — without the
  // guide leaving the document flow. Removed on unmount: the app must print
  // normally again from any other page.
  useEffect(() => {
    const marked: HTMLElement[] = []
    for (let n = printable.current?.parentElement; n; n = n.parentElement) {
      n.classList.add(PRINT_ANCESTOR)
      marked.push(n)
    }
    return () => { for (const n of marked) n.classList.remove(PRINT_ANCESTOR) }
  }, [])

  // The reset belongs to `afterprint` alone: window.print() is modal and
  // synchronous in a browser, so clearing the target straight after it can
  // land before the dialog has read the page.
  useEffect(() => {
    const done = () => setTarget(null)
    window.addEventListener('afterprint', done)
    return () => window.removeEventListener('afterprint', done)
  }, [])

  const print = useCallback((next: PrintTarget) => {
    setTarget(next)
    // One frame, so the data-print attributes are on the DOM before the
    // dialog reads it.
    requestAnimationFrame(() => window.print())
  }, [])

  return (
    <div className={`${PAGE_COLUMN} guide-page`}>
      <div className="guide-screen-only">
        <MastheadCard
          variant="page"
          eyebrow={<span className="text-[12px] uppercase tracking-wider text-neutral-500">Planning</span>}
          title="The planning guide"
          subline={<p className="text-[12px] text-neutral-500">Four sheets you can print. Use one, or none.</p>}
          action={(
            <button type="button" onClick={() => print('all')} className="guide-print-btn">
              <Printer className="h-4 w-4" aria-hidden="true" />
              Print all four
            </button>
          )}
        />

        <section className="guide-intro">
          <p>
            These sheets are an aid, not a format you have to obey. An ordinary notebook works just
            as well, and so does writing nothing down at all. Each sheet stands on its own: filling
            in the week sheet every week and never touching the others is using this correctly.
          </p>
          <p>
            Every sheet asks the same five things in the same order — which period this is, what
            happened, what the period already holds, what matters, and what that means in practice.
            The questions under “what matters” change with the horizon, because a week and a year
            are not asking the same thing.
          </p>
          <p>
            <strong>Leave blanks blank.</strong> A date you have not decided, an owner nobody has
            agreed to, a priority you are not sure about — all of those are better left empty than
            guessed at. Nothing filled in here is a commitment until you make it one.
          </p>
          <h2>Bringing a filled-in sheet back</h2>
          <p>
            You can photograph a sheet and have Symphony read it — <Link to="/today" className="guide-link">Plan
            from paper <ArrowUpRight className="mb-0.5 inline h-3 w-3" /></Link> — or simply type
            things in yourself; both work, and neither is the “right” way.
          </p>
          <p>
            When a page is read, you see what it read and what it proposes — outcomes, actions,
            repeats, fixed dates, and the things you marked as undecided — alongside your original
            notes, which are kept. You choose what to keep before anything is saved. Where the
            handwriting or the intent is unclear, you are asked rather than having a date, a
            repetition or an owner invented for you. A phrase like “swim Tuesday” on its own does
            not make a weekly routine.
          </p>
          <p className="guide-source">
            The prompts here are Symphony’s own. Two published <em>Best Laid Plans</em> show notes
            on monthly and seasonal planning were read as background; nothing from the book or the
            episodes is reproduced.
          </p>
        </section>
      </div>

      <div ref={printable} className="guide-print" data-print-target={target ?? 'none'}>
        {GUIDE_SHEETS.map((sheet) => (
          <Sheet
            key={sheet.level}
            sheet={sheet}
            printOff={target !== null && target !== 'all' && target !== sheet.level}
            onPrint={() => print(sheet.level)}
          />
        ))}
      </div>
    </div>
  )
}
