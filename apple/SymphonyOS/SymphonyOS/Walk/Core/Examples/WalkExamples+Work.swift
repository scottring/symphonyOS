extension WalkExampleLibrary {
    /// Work: twenty themes, four lines each for Year, Season, Month and Week (see `parse`).
    /// A theme whose name starts with `~` is offered only when the person's own words find it.
    static let work = """
## new job | new job, a job, better job, another job, job search, job hunt, jobs, hired, interview, interviews, resume, apply, applying, recruiter
Y Land a new job I am excited about
Y Get hired at a place I admire
Y Find a better job closer to home
Y Move to a job with room to grow
S Apply to five jobs every week
S Update my resume and work samples
S Reach out to ten people I know
S Line up three interviews
M Rewrite my resume for the job I want
M Make a list of 20 companies to try
M Apply to ten jobs that fit
M Rehearse answers for an interview
W Update my resume on Sunday
W Apply to two jobs on Tuesday
W Ask a friend for a referral on Thursday
W Save five job postings on Saturday

## raise | raise, raises, salary, paycheck, compensation, bonus, wage, wages, underpaid, negotiate, negotiating
Y Get a raise this year
Y Negotiate a higher salary
Y Earn a bigger bonus than last year
Y Get paid what my work is worth
S Track my wins to make my case
S Find out what my role pays elsewhere
S Ask my boss what a raise would take
S Take on one thing that shows my value
M Write down my wins from the past year
M Look up salary ranges for my role
M Set a meeting to discuss my pay
M Rehearse asking for the number I want
W List my five best wins on Saturday
W Look up pay for my role on Wednesday
W Ask my boss for a meeting on Friday
W Write my ask in two sentences today

## promotion | promotion, promoted, promote, senior, director, ladder, step up, move up, advance, advancement
Y Get promoted to the next level
Y Earn a senior title
Y Move up to a director role
Y Be ready for promotion by year end
S Ask what the next level requires
S Take on work the next level does
S Meet monthly with my boss about growth
S Close the gaps my boss pointed out
M Ask my boss what promotion takes
M Write down the gaps I need to close
M Volunteer for one stretch assignment
M Find someone who made the same move
W Ask my boss about next steps on Tuesday
W Read the role description on Monday
W List three gaps to work on today
W Ask a mentor for coffee on Thursday

## skill | skill, skills, learn, learning, course, courses, training, workshop, tutorial*, coding, code, software, spreadsheet*
Y Learn a new skill that helps at work
Y Finish an online course start to end
Y Learn to code a small tool myself
Y Build spreadsheet skills I can use
S Put three hours a week into learning
S Finish the first half of a course
S Build one small thing with the skill
S Find someone who can check my work
M Pick one course and sign up
M Finish the first four lessons
M Set two learning nights each week
M Try the skill on a real work task
W Compare three courses on Saturday
W Do one lesson on Tuesday
W Block two learning nights today
W Watch a 20 minute tutorial on Thursday

## ~business | business, businesses, startup, own company, entrepreneur, llc, founder, shop, store, storefront, venture, own boss
Y Start my own business
Y Open my shop by the end of the year
Y Turn my idea into a real business
Y Get my business to break even
S Test my idea with ten real people
S Write a one page business plan
S Make my first sale
S Choose a name and register it
M Ask five people if they would buy
M Work out what it costs to begin
M Pick a name and check it is free
M Write down what I will offer
W Write my idea in one paragraph on Friday
W Call one possible buyer on Wednesday
W List my first costs on Saturday
W Brainstorm ten names on Sunday

## ~side income | side income, side hustle, side gig, side job, side work, side money, gig, gigs, extra income, extra money, second income, second job, moonlight*
Y Earn side income every month
Y Build a side hustle I enjoy
Y Make extra money from what I know
Y Bring in a second income by fall
S Get my first three paying gigs
S Try two ideas and keep the better one
S Put five hours a week into side work
S Earn my first 500 dollars on the side
M Pick one idea to try first
M Tell ten people what I offer
M Set my price and post a listing
M Complete one small gig start to end
W List three things I could offer today
W Post my offer online on Saturday
W Text three friends about it on Friday
W Decide my starting price on Thursday

## focus | focus, focused, focusing, distract*, procrastinat*, deep work, concentrate, concentration, productive, productivity, multitask*, attention
Y Do focused work every morning
Y Stop procrastinating on hard tasks
Y Get more done with fewer distractions
Y Protect my focus from interruptions
S Block two hours of deep work daily
S Do the hardest task first each day
S Keep my phone out of reach at work
S Close chat during my focus hours
M Find my best two hours for hard work
M Try a week of phone free mornings
M Turn off alerts during focus blocks
M Start each day with one hard task
W Block two focus hours on Monday
W Silence my phone until noon on Tuesday
W Do my hardest task first on Wednesday
W Turn off desktop alerts today

## boundaries | work hours, long hours, fewer hours, overtime, boundaries, boundary, weekends, evenings, burnout, balance, overwork*, working late, work late, leave work
Y Leave work on time most days
Y Stop working weekends
Y Keep work from taking my evenings
Y Find a balance I can keep up
S Set a firm end to my work day
S Take a real lunch break every day
S Keep work off my phone after dinner
S Use all my vacation days this season
M Pick a stop time and tell my boss
M Eat lunch away from my screen all month
M Book one day off this month
M Say no to one extra request
W Leave work by five on Tuesday
W Put a day off on the calendar today
W Set a stop work alarm on Monday
W Eat lunch outside on Thursday

## career change | career change, change careers, new career, career switch, switch careers, pivot, new field, new industry, different field, transition, retrain*, profession, change fields, career path
Y Change careers into work I care about
Y Move into a new field by next year
Y Figure out my next career path
Y Pivot to a new industry I like
S Meet six people in the new field
S Try the work in a small way first
S Find out what the new field requires
S Narrow my options down to two
M List the careers I am curious about
M Have coffee with two people who did it
M Read ten job postings in the new field
M Write my story for why I am changing
W List five careers that interest me today
W Message someone in the field on Monday
W Read three job postings on Wednesday
W Write what I want from work on Sunday

## ~clients | client, clients, customer, customers, freelance, freelancing, freelancer, referral, referrals, retainer, consulting, bookings
Y Land five new clients this year
Y Keep my best clients coming back
Y Fill my freelance schedule
Y Double my referrals from customers
S Reach out to 20 past clients
S Ask every happy client for a referral
S Follow up with every inquiry in a day
S Set higher rates for new clients
M List my ten best past clients
M Ask three clients for a testimonial
M Refresh my website and samples
M Check in with five quiet clients
W Email two past clients on Tuesday
W Ask one client for a referral on Friday
W Call my best client on Wednesday
W List ten past clients on Thursday

## ~degree | degree, school, college, university, masters, mba, study, studying, semester, graduate, diploma, bachelor*, thesis, gpa
Y Finish my degree
Y Graduate with grades I am proud of
Y Pass every class this school year
Y Keep up with school while working
S Pass all my classes this semester
S Study ten hours every week
S Stay a week ahead on the reading
S Finish every assignment a day early
M Map out every due date this month
M Set a weekly study schedule
M Finish one big paper before it is due
M Find a quiet place to study
W Study for one hour on Monday
W Write down all my due dates today
W Read one chapter on Wednesday
W Outline my next paper on Saturday

## ~certification | certification, certifications, certified, certificate, license, licensed, licensing, exam, exams, credential*, cert
Y Earn a professional certification
Y Pass my licensing exam
Y Get certified in my field
Y Add a new credential to my name
S Prep for the exam five hours a week
S Work through the whole prep book
S Take three timed practice exams
S Book the exam date and work back
M Register for the exam
M Finish the first two prep chapters
M Take one practice exam and score it
M Make cards for the hardest topics
W Check exam dates and fees today
W Do 20 practice questions on Tuesday
W Order the prep book on Friday
W Go over my missed answers on Saturday

## project | project, projects, deadline, deadlines, deliver, delivery, launch, launching, ship, shipping, rollout, milestone*
Y Finish my big project on schedule
Y Launch the project I keep putting off
Y Deliver a project I am proud of
Y Ship the project without a last crunch
S Break the project into clear steps
S Hit one milestone every month
S Give the project five hours a week
S Send a short update every Friday
M Write a one page project plan
M Finish the first rough draft
M Agree on the deadline with my boss
M Clear the one thing blocking me
W List the project steps on Monday
W Draft the outline on Tuesday
W Send a status note on Friday
W Ask for the missing info on Thursday

## ~managing | team, lead, leading, leader, leadership, delegate, delegating, staff, supervis*, direct reports, better manager, good manager, great manager, manage people
Y Be a better manager for my team
Y Lead my team with less stress
Y Help everyone on my team grow
Y Delegate more and trust my team
S Hold weekly one on ones with everyone
S Hand off one task every week
S Tell each person how they are doing
S Ask my team what gets in their way
M Put one on ones on the calendar
M List the tasks only I should do
M Thank each person for something real
M Write clear goals with each person
W Schedule one on ones on Monday
W Hand off one task on Tuesday
W Thank one person in writing today
W Ask a teammate what they need on Friday

## ~sales | sales, sell, selling, sold, revenue, quota, deal, deals, leads, pipeline, prospect*, commission, accounts
Y Hit my sales quota every quarter
Y Grow revenue by 20 percent
Y Close more deals than last year
Y Build a pipeline that stays full
S Make 20 sales calls every week
S Follow up on all leads in two days
S Book ten new meetings a month
S Win back three lost accounts
M Clean up my list of open deals
M Call the leads I have let go quiet
M Write a better opening pitch
M Ask three buyers why they said yes
W Call five leads on Monday
W Follow up on two quotes on Wednesday
W Rewrite my opening line today
W Update my deal list on Friday

## network | network, networking, mentor, mentors, mentoring, connections, contacts, conference, conferences, meetup, meetups, coffee chats, industry events
Y Build a stronger professional network
Y Find a mentor I meet with regularly
Y Grow my network by 50 new people
Y Go to two conferences this year
S Have coffee with two new people a month
S Go to one industry event each month
S Reconnect with ten old coworkers
S Ask one person to be my mentor
M List 20 people I want to know better
M Sign up for one local meetup
M Catch up with three old coworkers
M Refresh my online work profile
W Invite one person to coffee on Tuesday
W Message an old coworker today
W Find one event to attend on Thursday
W Update my profile photo on Sunday

## email | email, emails, inbox, mail, unread, unsubscribe, newsletters, reply, replies, notifications, messages
Y Keep my inbox under control all year
Y Reply to email within one day
Y Spend less of my day on email
Y End each week with an empty inbox
S Check email three set times a day
S Clear my inbox every Friday
S Answer or file each email once
S Unsubscribe from what I never read
M Clear out the old unread backlog
M Set up folders that I will use
M Turn off new email pop ups
M Write three replies I can reuse
W Unsubscribe from ten lists on Thursday
W Archive old email on Saturday
W Answer my five oldest emails today
W Turn off email alerts on Wednesday

## organized | organized, organize, organizing, desk, files, clutter, tidy, workspace, planner, to do, checklist, priorities, prioritize, paperwork
Y Stay organized at work all year
Y Keep my desk and files in order
Y Know my top priorities every day
Y Stop losing track of my to do list
S Plan each week on Friday afternoon
S Keep one to do list for everything
S Clear my desk at the end of each day
S Pick three priorities every morning
M Sort my files into a few clear folders
M Set up one place for all my tasks
M Tidy my workspace and keep it up
M Try a weekly planning hour
W Clear off my desk on Friday
W Put every task in one list on Monday
W Sort my desktop files on Wednesday
W Plan next week in 30 minutes on Sunday

## speaking | speak, speaking, speaker, presentation, presentations, presenting, speech, speeches
Y Get comfortable with public speaking
Y Give a talk to a big room
Y Speak up more in meetings
Y Give presentations people remember
S Speak up once in every meeting
S Give one short talk each month
S Join a local speaking group
S Practice out loud every week
M Volunteer to present one update
M Record myself and watch it back
M Write a five minute talk
M Ask a coworker for honest notes
W Practice my opening out loud today
W Ask one question in a meeting on Tuesday
W Record a two minute talk on Sunday
W Sign up to present on Thursday

## review | review, reviews, feedback, rating, ratings, evaluation, evaluations, appraisal, performance, expectations
Y Get a great performance review
Y Earn a top rating this year
Y Act on the feedback I was given
Y Exceed expectations in my role
S Ask my boss for feedback each month
S Keep a running list of my wins
S Fix the one thing my boss pointed to
S Agree on clear goals with my boss
M Reread my last review and take notes
M Write my goals and share them
M Set a monthly check in with my boss
M Pick one habit to work on first
W Reread my last review on Saturday
W Write down three wins today
W Ask my boss for a check in on Wednesday
W Draft my goals on Sunday
"""
}
