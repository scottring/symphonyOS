extension WalkExampleLibrary {
    /// People: twenty themes, four lines each for Year, Season, Month and Week (see `parse`).
    /// A theme whose name starts with `~` is offered only when the person's own words find it.
    static let people = """
## family | family, families, household, loved ones, togetherness, family time, family dinner, family night
Y Spend more time with my family
Y Eat dinner as a family most nights
Y Feel closer as a family this year
Y Make family time a weekly habit
S Have one family dinner every week
S Start a weekly family game night
S Do one family outing each month
S Keep Sunday afternoons for family
M Hold four family dinners this month
M Pick a regular night for family time
M Plan one outing the whole family likes
M Ask everyone what they want to do more
W Put family dinner on the calendar today
W Ask the family what sounds fun on Friday
W Cook a meal together on Sunday
W Take a walk with the family on Saturday

## ~partner | partner, spouse, husband, wife, marriage, married, girlfriend, boyfriend, date night, relationship, romance
Y Feel closer to my partner this year
Y Make regular date nights a habit
Y Put my partner first more often
Y Have more fun together as a couple
S Go on a date night every other week
S Take one weekend away as a couple
S Talk for 15 minutes every evening
S Try one new thing together each month
M Plan two date nights this month
M Pick a standing night for the two of us
M Start walking together after dinner
M Ask my partner what they miss doing
W Book a table for two on Friday
W Ask my partner about their day today
W Plan a surprise date on Saturday
W Write my partner a short note on Monday

## ~kids | kids, kid, children, child, son, daughter, toddler, teen, teenager, parenting, parent
Y Get one on one time with each kid
Y Be more patient with the kids
Y Read with the kids most nights
Y Be home for dinner with the kids
S Have a weekly date with each kid
S Read together for 15 minutes a night
S Take the kids out one Saturday a month
S Keep my phone away during bedtime
M Plan a solo outing with each kid
M Start a bedtime reading routine
M Eat with the kids four nights a week
M Let the kids pick one Saturday activity
W Read two books at bedtime on Monday
W Take one kid for ice cream on Saturday
W Play a game with the kids on Friday
W Ask the kids about their day today

## friends | friends, friend, friendship, friendships, buddies, pals, best friend, bestie, hang out, hanging out
Y See my friends at least twice a month
Y Be a better friend this year
Y Take a trip with close friends
Y Make friend time a regular thing
S Start a monthly dinner with friends
S See one friend every week
S Plan a weekend away with friends
S Say yes to more invitations
M Pick a standing night to see friends
M Get three friend dates on the calendar
M Start a group chat to pick a date
M Meet two friends for coffee this month
W Text a friend to set up coffee today
W Invite a friend for a walk on Saturday
W Call a close friend on Wednesday
W Ask friends about dinner on Thursday

## ~parents | parents, mom, dad, mother, father, folks, mama, papa
Y See my parents more often this year
Y Call my parents every week
Y Be closer to my parents
Y Know my parents better as people
S Call home every Sunday
S Visit my parents once a month
S Ask my parents about their early years
S Share one meal a month with my parents
M Set a weekly time to call my parents
M Plan a visit home this month
M Send my parents photos every week
M Write down three questions to ask them
W Call my parents on Sunday
W Pick a weekend to visit home today
W Send my parents a photo on Wednesday
W Ask about their first job on Thursday

## staying in touch | in touch, call, calls, calling, text, texts, texting, letter, letters, check in, long distance, far away, postcard*
Y Stay in touch with people far away
Y Call the people I love every week
Y Answer messages within a day or two
Y Check in on someone every single week
S Call one person every Sunday
S Send one letter or card each month
S Reply to texts the same day
S Set a weekly hour for catching up
M Make a list of ten people to call
M Call four people I have been missing
M Clear out my unanswered messages
M Pick a regular day for phone calls
W Call one person I miss on Sunday
W Reply to three old texts today
W Mail a postcard on Tuesday
W Text someone just to say hi on Thursday

## old friends | reconnect*, old friends, old friend, lost touch, catch up, class reunion, college friends, childhood friends, drifted, rekindle, high school
Y Reconnect with three old friends
Y Get back in touch with old friends
Y Rebuild a friendship I let drift
Y See an old friend in person again
S Reach out to one old friend a month
S Plan a visit with a friend I miss
S Catch up by phone every few weeks
S Get the old group together once
M List the friends I have lost touch with
M Message two friends I have not seen
M Set up one long catch up call
M Find a date to meet in person
W Text an old friend hello today
W Track down a phone number on Tuesday
W Send an old photo to a friend on Friday
W Ask an old friend to lunch on Saturday

## new friends | new friends, new friend, make friends, making friends, meet people, meeting people, lonely, loneliness, social circle, social life, acquaintances
Y Make two real new friends this year
Y Build a circle of friends where I live
Y Feel less lonely by meeting people
Y Turn acquaintances into friends
S Go to one social event every week
S Invite someone new for coffee monthly
S Become a regular somewhere friendly
S Follow up with people I click with
M Try three places to meet new people
M Ask one acquaintance to hang out
M Show up at the same event twice
M Learn the names of five new people
W Say hello to someone new today
W Pick one local event to try on Thursday
W Ask someone new to coffee on Wednesday
W Go to a local get together on Saturday

## hosting | host, hosting, hosts, dinner party, party, parties, potluck, gathering, gatherings, entertain*, guests, cookout, barbecue, people over
Y Host friends for dinner once a month
Y Become someone who has people over
Y Make my home a place people gather
Y Get comfortable hosting a crowd
S Host one small dinner each month
S Have people over three times this season
S Start a casual potluck night
S Learn three easy meals for a crowd
M Invite four people for a simple meal
M Pick a date and send the invitations
M Get the place ready for company
M Choose one go to recipe for guests
W Invite two friends for dinner today
W Plan the menu on Wednesday
W Shop for the dinner on Friday
W Clear and set the table on Saturday

## ~siblings | sibling, siblings, brother, brothers, sister, sisters, bro, sis
Y Be closer to my siblings this year
Y Talk to my siblings every week
Y See my siblings more than at holidays
Y Stay part of my siblings daily lives
S Call a sibling every other week
S Plan one siblings weekend
S Keep a siblings group chat going
S Share a meal or a video call monthly
M Set a regular time to call a sibling
M Find a weekend that works for everyone
M Mail a sibling a small surprise
M Share old family photos with siblings
W Call my sibling on Saturday
W Text a sibling a funny memory today
W Ask siblings for free dates on Tuesday
W Send a sibling an old photo on Thursday

## being present | presence, listen, listening, listener, attentive, distracted, undivided, phone down, phone away
Y Be fully present with people I love
Y Become a better listener
Y Put people ahead of my phone
Y Give people my full attention
S Keep phones off the table at meals
S Ask one more question before I reply
S Have one device free evening a week
S Stop checking my phone mid conversation
M Leave my phone in another room at dinner
M Practice listening without fixing
M Turn off alerts after 6 each evening
M Notice when my mind wanders and return
W Eat dinner with my phone put away today
W Ask one curious question on Tuesday
W Silence my alerts for dinner on Thursday
W Have one phone free coffee on Saturday

## ~dating | dating, dates, meet someone, find love, find someone, first date, love life, soulmate
Y Find a relationship that feels right
Y Put myself out there and date again
Y Go on dates with people I truly like
Y Be open to meeting someone this year
S Go on two dates a month
S Say yes to being set up by friends
S Try two new ways to meet people
S Get clear on what I want in a partner
M Write down what matters most to me
M Refresh my dating profile and photos
M Tell three friends I am ready to date
M Go on one first date this month
W Ask a friend to set me up today
W Pick two good photos of me on Sunday
W Send one hello to a match on Tuesday
W Plan a simple coffee date on Thursday

## community | community, club, clubs, belong, belonging, league, meetup
Y Find a community where I belong
Y Be an active member of a local group
Y Join a club and stick with it all year
Y Feel rooted in the place I live
S Show up to one group every week
S Try three groups and choose one
S Go to every meeting for three months
S Take on a small role in a group
M Visit two local clubs this month
M Join one group that meets regularly
M Go to the same group four weeks running
M Introduce myself to three members
W Look up local clubs near me today
W Sign up for one meeting on Monday
W Go to a first club night on Thursday
W Email a group organizer on Tuesday

## volunteering | volunteer, volunteering, volunteers, give back, giving back, charity, serve, serving, service, food bank, shelter, nonprofit, help out, good cause
Y Volunteer regularly for a cause I love
Y Give 50 hours to my community this year
Y Find a volunteer role that fits me
Y Make giving back part of every month
S Volunteer twice a month
S Try out two places that need help
S Commit to one regular shift
S Bring a friend along to volunteer
M Find three places that need volunteers
M Sign up for a first shift
M Complete the volunteer orientation
M Block two volunteer dates this month
W Search for places to volunteer today
W Fill out a volunteer form on Tuesday
W Call a local food bank on Wednesday
W Work my first shift on Saturday

## ~hard conversations | apologize, apology, forgive, forgiveness, amends, reconcile, repair, mend, estranged, grudge, hard conversation*, difficult conversation*, tough conversation*, make peace
Y Make peace with someone I fell out with
Y Have the talk I keep putting off
Y Repair a relationship that matters
Y Let go of an old grudge
S Reach out and open the door again
S Say the honest thing with kindness
S Meet in person and listen first
S Apologize for my part without excuses
M Write out what I want to say
M Ask to talk and agree on a time
M Talk it through with someone I trust
M Have the first honest conversation
W Draft what I want to say today
W Send a note asking to talk on Monday
W Practice my opening line on Wednesday
W Write an apology letter on Sunday

## neighbors | neighbor, neighbors, neighborhood, neighborly, next door, my block, our block
Y Know my neighbors by name
Y Be the neighbor people can count on
Y Make where I live feel friendlier
Y Get to know the people next door
S Meet one new neighbor each month
S Stop and chat when I see neighbors
S Organize one neighborhood get together
S Offer help to a neighbor when I can
M Introduce myself to two neighbors
M Learn the names of people next door
M Invite a neighbor over for coffee
M Swap phone numbers with one neighbor
W Say hello next door on Saturday
W Bring cookies to a neighbor on Sunday
W Ask a neighbor their name today
W Leave a note next door on Wednesday

## birthdays | birthday, birthdays, anniversary, anniversaries, gift, gifts, occasions, thoughtful, thank you
Y Remember every birthday that matters
Y Send a card for every birthday
Y Be thoughtful about gifts all year
Y Never miss an important date again
S Mail birthday cards a week early
S Keep a running list of gift ideas
S Mark each occasion with a call or card
S Shop ahead for the next three birthdays
M Write down every birthday I should know
M Stock up on cards and stamps
M Buy gifts for birthdays coming up
M Set reminders a week before each date
W List the next five birthdays today
W Buy a box of cards on Saturday
W Mail one birthday card on Monday
W Ask a relative for birthdays on Sunday

## ~boundaries | boundary, boundaries, say no, saying no, people pleasing, people pleaser, toxic, overcommit*, stand up, resentment, pushover, limits
Y Set clear and kind boundaries
Y Say no without feeling guilty
Y Stop saying yes to things I dread
Y Protect my time for people who matter
S Say no to one request each week
S Pause before I agree to anything
S Tell people plainly what I need
S Keep two evenings a week for myself
M Name the three things I will stop doing
M Practice one sentence for saying no
M Have one honest talk about my limits
M Turn down one thing I do not want to do
W Decline one invitation kindly today
W Write down my polite no on Monday
W Ask for a day to think on Wednesday
W List what drains me on Sunday

## ~relatives | relatives, relative, cousin*, aunt*, uncle*, niece*, nephew*, in laws, family reunion, extended family
Y Stay close to my extended family
Y See relatives more than once a year
Y Bring the whole family together again
Y Know my relatives beyond the holidays
S Start planning a family get together
S Call one relative every other week
S Visit relatives I rarely see
S Share family news in a group chat
M Collect phone numbers for my relatives
M Pick a date for a family get together
M Call two relatives I rarely talk to
M Plan one visit to see relatives
W Call an aunt or uncle on Thursday
W Text a cousin to say hello today
W Ask relatives for free dates on Monday
W Mail a family photo on Friday

## ~grandparents | grandparent, grandparents, grandma, grandpa, grandmother, grandfather, nana, granny, gran, grandad, granddad
Y See my grandparents more this year
Y Hear the stories my grandparents tell
Y Call my grandparents every week
Y Make more memories with a grandparent
S Visit a grandparent once a month
S Call a grandparent every Sunday
S Write down one family story a month
S Cook an old family recipe together
M Plan two visits with a grandparent
M Ask about their childhood on a visit
M Mail a letter or photos to a grandparent
M Go through old photo albums together
W Call a grandparent on Sunday
W Mail a handwritten card on Tuesday
W Visit for an hour on Saturday
W Ask for a favorite recipe on Thursday
"""
}
