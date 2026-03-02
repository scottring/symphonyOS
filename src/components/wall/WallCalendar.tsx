import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useWallData } from '@/hooks/useWallData'
import { useActionableInstances } from '@/hooks/useActionableInstances'
import type { TimelineItem } from '@/types/timeline'
import { WallChoresWidget } from './WallChoresWidget'
import { WallLookAhead } from './WallLookAhead'
import { WallTodayTimeline } from './WallTodayTimeline'
import { WallDinnerWidget, findDinnerEvent, getMealIcon } from './WallDinnerWidget'
import { WallRecipeViewer } from './WallRecipeViewer'
import { useEventNotes } from '@/hooks/useEventNotes'
import { extractRecipeNameHint } from '@/lib/recipeDetection'
import { WallBottomBar } from './WallBottomBar'
import { WallJaxWidget } from './WallJaxWidget'
import { PuppyEasterEgg } from '@/components/PuppyEasterEgg'
import { useContextEngine, ContextDock, ContextOverlay } from './contexts'
import type { ContextEvalData } from './contexts'
import { useWeather } from '@/hooks/useWeather'
import { getWallBackground } from './wallBackground'

function getWeatherEmoji(code: number): string {
  if (code === 0) return '☀️'
  if (code <= 3) return '⛅'
  if (code <= 48) return '🌫️'
  if (code <= 57) return '🌧️'
  if (code <= 67) return '🌧️'
  if (code <= 77) return '❄️'
  if (code <= 82) return '🌦️'
  if (code <= 86) return '🌨️'
  if (code >= 95) return '⛈️'
  return '🌤️'
}

