// src/components/wall-v2/WallV2Flap.tsx
//
// The split-flap ("train station departure board") field used by the person
// lanes. Two rules shape this component, and both are about restraint:
//
//  1. It flips ONLY on a genuine content change — never on mount, never on a
//     refetch that returned the same value. On a TV across the room, motion is
//     visible from anywhere in the kitchen, which makes it an excellent "look
//     up, something changed" signal and a terrible decoration. A board that
//     flutters when nothing happened becomes noise within a week.
//
//  2. It animates one element per character, not a stack of folding halves.
//     The wall runs on a Raspberry Pi; a true Solari flap (two half-cards,
//     four nodes each) across four lanes janks. A single rotateX per glyph,
//     staggered, reads mechanical at 8 feet for a fraction of the cost.
//
// The palette deliberately does NOT import the airport black-and-amber. The
// wall shipped warm Nordic; taking a departure board's motion without its
// colour scheme is what keeps the surface one design instead of two.

import { useEffect, useRef, useState } from 'react';

/** Half the flip: the glyph is swapped at the midpoint, edge-on to the viewer. */
const HALF_MS = 110;
/** Per-character stagger, so a time reads as a cascade rather than a blink. */
const STAGGER_MS = 55;

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function FlapChar({ char, index }: { char: string; index: number }) {
  const [shown, setShown] = useState(char);
  const [flipping, setFlipping] = useState(false);
  const mounted = useRef(false);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    // Rule 1: the first render is not a change. Adopt silently.
    if (!mounted.current) {
      mounted.current = true;
      setShown(char);
      return;
    }
    if (char === shown) return;

    if (prefersReducedMotion()) { setShown(char); return; }

    const delay = index * STAGGER_MS;
    const swap = window.setTimeout(() => {
      setFlipping(true);
      // Swap the glyph while the card is edge-on, so the change is never seen.
      timers.current.push(window.setTimeout(() => setShown(char), HALF_MS));
      timers.current.push(window.setTimeout(() => setFlipping(false), HALF_MS * 2));
    }, delay);
    timers.current.push(swap);

    return () => {
      timers.current.forEach(window.clearTimeout);
      timers.current = [];
    };
    // `shown` is deliberately out of the dep list: including it would re-run
    // this effect from inside its own midpoint swap and restart the flip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [char, index]);

  // A blank keeps its cell so the field doesn't reflow mid-flip.
  const isSpacer = shown === ' ';

  return (
    <span
      className={
        'inline-block will-change-transform ' +
        (isSpacer ? 'w-[0.28em]' : 'px-[0.06em]')
      }
      style={{
        transform: flipping ? 'rotateX(90deg)' : 'rotateX(0deg)',
        transition: `transform ${HALF_MS}ms ease-in`,
        transformOrigin: 'center center',
      }}
      aria-hidden="true"
    >
      {isSpacer ? ' ' : shown}
    </span>
  );
}

interface Props {
  /** The value to display. A change here — and only a change — triggers the flip. */
  value: string;
  className?: string;
}

/**
 * Renders `value` as a row of individually-flipping glyphs. The accessible
 * text is exposed once on the wrapper; the glyph spans are aria-hidden so a
 * screen reader reads "3:45", not "3", ":", "4", "5".
 */
export function WallV2Flap({ value, className = '' }: Props) {
  const chars = Array.from(value);
  return (
    <span className={className} aria-label={value} role="text">
      {chars.map((c, i) => (
        <FlapChar key={i} char={c} index={i} />
      ))}
    </span>
  );
}
