extension WalkExampleLibrary {
    /// Money: twenty themes, four lines each for Year, Season, Month and Week (see `parse`).
    /// A theme whose name starts with `~` is offered only when the person's own words find it.
    static let money = """
## saving | save, saves, saving, savings, saved, nest egg, set aside, put away, stash
Y Save more this year than last year
Y Build a savings habit that sticks
Y Save one month of pay by December
Y Put part of every paycheck into savings
S Save something from every paycheck
S Set up automatic transfers to savings
S Go three months without touching savings
S Reach my first savings milestone
M Open a separate savings account
M Pick a savings goal and a monthly amount
M Move money to savings each payday
M Find $50 a month I can set aside
W Check my savings balance today
W Set up one automatic transfer on Friday
W Move $20 into savings on Monday
W Write down my savings goal on Wednesday

## ~debt | debt, debts, loan, loans, credit card, credit cards, pay off, paying off, payoff, owe, owed, balances
Y Pay off one debt completely this year
Y Owe less in December than in January
Y Stop adding to what I owe
Y Have a clear plan to pay off my debt
S Pay extra on one balance every month
S Go a season without new borrowing
S Finish paying off my smallest balance
S Make every payment on time for 3 months
M List everything I owe in one place
M Choose which balance to pay first
M Make one extra payment this month
M Set up automatic minimum payments
W Write down every balance on Sunday
W Make one extra payment on Friday
W Look up my interest rates today
W Call one lender on Tuesday

## budget | budget, budgets, budgeting, budgeted, track, tracking, expenses, cash flow, envelope, envelopes
Y Stick to a monthly budget all year
Y Know where my money goes each month
Y Make a budget I can actually follow
Y Track my money every month this year
S Follow a simple budget for three months
S Review my budget at each month end
S Track every expense for a season
S Do a weekly money check all season
M Write my first monthly budget
M Track what I spend for 30 days
M Set limits for my top three categories
M Compare my plan to what I really spent
W List my monthly income on Monday
W Write down my fixed costs on Sunday
W Add up last month by category on Friday
W Log every purchase I make today

## spending | spend, spending, spent, overspend*, frugal, cut back, cutting back, impulse, shopping, splurge*, my means
Y Spend less than I earn every month
Y Cut my spending without feeling deprived
Y Stop buying things I do not need
Y Live comfortably on less this year
S Wait a day before any unplanned buy
S Try one no spend weekend each month
S Trim one spending habit this season
S Shop with a list for three months
M Do a no spend week
M Find my three biggest money leaks
M Unsubscribe from store emails
M Set a monthly limit for fun money
W Leave my cards at home on Saturday
W Delete one shopping app on Monday
W Return one thing I regret buying today
W List what I bought last week on Sunday

## emergency | emergency, emergencies, rainy day, cushion, safety net, buffer, unexpected, backup fund
Y Build an emergency fund this year
Y Save three months of expenses
Y Have a cushion for surprise costs
Y Be ready for an unexpected bill
S Save one month of expenses
S Add to my emergency fund every payday
S Keep emergency money in its own account
S Leave my emergency fund untouched
M Add up one month of must pay costs
M Open an account just for emergencies
M Set a target for my emergency fund
M Make my first emergency fund deposit
W Name my emergency account on Tuesday
W Add up my must pay costs on Sunday
W Move $25 into my emergency fund today
W Define a true emergency on Thursday

## retirement | retire, retires, retiring, retirement, retired, 401k, 401, ira, roth, pension, social security
Y Save more for retirement this year
Y Know if I am on track to retire
Y Put money toward retirement all year
Y Make a retirement plan I understand
S Raise my retirement saving by 1 percent
S Contribute to retirement every month
S Learn what my retirement accounts hold
S Estimate what retirement might cost
M Find all my old retirement accounts
M Check how much I put in each paycheck
M Ask about the retirement plan at work
M Write down the age I hope to retire
W Log in to my retirement account today
W Ask about a retirement match on Tuesday
W List my retirement accounts on Sunday
W Read my retirement statement on Thursday

## earning | earn, earning, earnings, income, raise, salary, side hustle, side job, side gig, freelance, freelancing, promotion, overtime
Y Earn more than I did last year
Y Grow my income this year
Y Bring home a bigger paycheck
Y Get paid what my work is worth
S Try one new way to earn more
S Earn a little extra every month
S Build one skill that pays more
S Research pay for work like mine
M List five ways I could earn more
M Pick one earning idea and try it
M Update my resume
M Ask one person how they raised their pay
W Look up pay for my job on Wednesday
W Write down what I earned last year today
W List my most useful skills on Sunday
W Ask a friend about side work on Thursday

## credit | credit score, credit report, credit rating, credit history, build credit, rebuild credit, fix credit, my credit, good credit
Y Raise my credit score this year
Y Build a strong credit history
Y Get my credit in good shape
Y Know my credit report inside and out
S Pay every bill on time for three months
S Check my credit score once a month
S Fix any errors on my credit report
S Keep my card balances low all season
M Get my free credit reports
M Read my credit report line by line
M Dispute any error I find on my report
M Set payment reminders for every card
W Check my credit score today
W Request my credit report on Monday
W Note odd items on my report on Wednesday
W Set one payment reminder on Friday

## investing | invest, investing, invested, investment, investments, stock, stocks, brokerage, portfolio, index fund, mutual fund
Y Start investing this year
Y Invest a little every month all year
Y Understand where my money is invested
Y Feel confident about investing
S Learn the basics of investing
S Set up a monthly automatic investment
S Invest on a schedule for three months
S Review my investments once this season
M Open an investment account
M Decide how much I can invest each month
M Read one beginner guide to investing
M Write down what I am investing for
W List my investing questions on Sunday
W Log in and look at my investments today
W Ask a friend how they invest on Tuesday
W Pick an amount to invest on Thursday

## bills | bill, bills, utilities, utility, autopay, auto pay, late fee, late fees, due date, due dates, on time
Y Pay every bill on time this year
Y Get all my bills under control
Y Know every bill and when it is due
Y Never pay another late fee
S Put my regular bills on autopay
S Pay bills the same day every week
S Go three months with no late fees
S Keep a calendar of bill due dates
M List every bill and its due date
M Set up autopay for two bills
M Add bill reminders to my calendar
M Pick one day a week for paying bills
W Set up autopay for one bill today
W Write down my due dates on Thursday
W Pay the bills due this week on Friday
W Open the mail and sort bills on Monday

## food | groceries, grocery, eating out, eat out, takeout, restaurant, restaurants, delivery, dining, lunch, lunches, coffee
Y Spend less on food this year
Y Keep food costs within a monthly limit
Y Waste less food and less money
Y Feed myself well for less
S Plan meals before I shop each week
S Keep to a weekly food budget
S Use up what I have before buying more
S Cook at home most nights
M Track what I spend on food for a month
M Set a weekly food budget
M Plan one week of dinners
M Find five cheap meals I enjoy
W Plan three dinners on Sunday
W Check the pantry before shopping today
W Write a grocery list on Saturday
W Pack a lunch on Monday

## ~home | house, a home, first home, down payment, condo, townhouse, homeowner, homebuyer, closing costs, preapproved, preapproval
Y Save a down payment for a home
Y Be ready to buy a home by next year
Y Buy my first home
Y Get my finances ready for a mortgage
S Save toward my down payment every month
S Learn what I can afford in a home
S Get my paperwork ready for a lender
S Cut one cost to boost my home fund
M Set a down payment target
M Open a savings account for my home fund
M Ask a lender about preapproval
M Look up home prices where I want to live
W Move money to my home fund on Friday
W Look at five home listings on Saturday
W Gather my last two pay stubs on Monday
W Write down questions for a lender today

## trip | trip, trips, vacation, vacations, travel, traveling, getaway, cruise, flight, flights
Y Save up for a big trip
Y Pay for a vacation without borrowing
Y Take a trip I have fully paid for
Y Build a travel fund this year
S Add to my travel fund every payday
S Set a budget for the whole trip
S Save half the cost of my trip
S Watch for deals on flights and stays
M Price out the trip I want
M Open a savings account for travel
M Choose where and when to go
M Set a weekly amount for my trip fund
W Look up flight prices on Tuesday
W Move $20 to my trip fund on Friday
W List what the trip will cost on Saturday
W Pick my travel dates today

## subscriptions | subscription, subscriptions, membership, memberships, streaming, cancel, canceling, recurring, cable, phone plan, free trial, free trials
Y Pay only for subscriptions I use
Y Cut what I pay for subscriptions
Y Know every subscription I pay for
Y Stop paying for things I forgot about
S Review my subscriptions every month
S Cancel one subscription each month
S Keep only the memberships I really use
S Catch free trials before they renew
M List every subscription and its cost
M Cancel two subscriptions I do not use
M Check my statement for repeat charges
M Ask for a lower rate on one service
W Cancel one subscription today
W Scan my card statement on Sunday
W Set a reminder for one renewal on Monday
W List my streaming services on Wednesday

## taxes | tax, taxes, irs, refund, withholding, deduction, deductions, write off, write offs, accountant, cpa
Y File my taxes early this year
Y Be organized and ready for tax season
Y Stop dreading tax time
Y Understand my own tax return
S Keep tax papers in one folder
S Gather tax documents as they arrive
S File my return before the deadline
S Save receipts I may need at tax time
M Make a checklist of tax documents
M Choose how I will file this year
M Find and read my return from last year
M Book time with a tax preparer
W Label a folder for tax papers on Monday
W Download one tax form today
W Block two hours for taxes on Saturday
W Call a tax preparer on Wednesday

## ~giving | giving, donate, donates, donating, donation, donations, charity, charities, tithe, tithing, generous, generosity
Y Give more generously this year
Y Give regularly to causes I care about
Y Make giving part of my budget
Y Support one cause all year long
S Give something every month
S Choose the causes I want to support
S Set up a monthly donation
S Give time as well as money
M Decide how much I will give this year
M Pick one group to give to each month
M Research two charities I trust
M Make my first donation of the year
W Donate to one cause today
W List causes I care about on Sunday
W Look up a local charity on Tuesday
W Set up one recurring gift on Friday

## insurance | insurance, insured, insure, coverage, policy, policies, premium, premiums, deductible, deductibles, underinsured
Y Have the insurance coverage I need
Y Understand all my insurance policies
Y Review my insurance every year
Y Pay less for the same coverage
S Review each policy I have
S Compare quotes for one policy
S Fill any gaps in my coverage
S Keep all my policies in one place
M List every policy and what it costs
M Get three quotes for one policy
M Read one policy start to finish
M Check who is named on my policies
W Find my policy documents on Wednesday
W Request one insurance quote today
W Call my insurer with questions on Friday
W Note my renewal dates on Thursday

## learning | learn, learning, read, reading, books, course, podcast, podcasts, literacy, educate
Y Get smarter about money this year
Y Understand my own finances
Y Learn how money really works
Y Feel confident making money decisions
S Read one money book this season
S Learn one money topic each month
S Listen to a money podcast every week
S Take a class on personal finance
M Finish one book about money
M Pick three money topics to learn
M Look up money terms I do not know
M Find a free personal finance class
W Read one chapter on Sunday
W Listen to one money podcast on Monday
W Borrow a money book on Saturday
W Write down one money question today

## ~will | a will, my will, our will, living will, estate plan, estate planning, trust, beneficiary, beneficiaries, executor, last wishes
Y Write my will this year
Y Get my estate plan in order
Y Make my wishes clear on paper
Y Have a signed will on file
S Decide what my will should say
S Find help to write my will
S Name who would handle my affairs
S Sign my will and store it safely
M List what I own and who should get it
M Choose someone to carry out my wishes
M Book a meeting about my will
M Check the beneficiaries on my accounts
W List what I own on Sunday
W Ask someone to be my executor on Tuesday
W Call about a will appointment on Friday
W Write down my wishes today

## paperwork | paperwork, documents, records, files, receipts, statements, organize*, file cabinet, shred, shredding, passwords, binder
Y Get my financial paperwork in order
Y Organize all my important documents
Y Know where every important paper is
Y Keep my money records tidy all year
S Set up a simple filing system
S Sort one stack of papers each week
S Shred what I no longer need
S Scan and back up key documents
M Gather important papers in one spot
M Label folders for each kind of record
M Clear out one drawer of old papers
M Make a list of all my accounts
W Sort one stack of mail on Saturday
W Buy a box of file folders on Monday
W Shred old statements on Sunday
W Scan one important document today
"""
}
