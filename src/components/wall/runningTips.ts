// Daily running tips for 8-year-olds learning to run
// Each tip has a category, title, main tip, drill, and diagram description

export interface RunningTip {
  category: 'form' | 'breathing' | 'speed' | 'endurance' | 'warmup' | 'mindset' | 'fun' | 'cooldown' | 'arms' | 'feet'
  title: string
  tip: string
  drill: string
  emoji: string
  // Which body part to highlight in the animated runner diagram
  diagramFocus: 'head' | 'arms' | 'torso' | 'legs' | 'feet' | 'full'
}

const RUNNING_TIPS: RunningTip[] = [
  // FORM
  {
    category: 'form',
    title: 'Stand Tall',
    tip: 'Imagine a string pulling you up from the top of your head. Run tall with your chest up — don\'t slouch or lean forward too much!',
    drill: 'Run 50 yards while pretending a book is balanced on your head. Stay as tall as you can!',
    emoji: '🧍',
    diagramFocus: 'torso',
  },
  {
    category: 'form',
    title: 'Eyes Forward',
    tip: 'Look ahead about 10-15 feet in front of you, not down at your feet. This keeps your neck relaxed and your body straight.',
    drill: 'Run to a landmark (a tree, a post) while keeping your eyes locked on it the whole time. 5 reps!',
    emoji: '👀',
    diagramFocus: 'head',
  },
  {
    category: 'form',
    title: 'Relax Your Shoulders',
    tip: 'Drop your shoulders away from your ears. Tight shoulders waste energy and make you tired faster!',
    drill: 'While running, shrug your shoulders up to your ears, then drop them. Feel the difference! Do this every minute.',
    emoji: '🧘',
    diagramFocus: 'torso',
  },
  {
    category: 'form',
    title: 'Land Softly',
    tip: 'Try to land quietly when you run. If you can hear your feet slapping, you\'re hitting too hard! Light feet = fast feet.',
    drill: 'Run 30 yards as quietly as possible. Pretend you\'re sneaking past a sleeping dragon! 🐉',
    emoji: '🤫',
    diagramFocus: 'feet',
  },
  {
    category: 'form',
    title: 'Lean From Your Ankles',
    tip: 'A tiny forward lean helps you go faster — but lean from your ankles, not your waist. Your whole body should be one straight line.',
    drill: 'Stand straight, then slowly lean forward from your ankles until you have to take a step. That\'s your running lean!',
    emoji: '📐',
    diagramFocus: 'full',
  },

  // ARMS
  {
    category: 'arms',
    title: 'Pump Your Arms',
    tip: 'Your arms drive your legs! Swing them forward and back (not across your body). Bend them at about 90 degrees.',
    drill: 'Stand still and practice arm pumps for 30 seconds. Hands go from chin to hip. Now try it while running!',
    emoji: '💪',
    diagramFocus: 'arms',
  },
  {
    category: 'arms',
    title: 'Relaxed Hands',
    tip: 'Don\'t clench your fists — it tightens your whole body. Pretend you\'re holding a potato chip in each hand without crushing it.',
    drill: 'Run 100 yards with your thumbs gently resting on your fingertips. Loose and easy!',
    emoji: '🥔',
    diagramFocus: 'arms',
  },
  {
    category: 'arms',
    title: 'Arms Drive Speed',
    tip: 'Want to run faster? Pump your arms faster! Your legs will follow. It\'s like magic — fast arms = fast legs.',
    drill: 'Do 3 sprints of 30 yards. On each one, focus ONLY on pumping your arms as fast as you can.',
    emoji: '⚡',
    diagramFocus: 'arms',
  },

  // FEET
  {
    category: 'feet',
    title: 'Midfoot Landing',
    tip: 'Try to land on the middle of your foot, not your heel. Heel striking is like putting on the brakes with every step!',
    drill: 'Take off your shoes and run on soft grass for 1 minute. Notice how you naturally land on your midfoot!',
    emoji: '🦶',
    diagramFocus: 'feet',
  },
  {
    category: 'feet',
    title: 'Quick Feet',
    tip: 'Take quicker, shorter steps instead of long, bounding ones. Fast turnover is the secret to smooth running!',
    drill: 'Count your steps for 15 seconds while jogging. Try to get at least 22-24 steps. More steps = better!',
    emoji: '🔥',
    diagramFocus: 'feet',
  },
  {
    category: 'feet',
    title: 'High Knees',
    tip: 'Lifting your knees helps you run with more power. Think about driving your knee up and forward with each step.',
    drill: 'Do high knees in place for 20 seconds — get those knees up to hip height! Rest 10 seconds. Repeat 4 times.',
    emoji: '🦵',
    diagramFocus: 'legs',
  },
  {
    category: 'feet',
    title: 'Butt Kicks',
    tip: 'Kicking your heel back toward your butt helps you develop a powerful stride. It makes your legs like springs!',
    drill: 'Jog slowly and flick your heels up to your butt with each step. Do 20 yards, then run normally and feel the difference!',
    emoji: '🏃',
    diagramFocus: 'legs',
  },

  // BREATHING
  {
    category: 'breathing',
    title: 'Belly Breathing',
    tip: 'Breathe deep into your belly, not just your chest. Put your hand on your tummy — it should push out when you breathe in!',
    drill: 'Lie on your back with a stuffed animal on your belly. Breathe to make it rise and fall. Now try while walking!',
    emoji: '🫁',
    diagramFocus: 'torso',
  },
  {
    category: 'breathing',
    title: 'Breathe In Rhythm',
    tip: 'Try breathing in for 3 steps, out for 2 steps. This rhythm keeps a steady flow of oxygen to your muscles.',
    drill: 'Jog slowly and count: "In-2-3, Out-2, In-2-3, Out-2." Do this for 2 minutes. It gets easier with practice!',
    emoji: '🎵',
    diagramFocus: 'torso',
  },
  {
    category: 'breathing',
    title: 'Breathe Through Your Mouth',
    tip: 'When running, breathe through your mouth (and nose). Your mouth lets in way more air than your nose alone!',
    drill: 'Run 200 yards breathing through your mouth and nose together. Feel how much easier it is than nose-only!',
    emoji: '😮',
    diagramFocus: 'head',
  },
  {
    category: 'breathing',
    title: 'The Talk Test',
    tip: 'If you can\'t talk while running, you\'re going too fast! Slow down until you can chat with a friend while jogging.',
    drill: 'Run with a friend and tell each other jokes. If you can\'t finish the joke, slow down a little!',
    emoji: '💬',
    diagramFocus: 'full',
  },

  // SPEED
  {
    category: 'speed',
    title: 'Sprinter Start',
    tip: 'To start fast, push off hard with your back foot and drive your opposite arm forward. Explode out like a rocket!',
    drill: 'Practice 5 standing starts. Push off your back foot and sprint 20 yards. Walk back and repeat!',
    emoji: '🚀',
    diagramFocus: 'full',
  },
  {
    category: 'speed',
    title: 'Build Up Runs',
    tip: 'Start slow, then gradually speed up until you\'re sprinting at the end. This teaches your body to shift gears!',
    drill: 'Run 100 yards: first 30 at a jog, next 30 faster, last 40 full speed. Do 4 of these!',
    emoji: '📈',
    diagramFocus: 'full',
  },
  {
    category: 'speed',
    title: 'Stride Length vs. Turnover',
    tip: 'Speed = how long your steps are × how fast your legs move. At your age, focus on fast turnover — long strides come later!',
    drill: 'Sprint 30 yards with tiny quick steps. Then sprint 30 yards normally. Which felt faster?',
    emoji: '⚙️',
    diagramFocus: 'legs',
  },
  {
    category: 'speed',
    title: 'Run Through the Line',
    tip: 'Never slow down before the finish! Keep sprinting PAST the finish line by 5 more steps. Champions finish strong!',
    drill: 'Put two markers 5 feet apart. Sprint and don\'t slow down until you pass the SECOND marker. 5 reps!',
    emoji: '🏁',
    diagramFocus: 'full',
  },

  // ENDURANCE
  {
    category: 'endurance',
    title: 'Walk-Run Combo',
    tip: 'Building endurance takes time! Start by running 1 minute, walking 1 minute. Slowly add more running time each week.',
    drill: 'Run 1 minute, walk 30 seconds. Repeat 8 times. Next week, try run 90 seconds, walk 30!',
    emoji: '🔄',
    diagramFocus: 'full',
  },
  {
    category: 'endurance',
    title: 'Start Slow',
    tip: 'The biggest mistake is starting too fast! Begin your run at a comfortable pace. You should feel like you could go forever.',
    drill: 'Run the first 2 minutes of your run at a pace where you could easily have a conversation. Then pick it up slightly!',
    emoji: '🐢',
    diagramFocus: 'full',
  },
  {
    category: 'endurance',
    title: 'Negative Splits',
    tip: 'Try to run the second half faster than the first half. This is called "negative splits" and it\'s how the pros race!',
    drill: 'Run to a landmark and back. Time each half. Try to make the return trip 5 seconds faster!',
    emoji: '⏱️',
    diagramFocus: 'full',
  },
  {
    category: 'endurance',
    title: 'One More Minute',
    tip: 'When you feel like stopping, tell yourself "just one more minute." You\'ll be amazed how much further you can go!',
    drill: 'On your next run, when you want to stop, keep going for 60 more seconds. You got this!',
    emoji: '💪',
    diagramFocus: 'full',
  },

  // WARMUP
  {
    category: 'warmup',
    title: 'Dynamic Warm-Up',
    tip: 'Never run cold! Warm up your muscles with movement first. This prevents injuries and helps you run better.',
    drill: 'Do 10 leg swings, 10 arm circles, 10 high knees, and 10 butt kicks before every run!',
    emoji: '🔥',
    diagramFocus: 'full',
  },
  {
    category: 'warmup',
    title: 'Walking Lunges',
    tip: 'Lunges wake up your leg muscles and get them ready to run. They make your legs strong and flexible!',
    drill: 'Do 10 walking lunges (5 each leg) before your run. Keep your front knee over your ankle!',
    emoji: '🚶',
    diagramFocus: 'legs',
  },
  {
    category: 'warmup',
    title: 'Skipping is Training',
    tip: 'Skipping is actually great running practice! It builds the same muscles and teaches you to be bouncy and light.',
    drill: 'Skip for 50 yards with big arm swings. Then skip for 50 yards with high knees. Fun AND useful!',
    emoji: '🤸',
    diagramFocus: 'full',
  },

  // COOLDOWN
  {
    category: 'cooldown',
    title: 'Walk It Out',
    tip: 'After running, walk for 3-5 minutes. This helps your heart rate come down slowly and prevents dizziness.',
    drill: 'After your run, walk slowly for 3 minutes. Take deep breaths and relax your arms by your sides.',
    emoji: '🚶',
    diagramFocus: 'full',
  },
  {
    category: 'cooldown',
    title: 'Stretch After Running',
    tip: 'Stretching AFTER your run (not before!) keeps your muscles flexible. Hold each stretch for 20-30 seconds.',
    drill: 'After your run, do: quad stretch, calf stretch, hamstring stretch, and butterfly stretch. 20 seconds each!',
    emoji: '🧘',
    diagramFocus: 'legs',
  },

  // MINDSET
  {
    category: 'mindset',
    title: 'Set a Goal',
    tip: 'Pick a goal for each run — run to the next mailbox, last 5 minutes, or do 2 laps. Small goals add up to big wins!',
    drill: 'Before your next run, pick ONE goal and write it down. After your run, check it off. You did it!',
    emoji: '🎯',
    diagramFocus: 'full',
  },
  {
    category: 'mindset',
    title: 'Running is a Superpower',
    tip: 'Not everyone can run — but YOU can! Every time you run, you\'re getting stronger, faster, and building an amazing body.',
    drill: 'After your next run, write down one thing you\'re proud of. Keep a running journal!',
    emoji: '🦸',
    diagramFocus: 'full',
  },
  {
    category: 'mindset',
    title: 'It Gets Easier',
    tip: 'The first 3 minutes of any run feel the hardest. Your body needs time to warm up. Push through and it gets WAY easier!',
    drill: 'On your next run, rate how you feel at 1 minute, 3 minutes, and 5 minutes. Notice the difference!',
    emoji: '📊',
    diagramFocus: 'full',
  },
  {
    category: 'mindset',
    title: 'Race Yourself',
    tip: 'You don\'t need to beat anyone else. Try to beat YOUR best time! Track your progress and celebrate improvements.',
    drill: 'Time yourself running around the block today. Next week, try to beat it by just 5 seconds!',
    emoji: '🏆',
    diagramFocus: 'full',
  },

  // FUN
  {
    category: 'fun',
    title: 'Trail Running',
    tip: 'Running on trails and grass is easier on your legs than pavement. Plus, it\'s more fun — rocks, roots, and adventures!',
    drill: 'Find a local trail or park with a dirt path. Run on it for 10 minutes. Notice how soft it feels!',
    emoji: '🌲',
    diagramFocus: 'full',
  },
  {
    category: 'fun',
    title: 'Fartlek Fun',
    tip: '"Fartlek" is a Swedish word meaning "speed play." Sprint to a tree, jog to a mailbox, sprint to a car — make it a game!',
    drill: 'Go on a 10-minute fartlek run: pick random objects to sprint to, then jog until the next one. No plan needed!',
    emoji: '🎮',
    diagramFocus: 'full',
  },
  {
    category: 'fun',
    title: 'Run With a Buddy',
    tip: 'Running with a friend makes the time fly by! You can encourage each other and have fun while getting fit.',
    drill: 'Invite a friend or family member to run with you today. Even a 5-minute jog together counts!',
    emoji: '👫',
    diagramFocus: 'full',
  },
  {
    category: 'fun',
    title: 'Obstacle Run',
    tip: 'Make your own obstacle course! Jump over sticks, run around cones, crawl under things — this builds agility AND speed.',
    drill: 'Set up 5 obstacles in the yard. Time yourself running through them. Try to beat your time 3 times!',
    emoji: '🏗️',
    diagramFocus: 'full',
  },
]

