extension WalkExampleLibrary {
    /// Health: twenty themes, four lines each for Year, Season, Month and Week (see `parse`).
    /// A theme whose name starts with `~` is offered only when the person's own words find it.
    static let health = """
## ~weight | weight, pounds, lbs, slim, slimmer, thinner, belly, waist
Y Lose 10 pounds and keep it off
Y Get back to a weight I feel good at
Y Fit comfortably in my favorite jeans
Y Lose weight slowly and steadily
S Lose five pounds this season
S Weigh in every Friday morning
S Keep a simple food log each day
S Eat smaller portions at dinner
M Lose two pounds this month
M Log what I eat for two weeks
M Stop eating after 8 at night
M Find three filling low calorie lunches
W Step on the scale on Monday
W Write down everything I eat today
W Measure my waist on Sunday
W Pack a lighter lunch on Wednesday

## exercise | exercise, exercising, workout, workouts, work out, active, fit, fitter, fitness, shape, cardio, swim, swimming, sports
Y Exercise three times a week all year
Y Get in the best shape of my life
Y Make working out a normal habit
Y Stay active every week this year
S Work out three days a week
S Try a new kind of workout each month
S Find a workout I actually enjoy
S Exercise before work twice a week
M Work out twice a week for four weeks
M Try three different fitness classes
M Set a regular workout schedule
M Find a workout buddy
W Do a 20 minute workout on Monday
W Sign up for a trial class today
W Put three workouts on my calendar today
W Ask a friend to work out on Saturday

## eating | eat, eating, eats, diet, nutrition, vegetables, veggies, fruit, fruits, salad, salads, junk food, fast food, healthy food
Y Eat more vegetables every day
Y Eat healthy most days of the week
Y Cut way back on junk food
Y Feel good about what I eat
S Eat a vegetable with every dinner
S Bring a healthy lunch to work
S Eat fruit instead of chips for snacks
S Eat breakfast every morning
M Add a vegetable to lunch each day
M Keep fruit on the counter all month
M Skip fast food for four weeks
M Find five healthy snacks I like
W Buy fruit and vegetables on Sunday
W Eat a salad for lunch today
W Clear the junk food out on Saturday
W Cut up veggies for snacks on Monday

## sleep | sleep, sleeps, sleeping, slept, bedtime, rested, insomnia, tired, waking
Y Get seven hours of sleep most nights
Y Wake up feeling rested
Y Keep a steady bedtime all year
Y Stop staying up too late
S Be in bed by 10 on weeknights
S Wake up at the same time every day
S Keep my phone out of the bedroom
S Wind down for 30 minutes before bed
M Set a bedtime and keep it for a month
M Skip coffee after lunch all month
M Build a simple bedtime routine
M Make my bedroom dark and quiet
W Set a bedtime alarm on Sunday
W Go to bed 30 minutes early on Monday
W Buy blackout curtains on Saturday
W Move my charger out of the bedroom today

## stress | stress, stressed, stressful, anxiety, anxious, calm, calmer, relax, relaxing, burnout, worry, worrying, overwhelm*, mental health
Y Feel calmer and less stressed
Y Handle stress without losing sleep
Y Make real room to relax every week
Y Stop feeling so overwhelmed
S Take a real lunch break every workday
S Keep one evening a week totally free
S Take a quiet ten minutes every day
S Say no to one extra thing each week
M Notice what stresses me most
M Block one free evening each week
M Find two things that help me unwind
M Take a short break every afternoon
W Write down my top three worries today
W Take a ten minute quiet break on Monday
W Clear one thing off my calendar today
W Spend an hour doing nothing on Sunday

## walking | walk, walks, walking, walked, steps, step count, stroll, strolls, hike, hikes, hiking
Y Walk 10,000 steps a day
Y Walk every day this year
Y Walk a thousand miles this year
Y Make a daily walk part of my life
S Walk 30 minutes every morning
S Take a walk after dinner each night
S Reach 8,000 steps most days
S Take one long walk every weekend
M Walk 20 minutes a day for a month
M Find three walking routes I like
M Walk at lunch three days a week
M Track my steps every day this month
W Take a 15 minute walk today
W Walk around the block on Monday
W Find my walking shoes on Sunday
W Walk to the park and back on Saturday

## water | water, hydrate, hydrated, hydrating, hydration, soda, sodas, thirsty
Y Drink enough water every day
Y Make water my main drink
Y Swap soda for water most days
Y Stay well hydrated all year
S Drink eight glasses of water a day
S Carry a water bottle everywhere
S Drink water with every meal
S Have a glass of water when I wake up
M Drink a glass of water before each meal
M Keep a full water bottle at my desk
M Cut down to one soda a day
M Track my water for two weeks
W Buy a water bottle I like on Saturday
W Fill my water bottle first thing today
W Put a water glass by my bed on Sunday
W Drink water with lunch on Wednesday

## running | run, runs, running, runner, 5k, 10k, marathon, jog, jogging, race
Y Run a 5K without stopping
Y Finish a half marathon
Y Run three times a week all year
Y Run a faster 10K than last year
S Run three mornings a week
S Build up to running 30 minutes
S Sign up for a spring race
S Add one long run each weekend
M Run twice a week for four weeks
M Pick a race and pay the entry fee
M Find a beginner training plan
M Get fitted for running shoes
W Buy running shoes on Saturday
W Run for ten minutes on Monday
W Map a quiet 2 mile route today
W Lay out running clothes on Sunday

## strength | strength, strong, stronger, lift, lifting, weights, gym, muscle, muscles, pushups, pullups, tone, toned
Y Get noticeably stronger this year
Y Lift weights twice a week all year
Y Do ten real pushups
Y Build muscle I can see and feel
S Lift weights two days a week
S Learn the basic lifts with good form
S Add a little weight every two weeks
S Do pushups every morning
M Join a gym near home or work
M Do strength training twice a week
M Learn a simple full body routine
M Book a session with a trainer
W Tour a gym on Saturday
W Do one set of pushups today
W Buy a pair of dumbbells on Sunday
W Try a beginner strength video on Monday

## checkups | checkup, checkups, check up, physical, doctor, doctors, appointment, appointments, screening, screenings, bloodwork, eye exam, vaccine*
Y Get my yearly physical
Y Catch up on every overdue checkup
Y Find a doctor I trust
Y Stay on top of my health screenings
S See the doctor before the season ends
S Book every checkup I have put off
S Find a doctor and book a first visit
S Get my health records in one place
M Schedule my physical
M Choose a primary care doctor
M Find out which screenings I am due for
M Gather my family health history
W Call to book a checkup on Monday
W Write down questions for my doctor today
W Look up what insurance covers on Tuesday
W List my overdue appointments on Friday

## cooking | cook, cooks, cooking, cooked, recipe, recipes, meal prep, meal plan, meal planning, takeout, homemade, lunches
Y Cook dinner at home most nights
Y Learn to cook healthy meals I love
Y Order takeout only once a week
Y Meal prep every week this year
S Cook at home four nights a week
S Prep lunches every Sunday
S Learn ten healthy recipes
S Plan the week of dinners each Sunday
M Cook three new healthy recipes
M Plan dinners for four weeks
M Pack my lunch three days a week
M Stock the kitchen with the basics
W Pick three dinners for the week today
W Cook a big batch of soup on Sunday
W Shop for the week of meals on Saturday
W Try one new recipe on Wednesday

## ~alcohol | alcohol, sober, sobriety, beer, beers, wine, booze, cocktails, liquor, drink less, drinking less, hangover, hangovers
Y Drink less than I did last year
Y Keep drinking to the weekends
Y Cut my drinking in half
Y Feel in control of my drinking
S Have three dry days every week
S Skip drinks on weeknights
S Stop at two drinks when I go out
S Keep alcohol out of the house
M Count my drinks for four weeks
M Find a drink I like without alcohol
M Go two weeks without a drink
M Pick my dry days and stick to them
W Buy sparkling water on Saturday
W Skip the drink with dinner today
W Add up my drinks for the week on Sunday
W Order a soda instead of a beer on Friday

## sugar | sugar, sugary, sweets, candy, dessert, desserts, cookies, chocolate, sweet tooth, ice cream
Y Cut way down on sugar
Y Save dessert for special occasions
Y Tame my sweet tooth
Y Stop reaching for candy every day
S Have dessert only on weekends
S Drink my coffee without sugar
S Keep sweets out of the house
S Reach for fruit when I want candy
M Go two weeks without added sugar
M Skip dessert on weeknights all month
M Find three treats with less sugar
M Read labels for sugar all month
W Skip dessert after dinner today
W Clear the candy out of my desk on Monday
W Buy fruit for my sweet tooth on Saturday
W Try my coffee without sugar on Tuesday

## meditation | meditate, meditates, meditating, meditation, mindful, mindfulness, breathing, breathwork, breathe
Y Meditate every day this year
Y Make meditation a steady habit
Y Learn to sit quietly with my thoughts
Y Be more mindful day to day
S Meditate ten minutes every morning
S Try a few styles of meditation
S Take a beginner meditation class
S Meditate five days a week
M Meditate five minutes a day for a month
M Pick a regular time and spot to sit
M Try three guided meditations
M Learn one simple breathing exercise
W Sit quietly for five minutes today
W Try a guided meditation on Monday
W Set up a quiet corner on Sunday
W Take ten slow breaths on Thursday

## stretching | yoga, stretch, stretches, stretching, flexible, flexibility, mobility, pilates, limber, posture
Y Touch my toes again
Y Stretch every day this year
Y Feel loose and flexible again
Y Make yoga a weekly habit
S Stretch ten minutes every morning
S Go to one yoga class a week
S Stretch before bed each night
S Learn a short routine by heart
M Stretch every day for 30 days
M Try three yoga classes
M Find a ten minute routine I like
M Stretch while I watch TV each night
W Stretch for five minutes today
W Try a beginner yoga video on Tuesday
W Buy a yoga mat on Saturday
W Sign up for a yoga class on Thursday

## screens | screen, screens, phone, scroll, scrolling, doomscroll*, social media, unplug, unplugged, offline, tv
Y Spend less time on my phone
Y Stop scrolling in bed
Y Cut my screen time in half
Y Be present instead of on a screen
S Keep my phone off the dinner table
S No screens for the last hour of the day
S Take one screen free day each month
S Check social media only once a day
M Set a daily limit on social media
M Turn off most of my notifications
M Read instead of scroll before bed
M Leave my phone behind on walks
W Turn off extra notifications today
W Delete one time wasting app on Monday
W Check my screen time total on Sunday
W Put my phone in a drawer on Saturday

## ~smoking | smoke, smokes, smoking, smoker, cigarette, cigarettes, vape, vapes, vaping, nicotine, tobacco
Y Quit smoking for good
Y Be smoke free by the end of the year
Y Stop vaping completely
Y Quit for good and stay quit
S Set a quit date and stick to it
S Cut back a little more each week
S Go smoke free for 30 days straight
S Find new habits for my smoke breaks
M Pick my quit date
M Tell friends and family I am quitting
M Find a quit line or support group
M Learn what makes me want to smoke
W Circle a quit date on the calendar today
W Tell a friend I am quitting on Monday
W Write down why I want to quit on Sunday
W Call a quit line on Wednesday

## dental | dentist, dental, teeth, tooth, floss, flosses, flossing, brush, brushing, gums, cavity, cavities
Y Floss every single day
Y See the dentist twice this year
Y Take better care of my teeth
Y Get through a year with no cavities
S Floss every night before bed
S Get my teeth cleaned
S Brush for two full minutes twice a day
S Catch up on dental work I put off
M Book a dental cleaning
M Floss every night for a month
M Find a dentist I like
M Brush before bed every night all month
W Call the dentist on Monday
W Buy floss and a toothbrush on Saturday
W Floss before bed today
W Set a floss reminder on Wednesday

## ~therapy | therapy, therapist, therapists, counseling, counselor, counselling, depression, depressed, grief, support group
Y Start therapy and stick with it
Y Take care of my mental health
Y Find a therapist who fits me
Y Talk to someone about how I feel
S Go to therapy every other week
S Find a therapist and book a first visit
S Try three sessions before I decide
S Keep a journal between sessions
M Make a short list of therapists
M Check what my insurance will cover
M Book a first appointment
M Ask someone I trust for a referral
W Call one therapist on Monday
W Search for therapists near me today
W List what I want help with on Thursday
W Ask a friend who they see on Friday

## cycling | bike, bikes, biking, biked, cycle, cycling, cyclist, bicycle, ride, rides, riding, spin class
Y Ride my bike every week this year
Y Bike a thousand miles this year
Y Finish a 50 mile ride
Y Bike to work most days
S Ride twice a week
S Build up to a 20 mile ride
S Join a weekend group ride
S Run errands by bike once a week
M Get my bike tuned up
M Ride every weekend this month
M Find three good routes near home
M Ride ten miles without stopping
W Pump up my bike tires on Saturday
W Ride around the neighborhood on Sunday
W Take my bike to the shop on Friday
W Map a ten mile route today
"""
}
