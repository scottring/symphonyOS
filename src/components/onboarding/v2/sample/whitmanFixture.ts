// Hand-authored sample plan for /onboarding/sample. Decoupled from real demo
// data so it can evolve independently for the marketing surface.

export interface SampleMeal {
  slot: 'breakfast' | 'lunch' | 'snack' | 'dinner' | 'prep'
  title: string
  detail?: string
  forWho?: string
}

export interface SampleDay {
  dayOfWeek: number
  label: string
  date: string
  meals: SampleMeal[]
}

export interface SampleHabit {
  whenLabel: string
  what: string
  detail?: string
}

export const WHITMAN_FIXTURE = {
  family: {
    adults: ['Iris', 'Scott'],
    kids: ['Liam (8)', 'Mia (5)'],
  },
  brief: '800g challenge. No stir fry. Bittman shrimp Thursday — finally. Friday off, kids only.',
  habits: [
    { whenLabel: 'Mornings', what: 'Yogurt + cherry tomatoes for Iris', detail: 'kids: HB eggs + sweet potato' },
    { whenLabel: 'Weekday lunch', what: 'Dal + raw veg + apple', detail: 'contributes ~280g' },
    { whenLabel: 'Snack', what: 'Apple + cherry tomatoes', detail: 'around 3pm' },
    { whenLabel: 'Off-night', what: 'Friday — kids only / sitter', detail: 'no cook for adults' },
    { whenLabel: 'Batch-day', what: 'Sunday: dal, eggs, quinoa', detail: 'fuels Mon-Wed lunches' },
  ] as SampleHabit[],
  days: [
    {
      dayOfWeek: 0,
      label: 'Sunday',
      date: 'May 4',
      meals: [
        { slot: 'prep', title: 'Big batch dal + 12 eggs + quinoa', detail: 'fuels Mon-Wed lunches' },
        { slot: 'breakfast', title: 'Oatmeal + berries', forWho: 'family' },
        { slot: 'dinner', title: 'Sheet-pan salmon + broccoli', detail: '~320g veg', forWho: 'family' },
      ],
    },
    {
      dayOfWeek: 1,
      label: 'Monday',
      date: 'May 5',
      meals: [
        { slot: 'breakfast', title: 'Yogurt + tomatoes', forWho: 'Iris' },
        { slot: 'breakfast', title: 'HB eggs + sweet potato', forWho: 'kids' },
        { slot: 'lunch', title: 'Dal + raw veg', detail: 'from Sunday batch', forWho: 'family' },
        { slot: 'dinner', title: 'Roast chicken + carrots', detail: '~400g veg' },
      ],
    },
    {
      dayOfWeek: 2,
      label: 'Tuesday',
      date: 'May 6',
      meals: [
        { slot: 'breakfast', title: 'Yogurt + tomatoes', forWho: 'Iris' },
        { slot: 'lunch', title: 'Dal + apple', detail: 'from Sunday batch' },
        { slot: 'snack', title: 'Apple + cherry tomatoes', detail: '3pm' },
        { slot: 'dinner', title: 'Bowls — quinoa, beans, salsa, avocado' },
      ],
    },
    {
      dayOfWeek: 3,
      label: 'Wednesday',
      date: 'May 7',
      meals: [
        { slot: 'breakfast', title: 'Eggs on toast', forWho: 'family' },
        { slot: 'lunch', title: 'Dal + raw veg', detail: 'last of the batch' },
        { slot: 'dinner', title: 'Pasta + roasted greens' },
      ],
    },
    {
      dayOfWeek: 4,
      label: 'Thursday',
      date: 'May 8',
      meals: [
        { slot: 'breakfast', title: 'Yogurt + tomatoes', forWho: 'Iris' },
        { slot: 'lunch', title: 'School lunch', forWho: 'kids' },
        { slot: 'dinner', title: 'Bittman shrimp + slaw', detail: 'finally' },
      ],
    },
    {
      dayOfWeek: 5,
      label: 'Friday',
      date: 'May 9',
      meals: [
        { slot: 'breakfast', title: 'Toast + fruit', forWho: 'family' },
        { slot: 'dinner', title: 'Pizza night', forWho: 'kids only — sitter', detail: 'adults: night out' },
      ],
    },
  ] as SampleDay[],
  groceriesSummary: {
    total: 27,
    examples: ['cherry tomatoes', 'apples', 'broccoli', 'shrimp', 'red lentils', 'chicken', 'quinoa', 'sweet potato'],
  },
} as const

export const SAMPLE_STATS = {
  days: 6,
  items: 27,
  habits: 5,
}
