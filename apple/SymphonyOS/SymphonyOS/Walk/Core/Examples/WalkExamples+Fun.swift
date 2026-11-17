extension WalkExampleLibrary {
    /// Fun: twenty themes, four lines each for Year, Season, Month and Week (see `parse`).
    /// A theme whose name starts with `~` is offered only when the person's own words find it.
    static let fun = """
## reading | read, reads, reading, reader, books, novels, library, audiobook, audiobooks, book club, classics, bookshelf
Y Read 12 books this year
Y Make reading a daily habit
Y Read the classics I always skipped
Y Finish the books already on my shelf
S Read for 20 minutes every night
S Finish three books this season
S Join a book club and keep up with it
S Carry a book everywhere I go
M Finish one book this month
M Get a library card and borrow a book
M Make a list of ten books to read
M Read before bed instead of scrolling
W Pick my next book on Sunday
W Read one chapter today
W Visit the library on Saturday
W Put a book on my nightstand on Monday

## travel | travel, travels, traveling, trip, trips, vacation, vacations, abroad, overseas, getaway, getaways, passport, countries, sightseeing
Y Take a big trip somewhere new
Y Travel abroad for the first time
Y Take two real vacations this year
Y Take a weekend getaway each season
S Plan and book one trip
S Build a trip fund this season
S Settle on a place and dates
S Map out the whole trip day by day
M Pick a destination and dates
M Work out what the trip will cost
M Book a place to stay
M Request the time off work
W Price out one trip on Tuesday
W List three places to go on Sunday
W Check my calendar for free weeks today
W Ask a friend for trip ideas on Friday

## hobby | hobby, hobbies, pastime, pastimes, something new, new things, new skill, new skills
Y Find a hobby I truly love
Y Try 12 new things this year
Y Learn one new skill just for fun
Y Make time for a hobby every week
S Try three new things this season
S Take a beginner class in something
S Give one hobby a real three month try
S Keep one evening a week for a hobby
M Try one new thing this month
M Sign up for a class or workshop
M List ten things I want to try
M Visit a local club or group once
W Write down five hobby ideas today
W Look up local classes on Wednesday
W Ask a friend what they enjoy on Thursday
W Set aside one hour for fun on Sunday

## instrument | guitar, piano, instrument, instruments, ukulele, violin, drums, keyboard, banjo, cello, saxophone, chords
Y Learn to play an instrument
Y Play ten songs all the way through
Y Play a song for family and friends
Y Pick my old instrument back up
S Practice 15 minutes most days
S Take weekly lessons for a season
S Learn three full songs
S Get comfortable with the basics
M Learn one song start to finish
M Find a teacher or an online course
M Practice four days a week this month
M Set up a practice corner at home
W Practice for ten minutes today
W Book a first lesson on Monday
W Choose one song to learn on Saturday
W Dust off my instrument on Wednesday

## language | language, languages, spanish, french, italian, german, japanese, mandarin, chinese, korean, portuguese, fluent, bilingual, conversational
Y Hold a conversation in a new language
Y Learn enough to get by on a trip
Y Read a short book in another language
Y Become conversational by December
S Study a little every single day
S Learn the 500 most common words
S Take a language class for a season
S Talk out loud with someone weekly
M Finish the first unit of a course
M Learn 100 everyday words
M Find a conversation partner
M Keep a 30 day practice streak
W Learn ten new words today
W Sign up for a language class on Monday
W Label ten things at home on Saturday
W Watch one show with subtitles on Friday

## cooking | cook, cooks, cooking, recipe, recipes, cuisine, chef, cookbook, cookbooks, dishes, grill, grilling, pasta, knife skills
Y Cook one new recipe every week
Y Cook my way through a cookbook
Y Learn to cook without a recipe
Y Master five dishes I am proud of
S Try one new recipe each week
S Take a cooking class
S Cook dinner from scratch twice a week
S Get good at one kind of cooking
M Cook four new recipes this month
M Nail one basic technique
M Cook a meal for friends
M Stock the pantry with the basics
W Pick a recipe to try on Sunday
W Shop for ingredients on Saturday
W Cook one new dish on Wednesday
W Sharpen the kitchen knives today

## hiking | hike, hikes, hiking, hiker, trail, trails, mountain, mountains, summit, outdoors, nature, national park, national parks, waterfall
Y Hike 20 different trails this year
Y Hike to a summit with a view
Y Do a big all day hike
Y Get out on a trail every month
S Hike twice a month
S Work up to a six mile hike
S Find five good trails near home
S Join a local hiking group
M Do two hikes this month
M Get good boots and a day pack
M Try one trail I have never walked
M Make a list of hikes to try
W Pick a trail to hike on Thursday
W Hike for one hour on Saturday
W Pack a day bag on Friday
W Ask a friend to hike on Wednesday

## gardening | garden, gardens, gardening, gardener, vegetable, vegetables, veggies, tomatoes, flowers, herbs, seeds, compost
Y Grow my own vegetables this year
Y Grow flowers from seed
Y Grow fresh herbs all year long
Y Keep a garden going spring to fall
S Get beds or pots ready to grow
S Garden for an hour every weekend
S Grow three things from seed
S Keep up with watering and weeding
M Choose what to grow and where
M Buy seeds and a bag of soil
M Get the first seeds in the soil
M Set up a watering routine
W Buy seeds on Saturday
W Pull weeds for 20 minutes on Sunday
W Fill three pots with soil today
W Draw a simple garden layout on Monday

## camping | camp, camps, camping, camper, campsite, campground, tent, backpacking, campfire, rv, glamping, sleeping bag
Y Go camping three times this year
Y Take a week long camping trip
Y Camp somewhere I have never been
Y Become a confident camper
S Camp one weekend this season
S Get my camping gear together
S Book campsites before they fill up
S Do one practice night close to home
M Reserve a campsite
M Check the tent and sleeping bags
M Plan a simple camp menu
M Write a packing list for camping
W Set up the tent at home on Sunday
W Look up campsites nearby on Tuesday
W Test the camp stove on Saturday
W Air out the sleeping bags today

## art | draw, draws, drawing, sketch, sketching, paint, paints, painting, watercolor, watercolors, art, artist, illustrat*, doodle
Y Fill a whole sketchbook this year
Y Learn to draw what I see
Y Make one finished artwork a month
Y Hang my own art on the wall
S Draw or paint twice a week
S Take an art class
S Finish three pictures I like
S Sketch for ten minutes a day
M Finish one drawing or painting
M Gather my art supplies in one spot
M Work through a beginner tutorial
M Sketch every day for two weeks
W Buy a sketchbook on Saturday
W Draw one thing I can see today
W Sketch for ten minutes on Tuesday
W Watch one drawing lesson on Thursday

## writing | write, writes, writing, writer, novel, journal, journaling, story, stories, poem, poems, poetry, memoir, blog
Y Write the first draft of a book
Y Write something every week
Y Finish and share a short story
Y Make writing a daily habit
S Write for 20 minutes each morning
S Finish one full draft
S Join a writing group or class
S Fill one notebook with writing
M Write three days a week this month
M Finish one short story or essay
M Choose a set hour for writing
M Outline what I want to write
W Write one page today
W Write for 15 minutes on Monday
W Jot down ten ideas on Thursday
W Buy a good notebook on Friday

## photography | photo, photos, photograph*, camera, cameras, pictures, portraits, lens, lenses, darkroom, snapshots
Y Learn to take photos I love
Y Take a photo every day for a year
Y Print and frame my best photos
Y Make a photo book of the year
S Take a photo walk every week
S Learn the basics of light and framing
S Take a photography class
S Choose my best ten photos each month
M Take photos on four outings
M Learn one camera setting a week
M Print five favorite photos
M Sort and back up my photos
W Take a photo walk on Saturday
W Clean my camera lens today
W Print one favorite photo on Friday
W Photograph one thing at home on Tuesday

## crafts | knit, knitting, crochet, sew, sewing, quilt, quilting, embroidery, craft, crafts, crafting, pottery, ceramics, yarn
Y Finish one handmade project a month
Y Make handmade gifts for the holidays
Y Learn a new craft from scratch
Y Make something I use every day
S Finish one project start to finish
S Craft for an hour twice a week
S Take a class to learn the basics
S Learn three new techniques
M Pick a project and buy supplies
M Finish one small project
M Find a local craft group
M Set up a craft corner at home
W Buy supplies for one project on Saturday
W Craft for 30 minutes on Thursday
W Watch a beginner tutorial on Monday
W Sort my craft supplies today

## baking | bake, bakes, baking, baker, bread, sourdough, cake, cakes, pastry, pastries, cookies, pie, pies, dessert
Y Learn to bake bread from scratch
Y Bake something new every month
Y Bake every birthday cake this year
Y Have a signature bake I am known for
S Bake every weekend
S Get one basic recipe just right
S Try three bakes I have never made
S Share what I bake with neighbors
M Bake four times this month
M Get the basic baking tools
M Repeat one recipe until it works
M Bake one treat to give away
W Bake one batch on Sunday
W Buy baking supplies on Friday
W Choose a recipe to bake on Wednesday
W Take stock of my baking pans today

## films | movie, movies, film, films, show, shows, series, cinema, documentary, documentaries, tv, watchlist, oscar, oscars
Y Watch the 50 films on my list
Y Watch all the classics I have missed
Y Go to the movies once a month
Y Hold a movie night every week
S Watch one film a week
S Work through one director or genre
S Keep notes on everything I watch
S Host a movie night each month
M Watch four films from my list
M Make a watchlist of 20 titles
M See one film in a theater
M Invite friends for a movie night
W Pick a film to watch on Friday
W Add five films to my list today
W Watch one documentary on Sunday
W Ask a friend for a movie pick on Tuesday

## events | concert, concerts, theater, theatre, musical, musicals, festival, festivals, museum, museums, comedy, opera, gig, gigs
Y Go to one live event every month
Y See a favorite artist in person
Y Visit the museums I keep skipping
Y Go to more plays and comedy shows
S Go to three events this season
S Book tickets early for two events
S See one kind of show I never tried
S Find the good local venues near me
M Go to one event this month
M Buy tickets for one thing I want to see
M List the events coming up near me
M Ask a friend to come along to one
W Check local listings on Monday
W Buy tickets for one event on Wednesday
W Invite a friend to a show on Thursday
W Put one event on my calendar today

## sports | sport, sports, golf, tennis, pickleball, softball, basketball, soccer, volleyball, bowling, league, leagues, rec team, badminton
Y Join a rec league for a full season
Y Get back into a sport I miss
Y Learn a new sport from scratch
Y Play a sport I love every week
S Play once a week all season
S Join a local league or club
S Take lessons or a beginner clinic
S Find regular people to play with
M Get out and play four times
M Sign up for a league or class
M Get the gear I need to play
M Find a good place to play nearby
W Look up local leagues on Monday
W Ask a friend to play on Saturday
W Practice for 30 minutes on Wednesday
W Check my gear and shoes today

## games | game night, game nights, board game, board games, card games, video games, gaming, chess, puzzle, puzzles, poker, trivia, crossword, crosswords
Y Host a game night every month
Y Play games with friends every week
Y Learn five new games this year
Y Get really good at one game
S Keep a weekly game night going
S Host three game nights
S Learn one new game a month
S Find a steady group to play with
M Host one game night
M Learn the rules of one new game
M Visit a local game shop or club
M Play every week this month
W Invite friends to play on Friday
W Pick a game to learn on Tuesday
W Play one round today
W Set a date for game night on Monday

## solitude | alone, solitude, quiet, relax, relaxing, unwind, downtime, me time, recharge, to myself, for myself
Y Keep one evening a week just for me
Y Take a day to myself every month
Y Have an hour of quiet every day
Y Learn to relax without feeling guilty
S Hold one evening a week for myself
S Take a slow morning every weekend
S Spend a half day alone each month
S Find three things that recharge me
M Block two evenings just for me
M Take one afternoon completely off
M List the things that help me unwind
M Say no to one thing each week
W Take a quiet walk alone on Sunday
W Block one free evening today
W Sit with coffee and no phone on Saturday
W Turn my phone off for an hour on Tuesday

## woodworking | woodwork*, wood, wooden, carpentry, furniture, workshop, workbench, carve, carving, whittling, bookcase, birdhouse
Y Build a table with my own hands
Y Learn woodworking from the ground up
Y Build three things for my home
Y Make wooden gifts for the holidays
S Finish one build start to finish
S Learn to use the basic tools safely
S Take a woodworking class
S Work on a build every weekend
M Build one small beginner project
M Buy or borrow the tools I need
M Find plans for my first build
M Set up a safe place to work
W Buy lumber for one project on Saturday
W Sand one board smooth on Sunday
W Watch a beginner build video on Thursday
W Clear a spot to work today
"""
}