export function getDailyRunningTip(): RunningTip {
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 0)
  const dayOfYear = Math.floor((now.getTime() - start.getTime()) / 86400000)
  // Offset by 17 so running and soccer tips don't align on same categories
  return RUNNING_TIPS[(dayOfYear + 17) % RUNNING_TIPS.length]
}

const CATEGORY_LABELS: Record<RunningTip['category'], string> = {
  'form': 'Running Form',
  'breathing': 'Breathing',
  'speed': 'Speed',
  'endurance': 'Endurance',
  'warmup': 'Warm Up',
  'mindset': 'Mindset',
  'fun': 'Fun Runs',
  'cooldown': 'Cool Down',
  'arms': 'Arm Technique',
  'feet': 'Footwork',
}

const CATEGORY_COLORS: Record<RunningTip['category'], string> = {
  'form': '#6DC4A7',
  'breathing': '#5BA4E6',
  'speed': '#F26E63',
  'endurance': '#F9C35C',
  'warmup': '#F97316',
  'mindset': '#C084FC',
  'fun': '#EC4899',
  'cooldown': '#22D3EE',
  'arms': '#A78BFA',
  'feet': '#84CC16',
}

export function getRunningCategoryLabel(category: RunningTip['category']): string {
  return CATEGORY_LABELS[category]
}

export function getRunningCategoryColor(category: RunningTip['category']): string {
  return CATEGORY_COLORS[category]
}
