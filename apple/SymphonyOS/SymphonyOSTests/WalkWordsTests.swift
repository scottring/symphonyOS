import Testing
import Foundation
@testable import Symphony

struct WalkWordsTests {
    private let cal = PlanCalendar.calendar
    private func d(_ y: Int, _ m: Int, _ day: Int) -> Date {
        cal.date(from: DateComponents(year: y, month: m, day: day))!
    }
    private var today: Date { d(2026, 11, 13) }
    private func week(_ s: String, detect: @escaping (String) -> Date? = { _ in nil }) -> WalkWords.Said? {
        WalkWords.said(s, level: .week, today: today, detect: detect)
    }

    @Test func fillerGoes() {
        #expect(WalkWords.tidy("um finish the bathroom.") == "Finish the bathroom")
        #expect(WalkWords.tidy("So, um, feel strong again") == "Feel strong again")
        #expect(WalkWords.tidy("Okay, run a 5K.") == "Run a 5K")
        #expect(WalkWords.tidy("  read more  ") == "Read more")
    }

    @Test func realWordsStay() {
        #expect(WalkWords.tidy("like myself again") == "Like myself again")
        #expect(WalkWords.tidy("well water tested") == "Well water tested")
        #expect(WalkWords.tidy("so much more reading") == "So much more reading")
        #expect(WalkWords.tidy("What next?") == "What next?")
    }

    @Test func nothingToPlant() {
        for s in ["", "   ", "um", "uh, um.", "…", "okay", "so, um", "🙂", "🙂 🙂"] {
            #expect(WalkWords.tidy(s) == nil, "\(s)")
        }
        #expect(WalkWords.tidy("walk 🙂 more") == "Walk 🙂 more")
        #expect(WalkWords.tidy("Cuántos 3 días, señor!") == "Cuántos 3 días, señor!")
    }

    @Test func longSpeechIsCutAtAWord() {
        let long = WalkWords.tidy(String(repeating: "walk more ", count: 60))!
        #expect(long.count <= WalkWords.maxTitle)
        #expect(long.hasSuffix("more"))
        #expect(long.split(separator: " ").allSatisfy { $0 == "Walk" || $0 == "walk" || $0 == "more" })
        let one = WalkWords.tidy(String(repeating: "a", count: 260))!
        #expect(one.count == WalkWords.maxTitle)
    }

    @Test func theDepositToday() {
        #expect(week("the deposit, today") == WalkWords.Said(title: "The deposit", day: today))
    }

    @Test func trailingDays() {
        let cases: [(String, String, Date)] = [
            ("Gym on Tuesday", "Gym", d(2026, 11, 17)),
            ("call the tile shop tomorrow", "Call the tile shop", d(2026, 11, 14)),
            ("choose the tile, Saturday", "Choose the tile", d(2026, 11, 14)),
            ("breakfast out this weekend", "Breakfast out", d(2026, 11, 14)),
            ("measure the wall on Friday", "Measure the wall", d(2026, 11, 13)),
            ("ring mum, Monday", "Ring mum", d(2026, 11, 16)),
        ]
        for (said, title, day) in cases {
            #expect(week(said) == WalkWords.Said(title: title, day: day), "\(said)")
        }
    }

    /// "The weekend" is a day only when it clearly is one: after a comma, or as this /
    /// on the / at the / over the weekend. Otherwise the words stay whole, on the week.
    @Test func theWeekendIsADayOnlyWhenItClearlyIsOne() {
        let saturday = d(2026, 11, 14)
        let cases: [(String, String, Date?)] = [
            ("Plan the weekend", "Plan the weekend", nil),
            ("a quiet weekend", "A quiet weekend", nil),
            ("finish it by the weekend", "Finish it by the weekend", nil),
            ("Tidy the garage this weekend", "Tidy the garage", saturday),
            ("walk the dog on the weekend", "Walk the dog", saturday),
            ("see Gran at the weekend", "See Gran", saturday),
            ("paint the fence over the weekend", "Paint the fence", saturday),
            ("tidy the garage, weekend", "Tidy the garage", saturday),
            ("tidy the garage, the weekend", "Tidy the garage", saturday),
        ]
        for (said, title, day) in cases {
            #expect(week(said) == WalkWords.Said(title: title, day: day), "\(said)")
        }
    }

    @Test func aDayInTheMiddleStays() {
        #expect(week("Friday night dinner with Sam") == WalkWords.Said(title: "Friday night dinner with Sam", day: nil))
        #expect(week("plan Saturday breakfast out") == WalkWords.Said(title: "Plan Saturday breakfast out", day: nil))
    }

    @Test func aDayAloneIsATitle() {
        #expect(week("today") == WalkWords.Said(title: "Today", day: today))
    }

    @Test func upperLevelsKeepTheirWords() {
        #expect(WalkWords.said("ship the deck by Friday", level: .month, today: today)
            == WalkWords.Said(title: "Ship the deck by Friday", day: nil))
    }

    @Test func todayKeepsItsWords() {
        #expect(WalkWords.said("call mum tomorrow", level: .today, today: today)
            == WalkWords.Said(title: "Call mum tomorrow", day: nil))
    }

    @Test func aWrittenDateAfterAComma() {
        let nov20 = d(2026, 11, 20)
        let detect: (String) -> Date? = { $0 == "November 20" ? nov20 : nil }
        #expect(week("pay the deposit, November 20", detect: detect) == WalkWords.Said(title: "Pay the deposit", day: nov20))
        #expect(week("pay the deposit November 20", detect: detect) == WalkWords.Said(title: "Pay the deposit November 20", day: nil))
    }

    @Test func tags() {
        #expect(WalkWords.tag(for: today, today: today) == "TODAY")
        #expect(WalkWords.tag(for: d(2026, 11, 14), today: today) == "TOMORROW")
        #expect(WalkWords.tag(for: d(2026, 11, 17), today: today) == "TUESDAY")
        #expect(WalkWords.tag(for: d(2026, 11, 23), today: today) == "MON 23")
    }
}
