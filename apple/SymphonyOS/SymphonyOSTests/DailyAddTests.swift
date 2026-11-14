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
