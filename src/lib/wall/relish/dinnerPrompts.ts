// Relish's dinner prompts, bundled for the kitchen wall (Scott, 2026-11-19:
// "a Relish section of the kiosk, with dinnertime activities and
// conversation starters"). Copied from Relish's library
// (parentpulse-web functions/data/dinner-prompts.json, 50 prompts), with one
// kid prompt reworded so it doesn't assume who the grown-ups are
// ("Mom or Dad" → "a grown-up in our family") and apostrophes set as ’ like
// the rest of the wall's copy. Static: no query, no network.

export type RelishAudience = 'kid' | 'adult'

export interface DinnerPrompt {
  id: string
  text: string
  themes: string[]
  audiences: RelishAudience[]
}

export const DINNER_PROMPTS: readonly DinnerPrompt[] = [
  { id: "courage-001", text: "What’s one small brave thing you did today?", themes: ["courage"], audiences: ["kid", "adult"] },
  { id: "courage-002", text: "When you’re nervous, what helps you feel a little braver?", themes: ["courage"], audiences: ["kid", "adult"] },
  { id: "courage-003", text: "What’s something you used to be scared of that doesn’t scare you anymore?", themes: ["courage"], audiences: ["kid"] },
  { id: "courage-004", text: "When was the last time you said yes to something that scared you a little?", themes: ["courage"], audiences: ["adult"] },
  { id: "courage-005", text: "If you could try one new thing this week with zero chance of failing, what would it be?", themes: ["courage", "dreams"], audiences: ["kid", "adult"] },
  { id: "gratitude-001", text: "What’s one tiny thing today that made you feel lucky?", themes: ["gratitude"], audiences: ["kid", "adult"] },
  { id: "gratitude-002", text: "Who made you smile today, and what did they do?", themes: ["gratitude", "kindness"], audiences: ["kid", "adult"] },
  { id: "gratitude-003", text: "What’s a thing in our house you’d really miss if it disappeared tomorrow?", themes: ["gratitude"], audiences: ["kid"] },
  { id: "gratitude-004", text: "When was the last time someone surprised you with kindness?", themes: ["gratitude", "kindness"], audiences: ["adult"] },
  { id: "gratitude-005", text: "What’s one ordinary thing you’d be sad to live without?", themes: ["gratitude"], audiences: ["adult"] },
  { id: "silliness-001", text: "If our family had a theme song, what would it be and why?", themes: ["silliness"], audiences: ["kid", "adult"] },
  { id: "silliness-002", text: "What’s the silliest thing that happened this week?", themes: ["silliness"], audiences: ["kid", "adult"] },
  { id: "silliness-003", text: "If you could swap places with any animal for one day, which one and what would you do?", themes: ["silliness", "curiosity"], audiences: ["kid"] },
  { id: "silliness-004", text: "What’s the most ridiculous outfit you’d wear if there were no rules?", themes: ["silliness"], audiences: ["kid"] },
  { id: "silliness-005", text: "If we had to give the kids a brand-new family rule, what’s the funniest one you can think of?", themes: ["silliness"], audiences: ["adult"] },
  { id: "kindness-001", text: "Who needs a little extra kindness right now? What’s one thing we could do?", themes: ["kindness"], audiences: ["kid", "adult"] },
  { id: "kindness-002", text: "What’s something nice someone did for you today that you didn’t get to thank them for?", themes: ["kindness", "gratitude"], audiences: ["kid", "adult"] },
  { id: "kindness-003", text: "If you could send a secret kind message to someone, who would you send it to?", themes: ["kindness"], audiences: ["kid"] },
  { id: "kindness-004", text: "When was the last time being kind cost you something — and was it worth it?", themes: ["kindness"], audiences: ["adult"] },
  { id: "kindness-005", text: "Who in our life have we been forgetting to call?", themes: ["kindness", "family-history"], audiences: ["adult"] },
  { id: "curiosity-001", text: "What’s a question you’ve been wondering about lately?", themes: ["curiosity"], audiences: ["kid", "adult"] },
  { id: "curiosity-002", text: "If you could learn anything tomorrow with no effort, what would you pick?", themes: ["curiosity", "dreams"], audiences: ["kid", "adult"] },
  { id: "curiosity-003", text: "What’s something you saw today that you wanted to know more about?", themes: ["curiosity"], audiences: ["kid"] },
  { id: "curiosity-004", text: "What’s a topic you used to find boring that you’re starting to like?", themes: ["curiosity"], audiences: ["adult"] },
  { id: "curiosity-005", text: "If you could spend one day inside any book or movie, which one?", themes: ["curiosity", "dreams"], audiences: ["kid", "adult"] },
  { id: "family-history-001", text: "What’s a story about a grown-up in our family as a kid that you want to hear again?", themes: ["family-history"], audiences: ["kid"] },
  { id: "family-history-002", text: "What’s something you remember from when you were exactly the age the kids are now?", themes: ["family-history"], audiences: ["adult"] },
  { id: "family-history-003", text: "What family tradition do you love most? Which one should we start fresh?", themes: ["family-history"], audiences: ["kid", "adult"] },
  { id: "family-history-004", text: "Who’s someone in our family you wish you knew better?", themes: ["family-history", "curiosity"], audiences: ["kid", "adult"] },
  { id: "family-history-005", text: "What’s a thing your parents used to say that you catch yourself saying now?", themes: ["family-history"], audiences: ["adult"] },
  { id: "dreams-001", text: "If you could be amazing at one thing by next year, what would you pick?", themes: ["dreams"], audiences: ["kid", "adult"] },
  { id: "dreams-002", text: "What’s one place in the world you really want to go someday?", themes: ["dreams", "curiosity"], audiences: ["kid", "adult"] },
  { id: "dreams-003", text: "If you ran the world for a day, what would you change first?", themes: ["dreams"], audiences: ["kid"] },
  { id: "dreams-004", text: "What’s something you wanted as a kid that you actually have now?", themes: ["dreams", "gratitude"], audiences: ["adult"] },
  { id: "dreams-005", text: "What would you do tomorrow if you knew you couldn’t fail?", themes: ["dreams", "courage"], audiences: ["adult"] },
  { id: "connection-001", text: "When did you feel most like yourself this week?", themes: ["connection"], audiences: ["adult"] },
  { id: "connection-002", text: "What’s something you wish I knew about your week?", themes: ["connection"], audiences: ["adult"] },
  { id: "connection-003", text: "What’s one thing about our family right now that you’d want to remember in ten years?", themes: ["connection", "family-history"], audiences: ["adult"] },
  { id: "connection-004", text: "What’s something I do that helps you feel loved?", themes: ["connection", "kindness"], audiences: ["adult"] },
  { id: "connection-005", text: "What’s a quiet thing about us that’s working really well lately?", themes: ["connection"], audiences: ["adult"] },
  { id: "challenge-001", text: "What’s one thing that was hard today, and what helped?", themes: ["challenge"], audiences: ["kid", "adult"] },
  { id: "challenge-002", text: "When you make a mistake, what’s the first thing you usually do?", themes: ["challenge"], audiences: ["kid", "adult"] },
  { id: "challenge-003", text: "What’s something you’re working on that’s harder than it looks from the outside?", themes: ["challenge"], audiences: ["adult"] },
  { id: "challenge-004", text: "What’s a thing you used to find hard that’s gotten easier?", themes: ["challenge"], audiences: ["kid", "adult"] },
  { id: "challenge-005", text: "Who in our family is really good at handling hard things — and what do they do that we could borrow?", themes: ["challenge"], audiences: ["kid", "adult"] },
  { id: "wonder-001", text: "What’s the weirdest thing you’ve thought about today?", themes: ["curiosity", "silliness"], audiences: ["kid"] },
  { id: "wonder-002", text: "What’s something tiny you noticed today that most people would miss?", themes: ["curiosity"], audiences: ["kid", "adult"] },
  { id: "wonder-003", text: "If trees could talk, what do you think the oldest one near our house would say?", themes: ["curiosity", "silliness"], audiences: ["kid"] },
  { id: "wonder-004", text: "What’s one belief you have now that your younger self would be surprised by?", themes: ["curiosity"], audiences: ["adult"] },
  { id: "wonder-005", text: "What do you think we’ll be doing five years from tonight?", themes: ["dreams", "curiosity"], audiences: ["kid", "adult"] },
]