const DAILY_JOKES = [
  'Why did the scarecrow win the award? Because he was outstanding in his field!',
  'What do you call a fake noodle? An impasta!',
  'Why don\'t scientists trust atoms? Because they make up everything!',
  'What do you call a bear with no teeth? A gummy bear!',
  'Why did the bicycle fall over? Because it was two-tired!',
  'What do you call a sleeping dinosaur? A dino-snore!',
  'Why can\'t you give Elsa a balloon? Because she will let it go!',
  'What do you call a dog that does magic? A Labracadabrador!',
  'Why did the math book look so sad? Because it had too many problems!',
  'What do you call cheese that isn\'t yours? Nacho cheese!',
  'Why did the cookie go to the doctor? Because it felt crummy!',
  'What do you call a fish without eyes? A fsh!',
  'Why do cows wear bells? Because their horns don\'t work!',
  'What did the ocean say to the beach? Nothing, it just waved!',
  'Why did the banana go to the doctor? Because it wasn\'t peeling well!',
  'What do you call a snowman with a six-pack? An abdominal snowman!',
  'Why don\'t eggs tell jokes? They\'d crack each other up!',
  'What do you call a boomerang that won\'t come back? A stick!',
  'Why did the golfer bring two pairs of pants? In case he got a hole in one!',
  'What do you call a lazy kangaroo? A pouch potato!',
  'Why did the teddy bear say no to dessert? Because she was already stuffed!',
  'What do you call a pig that does karate? A pork chop!',
  'Why do bees have sticky hair? Because they use honeycombs!',
  'What did one wall say to the other wall? I\'ll meet you at the corner!',
  'Why did the student eat his homework? Because the teacher told him it was a piece of cake!',
  'What do you call a cow with no legs? Ground beef!',
  'Why did the chicken join a band? Because it had the drumsticks!',
  'What do you call a train that sneezes? Achoo-choo train!',
  'Why are ghosts bad liars? Because you can see right through them!',
  'What did the stamp say to the envelope? Stick with me and we\'ll go places!',
  'Why did the tomato turn red? Because it saw the salad dressing!',
  'What do you call a cow on a trampoline? A milkshake!',
  'Why can\'t your nose be 12 inches long? Because then it would be a foot!',
  'What did one plate say to the other? Dinner is on me!',
  'Why did the music teacher go to jail? Because she got caught with too many sharp objects!',
  'What do you call a dinosaur that crashes their car? Tyrannosaurus Wrecks!',
  'Why did the scarecrow become a successful motivational speaker? He was outstanding in his field!',
  'What do you get when you cross a snowman and a vampire? Frostbite!',
  'Why do seagulls fly over the sea? Because if they flew over the bay, they\'d be bagels!',
  'What did the big flower say to the little flower? Hey there, bud!',
  'Why don\'t skeletons fight each other? They don\'t have the guts!',
  'What do you call a group of musical whales? An orca-stra!',
  'Why was the broom late? It over-swept!',
  'What do you call a deer with no eyes? No-eye-deer!',
  'Why did the computer go to the doctor? Because it had a virus!',
  'What do you call a sleeping bull? A bulldozer!',
  'Why did the belt get arrested? For holding up a pair of pants!',
  'What do you get when you cross a centipede and a parrot? A walkie-talkie!',
  'Why are peppers the best at archery? Because they habanero!',
  'What did the left eye say to the right eye? Between us, something smells!',
  'Why do ducks have tail feathers? To cover their butt quacks!',
  'What do you call a fairy that hasn\'t taken a bath? Stinkerbell!',
  'Why did the kid throw the clock out the window? To see time fly!',
  'What do you call a funny mountain? Hill-arious!',
  'Why was the math test crying? It had too many problems to solve!',
  'What animal is always at a baseball game? A bat!',
  'Why did the robot go on vacation? To recharge his batteries!',
  'What do you call a duck that gets all A\'s? A wise quacker!',
  'Why did the melon jump into the lake? It wanted to be a watermelon!',
  'What do you call a cat that bowls? An alley cat!',
  'Why was the baby strawberry crying? Because its parents were in a jam!',
  'What kind of tree fits in your hand? A palm tree!',
  'Why are fish so smart? Because they live in schools!',
  'What did the janitor say when he jumped out of the closet? Supplies!',
  'Why did the crayon feel sad? It was feeling blue!',
  'What do elves learn in school? The elf-abet!',
  'Why was six afraid of seven? Because seven ate nine!',
  'What do you call a monster who loves to dance? The boogieman!',
  'Why couldn\'t the pony sing? Because it was a little horse!',
  'What falls in winter but never gets hurt? Snow!',
  'Why did the boy bring a ladder to school? Because he wanted to go to high school!',
  'What has ears but can\'t hear? A cornfield!',
  'Why do birds fly south in winter? Because it\'s too far to walk!',
  'What did one hat say to the other? Stay here, I\'m going on ahead!',
  'Why is a baseball stadium always cool? Because it\'s full of fans!',
  'What do clouds wear under their raincoats? Thunderwear!',
  'Why did the picture go to jail? Because it was framed!',
  'What do you call a race between two lettuce heads? A head of lettuce!',
  'Why did the man put his money in the freezer? He wanted cold hard cash!',
  'What do you call an alligator in a vest? An investigator!',
  'Why did the owl say "tweet"? Because she didn\'t give a hoot!',
  'What did the traffic light say to the car? Don\'t look, I\'m about to change!',
  'Why did the peanut get into the rocket? He wanted to be an astro-nut!',
  'What do you call a cat that was caught by the police? The purrpetrator!',
  'Why did the leaf go to the doctor? It was feeling green!',
  'What sits at the bottom of the sea and twitches? A nervous wreck!',
  'Why do mushrooms get invited to all the parties? Because they\'re such fungi!',
  'What did the paper say to the pencil? Write on!',
  'Why are elevator jokes so good? They work on many levels!',
  'What do you call a penguin in the desert? Lost!',
  'Why did the orange stop rolling? It ran out of juice!',
  'What do you call two birds in love? Tweethearts!',
  'Why was the calendar so popular? Because it had a lot of dates!',
  'What did the zero say to the eight? Nice belt!',
  'Why did the cow go to outer space? To see the moooon!',
  'What do you call a fly without wings? A walk!',
  'Why did the baseball player bring a rope? He wanted to tie the score!',
  'What is a witch\'s favorite subject in school? Spelling!',
  'Why did the gym close down? It just didn\'t work out!',
  'What do you call a pile of cats? A meow-ntain!',
  'Why did the invisible man turn down the job offer? He couldn\'t see himself doing it!',
  'What do you call a dog magician? A Labracadabrador!',
  'Why was the fraction apprehensive about marrying the decimal? Because he\'d have to convert!',
  'What\'s a pirate\'s favorite letter? You\'d think it\'s R, but it\'s really the C!',
  'Why did the coffee file a police report? It got mugged!',
  'What do you get when you cross a vampire and a snowman? Frostbite!',
  'Why did the police officer go to the baseball game? He heard someone stole a base!',
  'What do you call a sleeping pizza? A piZZZZa!',
  'Why can\'t Cinderella play soccer? Because she always runs away from the ball!',
  'What did the grape do when it got stepped on? It let out a little wine!',
  'Why are penguins socially awkward? Because they can\'t break the ice!',
  'What do you call a can opener that doesn\'t work? A can\'t opener!',
  'Why did the gum cross the road? It was stuck on the chicken\'s foot!',
  'What kind of shoes do ninjas wear? Sneakers!',
  'Why did the bee get married? Because he found his honey!',
  'What do you call a cow that plays an instrument? A moo-sician!',
  'Why did the skeleton go to the barbecue? To get another rib!',
  'What did one volcano say to the other? I lava you!',
  'Why are spiders great web developers? They know all about the web!',
  'What do you call a sheep with no legs? A cloud!',
  'Why did the book go to the hospital? Because it had a broken spine!',
  'What do you get if you cross a cat with a dark horse? Kitty Perry!',
  'Why did the sun go to school? To get brighter!',
  'What\'s orange and sounds like a parrot? A carrot!',
  'Why did the astronaut break up with his girlfriend? He needed more space!',
  'What do you call a sleeping T-Rex? A dino-snore!',
  'Why did the hipster burn his tongue? He drank his coffee before it was cool!',
  'What do you call a belt made of watches? A waist of time!',
  'Why did the scarecrow keep getting promoted? Because he was outstanding in his field!',
  'What\'s a vampire\'s favorite fruit? A blood orange!',
  'Why did the tree go to the dentist? It needed a root canal!',
  'What do you call a bear caught in the rain? A drizzly bear!',
  'Why couldn\'t the leopard play hide and seek? Because he was always spotted!',
  'What do you call a shoe made of a banana? A slipper!',
  'Why do potatoes make good detectives? Because they keep their eyes peeled!',
  'What did the calculator say to the student? You can count on me!',
  'Why did the pelican get kicked out of the restaurant? Because he had a big bill!',
  'What do you call a rabbit with fleas? Bugs Bunny!',
  'Why was the metal so unreliable? Because it kept steeling things!',
  'What did the shark say when he ate the clownfish? That tasted a little funny!',
  'Why do hummingbirds hum? Because they don\'t know the words!',
  'What do you call a pile of kittens? A meowntain!',
  'Why did the computer get glasses? To improve its website!',
  'What do you call a pig that knows karate? Pork chop!',
  'Why did the barber win the race? Because he took a shortcut!',
  'What do you call a cheese that\'s not your cheese? Nacho cheese!',
  'Why do bicycles fall over? Because they\'re two-tired!',
  'What did one eye say to the other? Between you and me, something smells!',
  'Why did the butter keep telling jokes? It was on a roll!',
  'What has four wheels and flies? A garbage truck!',
  'Why shouldn\'t you write with a broken pencil? Because it\'s pointless!',
  'What animal can you always find at a baseball game? A bat!',
  'Why did the Oreo go to the dentist? Because it lost its filling!',
  'What kind of music do mummies like? Wrap music!',
  'Why are teddy bears never hungry? Because they\'re always stuffed!',
  'What do you give a sick bird? Tweetment!',
  'Why did the nose feel sad? It was tired of being picked on!',
  'What did the blanket say to the bed? Don\'t worry, I\'ve got you covered!',
  'Why did the magician fail his test? He could only do trick questions!',
  'What do snowmen eat for breakfast? Frosted flakes!',
  'Why did the banana go to the hairdresser? Because it had split ends!',
  'What did one pencil say to the other on the first day of school? Looking sharp!',
  'Why did the kid cross the playground? To get to the other slide!',
  'What do you call a monkey that loves potato chips? A chipmunk!',
  'Why do vampires seem sick? They\'re always coffin!',
  'What kind of nut doesn\'t have a shell? A doughnut!',
  'Why did the horse go behind the tree? To change his jockeys!',
  'What do lawyers wear to court? Lawsuits!',
  'Why did the toilet paper roll down the hill? To get to the bottom!',
  'What did the ocean say to the shore? Nothing, it just waved!',
  'Why do fish live in salt water? Because pepper makes them sneeze!',
  'What room can nobody enter? A mushroom!',
  'Why was the broom running late? It swept in!',
  'What do you call a fairy that doesn\'t shower? Stinker Bell!',
  'Why did the bicycle need a nap? It was two-tired!',
  'What do you call a cat on ice? One cool cat!',
  'Why did the egg get thrown out of class? For telling too many yolks!',
  'What\'s a tornado\'s favorite game? Twister!',
  'Why was the stadium so hot after the game? All the fans left!',
  'What do you call a fish that needs help with its vocals? Autotuna!',
  'Why do dragons sleep during the day? So they can fight knights!',
  'What did the math teacher order for dinner? A slice of pi!',
  'Why did the golfer wear two pairs of socks? In case he got a hole in one!',
  'What\'s a snake\'s favorite subject? Hiss-tory!',
  'Why did the moon burp? Because it was full!',
  'What kind of dog does a magician have? A Labracadabrador!',
  'Why did the chicken cross the playground? To get to the other slide!',
  'What do you call a happy cowboy? A jolly rancher!',
  'Why did the detective stay in bed? He was working undercover!',
  'What\'s a cat\'s favorite color? Purr-ple!',
  'Why did the pirate go to school? To improve his arrrticulation!',
  'What kind of key opens a banana? A monkey!',
  'Why did the clock get in trouble at school? For tocking too much!',
  'What do you call a sleeping dinosaur? A dino-snore!',
  'Why did the kid bring a jump rope to the bar? She wanted to skip drinks!',
  'What has a head and a tail but no body? A coin!',
  'Why shouldn\'t you tell a joke while ice skating? The ice might crack up!',
  'What do you call a dinosaur who wears a cowboy hat? Tyrannosaurus Tex!',
  'Why did the phone go to the dentist? It lost its Bluetooth!',
  'What do you call a tired pea? A sleep-pod!',
  'Why are frogs so happy? They eat whatever bugs them!',
  'What do you give a dog with a fever? Mustard — it\'s the best thing for a hot dog!',
  'Why did the baker stop making donuts? She was tired of the hole thing!',
  'What do you call a broken can opener? A can\'t opener!',
  'Why is Peter Pan always flying? He neverlands!',
  'What did the little corn say to the mama corn? Where\'s popcorn?',
  'Why did the soccer player bring string to the game? So he could tie the score!',
  'What do you call a funny chicken? A comedi-hen!',
  'Why was the math book depressed? It had too many problems!',
  'What do you call a cat who loves to swim? A catfish!',
  'Why don\'t oysters share? Because they\'re shellfish!',
  'What did one snowman say to the other? Do you smell carrots?',
  'Why did the nurse need a red pen? In case she needed to draw blood!',
  'What do you call a very small mother? A minimum!',
  'Why did the football coach go to the bank? To get his quarterback!',
  'What\'s a ghost\'s favorite dessert? I scream!',
  'Why did the birdie go to the hospital? To get a tweetment!',
  'What do you call a bunch of disorganized cats? A cat-astrophe!',
  'Why did the frog take the bus to work? His car got toad away!',
  'What has teeth but cannot eat? A comb!',
  'Why did the king go to the dentist? To get his teeth crowned!',
  'What do cows read? Moos-papers!',
  'Why did the banana split? Because it saw the ice cream!',
  'What do you call a moose with no name? Anonymoose!',
  'Why was the sand wet? Because the sea weed!',
  'What do you call a penguin in the Sahara? Lost!',
  'Why did the spider go to the computer? To check his web site!',
  'What do you call it when a snowman throws a tantrum? A meltdown!',
  'Why did the police arrest the turkey? They suspected fowl play!',
  'What did the dalmatian say after lunch? That hit the spot!',
  'Why don\'t mountains get cold in winter? They wear snowcaps!',
  'What kind of music are balloons afraid of? Pop music!',
  'Why did the astronaut break up? He needed space!',
  'What do you call a dinosaur that never gives up? A try-ceratops!',
  'Why did the elephant leave the circus? He was tired of working for peanuts!',
  'What did the finger say to the thumb? I\'m in glove with you!',
  'Why did the man fall down the well? Because he couldn\'t see that well!',
  'What do you call a sleeping dinosaur? A stega-snore-us!',
  'Why did the lemon stop rolling? It ran out of juice!',
  'What do you call a flower that runs on electricity? A power plant!',
  'Why did the dog sit in the shade? He didn\'t want to be a hot dog!',
  'What do you call a fish that practices medicine? A sturgeon!',
  'Why couldn\'t the sesame seed leave the gambling casino? It was on a roll!',
  'What do you get when you put three ducks in a box? A box of quackers!',
  'Why did the computer go to the beach? To surf the net!',
  'What do you call a cat that was caught by the police? The purrp-etrator!',
  'Why did the scarecrow become a therapist? He was great at helping people work through their fields!',
  'What did the snowflake say to the road? Let\'s stick together!',
  'Why don\'t basketball players ever get locked out? Because one of them always has the key!',
  'What do you call a funny mountain? Hill-arious!',
  'Why did the kid stare at the car radio? The teacher said there would be a test on the airwaves!',
  'What do you call a bunch of rabbits walking backwards? A receding hare-line!',
  'Why do cows have hooves instead of feet? Because they lactose!',
  'What did the mama buffalo say to her son when he left for school? Bison!',
  'Why don\'t ducks tell jokes when they fly? They would quack up!',
  'What did the fisherman say to the magician? Pick a cod, any cod!',
  'Why did the alien go to Saturn? To go ring shopping!',
  'What kind of shorts do clouds wear? Thunderpants!',
  'Why is a dog like a phone? Because it has collar ID!',
]

