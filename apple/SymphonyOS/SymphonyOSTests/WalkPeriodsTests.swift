import Testing
import Foundation
@testable import Symphony

private func day(_ y: Int, _ m: Int, _ d: Int) -> Date {
    PlanCalendar.calendar.date(from: DateComponents(year: y, month: m, day: d))!
}

struct WalkPeriodsTests {
    @Test func midNovemberLooksToNextYearAndWinter() {
        let p = WalkPeriods.pick(now: day(2026, 11, 13), weekStartsOn: 0)
        #expect(p.year == 2027)
        #expect(p.season.name == "Winter")
        #expect(p.season.start == day(2026, 12, 1))
        #expect(p.season.lastDay == day(2027, 2, 28))
        #expect(!p.seasonIsCurrent)
        #expect(p.seasonWord == "winter")
        // Planning the coming winter, the month is winter's first: December, not November.
        #expect(p.monthName == "December")
        #expect(!p.monthIsCurrent)
        #expect(p.monthLastDay == 31)
        #expect(p.weekStart == day(2026, 11, 8))
        #expect(p.weekLastDay == day(2026, 11, 14))
    }

    @Test func exactlyThreeWeeksLeftStaysInTheSeason() {
        let a = WalkPeriods.pick(now: day(2026, 11, 10), weekStartsOn: 0)
        #expect(a.season.name == "Fall")
        #expect(a.seasonIsCurrent)
        let b = WalkPeriods.pick(now: day(2026, 11, 11), weekStartsOn: 0)
        #expect(b.season.name == "Winter")
        #expect(!b.seasonIsCurrent)
    }

    /// Inside a season that is still the current one: a week left keeps this month, less moves on.
    @Test func aWeekLeftStaysInTheMonth() {
        let a = WalkPeriods.pick(now: day(2026, 10, 25), weekStartsOn: 0)
        #expect(a.season.name == "Fall" && a.seasonIsCurrent)
        #expect(a.monthName == "October")
        #expect(a.monthIsCurrent)
        let b = WalkPeriods.pick(now: day(2026, 10, 26), weekStartsOn: 0)
        #expect(b.monthName == "November")
        #expect(!b.monthIsCurrent)
        #expect(b.monthLastDay == 30)
    }

    /// The month the walk plans always lies inside the season it plans: the coming season's first
    /// month when the season is the coming one; otherwise the month rule as before.
    @Test func theMonthLiesInsideTheSeason() {
        func check(_ y: Int, _ m: Int, _ d: Int, _ season: String, _ month: String) {
            let p = WalkPeriods.pick(now: day(y, m, d), weekStartsOn: 0)
            #expect(p.season.name == season && p.monthName == month, "\(y)-\(m)-\(d): \(p.season.name), \(p.monthName)")
            // Exactly: the coming season's first month, or (in the current season) a month inside it.
            if p.seasonIsCurrent {
                #expect(p.monthStart >= PlanCalendar.monthStart(p.season.start) && p.monthStart <= p.season.lastDay)
            } else {
                #expect(p.monthStart == PlanCalendar.monthStart(p.season.start))
            }
        }
        check(2026, 11, 10, "Fall", "November")          // three weeks of fall left: fall, this month
        check(2026, 11, 14, "Winter", "December")        // under three weeks: the coming winter, its first month
        check(2027, 2, 20, "Spring", "March")            // winter nearly over: spring, March
        check(2026, 12, 15, "Winter", "December")        // inside winter: this month
        // Inside winter with four days of December left: the month rule moves on to January
        // (fewer than seven days left), and January is inside winter.
        check(2026, 12, 28, "Winter", "January")
        // Custom seasons that start mid-month (the 15th). On 1 December fall has 14 days left, so the
        // walk plans the coming winter, which starts on 15 December; the month it plans is December,
        // the month holding winter's first day (month goals are filed by whole month), so the month
        // begins two weeks before the season and ends inside it.
        let mid = [SeasonBoundary(name: "Winter", month: 12, day: 15), SeasonBoundary(name: "Spring", month: 3, day: 15),
                   SeasonBoundary(name: "Summer", month: 6, day: 15), SeasonBoundary(name: "Fall", month: 9, day: 15)]
        let custom = WalkPeriods.pick(now: day(2026, 12, 1), seasons: mid, weekStartsOn: 0)
        #expect(custom.season.name == "Winter" && !custom.seasonIsCurrent)
        #expect(custom.season.start == day(2026, 12, 15))
        #expect(custom.monthName == "December" && custom.monthStart == day(2026, 12, 1))
        // Every day of two years: never a month outside the season.
        var date = day(2026, 1, 1)
        while date < day(2028, 1, 1) {
            let p = WalkPeriods.pick(now: date, weekStartsOn: 0)
            if p.seasonIsCurrent {
                #expect(p.monthStart >= PlanCalendar.monthStart(p.season.start) && p.monthStart <= p.season.lastDay, "\(date)")
            } else {
                #expect(p.monthStart == PlanCalendar.monthStart(p.season.start), "\(date)")
            }
            date = PlanCalendar.addDays(date, 1)
        }
    }

