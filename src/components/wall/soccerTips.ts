// Daily soccer tips for 8-year-olds — skill reinforcement
// Each tip has a skill category, a short title, the main tip, and a practice drill

export interface SoccerTip {
  category: 'dribbling' | 'passing' | 'shooting' | 'defense' | 'first-touch' | 'heading' | 'teamwork' | 'fitness' | 'goalkeeping' | 'mindset'
  title: string
  tip: string
  drill: string
  emoji: string
}

const SOCCER_TIPS: SoccerTip[] = [
  // DRIBBLING
  {
    category: 'dribbling',
    title: 'Keep It Close',
    tip: 'When you dribble, take small touches and keep the ball close to your feet. This makes it way harder for defenders to steal it!',
    drill: 'Dribble through cones using only the inside of your foot. Try 10 times, then switch to your other foot!',
    emoji: '⚽',
  },
  {
    category: 'dribbling',
    title: 'Head Up!',
    tip: 'Don\'t stare at the ball while dribbling — peek up every few touches to see your teammates and the field.',
    drill: 'Dribble around the yard while a friend holds up fingers. Shout the number without stopping!',
    emoji: '👀',
  },
  {
    category: 'dribbling',
    title: 'Use Both Feet',
    tip: 'Great dribblers can use both feet. Practice with your weaker foot even if it feels weird — it\'ll get better fast!',
    drill: 'Dribble 20 yards using ONLY your weak foot. Do it 5 times. It\'s okay if it\'s messy at first!',
    emoji: '👟',
  },
  {
    category: 'dribbling',
    title: 'Change Speed',
    tip: 'The best dribblers change speed! Go slow, then burst fast to blow past defenders.',
    drill: 'Dribble slowly for 5 steps, then explode into a sprint for 5 steps. Repeat 10 times!',
    emoji: '💨',
  },
  {
    category: 'dribbling',
    title: 'Inside-Outside Cuts',
    tip: 'Use the inside and outside of your foot to quickly change direction. This is called a "cut" and it fakes out defenders!',
    drill: 'Set up 2 cones 3 feet apart. Dribble to the first, cut inside, then cut outside at the second. Do 10 reps each side!',
    emoji: '✂️',
  },
  {
    category: 'dribbling',
    title: 'Protect the Ball',
    tip: 'Put your body between the ball and the defender. Use your arm (not your hand!) to feel where they are.',
    drill: 'Have a friend try to steal the ball while you shield it for 30 seconds. Switch roles!',
    emoji: '🛡️',
  },

  // PASSING
  {
    category: 'passing',
    title: 'Lock Your Ankle',
    tip: 'When you pass, lock your ankle and hit the ball with the inside of your foot. A floppy ankle = a wobbly pass!',
    drill: 'Pass back and forth with a friend from 10 feet away. Focus on keeping your ankle firm. Do 20 passes each!',
    emoji: '🦶',
  },
  {
    category: 'passing',
    title: 'Pass to Space',
    tip: 'Don\'t just pass where your teammate IS — pass where they\'re GOING. Lead them into open space!',
    drill: 'Have a friend run across you. Try to pass the ball 3 feet ahead of them so they run onto it!',
    emoji: '🎯',
  },
  {
    category: 'passing',
    title: 'Plant Foot Points',
    tip: 'Your plant foot (the one NOT kicking) should point where you want the ball to go. It\'s like aiming!',
    drill: 'Put a target (cone/shoe) 15 feet away. Make 20 passes trying to hit it. Watch where your plant foot points!',
    emoji: '🧭',
  },
  {
    category: 'passing',
    title: 'One-Touch Passing',
    tip: 'Sometimes the best play is a quick one-touch pass — don\'t trap it, just redirect it to a teammate!',
    drill: 'Stand in a triangle with 2 friends. Pass one-touch only — no stopping the ball. See how many you can do in a row!',
    emoji: '⚡',
  },
  {
    category: 'passing',
    title: 'Look Before You Receive',
    tip: 'Before the ball comes to you, look around! Know where you want to pass BEFORE you get the ball.',
    drill: 'Play keep-away in a small square. Before each pass, call out a teammate\'s name!',
    emoji: '🔭',
  },
  {
    category: 'passing',
    title: 'Follow Your Pass',
    tip: 'After you pass, don\'t just stand there! Move to a new spot where your teammate can pass back to you.',
    drill: 'Pass and immediately sprint 5 yards to a new position. Have your friend pass it back. Repeat 15 times!',
    emoji: '🏃',
  },

  // SHOOTING
  {
    category: 'shooting',
    title: 'Laces for Power',
    tip: 'For powerful shots, strike the ball with the top of your foot (your laces), not your toe! Point your toe down.',
    drill: 'Practice shooting from 12 yards. Focus on hitting with your laces. Aim for the corners — 10 shots each side!',
    emoji: '🚀',
  },
  {
    category: 'shooting',
    title: 'Placement Beats Power',
    tip: 'A well-placed shot in the corner beats a rocket down the middle. Goalkeepers hate low corner shots!',
    drill: 'Put a cone in each bottom corner of the goal. Shoot 10 times trying to knock over the cones!',
    emoji: '📐',
  },
  {
    category: 'shooting',
    title: 'Shoot Low',
    tip: 'Low shots are the hardest to save! Lean over the ball and keep your knee over it when you shoot.',
    drill: 'Hang a rope across the goal at knee height. Practice shooting UNDER it. 15 shots!',
    emoji: '⬇️',
  },
  {
    category: 'shooting',
    title: 'One Step, Then Shoot',
    tip: 'You don\'t always need a big windup. A quick one-step shot surprises goalkeepers!',
    drill: 'Have someone pass to you at the top of the box. Take one touch, then shoot immediately. No extra dribbles!',
    emoji: '🎪',
  },
  {
    category: 'shooting',
    title: 'Pick Your Spot',
    tip: 'Before you shoot, pick a spot in the goal. Don\'t just blast it — aim for a specific corner!',
    drill: 'Number the goal corners 1-4. Have a friend shout a number as you approach — shoot there!',
    emoji: '🎯',
  },

  // FIRST TOUCH
  {
    category: 'first-touch',
    title: 'Cushion the Ball',
    tip: 'When the ball comes to you, pull your foot back slightly as it arrives. This "cushion" stops it from bouncing away!',
    drill: 'Have someone throw the ball to your feet. Practice cushioning it so it stops dead. 20 catches!',
    emoji: '🧤',
  },
  {
    category: 'first-touch',
    title: 'Touch Away from Pressure',
    tip: 'Your first touch should move the ball away from the nearest defender and into open space.',
    drill: 'Set up a cone as a "defender." Receive a pass and push your first touch AWAY from the cone. 15 reps!',
    emoji: '↗️',
  },
  {
    category: 'first-touch',
    title: 'Chest Control',
    tip: 'For high balls, puff your chest out, then pull back as the ball hits to cushion it down to your feet.',
    drill: 'Toss the ball up and practice chest traps. The ball should land at your feet — not bounce away!',
    emoji: '💪',
  },
  {
    category: 'first-touch',
    title: 'Thigh Trap',
    tip: 'Use your thigh to control balls dropping from medium height. Lift your thigh to meet it, then drop it to soften the landing.',
    drill: 'Juggle using only your thighs — see how many you can do! Start with catching between each one.',
    emoji: '🦵',
  },

  // DEFENSE
  {
    category: 'defense',
    title: 'Stay on Your Toes',
    tip: 'Good defenders stay on the balls of their feet, knees bent, ready to move in any direction!',
    drill: 'Practice your defensive stance: feet shoulder-width, knees bent, on your toes. Hold for 30 seconds, then shuffle side to side!',
    emoji: '🧱',
  },
  {
    category: 'defense',
    title: 'Delay, Don\'t Dive In',
    tip: 'Don\'t rush at the attacker! Stay patient, slow them down, and wait for them to make a mistake.',
    drill: 'Play 1v1 with a friend. Your job is to NOT let them past you for 15 seconds. Stay between them and the goal!',
    emoji: '🐢',
  },
  {
    category: 'defense',
    title: 'Watch the Ball, Not the Feet',
    tip: 'Attackers use fancy footwork to fake you out. Focus on the ball — not their feet or body!',
    drill: 'Defend 1v1 and keep your eyes locked on the ball. If you watch their feet, you\'ll get faked out!',
    emoji: '👁️',
  },
  {
    category: 'defense',
    title: 'Win It Back Quick',
    tip: 'When your team loses the ball, press immediately! The first 3 seconds are the best time to win it back.',
    drill: 'Play a small-sided game. When your team loses the ball, count "1-2-3" and sprint to press!',
    emoji: '⏱️',
  },

  // TEAMWORK
  {
    category: 'teamwork',
    title: 'Communicate!',
    tip: 'Talk to your teammates during the game! Say "man on!" "turn!" or "I\'m open!" — it helps everyone play better.',
    drill: 'During your next practice, try to say something helpful at least 10 times. It feels weird at first but it really helps!',
    emoji: '📣',
  },
  {
    category: 'teamwork',
    title: 'Move Off the Ball',
    tip: '90% of the game you DON\'T have the ball. Keep moving, find open space, and give your teammates passing options!',
    drill: 'In a small-sided game, count how many times you move to create space without the ball. Try for 20!',
    emoji: '🔄',
  },
  {
    category: 'teamwork',
    title: 'Celebrate Your Teammates',
    tip: 'When a teammate makes a great play, tell them! A high-five or "great pass!" makes the whole team better.',
    drill: 'Give at least 5 compliments to teammates at your next practice. Watch how it changes the energy!',
    emoji: '🙌',
  },
  {
    category: 'teamwork',
    title: 'Play Simple',
    tip: 'You don\'t have to do something fancy every time. A simple pass to an open teammate is often the best play!',
    drill: 'In your next game, try to make 5 simple passes in a row before attempting anything tricky.',
    emoji: '✅',
  },

  // FITNESS
  {
    category: 'fitness',
    title: 'Quick Feet',
    tip: 'Fast footwork helps with everything — dribbling, defense, and changing direction. Train your feet to be lightning fast!',
    drill: 'Do ladder drills or toe taps on a ball for 1 minute. Rest 30 seconds. Repeat 3 times!',
    emoji: '⚡',
  },
  {
    category: 'fitness',
    title: 'Juggling Practice',
    tip: 'Juggling improves your touch, coordination, and confidence. Even 5 minutes a day makes a huge difference!',
    drill: 'Try to beat your juggling record today! Start by dropping and catching between each touch if needed.',
    emoji: '🤹',
  },
  {
    category: 'fitness',
    title: 'Balance is Key',
    tip: 'Good balance helps you hold off defenders, change direction, and stay on your feet. Train it!',
    drill: 'Stand on one foot for 30 seconds while passing a ball hand to hand. Switch feet. Do 3 rounds!',
    emoji: '⚖️',
  },

  // MINDSET
  {
    category: 'mindset',
    title: 'Mistakes Are OK!',
    tip: 'Every pro soccer player misses shots and makes bad passes. The difference? They keep trying and learn from it!',
    drill: 'After your next mistake in practice, take a deep breath and focus on the NEXT play. Don\'t dwell on it!',
    emoji: '🧠',
  },
  {
    category: 'mindset',
    title: 'Watch the Pros',
    tip: 'Watch how pro players move without the ball, how they position their body, and how they make space.',
    drill: 'Watch 10 minutes of a pro game today. Pick one player and only watch THEM — even when they don\'t have the ball!',
    emoji: '📺',
  },
  {
    category: 'mindset',
    title: 'Visualize Success',
    tip: 'Before a game, close your eyes and picture yourself making a great play. Your brain practices even when your body rests!',
    drill: 'Spend 2 minutes before bed tonight imagining yourself scoring a goal. See every detail!',
    emoji: '💭',
  },
  {
    category: 'mindset',
    title: 'Be Coachable',
    tip: 'The best players listen to their coaches and try to improve. When someone gives you advice, try it — even if it feels strange!',
    drill: 'At your next practice, ask your coach for one thing you can work on. Then practice it 10 extra times!',
    emoji: '📝',
  },
  {
    category: 'mindset',
    title: 'Have Fun!',
    tip: 'The most important thing in soccer is having fun! When you enjoy playing, you play your best.',
    drill: 'Play a pickup game with friends — no rules, no pressure, just fun! That\'s where creativity comes from.',
    emoji: '😄',
  },

  // GOALKEEPING
  {
    category: 'goalkeeping',
    title: 'Ready Position',
    tip: 'Stand with your feet shoulder-width apart, knees bent, hands up by your sides. Be ready to spring in any direction!',
    drill: 'Get in your ready position. Have a friend point left or right — dive that way! 10 reps each side.',
    emoji: '🧤',
  },
  {
    category: 'goalkeeping',
    title: 'Be Big in Goal',
    tip: 'Come off your line to cut down the angle. The closer you are to the shooter, the less goal they can see!',
    drill: 'Stand on the goal line, then take 3 big steps forward. See how much less goal the shooter has to aim at!',
    emoji: '🧱',
  },

  // MORE DRIBBLING
  {
    category: 'dribbling',
    title: 'The Stepover',
    tip: 'A stepover is when you swing your foot OVER the ball to fake going one way, then push it the other. It\'s a classic move!',
    drill: 'Practice stepovers standing still first. Then try them while walking slowly. Speed up when it feels natural!',
    emoji: '🕺',
  },
  {
    category: 'dribbling',
    title: 'Roll and Go',
    tip: 'Use the sole of your foot to roll the ball sideways, then push it forward with the outside of your foot. Quick and effective!',
    drill: 'Roll the ball sideways with your sole 10 times with each foot. Add the push forward once the roll feels smooth!',
    emoji: '🎱',
  },

  // MORE PASSING
  {
    category: 'passing',
    title: 'Through Ball',
    tip: 'A through ball goes between defenders into space for a teammate to run onto. It\'s one of the most dangerous passes in soccer!',
    drill: 'Set up 2 cones as "defenders" with a gap. Practice passing through the gap to a friend running behind them!',
    emoji: '🧵',
  },
  {
    category: 'passing',
    title: 'Wall Pass (Give and Go)',
    tip: 'Pass to a teammate and immediately sprint past the defender. Your teammate passes it right back — you\'ve beaten them!',
    drill: 'Practice with a friend: pass, sprint forward 5 yards, receive the return pass. Do 10 each side!',
    emoji: '🏓',
  },

  // MORE SHOOTING
  {
    category: 'shooting',
    title: 'Volleys',
    tip: 'To volley (kick the ball out of the air), keep your eye on the ball and strike through it with a locked ankle.',
    drill: 'Toss the ball to yourself and try to volley it at a target. Start close and move back as you improve!',
    emoji: '✈️',
  },
]

