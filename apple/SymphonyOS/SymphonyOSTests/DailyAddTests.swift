import Testing
import Foundation
@testable import Symphony

private func day(_ y: Int, _ m: Int, _ d: Int, _ hour: Int = 0) -> Date {
    PlanCalendar.calendar.date(from: DateComponents(year: y, month: m, day: d, hour: hour))!
}

// What the bar's words mean: the title, the day, and whether it shows on this page.
// Every test hands `read` a stand-in parser, so nothing depends on the clock.
@MainActor
struct DailyAddTests {
    let today = day(2026, 11, 10)        // a Tuesday
    let weekStart = day(2026, 11, 8)     // its week runs 8 to 14 November

    /// A stand-in parser: the words it was given, read as `title` on `date`.
    private func parsed(_ title: String, on date: Date? = nil, hasTime: Bool = false)
        -> (String) -> CaptureParser.Result {
        { _ in CaptureParser.Result(title: title, date: date, hasTime: hasTime) }
    }

    /// A stand-in that finds no date: the words come back whole.
    private let noDate: (String) -> CaptureParser.Result = { CaptureParser.Result(title: $0, date: nil, hasTime: false) }

    private func read(_ raw: String, on page: DailyAdd.Page,
                      parse: (String) -> CaptureParser.Result) -> DailyAdd.Add? {
        DailyAdd.read(raw, on: page, today: today, weekStart: weekStart, parse: parse)
    }

