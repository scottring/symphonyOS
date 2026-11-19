// Dinnertime activities for the kitchen wall's Relish stage: table games
// that need no phone and no props, just the people sitting down to eat.
// Each has a name, a one-line hook for its card, and a few short steps that
// show large when the card is tapped. Some carry a deck: one Would-you-rather
// at a time, a story opener, a category, or the small joys to pick from.
//
// The story openers and small joys are borrowed from Relish's own play
// content (parentpulse-web src/lib/relish/play-content.ts, the 6–8 and 9–12
// lists). Static: no query, no network.

export interface RelishDeck {
  /** Above the card: "Would you rather…", "Start the story", … */
  label: string
  /** 'one' shows a card at a time with a button for the next; 'all' lays
   *  the whole list out (the small joys to pick from). */
  show: 'one' | 'all'
  items: readonly string[]
  /** The button that moves to the next card ('one' decks). */
  next?: string
}

export interface RelishGame {
  id: string
  name: string
  hook: string
  steps: readonly string[]
  deck?: RelishDeck
}

export const WOULD_YOU_RATHER: readonly string[] = [
  'Fly like a bird, or breathe underwater like a fish?',
  'Have a pet dragon the size of a cat, or a cat the size of a dragon?',
  'Eat breakfast for dinner every night, or dinner for breakfast every morning?',
  'Be able to talk to animals, or speak every language in the world?',
  'Live in a tree house, or in a castle with a moat?',
  'Have a snow day every Friday, or a beach day every Saturday?',
  'Be the size of an ant for a day, or the size of a giraffe?',
  'Only whisper for a day, or only sing for a day?',
  'Have a robot that does your chores, or one that tells you jokes?',
  'Visit the bottom of the ocean, or walk on the moon?',
  'Never have to sleep, or never have to eat?',
  'Have dessert first at every meal, or a surprise treat once a week?',
]

export const STORY_STARTS: readonly string[] = [
  'On our walk, we found…',
  'A friend joined us. It was…',
  'We packed…',
  'When we got stuck, we…',
  'Our adventure began with…',
  'We chose to explore…',
  'Together, we decided to…',
  'By the end, we had…',
]

export const SMALL_JOYS: readonly string[] = [
  'Playing outside',
  'Making something',
  'Reading together',
  'A trip to the park',
  'Baking or cooking',
  'A movie with snacks',
  'Drawing or painting',
  'A bike or scooter ride',
  'A game night',
  'Music turned up loud',
  'Time with a good friend',
  'A trip out for a treat',
]

export const ALPHABET_CATEGORIES: readonly string[] = [
  'Foods',
  'Animals',
  'Places in the world',
  'Things in a kitchen',
  'Names of people',
  'Things that are green',
  'Things you find at the beach',
  'Words that make you smile',
]

export const RELISH_GAMES: readonly RelishGame[] = [
  {
    id: 'rose-thorn-bud',
    name: 'Rose, thorn, bud',
    hook: 'The best bit, the tricky bit, and what’s coming.',
    steps: [
      'Go around the table, one person at a time.',
      'Rose: the best part of your day.',
      'Thorn: a part that was hard or annoying.',
      'Bud: something you’re looking forward to.',
      'Everyone listens until the person is done.',
    ],
  },
  {
    id: 'high-low-funny',
    name: 'High, low, funny',
    hook: 'The top of the day, the bottom, and what made you laugh.',
    steps: [
      'Take turns around the table.',
      'Your high: the best thing that happened today.',
      'Your low: the not-so-good thing.',
      'Your funny: something that made you laugh, or should have.',
    ],
  },
  {
    id: 'would-you-rather',
    name: 'Would you rather',
    hook: 'Two choices. Pick one, then say why.',
    steps: [
      'Someone reads the question out loud.',
      'Everyone picks one, no sitting on the fence.',
      'Go around and say why you chose it.',
    ],
    deck: { label: 'Would you rather…', show: 'one', items: WOULD_YOU_RATHER, next: 'Another one' },
  },
  {
    id: 'two-truths',
    name: 'Two truths and a tale',
    hook: 'Two true things, one made up. Spot the tale.',
    steps: [
      'One person says three things about themselves.',
      'Two are true. One is a tale they made up.',
      'Everyone else guesses which one is the tale.',
      'Reveal it, then the next person goes.',
    ],
  },
  {
    id: 'story-chain',
    name: 'Story chain',
    hook: 'One sentence each. See where the story goes.',
    steps: [
      'Read the start out loud.',
      'The next person adds one sentence to finish it.',
      'Keep going around the table, one sentence each.',
      'After two times round, someone gives it an ending.',
    ],
    deck: { label: 'Start the story', show: 'one', items: STORY_STARTS, next: 'Another start' },
  },
  {
    id: 'guess-my-favorite',
    name: 'Guess my favorite',
    hook: 'Someone picks a small joy in secret. Everyone guesses.',
    steps: [
      'One person secretly picks their favorite from the list.',
      'Everyone else takes one guess each.',
      'The picker says who got it, and why it’s their favorite.',
    ],
    deck: { label: 'Pick one in secret', show: 'all', items: SMALL_JOYS },
  },
  {
    id: 'alphabet',
    name: 'Alphabet around the table',
    hook: 'Pick a category, then go A to Z, one each.',
    steps: [
      'Pick a category together.',
      'The first person names something that starts with A.',
      'The next person does B, and on around the table.',
      'Stuck? The table can help. Q, X and Z can be skipped.',
    ],
    deck: { label: 'Category', show: 'one', items: ALPHABET_CATEGORIES, next: 'Another category' },
  },
  {
    id: 'thank-you',
    name: 'Thank-you round',
    hook: 'Thank someone at the table for one thing.',
    steps: [
      'Go around the table.',
      'Thank one person here for something they did, big or small.',
      'Say what it was, and how it helped.',
      'Make sure everyone gets thanked by someone.',
    ],
  },
]
