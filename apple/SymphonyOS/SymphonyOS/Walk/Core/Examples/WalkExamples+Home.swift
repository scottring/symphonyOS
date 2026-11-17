extension WalkExampleLibrary {
    /// Home: twenty themes, four lines each for Year, Season, Month and Week (see `parse`).
    /// A theme whose name starts with `~` is offered only when the person's own words find it.
    static let home = """
## declutter | declutter*, clutter, cluttered, purge, purging, downsize*, minimalis*, donate, donating, simplify, less stuff, own less, get rid
Y Declutter every room in my home
Y Own less and keep only what I use
Y Clear the clutter for good
Y Get rid of things I no longer need
S Declutter one room each month
S Fill one donation bag every week
S Clear out the closets and drawers
S Spend 15 minutes a day on clutter
M Go through every closet and dresser
M Clear every flat surface in one room
M Empty the junk drawer and one cupboard
M Take four loads to the donation center
W Fill one bag to donate on Saturday
W Sort one drawer on Monday
W Drop off a donation box on Sunday
W Clear off one surface today

## cleaning | clean, cleaning, cleaner, tidy, tidier, tidying, chores, housework, housekeeping, vacuum*, dusting, mopping, spotless, messy
Y Keep my home clean all year
Y Stick to a weekly cleaning routine
Y Have a tidy home ready for guests
Y Stay on top of chores without stress
S Clean for 20 minutes every day
S Deep clean one room each month
S Do a full reset every Sunday
S Keep the kitchen clean every night
M Write a simple cleaning schedule
M Deep clean the bathroom and kitchen
M Stock up on cleaning supplies
M Try a daily ten minute tidy
W Vacuum the whole place on Saturday
W Wipe down the kitchen today
W Buy cleaning supplies on Friday
W Choose my cleaning days on Monday

## organizing | organiz*, organis*, closet, closets, pantry, drawers, cupboards, shelves, shelving, bins, labels, wardrobe
Y Organize my home so things have a place
Y Organize every closet and cupboard
Y Have closets and a pantry that work
Y Set up systems that stay organized
S Organize one room from top to bottom
S Tackle one closet or cupboard a week
S Add shelves and bins where they help
S Label what goes where in each room
M Organize the pantry and label it
M Sort the bedroom closet by type
M Set up an entry spot for keys and bags
M Organize the bathroom cabinet
W Empty one cupboard and sort it today
W Buy storage bins on Saturday
W Label the pantry shelves on Sunday
W Measure the closet on Wednesday

## repairs | repair*, fix, fixes, fixing, fixed, maintenance, upkeep, leak*, broken, handyman, squeak*, gutters
Y Fix everything on the home repair list
Y Keep up with home maintenance all year
Y Stop putting off small repairs
Y Learn to handle basic repairs myself
S Finish one repair every two weeks
S Work through a seasonal upkeep list
S Get the biggest repair done first
S Build a basic tool kit and use it
M Walk through and list every repair
M Fix the three most annoying things
M Find a handyman I trust
M Check for leaks and drafts
W Write the repair list on Sunday
W Tighten every loose handle on Saturday
W Replace the burned out bulbs today
W Call about the biggest repair on Tuesday

## decorating | decorat*, redecorat*, decor, cozy, cozier, homey, art, artwork, curtains, rug, rugs, living room, lighting, makeover
Y Make my home feel warm and cozy
Y Decorate the living room at last
Y Fill the walls with art I love
Y Redecorate one room at a time
S Finish decorating one room
S Choose a look and stick to it
S Hang art and photos on the bare walls
S Swap harsh lights for warm lamps
M Collect ideas for the room I use most
M Frame and hang five favorite photos
M Choose a rug and curtains
M Set a small decorating budget
W Save ten room photos I like today
W Hang one picture on Saturday
W Measure the windows on Thursday
W Shop for one lamp on Sunday

## garden | garden, gardens, gardening, gardener, vegetable*, veggies, tomato*, herb, herbs, flowers, flowerbed*, raised bed, raised beds, compost*
Y Grow my own vegetables this year
Y Start a garden from scratch
Y Have flowers blooming all summer
Y Keep a garden going from spring to fall
S Get the garden beds ready
S Tend the garden three times a week
S Grow three things I can eat
S Learn what grows well where I live
M Choose what to grow and where
M Build or buy one raised bed
M Buy seeds, soil and basic tools
M Set a watering routine
W Pick a sunny spot on Saturday
W Buy seeds and soil on Sunday
W Water the garden today
W Pull weeds for 20 minutes on Wednesday

## ~moving | moving, relocate, relocating, relocation, movers, new place, new apartment, new city, packing, unpack*
Y Move into a place I love
Y Find a new apartment and move in
Y Move closer to the people I love
Y Make the move without the chaos
S Find the right place and sign for it
S Pack up room by room
S Set a moving budget and a date
S Sort what comes and what goes
M Tour five places I could live
M Book movers or a truck
M Pack everything I rarely use
M List every address to change
W Get moving quotes on Monday
W Pack one box of books today
W Pick up boxes and tape on Saturday
W Book two viewings on Thursday

## ~buying | homeowner*, mortgage, realtor, down payment, first home, house hunting, a house, a condo, a townhouse, starter home, preapprov*, homebuy*, own place, dream home
Y Buy my first home
Y Save enough for a down payment
Y Find a house I can afford and love
Y Become a homeowner at last
S Work out what I can really afford
S Save a set amount every payday
S Narrow the search to three areas
S Learn how buying a home works
M Add up my savings and monthly costs
M Talk to a lender about my options
M Visit four open houses
M Write my must haves and nice to haves
W Total up my savings on Sunday
W Walk one neighborhood on Saturday
W List my must haves on Tuesday
W Call one lender with questions on Friday

## painting | paint, paints, painting, painted, repaint*, wallpaper, primer, accent wall, fresh coat
Y Paint every room that needs it
Y Repaint the whole place room by room
Y Give the walls a fresh coat of paint
Y Paint over the colors I never liked
S Paint one room from start to finish
S Choose colors for each room
S Paint one room each month
S Patch and prep the walls for paint
M Test three colors on the wall
M Buy paint, brushes and drop cloths
M Paint the smallest room first
M Fill the nail holes and sand them
W Pick up paint samples on Saturday
W Tape off one room on Friday
W Measure the walls today
W Paint one wall on Sunday

## kitchen | kitchen, kitchens, cabinet, cabinets, countertop*, counters, backsplash, appliances, stove, oven, dishwasher
Y Remodel the kitchen
Y Update the kitchen on a budget
Y Replace the old kitchen counters
Y Get the kitchen cabinets redone
S Settle on a plan for the kitchen
S Set a kitchen budget and save for it
S Collect quotes for the kitchen work
S Choose finishes and fixtures
M Measure the kitchen and sketch it
M Visit two kitchen showrooms
M Talk to three kitchen contractors
M List what the kitchen must have
W Measure the counters on Saturday
W Save kitchen ideas for an hour today
W Write the kitchen wish list on Sunday
W Call one kitchen contractor on Tuesday

## furniture | furniture, furnish*, couch, sofa, sectional, armchair, dresser, bookshelf, bookcase, dining table, coffee table, chairs, recliner, loveseat
Y Furnish my place the way I want it
Y Replace the worn out couch
Y Buy furniture that will last
Y Finish furnishing every room
S Furnish one room completely
S Save up for one big item
S Replace the thing that bothers me most
S Sell or donate what no longer fits
M Measure the room and the doorways
M Set a furniture budget
M Visit three furniture stores
M List the old furniture for sale
W Measure the living room on Saturday
W Browse one furniture store on Sunday
W Photograph the old chair to sell today
W Check secondhand listings on Monday

## renovation | renovat*, remodel*, reno, contractor*, addition, fixer upper, flooring, floors, hardwood, carpet, windows, roof, upgrade*, home improvement
Y Finish one big home renovation
Y Renovate without blowing the budget
Y Replace the old floors
Y Remodel this place room by room
S Decide the scope and set a budget
S Hire a contractor I trust
S Get the plans and permits in order
S Finish the first stage of the work
M Get three written quotes
M Write down exactly what I want done
M Check references for two contractors
M Choose materials and order them
W Call one contractor for a quote today
W Photograph the room on Saturday
W Visit one showroom on Sunday
W Sketch what I want changed on Monday

## bathroom | bathroom, bathrooms, bath, shower, bathtub, tub, vanity, toilet, tile, tiles, grout, powder room
Y Remodel the bathroom
Y Update the bathroom on a small budget
Y Replace the old tub or shower
Y Turn the bathroom into a calm retreat
S Settle on a plan for the bathroom
S Set a bathroom budget and save for it
S Get quotes for the bathroom work
S Pick tile, fixtures and paint
M Measure the bathroom and sketch it
M List what needs replacing
M Talk to two plumbers or contractors
M Visit a tile and fixture showroom
W Measure the bathroom on Saturday
W Save bathroom ideas I like today
W Call one plumber on Wednesday
W Look at tile samples on Sunday

## yard | yard, backyard, lawn, mow, mowing, grass, weeds, weeding, landscap*, hedge*, shrubs, mulch, curb appeal, trees
Y Have a yard I am proud of
Y Keep the lawn green and healthy
Y Landscape the front yard
Y Stay ahead of yard work all year
S Do yard work for an hour each weekend
S Clean up the beds and edges
S Fix the bare and patchy spots
S Make a yard plan for the year ahead
M Tidy one section of the yard each week
M Get the mower and tools ready
M Clear leaves, branches and weeds
M Get a quote from a landscaper
W Mow the lawn on Saturday
W Rake the front yard on Sunday
W Pull weeds by the walkway today
W Call a landscaper on Tuesday

## bedroom | bedroom, bedrooms, mattress, bedding, sheets, nightstand*, headboard, pillows, bed frame, new bed, duvet
Y Make the bedroom a restful place
Y Replace my old mattress
Y Create a bedroom I love waking up in
Y Keep the bedroom calm and simple
S Refresh the bedroom one step at a time
S Upgrade what I sleep on
S Make the bed every single morning
S Clear the bedroom surfaces and floor
M Try mattresses at two stores
M Buy new sheets and pillows
M Clear off the nightstand and dresser
M Add softer light and darker curtains
W Wash all the bedding on Sunday
W Clear the nightstand today
W Test mattresses on Saturday
W Order new pillows on Thursday

## laundry | laundry, laundromat, washer, dryer, washing, fold, folding, ironing, hamper*, linens, towels, dry cleaning
Y Stay on top of the laundry
Y Always have fresh towels and linens
Y Have a laundry routine that sticks
Y Fold and put away every load
S Wash, dry and put away twice a week
S Set fixed laundry days
S Put clean clothes away the same day
S Wash sheets and towels every week
M Pick two laundry days and keep them
M Set up a hamper for each kind of load
M Catch up on the whole laundry pile
M Clear and tidy the laundry area
W Wash and fold two loads on Saturday
W Put away the clean basket today
W Buy detergent and a hamper on Friday
W Wash the towels on Wednesday

## paperwork | paperwork, paperless, papers, files, filing, document, documents, records, mail, shred*, binder, warranties, manuals, receipts
Y Get the household paperwork in order
Y Find any document in under a minute
Y Go paperless at home
Y Never lose important papers again
S Sort every pile of paper at home
S Set up one simple filing system
S Deal with the mail once a week
S Scan the papers worth keeping
M Gather all loose papers into one box
M Label folders for each kind of paper
M Shred what I no longer need
M Put key documents in one safe spot
W Sort the mail pile on Sunday
W Buy folders and labels on Saturday
W Shred one stack of old papers today
W Scan five key documents on Tuesday

## storage | garage, basement, attic, shed, cellar, crawlspace, loft, storage unit, storage room, storage space, junk room
Y Clear out the garage for good
Y Turn the basement into usable space
Y Empty the attic of things I never use
Y Stop paying for a storage unit
S Sort the whole space into keep or go
S Clear one corner every weekend
S Haul away what nobody wants
S Put up shelves for what stays
M Empty one wall and sort everything
M Schedule a donation pickup
M Take one load to the dump or recycling
M Group what stays into labeled tubs
W Sort three boxes on Saturday
W Book a haul away pickup on Monday
W Buy shelving and tubs on Sunday
W Clear one shelf today

## office | office, desk, workspace, workstation, work from, working from, monitor, study space, work space, ergonomic, cables
Y Set up a home office that works
Y Have a desk I like sitting at
Y Carve out a quiet workspace at home
Y Keep my desk clear all year
S Get the desk and chair right
S Clear the desk at the end of each day
S Tame the cables and the paper piles
S Fix the lighting where I work
M Choose the best spot for the desk
M Try a better chair or desk height
M Clear everything off the desk and sort
M Add a lamp and hide the cables
W Clear off the desk today
W Tie up the cables on Friday
W Measure the desk corner on Saturday
W Order a desk lamp on Wednesday

## ~pets | pet, pets, dog, dogs, puppy, cat, cats, kitten, litter, crate, kennel, aquarium, fur
Y Make a comfy corner for the dog
Y Get the home ready for a new pet
Y Keep pet hair and mess under control
Y Give the cat a space of her own
S Set up one spot for all the pet gear
S Keep the pet area clean every week
S Make each room safe for a curious pet
S Refresh the pet bed, bowls and toys
M Choose where the pet sleeps and eats
M Wash the pet bedding every week
M Put cords and breakables out of reach
M Sort the pet supplies into one bin
W Wash the pet bed on Saturday
W Buy a bin for pet supplies today
W Vacuum up the pet hair on Wednesday
W Tuck away loose cords on Monday
"""
}