export function getDailySoccerTip(): SoccerTip {
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 0)
  const dayOfYear = Math.floor((now.getTime() - start.getTime()) / 86400000)
  return SOCCER_TIPS[dayOfYear % SOCCER_TIPS.length]
}

const CATEGORY_LABELS: Record<SoccerTip['category'], string> = {
  'dribbling': 'Dribbling',
  'passing': 'Passing',
  'shooting': 'Shooting',
  'defense': 'Defense',
  'first-touch': 'First Touch',
  'heading': 'Heading',
  'teamwork': 'Teamwork',
  'fitness': 'Fitness',
  'goalkeeping': 'Goalkeeping',
  'mindset': 'Mindset',
}

const CATEGORY_COLORS: Record<SoccerTip['category'], string> = {
  'dribbling': '#6DC4A7',
  'passing': '#5BA4E6',
  'shooting': '#F26E63',
  'defense': '#F9C35C',
  'first-touch': '#A78BFA',
  'heading': '#F97316',
  'teamwork': '#EC4899',
  'fitness': '#22D3EE',
  'goalkeeping': '#84CC16',
  'mindset': '#C084FC',
}

export function getCategoryLabel(category: SoccerTip['category']): string {
  return CATEGORY_LABELS[category]
}

export function getCategoryColor(category: SoccerTip['category']): string {
  return CATEGORY_COLORS[category]
}