    @Test func todayLandsOnTodayUnlessADayIsSaid() {
        #expect(read("buy milk", on: .today, parse: noDate)
                == .task(title: "Buy milk", day: today, at: nil, here: true))
        #expect(read("Buy milk tomorrow", on: .today, parse: parsed("Buy milk", on: day(2026, 11, 11, 12)))
                == .task(title: "Buy milk", day: day(2026, 11, 11), at: nil, here: false))
        // The parser sees the tidied words, and what it leaves is capitalised as the walk does.
        var seen: String?
        let add = read("um tomorrow call mom.", on: .today) { words in
            seen = words
            return CaptureParser.Result(title: "call mom", date: day(2026, 11, 11, 12), hasTime: false)
        }
        #expect(seen == "Tomorrow call mom")
        #expect(add == .task(title: "Call mom", day: day(2026, 11, 11), at: nil, here: false))
    }

    @Test func weekLandsOnTheWeekWithNoDay() {
        #expect(read("renew the passport", on: .week, parse: noDate)
                == .task(title: "Renew the passport", day: nil, at: nil, here: true))
        #expect(read("Bins Thursday", on: .week, parse: parsed("Bins", on: day(2026, 11, 12, 12)))
                == .task(title: "Bins", day: day(2026, 11, 12), at: nil, here: true))
    }

    @Test func aDaySaidOffThisPageSaysSo() {
        let friday = parsed("Dentist", on: day(2026, 11, 20, 12))
        #expect(read("Dentist next Friday", on: .today, parse: friday)
                == .task(title: "Dentist", day: day(2026, 11, 20), at: nil, here: false))
        #expect(read("Dentist next Friday", on: .week, parse: friday)
                == .task(title: "Dentist", day: day(2026, 11, 20), at: nil, here: false))
    }

    @Test func aDayAlreadyPastMeansNextWeeks() {
        #expect(read("Bins Monday", on: .today, parse: parsed("Bins", on: day(2026, 11, 9, 12)))
                == .task(title: "Bins", day: day(2026, 11, 16), at: nil, here: false))
        // A time said with it moves with the day.
        #expect(read("Bins Monday at 8am", on: .today, parse: parsed("Bins", on: day(2026, 11, 9, 8), hasTime: true))
                == .task(title: "Bins", day: day(2026, 11, 16), at: day(2026, 11, 16, 8), here: false))
        // Still past a week on: no day is pulled, and every word stays.
        let march = parsed("Taxes", on: day(2026, 3, 3, 12))
        #expect(read("Taxes March 3", on: .today, parse: march)
                == .task(title: "Taxes March 3", day: today, at: nil, here: true))
        #expect(read("Taxes March 3", on: .week, parse: march)
                == .task(title: "Taxes March 3", day: nil, at: nil, here: true))
    }

    @Test func aTimeIsKept() {
        #expect(read("Call the vet at 3pm", on: .today, parse: parsed("Call the vet", on: day(2026, 11, 10, 15), hasTime: true))
                == .task(title: "Call the vet", day: today, at: day(2026, 11, 10, 15), here: true))
    }

    /// Final review I3: the parser marks a time only by a colon, "am", "pm" or "o'clock"; a date it
    /// found with no time reads noon. Any other clock time was said, and is kept as a time.
    @Test func aTimeTheParserDidNotMarkIsStillKept() {
        #expect(read("dentist at 3 tomorrow", on: .today, parse: parsed("dentist", on: day(2026, 11, 11, 15)))
                == .task(title: "Dentist", day: day(2026, 11, 11), at: day(2026, 11, 11, 15), here: false))
        // A day alone (noon) is all day.
        #expect(read("call mum friday", on: .today, parse: parsed("call mum", on: day(2026, 11, 13, 12)))
                == .task(title: "Call mum", day: day(2026, 11, 13), at: nil, here: false))
    }

    /// Noon said ("at noon", "midday") is a time, kept as one, and its "at" goes with the phrase.
    @Test func noonSaidIsATime() {
        #expect(read("lunch at noon", on: .today, parse: parsed("lunch at", on: day(2026, 11, 10, 12)))
                == .task(title: "Lunch", day: today, at: day(2026, 11, 10, 12), here: true))
        #expect(read("call mum friday at midday", on: .week, parse: parsed("call mum", on: day(2026, 11, 13, 12)))
                == .task(title: "Call mum", day: day(2026, 11, 13), at: day(2026, 11, 13, 12), here: true))
        // "at 12" said is noon as a time, though the parser marks none; a date's "12" is not.
        #expect(read("lunch at 12 tomorrow", on: .today, parse: parsed("lunch at 12 tomorrow", on: day(2026, 11, 11, 12)))
                == .task(title: "Lunch at 12 tomorrow", day: day(2026, 11, 11), at: day(2026, 11, 11, 12), here: false))
        #expect(!DailyAdd.saidATime(CaptureParser.Result(title: "dentist on", date: day(2026, 12, 12, 12), hasTime: false),
                                    words: "dentist on December 12"))
        // "Noon" still in the title means the parser did not take it: no time.
        #expect(!DailyAdd.saidATime(CaptureParser.Result(title: "Noon run", date: day(2026, 11, 13, 12), hasTime: false),
                                    words: "Noon run friday"))
    }

    /// A time the parser marked leaves its "at" behind ("dentist at 3pm" reads "dentist at"): it goes.
    @Test func aTimesLeftoverAtGoes() {
        #expect(read("dentist at 3pm", on: .today, parse: parsed("dentist at", on: day(2026, 11, 10, 15), hasTime: true))
                == .task(title: "Dentist", day: today, at: day(2026, 11, 10, 15), here: true))
        // A day alone keeps every other word, "at" included.
        #expect(read("meet at the cafe friday", on: .week, parse: parsed("meet at the cafe", on: day(2026, 11, 13, 12)))
                == .task(title: "Meet at the cafe", day: day(2026, 11, 13), at: nil, here: true))
    }

    /// Final review C1: Week on another week files a task with no day into that week; a task with a
    /// day files by its day, a goal by its page, and the writer's own week needs nothing.
    @Test func aTaskWithNoDayOnAnotherWeekIsFiledThere() {
        let next = day(2026, 11, 15)
        let noDay = DailyAdd.Add.task(title: "Buy paint", day: nil, at: nil, here: true)
        #expect(DailyAdd.otherWeek(for: noDay, shownWeek: next, writersWeek: weekStart) == next)
        #expect(DailyAdd.otherWeek(for: noDay, shownWeek: weekStart, writersWeek: weekStart) == nil)
        #expect(DailyAdd.otherWeek(for: .task(title: "Bins", day: day(2026, 11, 17), at: nil, here: true),
                                   shownWeek: next, writersWeek: weekStart) == nil)
        #expect(DailyAdd.otherWeek(for: .goal(title: "Run", level: .month), shownWeek: next, writersWeek: weekStart) == nil)
        // Read against next week, a day inside it is on the page; today is not.
        let shown = DailyAdd.read("Bins Tuesday", on: .week, today: day(2026, 11, 14), weekStart: next,
                                  parse: parsed("Bins", on: day(2026, 11, 17, 12)))
        #expect(shown == .task(title: "Bins", day: day(2026, 11, 17), at: nil, here: true))
        let off = DailyAdd.read("Call mum today", on: .week, today: day(2026, 11, 14), weekStart: next,
                                parse: parsed("Call mum", on: day(2026, 11, 14, 12)))
        #expect(off == .task(title: "Call mum", day: day(2026, 11, 14), at: nil, here: false))
    }

    @Test func fillersAloneAddNothing() {
        var called = false
        let spy: (String) -> CaptureParser.Result = { called = true; return CaptureParser.Result(title: $0, date: nil, hasTime: false) }
        for raw in ["um", "   ", "okay", ""] {
            #expect(read(raw, on: .today, parse: spy) == nil)
            #expect(read(raw, on: .week, parse: spy) == nil)
            #expect(read(raw, on: .goal(.month), parse: spy) == nil)
        }
        #expect(!called)
    }

    @Test func aGoalKeepsEveryWord() {
        var called = false
        let spy: (String) -> CaptureParser.Result = { _ in
            called = true
            return CaptureParser.Result(title: "Run a 5K", date: day(2026, 11, 14), hasTime: false)
        }
        #expect(read("Run a 5K on Saturday", on: .goal(.year), parse: spy)
                == .goal(title: "Run a 5K on Saturday", level: .year))
        #expect(read("um, see the coast", on: .goal(.season), parse: spy)
                == .goal(title: "See the coast", level: .season))
        #expect(!called)
    }

    @Test func longWordsAreCutAtAWord() {
        let raw = String(repeating: "garden ", count: 58)   // 406 characters
        guard case .task(let title, _, _, _)? = read(raw, on: .today, parse: noDate) else {
            Issue.record("expected a task"); return
        }
        #expect(title.count <= WalkWords.maxTitle)
        #expect(title.hasSuffix("garden"))
        guard case .goal(let goal, _)? = read(raw, on: .goal(.month), parse: noDate) else {
            Issue.record("expected a goal"); return
        }
        #expect(goal.count <= WalkWords.maxTitle)
        #expect(goal.hasSuffix("garden"))
    }

    @Test func aDayAloneIsATitle() {
        // The parser hands the words back whole when the day was all there was.
        let add = read("tomorrow", on: .today, parse: parsed("Tomorrow", on: day(2026, 11, 11, 12)))
        #expect(add == .task(title: "Tomorrow", day: day(2026, 11, 11), at: nil, here: false))
        // And a parser that leaves nothing never leaves an empty title.
        let empty = read("tomorrow", on: .week, parse: parsed("  ", on: day(2026, 11, 11, 12)))
        #expect(empty == .task(title: "Tomorrow", day: day(2026, 11, 11), at: nil, here: true))
    }
}

