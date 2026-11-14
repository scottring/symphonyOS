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
            var moment = parsed.hasTime ? date : nil
            if landing < start {
                landing = PlanCalendar.addDays(landing, 7)
                moment = moment.flatMap { PlanCalendar.calendar.date(byAdding: .day, value: 7, to: $0) }
            }
            if landing >= start {
                day = landing
                at = moment
                title = capitalised(parsed.title) ?? words
            }
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

    /// The parser's title with its first letter capitalised, as `WalkWords.tidy` does; nil when it left nothing.
    private static func capitalised(_ title: String) -> String? {
        let text = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let first = text.first, text.contains(where: { $0.isLetter || $0.isNumber }) else { return nil }
        return first.uppercased() + text.dropFirst()
    }
}
