import Testing
import Foundation
@testable import Symphony

private func day(_ y: Int, _ m: Int, _ d: Int, _ h: Int = 0) -> Date {
    PlanCalendar.calendar.date(from: DateComponents(year: y, month: m, day: d, hour: h))!
}

/// Tuesday 10 November 2026: the walk files into Fall (21 days left), November and 2027.
private let periods = WalkPeriods.pick(now: day(2026, 11, 10), weekStartsOn: 0)

struct DailyCopyTests {
    @Test func everyFixedLineUsesCurlyApostrophes() {
        let lines = [
            DailyCopy.weekAndToday, DailyCopy.navLabel, DailyCopy.today, DailyCopy.showMyWeek, DailyCopy.next,
            DailyCopy.open, DailyCopy.walkWaiting, DailyCopy.walkWhenReady, DailyCopy.restOfWeek, DailyCopy.toDoToday,
            DailyCopy.moveTo, DailyCopy.anyDay, DailyCopy.firstToday, DailyCopy.notFirst, DailyCopy.details,
            DailyCopy.speakIt, DailyCopy.stopListening, DailyCopy.addWhatYouSaid, DailyCopy.typeIt, DailyCopy.inbox, DailyCopy.more, DailyCopy.handover,
            DailyCopy.walkItDown, DailyCopy.lookBackBeforeItTurns, DailyCopy.dayDone, DailyCopy.firstTodaySign,
            DailyCopy.todayOpen, DailyCopy.newWeek, DailyCopy.putSignAway,
        ]
        for line in lines {
            #expect(!line.isEmpty)
            #expect(!line.contains("'"), "\(line)")
        }
    }

    @Test func theTwoWalkLinesReadAsRuled() {
        #expect(DailyCopy.walkWaiting == "Your walk is waiting. Pick it back up.")
        #expect(DailyCopy.walkWhenReady == "Walk down from the year when you’re ready.")
    }

    @Test func theRowOfWords() {
        #expect(DailyCopy.nav(.year) == "Year"); #expect(DailyCopy.nav(.season) == "Season")
        #expect(DailyCopy.nav(.month) == "Month"); #expect(DailyCopy.nav(.week) == "Week")
        #expect(DailyCopy.nav(.today) == "Today")
    }

    @Test func weekRanges() {
        #expect(DailyCopy.weekRange(day(2026, 11, 8)) == "8–14 November")
        #expect(DailyCopy.weekRange(day(2026, 11, 29)) == "29 November – 5 December")
    }

    @Test func weekEyebrows() {
        let today = day(2026, 11, 10)
        #expect(DailyCopy.weekEyebrow(day(2026, 11, 8), today: today) == "This week")
        #expect(DailyCopy.weekEyebrow(day(2026, 11, 15), today: today) == "Next week")
        #expect(DailyCopy.weekEyebrow(day(2026, 11, 22), today: today) == "Week")
        #expect(DailyCopy.weekEyebrow(day(2026, 11, 1), today: today) == "Week")
    }

    @Test func pastDaysFold() {
        #expect(DailyCopy.pastDays([day(2026, 11, 8)]) == "Sunday")
        #expect(DailyCopy.pastDays([day(2026, 11, 8), day(2026, 11, 9)]) == "Sunday and Monday")
        #expect(DailyCopy.pastDays([day(2026, 11, 8), day(2026, 11, 9), day(2026, 11, 10)]) == "Sunday to Tuesday")
        #expect(DailyCopy.pastDays([]) == "Earlier")
    }

    @Test func periodEndsAndNoPiece() {
        #expect(DailyCopy.periodEnds("November", lastDay: day(2026, 11, 30)) == "November ends on Monday")
        #expect(DailyCopy.noPiece("winter") == "No piece this winter yet")
    }

