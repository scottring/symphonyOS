import Foundation

/// Every word the light pages (Today, Week, Month, Season, Year, the Duo layouts) show
/// or speak, beside the `WalkCopy` members they use by name. Eyebrows are stored in
/// sentence case; the views put them in capitals. Date words read in `en_US` through
/// `PlanCalendar.calendar`, as `WalkCopy` reads them.
enum DailyCopy {
    // MARK: The row of words

    /// "Year" "Season" "Month" "Week" "Today"
    static func nav(_ h: Horizon) -> String {
        switch h {
        case .year: "Year"
        case .season: "Season"
        case .month: "Month"
        case .week: "Week"
        case .today: "Today"
        }
    }
    static let weekAndToday = "Week and today", navLabel = "Where you are"

    // MARK: Today and Week

    static let today = "Today", showMyWeek = "Show my week", next = "Next", open = "open"
    /// What the lowered sheet raises to on Today: the walk's own words for it.
    static var showMyDay: String { WalkCopy.showMyDay }
    /// The line at the top of Today while a walk left with Leave for now waits; a tap resumes it.
    static let walkWaiting = "Your walk is waiting. Pick it back up."
    /// The line at the top of Today after Not now at Welcome, while there are no goals; a tap starts the walk.
    static let walkWhenReady = "Walk down from the year when you’re ready."
    static let restOfWeek = "The rest of this week", toDoToday = "To do today", moveTo = "Move to", anyDay = "Any day"
    static let firstToday = "First today", notFirst = "Not first today", details = "Details"
    /// The week's fold, read aloud: its state ("Open" / "Folded"), after what was done.
    static let foldOpen = "Open", foldClosed = "Folded"
    /// What a tap on a month flag on Week's band does, for VoiceOver.
    static let flagOpensMonth = "Opens the month’s page."

    // MARK: The bar

    static let speakIt = "Speak it", stopListening = "Stop listening", inbox = "Inbox", more = "More"
    /// The light's VoiceOver label while it listens (a second tap adds what was heard), and with speech off (a tap types).
    static let addWhatYouSaid = "Add what you said", typeIt = "Type it"
    /// The light's VoiceOver value while it listens (never announced: the microphone is open).
    static let listeningNow = "Listening"
    static let handover = "The light lives here now. Type, or tap it to speak."

    // MARK: The mountain pages and the signs

    static let walkItDown = "Walk it down", lookBackBeforeItTurns = "Look back before it turns"
    static let dayDone = "That’s the day", firstTodaySign = "First, today"
    static let todayOpen = "Today is open · Waiting in the week", newWeek = "A new week · What moves this forward?"
    static let putSignAway = "Put this sign away for today"

    /// The bar's empty field: "Add to today", "Add a goal for November".
    static func placeholder(_ h: Horizon, periods: WalkPeriods) -> String {
        switch h {
        case .today: "Add to today"
        case .week: "Add to this week"
        case .month: "Add a goal for \(periods.monthName)"
        case .season: "Add a goal for this \(periods.seasonWord)"
        case .year: "Add a goal for \(periods.year)"
        }
    }

    /// Week's empty field, saying the week the page shows (where a task with no day goes):
    /// "Add to this week", "Add to next week", and "Add to the week" for any other.
    static func weekPlaceholder(_ start: Date, today: Date) -> String {
        if holds(start, today) { return "Add to this week" }
        if holds(PlanCalendar.addDays(start, -7), today) { return "Add to next week" }
        return "Add to the week"
    }

    /// The bar's empty field in fewer words, for a field too narrow for `placeholder` (the Duo's
    /// outside screen, a 375-point phone): "Add a goal" on Month, Season and Year; Today's and
    /// Week's are short already.
    /// The bar's empty field in fewer words, for a field too narrow for `placeholder` (the Duo's
    /// outside screen, a 375-point phone), still saying where a goal goes (S60): "Add for November",
    /// "Add for this fall", "Add for 2027". Today's and Week's are short already.
    static func shortPlaceholder(_ h: Horizon, periods: WalkPeriods) -> String {
        switch h {
        case .today: "Add to today"
        case .week: "Add to this week"
        case .month: "Add for \(periods.monthName)"
        case .season: "Add for this \(periods.seasonWord)"
        case .year: "Add for \(periods.year)"
        }
    }

    /// A mountain page's field in the fewest words, where not even `shortPlaceholder` fits.
    static let addAGoal = "Add a goal"

    /// The first of `forms` whose width (as `width` measures it, in points) fits `room`; the last,
    /// the shortest, when none does. So the bar's words are never cut short where a form fits.
    static func fitting(_ forms: [String], room: CGFloat, width: (String) -> CGFloat) -> String {
        forms.first { width($0) <= room } ?? forms.last ?? ""
    }