/// Final review I3: the bar's words through the REAL parser (`CaptureParser.parse`, Apple's date
/// detector), not a stand-in. The detector reads the device's own clock, so each test is written for
/// any day it runs on. The rule they pin: no word is ever cut from a title without what it said
/// being kept (a day, and a time as a time); where nothing is kept, every word stays.
@MainActor
struct DailyAddRealParserTests {
    private var today: Date { PlanCalendar.day(Date()) }

    private func read(_ raw: String, on page: DailyAdd.Page = .today) -> (title: String, day: Date?, at: Date?)? {
        guard case .task(let title, let day, let at, _)? = DailyAdd.read(raw, on: page, today: today,
                                                                          weekStart: PlanCalendar.weekStart(today)) else {
            return nil
        }
        return (title, day, at)
    }

    private func weekday(_ d: Date?) -> Int? { d.map { PlanCalendar.calendar.component(.weekday, from: $0) } }
    private func hour(_ d: Date?) -> Int? { d.map { PlanCalendar.calendar.component(.hour, from: $0) } }

    /// "dentist at 3": the detector takes nothing (a bare number is no time to it), so every word stays.
    @Test func dentistAtThreeKeepsItsWords() throws {
        let add = try #require(read("dentist at 3"))
        #expect(add.title == "Dentist at 3")
        #expect(PlanCalendar.sameDay(add.day, today))
        #expect(add.at == nil)
    }

