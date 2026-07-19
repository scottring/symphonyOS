import { describe, it, expect } from 'vitest';
import { WALL, PERSON_ACCENTS, personAccent, wallQuote } from './wallTheme';

describe('wallTheme', () => {
  it('tokens pair a light value with a warm-dark twin', () => {
    for (const token of [WALL.root, WALL.rail, WALL.card, WALL.cardInset, WALL.dinnerCard]) {
      expect(token).toContain('dark:');
    }
  });
  it('personAccent cycles through the 4 accents', () => {
    expect(personAccent(0)).toBe(PERSON_ACCENTS[0]);
    expect(personAccent(4)).toBe(PERSON_ACCENTS[0]);
    expect(personAccent(5)).toBe(PERSON_ACCENTS[1]);
  });
  it('wallQuote is deterministic per day and rotates across days', () => {
    const a1 = wallQuote(new Date('2026-07-19T08:00:00'));
    const a2 = wallQuote(new Date('2026-07-19T22:00:00'));
    expect(a1).toEqual(a2);
    const texts = new Set(
      [0, 1, 2, 3, 4].map((d) => wallQuote(new Date(2026, 6, 19 + d)).text),
    );
    expect(texts.size).toBeGreaterThan(1);
  });
});