    /// The bar's line while it listens.
    static func listening(_ h: Horizon) -> String {
        switch h {
        case .today, .week: "Listening. Say a day and it goes there."
        case .month, .season, .year: "Listening."
        }
    }

    /// The line over a mountain page's foot, the same on Year, Season and Month: with no goal on the
    /// page's level how to begin (S22); else, while other areas stand at the side, that a post walks
    /// there; else what a flag does.
    static func hint(_ level: WalkLevel, sides: Bool, empty: Bool) -> String {
        if empty { return emptyMountain }
        return sides ? "Tap a post to walk to that area" : "Tap a flag to move it or walk it down"
    }
    static let emptyMountain = "Add your first goal with the bar below"

    // MARK: The pages' paper

    /// The strip at a mountain page's foot: "Read the whole year" over "17 goals, as a plain list by area";
    /// on a short window one line, "Read the whole year · 17 goals". `count` is `WalkCopy.paperCount`'s.
    static func readWhole(_ level: WalkLevel) -> String {
        switch level {
        case .year: "Read the whole year"
        case .season: "Read the whole season"
        case .month: "Read the whole month"
        case .week: "Read the whole week"
        case .today: "Read the whole day"
        }
    }
    static func paperSub(_ count: String) -> String { "\(count), as a plain list by area" }
    static func paperLine(_ level: WalkLevel, count: String) -> String { "\(readWhole(level)) · \(count)" }

    /// The page's paper's heading: the period the page shows, as its own heading names it ("2027",
    /// "Fall", "November").
    static func paperTitle(_ level: WalkLevel, periods: WalkPeriods) -> String {
        switch level {
        case .year: "\(periods.year)"
        case .season: periods.season.name
        case .month: periods.monthName
        case .week: weekRange(periods.weekStart)
        case .today: date(periods.today)
        }
    }

    // MARK: Dates

    /// "Tuesday, 10 November"
    static func date(_ d: Date) -> String { format(d, "EEEE, d MMMM") }

    /// "3:00"
    static func clock(_ d: Date) -> String { format(d, "h:mm") }

    /// The next event read aloud: "Next, 3:00, Bathroom design meeting".
    static func nextEvent(_ title: String, at start: Date) -> String { "\(next), \(clock(start)), \(title)" }

    /// "This week" for the week holding `today`, "Next week" for the one after it, else "Week".
    static func weekEyebrow(_ start: Date, today: Date) -> String {
        if holds(start, today) { return "This week" }
        if holds(PlanCalendar.addDays(start, -7), today) { return "Next week" }
        return "Week"
    }

    /// "8–14 November"; across months "29 November – 5 December".
    static func weekRange(_ start: Date) -> String {
        let end = PlanCalendar.addDays(start, 6)
        let cal = PlanCalendar.calendar
        if cal.component(.month, from: start) == cal.component(.month, from: end) {
            return "\(format(start, "d"))–\(format(end, "d MMMM"))"
        }
        return "\(format(start, "d MMMM")) – \(format(end, "d MMMM"))"
    }

    /// The folded past days: "Sunday", "Sunday and Monday", "Sunday to Tuesday"; none, "Earlier".
    static func pastDays(_ days: [Date]) -> String {
        guard let first = days.first, let last = days.last else { return "Earlier" }
        switch days.count {
        case 1: return weekday(first)
        case 2: return "\(weekday(first)) and \(weekday(last))"
        default: return "\(weekday(first)) to \(weekday(last))"
        }
    }

    /// "3 done"
    static func done(_ n: Int) -> String { "\(n) done" }

    /// A day's label in the week: ("TUE", "10").
    static func dayLabel(_ d: Date) -> (label: String, number: String) {
        (format(d, "EEE").uppercased(), format(d, "d"))
    }

    /// The Any day group's label in the week, in capitals as a day's is ("TUE", "10").
    static let anyDayLabel = (label: "ANY", number: "day")

    /// A day in the week read aloud by its whole name: "Wednesday, 11 November"; today
    /// "Today, Tuesday, 10 November"; the group with no day "Any day".
    static func spokenDay(_ d: Date?, today: Date) -> String {
        guard let d else { return anyDay }
        return PlanCalendar.sameDay(d, today) ? "\(Self.today), \(date(d))" : date(d)
    }

    /// A move chip read aloud: the walk's own Move to, then the place ("Wed", "Any day").
    static func moveTo(_ place: String) -> String { "\(WalkCopy.moveTo) \(place)" }