    @Test func headings() {
        let today = day(2026, 11, 10)
        #expect(DailyCopy.heading(.month, periods: periods, today: today) == ("November", "to Monday the 30th"))
        #expect(DailyCopy.heading(.season, periods: periods, today: today) == ("Fall", "to Monday, 30 November"))
        #expect(DailyCopy.heading(.year, periods: periods, today: today) == ("2027", "The year ahead"))
        let march = WalkPeriods.pick(now: day(2026, 3, 10), weekStartsOn: 0)
        #expect(DailyCopy.heading(.year, periods: march, today: day(2026, 3, 10)) == ("2026", "This year"))
    }

    @Test func placeholders() {
        #expect(DailyCopy.placeholder(.today, periods: periods) == "Add to today")
        #expect(DailyCopy.placeholder(.week, periods: periods) == "Add to this week")
        #expect(DailyCopy.placeholder(.month, periods: periods) == "Add a goal for November")
        #expect(DailyCopy.placeholder(.season, periods: periods) == "Add a goal for fall")
        #expect(DailyCopy.placeholder(.year, periods: periods) == "Add a goal for 2027")
    }

    @Test func listeningAndHints() {
        #expect(DailyCopy.listening(.today) == "Listening. Say a day and it goes there.")
        #expect(DailyCopy.listening(.week) == "Listening. Say a day and it goes there.")
        #expect(DailyCopy.listening(.month) == "Listening.")
        #expect(DailyCopy.listening(.year) == "Listening.")
        #expect(DailyCopy.hint(.year) == "Tap a peak to look closer")
        #expect(DailyCopy.hint(.season) == "Tap a flag to move it or walk it down")
        #expect(DailyCopy.hint(.month) == "Tap a flag to move it or walk it down")
    }

    @Test func nothingUnderAFlag() {
        #expect(DailyCopy.nothingUnder(.year, periods: periods) == "Nothing under this one for fall yet.")
        #expect(DailyCopy.nothingUnder(.season, periods: periods) == "Nothing under this one for November yet.")
        #expect(DailyCopy.nothingUnder(.month, periods: periods) == "Nothing under this one this week yet.")
    }

    @Test func chips() {
        let today = day(2026, 11, 10)
        #expect(DailyCopy.chip(day(2026, 11, 10), today: today) == "Today")
        #expect(DailyCopy.chip(day(2026, 11, 11), today: today) == "Wed")
        #expect(DailyCopy.chip(nil, today: today) == "Any day")
    }

    @Test func datesAndTimes() {
        #expect(DailyCopy.clock(day(2026, 11, 10, 15)) == "3:00")
        #expect(DailyCopy.nextEvent("Bathroom design meeting", at: day(2026, 11, 10, 15))
                == "Next, 3:00, Bathroom design meeting")
        #expect(DailyCopy.date(day(2026, 11, 10)) == "Tuesday, 10 November")
        #expect(DailyCopy.dayLabel(day(2026, 11, 10)) == ("TUE", "10"))
        #expect(DailyCopy.itsOn(day(2026, 11, 20), today: day(2026, 11, 10)) == "It’s on Friday the 20th.")
        #expect(DailyCopy.done(3) == "3 done")
        #expect(DailyCopy.tomorrow("Choose the tile") == "Tomorrow: Choose the tile")
    }

    @Test func everySignSaysWhatATapDoes() {
        let kinds = ["dayDone", "firstToday", "todayOpen", "newWeek", "periodEnds", "noPiece"]
        for kind in kinds { #expect(!DailyCopy.signHint(kind).isEmpty, "\(kind)") }
        #expect(Set(kinds.map(DailyCopy.signHint)).count == kinds.count)
    }
}

struct DailyClockTests {
    @Test func aPinnedDayIsNoonThatDay() {
        #expect(DailyClock.pinned(in: ["app", "-SymphonyDailyNow", "2026-11-10"]) == day(2026, 11, 10, 12))
        #expect(DailyClock.pinned(in: ["app", "-SymphonyDemo"]) == nil)
        #expect(DailyClock.pinned(in: ["app", "-SymphonyDailyNow"]) == nil)
        #expect(DailyClock.pinned(in: ["app", "-SymphonyDailyNow", "10 November"]) == nil)
    }
}
