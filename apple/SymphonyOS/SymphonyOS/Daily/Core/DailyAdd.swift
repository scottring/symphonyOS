import Foundation

/// What the words typed or spoken into the bar mean: the title, the day, and
/// whether it shows on the page it was added from. It never invents words: the
/// title is the person's own, tidied of filler as the walk does (`WalkWords.tidy`),
/// and a day already past means the next such day, never the past.
enum DailyAdd {
    enum Page: Equatable { case today, week, goal(WalkLevel) }       // .goal(.year | .season | .month)

    enum Add: Equatable {
        /// `day` nil: on the week, no day. `at`: the moment said, when a time was said. `here`: it shows on the page it was added from.
        case task(title: String, day: Date?, at: Date?, here: Bool)
        case goal(title: String, level: WalkLevel)
    }

    /// nil when nothing, or only filler, was said. A goal page keeps every word and
    /// pulls no day. Today and Week hand the tidied words to `parse`: with no date
    /// Today lands on `today` and Week on no day; a day before today moves on one
    /// week, and if that is still past the date is ignored and the words stay whole.
    static func read(_ raw: String, on page: Page, today: Date, weekStart: Date,
                     parse: (String) -> CaptureParser.Result = CaptureParser.parse) -> Add? {
        guard let words = WalkWords.tidy(raw) else { return nil }
        if case .goal(let level) = page { return .goal(title: words, level: level) }

        let start = PlanCalendar.day(today)
        let parsed = parse(words)
        var title = words
        var day: Date?
        var at: Date?
        if let date = parsed.date {
            var landing = PlanCalendar.day(date)
            let timed = saidATime(parsed, words: words)
            var moment = timed ? date : nil
            if landing < start {
                landing = PlanCalendar.addDays(landing, 7)
                moment = moment.flatMap { PlanCalendar.calendar.date(byAdding: .day, value: 7, to: $0) }
            }
            if landing >= start {
                day = landing
                at = moment
                // What the phrase matched is kept (a day, and a time when one was said), so its words
                // leave the title; a time's "at" left behind goes with it ("Lunch at noon": "Lunch").
                title = capitalised(timed ? withoutTrailingAt(parsed.title) : parsed.title) ?? words
            }
            // Otherwise nothing of the phrase is kept (a date still past): every word stays in the title.
        }

        switch page {
        case .today:
            let lands = day ?? start
            return .task(title: title, day: lands, at: at, here: PlanCalendar.sameDay(lands, start))
        case .week:
            let here = day.map { d in PlanCalendar.weekDays(weekStart).contains { PlanCalendar.sameDay(d, $0) } } ?? true
            return .task(title: title, day: day, at: at, here: here)
        case .goal:
            return nil   // handled above
        }
    }

    /// The week a task with no day is filed into when it is not the writer's own (`writersWeek`):
    /// Week shows another week (`shownWeek`, its first day), and a task said there with no day is
    /// filed into THAT week, so it stands on the page it was added from. nil for a task with a
    /// day (it files by its day), a goal, or a page on the writer's own week.
    static func otherWeek(for add: Add, shownWeek: Date, writersWeek: Date) -> Date? {
        guard case .task(_, nil, _, _) = add, !PlanCalendar.sameDay(shownWeek, writersWeek) else { return nil }
        return PlanCalendar.day(shownWeek)
    }

    /// Whether the phrase the parser matched said a time, so the time is kept as a time. The parser
    /// marks only a colon, "am", "pm" or "o'clock" (`hasTime`); a date it found with no time reads
    /// noon, so any other clock time was said too ("at 3 tomorrow": 3:00 pm), and so was noon itself
    /// when "noon" or "midday" left the words with the phrase ("lunch at noon").
    static func saidATime(_ parsed: CaptureParser.Result, words: String) -> Bool {
        guard let date = parsed.date else { return false }
        if parsed.hasTime { return true }
        let clock = PlanCalendar.calendar.dateComponents([.hour, .minute, .second], from: date)
        if (clock.hour, clock.minute, clock.second) != (12, 0, 0) { return true }
        func names(_ text: String) -> Bool {
            text.range(of: #"\b(noon|midday)\b"#, options: [.regularExpression, .caseInsensitive]) != nil
        }
        return names(words) && !names(parsed.title)
    }

    /// The title with a last lone "at" taken off: what a time leaves behind when the parser takes
    /// only the time ("dentist at 3pm" reads "dentist at").
    private static func withoutTrailingAt(_ title: String) -> String {
        let text = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let r = text.range(of: #"\s+at$"#, options: [.regularExpression, .caseInsensitive]) else { return text }
        return String(text[..<r.lowerBound])
    }

    /// The parser's title with its first letter capitalised, as `WalkWords.tidy` does; nil when it left nothing.
    private static func capitalised(_ title: String) -> String? {
        let text = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let first = text.first, text.contains(where: { $0.isLetter || $0.isNumber }) else { return nil }
        return first.uppercased() + text.dropFirst()
    }
}
