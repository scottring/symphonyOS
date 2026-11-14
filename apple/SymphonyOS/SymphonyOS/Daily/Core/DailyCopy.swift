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
        case .season: "Add a goal for \(periods.seasonWord)"
        case .year: "Add a goal for \(periods.year)"
        }
    }

    /// The bar's empty field in fewer words, for a field too narrow for `placeholder` (the Duo's
    /// outside screen, a 375-point phone): "Add a goal" on Month, Season and Year; Today's and
    /// Week's are short already.
    static func shortPlaceholder(_ h: Horizon) -> String {
        switch h {
        case .today: "Add to today"
        case .week: "Add to this week"
        case .month, .season, .year: "Add a goal"
        }
    }

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

    /// The line above the bar on a mountain page. Week and Today have none.
    static func hint(_ level: WalkLevel) -> String {
        switch level {
        case .year: "Tap a peak to look closer"
        case .season, .month: "Tap a flag to move it or walk it down"
        case .week, .today: ""
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

    /// "No piece this winter yet"
    static func noPiece(_ seasonWord: String) -> String { "No piece this \(seasonWord) yet" }

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

    /// The chosen flag's panel line when nothing hangs under it one level down.
    static func nothingUnder(_ level: WalkLevel, periods: WalkPeriods) -> String {
        switch level {
        case .year: "Nothing under this one for \(periods.seasonWord) yet."
        case .season: "Nothing under this one for \(periods.monthName) yet."
        case .month: "Nothing under this one this week yet."
        case .week, .today: "Nothing under this one today yet."
        }
    }

    /// Where an add went that is not on this page: "It’s on Friday the 20th."
    static func itsOn(_ day: Date, today: Date) -> String {
        let n = PlanCalendar.calendar.component(.day, from: day)
        return "It’s on \(weekday(day)) the \(WalkPeriods.ordinal(n))."
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