    /// A move chip: "Today", "Wed", or "Any day" with no day.
    static func chip(_ d: Date?, today: Date) -> String {
        guard let d else { return anyDay }
        return PlanCalendar.sameDay(d, today) ? Self.today : format(d, "EEE")
    }

    /// "Tomorrow: Choose the tile"
    static func tomorrow(_ title: String) -> String { "Tomorrow: \(title)" }

    /// "November": the name of the month holding `d`.
    static func monthName(_ d: Date) -> String { format(d, "LLLL") }

    /// "November ends on Monday"
    static func periodEnds(_ name: String, lastDay: Date) -> String { "\(name) ends on \(weekday(lastDay))" }

    /// The sign's eyebrow over a year goal with nothing under it this season (F29): "No winter goal under this yet".
    static func noPiece(_ seasonWord: String) -> String { "No \(seasonWord) goal under this yet" }

    /// A page's heading: month ("November", "to Monday the 30th"), season ("Winter",
    /// "to Sunday, 28 February"), year ("2027", "The year ahead" or "This year").
    /// Week reads (range, eyebrow) and Today (date, "Today").
    static func heading(_ level: WalkLevel, periods: WalkPeriods, today: Date) -> (title: String, sub: String) {
        switch level {
        case .year:
            let ahead = periods.year > PlanCalendar.year(of: today)
            return ("\(periods.year)", ahead ? "The year ahead" : "This year")
        case .season:
            return (periods.season.name, "to \(format(periods.season.lastDay, "EEEE, d MMMM"))")
        case .month:
            let lastDay = PlanCalendar.addDays(PlanCalendar.nextMonthStart(periods.monthStart), -1)
            return (periods.monthName, "to \(weekday(lastDay)) the \(WalkPeriods.ordinal(periods.monthLastDay))")
        case .week:
            return (weekRange(periods.weekStart), weekEyebrow(periods.weekStart, today: today))
        case .today:
            return (date(today), Self.today)
        }
    }

    /// Under a mountain page's heading when the period that holds today and the walk's differ: where a
    /// tap on the heading goes ("December ›" under "November").
    static func switchesTo(_ other: String) -> String { "\(other) ›" }

    /// The heading's VoiceOver label then: "November. Shows December next."
    static func switchLabel(_ title: String, other: String) -> String { "\(title). Shows \(other) next." }

    /// The chosen flag's panel line when nothing hangs under it one level down.
    static func nothingUnder(_ level: WalkLevel, periods: WalkPeriods) -> String {
        switch level {
        case .year: "Nothing under this one for \(periods.seasonWord) yet."
        case .season: "Nothing under this one for \(periods.monthName) yet."
        case .month: "Nothing under this one this week yet."
        case .week, .today: "Nothing under this one today yet."
        }
    }

    /// Where an add went that is not on this page: "It’s on Friday the 20th."; in another month
    /// than today's, the month too: "It’s on Thursday the 15th of April."
    static func itsOn(_ day: Date, today: Date) -> String {
        let n = PlanCalendar.calendar.component(.day, from: day)
        let sameMonth = PlanCalendar.sameDay(PlanCalendar.monthStart(day), PlanCalendar.monthStart(today))
        let month = sameMonth ? "" : " of \(monthName(day))"
        return "It’s on \(weekday(day)) the \(WalkPeriods.ordinal(n))\(month)."
    }

    /// What a tap on a sign does, for VoiceOver; keyed by `Signpost.Kind.rawValue`.
    static func signHint(_ kind: String) -> String {
        switch kind {
        case "dayDone": "Opens the week on tomorrow."
        case "firstToday": "Lights that task."
        case "todayOpen": "Opens the week."
        case "newWeek": "Walks this goal down into the week."
        case "periodEnds": "Opens the month’s page."
        case "noPiece": "Walks this goal down."
        default: ""
        }
    }

    // MARK: Helpers

    private static func holds(_ weekStart: Date, _ day: Date) -> Bool {
        PlanCalendar.weekDays(weekStart).contains { PlanCalendar.sameDay($0, day) }
    }

    private static func weekday(_ d: Date) -> String { format(d, "EEEE") }

    private static func format(_ date: Date, _ pattern: String) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US")
        f.calendar = PlanCalendar.calendar
        f.timeZone = PlanCalendar.calendar.timeZone
        f.dateFormat = pattern
        return f.string(from: date)
    }
}

// MARK: Half open

extension DailyCopy {
    /// The half-open display's line over the next event: "Next · 3:00" (the view puts it in capitals).
    static func nextAt(_ start: Date) -> String { "\(next) · \(clock(start))" }
}
