import Testing
import Foundation
@testable import Symphony

/// Mirrors the web's `src/lib/today/dayScale.test.ts`, so the phone and the
/// web lay a day out the same way.
struct DayScaleTests {
    func at(_ h: Int, _ m: Int = 0) -> Date {
        Calendar.current.date(from: DateComponents(year: 2026, month: 10, day: 6, hour: h, minute: m))!
    }
    func input(_ id: String, _ start: Date, _ end: Date? = nil) -> DayScale.Input { .init(id: id, start: start, end: end) }

    @Test func runsSevenToNineAtFortyEightPointsAnHourOnALightDay() {
        let s = DayScale.build([input("a", at(9), at(10))])
        #expect(s.startHour == 7 && s.endHour == 21)
        #expect(s.height == 14 * 48)
        #expect(s.blocks[0] == DayScale.Block(id: "a", top: 96, height: 48, lane: 0, lanes: 1, compact: false))
        #expect(s.ticks.map(\.label) == ["7a", "9a", "11a", "1p", "3p", "5p", "7p", "9p"])
    }

    @Test func stretchesToHoldAnEarlyStartAndTheNowLine() {
        let s = DayScale.build([input("late", at(21, 30), at(22, 30))], now: at(6, 10))
        #expect(s.startHour == 6 && s.endHour == 23)
        #expect(abs((s.now ?? 0) - (10.0 / 60) * 48) < 0.001)
    }

    @Test func putsTwoMeetingsThatOverlapSideBySide() {
        let s = DayScale.build([input("boxing", at(9), at(10, 15)), input("marta", at(9, 30), at(11, 30))])
        let by = Dictionary(uniqueKeysWithValues: s.blocks.map { ($0.id, $0) })
        #expect(by["boxing"]?.lane == 0 && by["boxing"]?.lanes == 2)
        #expect(by["marta"]?.lane == 1 && by["marta"]?.lanes == 2)
    }

    @Test func stacksTwoShortThingsThatStartCloseTogether() {
        let s = DayScale.build([input("pickup", at(16)), input("homework", at(16, 15))])
        let (a, b) = (s.blocks[0], s.blocks[1])
        #expect(a.compact && b.compact)
        #expect(b.lanes == 1)
        #expect(b.top >= a.top + a.height)
    }

    @Test func namesTheFreeStretchesAndCallsTheLastOneTheEvening() {
        let s = DayScale.build([input("marta", at(9, 30), at(11, 30)), input("pickup", at(16))])
        #expect(s.free.map(\.label) == ["2½ hours free", "4½ hours free", "Evening open"])
    }

    @Test func spendsThePartOfTodayBeforeNow() {
        let s = DayScale.build([input("pickup", at(16))], now: at(13, 30))
        #expect(s.free.map(\.label) == ["2½ hours free", "Evening open"])
        #expect(s.free[0].top > (13.5 - 7) * 48)
    }

    @Test func saysAnEmptyDayIsOpen() {
        #expect(DayScale.build([]).free.map(\.label) == ["Open all day"])
        #expect(DayScale.build([], now: at(10)).free.map(\.label) == ["The rest of the day is open"])
    }

    @Test func keepsAFreeStretchClearOfABlockDrawnTallerThanItsTime() {
        let s = DayScale.build([input("a", at(12)), input("b", at(12, 10)), input("c", at(14))])
        let stacked = s.blocks.first { $0.id == "b" }!
        let gap = s.free.first { $0.top > stacked.top }!
        #expect(gap.top >= stacked.top + stacked.height)
    }

    @Test func saysHoursTheWayAPersonDoes() {
        #expect(DayScale.freeHoursLabel(1) == "1 hour free")
        #expect(DayScale.freeHoursLabel(4.5) == "4½ hours free")
        #expect(DayScale.freeHoursLabel(1.25) == "1¼ hours free")
        #expect(DayScale.hourLabel(12) == "12p")
        #expect(DayScale.hourLabel(0) == "12a")
    }

    /// Two short things at 5:30 stack; the evening after them is still free.
    @Test func keepsTheEveningAfterTwoStackedChips() {
        let s = DayScale.build([input("a", at(17, 30)), input("b", at(17, 30))])
        #expect(s.free.last?.label == "Evening open")
        let lower = s.blocks.map { $0.top + $0.height }.max()!
        #expect(s.free.last!.top >= lower)
    }
}
