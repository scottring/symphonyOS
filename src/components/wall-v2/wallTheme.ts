//
// Warm Nordic token strings for the kiosk (spec 2026-07-19-wall-redesign).
// Each token carries its light value AND its warm-dark twin so components
// never assemble theme classes ad hoc. Hexes are the spec's §4.2/§4.3 values.

export const WALL = {
  root: 'bg-[linear-gradient(170deg,#F8F3E9,#F5EFE2)] dark:bg-[linear-gradient(170deg,#262019,#211B14)] text-[#3D362C] dark:text-[#EFE7D8]',
  rail: 'bg-[#F1EADB] dark:bg-[#2C251B] border border-[#E1D7C2] dark:border-[#3B3226]',
  card: 'bg-[#FDFAF3] dark:bg-[#2E2820] border border-[#E5DAC5] dark:border-[#3E362A] rounded-2xl shadow-[0_1px_4px_rgba(90,75,55,.07)]',
  cardInset: 'bg-[#FBF7EE] dark:bg-[#332C22] border border-[#EDE3CF] dark:border-[#3E362A] rounded-xl',
  label: 'text-[0.7rem] font-bold uppercase tracking-[0.15em] text-[#8A7D68] dark:text-[#A79A82]',
  muted: 'text-[#8A7D68] dark:text-[#A79A82]',
  ink: 'text-[#3D362C] dark:text-[#EFE7D8]',
  inkStrong: 'text-[#2F291F] dark:text-[#F7F1E4]',
  dinnerCard: 'bg-[#FCF5E7] dark:bg-[#332A1D] border border-[#E9D8B4] dark:border-[#4A3D28] rounded-2xl shadow-[0_1px_4px_rgba(90,75,55,.07)]',
  dinnerLabel: 'text-[0.7rem] font-bold uppercase tracking-[0.15em] text-[#A8743F] dark:text-[#D8BC85]',
  prepChip: 'bg-[#F2E4C4] dark:bg-[#4A3D28] text-[#7A5A2E] dark:text-[#D8BC85] rounded-lg px-3 py-1.5 text-[0.8rem] font-bold',
  nowAccent: 'border-l-4 border-l-[#2E4638] dark:border-l-[#4E7261]',
} as const;

export const PERSON_ACCENTS = [
  'border-l-[#7A8E7E]',
  'border-l-[#C9A96B]',
  'border-l-[#D97F5E]',
  'border-l-[#7C93A8]',
] as const satisfies readonly string[];

export function personAccent(index: number): string {
  return PERSON_ACCENTS[index % PERSON_ACCENTS.length];
}

const QUOTES = [
  { text: 'The days are long, but the years are short.', author: 'Gretchen Rubin' },
  { text: 'How we spend our days is, of course, how we spend our lives.', author: 'Annie Dillard' },
  { text: 'The little things? The little moments? They aren\'t little.', author: 'Jon Kabat-Zinn' },
  { text: 'We do not remember days, we remember moments.', author: 'Cesare Pavese' },
  { text: 'Enjoy the little things, for one day you may look back and realize they were the big things.', author: 'Robert Brault' },
] as const;

/** Deterministic daily rotation — same quote all day, next quote tomorrow. */
export function wallQuote(date: Date): { text: string; author: string } {
  const y = date.getFullYear();
  const m = date.getMonth();
  const d = date.getDate();
  // Deterministic index from local calendar day
  const dayIndex = y * 10000 + m * 100 + d;
  return QUOTES[dayIndex % QUOTES.length];
}