function getDailyJoke(): string {
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 0)
  const dayOfYear = Math.floor((now.getTime() - start.getTime()) / 86400000)
  return DAILY_JOKES[dayOfYear % DAILY_JOKES.length].toUpperCase()
}

function formatWallTime(date: Date): { time: string, period: string, dateStr: string } {
  const hours = date.getHours()
  const minutes = date.getMinutes()
  const period = hours >= 12 ? 'PM' : 'AM'
  const displayHour = hours % 12 || 12
  const time = `${displayHour}:${minutes.toString().padStart(2, '0')}`

  const dateStr = date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  }).toUpperCase()

  return { time, period, dateStr }
}

export function WallCalendar() {
  const { user, loading: authLoading } = useAuth()
  const wallData = useWallData()
  const { markDone, undoDone } = useActionableInstances()

  const { weather } = useWeather()
  const { fetchNote } = useEventNotes()
  const [currentTime, setCurrentTime] = useState(new Date())
  const [nightWake, setNightWake] = useState(false)
  const nightWakeTimerRef = useRef<NodeJS.Timeout | null>(null)
  const [recipeUrl, setRecipeUrl] = useState<string | null>(null)
  const [showRecipeViewer, setShowRecipeViewer] = useState(false)

  // Complete/uncomplete a wall item (chores only — tasks are read-only on the wall)
  const handleComplete = useCallback(async (item: TimelineItem) => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    if (item.type === 'routine') {
      const routineId = item.id.replace('routine-', '')
      if (item.completed) {
        await undoDone('routine', routineId, today)
      } else {
        await markDone('routine', routineId, today)
      }
    } else if (item.type === 'event') {
      const eventId = item.id.replace('event-', '')
      if (item.completed) {
        await undoDone('calendar_event', eventId, today)
      } else {
        await markDone('calendar_event', eventId, today)
      }
    }
    wallData.refetch()
  }, [markDone, undoDone, wallData])



  // Update clock every minute
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 60_000)
    return () => clearInterval(interval)
  }, [])

  // Split today's items into chores (routines) and tasks
  const { choreItems, taskItems } = useMemo(() => {
    const today = wallData.days.find(d => d.isToday)
    if (!today) return { choreItems: [] as TimelineItem[], taskItems: [] as TimelineItem[] }
    const chores: TimelineItem[] = []
    const tasks: TimelineItem[] = []
    for (const section of ['morning', 'afternoon', 'evening', 'allday'] as const) {
      for (const item of (today.items[section] || [])) {
        if (item.type === 'event' || item.skipped) continue
        if (item.type === 'routine') {
          chores.push(item)
        } else if (item.type === 'task') {
          tasks.push(item)
        }
      }
    }
    return { choreItems: chores, taskItems: tasks }
  }, [wallData.days])

  // ═══ RECIPE URL LOOKUP ═══
  const dinnerEvent = useMemo(() => findDinnerEvent(wallData.calendarEvents, currentTime), [wallData.calendarEvents, currentTime])
  const dinnerMealName = dinnerEvent ? extractRecipeNameHint(dinnerEvent.title) || dinnerEvent.title : 'Dinner'

  // Fetch recipe URL from event_notes when dinner event changes
  useEffect(() => {
    if (!dinnerEvent) {
      setRecipeUrl(null)
      return
    }
    const eventId = dinnerEvent.google_event_id || dinnerEvent.id
    if (!eventId) return

    fetchNote(eventId).then(note => {
      setRecipeUrl(note?.recipeUrl ?? null)
    })
  }, [dinnerEvent, fetchNote])

  const handleOpenRecipe = useCallback(() => {
    if (recipeUrl) setShowRecipeViewer(true)
  }, [recipeUrl])

  const handleCloseRecipe = useCallback(() => {
    setShowRecipeViewer(false)
  }, [])

  // ═══ CONTEXTUAL VIEWS ENGINE ═══
  const contextEvalData = useMemo((): ContextEvalData | null => {
    if (wallData.loading) return null
    return {
      now: currentTime,
      days: wallData.days,
      calendarEvents: wallData.calendarEvents,
      familyMembers: wallData.familyMembers,
      overdueTasks: wallData.overdueTasks,
      todayChores: choreItems,
      todayTasks: taskItems,
    }
  }, [currentTime, wallData, choreItems, taskItems])

  const {
    surfacedRules,
    activeContext,
    activateContext,
    dismissActiveContext,
    dismissRule,
    debugMode,
    toggleDebugMode,
  } = useContextEngine(contextEvalData)

  // Dynamic weather-based background
  const wallBg = useMemo(() => {
    return getWallBackground(currentTime.getHours(), weather?.weatherCode)
  }, [currentTime, weather?.weatherCode])

  // Triple-tap clock to toggle debug mode (surfaces all context buttons)
  const tapCountRef = useRef(0)
  const tapTimerRef = useRef<NodeJS.Timeout | null>(null)
  const handleClockTap = useCallback(() => {
    tapCountRef.current += 1
    if (tapCountRef.current >= 3) {
      toggleDebugMode()
      tapCountRef.current = 0
    }
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current)
    tapTimerRef.current = setTimeout(() => { tapCountRef.current = 0 }, 600)
  }, [toggleDebugMode])

  // ═══ NIGHTTIME SLEEP MODE (10:00 PM – 5:30 AM) ═══
  const isNighttime = useMemo(() => {
    const h = currentTime.getHours()
    const m = currentTime.getMinutes()
    return h >= 22 || h < 5 || (h === 5 && m < 30)
  }, [currentTime])

  // Clear wake timer when leaving nighttime
  useEffect(() => {
    if (!isNighttime) {
      setNightWake(false)
      if (nightWakeTimerRef.current) {
        clearTimeout(nightWakeTimerRef.current)
        nightWakeTimerRef.current = null
      }
    }
  }, [isNighttime])

  const handleNightTap = useCallback(() => {
    setNightWake(true)
    if (nightWakeTimerRef.current) clearTimeout(nightWakeTimerRef.current)
    nightWakeTimerRef.current = setTimeout(() => setNightWake(false), 30_000)
  }, [])

  if (isNighttime && !nightWake) {
    const { time: sleepTime, period: sleepPeriod } = formatWallTime(currentTime)
    return (
      <div
        className="wall-calendar h-screen w-screen bg-black flex items-center justify-center select-none cursor-default"
        onClick={handleNightTap}
      >
        <div className="text-center">
          <div className="text-white/[0.04] font-bold text-[6rem] leading-none tracking-tight">
            {sleepTime} {sleepPeriod}
          </div>
        </div>
      </div>
    )
  }

  // Auth loading
  if (authLoading) {
    return (
      <div className="wall-calendar h-screen w-screen bg-[#1e293b] flex items-center justify-center select-none">
        <div className="text-center">
          <div className="font-display text-[4rem] text-white/60 mb-2">Symphony</div>
          <div className="text-[1.25rem] text-white/40">Loading...</div>
        </div>
      </div>
    )
  }

  // Not authenticated
  if (!user) {
    return (
      <div className="wall-calendar h-screen w-screen bg-[#1e293b] flex items-center justify-center select-none">
        <div className="text-center max-w-md">
          <div className="font-display text-[4rem] text-white/80 mb-4">Symphony</div>
          <div className="text-[1.25rem] text-white/50 mb-8">
            Sign in to view your family calendar
          </div>
        </div>
      </div>
    )
  }

  // Data loading
  if (wallData.loading) {
    return (
      <div className="wall-calendar h-screen w-screen bg-[#1e293b] flex items-center justify-center select-none">
        <div className="text-center">
          <div className="font-display text-[6rem] text-white/90 mb-3 leading-none tracking-tight">
            {formatWallTime(currentTime).time}
          </div>
          <div className="text-[1.25rem] text-white/40">Loading your day...</div>
        </div>
      </div>
    )
  }

  const { time, period, dateStr } = formatWallTime(currentTime)

  return (
    <div
      className="wall-calendar w-[1920px] h-[1080px] overflow-hidden flex flex-col select-none relative p-12 mx-auto"
      style={{ background: wallBg.background }}
    >
      {/* Weather overlay */}
      {wallBg.overlay && (
        <div
          className="absolute inset-0 pointer-events-none z-0 transition-opacity duration-[3000ms]"
          style={{ background: wallBg.overlay, opacity: wallBg.overlayOpacity }}
        />
      )}

      {/* Dark scrim for text readability */}
      <div className="absolute inset-0 pointer-events-none z-0 bg-black/25" />

      {/* ═══ TOP HEADER ═══ */}
      <header className="flex items-center justify-between mb-8 z-10 w-full pr-12">
        <div className="flex items-baseline gap-4">
          <time
            className="font-bold text-[8rem] leading-none text-white tracking-tight cursor-default"
            onClick={handleClockTap}
          >
            {time}
          </time>
          <span className="text-[3.5rem] font-bold text-white tracking-tight mr-4">
            {period}
          </span>
          <div className="text-[2.5rem] font-bold text-white/50 tracking-wider">
            {dateStr}
          </div>
          {weather ? (
            <span className="text-[3.5rem] ml-4 flex items-baseline gap-2">
              <span>{getWeatherEmoji(weather.weatherCode)}</span>
              <span className="text-white font-bold">{weather.currentTemp}°</span>
            </span>
          ) : (
            <span className="text-[3.5rem] ml-4 animate-pulse-soft">🌤️</span>
          )}
        </div>

        {/* Who's Home Avatars */}
        <div className="flex flex-col items-end gap-2">
          <span className="text-white font-black uppercase tracking-widest text-[1rem]">
            WHO'S HOME
          </span>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-white/10 rounded-full px-3 py-1.5 text-white mr-4">
              <span className="w-2.5 h-2.5 bg-green-400 rounded-full" />
              <span className="font-bold text-[1.2rem]">4/4</span>
            </div>

            {/* Example Avatars (Using placeholders or distinct colors) */}
            <div className="w-[4.5rem] h-[4.5rem] rounded-full bg-[#f87171] border-4 border-[#34d399] flex justify-center items-center text-[2rem] shadow-lg relative">
              👨
              <div className="absolute -top-2 bg-white text-slate-900 text-[0.7rem] px-2 py-0.5 rounded-full font-bold uppercase">Dad</div>
            </div>
            <div className="w-[4.5rem] h-[4.5rem] rounded-full bg-[#60a5fa] border-4 border-[#34d399] flex justify-center items-center text-[2rem] shadow-lg relative">
              👩
              <div className="absolute -top-2 bg-white text-slate-900 text-[0.7rem] px-2 py-0.5 rounded-full font-bold uppercase">Mom</div>
            </div>
          </div>
        </div>
      </header>

      {/* ═══ MAIN LAYOUT ═══ */}
      <main className="flex-1 flex gap-12 min-h-0 relative z-10 w-full">

        {/* ─── LEFT COLUMN (60%) ─── */}
        <div className="w-[60%] flex flex-col h-full justify-between pb-2">

          {/* Top: Chores + Tasks */}
          <div className="flex-shrink-0">
            <WallChoresWidget
              choreItems={choreItems}
              taskItems={taskItems}
              onComplete={handleComplete}
              overdueItems={wallData.overdueTasks}
            />
          </div>

          {/* Middle: Today's horizontal timeline */}
          <div className="flex-shrink-0 h-[240px]">
            <WallTodayTimeline todayData={wallData.days.find(d => d.isToday)} />
          </div>

          {/* Bottom: Mood + Jax tracker */}
          <div className="flex-shrink-0 flex items-center gap-8">
            <WallBottomBar />
            <div className="w-px h-8 bg-white/10" />
            <WallJaxWidget />
          </div>

        </div>

        {/* ─── RIGHT COLUMN (40%) ─── */}
        <div className="w-[40%] flex flex-col justify-start pt-2 relative h-full">
          {/* Prevent overlap by restricting overflow behind the alien */}
          <div className="flex-1 overflow-hidden pb-[160px]">
            <WallLookAhead days={wallData.days} familyMembers={wallData.familyMembers} />

            <div className="pl-8 w-full mt-2">
              <WallDinnerWidget
                calendarEvents={wallData.calendarEvents}
                days={wallData.days}
                recipeUrl={recipeUrl}
                onOpenRecipe={handleOpenRecipe}
              />
            </div>
          </div>

          {/* Alien Mascot with Speech Bubble */}
          <div className="absolute bottom-0 right-[-20px] flex items-end translate-y-8">
            <div className="bg-white rounded-3xl rounded-br-none p-5 max-w-[340px] shadow-xl relative -top-[78px] right-12 z-30">
              <p className="text-[#1e293b] font-black uppercase tracking-wider text-[1.1rem] leading-snug">
                {getDailyJoke()}
              </p>
              {/* Speech bubble tail */}
              <div className="absolute -bottom-4 right-4 w-8 h-8 bg-white" style={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%)' }} />
            </div>
            <div className="text-[12rem] leading-none drop-shadow-2xl z-20" style={{ transform: 'scaleX(-1)' }}>
              👽
            </div>
          </div>
        </div>

      </main>

      {/* Refresh button + timestamp */}
      <button
        onClick={() => window.location.reload()}
        className="fixed bottom-4 right-4 flex items-center gap-2 px-3 py-1.5 rounded-lg
                   bg-white/5 hover:bg-white/10 border border-white/10
                   text-white/30 hover:text-white/60 transition-all z-10 text-[0.8rem]"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5M4.5 9A8 8 0 0119.8 7.5M19.5 15A8 8 0 014.2 16.5" />
        </svg>
        {wallData.lastRefresh
          ? wallData.lastRefresh.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
          : 'Refresh'
        }
      </button>

      {/* Error indicator */}
      {wallData.error && (
        <div className="fixed top-6 right-6 bg-red-900/80 text-red-200 px-5 py-3 rounded-xl text-[1rem] shadow-lg border border-red-500/30 backdrop-blur z-0">
          {wallData.error}
        </div>
      )}

      {/* Nighttime wake indicator */}
      {isNighttime && nightWake && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-white/5 text-white/30 px-4 py-2 rounded-xl text-[0.85rem] font-bold uppercase tracking-widest border border-white/10 z-50">
          Sleeping soon...
        </div>
      )}

      {/* Debug mode indicator */}
      {debugMode && (
        <div className="fixed top-6 left-6 bg-amber-500/20 text-amber-300 px-4 py-2 rounded-xl text-[0.85rem] font-bold uppercase tracking-widest border border-amber-500/30 z-50">
          Debug: All Contexts
        </div>
      )}

      {/* Puppy easter egg — runs across the bottom every 30-90 min */}
      <PuppyEasterEgg />

      {/* ═══ CONTEXTUAL VIEWS ═══ */}
      {/* Smart button dock (surfaces when rules match, no active context) */}
      {!activeContext && surfacedRules.length > 0 && (
        <ContextDock
          rules={surfacedRules}
          onActivate={activateContext}
          onDismiss={dismissRule}
        />
      )}

      {/* Full-screen contextual view overlay */}
      {activeContext && contextEvalData && (
        <ContextOverlay
          activeContext={activeContext}
          data={contextEvalData}
          onDismiss={dismissActiveContext}
        />
      )}

      {/* Recipe viewer overlay */}
      {showRecipeViewer && recipeUrl && (
        <WallRecipeViewer
          url={recipeUrl}
          mealName={dinnerMealName}
          mealIcon={dinnerEvent ? getMealIcon(dinnerEvent.title) : '🍽️'}
          onClose={handleCloseRecipe}
        />
      )}

    </div>
  )
}