    /// "at 12 tomorrow": the detector reads noon and marks no time, but "at 12" was said: kept as noon.
    @Test func atTwelveTomorrowIsKeptAsNoon() throws {
        let add = try #require(read("lunch at 12 tomorrow"))
        #expect(PlanCalendar.sameDay(add.day, PlanCalendar.addDays(today, 1)))
        #expect(hour(add.at) == 12)
        #expect(add.title.hasPrefix("Lunch"))
    }

    /// "call mum friday": a Friday from today on, all day; "friday" leaves the title.
    @Test func aWeekdayIsTheComingOne() throws {
        let add = try #require(read("call mum friday"))
        #expect(add.title == "Call mum")
        #expect(weekday(add.day) == 6)
        let d = try #require(add.day)
        #expect(d >= today && d < PlanCalendar.addDays(today, 8))
        #expect(add.at == nil)
    }

    /// Today's own weekday name: today or a week on, never the past; all day.
    @Test func todaysWeekdayIsNeverPast() throws {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US")
        let name = f.weekdaySymbols[PlanCalendar.calendar.component(.weekday, from: today) - 1]
        let add = try #require(read("call mum \(name)"))
        #expect(add.title == "Call mum")
        let d = try #require(add.day)
        #expect(PlanCalendar.sameDay(d, today) || PlanCalendar.sameDay(d, PlanCalendar.addDays(today, 7)))
        #expect(add.at == nil)
    }

    /// "next Friday": a Friday ahead, all day; the phrase leaves the title.
    @Test func nextFridayIsAhead() throws {
        let add = try #require(read("pay rent next Friday"))
        #expect(add.title == "Pay rent")
        #expect(weekday(add.day) == 6)
        #expect(try #require(add.day) >= today)
        #expect(add.at == nil)
    }

    /// "at noon": the detector takes "noon" and leaves "at": kept as 12:00 today, titled "Lunch".
    @Test func atNoonIsKeptAsATime() throws {
        let add = try #require(read("lunch at noon"))
        #expect(add.title == "Lunch")
        #expect(hour(add.at) == 12)
        #expect(PlanCalendar.sameDay(add.day, today))
    }

    /// A time said with a day the detector does not mark ("at 3 tomorrow"): kept as 3 pm.
    @Test func aTimeWithADayIsKept() throws {
        let add = try #require(read("dentist at 3 tomorrow"))
        #expect(add.title == "Dentist")
        #expect(PlanCalendar.sameDay(add.day, PlanCalendar.addDays(today, 1)))
        #expect(hour(add.at) == 15)
    }

    /// A date long past: nothing of it is kept, so every word stays, on today.
    @Test func aPastDateKeepsEveryWord() throws {
        let add = try #require(read("pay the bill 3 March 2025"))
        #expect(add.title == "Pay the bill 3 March 2025")
        #expect(PlanCalendar.sameDay(add.day, today))
        #expect(add.at == nil)
    }

    /// "Send photos from Friday": the detector takes "from Friday" as the day. The day is kept (the bar
    /// says where it went, with Undo), so its words leave the title; recorded here as what happens.
    @Test func sendPhotosFromFridayIsReadAsADay() throws {
        let add = try #require(read("Send photos from Friday"))
        #expect(add.title == "Send photos")
        #expect(weekday(add.day) == 6)
        #expect(add.at == nil)
    }
}