    @Test func octoberEndPlansNovemberButThisYear() {
        let p = WalkPeriods.pick(now: day(2026, 10, 31), weekStartsOn: 0)
        #expect(p.year == 2026)
        #expect(p.season.name == "Fall")
        #expect(p.seasonIsCurrent)
        #expect(p.monthName == "November")
    }

    @Test func yearEnd() {
        let p = WalkPeriods.pick(now: day(2026, 12, 28), weekStartsOn: 0)
        #expect(p.year == 2027)
        #expect(p.season.name == "Winter")
        #expect(p.seasonIsCurrent)
        #expect(p.monthName == "January")
    }

    @Test func midsummer() {
        let p = WalkPeriods.pick(now: day(2026, 6, 15), weekStartsOn: 0)
        #expect(p.year == 2026)
        #expect(p.season.name == "Summer")
        #expect(p.monthName == "June")
        #expect(p.seasonIsCurrent && p.monthIsCurrent)
    }

    @Test func householdSeasonsAndMondayWeeks() {
        let seasons = [
            SeasonBoundary(name: "Spring", month: 3, day: 20),
            SeasonBoundary(name: "Summer", month: 6, day: 21),
            SeasonBoundary(name: "Autumn", month: 9, day: 22),
            SeasonBoundary(name: "Winter", month: 12, day: 21),
        ]
        let a = WalkPeriods.pick(now: day(2026, 11, 13), seasons: seasons, weekStartsOn: 0)
        #expect(a.seasonWord == "autumn")
        #expect(a.seasonIsCurrent)
        let b = WalkPeriods.pick(now: day(2026, 12, 5), seasons: seasons, weekStartsOn: 0)
        #expect(b.seasonWord == "winter")
        #expect(b.season.start == day(2026, 12, 21))
        let m = WalkPeriods.pick(now: day(2026, 11, 13), weekStartsOn: 1)
        #expect(m.weekStart == day(2026, 11, 9))
        #expect(m.weekLastDay == day(2026, 11, 15))
    }

    @Test func ordinals() {
        let expected: [Int: String] = [
            1: "1st", 2: "2nd", 3: "3rd", 4: "4th", 11: "11th", 12: "12th", 13: "13th",
            21: "21st", 22: "22nd", 23: "23rd", 28: "28th", 30: "30th", 31: "31st",
        ]
        for (n, word) in expected { #expect(WalkPeriods.ordinal(n) == word) }
    }

    @Test func pagesOpenOnTheFiledPeriod() {
        let now = day(2026, 11, 13)
        let p = WalkPeriods.pick(now: now, weekStartsOn: 0)
        #expect(PlanCalendar.year(of: p.pageDate(for: .year)) == 2027)
        #expect(p.pageDate(for: .season) == day(2026, 12, 1))
        let m = p.pageDate(for: .month)
        #expect(PlanCalendar.year(of: m) == 2026)
        #expect(PlanCalendar.calendar.component(.month, from: m) == 12)    // winter's first month, as the walk files it
        #expect(p.pageDate(for: .week) == now)
        #expect(p.pageDate(for: .today) == now)
    }

    /// Where a Planner switcher row opens. Full: only Today moves the date, to now. Light:
    /// every row but the one on screen opens on the walk's period (Week and Today on today);
    /// the row on screen leaves the date where the steppers put it.
    @Test func switcherRowsOpenOnTheWalksPeriodsInLightOnly() {
        let now = PlanCalendar.calendar.date(bySettingHour: 15, minute: 0, second: 0, of: day(2026, 11, 13))!
        func opens(_ h: Horizon, viewing: Horizon, _ edition: Edition) -> Date? {
            WalkPeriods.switcherDate(for: h, viewing: viewing, edition: edition, now: now, seasons: nil)
        }
        #expect(opens(.today, viewing: .month, .full) == now)
        #expect(opens(.today, viewing: .today, .full) == now)
        for h in [Horizon.week, .month, .season, .year] {
            #expect(opens(h, viewing: .today, .full) == nil)
        }
        #expect(opens(.today, viewing: .year, .light) == day(2026, 11, 13))
        #expect(opens(.week, viewing: .year, .light) == day(2026, 11, 13))     // back on this week
        #expect(opens(.month, viewing: .today, .light) == day(2026, 12, 1))     // the month inside the coming winter
        #expect(opens(.season, viewing: .today, .light) == day(2026, 12, 1))
        #expect(opens(.year, viewing: .today, .light) == day(2027, 1, 1))
        // The page on screen stays put, except Today, which always comes back to today.
        #expect(opens(.today, viewing: .today, .light) == day(2026, 11, 13))
        for h in [Horizon.week, .month, .season, .year] {
            #expect(opens(h, viewing: h, .light) == nil)
        }
    }
}
