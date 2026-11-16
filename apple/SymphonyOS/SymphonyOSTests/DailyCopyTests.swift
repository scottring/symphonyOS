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
            DailyCopy.speakIt, DailyCopy.stopListening, DailyCopy.addWhatYouSaid, DailyCopy.typeIt, DailyCopy.listeningNow, DailyCopy.inbox, DailyCopy.more, DailyCopy.handover,
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

    @Test func periodEnds() {
        #expect(DailyCopy.periodEnds("November", lastDay: day(2026, 11, 30)) == "November ends on Monday")
    }

    /// F29 (S38): the sign names the year goal with nothing under it this season; "piece" goes.
    @Test func theSignSaysNoGoalUnderThisYet() {
        #expect(DailyCopy.noPiece("winter") == "No winter goal under this yet")
        #expect(DailyCopy.noPiece(periods.seasonWord) == "No fall goal under this yet")
        #expect(!DailyCopy.noPiece("winter").lowercased().contains("piece"))
    }

    @Test func headings() {
        let today = day(2026, 11, 10)
        #expect(DailyCopy.heading(.month, periods: periods, today: today) == ("November", "to Monday the 30th"))
        #expect(DailyCopy.heading(.season, periods: periods, today: today) == ("Fall", "to Monday, 30 November"))
        #expect(DailyCopy.heading(.year, periods: periods, today: today) == ("2027", "The year ahead"))
        let march = WalkPeriods.pick(now: day(2026, 3, 10), weekStartsOn: 0)
        #expect(DailyCopy.heading(.year, periods: march, today: day(2026, 3, 10)) == ("2026", "This year"))
    }

    /// Week's field says the week the page shows, where a task with no day goes (final review C1).
    @Test func weeksPlaceholderSaysWhichWeek() {
        let today = day(2026, 11, 14)
        #expect(DailyCopy.weekPlaceholder(day(2026, 11, 8), today: today) == "Add to this week")
        #expect(DailyCopy.weekPlaceholder(day(2026, 11, 15), today: today) == "Add to next week")
        #expect(DailyCopy.weekPlaceholder(day(2026, 11, 22), today: today) == "Add to the week")
        #expect(DailyCopy.weekPlaceholder(day(2026, 11, 1), today: today) == "Add to the week")
    }

    @Test func placeholders() {
        #expect(DailyCopy.placeholder(.today, periods: periods) == "Add to today")
        #expect(DailyCopy.placeholder(.week, periods: periods) == "Add to this week")
        #expect(DailyCopy.placeholder(.month, periods: periods) == "Add a goal for November")
        #expect(DailyCopy.placeholder(.season, periods: periods) == "Add a goal for this fall")
        #expect(DailyCopy.placeholder(.year, periods: periods) == "Add a goal for 2027")
    }

    /// S60: a goal page's shorter form still says where a goal goes ("Add for November"); only where
    /// even that does not fit does the field say "Add a goal". Today's and Week's are short already.
    @Test func theBarSaysWhereAGoalGoesInFewerWords() {
        #expect(DailyCopy.shortPlaceholder(.month, periods: periods) == "Add for November")
        #expect(DailyCopy.shortPlaceholder(.season, periods: periods) == "Add for this fall")
        #expect(DailyCopy.shortPlaceholder(.year, periods: periods) == "Add for 2027")
        #expect(DailyCopy.shortPlaceholder(.today, periods: periods) == DailyCopy.placeholder(.today, periods: periods))
        #expect(DailyCopy.shortPlaceholder(.week, periods: periods) == DailyCopy.placeholder(.week, periods: periods))
        #expect(DailyCopy.addAGoal == "Add a goal")
        // The three forms, longest first: each one shorter than the one before it.
        for h in [Horizon.month, .season, .year] {
            let forms = [DailyCopy.placeholder(h, periods: periods), DailyCopy.shortPlaceholder(h, periods: periods),
                         DailyCopy.addAGoal]
            #expect(zip(forms, forms.dropFirst()).allSatisfy { $0.count > $1.count }, "\(forms)")
        }
    }

    /// The bar's words are never cut short: the first form that fits the field's room, as the view
    /// measures it, else the last (the shortest). The widths here stand in for the view's measure.
    @Test func thePlaceholderThatFitsIsChosen() {
        let width: (String) -> CGFloat = { CGFloat($0.count) * 8 }    // 8 points a letter
        let month = DailyCopy.placeholder(.month, periods: periods)    // "Add a goal for November": 23 letters, 184
        let forms = [month, DailyCopy.shortPlaceholder(.month, periods: periods), DailyCopy.addAGoal]
        #expect(DailyCopy.fitting(forms, room: 184, width: width) == month)          // just fits
        #expect(DailyCopy.fitting(forms, room: 183.9, width: width) == "Add for November")   // 16 letters, 128
        #expect(DailyCopy.fitting(forms, room: 127.9, width: width) == "Add a goal")
        #expect(DailyCopy.fitting(forms, room: 10, width: width) == "Add a goal")    // nothing fits: the shortest
        #expect(DailyCopy.fitting(["Add to today"], room: 10, width: width) == "Add to today")
        #expect(DailyCopy.fitting([], room: 100, width: width) == "")
    }

    @Test func listening() {
        #expect(DailyCopy.listening(.today) == "Listening. Say a day and it goes there.")
        #expect(DailyCopy.listening(.week) == "Listening. Say a day and it goes there.")
        #expect(DailyCopy.listening(.month) == "Listening.")
        #expect(DailyCopy.listening(.year) == "Listening.")
    }

    /// The line over a mountain page's foot: with side posts it says they walk; else what a flag does,
    /// on every level (the zoom has gone, so nothing says "look closer").
    @Test func noHintNamesTheZoom() {
        for level in [WalkLevel.year, .season, .month] {
            #expect(DailyCopy.hint(level, sides: true, empty: false) == "Tap a post to walk to that area")
            #expect(DailyCopy.hint(level, sides: false, empty: false) == "Tap a flag to move it or walk it down")
            for sides in [true, false] {
                #expect(!DailyCopy.hint(level, sides: sides, empty: false).contains("peak"))
                #expect(!DailyCopy.hint(level, sides: sides, empty: false).contains("closer"))
            }
        }
    }

    /// S22: a page with no goal on its level says how to begin, whatever stands at the side.
    @Test func anEmptyPageSaysHowToBegin() {
        for level in [WalkLevel.year, .season, .month] {
            for sides in [true, false] {
                #expect(DailyCopy.hint(level, sides: sides, empty: true) == "Add your first goal with the bar below")
            }
        }
    }

    /// P48 and Task 10 (D3): on a Season or Month page the hint reads, first that applies: an empty page;
    /// a goal above with nothing under it, in the sign's own words for its season or month; while the goal
    /// above is one of several, that a tap switches; then the side posts; then the flags.
    @Test func aPageSaysWhatItsGoalAboveHolds() {
        let fall = WalkPeriods.pick(now: PlanCalendar.calendar.date(from: DateComponents(year: 2026, month: 11, day: 10))!)
        #expect(DailyCopy.emptyStop(.season, periods: fall) == "No fall goal under this yet")
        #expect(DailyCopy.emptyStop(.month, periods: fall) == "No November goal under this yet")
        #expect(DailyCopy.emptyStop(.year, periods: fall) == nil)
        #expect(DailyCopy.switchGoalAbove == "Tap the goal above to switch")
        let stop = DailyCopy.emptyStop(.month, periods: fall)
        #expect(DailyCopy.hint(.month, sides: true, empty: true, emptyStop: stop, switches: true) == DailyCopy.emptyMountain)
        #expect(DailyCopy.hint(.month, sides: true, empty: false, emptyStop: stop, switches: true) == stop)
        #expect(DailyCopy.hint(.month, sides: true, empty: false, switches: true) == DailyCopy.switchGoalAbove)
        // Task 10 (D4): on the stop for the goals under none, the walk's own words for it, from one source.
        #expect(DailyCopy.hint(.month, sides: true, empty: false, switches: true, looseStop: true) == DailyCopy.switchLooseStop)
        #expect(DailyCopy.hint(.season, sides: false, empty: false, switches: true, looseStop: true) == DailyCopy.switchLooseStop)
        #expect(DailyCopy.switchLooseStop == "Tap “Not under a goal yet” to switch")
        #expect(WalkCopy.focusAboveLoose == " " + DailyCopy.switchLooseStop + ".")
        #expect(DailyCopy.hint(.month, sides: true, empty: false, emptyStop: stop, switches: true, looseStop: true) == stop)
        #expect(DailyCopy.hint(.month, sides: true, empty: false) == "Tap a post to walk to that area")
        #expect(DailyCopy.hint(.month, sides: false, empty: false) == "Tap a flag to move it or walk it down")
    }

    /// The pages' paper: the strip's words, two lines tall and one line short, and the paper's heading.
    @Test func thePagesPaperSaysWhatItReads() {
        #expect(DailyCopy.readWhole(.year) == "Read the whole year")
        #expect(DailyCopy.readWhole(.season) == "Read the whole season")
        #expect(DailyCopy.readWhole(.month) == "Read the whole month")
        let count = WalkCopy.paperCount(17, level: .year)
        #expect(DailyCopy.paperSub(count) == "17 goals, as a plain list by area")
        #expect(DailyCopy.paperLine(.year, count: count) == "Read the whole year · 17 goals")
        #expect(DailyCopy.paperLine(.month, count: WalkCopy.paperCount(1, level: .month)) == "Read the whole month · 1 goal")
        #expect(DailyCopy.paperTitle(.year, periods: periods) == "2027")
        #expect(DailyCopy.paperTitle(.season, periods: periods) == "Fall")
        #expect(DailyCopy.paperTitle(.month, periods: periods) == "November")
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
        // Another month than today's is named (final review, minor).
        #expect(DailyCopy.itsOn(day(2027, 4, 15), today: day(2026, 11, 10)) == "It’s on Thursday the 15th of April.")
        #expect(DailyCopy.itsOn(day(2026, 12, 1), today: day(2026, 11, 30)) == "It’s on Tuesday the 1st of December.")
        #expect(DailyCopy.done(3) == "3 done")
        #expect(DailyCopy.tomorrow("Choose the tile") == "Tomorrow: Choose the tile")
    }

    /// VoiceOver reads a day in the week by its whole name, never "TUE, 10": today says so first,
    /// and the group with no day is Any day.
    @Test func aDayIsReadByItsWholeName() {
        let today = day(2026, 11, 10)
        #expect(DailyCopy.spokenDay(day(2026, 11, 11), today: today) == "Wednesday, 11 November")
        #expect(DailyCopy.spokenDay(today, today: today) == "Today, Tuesday, 10 November")
        #expect(DailyCopy.spokenDay(day(2026, 11, 10, 15), today: today) == "Today, Tuesday, 10 November")
        #expect(DailyCopy.spokenDay(nil, today: today) == DailyCopy.anyDay)
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

    /// The selected date (Week, the spread's left page) starts on the pinned day, not the real one: a
    /// launch pinned to Saturday 14 November reads that week even when the real date is two days on.
    @Test func theSelectedDateStartsOnThePinnedDay() {
        let real = day(2026, 11, 16, 10)
        let pinned = DailyClock.launchDay(arguments: ["app", "-SymphonyDailyNow", "2026-11-14"], real: real)
        #expect(pinned == day(2026, 11, 14, 12))
        #expect(DailyClock.launchDay(arguments: ["app", "-SymphonyDemo"], real: real) == real)
    }

    /// The half-open display's next line: "Next · 3:00", put in capitals by the view.
    @Test func theHalfOpenNextLine() {
        #expect(DailyCopy.nextAt(day(2026, 11, 10, 15)) == "Next · 3:00")
    }
}
